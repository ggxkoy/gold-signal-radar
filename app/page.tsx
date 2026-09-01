'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock3, ExternalLink, Newspaper, RefreshCw, Scale, ShieldAlert, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type Direction = '涨' | '跌';
type Rule = { label: string; direction: Direction; weight: number; reason: string; pattern: RegExp };
type LiveNews = { title: string; link: string; publishedAt: string; source: string };
type GoldPrice = { price: number; updatedAt: string };
type FxRate = { rates: { CNY: number } };

const RULES: Rule[] = [
  { label: '降息预期', direction: '涨', weight: 3, reason: '降低持有黄金的机会成本', pattern: /降息|鸽派|宽松|收益率(?:下跌|下降|回落)/i },
  { label: '降息预期升温', direction: '涨', weight: 4, reason: '未来利率路径更宽松', pattern: /上调(?:美联储)?降息|降息预期(?:升温|增加)|提前降息/i },
  { label: '实际利率走低', direction: '涨', weight: 4, reason: '无息资产的相对吸引力上升', pattern: /实际利率(?:下降|走低|转负)|负利率/i },
  { label: '美元走弱', direction: '涨', weight: 3, reason: '美元计价黄金获得支撑', pattern: /美元(?:下跌|走弱|回落)|美元指数(?:下跌|走弱)/i },
  { label: '央行购金', direction: '涨', weight: 4, reason: '结构性买盘增加', pattern: /央行(?:增持|购买|买入|购金)|黄金储备(?:增加|上升)/i },
  { label: '避险升温', direction: '涨', weight: 3, reason: '不确定性推升避险需求', pattern: /战争|冲突升级|空袭|制裁|地缘政治|金融危机|银行危机|衰退|硬着陆/i },
  { label: '通胀升温', direction: '涨', weight: 2, reason: '购买力对冲需求可能上升', pattern: /通胀(?:上升|升温|超预期|反弹)|CPI超预期|油价暴涨/i },
  { label: 'ETF流入', direction: '涨', weight: 3, reason: '投资资金直接增加黄金需求', pattern: /黄金ETF(?:流入|增持)|资金流入黄金|投机买盘/i },
  { label: '加息预期', direction: '跌', weight: 3, reason: '提高持有黄金的机会成本', pattern: /加息|鹰派|紧缩|收益率(?:上涨|上升|走高)/i },
  { label: '降息预期降温', direction: '跌', weight: 4, reason: '利率可能在高位维持更久', pattern: /下调(?:美联储)?降息|降息预期(?:降温|减少)|推迟降息|延后降息/i },
  { label: '实际利率走高', direction: '跌', weight: 4, reason: '有息资产相对更有吸引力', pattern: /实际利率(?:上升|走高|转正)/i },
  { label: '美元走强', direction: '跌', weight: 3, reason: '美元计价黄金通常承压', pattern: /美元(?:上涨|走强)|美元指数(?:上涨|走强)/i },
  { label: '央行售金', direction: '跌', weight: 4, reason: '官方供给增加、结构性需求减弱', pattern: /央行(?:减持|出售|卖出|售金)|黄金储备(?:下降|减少)/i },
  { label: '风险缓和', direction: '跌', weight: 3, reason: '避险溢价回落', pattern: /停火|和平协议|冲突缓和|风险偏好回升|软着陆/i },
  { label: '通胀降温', direction: '跌', weight: 2, reason: '购买力对冲需求减弱', pattern: /通胀(?:下降|降温|低于预期)|CPI低于预期|油价大跌/i },
  { label: 'ETF流出', direction: '跌', weight: 3, reason: '投资资金撤出黄金市场', pattern: /黄金ETF(?:流出|减持)|资金流出黄金|获利了结/i },
];

const EXAMPLES = [
  '美国非农就业低于预期，市场上调美联储降息押注，美元指数回落。',
  '美国通胀超预期反弹，美债收益率走高，市场下调降息预期。',
];

function analyse(text: string) {
  const hits = RULES.filter((rule) => rule.pattern.test(text));
  const up = hits.filter((hit) => hit.direction === '涨').reduce((sum, hit) => sum + hit.weight, 0);
  const down = hits.filter((hit) => hit.direction === '跌').reduce((sum, hit) => sum + hit.weight, 0);
  const score = up - down;
  const direction: Direction = score >= 0 ? '涨' : '跌';
  const total = up + down;
  const confidence = total === 0 ? 38 : Math.min(92, Math.round(52 + (Math.abs(score) / total) * 38 + Math.min(total, 8)));
  return { hits, up, down, score, direction, confidence };
}

