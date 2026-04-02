import { readFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

export interface AppConfig {
  llm: {
    endpoint: string;
    model: string;
    api_key: string;
    context_window: number;
  };
  storage: {
    path: string;
    encryption: boolean;
  };
  canvas: {
    domain: string;
  };
  server: {
    port: number;
    host: string;
  };
  accessibility: {
    voice_input: boolean;
    voice_readback: boolean;
  };
  auth: {
    enabled: boolean;
    username: string;
    password: string;
  };
}

const defaults: AppConfig = {
  llm: { endpoint: 'http://localhost:11434/v1', model: 'llama3.2', api_key: '', context_window: 8192 },
  storage: { path: './data/vault', encryption: false },
  canvas: { domain: '' },
  server: { port: 3000, host: '0.0.0.0' },
  accessibility: { voice_input: true, voice_readback: false },
  auth: { enabled: false, username: '', password: '' },
};

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function loadConfig(): AppConfig {
  const configPath = process.env.CONFIG_PATH || '/app/config.yml';
  if (!existsSync(configPath)) {
    return defaults;
  }
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw) as Partial<AppConfig>;
  return {
    llm: { ...defaults.llm, ...parsed?.llm },
    storage: { ...defaults.storage, ...parsed?.storage },
    canvas: { ...defaults.canvas, ...parsed?.canvas },
    server: { ...defaults.server, ...parsed?.server },
    accessibility: { ...defaults.accessibility, ...parsed?.accessibility },
    auth: { ...defaults.auth, ...parsed?.auth },
  };
}
