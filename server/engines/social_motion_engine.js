const fs = require('fs');

const INPUT_FILE = '/var/www/proculus/social-intelligence.json';
const STATE_FILE = '/var/www/proculus/social-motion-state.json';

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
    const mentions = Number(item.mentions) || 0;
    const previous = previousLookup.get(asset) || {};
    const previousMentions = Number(previous.mentions) || 0;
    const previousMentionVelocity = Number(previous.mentionVelocity) || 0;
    const mentionVelocity = mentions - previousMentions;
    const mentionAcceleration = mentionVelocity - previousMentionVelocity;

    return {
      asset,
      mentions,
      mentionVelocity,
      mentionAcceleration,
      sourceTime: item.time || null
    };
  });

  const output = {
    updatedAt: new Date().toISOString(),
    assets
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(output, null, 2));
  console.log(`social motion updated: ${assets.length}`);
}

main();
