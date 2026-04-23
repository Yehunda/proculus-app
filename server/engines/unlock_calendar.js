const fs = require('fs');

const SOURCE_URL = 'https://cryptorank.io/token-unlock';
const OUTPUT_FILE = '/var/www/proculus/unlock-calendar.json';

function extractNextData(html) {
  const marker = '__NEXT_DATA__';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) throw new Error('Could not locate __NEXT_DATA__ in source HTML');
  const jsonStart = html.indexOf('>', markerIndex) + 1;
  const jsonEnd = html.indexOf('</script>', jsonStart);
  if (jsonStart === 0 || jsonEnd === -1) throw new Error('Could not isolate embedded JSON payload');
  return JSON.parse(html.slice(jsonStart, jsonEnd));
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2).replace(/\.00$/, '')}K`;
  return value.toFixed(2).replace(/\.00$/, '');
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return '$0';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2).replace(/\.00$/, '')}K`;
  return `$${value.toFixed(0)}`;
}

function buildType(unlocks) {
  if (!Array.isArray(unlocks) || !unlocks.length) return 'Scheduled Unlock';
  if (unlocks.length === 1) return `${unlocks[0].allocationName || 'Single Allocation'} Unlock`;
  return 'Multi-allocation Unlock';
}

function buildImpact(percent, usdValue) {
  const pct = Number(percent) || 0;
  if (pct >= 10) {
    return {
      impactLevel: 'High',
      impactNote: `Unlock value is about ${pct.toFixed(2)}% of market cap (${formatUsd(usdValue)}).`
    };
  }
  if (pct >= 5) {
    return {
      impactLevel: 'Medium',
      impactNote: `Unlock value is about ${pct.toFixed(2)}% of market cap (${formatUsd(usdValue)}).`
    };
  }
  return {
    impactLevel: 'Low',
    impactNote: `Unlock value is about ${pct.toFixed(2)}% of market cap (${formatUsd(usdValue)}).`
  };
}

function buildNote(unlocks) {
  if (!Array.isArray(unlocks) || !unlocks.length) {
    return 'Upcoming unlock from CryptoRank public token unlock calendar.';
  }

  const ranked = [...unlocks]
    .sort((a, b) => (Number(b.allocationTokens) || 0) - (Number(a.allocationTokens) || 0))
    .slice(0, 2)
    .map((item) => item.allocationName || 'Unknown allocation');

  return `Largest recipient buckets: ${ranked.join(', ')}.`;
}

async function fetchUnlocks() {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProculusUnlockCalendar/1.0)' }
  });
  if (!res.ok) throw new Error(`Unlock source request failed: ${res.status}`);
  const html = await res.text();
  const nextData = extractNextData(html);
  return nextData?.props?.pageProps?.fallbackData?.data || [];
}

function normalizeItems(rawItems) {
  const now = new Date();

  return rawItems
    .filter((item) => item && item.symbol && item.name && item.date && Array.isArray(item.nextUnlocks) && item.nextUnlocks.length)
    .map((item) => {
      const unlockDate = new Date(item.date);
      const totalTokenAmount = item.nextUnlocks.reduce((sum, unlock) => sum + (Number(unlock.allocationTokens) || 0), 0);
      const totalUsdValue = item.nextUnlocks.reduce((sum, unlock) => sum + (Number(unlock.tokens) || 0), 0);
      const impact = buildImpact(item.nextUnlockPercent, totalUsdValue);
      const daysLeft = Math.max(0, Math.ceil((unlockDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      return {
        token: item.symbol,
        project: item.name,
        date: unlockDate.toISOString(),
        daysLeft,
        amount: `${formatCompactNumber(totalTokenAmount)} ${item.symbol} (~${formatUsd(totalUsdValue)})`,
        type: buildType(item.nextUnlocks),
        impactLevel: impact.impactLevel,
        impactNote: impact.impactNote,
        note: buildNote(item.nextUnlocks),
        sortDate: new Date(item.date).getTime(),
        sortImpact: Number(item.nextUnlockPercent) || 0
      };
    })
    .filter((item) => Number.isFinite(item.sortDate) && item.sortDate >= now.getTime() - 24 * 60 * 60 * 1000)
    .sort((a, b) => a.sortDate - b.sortDate || b.sortImpact - a.sortImpact)
    .slice(0, 8)
    .map(({ sortDate, sortImpact, ...item }) => item);
}

async function main() {
  const rawItems = await fetchUnlocks();
  const items = normalizeItems(rawItems);
  if (items.length < 5) throw new Error(`Expected at least 5 unlock items, got ${items.length}`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2));
  console.log(`Wrote ${items.length} items to ${OUTPUT_FILE}`);
  console.log(JSON.stringify(items.slice(0, 3), null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
