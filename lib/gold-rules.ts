export type Direction = '涨' | '跌';

export type RuleStat = {
  ruleLabel: string;
  samples: number;
  hits: number;
  accuracy: number | null;
  multiplier: number;
};

export type Rule = {
  label: string;
  direction: Direction;
  weight: number;
  reason: string;
  pattern: RegExp;
};

export type RuleHit = Rule & {
  effectiveWeight: number;
  samples: number;
  accuracy: number | null;
};

export const RULES: Rule[] = [
  { label: '降息预期', direction: '涨', weight: 3, reason: '降低持有黄金的机会成本', pattern: /降息|鸽派|宽松|收益率(?:下跌|下降|回落)|rate cuts?|dovish|yields? (?:fall|drop|retreat)/i },
  { label: '降息预期升温', direction: '涨', weight: 4, reason: '未来利率路径更宽松', pattern: /上调(?:美联储)?降息|降息预期(?:升温|增加)|提前降息|rate.?cut (?:bets|odds|expectations) (?:rise|increase)/i },
  { label: '实际利率走低', direction: '涨', weight: 4, reason: '无息资产的相对吸引力上升', pattern: /实际利率(?:下降|走低|转负)|负利率|real yields? (?:fall|drop|turn negative)/i },
  { label: '美元走弱', direction: '涨', weight: 3, reason: '美元计价黄金获得支撑', pattern: /美元(?:下跌|走弱|回落)|美元指数(?:下跌|走弱)|dollar (?:falls|weakens|slides)/i },
  { label: '央行购金', direction: '涨', weight: 4, reason: '结构性买盘增加', pattern: /央行(?:增持|购买|买入|购金)|黄金储备(?:增加|上升)|central banks? (?:buy|add|boost).{0,20}gold/i },
  { label: '避险升温', direction: '涨', weight: 3, reason: '不确定性推升避险需求', pattern: /战争|冲突升级|空袭|制裁|地缘政治|金融危机|银行危机|衰退|硬着陆|war|conflict escalat|airstrike|sanctions?|geopolit|financial crisis|banking crisis|recession|hard landing/i },
  { label: '通胀升温', direction: '涨', weight: 2, reason: '购买力对冲需求可能上升', pattern: /通胀(?:上升|升温|超预期|反弹)|CPI超预期|油价暴涨|inflation (?:rises|heats|accelerates|above)|cpi (?:beats|above)|oil (?:surges|spikes)/i },
  { label: 'ETF流入', direction: '涨', weight: 3, reason: '投资资金直接增加黄金需求', pattern: /黄金ETF(?:流入|增持)|资金流入黄金|投机买盘|gold (?:etf|fund).{0,16}(?:inflow|adds?)/i },
  { label: '加息预期', direction: '跌', weight: 3, reason: '提高持有黄金的机会成本', pattern: /加息|鹰派|紧缩|收益率(?:上涨|上升|走高)|rate hikes?|hawkish|yields? (?:rise|climb|jump)/i },
  { label: '降息预期降温', direction: '跌', weight: 4, reason: '利率可能在高位维持更久', pattern: /下调(?:美联储)?降息|降息预期(?:降温|减少)|推迟降息|延后降息|rate.?cut (?:bets|odds|expectations) (?:fall|fade)|delay(?:ed)? rate cuts?/i },
  { label: '实际利率走高', direction: '跌', weight: 4, reason: '有息资产相对更有吸引力', pattern: /实际利率(?:上升|走高|转正)|real yields? (?:rise|climb|turn positive)/i },
  { label: '美元走强', direction: '跌', weight: 3, reason: '美元计价黄金通常承压', pattern: /美元(?:上涨|走强)|美元指数(?:上涨|走强)|dollar (?:rises|strengthens|gains)/i },
  { label: '央行售金', direction: '跌', weight: 4, reason: '官方供给增加、结构性需求减弱', pattern: /央行(?:减持|出售|卖出|售金)|黄金储备(?:下降|减少)|central banks? (?:sell|cut|reduce).{0,20}gold/i },
  { label: '风险缓和', direction: '跌', weight: 3, reason: '避险溢价回落', pattern: /停火|和平协议|冲突缓和|风险偏好回升|软着陆|ceasefire|peace deal|conflict eases|risk appetite improves|soft landing/i },
  { label: '通胀降温', direction: '跌', weight: 2, reason: '购买力对冲需求减弱', pattern: /通胀(?:下降|降温|低于预期)|CPI低于预期|油价大跌|inflation (?:falls|cools|below)|cpi (?:misses|below)|oil (?:plunges|slides)/i },
  { label: 'ETF流出', direction: '跌', weight: 3, reason: '投资资金撤出黄金市场', pattern: /黄金ETF(?:流出|减持)|资金流出黄金|获利了结|gold (?:etf|fund).{0,16}(?:outflow|cuts?)/i },
];

export function analyse(text: string, stats: RuleStat[] = []) {
  const statsByRule = new Map(stats.map((stat) => [stat.ruleLabel, stat]));
  const hits: RuleHit[] = RULES.filter((rule) => rule.pattern.test(text)).map((rule) => {
    const stat = statsByRule.get(rule.label);
    return {
      ...rule,
      effectiveWeight: rule.weight * (stat?.multiplier ?? 1),
      samples: stat?.samples ?? 0,
      accuracy: stat?.accuracy ?? null,
    };
  });
  const up = hits.filter((hit) => hit.direction === '涨').reduce((sum, hit) => sum + hit.effectiveWeight, 0);
  const down = hits.filter((hit) => hit.direction === '跌').reduce((sum, hit) => sum + hit.effectiveWeight, 0);
  const score = up - down;
  const direction: Direction = score >= 0 ? '涨' : '跌';
  const total = up + down;
  const agreement = total === 0 ? 0 : Math.abs(score) / total;
  const signalStrength = total === 0 ? 0 : Math.min(90, Math.round(20 + agreement * 48 + Math.min(total, 12) * 1.8));
  return { hits, up, down, score, direction, signalStrength };
}

export function ruleMultiplier(samples: number, hits: number) {
  if (samples < 20) return 1;
  const smoothedAccuracy = (hits + 2) / (samples + 4);
  return Math.min(1.25, Math.max(0.75, smoothedAccuracy / 0.5));
}
