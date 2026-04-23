const fs = require('fs');

const INPUT_FILE = '/var/www/proculus/decision-repository.json';
const ORDERFLOW_SIGNALS_FILE = '/var/www/proculus/orderflow-signals.json';
const ORDERFLOW_VALIDATION_FILE = '/var/www/proculus/orderflow-validation.json';
const ORDERFLOW_STATE_FILE = '/var/www/proculus/orderflow-state.json';
const OUTPUT_FILE = '/var/www/proculus/signals-live.json';
const HUNTER_OUTPUT_FILE = '/var/www/proculus/hunter-ranking.json';
const HUNTER_STATE_FILE = '/var/www/proculus/hunter-state.json';
const EXPLOSION_OUTPUT_FILE = '/var/www/proculus/explosion-feed.json';

const BASE_WEIGHTS = {
  ta: 0.26,
  news: 0.20,
  unlock: 0.16,
  social: 0.10,
  onchain: 0.20,
  orderflow: 0.08
};

const LARGE_CAPS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE']);

function readJson(file, fallback = []) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

let cachedOrderflowValidationLookup = null;
let cachedOrderflowSignalsLookup = null;
let cachedOrderflowState = null;

function getOrderflowValidationLookup() {
  if (cachedOrderflowValidationLookup) return cachedOrderflowValidationLookup;
  const validation = readJson(ORDERFLOW_VALIDATION_FILE, {});
  const assets = Array.isArray(validation?.assets) ? validation.assets : [];
  cachedOrderflowValidationLookup = new Map(
    assets.map((item) => [normalize(item.asset).toUpperCase(), item])
  );
  return cachedOrderflowValidationLookup;
}

function getOrderflowSignalsLookup() {
  if (cachedOrderflowSignalsLookup) return cachedOrderflowSignalsLookup;
  const signals = readJson(ORDERFLOW_SIGNALS_FILE, []);
  cachedOrderflowSignalsLookup = new Map(
    (Array.isArray(signals) ? signals : []).map((item) => [normalize(item.asset).toUpperCase(), item])
  );
  return cachedOrderflowSignalsLookup;
}

function getOrderflowState() {
  if (cachedOrderflowState) return cachedOrderflowState;
  const state = readJson(ORDERFLOW_STATE_FILE, {});
  cachedOrderflowState = state && typeof state === 'object' ? state : {};
  return cachedOrderflowState;
}

function writeOrderflowState(repository) {
  const previousState = getOrderflowState();
  const nextState = {};

  for (const entry of repository) {
    const asset = normalize(entry?.asset).toUpperCase();
    if (!asset) continue;
    const liveOrderflow = getOrderflowSignalsLookup().get(asset) || {};
    const openInterest = Number(
      entry?.orderflow?.openInterest ?? liveOrderflow.openInterest
    );
    const previousHistory = Array.isArray(previousState?.[asset]?.openInterestHistory)
      ? previousState[asset].openInterestHistory
      : [];
    const nextHistory = Number.isFinite(openInterest) && openInterest > 0
      ? [...previousHistory.slice(-2), openInterest]
      : previousHistory.slice(-3);
    const avgOpenInterest = nextHistory.length
      ? nextHistory.reduce((sum, value) => sum + value, 0) / nextHistory.length
      : Number(previousState?.[asset]?.avgOpenInterest) || 0;

    nextState[asset] = {
      openInterestHistory: nextHistory,
      avgOpenInterest
    };
  }

  cachedOrderflowState = nextState;
  fs.writeFileSync(ORDERFLOW_STATE_FILE, JSON.stringify(nextState, null, 2));
}

