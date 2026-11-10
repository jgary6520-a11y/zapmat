// Safe Telegram administration helpers for Vercel serverless functions.
// This module handles administrative notifications only. It does not collect credentials or OTPs.

const crypto = require('crypto');

const TELEGRAM_API = 'https://api.telegram.org';

function loadConfig() {
  return {
    botToken: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    adminChatId: String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim(),
    webhookSecret: String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
    adminApiSecret: String(process.env.ADMIN_API_SECRET || '').trim(),
    kvUrl: String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, ''),
    kvToken: String(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim()
  };
}

async function telegram(botToken, method, params = {}) {
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.description || `Telegram API HTTP ${response.status}`);
  }
  return result;
}

function makeSessionId() {
  return crypto.randomBytes(12).toString('hex');
}

async function saveAdminState(config, sessionId, state) {
  if (!config.kvUrl || !config.kvToken) {
    // Without a configured Redis-compatible KV store, state is not durable across invocations.
    return { persisted: false };
  }
  const key = `telegram-admin:${sessionId}`;
  const response = await fetch(config.kvUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.kvToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(state)]),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to save administrative state');
  return { persisted: true };
}

async function getAdminState(config, sessionId) {
  if (!config.kvUrl || !config.kvToken) return null;
  const key = `telegram-admin:${sessionId}`;
  const response = await fetch(config.kvUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.kvToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(['GET', key]),
    signal: AbortSignal.timeout(8000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw new Error(result.error || 'Unable to read administrative state');
  if (!result.result) return null;
  try { return typeof result.result === 'string' ? JSON.parse(result.result) : result.result; }
  catch { return null; }
}

function adminKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [
        { text: '📊 Show Status', callback_data: `adm|${sessionId}|status` },
        { text: '👀 Mark Reviewed', callback_data: `adm|${sessionId}|review` }
      ],
      [
        { text: '✅ Approve', callback_data: `adm|${sessionId}|approve` },
        { text: '🔒 Close Session', callback_data: `adm|${sessionId}|close` }
      ]
    ]
  };
}

async function handleAdminCallback(callback, config) {
  const callbackId = callback.id;
  const message = callback.message || {};
  const chatId = message.chat && message.chat.id;
  const messageId = message.message_id;
  const parts = String(callback.data || '').split('|');
  if (parts.length !== 3 || parts[0] !== 'adm') {
    await telegram(config.botToken, 'answerCallbackQuery', { callback_query_id: callbackId, text: 'Unknown action', show_alert: true });
    return;
  }

  const [, sessionId, action] = parts;
  if (!/^[a-f0-9]{24}$/.test(sessionId) || !['status', 'review', 'approve', 'close'].includes(action)) {
    await telegram(config.botToken, 'answerCallbackQuery', { callback_query_id: callbackId, text: 'Invalid action', show_alert: true });
    return;
  }

  let state = await getAdminState(config, sessionId) || {
    sessionId,
    status: 'pending review',
    reviewed: false,
    approved: false,
    createdAt: new Date().toISOString()
  };

  if (action === 'review') {
    state.reviewed = true;
    state.status = 'reviewed';
  } else if (action === 'approve') {
    state.reviewed = true;
    state.approved = true;
    state.status = 'approved';
  } else if (action === 'close') {
    state.status = 'closed';
    state.closedAt = new Date().toISOString();
  }
  state.updatedAt = new Date().toISOString();
  const persistence = await saveAdminState(config, sessionId, state);

  const popupText = action === 'status' ? `Status: ${state.status}` :
    action === 'review' ? 'Marked as reviewed' :
    action === 'approve' ? 'Administrative approval recorded' : 'Session closed';
  await telegram(config.botToken, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text: popupText,
    show_alert: action === 'status'
  });

  if (chatId && messageId) {
    const body = [
      '<b>Administrative Review</b>',
      `Reference: <code>${sessionId}</code>`,
      `Status: <b>${escapeHtml(state.status)}</b>`,
      `Reviewed: <b>${state.reviewed ? 'Yes' : 'No'}</b>`,
      `Approved: <b>${state.approved ? 'Yes' : 'No'}</b>`,
      `Storage: <b>${persistence.persisted ? 'Persistent' : 'Not configured'}</b>`
    ].join('\n');
    await telegram(config.botToken, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: body,
      parse_mode: 'HTML',
      reply_markup: state.status === 'closed' ? { inline_keyboard: [] } : adminKeyboard(sessionId)
    });
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

module.exports = {
  loadConfig,
  telegram,
  makeSessionId,
  adminKeyboard,
  handleAdminCallback,
  saveAdminState,
  escapeHtml
};
