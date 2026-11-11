
// api/page-open-notification.js
// Sends a fixed Telegram notification when the public portal is opened.
// Does not collect visitor credentials, contact details, or verification codes.

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).json({
            ok: false,
            error: 'Method not allowed'
        });
    }

    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    const adminChatId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || '').trim();

    const kvUrl = String(
        process.env.KV_REST_API_URL ||
        process.env.UPSTASH_REDIS_REST_URL ||
        ''
    ).trim().replace(/\/$/, '');

    const kvToken = String(
        process.env.KV_REST_API_TOKEN ||
        process.env.UPSTASH_REDIS_REST_TOKEN ||
        ''
    ).trim();

    if (!botToken || !adminChatId) {
        console.error('Telegram notification configuration is incomplete.');

        return res.status(500).json({
            ok: false,
            error: 'Notification service is not configured'
        });
    }

    if (!kvUrl || !kvToken) {
        console.error('Notification cooldown storage is not configured.');

        return res.status(503).json({
            ok: false,
            error: 'Notification service is temporarily unavailable'
        });
    }

    let body = req.body || {};

    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({
                ok: false,
                error: 'Invalid request'
            });
        }
    }

    if (body.event !== 'portal_opened') {
        return res.status(400).json({
            ok: false,
            error: 'Invalid notification event'
        });
    }

    try {
        // Global cooldown: at most one Telegram notification per 60 seconds.
        const cooldownResponse = await fetch(kvUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${kvToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([
                'SET',
                'portal-open-notification-cooldown',
                'sent',
                'NX',
                'EX',
                60
            ]),
            signal: AbortSignal.timeout(8000)
        });

        const cooldownResult = await cooldownResponse.json().catch(() => ({}));

        if (!cooldownResponse.ok || cooldownResult.error) {
            throw new Error('Notification cooldown service failed');
        }

        // A recent notification already exists. No duplicate Telegram message.
        if (cooldownResult.result !== 'OK') {
            return res.status(200).json({
                ok: true,
                duplicate: true
            });
        }

        const message = [
            '<b>Portal Open Notification</b>',
            '',
            'The online invitation notification portal was opened.',
            '',
            `Time: ${new Date().toISOString()}`
        ].join('\n');

        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: adminChatId,
                    text: message,
                    parse_mode: 'HTML'
                }),
                signal: AbortSignal.timeout(10000)
            }
        );

        const telegramResult = await telegramResponse.json().catch(() => ({}));

        if (!telegramResponse.ok || telegramResult.ok !== true) {
            throw new Error('Telegram notification could not be sent');
        }

        return res.status(200).json({
            ok: true,
            notified: true
        });

    } catch (error) {
        console.error('Page-open notification failed:', error.message);

        return res.status(502).json({
            ok: false,
            error: 'Notification service is temporarily unavailable'
        });
    }
};
