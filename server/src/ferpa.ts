import { getDb } from './db/index.js';
import { getConfig } from './config.js';

// FERPA guardrail: student data (names, submissions, attendance photos) may
// only flow to an LLM endpoint the professor controls. "Local" here means
// loopback, RFC1918 private ranges, .local mDNS, or the Tailscale CGNAT
// range — i.e. the professor's own machine or private network. Anything else
// is treated as remote and blocked unless allow_remote_student_data is set.

export function isLocalEndpoint(endpoint: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.ts.net')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

export interface GuardResult {
  allowed: boolean;
  endpoint: string;
  reason?: string;
}

export function studentDataGuard(): GuardResult {
  const db = getDb();
  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };
  const endpoint = getVal('llm_endpoint') || getConfig().llm.endpoint;

  if (isLocalEndpoint(endpoint)) {
    return { allowed: true, endpoint };
  }
  if (getVal('allow_remote_student_data') === 'true') {
    return { allowed: true, endpoint };
  }
  return {
    allowed: false,
    endpoint,
    reason: `FERPA guardrail: the configured LLM endpoint (${endpoint}) is not on your local machine or private network, and this feature sends student data to it. Switch to a local model, or explicitly allow remote student data in Settings if you accept the responsibility.`,
  };
}
