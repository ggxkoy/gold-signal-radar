import { analyse, type RuleStat } from '@/lib/gold-rules';
import type { LiveNews } from '@/lib/live-news';

export type MarketMomentum = {
  changeCnyGram: number;
  hours: number;
} | null;

export type MarketSentiment = {
  score: number;
  label: '强烈偏多' | '偏多' | '中性' | '偏空' | '强烈偏空';
  confidence: '较低' | '中等' | '较高';
  relevantNews: number;
  components: {
    macro: number;
    riskAndFlow: number;
    momentum: number;
  };
  drivers: string[];
};

const MACRO_LABELS = new Set([
  '降息预期', '降息预期升温', '降息预期降温', '实际利率走低', '实际利率走高',
  '美元走弱', '美元走强', '通胀升温', '通胀降温', '央行购金', '央行售金',
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function componentScore(net: number, total: number, maximum: number, fullCoverageAt: number) {
  if (!total) return 0;
  const agreement = net / total;
  const coverage = Math.min(1, total / fullCoverageAt);
  return maximum * agreement * coverage;
}

function sentimentLabel(score: number): MarketSentiment['label'] {
  if (score >= 60) return '强烈偏多';
  if (score >= 20) return '偏多';
  if (score <= -60) return '强烈偏空';
  if (score <= -20) return '偏空';
  return '中性';
}

export function deriveMarketSentiment(
  items: LiveNews[],
  ruleStats: RuleStat[] = [],
  momentum: MarketMomentum = null,
): MarketSentiment {
  let macroNet = 0;
  let macroTotal = 0;
  let riskNet = 0;
  let riskTotal = 0;
  let relevantNews = 0;
  const driverWeights = new Map<string, number>();
  const now = Date.now();

  for (const item of items.slice(0, 12)) {
    const result = analyse(item.title, ruleStats);
    if (!result.hits.length) continue;
    relevantNews += 1;
    const ageHours = Math.max(0, (now - Date.parse(item.publishedAt)) / 3_600_000);
    const recency = clamp(1 - ageHours / 96, 0.35, 1);

    for (const hit of result.hits) {
      const signedWeight = hit.effectiveWeight * recency * (hit.direction === '涨' ? 1 : -1);
      driverWeights.set(hit.label, (driverWeights.get(hit.label) ?? 0) + signedWeight);
      if (MACRO_LABELS.has(hit.label)) {
        macroNet += signedWeight;
        macroTotal += Math.abs(signedWeight);
      } else {
        riskNet += signedWeight;
        riskTotal += Math.abs(signedWeight);
      }
    }
  }

  const macro = componentScore(macroNet, macroTotal, 50, 14);
  const riskAndFlow = componentScore(riskNet, riskTotal, 25, 8);
  const priceMomentum = momentum
    ? 25 * clamp(momentum.changeCnyGram / 3.8, -1, 1)
    : 0;
  const score = Math.round(clamp(macro + riskAndFlow + priceMomentum, -100, 100));
  const totalWeight = macroTotal + riskTotal;
  const agreement = totalWeight ? Math.abs(macroNet + riskNet) / totalWeight : 0;
  const confidenceScore = clamp(
    18 + Math.min(relevantNews, 6) * 8 + (momentum ? 15 : 0) + agreement * 20,
    0,
    100,
  );
  const confidence = confidenceScore >= 72 ? '较高' : confidenceScore >= 45 ? '中等' : '较低';
  const drivers = [...driverWeights.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([label, value]) => `${label}${value >= 0 ? '利多' : '利空'}`);

  return {
    score,
    label: sentimentLabel(score),
    confidence,
    relevantNews,
    components: {
      macro: Math.round(macro),
      riskAndFlow: Math.round(riskAndFlow),
      momentum: Math.round(priceMomentum),
    },
    drivers,
  };
}
