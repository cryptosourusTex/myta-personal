/**
 * Vault encryption — AES-GCM 256-bit, keys never leave the browser.
 * R2 stores only ciphertext. If you clear localStorage without
 * exporting your key, vault files are permanently unreadable.
 */

const VAULT_KEY_STORAGE = 'myta_vault_key';
const VAULT_INITIALIZED = 'myta_vault_initialized';

export async function generateVaultKey(): Promise<CryptoKey> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for backup export
    ['encrypt', 'decrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(
    VAULT_KEY_STORAGE,
    btoa(String.fromCharCode(...new Uint8Array(raw))),
  );
  localStorage.setItem(VAULT_INITIALIZED, 'true');
  return key;
}

export async function getVaultKey(): Promise<CryptoKey | null> {
  const stored = localStorage.getItem(VAULT_KEY_STORAGE);
  if (!stored) return null;
  const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ]);
}

export function isVaultInitialized(): boolean {
  return localStorage.getItem(VAULT_INITIALIZED) === 'true';
}

export async function encryptData(
  data: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  return result.buffer;
}

export async function decryptData(
  encrypted: ArrayBuffer,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = encrypted.slice(0, 12);
  const ciphertext = encrypted.slice(12);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    ciphertext,
  );
}

export async function encryptText(
  text: string,
  key: CryptoKey,
): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const encrypted = await encryptData(encoded.buffer, key);
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export async function decryptText(
  base64: string,
  key: CryptoKey,
): Promise<string> {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const decrypted = await decryptData(raw.buffer, key);
  return new TextDecoder().decode(decrypted);
}

/** Export vault key as a password-protected backup (JSON file download). */
export async function exportKeyBackup(password: string): Promise<string> {
  const key = await getVaultKey();
  if (!key) throw new Error('No vault key to export');

  const rawKey = await crypto.subtle.exportKey('raw', key);

  // Derive a wrapping key from the password
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const wrapKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapKey,
    rawKey,
  );

  return JSON.stringify({
    version: 1,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    key: btoa(String.fromCharCode(...new Uint8Array(wrapped))),
  });
}

/** Import vault key from a password-protected backup. */
export async function importKeyBackup(
  backup: string,
  password: string,
): Promise<CryptoKey> {
  const { version, salt, iv, key: wrappedB64 } = JSON.parse(backup);
  if (version !== 1) throw new Error('Unsupported backup version');

  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const wrapped = Uint8Array.from(atob(wrappedB64), (c) => c.charCodeAt(0));

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const unwrapKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 600000, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    unwrapKey,
    wrapped,
  );

  const vaultKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt'],
  );

  // Store in localStorage
  const exported = await crypto.subtle.exportKey('raw', vaultKey);
  localStorage.setItem(
    VAULT_KEY_STORAGE,
    btoa(String.fromCharCode(...new Uint8Array(exported))),
  );
  localStorage.setItem(VAULT_INITIALIZED, 'true');

  return vaultKey;
}
