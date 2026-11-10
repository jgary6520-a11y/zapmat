const { loadConfig, telegram, makeSessionId, adminKeyboard, saveAdminState, escapeHtml } = require('./_store');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const config = loadConfig();
  if (!config.botToken || !config.adminChatId || !config.adminApiSecret) {
    return res.status(500).json({ ok: false, error: 'Configure TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID, and ADMIN_API_SECRET' });
  }
  const auth = String(req.headers.authorization || '');
  if (auth !== `Bearer ${config.adminApiSecret}`) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }
  }
  const summary = String(body.summary || '').trim().slice(0, 500);
  if (!summary) return res.status(400).json({ ok: false, error: 'A short summary is required' });

  try {
    const sessionId = makeSessionId();
    const state = {
      sessionId,
      status: 'pending review',
      reviewed: false,
      approved: false,
      summary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const persistence = await saveAdminState(config, sessionId, state);
    const message = [
      '<b>New Administrative Item</b>',
      `Reference: <code>${sessionId}</code>`,
      `Summary: ${escapeHtml(summary)}`,
      'Status: <b>pending review</b>',
      `Storage: <b>${persistence.persisted ? 'Persistent' : 'Not configured'}</b>`
    ].join('\n');
    const sent = await telegram(config.botToken, 'sendMessage', {
      chat_id: config.adminChatId,
      text: message,
      parse_mode: 'HTML',
      reply_markup: adminKeyboard(sessionId)
    });
    return res.status(200).json({ ok: true, sessionId, telegramMessageId: sent.result.message_id, persistentStorage: persistence.persisted });
  } catch (error) {
    console.error('Admin notification error:', error.message);
    return res.status(502).json({ ok: false, error: error.message });
  }
};
