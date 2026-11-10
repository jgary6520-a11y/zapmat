const { loadConfig, telegram } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const config = loadConfig();
  if (!config.botToken) return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' });

  const action = String(req.query.action || 'status').toLowerCase();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  if (!host) return res.status(400).json({ ok: false, error: 'Cannot determine deployment host' });
  const webhookUrl = `${protocol}://${host}/api/webhook`;

  try {
    if (action === 'set') {
      const params = { url: webhookUrl, allowed_updates: ['callback_query'] };
      if (config.webhookSecret) params.secret_token = config.webhookSecret;
      const result = await telegram(config.botToken, 'setWebhook', params);
      return res.status(200).json({ ok: true, action: 'setWebhook', webhookUrl, result });
    }
    if (action === 'delete') {
      const result = await telegram(config.botToken, 'deleteWebhook', { drop_pending_updates: false });
      return res.status(200).json({ ok: true, action: 'deleteWebhook', result });
    }
    if (action === 'status') {
      const result = await telegram(config.botToken, 'getWebhookInfo');
      return res.status(200).json({ ok: true, action: 'getWebhookInfo', expectedWebhookUrl: webhookUrl, webhookInfo: result.result });
    }
    return res.status(400).json({ ok: false, error: 'Use action=set, action=status, or action=delete' });
  } catch (error) {
    console.error('Webhook setup error:', error.message);
    return res.status(502).json({ ok: false, error: error.message });
  }
};
