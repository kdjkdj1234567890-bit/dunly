const { pp } = require('../lib/paypal');
const { limited, send, body, moneyNumbers } = require('../lib/util');

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
const MARK = '[Dunly sandbox demo]';
const money = (c, v) => ({ currency_code: c, value: (Math.round(v * 100) / 100).toFixed(2) });

function shape(inv, sid) {
  const d = inv.detail || {}, a = inv.amount || {};
  const rec = ((inv.primary_recipients || [])[0] || {}).billing_info || {};
  const n = rec.name || {};
  const due = (d.payment_term || {}).due_date || null;
  const status = inv.status;
  const open = ['SENT', 'UNPAID', 'PARTIALLY_PAID', 'PAYMENT_PENDING'].includes(status);
  const today = new Date().toISOString().slice(0, 10);
  const daysOverdue = open && due && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 864e5) : 0;
  return {
    id: inv.id, number: d.invoice_number, status, currency: a.currency_code, total: a.value,
    due_amount: (inv.due_amount || a.due_amount || a).value || a.value,
    client: [n.given_name, n.surname].filter(Boolean).join(' ') || '(no name)', email: rec.email_address || '',
    invoice_date: d.invoice_date, due_date: due, days_overdue: daysOverdue, open,
    items: (inv.items || []).map(i => i.name), demo: (d.note || '').includes(MARK) || (d.memo || '').includes(MARK),
    mine: !!sid && d.reference === 'dunly-' + sid, sample: d.reference === 'dunly-seed',
    payer_view: 'https://www.sandbox.paypal.com/invoice/p/#' + inv.id
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const sidQ = String(new URL(req.url, 'http://x').searchParams.get('sid') || '').replace(/[^a-z0-9]/g, '').slice(0, 24);
      const j = await pp('GET', '/v2/invoicing/invoices?page=1&page_size=100&total_required=true');
      const items = (j.items || []).map(i => shape(i, sidQ)).filter(i => i.demo && i.status !== 'DRAFT')
        .sort((a, b) => (b.days_overdue > 0) - (a.days_overdue > 0) || b.days_overdue - a.days_overdue || (b.invoice_date || '').localeCompare(a.invoice_date || '') || b.number.localeCompare(a.number));
      return send(res, 200, { invoices: items, total: j.total_items || 0 });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
    if (limited(req, 'create', 15, 3600e3)) return send(res, 429, { error: 'Demo rate limit reached. Try again in a while.' });
    const b = await body(req);
    const cur = CURRENCIES.includes(b.currency) ? b.currency : 'USD';
    const name = String(b.client_name || '').trim().slice(0, 100);
    const email = String(b.client_email || '').trim().slice(0, 120);
    if (!name) return send(res, 400, { error: 'Client name is required.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'A valid client email is required.' });
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20);
    if (!items.length) return send(res, 400, { error: 'Add at least one line item.' });
    let total = 0;
    for (const i of items) {
      if (!String(i.name || '').trim()) return send(res, 400, { error: 'Every line needs a name.' });
      const q = Number(i.quantity), p = Number(i.unit_price);
      if (!(q > 0 && q <= 1000) || !(p > 0 && p <= 100000)) return send(res, 400, { error: 'Quantity and price must be positive numbers (price up to 100,000).' });
      total += q * p;
    }
    if (total > 250000) return send(res, 400, { error: 'Invoice total is capped at 250,000 in this demo.' });
    const parts = name.split(/\s+/); const given = parts.shift(); const sur = parts.join(' ');
    // Re-check every price against the source on the server. The browser flag is not trusted.
    const src = typeof b.source === 'string' ? b.source : '';
    const nums = moneyNumbers(src);
    const has = v => nums.some(n => Math.abs(n - v) < 0.005);
    const unverified = items.filter(i => !(has(Number(i.unit_price)) || has(Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100)));
    if (unverified.length && b.confirm_unverified !== true) return send(res, 422, { error: 'Price not found in the source text for: ' + unverified.map(i => i.name).join(', ') + '. Confirm those lines to continue.' });
    const sid = String(b.sid || '').replace(/[^a-z0-9]/g, '').slice(0, 24);
    if (!sid) return send(res, 400, { error: 'Missing session id.' });
    const days = Math.max(0, Math.min(120, Math.round(b.payment_terms_days == null ? 30 : Number(b.payment_terms_days)) || 0));
    const now = new Date(), invoiceDate = now.toISOString().slice(0, 10);
    const due = new Date(now.getTime() + days * 864e5).toISOString().slice(0, 10);
    const term = days === 0 ? { term_type: 'DUE_ON_RECEIPT' } : { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: due };
    const note = (String(b.note_to_client || '').trim().slice(0, 500) + '\n' + MARK + ' Sandbox invoice - no real money moves.').trim();
    const created = await pp('POST', '/v2/invoicing/invoices', {
      detail: { currency_code: cur, note, invoice_date: invoiceDate, payment_term: term, reference: 'dunly-' + sid },
      primary_recipients: [{ billing_info: { name: { given_name: given, surname: sur || undefined }, email_address: email } }],
      items: items.map(i => ({ name: String(i.name).slice(0, 200), description: String(i.description || '').slice(0, 1000) || undefined, quantity: String(Number(i.quantity)), unit_amount: money(cur, Number(i.unit_price)), unit_of_measure: 'QUANTITY' })),
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } }
    });
    const id = created.href ? created.href.split('/').pop() : created.id;
    const sent = b.send === false ? null : await pp('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false });
    const inv = await pp('GET', `/v2/invoicing/invoices/${id}`);
    send(res, 200, { invoice: shape(inv, sid), payer_view: (sent && sent.href) || shape(inv, sid).payer_view });
  } catch (e) { send(res, e.status === 422 ? 422 : 502, { error: e.message }); }
};
module.exports.shape = shape;
