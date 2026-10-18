const { pp } = require('../lib/paypal');
const { limited, send, body } = require('../lib/util');

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
const MARK = '[Dunly sandbox demo]';
const TERMS = { 0: 'DUE_ON_RECEIPT', 7: 'NET_10', 10: 'NET_10', 14: 'NET_15', 15: 'NET_15', 30: 'NET_30', 45: 'NET_45', 60: 'NET_60', 90: 'NET_90' };
const money = (c, v) => ({ currency_code: c, value: (Math.round(v * 100) / 100).toFixed(2) });

function shape(inv) {
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
    payer_view: 'https://www.sandbox.paypal.com/invoice/p/#' + inv.id
  };
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const j = await pp('GET', '/v2/invoicing/invoices?page=1&page_size=40&total_required=true');
      const items = (j.items || []).map(shape).filter(i => i.demo && i.status !== 'DRAFT')
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
    const days = b.payment_terms_days == null ? 30 : Number(b.payment_terms_days);
    const term = TERMS[days] || 'NET_30';
    const note = (String(b.note_to_client || '').trim().slice(0, 500) + '\n' + MARK + ' Sandbox invoice - no real money moves.').trim();
    const created = await pp('POST', '/v2/invoicing/invoices', {
      detail: { currency_code: cur, note, payment_term: { term_type: term }, reference: 'dunly-demo' },
      primary_recipients: [{ billing_info: { name: { given_name: given, surname: sur || undefined }, email_address: email } }],
      items: items.map(i => ({ name: String(i.name).slice(0, 200), description: String(i.description || '').slice(0, 1000) || undefined, quantity: String(Number(i.quantity)), unit_amount: money(cur, Number(i.unit_price)), unit_of_measure: 'QUANTITY' })),
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } }
    });
    const id = created.href ? created.href.split('/').pop() : created.id;
    const sent = b.send === false ? null : await pp('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false });
    const inv = await pp('GET', `/v2/invoicing/invoices/${id}`);
    send(res, 200, { invoice: shape(inv), payer_view: (sent && sent.href) || shape(inv).payer_view });
  } catch (e) { send(res, e.status === 422 ? 422 : 502, { error: e.message }); }
};
module.exports.shape = shape;
