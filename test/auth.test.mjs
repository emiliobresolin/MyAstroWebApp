import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import worker, { passwordRecord } from '../server/worker.mjs';

const AUTH_KEY = randomBytes(32).toString('hex');
const secret = await crypto.subtle.importKey('raw', Buffer.from(AUTH_KEY, 'hex'),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const samples = [['tester_a', 'test-password-one'], ['tester_b', 'test-password-two']];
const AUTH_USERS = JSON.stringify(await Promise.all(samples.map(([name, password]) =>
  passwordRecord(name, password, randomBytes(16).toString('hex'), secret))));
const env = {
  AUTH_KEY, AUTH_USERS,
  AUTH_LIMIT: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) }
};
const origin = 'https://orbita.example';
const request = (path, options) => new Request(origin + path, options);
const post = (path, data, from = origin) =>
  request(path, { method: 'POST', headers: { Origin: from }, body: new URLSearchParams(data) });

test('login is public and application assets require a session', async () => {
  const login = await worker.fetch(request('/login'), env);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /autocomplete="current-password"/);
  assert.equal((await worker.fetch(request('/'), env)).headers.get('Location'), '/login');
  for (const route of ['/index.html', '/app.js', '/vendor/world-countries.js', '/.private/users.json']) {
    assert.equal((await worker.fetch(request(route), env)).status, 401);
  }
  assert.equal((await worker.fetch(request('/login'), { ...env, AUTH_KEY: undefined })).status, 503);
});

test('both accounts can enter and logout clears the browser session', async () => {
  for (const [username, password] of samples) {
    const response = await worker.fetch(post('/login', { username, password }), env);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('Location'), '/');
    const cookie = response.headers.get('Set-Cookie');
    assert.match(cookie, /^__Host-orbita=/);
    assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
    const headers = { Cookie: cookie.split(';')[0] };
    const protectedPage = await worker.fetch(request('/index.html', { headers }), env);
    assert.equal(protectedPage.status, 200);
    assert.equal(protectedPage.headers.get('Cache-Control'), 'no-store');
    const last = headers.Cookie.at(-1);
    headers.Cookie = headers.Cookie.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    assert.equal((await worker.fetch(request('/app.js', { headers }), env)).status, 401);
    const logout = await worker.fetch(post('/logout', {}), env);
    assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  }
});

test('bad credentials, cross-origin form posts and excess attempts are rejected', async () => {
  const guessed = { username: samples[0][0], password: 'wrong' };
  assert.equal((await worker.fetch(post('/login', guessed), env)).status, 401);
  assert.equal((await worker.fetch(post('/login', guessed, 'https://other.example'), env)).status, 403);
  assert.equal((await worker.fetch(post('/logout', {}, 'https://other.example'), env)).status, 403);
  assert.equal((await worker.fetch(post('/login', guessed), {
    ...env, AUTH_LIMIT: { limit: async () => ({ success: false }) }
  })).status, 429);
});