function normalize(value) {
  return String(value || '').trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampConfidence(value) {
  return clamp(Math.round(value), 0, 100);
}

function deriveStrength(confidence) {
  if (confidence >= 75) return 'Strong';
  if (confidence >= 50) return 'Medium';
  return 'Weak';
}

function buildUrgencyText(urgency) {
  const text = normalize(urgency || 'Normal');
  return text && text !== 'Normal' ? text : '';
}

function analyzeSocial(entry) {
  const socialItems = Array.isArray(entry?.social) ? entry.social : [];
  if (!socialItems.length) {
    return {
      mentions: 0,
      dominantSentiment: 'Neutral',
      maxHypeScore: 0,
      negativeNarrative: false
    };
  }

  const counts = socialItems.reduce(
    (acc, item) => {
      const sentiment = normalize(item.sentiment || 'Neutral');
      if (sentiment === 'Bullish') acc.bullish += 1;
      else if (sentiment === 'Bearish') acc.bearish += 1;
      else acc.neutral += 1;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0 }
  );

  let dominantSentiment = 'Neutral';
  if (counts.bullish > counts.bearish && counts.bullish >= counts.neutral) dominantSentiment = 'Bullish';
  else if (counts.bearish > counts.bullish && counts.bearish >= counts.neutral) dominantSentiment = 'Bearish';

  const narrativeText = socialItems
    .map((item) => `${item.riskNarrative || ''} ${item.summary || ''}`)
    .join(' ')
    .toLowerCase();
  const negativeNarrative = /(bearish|downside|sell pressure|security pressure|regulatory pressure|exploit|compromise|liquidation|supply shock)/.test(narrativeText);
  const maxHypeScore = socialItems.reduce((max, item) => Math.max(max, Number(item.hypeScore) || 0), 0);
  const mentions = socialItems.reduce((sum, item) => sum + (Number(item.mentions) || 0), 0);

  return { mentions, dominantSentiment, maxHypeScore, negativeNarrative };
}

function getSocialAcceleration(entry) {
  const socialItems = Array.isArray(entry?.social) ? entry.social : [];
  return socialItems.reduce((max, item) => Math.max(max, Number(item.mentionAcceleration) || 0), 0);
}

function computeHunterScore(entry, signal) {
  const earlyAlphaScore = Number(signal?.earlyAlphaScore) || 0;
  const onchainAcceleration = Number(entry?.onchain?.accelerationScore) || 0;
  const socialAcceleration = getSocialAcceleration(entry);
  const anomalyScore = Number(entry?.onchain?.anomalyScore) || 0;

  return clamp(
    Math.round(
      (earlyAlphaScore * 0.40) +
      (onchainAcceleration * 0.25) +
      (socialAcceleration * 0.20) +
      (anomalyScore * 0.15)
    ),
    0,
    100
  );
}

function computeHunterOrderflowBoost(entry, validationItem) {
  if (!validationItem?.usable) {
    return {
      boost: 0,
      orderflowBias: normalize((entry?.orderflow || {}).orderflowBias || 'Neutral'),
      fundingRate: Number((entry?.orderflow || {}).fundingRate) || 0,
      openInterest: Number((entry?.orderflow || {}).openInterest) || 0,
      previousAvgOpenInterest: Number(getOrderflowState()?.[normalize(entry?.asset).toUpperCase()]?.avgOpenInterest) || 0,
      liquidationBias: normalize((entry?.orderflow || {}).liquidationBias || 'Neutral'),
      usable: false
    };
  }

  const asset = normalize(entry?.asset).toUpperCase();
  const liveOrderflow = getOrderflowSignalsLookup().get(asset) || {};
  const orderflow = {
    ...(entry?.orderflow || {}),
    ...liveOrderflow
  };
  const orderflowBias = normalize(orderflow.orderflowBias || 'Neutral');
  const fundingRate = Number(orderflow.fundingRate) || 0;
  const openInterest = Number(orderflow.openInterest) || 0;
  const liquidationBias = normalize(orderflow.liquidationBias || 'Neutral');
  const previousAvgOpenInterest = Number(getOrderflowState()?.[asset]?.avgOpenInterest) || 0;
  const usable = Boolean(validationItem?.usable);

  let boost = 0;
  let directionalBias = 'Neutral';

  if (fundingRate <= -0.0001 && orderflowBias === 'Bullish') {
    boost += 4;
    directionalBias = 'Bullish';
  } else if (fundingRate >= 0.0001 && orderflowBias === 'Bearish') {
    boost += 4;
    directionalBias = 'Bearish';
  }

  if (
    (directionalBias === 'Bullish' && liquidationBias === 'Short Liquidations') ||
    (directionalBias === 'Bearish' && liquidationBias === 'Long Liquidations')
  ) {
    boost += 3;
  }

  if (
    usable &&
    previousAvgOpenInterest > 0 &&
    openInterest > previousAvgOpenInterest * 1.05
  ) {
    boost += 3;
  }

  return {
    boost: clamp(boost, 0, 10),
    orderflowBias,
    fundingRate,
    openInterest,
    previousAvgOpenInterest,
    liquidationBias,
    usable
  };
}

function computeHunterDeltaAdjustment(deltaSocialAcceleration, deltaOnchainAcceleration, deltaAnomalyScore, socialAcceleration) {
  let adjustment = 0;
  let patternLabel = '';

  if (deltaSocialAcceleration >= 10 && deltaOnchainAcceleration >= 10) {
    adjustment += 14;
    patternLabel = 'Parabolic Candidate';
  }

  if (deltaSocialAcceleration >= 10 && (deltaOnchainAcceleration <= -5 || deltaAnomalyScore >= 8)) {
    adjustment -= 14;
    patternLabel = 'Rug Pull Risk';
  }

  if (socialAcceleration < 50 && deltaOnchainAcceleration >= 10 && !patternLabel) {
    adjustment += 8;
    patternLabel = 'Accumulation';
  }

  return { adjustment, patternLabel };
}

function computeTaScore(entry) {
  const trend = normalize(entry?.ta?.trend || 'Neutral');
  const momentum = normalize(entry?.ta?.momentum || 'Neutral');
  let score = 0;

  if (trend === 'Bullish') score += 60;
  else if (trend === 'Bearish') score -= 60;

  if (momentum === 'Oversold') score += 20;
  else if (momentum === 'Overbought') score -= 20;

  return {
    score: clamp(score, -100, 100),
    trend,
    momentum
  };
}

function computeNewsScore(entry) {
  const news = Array.isArray(entry?.news) ? entry.news : [];
  if (!news.length) {
    return { score: 0, count: 0 };
  }

  const total = news.reduce((sum, item) => {
    let itemScore = 0;
    const bias = normalize(item.bias || 'Neutral');
    const risk = normalize(item.risk || 'Neutral');

    if (bias === 'Bullish') itemScore += 35;
    else if (bias === 'Bearish') itemScore -= 35;
    else if (bias === 'Caution') itemScore -= 15;

    if (risk === 'High') itemScore -= 20;
    else if (risk === 'Medium') itemScore -= 10;
    else if (risk === 'Low') itemScore += 5;

    if (item.relatedUnlock) itemScore -= 15;
    return sum + itemScore;
  }, 0);

  return {
    score: clamp(total / news.length, -100, 100),
    count: news.length
  };
}

function computeUnlockScore(entry) {
  const unlock = entry?.unlock;
  if (!unlock) {
    return { score: 0, daysLeft: null, impactLevel: 'None' };
  }

  let score = 0;
  const impactLevel = normalize(unlock.impactLevel || 'Low');
  const daysLeft = Number(unlock.daysLeft);

  if (impactLevel === 'High') score -= 70;
  else if (impactLevel === 'Medium') score -= 40;
  else score -= 15;

  if (Number.isFinite(daysLeft) && daysLeft <= 1) score -= 20;
  else if (Number.isFinite(daysLeft) && daysLeft <= 3) score -= 10;

  return {
    score: clamp(score, -100, 100),
    daysLeft,
    impactLevel
  };
}

function computeSocialScore(entry) {
  const social = analyzeSocial(entry);
  let score = 0;

  if (social.dominantSentiment === 'Bullish') score += 35;
  else if (social.dominantSentiment === 'Bearish') score -= 35;

  if (social.negativeNarrative) score -= 20;

  if (social.maxHypeScore >= 80) {
    if (social.dominantSentiment === 'Bullish') score += 15;
    else if (social.dominantSentiment === 'Bearish' || social.negativeNarrative) score -= 15;
    else score += 5;
  } else if (social.maxHypeScore >= 50) {
    if (social.dominantSentiment === 'Bullish') score += 8;
    else if (social.dominantSentiment === 'Bearish' || social.negativeNarrative) score -= 8;
  }

  return {
    score: clamp(score, -100, 100),
    ...social
  };
}

function computeOnchainScore(entry) {
  const onchain = entry?.onchain || {};
  let score = 0;
  const trend = normalize(onchain.onchainBias || onchain.trend || 'Neutral');
  const anomaly = normalize(onchain.whaleActivity || onchain.anomaly || 'None');
  const exchangeFlow = normalize(onchain.exchangeFlow || 'Balanced');
  const accumulationDistribution = normalize(onchain.accumulationDistribution || 'Neutral');
  const holderConcentration = normalize(onchain.holderConcentration || 'Unknown');
  const activeAddressTrend = normalize(onchain.activeAddressTrend || 'Stable');
  const newAddressTrend = normalize(onchain.newAddressTrend || 'Stable');
  const volumeAcceleration = Number(onchain.volumeAcceleration) || 0;
  const transactionAcceleration = Number(onchain.transactionAcceleration) || 0;
  const buyerGrowth = Number(onchain.buyerGrowth) || 0;
  const accelerationScore = Number(onchain.accelerationScore) || 0;
  const anomalyScore = Number(onchain.anomalyScore) || 0;

  if (trend === 'Bullish') score += 45;
  else if (trend === 'Bearish') score -= 45;

  if (exchangeFlow === 'Net Outflow') score += 15;
  else if (exchangeFlow === 'Net Inflow') score -= 15;

  if (accumulationDistribution === 'Accumulation') score += 18;
  else if (accumulationDistribution === 'Distribution') score -= 18;

  if (holderConcentration === 'High') score -= 15;
  else if (holderConcentration === 'Medium') score -= 8;

  if (activeAddressTrend === 'Rising') score += trend === 'Bearish' ? -8 : 10;
  else if (activeAddressTrend === 'Falling') score += trend === 'Bearish' ? 8 : -10;

  if (newAddressTrend === 'Rising') score += trend === 'Bearish' ? -6 : 8;
  else if (newAddressTrend === 'Falling') score += trend === 'Bearish' ? 6 : -8;

  if (anomaly === 'High') {
    score += trend === 'Bearish' ? -20 : 20;
  } else if (anomaly === 'Medium') {
    score += trend === 'Bearish' ? -10 : 10;
  }

  if (anomalyScore >= 80) {
    score += trend === 'Bearish' ? -20 : trend === 'Bullish' ? 20 : 0;
  } else if (anomalyScore >= 60) {
    score += trend === 'Bearish' ? -12 : trend === 'Bullish' ? 12 : 0;
  }

  if (accelerationScore >= 60) {
    score += trend === 'Bearish' ? -12 : trend === 'Bullish' ? 12 : 4;
  }

  return {
    score: clamp(score, -100, 100),
    trend,
    anomaly,
    accumulationDistribution,
    holderConcentration,
    activeAddressTrend,
    newAddressTrend,
    volumeAcceleration,
    transactionAcceleration,
    buyerGrowth,
    accelerationScore,
    summary: normalize(onchain.summary || '')
  };
}

function computeOrderflowScore(entry, validationItem) {
  const asset = normalize(entry?.asset).toUpperCase();
  const liveOrderflow = getOrderflowSignalsLookup().get(asset) || {};
  const orderflow = {
    ...(entry?.orderflow || {}),
    ...liveOrderflow
  };
  const bias = normalize(orderflow.orderflowBias || 'Neutral');
  const strength = normalize(orderflow.strength || 'Weak');
  const imbalance = Number(orderflow.imbalance) || 0;
  const fundingRate = Number(orderflow.fundingRate) || 0;
  const openInterest = Number(orderflow.openInterest) || 0;
  const liquidationBias = normalize(orderflow.liquidationBias || 'Neutral');
  const previousAvgOpenInterest = Number(getOrderflowState()?.[asset]?.avgOpenInterest) || 0;

  const applySmartAdjustment = (rawScore) => {
    const directionalAnchor = rawScore !== 0
      ? Math.sign(rawScore)
      : bias === 'Bullish'
        ? 1
        : bias === 'Bearish'
          ? -1
          : Math.sign(imbalance);

    let fundingAdjustment = 0;
    if (fundingRate > 0.0001) fundingAdjustment = -5;
    else if (fundingRate < -0.0001) fundingAdjustment = 5;

    let openInterestAdjustment = 0;
    if (
      previousAvgOpenInterest > 0 &&
      openInterest > previousAvgOpenInterest * 1.05
    ) {
      openInterestAdjustment = directionalAnchor === 0 ? 2 : directionalAnchor * 4;
    }

    let liquidationAdjustment = 0;
    if (liquidationBias === 'Long Liquidations') liquidationAdjustment = -8;
    else if (liquidationBias === 'Short Liquidations') liquidationAdjustment = 8;

    const smartAdjustment = clamp(
      fundingAdjustment + openInterestAdjustment + liquidationAdjustment,
      -15,
      15
    );

    return {
      score: clamp(rawScore + smartAdjustment, -100, 100),
      smartAdjustment,
      fundingAdjustment,
      openInterestAdjustment,
      liquidationAdjustment
    };
  };

  if (!validationItem || !validationItem.usable) {
    return {
      score: 0,
      used: false,
      bias,
      strength,
      agreementStatus: normalize(validationItem?.agreementStatus || 'Neutral'),
      qualityFlag: normalize(validationItem?.qualityFlag || 'Unavailable'),
      qualityScore: Number(validationItem?.qualityScore) || 0,
      fundingRate,
      openInterest,
      previousAvgOpenInterest,
      liquidationBias,
      smartAdjustment: 0
    };
  }

  const agreementStatus = normalize(validationItem.agreementStatus || 'Neutral');
  const qualityFlag = normalize(validationItem.qualityFlag || 'Healthy');
  const qualityScore = Number(validationItem.qualityScore) || 0;

  let baseScore = 0;
  if (bias === 'Bullish') baseScore = 40;
  else if (bias === 'Bearish') baseScore = -40;
  else if (bias === 'Neutral' && strength === 'Weak') {
    const signedImbalance = clamp(imbalance * 100, -5, 5);
    const adjusted = applySmartAdjustment(signedImbalance);
    return {
      score: adjusted.score,
      used: true,
      bias,
      strength,
      agreementStatus,
      qualityFlag,
      qualityScore,
      fundingRate,
      openInterest,
      previousAvgOpenInterest,
      liquidationBias,
      smartAdjustment: adjusted.smartAdjustment
    };
  } else {
    const adjusted = applySmartAdjustment(0);
    return {
      score: adjusted.score,
      used: true,
      bias,
      strength,
      agreementStatus,
      qualityFlag,
      qualityScore,
      fundingRate,
      openInterest,
      previousAvgOpenInterest,
      liquidationBias,
      smartAdjustment: adjusted.smartAdjustment
    };
  }

  const strengthFactor =
    strength === 'Strong' ? 1 :
    strength === 'Medium' ? 0.65 :
    0.35;

  let agreementFactor = 0.25;
  if (agreementStatus === 'Agreement' && qualityFlag === 'Healthy') agreementFactor = 1;
  else if (agreementStatus === 'Conflict' && qualityFlag === 'Healthy') agreementFactor = 0.5;
  else if (agreementStatus === 'Neutral' && strength === 'Weak') agreementFactor = 0.15;

  const qualityFactor = clamp(qualityScore / 100, 0.5, 1);
  const rawScore = clamp(baseScore * strengthFactor * agreementFactor * qualityFactor, -100, 100);
  const adjusted = applySmartAdjustment(rawScore);

  return {
    score: adjusted.score,
    used: true,
    bias,
    strength,
    agreementStatus,
    qualityFlag,
    qualityScore,
    fundingRate,
    openInterest,
    previousAvgOpenInterest,
    liquidationBias,
    smartAdjustment: adjusted.smartAdjustment
  };
}

function computeEarlyAlpha(entry, components, signal, finalScore) {
  const socialAcceleration = getSocialAcceleration(entry);
  const onchainAcceleration = Number(components.onchain.accelerationScore) || 0;
  const onchainStrength = clamp(Math.abs(components.onchain.score), 0, 100);
  const anomalyScore = Number(entry?.onchain?.anomalyScore) || 0;
  const taCompression = entry.earlySignal && entry.earlyType === 'TA Compression' ? 100 : 0;
  const socialHypePenalty = components.social.maxHypeScore >= 90 && socialAcceleration < 40 ? 15 : 0;
  const quietAccumulationBoost =
    components.social.maxHypeScore < 50 &&
    components.onchain.score > 25 &&
    onchainAcceleration > 45
      ? 12
      : 0;

  const earlyAlphaScore = clamp(
    Math.round(
      (onchainStrength * 0.28) +
      (anomalyScore * 0.24) +
      (socialAcceleration * 0.18) +
      (onchainAcceleration * 0.18) +
      (taCompression * 0.12) -
      socialHypePenalty +
      quietAccumulationBoost
    ),
    0,
    100
  );

  const alignedFactors = [
    onchainStrength >= 35 || onchainAcceleration >= 45,
    socialAcceleration >= 35 && components.social.maxHypeScore < 95,
    taCompression >= 60 || Math.abs(components.ta.score) >= 40,
    components.news.score >= -10,
    components.unlock.score > -60
  ].filter(Boolean).length;

  const parabolicReady =
    earlyAlphaScore >= 60 &&
    alignedFactors >= 3 &&
    finalScore >= 5 &&
    signal !== 'SHORT' &&
    components.onchain.trend === 'Bullish' &&
    components.onchain.accumulationDistribution === 'Accumulation' &&
    components.onchain.activeAddressTrend === 'Rising' &&
    onchainAcceleration > 50 &&
    components.social.maxHypeScore < 80;

  return {
    earlyAlphaScore,
    socialAcceleration,
    onchainAcceleration,
    parabolicReady,
    quietAccumulationBoost
  };
}

function getDirection(score) {
  if (score >= 20) return 'Bullish';
  if (score <= -20) return 'Bearish';
  return 'Neutral';
}

function normalizeWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, Number((value / total).toFixed(4))])
  );
}

