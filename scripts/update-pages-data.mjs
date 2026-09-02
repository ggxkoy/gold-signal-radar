import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const DATA_PATH = new URL('../mirror-site/data.json', import.meta.url);
const HORIZON_MS = 24 * 60 * 60 * 1000;
const MIN_MOVE = 3.8;
const FEEDS = [
  ['Federal Reserve', 'https://www.federalreserve.gov/feeds/press_all.xml'],
  ['FXStreet', 'https://www.fxstreet.com/rss/news'],
  ['MarketWatch', 'https://www.marketwatch.com/rss/topstories'],
  ['WSJ Markets', 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml'],
  ['Investing.com', 'https://www.investing.com/rss/news_285.rss'],
];
const RELEVANT = /gold|bullion|xau|federal reserve|\bfed\b|rate cut|rate hike|interest rate|yield|inflation|\bcpi\b|dollar|central bank|geopolit|war|conflict|sanction|tariff|recession/i;
const RULES = [
  ['降息预期', '涨', 3, /rate cuts?|dovish|yields? (?:fall|drop|retreat)|降息|鸽派|宽松/i],
  ['美元走弱', '涨', 3, /dollar (?:falls|weakens|slides)|美元(?:下跌|走弱|回落)/i],
  ['央行购金', '涨', 4, /central banks? (?:buy|add|boost).{0,20}gold|央行(?:增持|购买|买入|购金)/i],
  ['避险升温', '涨', 3, /war|conflict escalat|sanctions?|geopolit|recession|战争|冲突升级|制裁|地缘政治|衰退/i],
  ['通胀升温', '涨', 2, /inflation (?:rises|heats|accelerates|above)|通胀(?:上升|升温|超预期|反弹)/i],
  ['加息预期', '跌', 3, /rate hikes?|hawkish|yields? (?:rise|climb|jump)|加息|鹰派|紧缩/i],
  ['降息预期降温', '跌', 4, /rate.?cut (?:bets|odds|expectations) (?:fall|fade)|delay(?:ed)? rate cuts?|下调(?:美联储)?降息|推迟降息/i],
  ['美元走强', '跌', 3, /dollar (?:rises|strengthens|gains)|美元(?:上涨|走强)/i],
  ['风险缓和', '跌', 3, /ceasefire|peace deal|conflict eases|soft landing|停火|和平协议|冲突缓和|软着陆/i],
  ['通胀降温', '跌', 2, /inflation (?:falls|cools|below)|通胀(?:下降|降温|低于预期)/i],
];

function decodeXml(value) {
  return value.replaceAll('<![CDATA[', '').replaceAll(']]>', '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
function tag(block, name) { return decodeXml(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.trim() || ''); }
function date(block) { const parsed = new Date(tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'dc:date')); return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(); }
function multiplier(samples, hits) { if (samples < 20) return 1; return Math.min(1.25, Math.max(.75, ((hits + 2) / (samples + 4)) / .5)); }
function stats(predictions) {
  const map = new Map();
  predictions.filter(p => p.settledAt && p.correct != null).forEach(p => (p.factors || []).forEach(label => { const s = map.get(label) || { samples: 0, hits: 0 }; s.samples++; if (p.correct) s.hits++; map.set(label, s); }));
  return Object.fromEntries([...map].map(([label, s]) => [label, { ...s, accuracy: s.hits / s.samples, multiplier: multiplier(s.samples, s.hits) }]));
}
function analyse(text, ruleStats) {
  const hits = RULES.filter(r => r[3].test(text)).map(r => ({ label: r[0], direction: r[1], weight: r[2] * (ruleStats[r[0]]?.multiplier || 1) }));
  const up = hits.filter(h => h.direction === '涨').reduce((s, h) => s + h.weight, 0), down = hits.filter(h => h.direction === '跌').reduce((s, h) => s + h.weight, 0), score = up - down, total = up + down;
  return { hits, direction: score >= 0 ? '涨' : '跌', score, strength: total ? Math.min(90, Math.round(20 + Math.abs(score) / total * 48 + Math.min(total, 12) * 1.8)) : 0 };
}
async function market() {
  const [g, f] = await Promise.all([fetch('https://api.gold-api.com/price/XAU').then(r => r.json()), fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json())]);
  return { usdOz: g.price, usdCny: f.rates.CNY, cnyGram: g.price * f.rates.CNY / 31.1034768, updatedAt: g.updatedAt };
}
async function news() {
  const settled = await Promise.allSettled(FEEDS.map(async ([source, url]) => { const xml = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 GoldSignal/1.0' } }).then(r => { if (!r.ok) throw new Error(`${source} ${r.status}`); return r.text(); }); return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => ({ title: tag(m[1], 'title').replace(/<[^>]+>/g, ''), link: tag(m[1], 'link'), publishedAt: date(m[1]), source })); }));
  return settled.flatMap(r => r.status === 'fulfilled' ? r.value : []).filter(x => x.title && x.link && RELEVANT.test(x.title)).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 16);
}

const old = JSON.parse(await readFile(DATA_PATH, 'utf8'));
const [current, items] = await Promise.all([market(), news()]);
const now = Date.now();
const previousHistory = Array.isArray(old.priceHistory) ? old.priceHistory : [];
const seedHistory = old.market?.cnyGram ? [{ capturedAt: Date.parse(old.updatedAt || old.market.updatedAt), cnyGram: old.market.cnyGram }] : [];
const priceHistory = [...seedHistory, ...previousHistory, { capturedAt: now, cnyGram: current.cnyGram }]
  .filter(point => Number.isFinite(point.capturedAt) && Number.isFinite(point.cnyGram) && point.capturedAt >= now - 7 * 24 * 60 * 60 * 1_000)
  .sort((a, b) => a.capturedAt - b.capturedAt)
  .filter((point, index, all) => index === 0 || point.capturedAt - all[index - 1].capturedAt >= 10 * 60 * 1_000);
let predictions = (old.predictions || []).map(p => {
  if (p.settledAt || p.dueAt > now) return p;
  const move = current.cnyGram - p.entryCnyGram;
  if (move >= MIN_MOVE) return { ...p, settledAt: now, exitCnyGram: current.cnyGram, actualDirection: '涨', correct: p.predictedDirection === '涨', status: p.predictedDirection === '涨' ? '命中' : '未命中' };
  if (move <= -MIN_MOVE) return { ...p, settledAt: now, exitCnyGram: current.cnyGram, actualDirection: '跌', correct: p.predictedDirection === '跌', status: p.predictedDirection === '跌' ? '命中' : '未命中' };
  return { ...p, settledAt: now, exitCnyGram: current.cnyGram, actualDirection: '震荡', correct: null, status: '震荡' };
});
const ruleStats = stats(predictions);
const known = new Set(predictions.map(p => p.fingerprint));
for (const item of items.slice(0, 8)) {
  const fingerprint = createHash('sha256').update(`24:${item.link}`).digest('hex');
  if (known.has(fingerprint)) continue;
  const signal = analyse(item.title, ruleStats);
  if (!signal.hits.length || signal.strength < 40) continue;
  predictions.push({ fingerprint, headline: item.title, source: item.source, link: item.link, predictedAt: now, dueAt: now + HORIZON_MS, predictedDirection: signal.direction, signalStrength: signal.strength, entryCnyGram: current.cnyGram, settledAt: null, exitCnyGram: null, actualDirection: null, correct: null, factors: signal.hits.map(h => h.label), status: '等待' });
  known.add(fingerprint);
}
predictions = predictions.sort((a, b) => b.predictedAt - a.predictedAt).slice(0, 500);
const effective = predictions.filter(p => p.settledAt && p.correct != null), neutral = predictions.filter(p => p.settledAt && p.correct == null).length, hits = effective.filter(p => p.correct).length;
const output = { updatedAt: new Date().toISOString(), market: current, priceHistory, summary: { total: predictions.length, pending: predictions.filter(p => !p.settledAt).length, settled: effective.length, neutral, hits, accuracy: effective.length ? hits / effective.length : null, minimumMoveCnyGram: MIN_MOVE }, ruleStats, predictions, items };
await writeFile(DATA_PATH, `${JSON.stringify(output)}\n`);
