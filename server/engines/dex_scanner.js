const fs = require('fs');
const https = require('https');

const INPUT_FILE = '/var/www/proculus/decision-repository.json';
const OUTPUT_FILE = '/var/www/proculus/decision-repository.json';
const TRENDING_URL = 'https://api.dexscreener.com/token-boosts/top/v1';
const TOKEN_PAIRS_URL = 'https://api.dexscreener.com/token-pairs/v1';
const MAX_TOKENS = 30;

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
  return String(value || '').trim();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Accept: 'application/json' } }, (res) => {
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

async function fetchTokenPairs(chainId, tokenAddress) {
  try {
    const url = `${TOKEN_PAIRS_URL}/${encodeURIComponent(chainId)}/${encodeURIComponent(tokenAddress)}`;
    const data = await fetchJson(url);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function buildRepositoryEntry(boost, pair) {
  const symbol = normalize(pair?.baseToken?.symbol || boost?.tokenAddress).toUpperCase();
  return {
    asset: symbol,
    ta: { trend: 'Neutral', momentum: 'Neutral' },
    onchain: { onchainBias: 'Neutral' },
    social: [],
    news: [],
    unlock: null,
    orderflow: { orderflowBias: 'Neutral', strength: 'Weak' },
    dexscreener: {
      chainId: normalize(boost?.chainId || pair?.chainId),
      tokenAddress: normalize(boost?.tokenAddress || pair?.baseToken?.address),
      pairAddress: normalize(pair?.pairAddress),
      dexId: normalize(pair?.dexId),
      priceUsd: normalize(pair?.priceUsd),
      liquidityUsd: Number(pair?.liquidity?.usd || 0),
      volume24h: Number(pair?.volume?.h24 || 0),
      source: 'dexscreener_trending'
    }
  };
}

async function main() {
  const existing = readJson(INPUT_FILE, []);
  const existingAssets = new Set(
    existing.map((item) => normalize(item.asset).toUpperCase()).filter(Boolean)
  );

  const trending = await fetchJson(TRENDING_URL);
  const boosts = Array.isArray(trending) ? trending.slice(0, MAX_TOKENS) : [];
  const additions = [];

  for (const boost of boosts) {
    const chainId = normalize(boost?.chainId);
    const tokenAddress = normalize(boost?.tokenAddress);
    if (!chainId || !tokenAddress) continue;

    const pairs = await fetchTokenPairs(chainId, tokenAddress);
    const pair = pairs[0] || null;
    const candidate = buildRepositoryEntry(boost, pair);
    const liquidityUsd = Number(candidate?.dexscreener?.liquidityUsd || 0);
    const volume24h = Number(candidate?.dexscreener?.volume24h || 0);

    if (liquidityUsd < 50000 || volume24h < 100000) continue;

    if (!candidate.asset || existingAssets.has(candidate.asset)) {
      continue;
    }

    existingAssets.add(candidate.asset);
    additions.push(candidate);
  }

  const merged = [...existing, ...additions];
  writeJson(OUTPUT_FILE, merged);
  console.log(`dex scanner appended ${additions.length} assets; repository now has ${merged.length}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
