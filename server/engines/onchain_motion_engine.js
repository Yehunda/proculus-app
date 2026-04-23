const fs = require('fs');

const INPUT_FILE = '/var/www/proculus/onchain-signals.json';
const STATE_FILE = '/var/www/proculus/onchain-motion-state.json';

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

function main() {
  const current = readJson(INPUT_FILE, []);
  const previousState = readJson(STATE_FILE, { updatedAt: null, assets: [] });
  const previousLookup = new Map(
    (Array.isArray(previousState.assets) ? previousState.assets : [])
      .filter((item) => item && item.asset)
      .map((item) => [normalize(item.asset), item])
  );

  const assets = (Array.isArray(current) ? current : []).map((item) => {
    const asset = normalize(item.asset);
    const accelerationScore = Number(item.accelerationScore) || 0;
    const anomalyScore = Number(item.anomalyScore) || 0;
    const previous = previousLookup.get(asset) || {};
    const previousAccelerationScore = Number(previous.accelerationScore) || 0;
    const previousAnomalyScore = Number(previous.anomalyScore) || 0;
    const accelerationVelocity = accelerationScore - previousAccelerationScore;
    const anomalyVelocity = anomalyScore - previousAnomalyScore;

    return {
      asset,
      accelerationScore,
      anomalyScore,
      accelerationVelocity,
      anomalyVelocity
    };
  });

  const output = {
    updatedAt: new Date().toISOString(),
    assets
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(output, null, 2));
  console.log(`onchain motion updated: ${assets.length}`);
}

main();
