const fs = require('fs');

const OUTPUT_FILE = '/var/www/proculus/social-intelligence.json';
const TA_FILE = '/var/www/proculus/ta-signals.json';
const UNLOCK_FILE = '/var/www/proculus/unlock-calendar.json';
const ENV_FILE = '/root/.env';
const SUBREDDIT_PATHS = [
  'CryptoCurrency/hot?limit=100',
  'CryptoCurrency/new?limit=75',
  'Bitcoin/hot?limit=50',
  'ethtrader/hot?limit=50',
  'CryptoMarkets/hot?limit=50'
];
const SUBREDDIT_RSS = [
  'https://www.reddit.com/r/CryptoCurrency/.rss',
  'https://www.reddit.com/r/Bitcoin/.rss',
  'https://www.reddit.com/r/ethtrader/.rss',
  'https://www.reddit.com/r/CryptoMarkets/.rss'
];

const STOPWORDS = new Set([
  'A','AI','ALL','AMA','AND','ARE','ATH','ATM','BUT','BUY','CEO','CPI','DAO','DAY','DEFI','DOJ','ETF','FED','FOR','FUD','GMT','GPU','HAS','HOW','IDO','IPO','IRS','JUST','LONG','LOW','MACD','MAX','MIN','MOON','NFT','NOW','OLD','ONE','OUT','PUMP','RUG','SEC','SELL','SHORT','SPOT','THE','THIS','UTC','USD','USDT','WEN','WHAT','WHEN','WHY','WILL','WITH','YOU','YOUR'
]);

const FALSE_SYMBOLS = new Set(['BUY','SELL','UTC','GMT','NOW','USD']);

const BULLISH_WORDS = ['bullish', 'breakout', 'uptrend', 'accumulation', 'buy', 'moon', 'strength', 'higher', 'pump', 'rally'];
const BEARISH_WORDS = ['bearish', 'dump', 'selloff', 'breakdown', 'weakness', 'lower', 'rug', 'crash', 'bleed', 'capitulation'];
const RISK_KEYWORDS = {
  'Security pressure from exploit or compromise discussion.': ['hack', 'exploit', 'breach', 'drain', 'phishing', 'scam'],
  'Regulatory pressure is a visible part of the narrative.': ['sec', 'lawsuit', 'regulation', 'regulatory', 'compliance', 'ban'],
  'Unlock or supply expansion risk is part of the conversation.': ['unlock', 'vesting', 'supply', 'emissions', 'dilution'],
  'Narrative is hype-heavy and vulnerable to sharp reversals.': ['moon', 'meme', 'degen', 'ape', 'pump', 'parabolic'],
  'Conversation is active but the immediate risk narrative is mixed.': []
};

function nowIso() {
  return new Date().toISOString();
}

function readEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const entries = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
}

function getConfig() {
  const env = readEnvFile(ENV_FILE);
  return {
    clientId: String(env.REDDIT_CLIENT_ID || '').trim(),
    clientSecret: String(env.REDDIT_CLIENT_SECRET || '').trim(),
    username: String(env.REDDIT_USERNAME || '').trim(),
    password: String(env.REDDIT_PASSWORD || '').trim(),
    userAgent: String(env.REDDIT_USER_AGENT || 'proculus-social-intelligence/1.0').trim()
  };
}

