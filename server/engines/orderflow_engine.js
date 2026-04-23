const fs = require('fs');
const https = require('https');

const TA_FILE = '/var/www/proculus/ta-signals.json';
const OUTPUT_FILE = '/var/www/proculus/orderflow-signals.json';
const LOG_FILE = '/root/orderflow_engine.log';
const ASSET_LIMIT = 80;
const DEPTH_LIMIT = 20;
const LIQUIDATION_LIMIT = 20;

function readJson(file, fallback = []) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'proculus-orderflow-engine/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

async function requestJsonSafe(url, fallback = null) {
  try {
    return await requestJson(url);
  } catch {
    return fallback;
  }
}

function log(message) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`);
}

function sumNotional(levels) {
  return (levels || []).reduce((sum, level) => {
    const price = Number(level?.[0]) || 0;
    const quantity = Number(level?.[1]) || 0;
    return sum + (price * quantity);
  }, 0);
}

function deriveBias(imbalance) {
  if (imbalance >= 0.12) return 'Bullish';
  if (imbalance <= -0.12) return 'Bearish';
  return 'Neutral';
}

function deriveStrength(imbalance, totalPressure) {
  const magnitude = Math.abs(imbalance);
  if (totalPressure < 100000) {
    if (magnitude >= 0.30) return 'Medium';
    return 'Weak';
  }

  if (totalPressure < 250000) {
    if (magnitude >= 0.40) return 'Medium';
    if (magnitude >= 0.22) return 'Weak';
    return 'Weak';
  }

  if (magnitude >= 0.45) return 'Strong';
  if (magnitude >= 0.24) return 'Medium';
  return 'Weak';
}

function buildSummary(asset, bias, strength, buyPressure, sellPressure, imbalance) {
  const side = bias === 'Bullish' ? 'bid-side demand is dominating' : bias === 'Bearish' ? 'ask-side supply is dominating' : 'book pressure is balanced';
  return `${asset} orderflow shows ${side}. Buy pressure $${buyPressure.toFixed(0)} vs sell pressure $${sellPressure.toFixed(0)}, imbalance ${(imbalance * 100).toFixed(1)}%, ${strength.toLowerCase()} conviction.`;
}

async function fetchFundingRate(symbol) {
  const payload = await requestJsonSafe(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, null);
  const rate = Number(payload?.lastFundingRate);
  return Number.isFinite(rate) ? Number(rate.toFixed(6)) : 0;
}

async function fetchOpenInterest(symbol) {
  const payload = await requestJsonSafe(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, null);
  const value = Number(payload?.openInterest);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

async function fetchLiquidationBias(symbol) {
  const payload = await requestJsonSafe(`https://fapi.binance.com/fapi/v1/allForceOrders?symbol=${symbol}&limit=${LIQUIDATION_LIMIT}`, []);
  if (!Array.isArray(payload) || !payload.length) return 'Neutral';

  let longLiquidations = 0;
  let shortLiquidations = 0;

  for (const item of payload) {
    const side = normalize(item?.side);
    const price = Number(item?.avgPrice || item?.price) || 0;
    const qty = Number(item?.executedQty || item?.origQty) || 0;
    const notional = price * qty;
    if (side === 'SELL') longLiquidations += notional;
    else if (side === 'BUY') shortLiquidations += notional;
  }

  const total = longLiquidations + shortLiquidations;
  if (total <= 0) return 'Neutral';
  const skew = (longLiquidations - shortLiquidations) / total;
  if (skew >= 0.2) return 'Long Liquidations';
  if (skew <= -0.2) return 'Short Liquidations';
  return 'Neutral';
}

async function buildAssetSignal(asset) {
  const symbol = `${normalize(asset)}USDT`;
  const payload = await requestJson(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=${DEPTH_LIMIT}`);
  const [fundingRate, openInterest, liquidationBias] = await Promise.all([
    fetchFundingRate(symbol),
    fetchOpenInterest(symbol),
    fetchLiquidationBias(symbol)
  ]);
  const buyPressure = sumNotional(payload.bids);
  const sellPressure = sumNotional(payload.asks);
  const total = buyPressure + sellPressure;
  let imbalance = total > 0 ? (buyPressure - sellPressure) / total : 0;
  const thinBook = total < 100000;
  const lowPressure = total < 250000;

  if (thinBook && Math.abs(imbalance) >= 0.18) {
    imbalance = 0;
  }

  let orderflowBias = deriveBias(imbalance);
  let strength = deriveStrength(imbalance, total);

  if (lowPressure && strength === 'Strong') {
    strength = thinBook ? 'Weak' : 'Medium';
  }

  return {
    asset: normalize(asset),
    buyPressure: Number(buyPressure.toFixed(2)),
    sellPressure: Number(sellPressure.toFixed(2)),
    imbalance: Number(imbalance.toFixed(4)),
    fundingRate,
    openInterest,
    liquidationBias,
    orderflowBias,
    strength,
    summary: buildSummary(asset, orderflowBias, strength, buyPressure, sellPressure, imbalance)
  };
}

async function main() {
  fs.writeFileSync(LOG_FILE, '');
  const assets = readJson(TA_FILE, [])
    .slice(0, ASSET_LIMIT)
    .map((item) => normalize(item.asset))
    .filter(Boolean);

  const results = [];
  for (const asset of assets) {
    try {
      const signal = await buildAssetSignal(asset);
      results.push(signal);
    } catch (error) {
      log(`FAIL ${asset} ${error.message}`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} assets to ${OUTPUT_FILE}`);
  console.log(JSON.stringify(results.slice(0, 5), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
