const fs = require('fs');

const OUTPUT_FILE = '/var/www/proculus/ta-signals.json';
const LOG_FILE = '/root/ta_engine.log';
const BINANCE_INTERVAL = '1h';
const BINANCE_LIMIT = 120;
const SHORT_SMA_PERIOD = 9;
const LONG_SMA_PERIOD = 21;
const RSI_PERIOD = 14;
const TARGET_COUNT = 100;
const CONCURRENCY = 8;

function nowIso() {
  return new Date().toISOString();
}

function calculateSMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period);
  const total = slice.reduce((sum, value) => sum + value, 0);
  return total / period;
}

function calculateRSI(values, period) {
  if (!Array.isArray(values) || values.length <= period) return null;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Proculus-TA-Engine/1.0' }
  });

  if (!response.ok) {
    throw new Error(`Request failed ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchTopUsdtPairs() {
  const [exchangeInfo, tickers] = await Promise.all([
    fetchJson('https://api.binance.com/api/v3/exchangeInfo'),
    fetchJson('https://api.binance.com/api/v3/ticker/24hr')
  ]);

  const tradable = new Set(
    (exchangeInfo.symbols || [])
      .filter((item) => item.status === 'TRADING' && item.quoteAsset === 'USDT' && item.isSpotTradingAllowed)
      .map((item) => item.symbol)
  );

  return (Array.isArray(tickers) ? tickers : [])
    .filter((item) => tradable.has(item.symbol))
    .filter((item) => !String(item.symbol).includes('UPUSDT') && !String(item.symbol).includes('DOWNUSDT'))
    .filter((item) => !String(item.symbol).includes('BULLUSDT') && !String(item.symbol).includes('BEARUSDT'))
    .sort((a, b) => Number(b.quoteVolume || 0) - Number(a.quoteVolume || 0))
    .slice(0, TARGET_COUNT)
    .map((item) => ({
      asset: String(item.symbol).replace(/USDT$/, ''),
      symbol: item.symbol
    }));
}

async function fetchKlines(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${BINANCE_INTERVAL}&limit=${BINANCE_LIMIT}`;
  const data = await fetchJson(url);

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected Binance response for ${symbol}`);
  }

  const closes = data.map((row) => Number(row[4])).filter((value) => Number.isFinite(value));
  if (closes.length < LONG_SMA_PERIOD) {
    throw new Error(`Insufficient OHLC data for ${symbol}`);
  }

  return closes;
}

async function buildSignal(assetConfig) {
  const closes = await fetchKlines(assetConfig.symbol);
  const smaShort = calculateSMA(closes, SHORT_SMA_PERIOD);
  const smaLong = calculateSMA(closes, LONG_SMA_PERIOD);
  const rsi = calculateRSI(closes, RSI_PERIOD);

  const trend = smaShort !== null && smaLong !== null && smaShort > smaLong
    ? 'Bullish'
    : 'Bearish';

  let momentum = 'Neutral';
  if (rsi !== null && rsi > 70) momentum = 'Overbought';
  else if (rsi !== null && rsi < 30) momentum = 'Oversold';

  return {
    asset: assetConfig.asset,
    trend,
    momentum
  };
}

async function processWithConcurrency(items, worker, concurrency) {
  const results = [];
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

function writeLog(successCount, failureEntries) {
  const lines = [
    `[${nowIso()}] Top-100 TA run complete`,
    `Succeeded: ${successCount}`,
    `Failed: ${failureEntries.length}`
  ];

  if (failureEntries.length) {
    lines.push('Failures:');
    for (const failure of failureEntries) {
      lines.push(`- ${failure.symbol}: ${failure.error}`);
    }
  }

  fs.writeFileSync(LOG_FILE, `${lines.join('\n')}\n`);
}

async function main() {
  const assets = await fetchTopUsdtPairs();
  const successes = [];
  const failures = [];

  await processWithConcurrency(
    assets,
    async (assetConfig) => {
      try {
        const signal = await buildSignal(assetConfig);
        successes.push(signal);
      } catch (error) {
        failures.push({
          symbol: assetConfig.symbol,
          error: error.message || String(error)
        });
      }
    },
    CONCURRENCY
  );

  successes.sort((a, b) => a.asset.localeCompare(b.asset));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(successes, null, 2));
  writeLog(successes.length, failures);

  console.log(`Succeeded: ${successes.length}`);
  console.log(`Failed: ${failures.length}`);
  console.log(JSON.stringify(successes.slice(0, 10), null, 2));
}

main().catch((error) => {
  fs.writeFileSync(LOG_FILE, `[${nowIso()}] Fatal error\n${error.stack || error.message || String(error)}\n`);
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