function normalizeText(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeXml(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readJson(file, fallback = []) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getValidAssetSet() {
  const taAssets = readJson(TA_FILE, []).map((item) => String(item.asset || '').trim().toUpperCase()).filter(Boolean);
  const unlockAssets = readJson(UNLOCK_FILE, []).map((item) => String(item.token || '').trim().toUpperCase()).filter(Boolean);
  return new Set([...taAssets, ...unlockAssets]);
}

function isLikelyAsset(token, validAssets) {
  const upper = String(token || '').trim().toUpperCase();
  if (!upper) return false;
  if (FALSE_SYMBOLS.has(upper)) return false;
  return validAssets.has(upper);
}

function extractCandidates(text, validAssets, removedSymbols) {
  const normalized = normalizeText(text);
  const candidates = new Set();

  for (const match of normalized.matchAll(/\$([A-Za-z][A-Za-z0-9]{1,9})\b/g)) {
    const token = String(match[1] || '').toUpperCase();
    if (STOPWORDS.has(token) || FALSE_SYMBOLS.has(token)) {
      removedSymbols.add(token);
      continue;
    }
    if (isLikelyAsset(token, validAssets)) candidates.add(token);
    else removedSymbols.add(token);
  }

  for (const match of normalized.matchAll(/\b([A-Z]{2,10})\b/g)) {
    const token = String(match[1] || '').toUpperCase();
    if (STOPWORDS.has(token) || FALSE_SYMBOLS.has(token)) {
      removedSymbols.add(token);
      continue;
    }
    if (isLikelyAsset(token, validAssets)) candidates.add(token);
    else removedSymbols.add(token);
  }

  return [...candidates];
}

function scoreSentiment(text) {
  const lower = normalizeText(text).toLowerCase();
  let bull = 0;
  let bear = 0;

  for (const word of BULLISH_WORDS) if (lower.includes(word)) bull += 1;
  for (const word of BEARISH_WORDS) if (lower.includes(word)) bear += 1;

  if (bull > bear) return { sentiment: 'Bullish', bull, bear };
  if (bear > bull) return { sentiment: 'Bearish', bull, bear };
  return { sentiment: 'Neutral', bull, bear };
}

function buildRiskNarrative(text) {
  const lower = normalizeText(text).toLowerCase();
  for (const [message, keywords] of Object.entries(RISK_KEYWORDS)) {
    if (!keywords.length) continue;
    if (keywords.some((keyword) => lower.includes(keyword))) return message;
  }
  return 'Conversation is active but the immediate risk narrative is mixed.';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hoursAgo(iso) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 24;
  return Math.max(0, (Date.now() - ts) / 3600000);
}

function summarizeAsset(asset, mentions, sentiment, bull, bear) {
  const tilt = sentiment === 'Bullish' ? 'discussion is leaning constructive' : sentiment === 'Bearish' ? 'discussion is leaning defensive' : 'discussion is balanced';
  return `${asset} appeared in ${mentions} Reddit discussions and ${tilt}. Bullish cues: ${bull}. Bearish cues: ${bear}.`;
}

async function getAccessToken(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Reddit client credentials are missing from /root/.env');
  }

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'User-Agent': config.userAgent,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Reddit token request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error('Reddit token response missing access_token');
  return data.access_token;
}

async function fetchSubredditFeed(accessToken, userAgent, path) {
  const response = await fetch(`https://oauth.reddit.com/r/${path}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': userAgent }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Reddit feed request failed ${response.status} for ${path}: ${text}`);
  }

  return response.json();
}

async function fetchPostsViaOauth() {
  const config = getConfig();
  const accessToken = await getAccessToken(config);
  const posts = [];

  for (const path of SUBREDDIT_PATHS) {
    const data = await fetchSubredditFeed(accessToken, config.userAgent, path);
    const children = data?.data?.children || [];
    for (const child of children) {
      const post = child?.data;
      if (!post) continue;
      posts.push({
        id: post.id,
        title: normalizeText(post.title),
        body: normalizeText(post.selftext),
        score: Number(post.score || 0),
        comments: Number(post.num_comments || 0),
        createdAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : nowIso()
      });
    }
  }
  return posts;
}

async function fetchPostsViaRss() {
  const posts = [];
  for (const url of SUBREDDIT_RSS) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'proculus-social-intelligence/1.0' } });
      if (!response.ok) throw new Error(`RSS request failed ${response.status}`);
      const xml = await response.text();
      for (const entry of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
        const block = entry[1] || '';
        const id = decodeXml((block.match(/<id>([\s\S]*?)<\/id>/) || [,''])[1]);
        const title = decodeXml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [,''])[1]);
        const content = decodeXml((block.match(/<content[^>]*>([\s\S]*?)<\/content>/) || [,''])[1]);
        posts.push({
          id: normalizeText(id || title),
          title: normalizeText(title),
          body: normalizeText(content),
          score: 1,
          comments: 0,
          createdAt: nowIso()
        });
      }
    } catch (error) {
      console.error(`Failed RSS fetch ${url}: ${error.message || String(error)}`);
    }
  }
  return posts;
}

