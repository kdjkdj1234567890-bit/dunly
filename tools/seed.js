// Seeds a few clearly-fake sandbox invoices with past due dates so the Collections tab has something to chase.
// Usage: PAYPAL_CLIENT_ID=... PAYPAL_SECRET=... node tools/seed.js
const { pp } = require('../lib/paypal');
const MARK = '[Dunly sandbox demo]';
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const SAMPLES = [
  { who: ['Priya', 'Nair (sample)'], email: 'priya.sample@example.com', inv: 40, due: 26, items: [['Brand guidelines PDF', 1, 900], ['Icon set (12 icons)', 12, 25]] },
  { who: ['Tom', 'Becker (sample)'], email: 'tom.sample@example.com', inv: 19, due: 5, items: [['Landing page build', 1, 1400]] },
  { who: ['Lumen Cafe (sample)', ''], email: 'hello.sample@example.com', inv: 6, due: -8, items: [['Menu redesign', 1, 380], ['Print-ready export', 1, 60]] }
];
(async () => {
  for (const s of SAMPLES) {
    const r = await pp('POST', '/v2/invoicing/invoices', {
      detail: { currency_code: 'USD', invoice_date: day(s.inv), note: 'Sample data. ' + MARK, reference: 'dunly-seed', payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: day(s.due) } },
      primary_recipients: [{ billing_info: { name: { given_name: s.who[0], surname: s.who[1] || undefined }, email_address: s.email } }],
      items: s.items.map(([name, q, p]) => ({ name, quantity: String(q), unit_amount: { currency_code: 'USD', value: p.toFixed(2) }, unit_of_measure: 'QUANTITY' })),
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } }
    });
    const id = r.id || r.href.split('/').pop();
    await pp('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false });
    console.log('seeded', id);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
