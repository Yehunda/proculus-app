const fs = require('fs');

const MARKET_FILE = '/var/www/proculus/market-intelligence.json';
const UNLOCK_FILE = '/var/www/proculus/unlock-calendar.json';
const TA_FILE = '/var/www/proculus/ta-signals.json';
const SOCIAL_FILE = '/var/www/proculus/social-intelligence.json';
const ONCHAIN_FILE = '/var/www/proculus/onchain-signals.json';
const ORDERFLOW_FILE = '/var/www/proculus/orderflow-signals.json';
const OUTPUT_FILE = '/var/www/proculus/decision-repository.json';
const TA_ONLY_LIMIT = 100;

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

function parseAssetFromUnlockTitle(title) {
  const match = String(title || '').match(/^([A-Z0-9]{2,10})\s+Unlock Approaching/i);
  return match ? normalize(match[1]) : '';
}

function buildUrgency(daysLeft, date) {
  const n = Number(daysLeft);
  if (Number.isFinite(n) && n <= 1) return 'Unlock Tomorrow';
  if (Number.isFinite(n) && n <= 3) return `Unlock in ${n} days`;
  return date || '';
}

function inferAssetsFromMarket(marketItems, unlockItems) {
  const assets = [];
  const seen = new Set();

  const unlockLookup = unlockItems.map((item) => ({
    token: normalize(item.token),
    project: normalize(item.project)
  }));

  for (const item of marketItems) {
    let asset = parseAssetFromUnlockTitle(item.title);

    if (!asset && item.relatedUnlock) {
      const titleText = normalize(`${item.title} ${item.summary} ${item.fullArticle}`);
      const match = unlockLookup.find((unlock) => {
        if (unlock.token && new RegExp(`(^|[^A-Z0-9])${unlock.token}([^A-Z0-9]|$)`).test(titleText)) return true;
        if (unlock.project && titleText.includes(unlock.project)) return true;
        return false;
      });
      asset = match?.token || '';
    }

    if (asset && !seen.has(asset)) {
      seen.add(asset);
      assets.push(asset);
    }
  }

  for (const unlock of unlockItems) {
    const token = normalize(unlock.token);
    if (token && !seen.has(token)) {
      seen.add(token);
      assets.push(token);
    }
  }

  return assets;
}

function deriveBias(news, unlock, taSignal) {
  if (news[0]?.bias) return news[0].bias;
  if (unlock?.impactLevel === 'High') return 'Bearish';
  if (unlock?.impactLevel === 'Medium') return 'Caution';
  if (taSignal?.trend === 'Bullish') return 'Bullish';
  if (taSignal?.trend === 'Bearish') return 'Bearish';
  return 'Neutral';
}

function buildEarlySignal(news, unlock, social, taSignal, onchainSignal) {
  const candidates = [];
  const primarySocial = social[0] || null;

  if (primarySocial && Number(primarySocial.mentions) > 0 && Number(primarySocial.mentions) <= 3 && Number(primarySocial.hypeScore) >= 35) {
    const sentiment = normalize(primarySocial.sentiment || 'Neutral');
    candidates.push({
      earlySignal: true,
      earlyType: 'Social Divergence',
      earlyStrength: Math.min(100, Math.round(Number(primarySocial.hypeScore) + 15)),
      directionalEarlyBias: sentiment === 'BULLISH' ? 'Bullish' : sentiment === 'BEARISH' ? 'Bearish' : 'Neutral'
    });
  }

  if (!news.length && !unlock && normalize(taSignal.trend) !== 'NEUTRAL' && normalize(taSignal.momentum) === 'NEUTRAL') {
    candidates.push({
      earlySignal: true,
      earlyType: 'TA Compression',
      earlyStrength: 55,
      directionalEarlyBias: normalize(taSignal.trend) === 'BULLISH' ? 'Bullish' : 'Bearish'
    });
  }

  if (unlock && Number.isFinite(Number(unlock.daysLeft)) && Number(unlock.daysLeft) <= 3) {
    candidates.push({
      earlySignal: true,
      earlyType: 'Unlock Pressure',
      earlyStrength: normalize(unlock.impactLevel) === 'HIGH' ? 80 : 65,
      directionalEarlyBias: 'Bearish'
    });
  }

  if (onchainSignal && Number(onchainSignal.anomalyScore) >= 70) {
    candidates.push({
      earlySignal: true,
      earlyType: 'On-chain Anomaly',
      earlyStrength: Math.min(100, Number(onchainSignal.anomalyScore)),
      directionalEarlyBias: normalize(onchainSignal.onchainBias) === 'BULLISH' ? 'Bullish' : normalize(onchainSignal.onchainBias) === 'BEARISH' ? 'Bearish' : 'Neutral'
    });
  }

  if (!candidates.length) {
    return {
      earlySignal: false,
      earlyType: '',
      earlyStrength: 0,
      directionalEarlyBias: 'Neutral'
    };
  }

  return candidates.sort((a, b) => b.earlyStrength - a.earlyStrength)[0];
}

