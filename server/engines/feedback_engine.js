const fs = require('fs');

const SIGNALS_FILE = '/var/www/proculus/signals-live.json';
const REPOSITORY_FILE = '/var/www/proculus/decision-repository.json';
const OUTPUT_FILE = '/var/www/proculus/signal-feedback.json';

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
  return String(value || '').trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreTa(repo) {
  const trend = normalize(repo?.ta?.trend || 'Neutral');
  const momentum = normalize(repo?.ta?.momentum || 'Neutral');
  let score = 0;
  if (trend === 'Bullish') score += 35;
  else if (trend === 'Bearish') score -= 35;
  if (momentum === 'Oversold') score += 10;
  else if (momentum === 'Overbought') score -= 10;
  return score;
}

function scoreNews(repo) {
  const items = Array.isArray(repo?.news) ? repo.news : [];
  if (!items.length) return 0;
  let total = 0;
  for (const item of items) {
    const bias = normalize(item.bias || 'Neutral');
    const risk = normalize(item.risk || 'Neutral');
    if (bias === 'Bullish') total += 18;
    else if (bias === 'Bearish') total -= 18;
    else if (bias === 'Caution') total -= 8;
    if (risk === 'High') total -= 10;
    else if (risk === 'Medium') total -= 5;
  }
  return clamp(Math.round(total / items.length), -35, 35);
}

function scoreUnlock(repo) {
  const unlock = repo?.unlock;
  if (!unlock) return 0;
  const impact = normalize(unlock.impactLevel || 'Low');
  const daysLeft = Number(unlock.daysLeft);
  let score = impact === 'High' ? -28 : impact === 'Medium' ? -16 : -8;
  if (Number.isFinite(daysLeft) && daysLeft <= 1) score -= 10;
  else if (Number.isFinite(daysLeft) && daysLeft <= 3) score -= 5;
  return clamp(score, -40, 0);
}

function scoreSocial(repo) {
  const items = Array.isArray(repo?.social) ? repo.social : [];
  if (!items.length) return 0;
  let total = 0;
  for (const item of items) {
    const sentiment = normalize(item.sentiment || 'Neutral');
    const hype = Number(item.hypeScore) || 0;
    const riskNarrative = normalize(item.riskNarrative || '').toLowerCase();
    if (sentiment === 'Bullish') total += 12;
    else if (sentiment === 'Bearish') total -= 12;
    if (hype >= 80) total += sentiment === 'Bullish' ? 6 : sentiment === 'Bearish' ? -6 : 0;
    if (/(bearish|sell pressure|security pressure|regulatory pressure|exploit|supply shock)/.test(riskNarrative)) total -= 8;
  }
  return clamp(Math.round(total / items.length), -25, 25);
}

function scoreOnchain(repo) {
  const onchain = repo?.onchain || {};
  const bias = normalize(onchain.onchainBias || 'Neutral');
  const flow = normalize(onchain.exchangeFlow || 'Balanced');
  const dist = normalize(onchain.accumulationDistribution || 'Neutral');
  const active = normalize(onchain.activeAddressTrend || 'Stable');
  let score = 0;
  if (bias === 'Bullish') score += 22;
  else if (bias === 'Bearish') score -= 22;
  if (flow === 'Net Outflow') score += 8;
  else if (flow === 'Net Inflow') score -= 8;
  if (dist === 'Accumulation') score += 10;
  else if (dist === 'Distribution') score -= 10;
  if (active === 'Rising') score += bias === 'Bearish' ? -4 : 6;
  return clamp(score, -35, 35);
}

function scoreOrderflow(repo) {
  const orderflow = repo?.orderflow || {};
  const bias = normalize(orderflow.orderflowBias || 'Neutral');
  const strength = normalize(orderflow.strength || 'Weak');
  if (bias === 'Neutral') return 0;
  const base = bias === 'Bullish' ? 10 : -10;
  const factor = strength === 'Strong' ? 1 : strength === 'Medium' ? 0.6 : 0.3;
  return Math.round(base * factor);
}

function deriveRepositoryScore(repo) {
  return clamp(
    scoreTa(repo) +
    scoreNews(repo) +
    scoreUnlock(repo) +
    scoreSocial(repo) +
    scoreOnchain(repo) +
    scoreOrderflow(repo),
    -100,
    100
  );
}

