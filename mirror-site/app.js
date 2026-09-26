import { DEFAULTS, VERSION, HOUR, DAY, entrySignal, replay, analyseNews, newsSnapshot, forecastMetrics, auditLegacy, isFresh } from './quant-engine.mjs';

const $=id=>document.getElementById(id);
const money=n=>Number.isFinite(n)?`¥${n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—';
const pct=n=>Number.isFinite(n)?`${(n*100).toFixed(2)}%`:'待积累';
const time=t=>Number.isFinite(Number(t))?new Date(Number(t)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const text=(id,value)=>{$(id).textContent=value;};
let data=null,history=[],quant=null,liveMarket=null,busy=false;
function row(tbody,cells){const tr=document.createElement('tr');for(const cell of cells){const td=document.createElement('td');td.textContent=String(cell);tr.append(td);}tbody.append(tr);}
function empty(tbody,label,count=5){tbody.replaceChildren();const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=count;td.className='empty';td.textContent=label;tr.append(td);tbody.append(tr);}
function tone(id,n){$(id).className=n>0?'up':n<0?'down':'';}
function marketView(){
  if(!data)return;
  const m=liveMarket||data.market,quoteAt=Date.parse(m.updatedAt),fresh=isFresh({cnyGram:m.cnyGram,quoteAt},Date.now());
  text('cnyPrice',money(m.cnyGram));text('priceDetail',`$${m.usdOz.toFixed(2)}/盎司 · USD/CNY ${m.usdCny.toFixed(4)} · 源报价 ${time(quoteAt)}`);
  const diff=m.cnyGram-DEFAULTS.buyBelow;text('thresholdDistance',diff<0?`已低于关注线 ${money(-diff)}/克，仍需反弹确认`:`距 ¥930 关注线还差 ${money(diff)}/克`);
  const age=(Date.now()-Date.parse(data.market.updatedAt))/HOUR;
  text('notice',!fresh?'报价已过期，暂停新交易信号。请等待有效行情更新。':age>1?'当前报价已更新，后台模拟账户数据较旧；下一次采集恢复后再判断入场。':'量化模拟运行中。入场条件全部满足后等待下一笔报价；真实账户尚未接入。');
  const latest=history.at(-1),points=[...history];
  if(latest&&quoteAt>latest.capturedAt&&fresh)points.push({capturedAt:quoteAt,quoteAt,cnyGram:m.cnyGram});
  const s=entrySignal(points,DEFAULTS,Date.now());
  const position=quant?.account?.position;
  text('decisionTitle',s.action==='暂停'?s.action:position?'模拟持仓观察':s.action);
  text('signalStatus',s.ready?'规则条件检查':'数据条件不足');
  text('decisionReason',position?`模拟持仓 ${position.grams.toFixed(3)} 克；止损 ${money(position.stop)}，止盈 ${money(position.take)}/克。`:s.reason);
  $('entryChecks').replaceChildren();for(const c of s.checks||[]){const li=document.createElement('li'),icon=document.createElement('span'),label=document.createElement('span');icon.textContent=c.ok?'✓':'○';icon.className=c.ok?'up':'meta';label.textContent=c.label;li.append(icon,label);$('entryChecks').append(li);}
}
function paperView(){
  const a=quant.account,c=a.config,equity=a.equity??c.capital;
  text('paperStart',`始于北京时间 ${time(a.startedAt)} · 最近运行 ${time(quant.updatedAt)}`);
  text('paperEquity',money(equity));text('paperCapital',`初始 ${money(c.capital)} · 现金 ${money(a.cash)}`);
  text('paperReturn',pct(equity/c.capital-1));tone('paperReturn',equity/c.capital-1);text('paperFees',`累计手续费 ${money(a.fees)}；滑点计入成交价`);
  text('paperDrawdown',pct(a.maxDrawdown));text('paperTrades',a.trades.length);text('paperWinRate',a.trades.length?`胜率 ${pct(a.trades.filter(t=>t.pnl>0).length/a.trades.length)}`:'尚无完整买卖');
  text('paperPosition',a.position?'模拟持仓':a.pending?'待下一报价成交':'持有现金');
  text('positionDetail',a.position?`入场 ${money(a.position.entryPrice)}/克 · ${a.position.grams.toFixed(3)}克 · 止损 ${money(a.position.stop)} · 止盈 ${money(a.position.take)}`:a.pending?`已在 ${time(a.pending.at)} 记录入场意向，等待下一有效报价；超过6小时取消。`:'当前无仓位。低于930本身只触发关注，满足反弹条件后才模拟买入。');
  const body=$('paperLedger');body.replaceChildren();const events=a.events.slice(-6).reverse();if(!events.length)empty(body,'暂无模拟成交，等待满足入场条件');else events.forEach(e=>row(body,[time(e.at),e.side,money(e.price),e.grams?.toFixed(3)||'—',e.reason]));
}
function configFromForm(){return {...DEFAULTS,capital:Number($('capital').value),buyBelow:Number($('buyBelow').value),fee:Number($('fee').value)/100,slippage:Number($('slippage').value)/100};}
function chart(result,c){
  const svg=$('equityChart');svg.replaceChildren();if(!result.curve.length)return;
  const start=history[0],end=history.at(-1),ratio=(1-c.fee)*(1-c.slippage)/((1+c.slippage)*(1+c.fee));
  const base=history.map(p=>({at:p.capturedAt,equity:c.capital*(1-c.maxAllocation+c.maxAllocation*p.cnyGram/start.cnyGram*ratio)}));
  const values=[...result.curve,...base].map(x=>x.equity),min=Math.min(...values)*.999,max=Math.max(...values)*1.001;
  const coords=p=>`${(65+(p.at-start.capturedAt)/Math.max(1,end.capturedAt-start.capturedAt)*920).toFixed(2)},${(200-(p.equity-min)/(max-min)*175).toFixed(2)}`;
  const ns='http://www.w3.org/2000/svg';
  for(const y of [min,(max+min)/2,max]){const sy=200-(y-min)/(max-min)*175,line=document.createElementNS(ns,'line'),label=document.createElementNS(ns,'text');line.setAttribute('x1','65');line.setAttribute('x2','990');line.setAttribute('y1',sy);line.setAttribute('y2',sy);line.setAttribute('stroke','#423e33');label.setAttribute('x','0');label.setAttribute('y',sy+5);label.setAttribute('fill','#b5aea0');label.setAttribute('font-size','13');label.textContent=y.toFixed(0);svg.append(line,label);}
  for(const [series,color] of [[base,'#83a5b1'],[result.curve,'#d9b55d']]){const path=document.createElementNS(ns,'polyline');path.setAttribute('points',series.map(coords).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width','2.5');svg.append(path);}
  text('chartDates',`${time(start.capturedAt)} 至 ${time(end.capturedAt)}（北京时间）`);
}
function replayView(){
  if(!history.length)return;
  try{const c=configFromForm(),r=replay(history,c),gaps=history.slice(1).map((p,i)=>p.capturedAt-history[i].capturedAt).sort((a,b)=>a-b);
    text('historyQuality',`${r.spanDays.toFixed(1)}天 · ${r.samples}个真实快照 · 采样间隔中位约${Math.round((gaps[Math.floor(gaps.length/2)]||0)/60000)}分钟。仅可做稀疏报价回放，不适用于日内高频交易。`);
    text('replayReturn',pct(r.returnPct));tone('replayReturn',r.returnPct);text('replayCost',`手续费 ${money(r.fees)} · 未平仓按预计卖出成本估值`);text('benchmark',pct(r.benchmarkReturn));text('replayDrawdown',pct(r.maxDrawdown));text('replayTrades',`${r.tradeCount} 笔`);text('replayWinRate',r.winRate===null?'尚无完整买卖':`胜率 ${pct(r.winRate)}`);
    text('replayVerdict',`${r.tradeCount<20?'交易样本不足20笔，目前不能证明策略有效。':'这是探索性历史回放，不是独立样本外验证。'} ${r.returnPct>r.benchmarkReturn?'本段净收益高于25%仓位持有基线。':'本段净收益未超过25%仓位持有基线。'} 反复修改参数会产生过拟合；自动模拟账户继续使用固定Q1参数。`);
    chart(r,c);const body=$('replayLedger');body.replaceChildren();if(!r.trades.length)empty(body,'这段历史未完成交易；不会为显示收益而放宽规则');else r.trades.slice(-8).reverse().forEach(t=>row(body,[`${time(t.at)} / ${time(t.exitAt)}`,money(t.entryPrice),money(t.exitPrice),money(t.pnl),t.reason]));
  }catch(e){text('replayVerdict',`参数不合法，无法回放：${e.message}`);}
}
function forecastView(){
  const m=forecastMetrics(quant.forecasts),a=auditLegacy(data.predictions||[]);
  text('forecastAccuracy',pct(m.accuracy));text('forecastSamples',`${m.effective}个有效方向样本，${m.neutral}个震荡`);text('forecastAll',pct(m.allOutcomeAccuracy));text('forecastCoverage',pct(m.coverage));text('forecastMade',`${m.made}次出手 / ${m.observations}次观察`);text('forecastExpired',m.expired);
  text('forecastStatus',`Q1固定规则 · ${m.effective<30?'少于30个有效样本，尚未证明预测优势。':'继续观察独立样本，不能用命中率代替收益。'} 始终预测上涨在同一有效样本上的命中率：${pct(m.alwaysUpAccuracy)}。`);
  text('legacyAudit',`旧版原始命中 ${a.hits}/${a.directional}（${pct(a.rawAccuracy)}）；其中${a.late}个有效样本晚于到期1小时，统计含重复行情区间，不能视为独立的24小时验证。旧数据原样保留，不并入Q1。`);
  const box=$('forecastLedger');box.replaceChildren();for(const f of quant.forecasts.slice(-5).reverse()){const div=document.createElement('div');div.className='ledger-row';div.textContent=`${time(f.at)} · ${f.direction} · ${f.status}${f.actual?` · 实际${f.actual}（${f.move.toFixed(2)}元/克）`:''} · ${f.reasons.join('；')}`;box.append(div);}
}
function newsView(){
  const snapshot=newsSnapshot(data.items,Date.now()),positive=snapshot.items.filter(x=>x.score>0).length,negative=snapshot.items.filter(x=>x.score<0).length;
  text('sentimentLabel',!snapshot.items.length?'信息不足':snapshot.score>0?'新闻偏多':snapshot.score<0?'新闻偏空':'新闻分歧');text('sentimentDrivers',`明确利多 ${positive} 条 · 明确利空 ${negative} 条`);text('newsCoverage',`过去24小时去重后 ${snapshot.items.length} 条有效新闻，来自 ${snapshot.sources} 个来源。`);
  text('dataTime',`后台采集 ${time(Date.parse(data.updatedAt))}`);const box=$('newsList');box.replaceChildren();
  for(const n of data.items.slice(0,8)){if(!/^https?:\/\//i.test(n.link))continue;const a=document.createElement('a'),badge=document.createElement('span'),title=document.createElement('h3'),meta=document.createElement('div');a.className='news-card';a.href=n.link;a.target='_blank';a.rel='noreferrer';badge.className='pill';badge.textContent=analyseNews(n.title).direction;title.textContent=n.title;meta.className='news-meta';meta.textContent=`${n.source} · ${time(Date.parse(n.publishedAt))}`;a.append(badge,title,meta);box.append(a);}
  if(!box.children.length)box.textContent='暂无近期有效新闻。';
}
function inputView(){const value=$('newsInput').value,r=analyseNews(value);text('newsSignal',value?`规则判断：${r.direction}`:'未输入新闻');$('factors').replaceChildren();for(const h of r.hits){const div=document.createElement('div');div.className='ledger-row';div.textContent=`${h.label} · ${h.sign>0?'利多':'利空'}`;$('factors').append(div);}}
async function get(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}
async function refreshData(){
  if(busy)return;busy=true;$('refresh').disabled=true;
  try{const [d,h,q]=await Promise.all(['data.json','history.json','quant-state.json'].map(x=>get(`${x}?t=${Date.now()}`)));if(d.engineVersion!==VERSION||q.version!==VERSION)throw new Error('版本正在更新，请稍后刷新');data=d;history=h;quant=q;text('engineVersion',VERSION);marketView();paperView();replayView();forecastView();newsView();}
  catch(e){text('notice',`数据暂不可用：${e.message}。请稍后刷新；不生成新交易信号。`);text('decisionTitle','暂停');text('decisionReason','等待行情与账户数据恢复');}
  finally{busy=false;$('refresh').disabled=false;}
}
async function refreshPrice(){try{const[g,f]=await Promise.all([get('https://api.gold-api.com/price/XAU'),get('https://open.er-api.com/v6/latest/USD')]);if(!(g.price>0&&f.rates?.CNY>0)||!Number.isFinite(Date.parse(g.updatedAt))||!Number.isFinite(f.time_last_update_unix)||Date.now()-f.time_last_update_unix*1000>3*DAY)throw new Error('Invalid quote');liveMarket={usdOz:g.price,usdCny:f.rates.CNY,cnyGram:g.price*f.rates.CNY/31.1034768,updatedAt:g.updatedAt};}catch{liveMarket=null;}marketView();}
$('refresh').addEventListener('click',()=>{void refreshData();void refreshPrice();});$('replayForm').addEventListener('submit',event=>{event.preventDefault();replayView();});$('newsInput').addEventListener('input',inputView);
void refreshData();void refreshPrice();setInterval(()=>{void refreshData();void refreshPrice();},120000);setInterval(marketView,60000);
