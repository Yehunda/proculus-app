const fs = require('fs');

const REPOSITORY_FILE = '/var/www/proculus/decision-repository.json';
const HUNTER_STATE_FILE = '/var/www/proculus/hunter-state.json';
const ORDERFLOW_FILE = '/var/www/proculus/orderflow-signals.json';
const SOCIAL_MOTION_FILE = '/var/www/proculus/social-motion-state.json';
const ONCHAIN_MOTION_FILE = '/var/www/proculus/onchain-motion-state.json';
const HISTORY_FILE = '/var/www/proculus/explosion-history.json';
const OUTPUT_FILE = '/var/www/proculus/explosion-feed.json';
const MAX_HISTORY = 3;
const MAX_OUTPUT = 20;

function readJson(file, fallback = []) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSocialAcceleration(entry, hunterState) {
  if (Number.isFinite(Number(hunterState?.socialAcceleration))) {
    return Number(hunterState.socialAcceleration);
  }
  const items = Array.isArray(entry?.social) ? entry.social : [];
  return items.reduce((max, item) => Math.max(max, Number(item.mentionAcceleration) || 0), 0);
}

function getOnchainAcceleration(entry, hunterState) {
  if (Number.isFinite(Number(hunterState?.onchainAcceleration))) {
    return Number(hunterState.onchainAcceleration);
  }
  return Number(entry?.onchain?.accelerationScore) || 0;
}

function getAnomalyScore(entry, hunterState) {
  if (Number.isFinite(Number(hunterState?.anomalyScore))) {
    return Number(hunterState.anomalyScore);
  }
  return Number(entry?.onchain?.anomalyScore) || 0;
}

function classifyCandidate(currentSocial, motion = {}, orderflow = {}) {
  const socialVelocity = Number(motion?.socialVelocity) || 0;
  const onchainVelocity = Number(motion?.onchainVelocity) || 0;
  const anomalyVelocity = Number(motion?.anomalyVelocity) || 0;
  const socialAcceleration = socialVelocity;
  const onchainAcceleration = onchainVelocity;
  const combinedAcceleration = Number((socialAcceleration + onchainAcceleration).toFixed(2));
  const fundingRate = Number(orderflow?.fundingRate) || 0;
  const openInterest = Number(orderflow?.openInterest) || 0;
  const previousOpenInterest = Number(orderflow?.previousOpenInterest) || 0;
  const liquidationBias = String(orderflow?.liquidationBias || 'Neutral').trim();
  const openInterestIncreasing = previousOpenInterest > 0 && openInterest > previousOpenInterest;

  let status = 'WATCH';
  let strength = Math.abs(combinedAcceleration);

  if (
    socialVelocity > 0 &&
    onchainVelocity > 0 &&
    (openInterestIncreasing || fundingRate <= 0.0001) &&
    combinedAcceleration > 0
  ) {
    status = 'EXPLOSION_FORMING';
    strength += (socialVelocity * 0.6) + (onchainVelocity * 0.8);
    if (openInterestIncreasing) strength += 4;
    if (fundingRate < 0) strength += 3;
  } else if (
    (socialVelocity > 0 && onchainVelocity < 0) ||
    fundingRate > 0.0002
  ) {
    status = 'FAKE_PUMP';
    strength += (socialVelocity * 0.7) + Math.max(anomalyVelocity, 0) + Math.abs(Math.min(onchainVelocity, 0));
    if (fundingRate > 0) strength += 4;
  } else if (
    currentSocial < 50 &&
    onchainVelocity > 0 &&
    fundingRate <= 0
  ) {
    status = 'ACCUMULATION_ZONE';
    strength += (onchainVelocity * 0.9) + Math.max(onchainAcceleration, 0);
    if (fundingRate < 0) strength += 3;
  }

  return {
    status,
    strength: Number(clamp(Math.round(strength), 0, 100)),
    socialVelocity,
    onchainVelocity,
    anomalyVelocity,
    socialAcceleration,
    onchainAcceleration,
    combinedAcceleration,
    fundingRate,
    openInterest,
    previousOpenInterest,
    liquidationBias
  };
}

