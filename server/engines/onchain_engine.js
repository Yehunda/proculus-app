const fs = require('fs');
const https = require('https');

const TA_FILE = '/var/www/proculus/ta-signals.json';
const OUTPUT_FILE = '/var/www/proculus/onchain-signals.json';
const LOG_FILE = '/root/onchain_engine.log';
const ASSET_LIMIT = 60;
const PREFERRED_CHAINS = ['ethereum', 'solana', 'base', 'bsc', 'arbitrum', 'polygon', 'avalanche'];
const GECKO_NETWORK_MAP = {
  ethereum: 'eth',
  eth: 'eth',
  bsc: 'bsc',
  base: 'base',
  solana: 'solana',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  avax: 'avax',
  algorand: 'algorand',
  aptos: 'aptos'
};

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

function normalizeChain(value) {
  return String(value || '').trim().toLowerCase();
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'proculus-onchain-engine/1.0' } }, (res) => {
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

function log(message) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`);
}

function rankPair(pair) {
  const chainBonus = PREFERRED_CHAINS.includes(String(pair.chainId || '').toLowerCase()) ? 1_000_000_000 : 0;
  const liquidity = Number(pair?.liquidity?.usd) || 0;
  const volume = Number(pair?.volume?.h24) || 0;
  const trades = (Number(pair?.txns?.h24?.buys) || 0) + (Number(pair?.txns?.h24?.sells) || 0);
  return chainBonus + liquidity + (volume * 5) + (trades * 2_000_000);
}

function selectPair(asset, pairs) {
  const target = normalize(asset);
  const candidates = (pairs || [])
    .filter((pair) => {
      const base = normalize(pair?.baseToken?.symbol);
      const quote = normalize(pair?.quoteToken?.symbol);
      return base === target || quote === target;
    })
    .map((pair) => ({
      pair,
      base: normalize(pair?.baseToken?.symbol),
      quote: normalize(pair?.quoteToken?.symbol),
      volume: Number(pair?.volume?.h24) || 0,
      trades: (Number(pair?.txns?.h24?.buys) || 0) + (Number(pair?.txns?.h24?.sells) || 0)
    }));

  const active = candidates.filter((candidate) => candidate.volume >= 1000 || candidate.trades >= 10);
  const preferred = (active.length ? active : candidates)
    .sort((a, b) => {
      const aBaseBonus = a.base === target ? 500_000_000 : 0;
      const bBaseBonus = b.base === target ? 500_000_000 : 0;
      return (rankPair(b.pair) + bBaseBonus) - (rankPair(a.pair) + aBaseBonus);
    });

  return preferred[0]?.pair;
}

function deriveExchangeFlow(pair) {
  const buys = Number(pair?.txns?.h24?.buys) || 0;
  const sells = Number(pair?.txns?.h24?.sells) || 0;
  if (buys > sells * 1.15) return 'Net Outflow';
  if (sells > buys * 1.15) return 'Net Inflow';
  return 'Balanced';
}

function deriveWhaleActivity(pair) {
  const volume = Number(pair?.volume?.h24) || 0;
  const liquidity = Math.max(Number(pair?.liquidity?.usd) || 0, 1);
  const trades = (Number(pair?.txns?.h24?.buys) || 0) + (Number(pair?.txns?.h24?.sells) || 0);
  const avgTradeSize = trades > 0 ? volume / trades : 0;
  const volumeLiquidity = volume / liquidity;

  if (avgTradeSize >= 10000 || volumeLiquidity >= 1.5) return 'High';
  if (avgTradeSize >= 3000 || volumeLiquidity >= 0.6) return 'Medium';
  return 'Low';
}

function deriveOnchainBias(pair, exchangeFlow, whaleActivity) {
  const priceChange = Number(pair?.priceChange?.h24) || 0;
  if (exchangeFlow === 'Net Outflow' && (priceChange >= -3 || whaleActivity === 'High')) return 'Bullish';
  if (exchangeFlow === 'Net Inflow' && (priceChange <= 3 || whaleActivity !== 'Low')) return 'Bearish';
  if (priceChange >= 8) return 'Bullish';
  if (priceChange <= -8) return 'Bearish';
  return 'Neutral';
}

function mapGeckoNetwork(chainId) {
  return GECKO_NETWORK_MAP[normalizeChain(chainId)] || '';
}

async function fetchGeckoPoolMetrics(asset, pair) {
  const network = mapGeckoNetwork(pair?.chainId);
  if (!network) return null;

  const base = normalize(pair?.baseToken?.symbol);
  const quote = normalize(pair?.quoteToken?.symbol);
  const targetAddress = base === normalize(asset) ? pair?.baseToken?.address : quote === normalize(asset) ? pair?.quoteToken?.address : pair?.baseToken?.address;
  if (!targetAddress) return null;

  try {
    const payload = await requestJson(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${targetAddress}/pools`);
    const pools = Array.isArray(payload?.data) ? payload.data : [];
    const matched = pools.find((item) => normalize(item?.attributes?.address) === normalize(pair?.pairAddress));
    const best = matched || pools[0];
    return best?.attributes || null;
  } catch (error) {
    log(`GECKO_FAIL ${asset} ${error.message}`);
    return null;
  }
}

