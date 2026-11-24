import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { passwordRecord } from './worker.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const credentials = JSON.parse(Buffer.concat(chunks).toString('utf8'));
if (!Array.isArray(credentials) || credentials.length !== 2 || new Set(credentials.map(user => user.username)).size !== 2 ||
  credentials.some(user => !/^[a-z0-9_-]{1,32}$/.test(user.username) || typeof user.password !== 'string' ||
    user.password.length < 1 || user.password.length > 128)) {
  throw new Error('Expected exactly two distinct username/password pairs');
}
const rawKey = randomBytes(32);
const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const users = await Promise.all(credentials.map(({ username, password }) =>
  passwordRecord(username, password, randomBytes(16).toString('hex'), key)));
const folder = fileURLToPath(new URL('../.private/', import.meta.url));
await mkdir(folder, { recursive: true, mode: 0o700 });
await writeFile(new URL('../.private/users.json', import.meta.url), JSON.stringify(users, null, 2), { mode: 0o600, flag: 'wx' });
await writeFile(new URL('../.private/deploy-secrets.json', import.meta.url), JSON.stringify({
  AUTH_USERS: JSON.stringify(users), AUTH_KEY: rawKey.toString('hex')
}), { mode: 0o600, flag: 'wx' });