function buildRepositoryEntry(asset, marketItems, unlockItems, socialItems, onchainLookup, orderflowLookup, taLookup) {
  const upperAsset = normalize(asset);
  const news = marketItems
    .filter((item) => {
      const titleText = normalize(`${item.title} ${item.summary} ${item.fullArticle}`);
      const fromTitle = new RegExp(`(^|[^A-Z0-9])${upperAsset}([^A-Z0-9]|$)`).test(titleText);
      const fromUnlockTitle = parseAssetFromUnlockTitle(item.title) === upperAsset;
      return fromTitle || fromUnlockTitle;
    })
    .map((item) => ({
      title: item.title,
      summary: item.summary,
      category: item.category,
      risk: item.riskLevel,
      bias: item.actionBias,
      actionNote: item.actionNote,
      relatedUnlock: Boolean(item.relatedUnlock),
      time: item.time,
      source: item.source
    }));

  const social = socialItems
    .filter((item) => normalize(item.asset) === upperAsset)
    .map((item) => ({
      mentions: item.mentions,
      mentionAcceleration: item.mentionAcceleration,
      sentiment: item.sentiment,
      hypeScore: item.hypeScore,
      riskNarrative: item.riskNarrative,
      summary: item.summary,
      time: item.time
    }));

  const unlock = unlockItems.find((item) => normalize(item.token) === upperAsset || normalize(item.project) === upperAsset) || null;
  const onchainSignal = onchainLookup.get(upperAsset) || null;
  const orderflowSignal = orderflowLookup.get(upperAsset) || null;
  const taSignal = taLookup.get(upperAsset) || { trend: 'Neutral', momentum: 'Neutral' };

  const risk = unlock?.impactLevel || news[0]?.risk || 'Neutral';
  const bias = deriveBias(news, unlock, taSignal);
  const urgency = unlock ? buildUrgency(unlock.daysLeft, unlock.date) : (news[0]?.relatedUnlock ? buildUrgency(0, news[0]?.time) : 'Normal');
  const early = buildEarlySignal(news, unlock, social, taSignal, onchainSignal);

  return {
    asset: upperAsset,
    news,
    unlock: unlock ? {
      project: unlock.project,
      date: unlock.date,
      daysLeft: unlock.daysLeft,
      amount: unlock.amount,
      type: unlock.type,
      impactLevel: unlock.impactLevel,
      impactNote: unlock.impactNote,
      note: unlock.note
    } : null,
    social,
    ta: {
      trend: taSignal.trend || 'Neutral',
      momentum: taSignal.momentum || 'Neutral'
    },
    onchain: onchainSignal ? {
      exchangeFlow: onchainSignal.exchangeFlow,
      whaleActivity: onchainSignal.whaleActivity,
      accumulationDistribution: onchainSignal.accumulationDistribution,
      holderConcentration: onchainSignal.holderConcentration,
      activeAddressTrend: onchainSignal.activeAddressTrend,
      newAddressTrend: onchainSignal.newAddressTrend,
      volumeAcceleration: onchainSignal.volumeAcceleration,
      transactionAcceleration: onchainSignal.transactionAcceleration,
      buyerGrowth: onchainSignal.buyerGrowth,
      accelerationScore: onchainSignal.accelerationScore,
      onchainBias: onchainSignal.onchainBias,
      anomalyScore: onchainSignal.anomalyScore,
      summary: onchainSignal.summary
    } : {
      exchangeFlow: 'Balanced',
      whaleActivity: 'Low',
      accumulationDistribution: 'Neutral',
      holderConcentration: 'Unknown',
      activeAddressTrend: 'Stable',
      newAddressTrend: 'Stable',
      volumeAcceleration: 0,
      transactionAcceleration: 0,
      buyerGrowth: 0,
      accelerationScore: 0,
      onchainBias: 'Neutral',
      anomalyScore: 0,
      summary: ''
    },
    orderflow: orderflowSignal ? {
      buyPressure: orderflowSignal.buyPressure,
      sellPressure: orderflowSignal.sellPressure,
      imbalance: orderflowSignal.imbalance,
      orderflowBias: orderflowSignal.orderflowBias,
      strength: orderflowSignal.strength,
      summary: orderflowSignal.summary
    } : {
      buyPressure: 0,
      sellPressure: 0,
      imbalance: 0,
      orderflowBias: 'Neutral',
      strength: 'Weak',
      summary: ''
    },
    earlySignal: early.earlySignal,
    earlyType: early.earlyType,
    earlyStrength: early.earlyStrength,
    directionalEarlyBias: early.directionalEarlyBias,
    risk,
    bias,
    urgency
  };
}