function participantCount(bucket) {
  if (!bucket) return 0;
  return (Number(bucket.buyers) || 0) + (Number(bucket.sellers) || 0);
}

function deriveAddressTrend(shortWindow, longWindow, shortScale) {
  const shortCount = participantCount(shortWindow);
  const longCount = participantCount(longWindow);
  if (!longCount) return 'Stable';
  const rate = (shortCount * shortScale) / longCount;
  if (rate >= 1.2) return 'Rising';
  if (rate <= 0.7) return 'Falling';
  return 'Stable';
}

function safeRatio(numerator, denominator, scale = 1) {
  if (!denominator) return 0;
  return (numerator * scale) / denominator;
}

function deriveAccelerationMetrics(geckoMetrics) {
  const tx = geckoMetrics?.transactions || {};
  const volume = geckoMetrics?.volume_usd || {};
  const h1Trades = participantCount(tx.h1);
  const h24Trades = participantCount(tx.h24);
  const m15Trades = participantCount(tx.m15);
  const volumeAccelerationRatio = safeRatio(Number(volume.h1) || 0, Number(volume.h24) || 0, 24);
  const transactionAccelerationRatio = safeRatio(h1Trades, h24Trades, 24);
  const buyerGrowthRatio = safeRatio(Number(tx.h1?.buyers) || 0, Number(tx.h24?.buyers) || 0, 24);

  const volumeAcceleration = clampMetric(volumeAccelerationRatio);
  const transactionAcceleration = clampMetric(transactionAccelerationRatio);
  const buyerGrowth = clampMetric(buyerGrowthRatio + safeRatio(Number(tx.m15?.buyers) || 0, Number(tx.h1?.buyers) || 0, 4) * 0.35);
  const accelerationScore = Math.round((volumeAcceleration * 0.4) + (transactionAcceleration * 0.35) + (buyerGrowth * 0.25));

  return { volumeAcceleration, transactionAcceleration, buyerGrowth, accelerationScore, m15Trades };
}

function clampMetric(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  return Math.min(100, Math.round(ratio * 50));
}

function deriveAccumulationDistribution(exchangeFlow, priceChange, activeAddressTrend, newAddressTrend, whaleActivity) {
  if (
    exchangeFlow === 'Net Outflow' &&
    priceChange >= -2 &&
    priceChange <= 12 &&
    activeAddressTrend === 'Rising' &&
    (newAddressTrend === 'Rising' || whaleActivity !== 'Low')
  ) {
    return 'Accumulation';
  }
  if (
    exchangeFlow === 'Net Inflow' &&
    priceChange <= 4 &&
    (activeAddressTrend === 'Rising' || newAddressTrend === 'Rising' || whaleActivity !== 'Low')
  ) {
    return 'Distribution';
  }
  return 'Neutral';
}

function deriveHolderConcentration(geckoMetrics, pair) {
  const reserve = Number(geckoMetrics?.reserve_in_usd) || Number(pair?.liquidity?.usd) || 0;
  const marketCap = Number(geckoMetrics?.market_cap_usd) || Number(geckoMetrics?.fdv_usd) || Number(pair?.marketCap) || Number(pair?.fdv) || 0;
  if (!reserve || !marketCap) return 'Unknown';
  const ratio = marketCap / reserve;
  if (ratio >= 40) return 'High';
  if (ratio >= 15) return 'Medium';
  return 'Low';
}

