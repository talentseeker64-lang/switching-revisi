import { randomBytes } from 'node:crypto';

const KEY_PREFIX = 'dsk';

export function generateApiKey(): { apiKey: string; apiKeyPrefix: string } {
  const apiKey = `${KEY_PREFIX}_${randomBytes(16).toString('hex')}`;
  return { apiKey, apiKeyPrefix: apiKey.slice(0, 11) };
}

export function generateApiSecret(): string {
  return randomBytes(32).toString('hex');
}
