// The browser, historical replay and scheduled paper account share these rules.
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const VERSION = 'q1-20260926';
export const DEFAULTS = Object.freeze({ capital: 10000, buyBelow: 930, minMove: 3.8, maxAllocation: 0.25, riskFraction: 0.005, stopPct: 0.02, rewardRisk: 1.5, fee: 0.001, slippage: 0.0005, maxHoldDays: 10 });
const finitePositive = n => Number.isFinite(n) && n > 0;
export function validConfig(c) {
  return finitePositive(c.capital) && finitePositive(c.buyBelow) && finitePositive(c.minMove) && c.maxAllocation > 0 && c.maxAllocation <= 1 && c.riskFraction > 0 && c.riskFraction <= .05 && c.stopPct > 0 && c.stopPct < 1 && c.rewardRisk >= 1 && c.fee >= 0 && c.fee < .05 && c.slippage >= 0 && c.slippage < .05;
}
export function pointsOf(points, now = Infinity) {
  const map = new Map();
  for (const p of points || []) {
    if (!finitePositive(p.cnyGram) || !Number.isFinite(p.capturedAt) || p.capturedAt > now) continue;
    // Multiple refreshes in a minute are one observation; never backfill gaps.
    const key = Math.floor(p.capturedAt / 60000);
    if (!map.has(key) || p.capturedAt < map.get(key).capturedAt) map.set(key, p);
  }
  return [...map.values()].sort((a, b) => a.capturedAt - b.capturedAt);
}
export function isFresh(point, now) {
  const quoteAt = point?.quoteAt ?? point?.capturedAt;
  return finitePositive(point?.cnyGram) && Number.isFinite(quoteAt) && now - quoteAt <= HOUR && now - quoteAt >= -5 * 60000;
}
export function features(points, now) {
  const p = pointsOf(points, now), latest = p.at(-1);
  if (!latest) return { ready: false, reason: '等待有效报价' };
  const t = latest.capturedAt;
  const anchor = p.filter(x => x.capturedAt <= t - 6 * HOUR && x.capturedAt >= t - 9 * HOUR).at(-1);
  const day = p.filter(x => x.capturedAt >= t - DAY);
  const recent = p.filter(x => x.capturedAt >= t - 3 * DAY);
  const ready = !!anchor && day.length >= 4 && day[0].capturedAt <= t - 18 * HOUR;
  return { ready, reason: ready ? '' : '等待覆盖至少18小时的4个快照及6小时参照价', latest, change6h: anchor ? latest.cnyGram - anchor.cnyGram : null, mean24h: day.reduce((s,x) => s+x.cnyGram,0)/day.length, low: Math.min(...recent.map(x=>x.cnyGram)), high: Math.max(...recent.map(x=>x.cnyGram)), count: day.length, windowStart: recent[0].capturedAt };
}
export function entrySignal(points, config = DEFAULTS, now = Date.now()) {
  if (!validConfig(config)) throw new Error('Invalid strategy parameters');
  const f = features(points, now);
  if (!f.latest || !isFresh(f.latest, now)) return { action: '暂停', ready: false, reason: '报价超过1小时未更新，暂停产生新交易', features: f };
  if (!f.ready) return { action: '观望', ready: false, reason: f.reason, features: f };
  const checks = [
    { label: `价格低于 ¥${config.buyBelow}/克`, ok: f.latest.cnyGram < config.buyBelow },
    { label: `较约6小时前反弹至少 ¥${config.minMove}/克`, ok: f.change6h >= config.minMove - 1e-8 },
    { label: '价格站上近24小时快照均价', ok: f.latest.cnyGram > f.mean24h },
  ];
  const enter = checks.every(x=>x.ok);
  return { action: enter ? '模拟准备入场' : '观望', ready: true, enter, checks, features:f, reason: enter ? '三项条件满足，等待下一笔有效报价模拟成交' : checks.filter(x=>!x.ok).map(x=>x.label).join('；') };
}

