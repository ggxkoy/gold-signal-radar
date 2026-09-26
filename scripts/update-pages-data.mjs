import { readFile, writeFile, rename } from 'node:fs/promises';
import { DEFAULTS, VERSION, DAY, pointsOf, isFresh, newAccount, stepAccount, advanceForecasts, forecastMetrics, auditLegacy, newsSnapshot } from '../mirror-site/quant-engine.mjs';

const base=new URL('../mirror-site/',import.meta.url);
const offline=process.argv.includes('--offline');
async function read(name,fallback){try{return JSON.parse(await readFile(new URL(name,base),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(name,data){const dest=new URL(name,base),temp=new URL(`${name}.tmp`,base);await writeFile(temp,`${JSON.stringify(data)}\n`);await rename(temp,dest);}
async function request(url){const r=await fetch(url,{headers:{'User-Agent':'GoldSignalRadar/2.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r;}
async function market(){
  const[g,f]=await Promise.all([request('https://api.gold-api.com/price/XAU').then(r=>r.json()),request('https://open.er-api.com/v6/latest/USD').then(r=>r.json())]);
  if(!(g.price>0&&f.rates?.CNY>0)||!Number.isFinite(Date.parse(g.updatedAt)))throw new Error('Invalid market data');
  const fxAt=Number(f.time_last_update_unix)*1000;
  if(!Number.isFinite(fxAt)||Date.now()-fxAt>3*DAY)throw new Error('FX data stale');
  return {usdOz:g.price,usdCny:f.rates.CNY,cnyGram:g.price*f.rates.CNY/31.1034768,updatedAt:g.updatedAt,fxUpdatedAt:fxAt};
}
const FEEDS=[['Federal Reserve','https://www.federalreserve.gov/feeds/press_all.xml'],['FXStreet','https://www.fxstreet.com/rss/news'],['MarketWatch','https://www.marketwatch.com/rss/topstories'],['WSJ Markets','https://feeds.a.dj.com/rss/RSSMarketsMain.xml'],['Investing.com','https://www.investing.com/rss/news_285.rss']];
const relevant=/\b(?:gold|bullion|xau|fed|dollar|inflation|war|recession)\b|federal reserve|rate cut|rate hike|interest rate|yields?|central bank|geopolit|conflict|sanction|黄金|美联储|利率|美元|央行/iu;
const decode=x=>x.replaceAll('<![CDATA[','').replaceAll(']]>','').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(match,s)=>{const n=parseInt(s.startsWith('x')?s.slice(1):s,s.startsWith('x')?16:10);return n<=0x10ffff?String.fromCodePoint(n):match;});
const tag=(s,t)=>decode(s.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`,'i'))?.[1]?.trim()||'');
async function news(){
  const fetched=await Promise.allSettled(FEEDS.map(async([source,url])=>{const xml=await(await request(url)).text();return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m=>({title:tag(m[1],'title').replace(/<[^>]+>/g,''),link:tag(m[1],'link'),publishedAt:tag(m[1],'pubDate')||tag(m[1],'updated'),source}));}));
  const seen=new Set(),items=fetched.flatMap(x=>x.status==='fulfilled'?x.value:[]).filter(x=>{
    const t=Date.parse(x.publishedAt),key=x.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    if(!/^https?:\/\//i.test(x.link)||!relevant.test(x.title)||!Number.isFinite(t)||Date.now()-t>2*DAY||t>Date.now()+300000||seen.has(key))return false;
    seen.add(key);x.publishedAt=new Date(t).toISOString();return true;
  }).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,24);
  return {items,availableFeeds:fetched.filter(x=>x.status==='fulfilled').length,totalFeeds:FEEDS.length};
}

const old=await read('data.json',{});let history=await read('history.json',[]);
let current=old.market,feed={items:old.items||[],availableFeeds:null,totalFeeds:5},marketError=null;
if(!offline){const results=await Promise.allSettled([market(),news()]);if(results[0].status==='fulfilled')current=results[0].value;else marketError=String(results[0].reason);if(results[1].status==='fulfilled')feed=results[1].value;}
const now=Date.now();
if(!current)throw new Error('No market data available');
const fresh=isFresh({cnyGram:current.cnyGram,quoteAt:Date.parse(current.updatedAt)},now);
if(fresh&&!offline&&!marketError)history.push({capturedAt:now,quoteAt:Date.parse(current.updatedAt),cnyGram:current.cnyGram,usdOz:current.usdOz,usdCny:current.usdCny});
history=pointsOf(history);
let quant=await read('quant-state.json',null);
if(!quant)quant={version:VERSION,startedAt:now,account:newAccount(DEFAULTS,now),forecasts:[]};
if(quant.version!==VERSION)throw new Error('Strategy version changed: explicitly migrate account before running');
if(!offline&&!marketError&&fresh)quant.forecasts=advanceForecasts(quant.forecasts,history,feed.items,now);
const postStart=history.filter(p=>p.capturedAt>=quant.startedAt);
if(postStart.length&&fresh)quant.account=stepAccount(quant.account,history,now);
quant.updatedAt=now;
const snapshot=newsSnapshot(feed.items,now);
const output={...old,updatedAt:new Date(now).toISOString(),market:current,priceHistory:history.filter(p=>now-p.capturedAt<7*DAY),items:feed.items,legacyAudit:auditLegacy(old.predictions||[]),evaluation:forecastMetrics(quant.forecasts),feedHealth:{available:feed.availableFeeds,total:feed.totalFeeds,matched:snapshot.items.length},dataHealth:{fresh,marketError,quoteAt:Date.parse(current.updatedAt)},engineVersion:VERSION};
await save('history.json',history);await save('quant-state.json',quant);await save('data.json',output);
console.log(JSON.stringify({observations:history.length,fresh,marketError,forecasts:quant.forecasts.length,paperTrades:quant.account.trades.length,offline}));
