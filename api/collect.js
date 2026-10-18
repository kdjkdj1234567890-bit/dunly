const { pp } = require('../lib/paypal');
const { gemini } = require('../lib/gemini');
const { limited, send, body, moneyLike } = require('../lib/util');
const { shape } = require('./invoices');

const TONES = {
  friendly: 'warm and relaxed, assumes it slipped their mind',
  neutral: 'polite and professional, clear about the date and amount',
  firm: 'direct and businesslike, states that payment is overdue and asks for a payment date, still courteous'
};
const SCHEMA = { type: 'OBJECT', properties: { subject: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['subject', 'note'] };

function check(text, subject, inv) {
  const problems = [];
  const allowed = [Number(inv.due_amount)];
  for (const n of moneyLike(text + ' ' + subject)) if (!allowed.some(a => Math.abs(a - n) < 0.005)) problems.push('mentions an amount (' + n + ') that is not the amount due');
  if (/https?:\/\//i.test(text + subject)) problems.push('contains a link');
  if (/\[[^\]]*\]/.test((text + ' ' + subject).replace('[Dunly sandbox demo]', ''))) problems.push('contains a bracketed placeholder');
  if (text.length > 900) problems.push('is too long');
  if (!text.trim() || !subject.trim()) problems.push('is empty');
  return problems;
}
function fallback(inv, tone) {
  const first = inv.client.split(' ')[0];
  const lead = inv.days_overdue && tone === 'firm' ? `Invoice ${inv.number} is now ${inv.days_overdue} day${inv.days_overdue === 1 ? '' : 's'} past due.` : inv.days_overdue ? `A quick reminder about invoice ${inv.number}.` : `A quick reminder that invoice ${inv.number} is coming up for payment.`;
  return { subject: `Invoice ${inv.number}: ${inv.days_overdue ? 'past due' : 'reminder'}`, note: `Hi ${first}, ${lead} The amount due is ${inv.due_amount} ${inv.currency}${inv.due_date ? ' (due ' + inv.due_date + ')' : ''}. You can pay from the invoice page. Thank you. [Dunly sandbox demo]` };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = await body(req);
    const id = String(b.id || '');
    if (!/^INV2-[A-Z0-9-]+$/.test(id)) return send(res, 400, { error: 'Bad invoice id.' });
    // The invoice is always re-read from PayPal. Amounts never come from the browser or the model.
    const sid = String(b.sid || '').replace(/[^a-z0-9]/g, '').slice(0, 24);
    const inv = shape(await pp('GET', `/v2/invoicing/invoices/${id}`), sid);
    if (!inv.demo) return send(res, 403, { error: 'Only invoices created by this demo can be managed here.' });
    const act = b.action;
    if (act === 'draft') {
      if (limited(req, 'ai', 25, 3600e3)) return send(res, 429, { error: 'Demo rate limit reached. Try again in a while.' });
      if (!inv.open) return send(res, 409, { error: 'This invoice is ' + inv.status.toLowerCase() + ', nothing to chase.' });
      const tone = TONES[b.tone] ? b.tone : 'neutral';
      const facts = { client_first_name: inv.client.split(' ')[0], invoice_number: inv.number, amount_due: inv.due_amount, currency: inv.currency, due_date: inv.due_date, days_overdue: inv.days_overdue, items: inv.items };
      const system = `You write short payment reminder emails for a freelancer. Tone: ${TONES[tone]}.
Use ONLY the facts provided. The only money amount you may write is amount_due with its currency. Never invent late fees, interest, deadlines, legal threats or other amounts. Do not include links or bracketed placeholders like [Your Name]; write the subject and body fully. If days_overdue is 0 the invoice is NOT late yet: use "due on" wording and never say overdue, late or "was due". Max 90 words. Sign off without a name. The "note" is the email body. The "subject" is under 70 characters.`;
      let out, problems = [];
      for (let k = 0; k < 2; k++) {
        out = await gemini({ system, prompt: 'FACTS (JSON):\n' + JSON.stringify(facts) + (problems.length ? '\nYour previous draft was rejected because it ' + problems.join('; ') + '. Fix that.' : ''), schema: SCHEMA, temperature: 0.5 });
        problems = check(out.note, out.subject, inv);
        if (!problems.length) break;
      }
      let used = 'ai';
      if (problems.length) { console.log('draft rejected:', problems.join('; ')); out = fallback(inv, tone); used = 'template'; }
      out.note = out.note.replace(/\s*\[Dunly sandbox demo\]\s*$/, '') + ' [Dunly sandbox demo]';
      return send(res, 200, { ...out, tone, source: used, checked: { only_amount_due: true, amount_due: inv.due_amount, currency: inv.currency } });
    }
    if (limited(req, 'act', 40, 3600e3)) return send(res, 429, { error: 'Demo rate limit reached. Try again in a while.' });
    if (act === 'send') {
      if (!inv.mine && !inv.sample) return send(res, 403, { error: 'You can only send reminders for your own invoices or the sample ones.' });
      if (!inv.open) return send(res, 409, { error: 'This invoice is ' + inv.status.toLowerCase() + '.' });
      const subject = String(b.subject || '').slice(0, 100), note = String(b.note || '').slice(0, 900);
      const probs = check(note, subject, inv);
      if (probs.length) return send(res, 422, { error: 'Reminder blocked: it ' + probs.join('; ') + '.' });
      await pp('POST', `/v2/invoicing/invoices/${id}/remind`, { subject, note, send_to_invoicer: false });
      return send(res, 200, { ok: true });
    }
    if ((act === 'paid' || act === 'cancel') && !inv.mine) return send(res, 403, { error: 'Sample and other visitors\' invoices are read-only. Create your own invoice to try this.' });
    if (act === 'paid') {
      if (!inv.open) return send(res, 409, { error: 'This invoice is ' + inv.status.toLowerCase() + '.' });
      await pp('POST', `/v2/invoicing/invoices/${id}/payments`, { method: 'BANK_TRANSFER', payment_date: new Date().toISOString().slice(0, 10), amount: { currency_code: inv.currency, value: inv.due_amount }, note: 'Recorded in Dunly demo' });
      return send(res, 200, { ok: true });
    }
    if (act === 'cancel') {
      if (!inv.open) return send(res, 409, { error: 'This invoice is ' + inv.status.toLowerCase() + '.' });
      await pp('POST', `/v2/invoicing/invoices/${id}/cancel`, { send_to_invoicer: false, send_to_recipient: false });
      return send(res, 200, { ok: true });
    }
    send(res, 400, { error: 'Unknown action.' });
  } catch (e) { send(res, e.status === 422 ? 422 : 502, { error: e.message }); }
};
