const hits = new Map();
// Tiny in-memory limiter so a public demo cannot burn the free AI quota.
function limited(req, bucket, max, windowMs) {
  const ip = ((req.headers['x-forwarded-for'] || '') + '').split(',')[0].trim() || 'x';
  const k = bucket + ':' + ip, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { hits.set(k, arr); return true; }
  arr.push(now); hits.set(k, arr); return false;
}
function send(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) s += c;
  try { return s ? JSON.parse(s) : {}; } catch (e) { return {}; }
}
// Every number that looks like money in a piece of text, as plain numbers.
function moneyNumbers(text) {
  const out = [];
  const re = /(?:[$€£₩]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(?:usd|dollars?|eur|gbp))?/gi;
  let m; while ((m = re.exec(text))) out.push(parseFloat(m[1].replace(/,/g, '')));
  return out;
}
module.exports = { limited, send, body, moneyNumbers };
// Money-like figures only: has a currency symbol/word next to it, or a decimal/thousands separator.
function moneyLike(text) {
  const out = [];
  const re = /([$€£₩]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d+)(\s*(?:usd|dollars?|eur|euros?|gbp|pounds?))?/gi;
  let m; while ((m = re.exec(text))) {
    const hasCur = !!(m[1] || m[3]); const fmt = /[.,]/.test(m[2]);
    if (hasCur || fmt) out.push(parseFloat(m[2].replace(/,/g, '')));
  }
  return out;
}
module.exports.moneyLike = moneyLike;
