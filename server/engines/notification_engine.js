const fs = require('fs');

const ENV_FILE = '/root/.env';
const SIGNALS_FILE = '/var/www/proculus/signals-live.json';
const TELEGRAM_USERS_FILE = '/var/www/proculus/data/telegram-users.json';
const OUTPUT_FILE = '/var/www/proculus/alerts-live.json';
const LOG_FILE = '/root/notification_engine.log';

function loadEnvFile(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

loadEnvFile(ENV_FILE);

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const ADMIN_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim();

function readJson(file, fallback = []) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value) {
  return String(value || '').trim();
}

function shorten(text, max = 140) {
  const clean = normalize(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = `${alert.asset}|${alert.type}|${alert.signal || ''}|${alert.classLabel || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSignalAlerts(signals) {
  return signals
    .filter((item) => {
      const signal = normalize(item.signal || 'WAIT');
      const classLabel = normalize(item.classLabel || '');
      const confidence = Number(item.confidence || 0);
      return (signal === 'LONG' || signal === 'SHORT') && (confidence >= 80 || classLabel === 'Parabolic Candidate');
    })
    .map((item) => ({
      asset: normalize(item.asset || 'MARKET'),
      type: 'Signal',
      title: `${normalize(item.asset || 'Asset')} ${normalize(item.signal || 'WAIT')} ${normalize(item.classLabel || 'Signal')}`.trim(),
      message: shorten(normalize(item.reason || 'High-quality signal detected.')),
      time: nowIso(),
      signal: normalize(item.signal || 'WAIT'),
      trend: normalize(item.signal || 'WAIT') === 'LONG' ? 'Bullish' : 'Bearish',
      confidence: Number(item.confidence || 0),
      reason: shorten(normalize(item.reason || 'Strong signal detected.')),
      strength: normalize(item.strength || 'Weak'),
      classLabel: normalize(item.classLabel || 'Signal'),
      action: normalize(item.signal || 'WAIT') === 'LONG' ? 'Look for pullback entry' : 'Watch resistance rejection',
      timing: normalize(item.timingHint || 'Wait for confirmation'),
      risk: normalize(item.riskNote || 'Standard execution risk applies')
    }));
}

function readRecipients() {
  const linkedUsers = readJson(TELEGRAM_USERS_FILE, [])
    .filter((item) => Boolean(item.enabled) && Boolean(item.alertsEligible) && normalize(item.chatId))
    .map((item) => ({
      chatId: normalize(item.chatId),
      label: normalize(item.linkedEmail || item.telegramUsername || item.chatId)
    }));

  const recipients = new Map();
  for (const item of linkedUsers) {
    recipients.set(item.chatId, item);
  }

  if (ADMIN_CHAT_ID) {
    recipients.set(ADMIN_CHAT_ID, {
      chatId: ADMIN_CHAT_ID,
      label: 'ADMIN'
    });
  }

  return [...recipients.values()];
}

function formatTelegramMessage(alert) {
  if (alert.classLabel === 'Parabolic Candidate') {
    return [
      '🔥 PARABOLIC ALERT',
      '',
      `${alert.asset} — ${alert.signal}`,
      `Confidence: ${alert.confidence}%`,
      '',
      'Early accumulation detected',
      'On-chain acceleration rising',
      'High breakout potential'
    ].join('\n');
  }

  return [
    '🚨 PROCULUS SIGNAL',
    '',
    `${alert.asset} — ${alert.signal}`,
    `Confidence: ${alert.confidence}%`,
    '',
    `Trend: ${alert.trend}`,
    `Strength: ${alert.strength}`,
    '',
    `Action: ${alert.action}`,
    `Timing: ${alert.timing}`,
    `Risk: ${alert.risk}`
  ].join('\n');
}

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram API ${response.status}: ${body}`);
  }

  return response.json();
}

async function deliverAlerts(alerts) {
  const recipients = readRecipients();
  if (!BOT_TOKEN) {
    return { sentCount: 0, recipientCount: recipients.length, skipped: 'Telegram bot token not configured' };
  }
  if (!recipients.length) {
    return { sentCount: 0, recipientCount: 0, skipped: 'No eligible Telegram recipients' };
  }

  let sentCount = 0;
  for (const recipient of recipients) {
    for (const alert of alerts) {
      try {
        await sendTelegramMessage(recipient.chatId, formatTelegramMessage(alert));
        sentCount += 1;
      } catch (error) {
        fs.appendFileSync(LOG_FILE, `[${nowIso()}] Telegram send failed for ${recipient.label} | ${alert.asset} | ${alert.title}: ${error.message || String(error)}\n`);
      }
    }
  }

  return { sentCount, recipientCount: recipients.length, skipped: '' };
}

function writeLog(alerts, delivery) {
  const lines = [
    `[${nowIso()}] Notification engine run complete`,
    `Alerts generated: ${alerts.length}`,
    `Telegram recipients: ${delivery.recipientCount}`,
    `Telegram sent: ${delivery.sentCount}`
  ];

  if (delivery.skipped) {
    lines.push(`Telegram skipped: ${delivery.skipped}`);
  }

  for (const alert of alerts.slice(0, 10)) {
    lines.push(`- ${alert.type} | ${alert.asset} | ${alert.title}`);
  }

  fs.writeFileSync(LOG_FILE, `${lines.join('\n')}\n`);
}

async function main() {
  const signals = readJson(SIGNALS_FILE, []);
  const alerts = dedupeAlerts(buildSignalAlerts(signals));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(alerts, null, 2));
  const delivery = await deliverAlerts(alerts);
  writeLog(alerts, delivery);

  console.log(`Wrote ${alerts.length} alerts to ${OUTPUT_FILE}`);
  console.log(`Telegram sent: ${delivery.sentCount}`);
  if (delivery.skipped) console.log(`Telegram skipped: ${delivery.skipped}`);
  console.log(JSON.stringify({ sampleMessage: alerts[0] ? formatTelegramMessage(alerts[0]) : '' }, null, 2));
}

main().catch((error) => {
  fs.writeFileSync(LOG_FILE, `[${nowIso()}] Fatal error\n${error.stack || error.message || String(error)}\n`);
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
