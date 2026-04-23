#!/usr/bin/env node
const fs = require('fs');

const OUTPUT_FILE = '/var/www/proculus/market-intelligence.json';
const UNLOCK_FILE = '/var/www/proculus/unlock-calendar.json';
const FEEDS = [
  'https://www.theblock.co/rss.xml',
  'https://news.google.com/rss/search?q=crypto+when:7d&hl=en-US&gl=US&ceid=US:en'
];

function decodeHtml(str = '') {
  return String(str)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'");
}

function stripHtml(str = '') {
  return decodeHtml(String(str))
    .replace(/<a [^>]*>(.*?)<\/a>/gis, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i');
  const match = block.match(re);
  return match ? stripHtml(match[1]) : '';
}

function extractItems(xml, feedUrl) {
  const matches = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  return matches.map((item) => ({
    title: extractTag(item, 'title'),
    link: extractTag(item, 'link'),
    description: extractTag(item, 'description'),
    time: extractTag(item, 'pubDate'),
    feedUrl
  }));
}

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ProculusMarketIntel/1.0' } });
  if (!res.ok) throw new Error(`Feed request failed for ${url}: ${res.status}`);
  return extractItems(await res.text(), url);
}

function normalizeTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function compactSentence(text, maxLen = 180) {
  const clean = stripHtml(text);
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function classify(text) {
  const lower = text.toLowerCase();
  if (/(hack|exploit|breach|attack|stolen|security)/.test(lower)) return 'security';
  if (/(sec|regulat|policy|lawmakers|legal|court|compliance|ban)/.test(lower)) return 'regulation';
  if (/(schwab|blackrock|fidelity|bank|etf|institution|wall street|asset manager)/.test(lower)) return 'institutional';
  if (/(mining|miner|infrastructure|data center|energy|smelter)/.test(lower)) return 'infrastructure';
  if (/(stablecoin|payments|adoption|integration|launch|listing|partnership)/.test(lower)) return 'adoption';
  if (/(macro|rates|inflation|fed|treasury|dollar)/.test(lower)) return 'macro';
  return 'general';
}

function parseSource(item) {
  const title = normalizeTitle(item.title || '');
  const parts = title.split(/\s+-\s+/);
  const feedUrl = String(item.feedUrl || '');
  let source = String(item.source || '');
  let cleanTitle = title;

  if (!source && feedUrl.includes('news.google.com') && parts.length > 1) {
    source = parts[parts.length - 1].trim();
    cleanTitle = parts.slice(0, -1).join(' - ').trim();
  } else if (!source && feedUrl.includes('theblock.co')) {
    source = 'The Block';
  }

  if (!source && item.link) {
    try {
      const host = new URL(item.link).hostname.replace(/^www\./, '');
      source = host;
    } catch {}
  }

  return {
    source: source || 'Market Feed',
    title: cleanTitle || title
  };
}

function buildSummary(title, description) {
  const headline = title;
  const detail = compactSentence(description, 210);
  return detail
    ? `${headline}. ${detail}`
    : `${headline}. The development is being tracked as part of the current crypto news cycle.`;
}

function buildImplication(title, description) {
  switch (classify(`${title} ${description}`)) {
    case 'institutional':
      return 'This points to deeper institutional participation, which can improve market legitimacy and liquidity if follow-through demand materializes.';
    case 'security':
      return 'Security-linked headlines usually pressure sentiment in the short term and can trigger risk reduction until the scope of the damage is clearer.';
    case 'regulation':
      return 'Regulatory headlines tend to affect broad market positioning because they change perceived legal risk and long-term capital access.';
    case 'infrastructure':
      return 'Infrastructure and mining developments matter most for network expansion and long-term operational confidence rather than immediate price moves alone.';
    case 'adoption':
      return 'Adoption-oriented news can support narrative strength and token attention, especially when it expands distribution, usability, or exchange access.';
    case 'macro':
      return 'Macro-sensitive headlines can influence crypto through broad risk appetite, especially for majors that trade closely with liquidity expectations.';
    default:
      return 'The market impact depends on whether this headline changes positioning, liquidity, or narrative conviction beyond the initial news reaction.';
  }
}

function buildWhyItMatters(title, description) {
  switch (classify(`${title} ${description}`)) {
    case 'institutional':
      return 'Institutional headlines matter because they influence how much serious capital may enter the market and how durable demand could become.';
    case 'security':
      return 'Security events matter because they can quickly damage trust, reduce participation, and increase short-term volatility across related assets.';
    case 'regulation':
      return 'Regulatory developments matter because they shape legal certainty, exchange access, and the willingness of large investors to stay active.';
    case 'infrastructure':
      return 'Infrastructure stories matter because they affect network capacity, miner confidence, and the long-term operating base behind the asset class.';
    case 'adoption':
      return 'Adoption stories matter because they expand the real-world surface area where crypto assets can gain users, liquidity, and narrative strength.';
    case 'macro':
      return 'Macro headlines matter because crypto often reacts to broader liquidity conditions and shifts in global risk appetite.';
    default:
      return 'This matters if it changes market attention, capital flows, or the conviction behind existing crypto narratives.';
  }
}

function buildRiskLevel(title, description) {
  switch (classify(`${title} ${description}`)) {
    case 'security': return 'High';
    case 'regulation': return 'High';
    case 'macro': return 'Medium';
    case 'institutional': return 'Medium';
    case 'infrastructure': return 'Medium';
    case 'adoption': return 'Low';
    default: return 'Medium';
  }
}

function buildScenario(title, description) {
  switch (classify(`${title} ${description}`)) {
    case 'institutional':
      return 'Bullish if the headline leads to sustained capital participation; neutral if it remains mostly narrative without measurable flows.';
    case 'security':
      return 'Bearish if damage spreads or confidence weakens further; stabilizing only after losses and counterparties are clearly contained.';
    case 'regulation':
      return 'Volatile until legal clarity improves; bullish only if the outcome lowers structural uncertainty for market participants.';
    case 'infrastructure':
      return 'Constructive long term if the development increases capacity or strategic commitment, but near-term price response may stay muted.';
    case 'adoption':
      return 'Constructive if the story brings new users, integrations, or listings; limited if adoption remains symbolic rather than measurable.';
    case 'macro':
      return 'Risk-on if broader liquidity expectations improve; defensive if macro pressure reduces appetite for speculative assets.';
    default:
      return 'Neutral unless follow-through changes participation, liquidity, or conviction in a meaningful way.';
  }
}

function categorizeItem(title, summary, source) {
  const haystack = [title, summary, source].filter(Boolean).join(' ').toLowerCase();

  if (/(hack|exploit|breach|stolen|scam|phishing|security)/.test(haystack)) return 'Security';
  if (/(sec|regulat|law|legal|compliance|policy|congress|treasury|ban)/.test(haystack)) return 'Regulation';
  if (/(fed|inflation|rates|cpi|macro|recession|economy|dollar|yield)/.test(haystack)) return 'Macro';
  if (/(etf|exchange-traded fund|blackrock|grayscale|invesco|ark)/.test(haystack)) return 'ETF';
  if (/(mining|miner|hashrate|hash rate|btc mine|bitcoin mine)/.test(haystack)) return 'Mining';
  if (/(on-chain|onchain|wallet|whale|staking|validator|address|flows|treasury wallet)/.test(haystack)) return 'On-Chain';
  if (/(liquidation|order book|derivatives|futures|open interest|market structure|volatility|breakout|support|resistance)/.test(haystack)) return 'Market Structure';
  return 'General';
}

function loadUnlockItems() {
  try {
    const raw = fs.readFileSync(UNLOCK_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findRelatedUnlock(item, unlockItems) {
  const haystack = [item.title, item.description].filter(Boolean).join(' ').toUpperCase();
  for (const unlock of unlockItems) {
    const candidates = [unlock.token, unlock.project]
      .filter(Boolean)
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (const candidate of candidates) {
      const re = new RegExp(`(^|[^A-Z0-9])${escapeRegExp(candidate)}([^A-Z0-9]|$)`);
      if (re.test(haystack)) {
        return unlock;
      }
    }
  }
  return null;
}

function hasNewsForUnlock(unlock, items) {
  const candidates = [unlock.token, unlock.project]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase())
    .filter(Boolean);

  return items.some((item) => {
    const haystack = [item.title, item.description].filter(Boolean).join(' ').toUpperCase();
    return candidates.some((candidate) => {
      const re = new RegExp(`(^|[^A-Z0-9])${escapeRegExp(candidate)}([^A-Z0-9]|$)`);
      return re.test(haystack);
    });
  });
}

function mapUnlockImpactToRisk(impactLevel = '') {
  const level = String(impactLevel || 'Low').toLowerCase();
  if (level === 'high') return 'High';
  if (level === 'medium') return 'Medium';
  return 'Low';
}

function buildSyntheticUnlockArticle(unlock) {
  return `${unlock.project} (${unlock.token}) has an upcoming token unlock scheduled for ${new Date(unlock.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. ${unlock.note} The main risk is that newly unlocked supply can reach the market quickly if recipients decide to rotate into liquidity. Timing matters because unlocks can pressure price around the event window even before actual distribution, especially when the impact profile is ${String(unlock.impactLevel || 'Low').toLowerCase()} and positioning is already fragile.`;
}

function buildSyntheticUnlockImplication(unlock) {
  return `${unlock.impactLevel} unlock risk means traders should watch for supply-driven volatility into and shortly after the unlock date.`;
}

function buildSyntheticUnlockWhyItMatters(unlock) {
  return `Token unlocks matter because they can change circulating supply, shift holder incentives, and create short-term sell pressure around known event dates.`;
}

function buildSyntheticUnlockScenario(unlock) {
  return `Base case: volatility increases around the unlock window. Risk rises if liquidity is thin or if recipients are likely to sell part of the released supply.`;
}

function buildSyntheticUnlockItems(unlockItems, fetchedItems) {
  return unlockItems
    .filter((unlock) => !hasNewsForUnlock(unlock, fetchedItems))
    .slice(0, 2)
    .map((unlock) => ({
      title: `${unlock.token} Unlock Approaching`,
      summary: 'Upcoming unlock may impact supply dynamics.',
      implication: buildSyntheticUnlockImplication(unlock),
      whyItMatters: buildSyntheticUnlockWhyItMatters(unlock),
      riskLevel: mapUnlockImpactToRisk(unlock.impactLevel),
      scenario: buildSyntheticUnlockScenario(unlock),
      actionBias: mapActionBias(unlock.impactLevel),
      actionNote: buildActionNote(mapActionBias(unlock.impactLevel)),
      fullArticle: buildSyntheticUnlockArticle(unlock),
      category: 'Unlock',
      source: 'Proculus Engine',
      sourceLink: '',
      relatedUnlock: true,
      relatedUnlockDate: unlock.date,
      relatedUnlockDaysLeft: Number(unlock.daysLeft) || 0,
      relatedUnlockImpactLevel: unlock.impactLevel || 'Low',
      time: unlock.date
    }));
}

function mapActionBias(level) {
  switch (String(level || '').toLowerCase()) {
    case 'high':
      return 'Bearish';
    case 'medium':
      return 'Caution';
    default:
      return 'Neutral';
  }
}

function buildActionNote(actionBias) {
  switch (String(actionBias || '').toLowerCase()) {
    case 'bearish':
      return 'Watch for downside pressure';
    case 'caution':
      return 'Expect volatility, manage risk';
    default:
      return 'No strong directional bias';
  }
}

function buildFullArticle(title, description) {
  const detail = compactSentence(description, 320);
  const implication = buildImplication(title, description);
  const why = buildWhyItMatters(title, description);
  const scenario = buildScenario(title, description);
  return `${title}. ${detail || 'This headline sits inside the current crypto news cycle and should be evaluated for whether it changes participation, liquidity, or narrative strength.'} ${why} ${implication} ${scenario}`.replace(/\s+/g, ' ').trim();
}

function dedupeAndRank(items) {
  const seen = new Set();
  return items
    .filter((item) => item.title && item.time)
    .map((item) => {
      const parsed = parseSource(item);
      return { ...item, source: parsed.source, title: parsed.title };
    })
    .filter((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

async function main() {
  const unlockItems = loadUnlockItems();
  const fetched = [];
  for (const feed of FEEDS) {
    try { fetched.push(...await fetchFeed(feed)); } catch (err) { console.error(String(err)); }
  }

  const rankedItems = dedupeAndRank(fetched).slice(0, 6);
  const items = rankedItems.map((item) => {
    const relatedUnlock = findRelatedUnlock(item, unlockItems);
    return {
      title: item.title,
      summary: buildSummary(item.title, item.description),
      implication: buildImplication(item.title, item.description),
      whyItMatters: buildWhyItMatters(item.title, item.description),
      riskLevel: buildRiskLevel(item.title, item.description),
      scenario: buildScenario(item.title, item.description),
      actionBias: mapActionBias(relatedUnlock?.impactLevel || buildRiskLevel(item.title, item.description)),
      actionNote: buildActionNote(mapActionBias(relatedUnlock?.impactLevel || buildRiskLevel(item.title, item.description))),
      fullArticle: buildFullArticle(item.title, item.description),
      category: categorizeItem(item.title, item.description, item.source),
      source: item.source,
      sourceLink: item.link || '',
      relatedUnlock: Boolean(relatedUnlock),
      relatedUnlockDate: relatedUnlock?.date || '',
      relatedUnlockDaysLeft: Number(relatedUnlock?.daysLeft),
      relatedUnlockImpactLevel: relatedUnlock?.impactLevel || '',
      time: item.time
    };
  });

  const syntheticUnlockItems = buildSyntheticUnlockItems(unlockItems, rankedItems);
  const outputItems = dedupeAndRank([...items, ...syntheticUnlockItems]).slice(0, 8);

  if (outputItems.length < 3) throw new Error(`Expected at least 3 market intelligence items, got ${outputItems.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputItems, null, 2));
  console.log(`Wrote ${outputItems.length} items to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
