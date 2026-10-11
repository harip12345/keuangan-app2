import { createHash } from 'node:crypto';

const DEFAULT_WEBHOOK_URL = 'https://myfinanceapp.my.id/api/telegram-webhook';

export function webhookUrl() {
  const url = process.env.TELEGRAM_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/api/telegram-webhook' || parsed.search || parsed.hash) {
    throw new Error('TELEGRAM_WEBHOOK_URL harus HTTPS dan berakhir /api/telegram-webhook');
  }
  return parsed.href;
}

export function webhookSecret() {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) return process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum di-set di Vercel');
  return createHash('sha256').update(`myfinanceapp:telegram-webhook:${token}`).digest('hex');
}

export async function telegramApi(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN belum di-set di Vercel');
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) throw new Error(`Telegram ${method}: ${data.description || resp.status}`);
  return data.result;
}

export async function ensureWebhook() {
  const expectedUrl = webhookUrl();
  const previous = await telegramApi('getWebhookInfo');
  // getWebhookInfo tidak menunjukkan secret. Sinkronkan juga saat URL sudah benar.
  await telegramApi('setWebhook', {
    url: expectedUrl,
    secret_token: webhookSecret(),
    allowed_updates: ['message']
  });
  const info = await telegramApi('getWebhookInfo');
  if (info.url !== expectedUrl) throw new Error('Webhook Telegram belum mengarah ke domain aplikasi');
  return { ready: true, pendingUpdates: info.pending_update_count || 0,
    lastError: info.last_error_message || null,
    repaired: previous.url !== expectedUrl || !!previous.last_error_message };
}