// Explicit direction phrases only. Ambiguous inflation/geopolitical mentions abstain.
const NEWS_RULES = [
  ['降息预期增强', 1, /降息预期(?:升温|增加)|上调.{0,8}降息|提前降息|rate[ -]?cut (?:bets|odds|expectations) (?:rise|increase)|\bdovish\b/i],
  ['降息预期减弱', -1, /降息预期(?:降温|减少)|下调.{0,8}降息|推迟降息|rate[ -]?cut (?:bets|odds|expectations) (?:fall|fade)|delay(?:ed)? rate cuts?|\bhawkish\b/i],
  ['美元走弱', 1, /美元(?:指数)?(?:下跌|走弱|回落)|\bdollar (?:falls|weakens|slides)\b/i],
  ['美元走强', -1, /美元(?:指数)?(?:上涨|走强)|\bdollar (?:rises|strengthens|gains)\b/i],
  ['收益率下降', 1, /(?:实际利率|美债收益率)(?:下降|走低|回落)|\b(?:real )?yields? (?:fall|drop|retreat)\b/i],
  ['收益率上升', -1, /(?:实际利率|美债收益率)(?:上升|走高|上涨)|\b(?:real )?yields? (?:rise|climb|jump)\b/i],
  ['央行购金', 1, /央行(?:增持|购买|买入|购金)|central banks? (?:buy|add|boost).{0,20}gold/i],
  ['央行售金', -1, /央行(?:减持|出售|卖出|售金)|central banks? (?:sell|cut|reduce).{0,20}gold/i],
  ['避险升级', 1, /冲突升级|战争爆发|\bconflict escalat|\bwar breaks out\b/i],
  ['风险缓和', -1, /停火协议达成|达成和平协议|\bceasefire (?:agreed|deal)|\bpeace deal\b/i],
  ['黄金ETF流入', 1, /黄金ETF(?:流入|增持)|gold (?:etf|fund).{0,16}inflow/i],
  ['黄金ETF流出', -1, /黄金ETF(?:流出|减持)|gold (?:etf|fund).{0,16}outflow/i],
];
export function analyseNews(text) {
  const clauses = String(text).split(/[。；;!?！？\n]/);
  const hits = NEWS_RULES.filter(([, , pattern]) => clauses.some(c => !/(?:并未|没有|否认|不会|未能|not |no |unlikely|denies?)/i.test(c) && pattern.test(c))).map(([label,sign])=>({label,sign}));
  const score = hits.reduce((s,x)=>s+x.sign,0);
  const agreement = hits.length ? Math.abs(score)/hits.length : 0;
  return { hits, score, direction: !hits.length || agreement < .6 ? '观望' : score > 0 ? '涨' : '跌', agreement };
}
export function newsSnapshot(items, now) {
  const seen=new Set(); const selected=[];
  for(const item of items||[]) {
    const t=Date.parse(item.publishedAt),key=String(item.title).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    if(!Number.isFinite(t)||t>now||now-t>DAY||seen.has(key))continue;
    seen.add(key);const a=analyseNews(item.title);if(a.direction!=='观望')selected.push({...item, ...a});
  }
  return { items:selected, score:selected.reduce((s,x)=>s+Math.sign(x.score),0), sources:new Set(selected.map(x=>x.source)).size };
}
export function auditLegacy(predictions) {
  const settled=(predictions||[]).filter(p=>p.settledAt&&p.correct!=null);
  const timely=settled.filter(p=>p.settledAt>=p.dueAt && p.settledAt-p.dueAt<=HOUR);
  const hits=settled.filter(p=>p.correct).length;
  return { total:predictions?.length||0, directional:settled.length,hits,rawAccuracy:settled.length?hits/settled.length:null,late:settled.length-timely.length,timely:timely.length,timelyAccuracy:timely.length?timely.filter(p=>p.correct).length/timely.length:null,baselineDown:settled.length?settled.filter(p=>p.actualDirection==='跌').length/settled.length:null };
}
export function advanceForecasts(old, points, items, now, c=DEFAULTS) {
  const p=pointsOf(points,now),latest=p.at(-1),rows=(old||[]).map(x=>({...x}));
  for(const r of rows) {
    if(r.status!=='等待'||now<r.dueAt)continue;
    const exit=p.find(x=>x.capturedAt>=r.dueAt&&x.capturedAt<=r.dueAt+HOUR&&(x.quoteAt??x.capturedAt)>=r.dueAt&&isFresh(x,x.capturedAt));
    if(exit){const move=exit.cnyGram-r.entry;const actual=move>=c.minMove-1e-8?'涨':move<=-c.minMove+1e-8?'跌':'震荡';Object.assign(r,{status:'已结算',exit:exit.cnyGram,settledAt:exit.capturedAt,actual,move,correct:actual===r.direction});}
    else if(now>r.dueAt+HOUR)r.status='缺失到期报价';
  }
  if(!latest||!isFresh(latest,now)||now-latest.capturedAt>60000||rows.some(r=>now-r.at<DAY))return rows;
  const f=features(p,now),n=newsSnapshot(items,now);
  const priceDirection=f.ready&&Math.abs(f.change6h)>=c.minMove-1e-8?(f.change6h>0?'涨':'跌'):'观望';
  const agrees=priceDirection!=='观望'&&n.items.length>=2&&n.sources>=2&&Math.sign(n.score)===(priceDirection==='涨'?1:-1)&&Math.abs(n.score)/n.items.length>=.6;
  rows.push({version:VERSION,at:now,dueAt:now+DAY,entry:latest.cnyGram,entryQuoteAt:latest.quoteAt??latest.capturedAt,direction:agrees?priceDirection:'观望',status:agrees?'等待':'不预测',reasons:[f.ready?`6小时变化 ${f.change6h.toFixed(2)} 元/克`:f.reason,`24小时有效新闻 ${n.items.length} 条 / ${n.sources} 个来源`],news:n.items.map(x=>({title:x.title,link:x.link,publishedAt:x.publishedAt,source:x.source}))});
  return rows;
}
export function forecastMetrics(rows) {
  const settled=rows.filter(x=>x.status==='已结算'),directional=settled.filter(x=>x.actual!=='震荡'),made=rows.filter(x=>x.direction!=='观望');
  return { observations:rows.length,made:made.length,coverage:rows.length?made.length/rows.length:0,settled:settled.length,effective:directional.length,neutral:settled.length-directional.length,expired:rows.filter(x=>x.status==='缺失到期报价').length,accuracy:directional.length?directional.filter(x=>x.correct).length/directional.length:null,allOutcomeAccuracy:settled.length?settled.filter(x=>x.correct).length/settled.length:null,alwaysUpAccuracy:directional.length?directional.filter(x=>x.actual==='涨').length/directional.length:null };
}
export function newAccount(config=DEFAULTS,at=Date.now()) {return { version:VERSION,config:{...config},startedAt:at,cash:config.capital,position:null,pending:null,lastAt:null,highWater:config.capital,maxDrawdown:0,fees:0,trades:[],events:[],curve:[] };}
function netEquity(a,price){return a.cash+(a.position?a.position.grams*price*(1-a.config.slippage)*(1-a.config.fee):0);}
export function stepAccount(previous,points,now) {
  const a=structuredClone(previous),c=a.config,p=pointsOf(points,now),point=p.at(-1);
  if(!point||point.capturedAt<=a.lastAt||!isFresh(point,now))return a;
  const price=point.cnyGram,t=point.capturedAt,cost=c.fee+c.slippage;
  let exited=false;
  if(a.position && (point.quoteAt??t)>a.position.at) {
    const pos=a.position;
    const reason=price<=pos.stop?'止损触发':price>=pos.take?'止盈触发':t-pos.at>=c.maxHoldDays*DAY?'持仓到期':null;
    if(reason){const fill=price*(1-c.slippage),fee=pos.grams*fill*c.fee,proceeds=pos.grams*fill-fee,pnl=proceeds-pos.outlay;a.cash+=proceeds;a.fees+=fee;a.trades.push({...pos,exitAt:t,exitPrice:fill,pnl,reason});a.events.push({at:t,side:'卖出',price:fill,grams:pos.grams,reason});a.position=null;exited=true;}
  }
  if(a.pending&&!a.position&&!exited&&t>a.pending.at) {
    const delay=t-a.pending.at;
    const newerQuote=(point.quoteAt??t)>a.pending.at;
    if(delay<=6*HOUR&&!newerQuote){a.lastAt=t;return a;}
    if(delay<=6*HOUR&&newerQuote&&price<c.buyBelow&&price>a.pending.stop&&price<a.pending.take) {
      const fill=price*(1+c.slippage),stopDistance=Math.max(2*c.minMove,fill*c.stopPct);
      const grams=Math.min(a.cash/(fill*(1+c.fee)),a.cash*c.maxAllocation/(fill*(1+c.fee)),a.cash*c.riskFraction/(stopDistance+fill*cost*2));
      const fee=grams*fill*c.fee,outlay=grams*fill+fee;
      if(grams>0){a.cash-=outlay;a.fees+=fee;a.position={at:t,signalAt:a.pending.at,entryPrice:fill,grams,outlay,stop:fill-stopDistance,take:fill+stopDistance*c.rewardRisk};a.events.push({at:t,side:'买入',price:fill,grams,reason:'前次观察满足三项条件，下一快照模拟成交'});}
    } else a.events.push({at:t,side:'取消',price,reason:'下一报价超时或超出入场范围'});
    a.pending=null;
  }
  if(!a.position&&!a.pending&&!exited) {
    const signal=entrySignal(p,c,t);
    if(signal.enter){const risk=Math.max(2*c.minMove,price*c.stopPct);a.pending={at:t,stop:price-risk,take:price+risk*c.rewardRisk};}
  }
  a.lastAt=t;
  const equity=netEquity(a,price);a.highWater=Math.max(a.highWater,equity);a.maxDrawdown=Math.max(a.maxDrawdown,1-equity/a.highWater);
  a.equity=equity;a.curve.push({at:t,equity});return a;
}
export function replay(points,config=DEFAULTS) {
  if(!validConfig(config))throw new Error('Invalid parameters');
  const p=pointsOf(points);let a=newAccount(config,p[0]?.capturedAt);
  p.forEach((x,i)=>{a=stepAccount(a,p.slice(0,i+1),x.capturedAt);});
  const first=p[0]?.cnyGram,last=p.at(-1)?.cnyGram;
  const b=(1-config.fee)*(1-config.slippage)/(1+config.slippage)/(1+config.fee);
  const full=first&&last?last/first*b-1:0;
  return {...a,returnPct:(a.equity??config.capital)/config.capital-1,benchmarkReturn:full*config.maxAllocation,buyHoldReturn:full,tradeCount:a.trades.length,winRate:a.trades.length?a.trades.filter(x=>x.pnl>0).length/a.trades.length:null,spanDays:p.length?(p.at(-1).capturedAt-p[0].capturedAt)/DAY:0,samples:p.length};
}