export default function Home() {
  const [news, setNews] = useState(EXAMPLES[0]);
  const [liveNews, setLiveNews] = useState<LiveNews[]>([]);
  const [gold, setGold] = useState<GoldPrice | null>(null);
  const [usdCny, setUsdCny] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const result = useMemo(() => analyse(news), [news]);
  const isUp = result.direction === '涨';
  const cnyPerGram = gold && usdCny ? (gold.price * usdCny) / 31.1034768 : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    const [priceResult, fxResult, newsResult] = await Promise.allSettled([
      fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error('price unavailable');
        return response.json() as Promise<GoldPrice>;
      }),
      fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error('fx unavailable');
        return response.json() as Promise<FxRate>;
      }),
      fetch('/api/news', { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error('news unavailable');
        return response.json() as Promise<{ items: LiveNews[] }>;
      }),
    ]);
    if (priceResult.status === 'fulfilled') setGold(priceResult.value);
    if (fxResult.status === 'fulfilled') setUsdCny(fxResult.value.rates.CNY);
    if (newsResult.status === 'fulfilled') setLiveNews(newsResult.value.items);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 120_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-5 sm:px-7 lg:px-10">
        <header className="mb-5 flex items-center justify-between border-b border-border/70 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_28px_rgba(208,166,69,.24)]"><Sparkles className="size-4" /></span>
            <div>
              <p className="font-serif text-[20px] leading-none tracking-tight">金价雷达</p>
              <p className="mt-1 text-[10px] tracking-[.18em] text-muted-foreground">GOLD SIGNAL</p>
            </div>
          </div>
          <Badge className="gap-1.5 border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_currentColor]" />规则引擎在线</Badge>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-[1.3fr_.7fr]">
          <Card className="gold-surface border-0 py-0 ring-0">
            <CardContent className="flex min-h-[142px] flex-col justify-between p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs tracking-[.16em] text-white/55">AU / CNY · 人民币金价</p><div className="mt-2 flex items-end gap-3"><span className="font-serif text-4xl tracking-tight text-white sm:text-5xl">{cnyPerGram ? `¥${cnyPerGram.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '—'}</span><span className="pb-1 text-xs text-white/55">元/克</span></div>{gold && <p className="mt-2 text-[11px] text-white/45">国际金价 ${gold.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}/盎司 · USD/CNY {usdCny?.toFixed(4) ?? '—'}</p>}</div>
                <Button aria-label="刷新金价和新闻" onClick={() => void refresh()} disabled={loading} variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/50"><Clock3 className="size-3.5" />{lastRefresh ? `${lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新 · 每2分钟自动刷新` : '正在连接实时数据'}</div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 py-0 shadow-none">
            <CardContent className="flex h-full min-h-[142px] flex-col justify-between p-5 sm:p-6">
              <div className="flex items-center justify-between"><p className="text-xs tracking-[.14em] text-muted-foreground">当前判断</p><Scale className="size-4 text-muted-foreground" /></div>
              <div className="flex items-end justify-between gap-3">
                <div className={`flex items-center gap-2 font-serif text-5xl ${isUp ? 'text-up' : 'text-down'}`}>{isUp ? <ArrowUpRight className="size-9" /> : <ArrowDownRight className="size-9" />}{result.direction}</div>
                <div className="pb-1 text-right"><p className="text-xl font-semibold">{result.confidence}%</p><p className="text-xs text-muted-foreground">规则置信度</p></div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.12fr)_minmax(340px,.88fr)]">
          <Card className="border-border/70 bg-card/80 shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2"><Newspaper className="size-4 text-primary" /><h1 className="font-medium">输入一条可能影响金价的新闻</h1></div>
              <Textarea value={news} onChange={(event) => setNews(event.target.value)} className="min-h-[128px] resize-none border-border bg-background/60 p-4 leading-7 shadow-inner" placeholder="粘贴新闻标题或摘要……" />
              <div className="mt-3 flex flex-wrap gap-2">{EXAMPLES.map((example, index) => <Button key={example} onClick={() => setNews(example)} variant="outline" size="sm" className="border-border/80 text-muted-foreground">示例 {index + 1}</Button>)}</div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs tracking-[.14em] text-muted-foreground">方向拆解</p><p className="mt-1 text-sm">利多 {result.up} 分 · 利空 {result.down} 分</p></div><Badge variant="outline" className={isUp ? 'border-up/25 text-up' : 'border-down/25 text-down'}>净分 {result.score > 0 ? '+' : ''}{result.score}</Badge></div>
              <div className="space-y-2">
                {result.hits.length ? result.hits.map((hit) => <div key={hit.label} className="flex items-start gap-3 rounded-xl border border-border/65 bg-background/45 p-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${hit.direction === '涨' ? 'bg-up' : 'bg-down'}`} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{hit.label}</p><span className={`text-xs ${hit.direction === '涨' ? 'text-up' : 'text-down'}`}>{hit.direction} · {hit.weight}分</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{hit.reason}</p></div></div>) : <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">未命中明确规则，暂按低置信度方向输出。补充“利率、美元、央行购金、地缘冲突”等信息会更准确。</div>}
              </div>
              <div className="mt-4 flex gap-2 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />规则信号只反映新闻的第一阶影响，不构成投资建议。</div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Newspaper className="size-4 text-primary" /><h2 className="font-medium">实时相关新闻</h2></div>
              <p className="mt-1 text-xs text-muted-foreground">点击新闻即可把标题送入规则引擎</p>
            </div>
            <Button onClick={() => void refresh()} disabled={loading} variant="ghost" size="sm" className="text-muted-foreground"><RefreshCw className={loading ? 'animate-spin' : ''} />刷新</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {liveNews.length ? liveNews.slice(0, 8).map((item) => {
              const signal = analyse(item.title);
              const signalUp = signal.direction === '涨';
              return (
                <article key={`${item.link}-${item.publishedAt}`} className="group rounded-xl border border-border/70 bg-card/65 p-4 transition hover:border-primary/35 hover:bg-card">
                  <button type="button" onClick={() => { setNews(item.title); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full text-left">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Badge variant="outline" className={signalUp ? 'border-up/25 text-up' : 'border-down/25 text-down'}>{signal.direction} · {signal.confidence}%</Badge>
                      <span className="truncate text-[11px] text-muted-foreground">{item.source}</span>
                    </div>
                    <h3 className="line-clamp-2 text-sm leading-6 transition group-hover:text-primary">{item.title}</h3>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                      <time>{new Date(item.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                      <span>{signal.hits.slice(0, 2).map((hit) => hit.label).join(' · ') || '未命中强规则'}</span>
                    </div>
                  </button>
                  <a href={item.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">查看原文 <ExternalLink className="size-3" /></a>
                </article>
              );
            }) : (
              <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{loading ? '正在抓取最新新闻…' : '新闻源暂时不可用，可继续粘贴新闻判断。'}</div>
            )}
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-2 border-t border-border/70 pt-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>金价：Gold API · 汇率：ExchangeRate-API · 新闻：Google News RSS · 仅供研究。</p>
          <p>框架：实际利率 / 美元 / 央行需求 / 避险 / 通胀 / ETF资金</p>
        </footer>

        <details className="mt-3 rounded-xl border border-border/60 bg-card/45 px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">规则来源与局限</summary>
          <div className="mt-3 grid gap-4 leading-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-medium text-foreground/80">小Lin说 · 主要相关视频</p>
              <ul className="list-inside list-disc">
                <li><a className="hover:text-primary" href="https://www.bilibili.com/video/BV19r421u7af/" target="_blank" rel="noreferrer">一口气了解黄金</a></li>
                <li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=iGz2uWl-kGc" target="_blank" rel="noreferrer">一口气了解美联储</a></li>
                <li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=u3Q9BpZOhP8" target="_blank" rel="noreferrer">关于利率，你需要知道的那些事儿</a></li>
                <li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=vHUZVwvvP7o" target="_blank" rel="noreferrer">一口气了解通货膨胀</a></li>
                <li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=Q73s8v_d46M" target="_blank" rel="noreferrer">汇率为什么涨跌｜美元跌宕50年</a></li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-foreground/80">交叉验证</p>
              <ul className="list-inside list-disc">
                <li><a className="hover:text-primary" href="https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-full-year-2024/central-banks" target="_blank" rel="noreferrer">世界黄金协会：央行购金</a></li>
                <li><a className="hover:text-primary" href="https://www.gold.org/goldhub/research/global-gold-etfs-popular-gateway-gold-market" target="_blank" rel="noreferrer">世界黄金协会：四类金价驱动</a></li>
                <li><a className="hover:text-primary" href="https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows" target="_blank" rel="noreferrer">世界黄金协会：黄金ETF资金流</a></li>
              </ul>
              <p className="mt-2">这是短线第一阶规则，不理解“超预期”的幅度，也不预测目标价。通胀与地缘冲突可能同时推高美元和利率，因此会出现低置信度或相反结果。</p>
            </div>
          </div>
        </details>
      </div>
    </main>
  );
}