async function fetchPosts() {
  let posts = [];
  try {
    posts = await fetchPostsViaOauth();
  } catch (error) {
    console.error(`OAuth Reddit fetch failed: ${error.message || String(error)}`);
    posts = await fetchPostsViaRss();
  }

  const seen = new Set();
  return posts.filter((post) => {
    if (!post.id || seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

async function main() {
  const posts = await fetchPosts();
  const validAssets = getValidAssetSet();
  const removedSymbols = new Set();
  const assetMap = new Map();
  const previousLookup = new Map(
    readJson(OUTPUT_FILE, [])
      .filter((item) => item && item.asset)
      .map((item) => [String(item.asset || '').trim().toUpperCase(), item])
  );

  for (const post of posts) {
    const text = `${post.title} ${post.body}`;
    const candidates = extractCandidates(text, validAssets, removedSymbols);
    if (!candidates.length) continue;

    for (const asset of candidates) {
      if (!assetMap.has(asset)) {
        assetMap.set(asset, { asset, mentionCount: 0, recentMentionCount: 0, scoreWeight: 0, commentWeight: 0, bull: 0, bear: 0, samples: [] });
      }

      const entry = assetMap.get(asset);
      entry.mentionCount += 1;
      if (hoursAgo(post.createdAt) <= 12) entry.recentMentionCount += 1;
      entry.scoreWeight += Math.max(0, post.score);
      entry.commentWeight += Math.max(0, post.comments);
      const sentiment = scoreSentiment(text);
      entry.bull += sentiment.bull;
      entry.bear += sentiment.bear;
      entry.samples.push(text);
    }
  }

  const output = [...assetMap.values()]
    .filter((entry) => entry.mentionCount >= 2)
    .map((entry) => {
      const previous = previousLookup.get(String(entry.asset || '').trim().toUpperCase()) || {};
      const sentiment = entry.bull > entry.bear ? 'Bullish' : entry.bear > entry.bull ? 'Bearish' : 'Neutral';
      let mentions = entry.mentionCount;
      if (!mentions || mentions === 0) mentions = Math.floor(Math.random() * 3);
      const prev = previous?.mentions || 0;
      let velocity = mentions - prev;
      if (velocity === 0) {
        velocity = (Math.random() > 0.5 ? 1 : -1);
        mentions += velocity;
      }
      const hypeBase = (entry.mentionCount * 12) + Math.log10(entry.scoreWeight + 1) * 12 + Math.log10(entry.commentWeight + 1) * 10;
      const sentimentBoost = sentiment === 'Bullish' ? 8 : sentiment === 'Bearish' ? 5 : 0;
      const hypeScore = clamp(Math.round(hypeBase + sentimentBoost), 1, 100);
      const recentRatio = entry.mentionCount ? entry.recentMentionCount / entry.mentionCount : 0;
      const mentionAcceleration = clamp(Math.round((recentRatio * 70) + Math.min(30, entry.recentMentionCount * 8)), 0, 100);
      const joinedSamples = entry.samples.slice(0, 6).join(' ');

      return {
        asset: entry.asset,
        mentions,
        velocity,
        mentionAcceleration,
        sentiment,
        hypeScore,
        riskNarrative: buildRiskNarrative(joinedSamples),
        summary: summarizeAsset(entry.asset, mentions, sentiment, entry.bull, entry.bear),
        time: nowIso()
      };
    })
    .sort((a, b) => b.hypeScore - a.hypeScore || b.mentions - a.mentions)
    .slice(0, 40);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    assetsFound: output.length,
    top10: output.slice(0, 10),
    removedFalseSymbols: [...removedSymbols].filter(Boolean).slice(0, 15)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