function getAdaptiveWeights(entry, components) {
  const weights = { ...BASE_WEIGHTS };
  const asset = normalize(entry.asset);

  if (components.social.maxHypeScore >= 80 && !entry.unlock && components.news.count <= 1) {
    weights.social += 0.08;
    weights.ta -= 0.03;
    weights.news -= 0.02;
    weights.unlock -= 0.02;
    weights.onchain -= 0.01;
    weights.orderflow -= 0.00;
  }

  if (LARGE_CAPS.has(asset)) {
    weights.ta += 0.07;
    weights.onchain += 0.06;
    weights.news += 0.01;
    weights.social -= 0.05;
    weights.unlock -= 0.05;
    weights.orderflow -= 0.04;
  }

  if (entry.unlock && Number.isFinite(components.unlock.daysLeft) && components.unlock.daysLeft <= 3) {
    weights.unlock += 0.08;
    weights.ta -= 0.03;
    weights.news -= 0.02;
    weights.social -= 0.03;
    weights.onchain -= 0.00;
    weights.orderflow -= 0.00;
  }

  return normalizeWeights(weights);
}

function computeConsensusAndConflict(componentScores) {
  const directions = Object.values(componentScores).map(getDirection);
  const bullish = directions.filter((dir) => dir === 'Bullish').length;
  const bearish = directions.filter((dir) => dir === 'Bearish').length;
  const neutral = directions.filter((dir) => dir === 'Neutral').length;

  let consensusBonus = 0;
  if (bullish >= 3 || bearish >= 3) consensusBonus = bullish === 4 || bearish === 4 ? 12 : 8;

  let conflictPenalty = 0;
  if (bullish > 0 && bearish > 0) {
    conflictPenalty = 8 + (Math.min(bullish, bearish) * 4);
    if (bullish >= 2 && bearish >= 2) conflictPenalty += 5;
  }

  return { consensusBonus, conflictPenalty, bullish, bearish, neutral };
}

