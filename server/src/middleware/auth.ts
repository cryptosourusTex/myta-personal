import { createMiddleware } from 'hono/factory';
import { getConfig } from '../config.js';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export const basicAuth = createMiddleware(async (c, next) => {
  const config = getConfig();

  if (!config.auth.enabled) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    c.header('WWW-Authenticate', 'Basic realm="MyTA Personal"');
    return c.json({ error: 'Authentication required' }, 401);
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    c.header('WWW-Authenticate', 'Basic realm="MyTA Personal"');
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (safeCompare(username, config.auth.username) && safeCompare(password, config.auth.password)) {
    return next();
  }

  c.header('WWW-Authenticate', 'Basic realm="MyTA Personal"');
  return c.json({ error: 'Invalid credentials' }, 401);
});