function deriveAnomalyScore(pair, geckoMetrics, exchangeFlow, whaleActivity, onchainBias, activeAddressTrend, newAddressTrend, holderConcentration) {
  const buys = Number(pair?.txns?.h24?.buys) || 0;
  const sells = Number(pair?.txns?.h24?.sells) || 0;
  const tradeTotal = Math.max(buys + sells, 1);
  const flowImbalance = Math.abs(buys - sells) / tradeTotal;
  const volume = Number(geckoMetrics?.volume_usd?.h24) || Number(pair?.volume?.h24) || 0;
  const liquidity = Math.max(Number(geckoMetrics?.reserve_in_usd) || Number(pair?.liquidity?.usd) || 1, 1);
  const volumeLiquidity = volume / liquidity;
  const priceChange = Math.abs(Number(geckoMetrics?.price_change_percentage?.h24) || Number(pair?.priceChange?.h24) || 0);

  let score = 0;
  score += Math.min(35, flowImbalance * 70);
  score += Math.min(30, volumeLiquidity * 18);
  score += Math.min(20, priceChange);
  if (whaleActivity === 'High') score += 15;
  else if (whaleActivity === 'Medium') score += 8;
  if (onchainBias === 'Bullish' || onchainBias === 'Bearish') score += 5;
  if (activeAddressTrend === 'Rising') score += 8;
  if (newAddressTrend === 'Rising') score += 6;
  if (holderConcentration === 'High') score += 8;
  else if (holderConcentration === 'Medium') score += 4;

  return Math.min(100, Math.round(score));
}

function buildSummary(asset, pair, geckoMetrics, exchangeFlow, whaleActivity, accumulationDistribution, holderConcentration, activeAddressTrend, newAddressTrend, onchainBias, anomalyScore) {
  const volume = Number(geckoMetrics?.volume_usd?.h24) || Number(pair?.volume?.h24) || 0;
  const liquidity = Number(geckoMetrics?.reserve_in_usd) || Number(pair?.liquidity?.usd) || 0;
  const chainId = String(pair?.chainId || '').toUpperCase();
  return `${asset} shows ${onchainBias.toLowerCase()} on-chain pressure on ${chainId}. ${exchangeFlow}, ${accumulationDistribution.toLowerCase()} behavior, ${whaleActivity.toLowerCase()} whale activity, ${holderConcentration.toLowerCase()} holder concentration proxy, active addresses ${activeAddressTrend.toLowerCase()}, new addresses ${newAddressTrend.toLowerCase()}, anomaly ${anomalyScore}/100, $${volume.toFixed(0)} 24h volume against $${liquidity.toFixed(0)} reserve.`;
}

async function buildAssetSignal(asset) {
  const encoded = encodeURIComponent(asset);
  const payload = await requestJson(`https://api.dexscreener.com/latest/dex/search/?q=${encoded}`);
  const pair = selectPair(asset, payload.pairs || []);
  if (!pair) return null;

  const geckoMetrics = await fetchGeckoPoolMetrics(asset, pair);
  const exchangeFlow = deriveExchangeFlow(pair);
  const whaleActivity = deriveWhaleActivity(pair);
  const priceChange = Number(geckoMetrics?.price_change_percentage?.h24) || Number(pair?.priceChange?.h24) || 0;
  const activeAddressTrend = deriveAddressTrend(geckoMetrics?.transactions?.h1, geckoMetrics?.transactions?.h24, 24);
  const newAddressTrend = deriveAddressTrend(geckoMetrics?.transactions?.m15, geckoMetrics?.transactions?.h1, 4);
  const acceleration = deriveAccelerationMetrics(geckoMetrics || {});
  const accumulationDistribution = deriveAccumulationDistribution(exchangeFlow, priceChange, activeAddressTrend, newAddressTrend, whaleActivity);
  const holderConcentration = deriveHolderConcentration(geckoMetrics, pair);
  const onchainBias = accumulationDistribution === 'Accumulation'
    ? 'Bullish'
    : accumulationDistribution === 'Distribution'
      ? 'Bearish'
      : deriveOnchainBias(pair, exchangeFlow, whaleActivity);
  const anomalyScore = deriveAnomalyScore(pair, geckoMetrics, exchangeFlow, whaleActivity, onchainBias, activeAddressTrend, newAddressTrend, holderConcentration);
  const summary = buildSummary(asset, pair, geckoMetrics, exchangeFlow, whaleActivity, accumulationDistribution, holderConcentration, activeAddressTrend, newAddressTrend, onchainBias, anomalyScore);

  return {
    asset: normalize(asset),
    exchangeFlow,
    whaleActivity,
    accumulationDistribution,
    holderConcentration,
    activeAddressTrend,
    newAddressTrend,
    volumeAcceleration: acceleration.volumeAcceleration,
    transactionAcceleration: acceleration.transactionAcceleration,
    buyerGrowth: acceleration.buyerGrowth,
    accelerationScore: acceleration.accelerationScore,
    onchainBias,
    anomalyScore,
    summary
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
      if (signal) {
        results.push(signal);
      } else {
        log(`MISS ${asset} no pair match`);
      }
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
