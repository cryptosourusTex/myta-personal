const KEY_STORAGE = 'myta_vault_key';

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importKey(base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export function hasStoredKey(): boolean {
  return !!localStorage.getItem(KEY_STORAGE);
}

export async function getStoredKey(): Promise<CryptoKey | null> {
  const b64 = localStorage.getItem(KEY_STORAGE);
  if (!b64) return null;
  return importKey(b64);
}

export async function storeKey(key: CryptoKey): Promise<void> {
  const b64 = await exportKey(key);
  localStorage.setItem(KEY_STORAGE, b64);
}

export function clearStoredKey(): void {
  localStorage.removeItem(KEY_STORAGE);
}

export async function encryptFile(data: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result.buffer;
}

export async function decryptFile(encrypted: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = new Uint8Array(encrypted.slice(0, 12));
  const ciphertext = encrypted.slice(12);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

export function downloadKeyBackup(base64Key: string): void {
  const blob = new Blob([base64Key], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'myta-key-backup.key';
  a.click();
  URL.revokeObjectURL(url);
}

export async function readKeyFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).trim());
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