function buildRiskTypes(entry, components) {
  const types = [];
  if (entry.unlock || components.unlock.score < 0) types.push('Unlock');
  if (components.social.negativeNarrative || components.social.maxHypeScore >= 70) types.push('Sentiment');
  if (components.social.maxHypeScore >= 80 && components.news.count === 0) types.push('Liquidity');
  if (
    components.onchain.score < -20 ||
    components.onchain.accumulationDistribution === 'Distribution' ||
    components.onchain.holderConcentration === 'High' ||
    (components.onchain.anomaly && components.onchain.anomaly !== 'None' && components.onchain.anomaly !== 'Neutral')
  ) types.push('On-chain');
  if (components.orderflow.used && components.orderflow.agreementStatus === 'Conflict') types.push('Liquidity');
  return types;
}

function buildClassLabel(entry, components, finalScore, signal, consensus, earlyAlpha) {
  if (earlyAlpha.parabolicReady) {
    return 'Parabolic Candidate';
  }

  if (components.ta.score > 40 && components.social.maxHypeScore >= 70 && components.onchain.score <= 0 && (components.news.score < 0 || components.unlock.score < 0) && signal !== 'LONG') {
    return 'Fake Breakout';
  }

  if (signal === 'LONG' && components.ta.score > 40 && components.onchain.score > 20 && consensus.bullish >= 3 && components.social.maxHypeScore < 80) {
    return 'Breakout Candidate';
  }

  if (components.social.maxHypeScore >= 80 && components.social.dominantSentiment === 'Bullish' && components.onchain.score > 0) {
    return 'Speculative Runner';
  }

  if (components.social.maxHypeScore >= 80 && (components.social.negativeNarrative || signal !== 'LONG')) {
    return 'Overhyped Risk';
  }

  if (entry.earlySignal && entry.earlyType === 'TA Compression' && components.onchain.accumulationDistribution !== 'Distribution') {
    return 'Silent Accumulation';
  }

  if (signal === 'SHORT' && entry.earlySignal && entry.directionalEarlyBias === 'Bearish') {
    return 'Overhyped Risk';
  }

  return 'Mixed Setup';
}

