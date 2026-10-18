# Dunly

AI invoicing and gentle collections for freelancers, built on the PayPal Invoicing API (sandbox).

**The AI writes the words. PayPal holds the numbers.**

Built for the PayPal AI Hackathon. This is a sandbox demo: no real money moves and no real email is sent. All sample clients are fictional.

## What it does

1. **New invoice.** Paste a client email or your own work notes. Gemini 2.5 Flash drafts the invoice lines. A server-side check then looks for every price in your source text. A price the client never wrote is flagged, and sending stays locked until you confirm it. Missing details come back as questions instead of guesses. Instructions hidden in the pasted text are ignored. Approve, and the invoice is created and sent with the PayPal Invoicing API.
2. **Collections.** The list is read from PayPal. Pick an invoice, choose a tone (friendly, neutral, firm), and the AI writes a reminder using only facts read from PayPal at that moment. The server rejects any reminder that contains a money figure other than the amount due, a link, or a bracketed placeholder, then retries once and falls back to a plain template. You review the text and send it through PayPal's remind endpoint. You can also record a payment or cancel the invoice.

## PayPal APIs used

| Call | Why |
| --- | --- |
| `POST /v1/oauth2/token` | client credentials |
| `POST /v2/invoicing/invoices` | create the draft |
| `POST /v2/invoicing/invoices/{id}/send` | send to the client |
| `GET /v2/invoicing/invoices` and `/{id}` | list and re-read the source of truth |
| `POST /v2/invoicing/invoices/{id}/remind` | send the reminder |
| `POST /v2/invoicing/invoices/{id}/payments` | record a payment |
| `POST /v2/invoicing/invoices/{id}/cancel` | cancel an invoice |

## Run it yourself (about 3 minutes)

You need Node 18 or newer and two free accounts: a PayPal developer account and a Google AI Studio key.

1. Create a sandbox REST app at <https://developer.paypal.com/dashboard/applications/sandbox>. Copy the Client ID and Secret.
2. Create a free Gemini API key at <https://aistudio.google.com/apikey>.
3. Run:

```sh
export PAYPAL_CLIENT_ID=...
export PAYPAL_SECRET=...
export GEMINI_API_KEY=...
node tools/seed.js      # optional: three fictional overdue invoices for the Collections tab
node dev-server.js      # http://localhost:3000
```

There are no dependencies to install. The same files deploy as-is to Vercel (`api/` are serverless functions, `public/` is static). Set the three variables in the project settings.

## Layout

```
api/draft.js       message -> draft lines + source check
api/invoices.js    list from PayPal, create + send
api/collect.js     reminder draft, send, record payment, cancel
lib/paypal.js      small REST client
lib/gemini.js      structured-output call to Gemini
public/            single-page UI
tools/seed.js      fictional sandbox data
```

## Hackathon notes

This project was created during the hackathon submission period. Its AI part uses Gemini (Google AI Studio free tier). Limits of the demo: sandbox only, shared (sample invoices are read-only, and a visitor can only mark paid, cancel or send reminders on invoices they created, and samples can only get reminders). Ownership is a browser-session id for demo isolation, not real authentication; a production version would use real accounts, rate limited per server instance, one currency per invoice, no tax or discount lines yet.
