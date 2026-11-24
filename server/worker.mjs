const encoder = new TextEncoder();
const lifetime = 8 * 3600;
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function fromHex(value) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid authentication configuration');
  return Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function key(env) {
  return crypto.subtle.importKey('raw', fromHex(env.AUTH_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function passwordRecord(username, password, salt, secret) {
  const payload = encoder.encode(JSON.stringify(['password', username, salt, password]));
  return { username, salt, verifier: toHex(await crypto.subtle.sign('HMAC', secret, payload)) };
}

function accounts(env) {
  const users = JSON.parse(env.AUTH_USERS);
  if (!Array.isArray(users) || users.length !== 2 || new Set(users.map(user => user.username)).size !== 2 ||
    users.some(user => !/^[a-z0-9_-]{1,32}$/.test(user.username) || !/^[a-f0-9]{32}$/.test(user.salt) || !/^[a-f0-9]{64}$/.test(user.verifier))) {
    throw new Error('Invalid authentication configuration');
  }
  return users;
}

async function verifyPassword(users, username, password, secret) {
  const account = users.find(user => user.username === username);
  const reference = account ?? users[0];
  const payload = encoder.encode(JSON.stringify(['password', username, reference.salt, password]));
  const valid = await crypto.subtle.verify('HMAC', secret, fromHex(reference.verifier), payload);
  return valid && Boolean(account);
}

async function sessionCookie(username, secret) {
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${username}.${expires}.${nonce}`;
  const signature = toHex(await crypto.subtle.sign('HMAC', secret, encoder.encode('session:' + payload)));
  return cookie(payload + '.' + signature, lifetime);
}

function cookie(value, age) {
  return `__Host-orbita=${value}; Max-Age=${age}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

async function signedIn(request, users, secret) {
  const value = request.headers.get('Cookie')?.split(/;\s*/).find(part => part.startsWith('__Host-orbita='))?.slice(14);
  const match = /^([a-z0-9_-]{1,32})\.(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(value ?? '');
  if (!match) return false;
  const [, username, expires, nonce, signature] = match;
  if (Number(expires) <= Math.floor(Date.now() / 1000) || !users.some(user => user.username === username)) return false;
  return crypto.subtle.verify('HMAC', secret, fromHex(signature), encoder.encode(`session:${username}.${expires}.${nonce}`));
}

function redirect(location, session) {
  return new Response(null, {
    status: 303, headers: { ...headers, Location: location, ...(session ? { 'Set-Cookie': session } : {}) }
  });
}

function loginPage(status = 200, message = '') {
  const html = `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#101730">
<title>Entrar · Órbita</title>
<style>
:root{color-scheme:dark;font-family:system-ui;background:#0d1428;color:#f7f2eb}
*{box-sizing:border-box}
body{min-height:100dvh;margin:0;display:grid;place-items:center;padding:1rem;background:radial-gradient(ellipse at 63% 4%,#283862,transparent 75%)}
main{width:min(100%,26rem);background:#151f36;border:1px solid #445272;border-radius:1.15rem;padding:clamp(1.3rem,5vw,2rem)}
.brand{color:#f1d49e;letter-spacing:.19em;font-weight:700;margin:0}
h1{font:500 clamp(2rem,8vw,2.8rem)/1.1 Georgia,serif;margin:1rem 0 .55rem}
p{color:#c6cfe1;line-height:1.55}
form{display:grid;gap:1rem;margin-top:1.3rem}
label{display:grid;gap:.35rem;font-weight:600}
input,button{font:inherit;border-radius:.55rem;padding:.65rem .75rem;min-height:44px;width:100%}
input{background:#101728;border:1px solid #52617e;color:inherit}
button{background:#f1d49e;color:#182237;border:0;font-weight:700;cursor:pointer}
button:hover{background:#ffe7b8}
:focus-visible{outline:2px solid #f1d49e;outline-offset:3px}
.error{color:#ffbdba}
</style>
<main><p class="brand">✦ ÓRBITA</p><h1>Entrar no Órbita</h1><p>Acesse seu mapa natal e suas previsões.</p>
${message ? `<p role="alert" class="error">${message}</p>` : ''}
<form action="/login" method="post">
  <label>Usuário <input name="username" autocomplete="username" autocapitalize="none" maxlength="32" required></label>
  <label>Senha <input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
  <button>Entrar</button>
</form></main></html>`;
  return new Response(html, {
    status,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }
  });
}

async function loginFields(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded') || !request.body) return null;
  const reader = request.body.getReader();
  let size = 0;
  const decoder = new TextDecoder();
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return new URLSearchParams(body + decoder.decode());
    size += value.byteLength;
    if (size > 2048) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
}

export default {
  async fetch(request, env) {
    const { origin, pathname } = new URL(request.url);
    const { method } = request;
    if ((pathname === '/login' || pathname === '/logout') && method === 'POST' &&
      request.headers.get('Origin') !== origin) {
      return new Response('Origem inválida.', { status: 403, headers });
    }
    let users, secret;
    try {
      users = accounts(env);
      secret = await key(env);
    } catch {
      return loginPage(503, 'O acesso ainda está sendo configurado.');
    }
    if (pathname === '/login' && method === 'POST') {
      const client = request.headers.get('CF-Connecting-IP') ?? 'local';
      const { success } = await env.AUTH_LIMIT.limit({ key: client });
      if (!success) return loginPage(429, 'Muitas tentativas. Aguarde um minuto e tente novamente.');
      const fields = await loginFields(request);
      const username = fields?.get('username') ?? '';
      const password = fields?.get('password') ?? '';
      if (username.length <= 32 && password.length <= 128 && await verifyPassword(users, username, password, secret)) {
        return redirect('/', await sessionCookie(username, secret));
      }
      return loginPage(401, 'Usuário ou senha incorretos.');
    }
    if (pathname === '/logout' && method === 'POST') return redirect('/login', cookie('', 0));
    if (method !== 'GET' && method !== 'HEAD') return new Response(null, { status: 405, headers });
    const autenticado = await signedIn(request, users, secret);
    if (pathname === '/login') return autenticado ? redirect('/') : loginPage();
    if (!autenticado) {
      return request.headers.get('Accept')?.includes('text/html') || pathname === '/'
        ? redirect('/login') : new Response(null, { status: 401, headers });
    }
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  }
};