function buildReason(entry, components, finalScore, signal, consensus, urgencyText, adaptiveWeights, classLabel, earlyAlpha) {
  const fragments = [];

  if (components.ta.trend !== 'Neutral' || components.ta.momentum !== 'Neutral') {
    fragments.push(`TA shows ${components.ta.trend.toLowerCase()} trend with ${components.ta.momentum.toLowerCase()} momentum.`);
  }

  if (components.news.count > 0) {
    fragments.push(`News engine contributed ${components.news.count} active item${components.news.count === 1 ? '' : 's'}.`);
  }

  if (entry.unlock) {
    fragments.push(`Unlock risk remains active${urgencyText ? ` (${urgencyText})` : ''}.`);
  }

  if (components.social.maxHypeScore > 0) {
    fragments.push(`Social sentiment reads ${components.social.dominantSentiment.toLowerCase()} with hype score ${components.social.maxHypeScore}.`);
  }

  if (components.onchain.score !== 0 || components.onchain.anomaly !== 'None') {
    fragments.push(`On-chain signal reads ${components.onchain.trend.toLowerCase()} with anomaly ${components.onchain.anomaly.toLowerCase()}, ${components.onchain.accumulationDistribution.toLowerCase()} behavior, holder concentration ${components.onchain.holderConcentration.toLowerCase()}, active addresses ${components.onchain.activeAddressTrend.toLowerCase()}, new addresses ${components.onchain.newAddressTrend.toLowerCase()}.`);
    if (components.onchain.summary) {
      fragments.push(components.onchain.summary);
    }
  }

  if (components.orderflow.used) {
    fragments.push(`Orderflow validation is ${components.orderflow.agreementStatus.toLowerCase()} with ${components.orderflow.qualityFlag.toLowerCase()} status, bias ${components.orderflow.bias.toLowerCase()}, strength ${components.orderflow.strength.toLowerCase()}, quality score ${components.orderflow.qualityScore}.`);
  }

  if (entry.earlySignal) {
    fragments.push(`Early detection flagged ${entry.earlyType.toLowerCase()} with strength ${entry.earlyStrength}.`);
  }

  if (earlyAlpha.earlyAlphaScore > 0) {
    fragments.push(`Early alpha score is ${earlyAlpha.earlyAlphaScore} with on-chain acceleration ${earlyAlpha.onchainAcceleration} and social acceleration ${earlyAlpha.socialAcceleration}.`);
  }

  if (consensus.consensusBonus > 0) {
    fragments.push('Multiple motors are aligned, adding consensus support.');
  }

  if (consensus.conflictPenalty > 0) {
    fragments.push('Motor disagreement is reducing conviction.');
  }

  fragments.push(`Adaptive weights are TA ${adaptiveWeights.ta.toFixed(2)}, News ${adaptiveWeights.news.toFixed(2)}, Unlock ${adaptiveWeights.unlock.toFixed(2)}, Social ${adaptiveWeights.social.toFixed(2)}, On-chain ${adaptiveWeights.onchain.toFixed(2)}, Orderflow ${adaptiveWeights.orderflow.toFixed(2)}.`);
  fragments.push(`Classified as ${classLabel}.`);
  fragments.push(`Combined weighted score is ${finalScore.toFixed(1)}, which resolves to ${signal}.`);

  return fragments.join(' ');
}

