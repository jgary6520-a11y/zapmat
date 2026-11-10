const { loadConfig, handleAdminCallback } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const config = loadConfig();
  if (!config.botToken) return res.status(500).json({ ok: false, error: 'Bot is not configured' });
  if (config.webhookSecret) {
    const supplied = req.headers['x-telegram-bot-api-secret-token'];
    if (supplied !== config.webhookSecret) return res.status(401).json({ ok: false, error: 'Unauthorized webhook request' });
  }

  let update = req.body || {};
  if (typeof update === 'string') {
    try { update = JSON.parse(update); }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }
  }
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    return res.status(400).json({ ok: false, error: 'Invalid update payload' });
  }

  try {
    if (update.callback_query) await handleAdminCallback(update.callback_query, config);
    // Ignore other update types; this bot is intentionally limited to admin callbacks.
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error.message);
    // Return 200 to avoid Telegram retry storms; the error is recorded in Vercel logs.
    return res.status(200).json({ ok: true, warning: 'Callback processing failed; see function logs' });
  }
};