function deriveSignalDirection(signal) {
  const normalized = normalize(signal);
  if (normalized === 'LONG') return 1;
  if (normalized === 'SHORT') return -1;
  return 0;
}

function deriveRepositoryDirection(score) {
  if (score >= 20) return 1;
  if (score <= -20) return -1;
  return 0;
}

function deriveEvaluationStatus(signal, repo, repoScore) {
  const signalConfidence = Number(signal.confidence) || 0;
  const activeLayers = [
    Array.isArray(repo?.news) && repo.news.length > 0,
    !!repo?.unlock,
    normalize(repo?.ta?.trend || 'Neutral') !== 'Neutral',
    normalize(repo?.onchain?.onchainBias || 'Neutral') !== 'Neutral',
    Array.isArray(repo?.social) && repo.social.length > 0
  ].filter(Boolean).length;

  if (signalConfidence >= 70 || activeLayers >= 3 || Math.abs(repoScore) >= 35) {
    return 'evaluated';
  }
  return 'pending';
}

function deriveOutcome(signal, repoScore, evaluationStatus) {
  if (evaluationStatus !== 'evaluated') return 'neutral';
  const signalDirection = deriveSignalDirection(signal.signal);
  const repoDirection = deriveRepositoryDirection(repoScore);
  if (signalDirection === 0 || repoDirection === 0) return 'neutral';
  return signalDirection === repoDirection ? 'win' : 'loss';
}

function deriveScoreLabel(outcome, signal, repoScore) {
  if (outcome === 'win') return 'correct';
  if (outcome === 'loss') return 'wrong';
  const signalDirection = deriveSignalDirection(signal.signal);
  const repoDirection = deriveRepositoryDirection(repoScore);
  if (signalDirection === 0 || repoDirection === 0) return 'weak';
  return 'weak';
}

function buildSummary(signal, repo, repoScore, outcome, evaluationStatus) {
  const parts = [];
  parts.push(`${signal.asset} ${normalize(signal.signal || 'WAIT')} was captured at ${Number(signal.confidence) || 0}% confidence.`);
  if (signal.classLabel) parts.push(`Class label is ${signal.classLabel}.`);
  if (normalize(repo?.ta?.trend || 'Neutral') !== 'Neutral') {
    parts.push(`TA is ${normalize(repo.ta.trend).toLowerCase()}.`);
  }
  if (repo?.unlock) {
    parts.push(`Unlock pressure is active.`);
  }
  if (normalize(repo?.onchain?.onchainBias || 'Neutral') !== 'Neutral') {
    parts.push(`On-chain bias is ${normalize(repo.onchain.onchainBias).toLowerCase()}.`);
  }
  parts.push(`Repository score is ${repoScore}.`);
  if (evaluationStatus === 'evaluated') {
    parts.push(`Initial learning pass marks this as ${outcome}.`);
  } else {
    parts.push(`Initial learning pass remains pending.`);
  }
  return parts.join(' ');
}

function main() {
  const signals = readJson(SIGNALS_FILE, []);
  const repository = readJson(REPOSITORY_FILE, []);
  const repoLookup = new Map(repository.map((item) => [normalize(item.asset).toUpperCase(), item]));
  const createdAt = new Date().toISOString();

  const feedback = signals.map((signal) => {
    const asset = normalize(signal.asset).toUpperCase();
    const repo = repoLookup.get(asset) || {};
    const repoScore = deriveRepositoryScore(repo);
    const evaluationStatus = deriveEvaluationStatus(signal, repo, repoScore);
    const outcome = deriveOutcome(signal, repoScore, evaluationStatus);
    const scoreLabel = deriveScoreLabel(outcome, signal, repoScore);

    return {
      asset,
      signal: normalize(signal.signal || 'WAIT'),
      confidence: Number(signal.confidence) || 0,
      classLabel: normalize(signal.classLabel || 'Mixed Setup'),
      createdAt,
      evaluationStatus,
      outcome,
      scoreLabel,
      summary: buildSummary(signal, repo, repoScore, outcome, evaluationStatus)
    };
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(feedback, null, 2));
  console.log(JSON.stringify({
    feedbackRecordCount: feedback.length,
    samples: feedback.slice(0, 5)
  }, null, 2));
}

main();