function buildExplosionReason(status) {
  if (status === 'EXPLOSION_FORMING') return 'Momentum and internal acceleration are rising together';
  if (status === 'FAKE_PUMP') return 'Hype is rising but structure is weakening';
  if (status === 'ACCUMULATION_ZONE') return 'Quiet accumulation with improving internal strength';
  return 'Pattern under observation';
}

function main() {
  const repository = readJson(REPOSITORY_FILE, []);
  const hunterState = readJson(HUNTER_STATE_FILE, []);
  const orderflowSignals = readJson(ORDERFLOW_FILE, []);
  const socialMotionState = readJson(SOCIAL_MOTION_FILE, { assets: [] });
  const onchainMotionState = readJson(ONCHAIN_MOTION_FILE, { assets: [] });
  const history = readJson(HISTORY_FILE, {});

  const hunterLookup = new Map(
    (Array.isArray(hunterState) ? hunterState : [])
      .filter((item) => item && item.asset)
      .map((item) => [normalize(item.asset), item])
  );
  const orderflowLookup = new Map(
    (Array.isArray(orderflowSignals) ? orderflowSignals : [])
      .filter((item) => item && item.asset)
      .map((item) => [normalize(item.asset), item])
  );
  const socialMotionLookup = new Map(
    (Array.isArray(socialMotionState.assets) ? socialMotionState.assets : [])
      .filter((item) => item && item.asset)
      .map((item) => [normalize(item.asset), item])
  );
  const onchainMotionLookup = new Map(
    (Array.isArray(onchainMotionState.assets) ? onchainMotionState.assets : [])
      .filter((item) => item && item.asset)
      .map((item) => [normalize(item.asset), item])
  );

  const nextHistory = {};
  const feed = [];

  for (const entry of Array.isArray(repository) ? repository : []) {
    const asset = normalize(entry?.asset);
    if (!asset) continue;

    const state = hunterLookup.get(asset) || {};
    const orderflow = orderflowLookup.get(asset) || {};
    const socialMotion = socialMotionLookup.get(asset) || {};
    const onchainMotion = onchainMotionLookup.get(asset) || {};
    const assetHistory = history[asset] || {};

    const socialAcceleration = getSocialAcceleration(entry, state);
    const onchainAcceleration = getOnchainAcceleration(entry, state);
    const anomalyScore = getAnomalyScore(entry, state);

    nextHistory[asset] = {
      socialAcceleration: Number(socialMotion.mentionAcceleration) || 0,
      onchainAcceleration: Number(onchainMotion.accelerationVelocity) || 0,
      anomalyScore: Number(onchainMotion.anomalyVelocity) || 0,
      openInterest: Number(orderflow.openInterest) || 0
    };

    const classification = classifyCandidate(socialAcceleration, {
      socialVelocity: Number(socialMotion.mentionVelocity) || 0,
      onchainVelocity: Number(onchainMotion.accelerationVelocity) || 0,
      anomalyVelocity: Number(onchainMotion.anomalyVelocity) || 0
    }, {
      fundingRate: orderflow.fundingRate,
      openInterest: orderflow.openInterest,
      previousOpenInterest: assetHistory.openInterest,
      liquidationBias: orderflow.liquidationBias
    });
    if (classification.status === 'WATCH') continue;

    feed.push({
      asset,
      status: classification.status,
      strength: classification.strength,
      explosionReason: buildExplosionReason(classification.status),
      socialAcceleration,
      onchainAcceleration,
      anomalyScore,
      fundingRate: classification.fundingRate,
      openInterest: classification.openInterest,
      liquidationBias: classification.liquidationBias,
      velocity: {
        social: classification.socialVelocity,
        onchain: classification.onchainVelocity,
        anomaly: classification.anomalyVelocity
      },
      acceleration: {
        social: classification.socialAcceleration,
        onchain: classification.onchainAcceleration,
        combined: classification.combinedAcceleration
      }
    });
  }

  feed.sort((a, b) => {
    const accelDiff = Math.abs(b.acceleration.combined) - Math.abs(a.acceleration.combined);
    if (accelDiff !== 0) return accelDiff;
    return b.strength - a.strength;
  });

  writeJson(HISTORY_FILE, nextHistory);
  writeJson(OUTPUT_FILE, feed.slice(0, MAX_OUTPUT));
  console.log(`explosion feed updated: ${Math.min(feed.length, MAX_OUTPUT)}`);
}

main();
