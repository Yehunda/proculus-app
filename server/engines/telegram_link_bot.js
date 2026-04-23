const fs = require('fs');
const path = require('path');

const ENV_FILE = '/root/.env';
const STATE_FILE = '/root/telegram_link_bot_state.json';
const LOG_FILE = '/root/telegram_link_bot.log';
const DEFAULT_BASE_URL = 'https://proculus.xyz';
const POLL_TIMEOUT_SECONDS = 25;

function nowIso() {
  return new Date().toISOString();
}

function log(message) {
  const line = `[${nowIso()}] ${message}`;
  fs.appendFileSync(LOG_FILE, `${line}\n`);
  console.log(line);
}

function readEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const entries = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

function getConfig() {
  const envFile = readEnvFile(ENV_FILE);
  return {
    botToken: String(process.env.TELEGRAM_BOT_TOKEN || envFile.TELEGRAM_BOT_TOKEN || '').trim(),
    baseUrl: String(process.env.PROCULUS_BASE_URL || envFile.PROCULUS_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '')
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { offset: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function telegramRequest(botToken, method, body = null, query = '') {
  const url = `https://api.telegram.org/bot${botToken}/${method}${query}`;
  const response = await fetch(url, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } : undefined);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Telegram ${method} failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} error: ${JSON.stringify(data)}`);
  }

  return data.result;
}

async function sendMessage(botToken, chatId, text) {
  await telegramRequest(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

function parseStartToken(text) {
  const normalized = String(text || '').trim();
  const match = normalized.match(/^\/start(?:@\w+)?\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function completeLink(baseUrl, token, chatId, telegramUsername) {
  const response = await fetch(`${baseUrl}/api/public/telegram/link/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, chatId, telegramUsername })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Link completion failed: ${response.status}`);
  }

  return data;
}

async function handleUpdate(config, update) {
  const message = update.message || update.edited_message;
  if (!message || !message.text) {
    return;
  }

  const token = parseStartToken(message.text);
  const chatId = String(message.chat?.id || '').trim();
  const telegramUsername = String(message.from?.username || message.chat?.username || '').trim();

  if (!message.text.startsWith('/start')) {
    return;
  }

  if (!token) {
    await sendMessage(
      config.botToken,
      chatId,
      'Start the bot from your Proculus dashboard link so I can connect your Telegram alerts.'
    );
    return;
  }

  try {
    const result = await completeLink(config.baseUrl, token, chatId, telegramUsername);
    const linkedEmail = result?.telegram?.linkedEmail || 'your account';
    await sendMessage(
      config.botToken,
      chatId,
      `Telegram linked successfully for ${linkedEmail}. You can return to Proculus and manage alerts from the dashboard.`
    );
    log(`Linked Telegram chat ${chatId} to ${linkedEmail}${telegramUsername ? ` (@${telegramUsername})` : ''}`);
  } catch (error) {
    await sendMessage(
      config.botToken,
      chatId,
      `Telegram link failed: ${error.message || 'Invalid or expired token.'}`
    );
    log(`Link failed for chat ${chatId}: ${error.message || String(error)}`);
  }
}

async function pollLoop() {
  const config = getConfig();
  if (!config.botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured in /root/.env');
  }

  let state = readState();
  log(`Telegram link bot started. Base URL: ${config.baseUrl}`);

  while (true) {
    try {
      const query = `?timeout=${POLL_TIMEOUT_SECONDS}&offset=${Number(state.offset || 0)}`;
      const updates = await telegramRequest(config.botToken, 'getUpdates', null, query);

      for (const update of updates) {
        await handleUpdate(config, update);
        state.offset = Number(update.update_id) + 1;
        writeState(state);
      }
    } catch (error) {
      log(`Polling error: ${error.message || String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

pollLoop().catch((error) => {
  log(`Fatal error: ${error.stack || error.message || String(error)}`);
  process.exit(1);
});
