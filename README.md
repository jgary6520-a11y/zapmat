# Safe Telegram Admin Webhook (Vercel)

This is a clean administrative-notification replacement. It supports four inline buttons: Show Status, Mark Reviewed, Approve, and Close Session. It does not collect, transmit, or store passwords, one-time codes, recovery codes, or other login credentials.

## Files

Copy these files into your Vercel project under `api/`:

- `_store.js`
- `webhook.js`
- `setup-webhook.js`
- `send-admin-notification.js`

Do not copy old credential collection pages or handlers into this replacement. Keep the new admin endpoints separate from any login or authentication form.

## Vercel environment variables

Set these in Project Settings → Environment Variables:

- `TELEGRAM_BOT_TOKEN` — bot token from BotFather (keep private).
- `TELEGRAM_ADMIN_CHAT_ID` — Telegram chat ID that receives administrative notifications.
- `TELEGRAM_WEBHOOK_SECRET` — optional secret token, 1–256 characters, using Telegram's allowed characters: A-Z, a-z, 0-9, underscore, hyphen.
- `ADMIN_API_SECRET` — long random secret used to authorize calls to `send-admin-notification`.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` — optional Upstash Redis REST credentials for persistent administrative state. The compatible aliases `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are also accepted.

Without KV credentials, button callbacks still work, but state is not guaranteed to persist across serverless invocations. Configure KV for durable status.

## Register the webhook

After deploying, open once:

`https://YOUR-DOMAIN/api/setup-webhook?action=set`

Check it with:

`https://YOUR-DOMAIN/api/setup-webhook?action=status`

The webhook stays registered with Telegram; do not refresh `action=set` continuously. Telegram calls `/api/webhook` when an inline button is clicked.

## Send an administrative notification

Send a POST request to `/api/send-admin-notification` with a Bearer token and JSON body:

```bash
curl -X POST "https://YOUR-DOMAIN/api/send-admin-notification" \
  -H "Authorization: Bearer YOUR_ADMIN_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Review the submitted support request"}'
```

The summary is plain administrative text. Do not put passwords, OTPs, recovery codes, or other secrets in it.

## Security

- Never commit `.env.local`, `licenseKey.json`, bot tokens, or API secrets to GitHub.
- Rotate any token or secret that was included in a public repository or shared archive.
- Restrict the admin chat ID to a private administrator chat.
