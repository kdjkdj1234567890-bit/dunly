// Minimal PayPal REST client (sandbox). Zero dependencies: Node 18+ fetch.
const BASE = process.env.PAYPAL_BASE || 'https://api-m.sandbox.paypal.com';
let cache = { token: null, exp: 0 };

async function token() {
  if (cache.token && Date.now() < cache.exp - 60000) return cache.token;
  const id = process.env.PAYPAL_CLIENT_ID, secret = process.env.PAYPAL_SECRET;
  if (!id || !secret) throw new Error('PayPal sandbox credentials are not configured');
  const r = await fetch(BASE + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const j = await r.json();
  if (!r.ok) throw new Error('PayPal auth failed: ' + (j.error_description || r.status));
  cache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cache.token;
}

async function pp(method, path, body) {
  const t = await token();
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch (e) { j = { raw: text }; }
  if (!r.ok) {
    const msg = (j && (j.message || j.error_description)) || ('HTTP ' + r.status);
    const det = j && j.details ? ' - ' + j.details.map(d => (d.field ? d.field + ': ' : '') + (d.description || d.issue)).join('; ') : '';
    const err = new Error('PayPal: ' + msg + det);
    err.status = r.status; err.debug = j && j.debug_id;
    throw err;
  }
  return j;
}

module.exports = { pp };
