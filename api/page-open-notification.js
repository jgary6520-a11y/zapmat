
const { loadConfig, telegram } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const config = loadConfig();

  if (!config.botToken || !config.adminChatId) {
    return res.status(500).json({
      ok: false,
      error: 'Telegram bot configuration is incomplete'
    });
  }

  // Require persistent storage so public page requests cannot
  // generate unlimited Telegram notifications.
  if (!config.kvUrl || !config.kvToken) {
    return res.status(503).json({
      ok: false,
      error: 'KV storage is required for notification cooldown'
    });
  }

  try {
    const response = await fetch(config.kvUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.kvToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify([
        'SET',
        'telegram-admin:page-open-cooldown',
        '1',
        'NX',
        'EX',
        '300'
      ]),
      signal: AbortSignal.timeout(8000)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.error) {
      throw new Error(result.error || 'Unable to check notification cooldown');
    }

    // A null result means a notification was already sent
    // during the previous five minutes.
    if (result.result !== 'OK') {
      return res.status(200).json({
        ok: true,
        notified: false,
        message: 'Notification cooldown is active'
      });
    }

    await telegram(config.botToken, 'sendMessage', {
      chat_id: config.adminChatId,
      text: '<b>Administrative Page Opened</b>\nThe administrative page was opened.',
      parse_mode: 'HTML'
    });

    return res.status(200).json({
      ok: true,
      notified: true
    });

  } catch (error) {
    console.error('Page-open notification error:', error.message);

    return res.status(502).json({
      ok: false,
      error: 'Unable to send Telegram notification'
    });
  }
};