function buildAssetList(marketItems, unlockItems, taSignals, socialItems, onchainItems, orderflowItems) {
  const seeded = ['BTC', 'ETH'];
  const detectedAssets = inferAssetsFromMarket(marketItems, unlockItems);
  const socialAssets = socialItems.map((item) => normalize(item.asset));
  const onchainAssets = onchainItems.map((item) => normalize(item.asset));
  const orderflowAssets = orderflowItems.map((item) => normalize(item.asset));
  const taAssets = taSignals.slice(0, TA_ONLY_LIMIT).map((item) => normalize(item.asset));
  const seen = new Set();
  const list = [];

  for (const asset of [...seeded, ...detectedAssets, ...socialAssets, ...onchainAssets, ...orderflowAssets, ...taAssets]) {
    const upper = normalize(asset);
    if (!upper || seen.has(upper)) continue;
    seen.add(upper);
    list.push(upper);
  }

  return list;
}

function main() {
  const marketItems = readJson(MARKET_FILE, []);
  const unlockItems = readJson(UNLOCK_FILE, []);
  const taSignals = readJson(TA_FILE, []);
  const socialItems = readJson(SOCIAL_FILE, []);
  const onchainItems = readJson(ONCHAIN_FILE, []);
  const orderflowItems = readJson(ORDERFLOW_FILE, []);

  const taLookup = new Map(
    taSignals.map((item) => [normalize(item.asset), { trend: item.trend, momentum: item.momentum }])
  );
  const onchainLookup = new Map(
    onchainItems.map((item) => [normalize(item.asset), item])
  );
  const orderflowLookup = new Map(
    orderflowItems.map((item) => [normalize(item.asset), item])
  );

  const assetList = buildAssetList(marketItems, unlockItems, taSignals, socialItems, onchainItems, orderflowItems);
  const repository = assetList.map((asset) => buildRepositoryEntry(asset, marketItems, unlockItems, socialItems, onchainLookup, orderflowLookup, taLookup));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(repository, null, 2));
  console.log(`Wrote ${repository.length} assets to ${OUTPUT_FILE}`);
  console.log(JSON.stringify(repository.slice(0, 6), null, 2));
}

main();
