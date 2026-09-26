import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, HOUR, DAY, analyseNews, pointsOf, entrySignal, newAccount, stepAccount, replay, advanceForecasts, forecastMetrics } from '../mirror-site/quant-engine.mjs';
const start=Date.UTC(2026,8,1);
const point=(h,price)=>({capturedAt:start+h*HOUR,quoteAt:start+h*HOUR,cnyGram:price});
const series=[point(0,930),point(6,928),point(12,924),point(18,920),point(24,928)];

test('ambiguous news and partial English words must abstain',()=>{
  for(const t of ['Chinese Yuan moves toward 6.7330','ECB warns about inflation','war','通胀超预期','今日行情','并未出现美元走弱'])assert.equal(analyseNews(t).direction,'观望',t);
  assert.equal(analyseNews('降息预期降温，美元走强').direction,'跌');
  assert.equal(analyseNews('美元走弱。收益率上升。').direction,'涨'); // Only explicit US/real-yield phrases count.
  assert.equal(analyseNews('美元走弱。美债收益率上升。').direction,'观望');
});
test('price below threshold is insufficient; rebound and mean confirmation required',()=>{
  assert.equal(entrySignal(series.slice(0,4),DEFAULTS,start+18*HOUR).enter,false);
  assert.equal(entrySignal(series,DEFAULTS,start+24*HOUR).enter,true);
  assert.equal(entrySignal([...series.slice(0,4),point(24,915)],DEFAULTS,start+24*HOUR).enter,false);
  assert.equal(entrySignal(series,DEFAULTS,start+26*HOUR).action,'暂停');
});
test('next observation execution, cash/risk caps and duplicate-run idempotency',()=>{
  let a=stepAccount(newAccount(DEFAULTS,start),series,start+24*HOUR);
  assert.equal(a.position,null);assert.ok(a.pending);assert.equal(a.events.length,0);
  const p=[...series,point(25,929)];a=stepAccount(a,p,start+25*HOUR);
  assert.ok(a.position);assert.ok(a.cash>=7500);assert.ok(a.position.entryPrice>929);
  const conservativeLoss=a.position.grams*(a.position.entryPrice-a.position.stop+a.position.entryPrice*(DEFAULTS.fee+DEFAULTS.slippage)*2);
  assert.ok(conservativeLoss<=DEFAULTS.capital*DEFAULTS.riskFraction+1e-8);
  assert.deepEqual(stepAccount(a,p,start+25*HOUR),a);
});
test('gapped stop uses observed exit with costs, never ideal stop price',()=>{
  let a=stepAccount(newAccount(DEFAULTS,start),series,start+24*HOUR);
  a=stepAccount(a,[...series,point(25,929)],start+25*HOUR);
  a=stepAccount(a,[...series,point(25,929),point(30,850)],start+30*HOUR);
  assert.equal(a.position,null);assert.equal(a.trades.length,1);
  assert.equal(a.trades[0].exitPrice,850*(1-DEFAULTS.slippage));
  assert.ok(a.trades[0].pnl< -50);assert.ok(a.maxDrawdown>0);
});
test('entry orders expire if next observed quote is too late',()=>{
  let a=stepAccount(newAccount(DEFAULTS,start),series,start+24*HOUR);
  a=stepAccount(a,[...series,point(31,928)],start+31*HOUR);
  assert.equal(a.position,null);assert.equal(a.events[0].side,'取消');
});
test('new capture of an old source quote cannot fill a pending order',()=>{
  let a=stepAccount(newAccount(DEFAULTS,start),series,start+24*HOUR);
  const staleSource={...point(24.5,929),quoteAt:start+23.9*HOUR};
  a=stepAccount(a,[...series,staleSource],start+24.5*HOUR);
  assert.equal(a.position,null);assert.ok(a.pending);
  a=stepAccount(a,[...series,staleSource,point(25,929)],start+25*HOUR);
  assert.ok(a.position);
  assert.ok(Math.abs((a.position.take-a.position.entryPrice)/(a.position.entryPrice-a.position.stop)-1.5)<1e-10);
});
test('pre-expiry source quotes never count as post-expiry labels',()=>{
  const pred={at:start,dueAt:start+DAY,entry:930,direction:'涨',status:'等待'};
  const oldSource={...point(24.5,940),quoteAt:start+23.75*HOUR};
  const rows=advanceForecasts([pred],[oldSource],[],start+25.5*HOUR);
  assert.equal(rows[0].status,'缺失到期报价');
});
test('prediction time is the decision time, not an earlier price timestamp',()=>{
  const now=start+24*HOUR+30000;
  const rows=advanceForecasts([],series,[],now);
  assert.equal(rows[0].at,now);assert.equal(rows[0].dueAt,now+DAY);
  assert.equal(advanceForecasts([],series,[],now+HOUR).length,0);
});
test('new data cannot change historical fills; replay includes terminal liquidation costs',()=>{
  const h=[...series,point(25,929),point(26,930)];
  const r=replay(h),extended=replay([...h,point(27,931)]);
  assert.deepEqual(r.events,extended.events);assert.ok(r.equity<r.cash+r.position.grams*930);
  const ratio=(1-DEFAULTS.fee)*(1-DEFAULTS.slippage)/((1+DEFAULTS.fee)*(1+DEFAULTS.slippage));
  assert.ok(Math.abs(r.benchmarkReturn-((930/930)*ratio-1)*.25)<1e-10);
});
test('late forecast observations are excluded, not settled at an arbitrary future price',()=>{
  const pred={at:start,dueAt:start+DAY,entry:930,direction:'涨',baseline:'涨',status:'等待'};
  const expired=advanceForecasts([pred],[point(26,940)],[],start+26*HOUR);
  assert.equal(expired[0].status,'缺失到期报价');assert.equal(forecastMetrics(expired).effective,0);
  const settled=advanceForecasts([pred],[point(24.5,933.8)],[],start+24.5*HOUR);
  assert.equal(settled[0].status,'已结算');assert.equal(settled[0].actual,'涨');
});
test('neutral outcomes included in all-outcome denominator and abstention coverage',()=>{
  const rows=[{status:'已结算',actual:'涨',direction:'涨',correct:true},{status:'已结算',actual:'震荡',direction:'涨',correct:false},{status:'不预测',direction:'观望'}];
  const m=forecastMetrics(rows);assert.equal(m.accuracy,1);assert.equal(m.allOutcomeAccuracy,.5);assert.equal(m.coverage,2/3);
});
test('invalid, duplicate-minute and future points do not feed features',()=>{
  assert.equal(pointsOf([point(0,930),point(0.001,931),point(2,NaN),point(5,940)],start+HOUR).length,1);
  assert.throws(()=>replay(series,{...DEFAULTS,capital:-1}));
});
