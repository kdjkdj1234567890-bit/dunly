# Dunly - Devpost submission text

**Tagline:** AI invoicing and gentle collections on PayPal. The AI writes the words. PayPal holds the numbers.

## Inspiration
Freelancers lose hours retyping client emails into invoices, and then lose more time (and nerve) chasing the ones that are late. AI could do both jobs, but nobody wants a model that can invent a price or a late fee. So we built the version where the model is never trusted with money.

## What it does
**New invoice.** Paste a client email or your own notes. Gemini drafts the invoice lines. Then the server looks for every price in your source text. A price the client never wrote is flagged, and sending stays locked until you confirm it. Missing details come back as questions, not guesses. Instructions hidden in the pasted text are ignored. You approve, and the invoice is created and sent with the PayPal Invoicing API.

**Collections.** The invoice list is read from PayPal, overdue first. Pick an invoice and a tone (friendly, neutral, firm). The AI writes a reminder from facts read from PayPal at that moment. The server rejects any reminder that contains a money figure other than the amount due, a link, or a placeholder, retries once, then falls back to a plain template. You review the text and send it through PayPal's remind endpoint. You can also record a payment or cancel the invoice.

## How we built it
- PayPal Invoicing API v2 (sandbox): OAuth, create, send, list, get, remind, record payment, cancel.
- Gemini 2.5 Flash with structured JSON output for drafting and tone.
- Zero-dependency Node serverless functions and a single static page, deployed on Vercel's free tier.
- Guardrails are deterministic code, not prompts: price-in-source check, amount-only reminder check, invoice re-read from PayPal before every action, input caps and rate limits.

## Challenges
Keeping the AI useful without letting it near the numbers. We moved every money decision out of the prompt and into checks the model cannot talk its way past. A rejected draft is visible to the user instead of silently retried.

## Accomplishments
A live sandbox flow end to end: message to invoice to reminder to payment record, with the model's drafts constrained by PayPal's own data.

## What we learned
PayPal's Invoicing API already has the full collections lifecycle. The missing piece was a careful language layer on top.

## What's next
Tax and discount lines, recurring invoices, PayPal webhooks to stop reminders the moment a payment lands, and a Live-mode switch with per-user PayPal login.

## Built with
PayPal Invoicing API (sandbox), Gemini 2.5 Flash (Google AI Studio), Node.js, Vercel, GitHub

## AI tools used and how
Gemini 2.5 Flash drafts invoice lines from pasted text and writes reminder notes. It never sets amounts the server has not verified. Code was written with AI assistance and reviewed by the entrant.

## Notes for judges
- Live demo: https://dunly-kdjkdj1234567890-bits-projects.vercel.app/ (no login). Try the three sample chips on the left.
- It is a sandbox: no real money moves and no real email is sent. Sample clients are fictional.
- Code: https://github.com/kdjkdj1234567890-bit/dunly (MIT). Run steps are in the README.
