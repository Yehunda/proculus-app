const fs = require('fs');

const ORDERFLOW_FILE = '/var/www/proculus/orderflow-signals.json';
const TA_FILE = '/var/www/proculus/ta-signals.json';
const SIGNALS_FILE = '/var/www/proculus/signals-live.json';
const OUTPUT_FILE = '/var/www/proculus/orderflow-validation.json';

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

function classifyAgreement(orderflowBias, taTrend) {
  const bias = normalize(orderflowBias);
  const trend = normalize(taTrend);
  if (bias === 'Neutral' || trend === 'Neutral') return 'Neutral';
  if (bias === trend) return 'Agreement';
  return 'Conflict';
}

function evaluateQuality(orderflowItem, taTrend, signal) {
  const imbalance = Math.abs(Number(orderflowItem.imbalance) || 0);
  const totalPressure = (Number(orderflowItem.buyPressure) || 0) + (Number(orderflowItem.sellPressure) || 0);
  const strength = normalize(orderflowItem.strength);
  const bias = normalize(orderflowItem.orderflowBias);
  const agreementStatus = classifyAgreement(bias, taTrend);
  const signalStrength = normalize(signal?.strength || 'Weak');

  const flags = [];
  let qualityScore = 100;
  const seriousFlags = new Set([
    'Thin book',
    'Low pressure',
    'Conflict with weak conviction',
    'Strength too weak',
    'Undersized strength',
    'Strong label on thin book'
  ]);

  if (totalPressure < 50000) {
    flags.push('Low pressure');
    qualityScore -= 35;
  } else if (totalPressure < 150000) {
    flags.push('Thin book');
    qualityScore -= 18;
  }
  if (imbalance < 0.08 && bias !== 'Neutral') {
    flags.push('Weak threshold');
    qualityScore -= 18;
  }
  if (imbalance > 0.45 && strength !== 'Strong') {
    flags.push('Undersized strength');
    qualityScore -= 12;
  }
  if (imbalance >= 0.18 && imbalance < 0.35 && strength === 'Weak') {
    flags.push('Strength too weak');
    qualityScore -= 12;
  }
  if (imbalance < 0.18 && strength === 'Strong') {
    flags.push('Strength too strong');
    qualityScore -= 25;
  }
  if (agreementStatus === 'Conflict' && signalStrength === 'Strong') {
    flags.push('Conflicts with TA');
    qualityScore -= 15;
  }
  if (totalPressure < 150000 && strength === 'Strong') {
    flags.push('Strong label on thin book');
    qualityScore -= 35;
  }
  if (agreementStatus === 'Conflict' && strength === 'Weak') {
    flags.push('Conflict with weak conviction');
    qualityScore -= 25;
  } else if (agreementStatus === 'Conflict') {
    qualityScore -= 10;
  } else if (agreementStatus === 'Neutral') {
    qualityScore -= 5;
  }

  qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

  const hasSeriousWeakness = flags.some((flag) => seriousFlags.has(flag));
  let usable = qualityScore >= 80 && !hasSeriousWeakness;
  if (totalPressure < 150000 && strength === 'Strong') usable = false;
  if (agreementStatus === 'Conflict' && strength === 'Weak') usable = false;

  const qualityFlag = flags.length ? flags.join(', ') : 'Healthy';
  const summary = `${orderflowItem.asset} orderflow is ${agreementStatus.toLowerCase()} with TA (${taTrend || 'Neutral'}). ${qualityFlag}.`;

  return {
    agreementStatus,
    qualityFlag,
    qualityScore,
    usable,
    summary,
    noisy: flags.length > 0
  };
}

function main() {
  const orderflow = readJson(ORDERFLOW_FILE, []);
  const taSignals = readJson(TA_FILE, []);
  const liveSignals = readJson(SIGNALS_FILE, []);

  const taLookup = new Map(taSignals.map((item) => [normalize(item.asset).toUpperCase(), normalize(item.trend || 'Neutral')]));
  const signalLookup = new Map(liveSignals.map((item) => [normalize(item.asset).toUpperCase(), item]));

  const results = orderflow.map((item) => {
    const asset = normalize(item.asset).toUpperCase();
    const taTrend = taLookup.get(asset) || 'Neutral';
    const signal = signalLookup.get(asset) || null;
    const evaluation = evaluateQuality(item, taTrend, signal);

    return {
      asset,
      orderflowBias: normalize(item.orderflowBias || 'Neutral'),
      strength: normalize(item.strength || 'Weak'),
      taTrend,
      agreementStatus: evaluation.agreementStatus,
      qualityFlag: evaluation.qualityFlag,
      qualityScore: evaluation.qualityScore,
      usable: evaluation.usable,
      summary: evaluation.summary
    };
  });

  const agreementCount = results.filter((item) => item.agreementStatus === 'Agreement').length;
  const conflictCount = results.filter((item) => item.agreementStatus === 'Conflict').length;
  const noisyAssets = results.filter((item) => item.qualityFlag !== 'Healthy');
  const usableAssets = results.filter((item) => item.usable);
  const unusableAssets = results.filter((item) => !item.usable);

  const output = {
    totalAssetCount: results.length,
    agreementCount,
    conflictCount,
    noisyAssetCount: noisyAssets.length,
    usableAssetCount: usableAssets.length,
    unusableAssetCount: unusableAssets.length,
    flaggedAssets: noisyAssets.slice(0, 10),
    assets: results
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    totalAssetCount: output.totalAssetCount,
    agreementCount,
    conflictCount,
    noisyAssetCount: noisyAssets.length,
    usableAssetCount: usableAssets.length,
    unusableAssetCount: unusableAssets.length,
    flaggedAssets: output.flaggedAssets.slice(0, 5)
  }, null, 2));
}

main();