function buildSignal(entry) {
  const asset = normalize(entry.asset || 'UNKNOWN');
  const urgencyText = buildUrgencyText(entry.urgency);
  const orderflowValidation = getOrderflowValidationLookup().get(asset.toUpperCase()) || null;
  const components = {
    ta: computeTaScore(entry),
    news: computeNewsScore(entry),
    unlock: computeUnlockScore(entry),
    social: computeSocialScore(entry),
    onchain: computeOnchainScore(entry),
    orderflow: computeOrderflowScore(entry, orderflowValidation)
  };

  const adaptiveWeights = getAdaptiveWeights(entry, components);
  const weightedScore =
    (components.ta.score * adaptiveWeights.ta) +
    (components.news.score * adaptiveWeights.news) +
    (components.unlock.score * adaptiveWeights.unlock) +
    (components.social.score * adaptiveWeights.social) +
    (components.onchain.score * adaptiveWeights.onchain) +
    (components.orderflow.score * adaptiveWeights.orderflow);

  const consensus = computeConsensusAndConflict({
    ta: components.ta.score,
    news: components.news.score,
    unlock: components.unlock.score,
    social: components.social.score,
    onchain: components.onchain.score,
    orderflow: components.orderflow.score
  });

  const finalScore = weightedScore + consensus.consensusBonus - consensus.conflictPenalty;

  let signal = 'WAIT';
  if (finalScore >= 25) signal = 'LONG';
  else if (finalScore <= -25) signal = 'SHORT';

  const earlyAlpha = computeEarlyAlpha(entry, components, signal, finalScore);
  const antiHypeBlocked =
    components.social.maxHypeScore > 85 &&
    (components.onchain.score <= 10 || components.onchain.accumulationDistribution !== 'Accumulation');

  const earlyBoost = entry.earlySignal ? Math.round(Number(entry.earlyStrength || 0) * 0.12) : 0;
  const antiHypePenalty = antiHypeBlocked ? 15 : 0;
  const confidenceBase = 35 + Math.abs(finalScore) + consensus.consensusBonus - Math.round(consensus.conflictPenalty / 2) + earlyBoost + Math.round(earlyAlpha.earlyAlphaScore * 0.08) - antiHypePenalty;
  const confidence = clampConfidence(confidenceBase);
  const strength = deriveStrength(confidence);

  const riskTypes = buildRiskTypes(entry, components);
  const riskNote = riskTypes.includes('Unlock')
    ? 'High volatility due to unlock event'
    : riskTypes.length
      ? `${riskTypes.join(', ')} risk is elevated`
      : 'Standard execution risk applies';

  let classLabel = buildClassLabel(entry, components, finalScore, signal, consensus, earlyAlpha);

  if (
    classLabel !== 'Parabolic Candidate' &&
    classLabel !== 'Rug Pull Risk' &&
    (confidence < 60 || Math.abs(finalScore) < 20)
  ) {
    signal = 'WAIT';
  }

  if (
    signal === 'WAIT' &&
    classLabel !== 'Parabolic Candidate' &&
    classLabel !== 'Rug Pull Risk'
  ) {
    classLabel = 'Filtered Setup';
  }

  let entryHint = 'No clear setup';
  let timingHint = 'Wait for confirmation';
  if (signal === 'SHORT') {
    entryHint = 'Look for resistance rejection';
    timingHint = 'Next 12–24h';
  } else if (signal === 'LONG') {
    entryHint = 'Look for support bounce';
    timingHint = 'Next 12–24h';
  }

  const reason = buildReason(entry, components, finalScore, signal, consensus, urgencyText, adaptiveWeights, classLabel, earlyAlpha);

  return {
    asset,
    signal,
    confidence,
    strength,
    entryHint,
    timingHint,
    riskNote,
    reason,
    classLabel,
    riskTypes,
    earlyAlphaScore: earlyAlpha.earlyAlphaScore,
    convergenceScore: 0
  };
}

