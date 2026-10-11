// Daftarkan / info / hapus webhook Telegram ke endpoint produksi.
//   POST /api/telegram-register-webhook
//   Header: x-service-key: <TELEGRAM_SERVICE_KEY>
//   Body:   { "action": "set" | "info" | "unset" }
import { telegramApi, webhookSecret, webhookUrl } from './lib/_telegramWebhook.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const serviceKey = process.env.TELEGRAM_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'TELEGRAM_SERVICE_KEY belum di-set di Vercel' });
  if (req.headers['x-service-key'] !== serviceKey) return res.status(403).json({ error: 'x-service-key salah' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN belum di-set di Vercel' });

  const { action = 'set' } = req.body || {};

  try {
    if (action === 'info') {
      return res.status(200).json({ ok: true, result: await telegramApi('getWebhookInfo') });
    }

    if (action === 'unset') {
      return res.status(200).json({ ok: true, result: await telegramApi('deleteWebhook') });
    }

    if (action !== 'set') return res.status(400).json({ error: 'action tidak dikenal' });
    const url = webhookUrl();
    const result = await telegramApi('setWebhook', {
      url, secret_token: webhookSecret(), allowed_updates: ['message']
    });
    return res.status(200).json({ ok: true, result, url });
  } catch (err) {
    console.error('register-webhook error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
