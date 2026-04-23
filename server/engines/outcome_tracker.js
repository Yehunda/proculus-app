const fs = require('fs');
const https = require('https');

const FEEDBACK_FILE = '/var/www/proculus/signal-feedback.json';
const BINANCE_TICKER_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=';
const ONE_HOUR_MS = 60 * 60 * 1000;
const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

function readJson(file, fallback = []) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

async function fetchBinancePrice(asset) {
  const symbol = `${normalize(asset)}USDT`;
  const data = await fetchJson(`${BINANCE_TICKER_URL}${symbol}`);
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid Binance price for ${symbol}`);
  }
  return { symbol, price };
}

function evaluatePnl(signal, referencePrice, currentPrice) {
  if (signal === 'LONG') {
    return ((currentPrice - referencePrice) / referencePrice) * 100;
  }
  if (signal === 'SHORT') {
    return ((referencePrice - currentPrice) / referencePrice) * 100;
  }
  return 0;
}

function deriveOutcome(pnlPercent) {
  if (pnlPercent >= 1.5) return { outcome: 'win', scoreLabel: 'correct' };
  if (pnlPercent <= -1.0) return { outcome: 'loss', scoreLabel: 'wrong' };
  return { outcome: 'neutral', scoreLabel: 'weak' };
}

function buildTrackingSummary(record, elapsedMs) {
  const checkpoints = [];
  if (Number.isFinite(Number(record.price_1h))) checkpoints.push('1h');
  if (Number.isFinite(Number(record.price_4h))) checkpoints.push('4h');
  if (Number.isFinite(Number(record.price_24h))) checkpoints.push('24h');
  const elapsedHours = Math.max(0, elapsedMs / ONE_HOUR_MS);
  const remainingHours = Math.max(0, 24 - elapsedHours);
  const checkpointText = checkpoints.length ? `Captured checkpoints: ${checkpoints.join(', ')}.` : 'No timed checkpoints captured yet.';
  return `${record.asset} ${record.signal} is being tracked with real market outcome logic. Reference price is ${record.referencePrice}. ${checkpointText} Still waiting for a full 24h market outcome window (${remainingHours.toFixed(1)}h remaining).`;
}

function buildOutcomeSummary(record) {
  return `${record.asset} ${record.signal} real market outcome tracked over 24h. Reference ${record.referencePrice}, 24h price ${record.price_24h}, pnl ${record.pnlPercent}%, outcome ${record.outcome}.`;
}

async function processRecord(record) {
  const signal = normalize(record.signal);
  if (record.evaluationStatus !== 'pending') {
    if (!record.evaluationSource && (signal === 'LONG' || signal === 'SHORT')) {
      record.evaluationSource = 'repository_heuristic';
      return { record, changed: true, evaluated: false, pending: false };
    }
    return { record, changed: false, evaluated: false, pending: false };
  }
  if (signal !== 'LONG' && signal !== 'SHORT') {
    return { record, changed: false, evaluated: false, pending: true };
  }

  try {
    if (!Number.isFinite(Number(record.referencePrice)) || Number(record.referencePrice) <= 0) {
      const initial = await fetchBinancePrice(record.asset);
      record.referencePrice = initial.price;
      record.referenceSymbol = initial.symbol;
      record.referenceCapturedAt = new Date().toISOString();
      record.summary = `${record.asset} ${record.signal} is now being tracked with real market outcome logic. Reference price ${initial.price} captured; waiting for 1h, 4h, and 24h checkpoints.`;
      return { record, changed: true, evaluated: false, pending: true };
    }

    const referenceTime = Date.parse(record.referenceCapturedAt || record.createdAt || '');
    const now = Date.now();
    const elapsedMs = Number.isFinite(referenceTime) ? now - referenceTime : 0;
    const latest = await fetchBinancePrice(record.asset);
    record.currentPrice = latest.price;
    record.referenceSymbol = latest.symbol;

    if (elapsedMs >= ONE_HOUR_MS && !Number.isFinite(Number(record.price_1h))) {
      record.price_1h = latest.price;
    }
    if (elapsedMs >= FOUR_HOURS_MS && !Number.isFinite(Number(record.price_4h))) {
      record.price_4h = latest.price;
    }
    if (elapsedMs >= TWENTY_FOUR_HOURS_MS && !Number.isFinite(Number(record.price_24h))) {
      record.price_24h = latest.price;
    }

    if (elapsedMs < TWENTY_FOUR_HOURS_MS) {
      record.summary = buildTrackingSummary(record, elapsedMs);
      return { record, changed: true, evaluated: false, pending: true };
    }

    const referencePrice = Number(record.referencePrice);
    const terminalPrice = Number.isFinite(Number(record.price_24h)) ? Number(record.price_24h) : latest.price;
    record.price_24h = terminalPrice;
    const pnlPercent = evaluatePnl(signal, referencePrice, terminalPrice);
    const roundedPnl = Number(pnlPercent.toFixed(4));
    const verdict = deriveOutcome(roundedPnl);

    record.pnlPercent = roundedPnl;
    record.evaluatedAt = new Date().toISOString();
    record.evaluationStatus = 'evaluated';
    record.evaluationSource = 'market_outcome';
    record.outcome = verdict.outcome;
    record.scoreLabel = verdict.scoreLabel;
    record.summary = buildOutcomeSummary(record);

    return { record, changed: true, evaluated: true, pending: false };
  } catch (error) {
    record.lastOutcomeError = error.message;
    return { record, changed: true, evaluated: false, pending: true };
  }
}

async function main() {
  const feedback = readJson(FEEDBACK_FILE, []);
  let newlyEvaluatedCount = 0;

  for (const record of feedback) {
    const result = await processRecord(record);
    if (result.evaluated) {
      newlyEvaluatedCount += 1;
    }
  }

  writeJson(FEEDBACK_FILE, feedback);

  const pendingCount = feedback.filter((item) => item.evaluationStatus === 'pending').length;

  console.log(
    JSON.stringify(
      {
        newlyEvaluatedCount,
        pendingCount,
        samples: feedback.filter((item) => item.signal === 'LONG' || item.signal === 'SHORT').slice(0, 5)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