function applyConvergenceScores(signals, hunterRanking, explosionFeed) {
  const hunterAssets = new Set((Array.isArray(hunterRanking) ? hunterRanking : []).map((item) => normalize(item?.asset).toUpperCase()).filter(Boolean));
  const explosionAssets = new Set((Array.isArray(explosionFeed) ? explosionFeed : []).map((item) => normalize(item?.asset).toUpperCase()).filter(Boolean));

  return signals.map((signal) => {
    if (signal.signal === 'WAIT') {
      return {
        ...signal,
        convergenceScore: 0
      };
    }

    let convergenceScore = 1;
    if (hunterAssets.has(normalize(signal.asset).toUpperCase())) convergenceScore += 1;
    if (explosionAssets.has(normalize(signal.asset).toUpperCase())) convergenceScore += 1;

    return {
      ...signal,
      convergenceScore
    };
  });
}

function buildHunterRanking(repository, signals, previousHunterState = new Map()) {
  const nextHunterState = [];
  const items = repository.map((entry) => {
    const signal = signals.find((item) => item.asset === entry.asset);
    if (!signal) return null;
    const orderflowValidation = getOrderflowValidationLookup().get(normalize(entry.asset).toUpperCase()) || null;
    const baseHunterScore = computeHunterScore(entry, signal);
    const hunterOrderflow = computeHunterOrderflowBoost(entry, orderflowValidation);
    const socialAcceleration = getSocialAcceleration(entry);
    const onchainAcceleration = Number(entry?.onchain?.accelerationScore) || 0;
    const anomalyScore = Number(entry?.onchain?.anomalyScore) || 0;
    const previous = previousHunterState.get(entry.asset) || {};
    const previousHunterScore = Number(previous.hunterScore) || 0;
    const previousSocialAcceleration = Number(previous.socialAcceleration) || 0;
    const previousOnchainAcceleration = Number(previous.onchainAcceleration) || 0;
    const previousAnomalyScore = Number(previous.anomalyScore) || 0;
    const deltaScore = baseHunterScore - previousHunterScore;
    const deltaSocialAcceleration = socialAcceleration - previousSocialAcceleration;
    const deltaOnchainAcceleration = onchainAcceleration - previousOnchainAcceleration;
    const deltaAnomalyScore = anomalyScore - previousAnomalyScore;
    const deltaProfile = computeHunterDeltaAdjustment(
      deltaSocialAcceleration,
      deltaOnchainAcceleration,
      deltaAnomalyScore,
      socialAcceleration
    );
    const hunterScore = clamp(baseHunterScore + deltaProfile.adjustment + hunterOrderflow.boost, 0, 100);

    let hunterClassLabel = signal.classLabel;
    if (deltaProfile.patternLabel === 'Parabolic Candidate') {
      hunterClassLabel = 'Parabolic Candidate';
    } else if (deltaProfile.patternLabel === 'Rug Pull Risk') {
      hunterClassLabel = 'Rug Pull Risk';
    } else if (deltaProfile.patternLabel === 'Accumulation') {
      hunterClassLabel = 'Accumulation';
    }

    const hunterReason =
      hunterClassLabel === 'Parabolic Candidate'
        ? 'Social and onchain acceleration are rising together'
        : hunterClassLabel === 'Rug Pull Risk'
          ? 'Hype is rising while structure weakens'
          : hunterClassLabel === 'Accumulation'
            ? 'Quiet setup with rising onchain strength'
            : 'Early opportunity under watch';

    nextHunterState.push({
      asset: entry.asset,
      hunterScore: baseHunterScore,
      socialAcceleration,
      onchainAcceleration,
      anomalyScore
    });

    return {
      asset: entry.asset,
      hunterScore,
      deltaScore,
      deltaSocialAcceleration,
      deltaOnchainAcceleration,
      deltaAnomalyScore,
      previousHunterScore,
      socialAcceleration,
      previousSocialAcceleration,
      onchainAcceleration,
      previousOnchainAcceleration,
      earlyAlphaScore: signal.earlyAlphaScore || 0,
      classLabel: hunterClassLabel,
      signal: signal.signal,
      confidence: signal.confidence,
      hunterReason
    };
  }).filter(Boolean);

  return {
    ranking: items
    .filter((item) => item.hunterScore >= 30)
    .sort((a, b) => (b.hunterScore - a.hunterScore) || (b.confidence - a.confidence))
    .slice(0, 30),
    nextHunterState
  };
}

function main() {
  const repository = readJson(INPUT_FILE, []);
  if (!repository.length) {
    throw new Error('Decision repository is empty or unavailable.');
  }
  const previousHunterState = new Map(
    readJson(HUNTER_STATE_FILE, [])
      .filter((item) => item && item.asset)
      .map((item) => [item.asset, item])
  );

  const baseSignals = repository.map(buildSignal);
  const hunter = buildHunterRanking(repository, baseSignals, previousHunterState);
  fs.writeFileSync(HUNTER_OUTPUT_FILE, JSON.stringify(hunter.ranking, null, 2));
  fs.writeFileSync(HUNTER_STATE_FILE, JSON.stringify(hunter.nextHunterState, null, 2));
  const explosionFeed = readJson(EXPLOSION_OUTPUT_FILE, []);
  const signals = applyConvergenceScores(baseSignals, hunter.ranking, explosionFeed);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(signals, null, 2));
  writeOrderflowState(repository);
  console.log(`Wrote ${signals.length} signals to ${OUTPUT_FILE}`);
  console.log(JSON.stringify({ signals: signals.slice(0, 3), hunterRanking: hunter.ranking.slice(0, 5) }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSignal,
  computeTaScore,
  computeNewsScore,
  computeUnlockScore,
  computeSocialScore,
  computeOnchainScore,
  computeOrderflowScore,
  computeHunterScore,
  computeConsensusAndConflict,
  getAdaptiveWeights
};
