'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FlaskConical,
  Gauge,
  Newspaper,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  Timer,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { analyse, type RuleStat } from '@/lib/gold-rules';
import type { LiveNews } from '@/lib/live-news';
import type { MarketData } from '@/lib/market-data';
import { deriveMarketSentiment, type MarketMomentum } from '@/lib/market-sentiment';

type PredictionRecord = {
  id: number;
  headline: string;
  source: string;
  predicted_at: number;
  due_at: number;
  predicted_direction: '涨' | '跌';
  signal_strength: number;
  entry_cny_gram: number;
  settled_at: number | null;
  exit_cny_gram: number | null;
  actual_direction: '涨' | '跌' | null;
  correct: number | null;
};

type TrainingPayload = {
  market: MarketData;
  marketMomentum: MarketMomentum;
  items: LiveNews[];
  horizonHours: number;
  summary: {
    total: number;
    pending: number;
    settled: number;
    neutral: number;
    hits: number;
    accuracy: number | null;
    minimumSample: number;
    minimumMoveCnyGram: number;
  };
  ruleStats: RuleStat[];
  recentPredictions: PredictionRecord[];
};

const EMPTY_SUMMARY = { total: 0, pending: 0, settled: 0, neutral: 0, hits: 0, accuracy: null, minimumSample: 30, minimumMoveCnyGram: 3.8 };
const EXAMPLES = [
  '美国非农就业低于预期，市场上调美联储降息押注，美元指数回落。',
  '美国通胀超预期反弹，美债收益率走高，市场下调降息预期。',
];

function percent(value: number | null) {
  return value === null ? '待结算' : `${(value * 100).toFixed(1)}%`;
}

export default function Home() {
  const [news, setNews] = useState(EXAMPLES[0]);
  const [liveNews, setLiveNews] = useState<LiveNews[]>([]);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [marketMomentum, setMarketMomentum] = useState<MarketMomentum>(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [ruleStats, setRuleStats] = useState<RuleStat[]>([]);
  const [recentPredictions, setRecentPredictions] = useState<PredictionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [trainingAvailable, setTrainingAvailable] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const result = useMemo(() => analyse(news, ruleStats), [news, ruleStats]);
  const sentiment = useMemo(
    () => deriveMarketSentiment(liveNews, ruleStats, marketMomentum),
    [liveNews, ruleStats, marketMomentum],
  );
  const isUp = result.direction === '涨';

  const fallbackRefresh = useCallback(async () => {
    const [goldResponse, fxResponse, newsResponse] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store' }),
      fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' }),
      fetch('/api/news', { cache: 'no-store' }),
    ]);
    const gold = await goldResponse.json() as { price: number; updatedAt: string };
    const fx = await fxResponse.json() as { rates: { CNY: number } };
    const newsData = await newsResponse.json() as { items: LiveNews[] };
    setMarket({
      usdOz: gold.price,
      usdCny: fx.rates.CNY,
      cnyGram: (gold.price * fx.rates.CNY) / 31.1034768,
      updatedAt: gold.updatedAt,
    });
    setLiveNews(newsData.items);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/training', { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error('training unavailable');
      const data = await response.json() as TrainingPayload;
      setMarket(data.market);
      setMarketMomentum(data.marketMomentum);
      setLiveNews(data.items);
      setSummary(data.summary);
      setRuleStats(data.ruleStats);
      setRecentPredictions(data.recentPredictions);
      setTrainingAvailable(true);
    } catch {
      setTrainingAvailable(false);
      await fallbackRefresh();
    } finally {
      setLastRefresh(new Date());
      setLoading(false);
    }
  }, [fallbackRefresh]);

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
            <div><p className="font-serif text-[20px] leading-none tracking-tight">金价雷达</p><p className="mt-1 text-[10px] tracking-[.18em] text-muted-foreground">GOLD SIGNAL</p></div>
          </div>
          <Badge className="gap-1.5 border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_currentColor]" />监测中</Badge>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-[1.3fr_.7fr]">
          <Card className="gold-surface border-0 py-0 ring-0">
            <CardContent className="flex min-h-[148px] flex-col justify-between p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs tracking-[.16em] text-white/55">AU / CNY · 人民币金价</p>
                  <div className="mt-2 flex items-end gap-3"><span className="font-serif text-4xl tracking-tight text-white sm:text-5xl">{market ? `¥${market.cnyGram.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}` : '—'}</span><span className="pb-1 text-xs text-white/55">元/克</span></div>
                  {market && <p className="mt-2 text-[11px] text-white/45">国际金价 ${market.usdOz.toLocaleString('en-US', { maximumFractionDigits: 2 })}/盎司 · USD/CNY {market.usdCny.toFixed(4)}</p>}
                </div>
                <Button aria-label="刷新金价和新闻" onClick={() => void refresh()} disabled={loading} variant="ghost" size="icon" className="text-white/70 hover:bg-white/10 hover:text-white"><RefreshCw className={loading ? 'animate-spin' : ''} /></Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/50"><Clock3 className="size-3.5" />{lastRefresh ? `${lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新 · 每2分钟刷新` : '正在连接实时数据'}</div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80 py-0 shadow-none">
            <CardContent className="flex h-full min-h-[148px] flex-col justify-between p-5 sm:p-6">
              <div className="flex items-center justify-between"><div><p className="text-xs tracking-[.14em] text-muted-foreground">当前规则信号</p><p className="mt-1 text-[11px] text-muted-foreground">不是准确率</p></div><Scale className="size-4 text-muted-foreground" /></div>
              <div className="flex items-end justify-between gap-3">
                <div className={`flex items-center gap-2 font-serif text-5xl ${isUp ? 'text-up' : 'text-down'}`}>{isUp ? <ArrowUpRight className="size-9" /> : <ArrowDownRight className="size-9" />}{result.direction}</div>
                <div className="pb-1 text-right"><p className="text-xl font-semibold">{result.signalStrength}</p><p className="text-xs text-muted-foreground">规则强度 / 100</p></div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-5">
          <Card className="border-primary/20 bg-card/80 shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 lg:max-w-[430px]">
                  <div className="flex items-center gap-2">
                    <Gauge className="size-4 text-primary" />
                    <h2 className="font-medium">黄金市场情绪</h2>
                    <Badge variant="outline">不是准确率</Badge>
                  </div>
                  <div className="mt-3 flex items-end gap-3">
                    <span className={`font-serif text-4xl ${sentiment.score > 19 ? 'text-up' : sentiment.score < -19 ? 'text-down' : 'text-foreground'}`}>{sentiment.label}</span>
                    <span className="pb-1 text-sm tabular-nums text-muted-foreground">{sentiment.score > 0 ? '+' : ''}{sentiment.score} / 100</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">置信度 {sentiment.confidence} · 命中 {sentiment.relevantNews} 条有效新闻{marketMomentum ? ` · ${marketMomentum.hours}小时价格动量` : ' · 价格历史积累中'}</p>
                </div>

                <div className="w-full flex-1 lg:max-w-[610px]">
                  <div className="relative h-2 overflow-visible rounded-full bg-gradient-to-r from-down/70 via-muted to-up/70">
                    <span className="absolute left-1/2 top-[-4px] h-4 w-px bg-foreground/30" />
                    <span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow" style={{ left: `${(sentiment.score + 100) / 2}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>偏空</span><span>中性</span><span>偏多</span></div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {[
                      ['宏观新闻', sentiment.components.macro],
                      ['避险/资金', sentiment.components.riskAndFlow],
                      ['价格动量', sentiment.components.momentum],
                    ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border/65 bg-background/40 px-3 py-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${Number(value) > 0 ? 'text-up' : Number(value) < 0 ? 'text-down' : ''}`}>{Number(value) > 0 ? '+' : ''}{value}</p></div>)}
                  </div>
                  <p className="mt-3 truncate text-[11px] text-muted-foreground">主要驱动：{sentiment.drivers.join(' · ') || '暂无方向一致的有效信号'}</p>
                </div>
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
              <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-xs tracking-[.14em] text-muted-foreground">方向拆解</p><p className="mt-1 text-sm">利多 {result.up.toFixed(1)} 分 · 利空 {result.down.toFixed(1)} 分</p></div><Badge variant="outline" className={isUp ? 'border-up/25 text-up' : 'border-down/25 text-down'}>净分 {result.score > 0 ? '+' : ''}{result.score.toFixed(1)}</Badge></div>
              <div className="space-y-2">
                {result.hits.length ? result.hits.map((hit) => <div key={hit.label} className="flex items-start gap-3 rounded-xl border border-border/65 bg-background/45 p-3"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${hit.direction === '涨' ? 'bg-up' : 'bg-down'}`} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{hit.label}</p><span className={`text-xs ${hit.direction === '涨' ? 'text-up' : 'text-down'}`}>{hit.direction} · {hit.effectiveWeight.toFixed(1)}分</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{hit.reason}{hit.samples >= 20 && hit.accuracy !== null ? ` · 历史 ${(hit.accuracy * 100).toFixed(0)}%（n=${hit.samples}）` : ''}</p></div></div>) : <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-6 text-muted-foreground">未命中明确规则，规则强度为 0；这个结果不会进入训练样本。</div>}
              </div>
              <div className="mt-4 flex gap-2 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" />信号只反映新闻的第一阶影响，不构成投资建议。</div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-5">
          <Card className="border-primary/20 bg-card/80 shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><div className="flex items-center gap-2"><FlaskConical className="size-4 text-primary" /><h2 className="font-medium">准确度实验室</h2><Badge variant="outline">24小时结算</Badge></div><p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">系统记录预测时金价。24小时后，只有每克涨跌幅达到 ¥{summary.minimumMoveCnyGram.toFixed(1)} 才结算方向；中间区域记为震荡，不进入命中率。</p></div>
                {summary.settled < summary.minimumSample && <Badge className="bg-amber-300/10 text-amber-200">样本积累中</Badge>}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-background/45 p-3 sm:p-4"><p className="text-[11px] text-muted-foreground">已结算</p><p className="mt-1 text-2xl font-semibold">{summary.settled}</p><p className="mt-1 text-[10px] text-muted-foreground">最低观察 {summary.minimumSample}</p></div>
                <div className="rounded-xl border border-border/70 bg-background/45 p-3 sm:p-4"><p className="text-[11px] text-muted-foreground">真实命中率</p><p className="mt-1 text-2xl font-semibold">{percent(summary.accuracy)}</p><p className="mt-1 text-[10px] text-muted-foreground">{summary.settled ? `${summary.hits} / ${summary.settled}` : '尚无到期样本'}</p></div>
                <div className="rounded-xl border border-border/70 bg-background/45 p-3 sm:p-4"><p className="text-[11px] text-muted-foreground">待结算</p><p className="mt-1 text-2xl font-semibold">{summary.pending}</p><p className="mt-1 text-[10px] text-muted-foreground">自动写入台账</p></div>
                <div className="rounded-xl border border-border/70 bg-background/45 p-3 sm:p-4"><p className="text-[11px] text-muted-foreground">震荡剔除</p><p className="mt-1 text-2xl font-semibold">{summary.neutral}</p><p className="mt-1 text-[10px] text-muted-foreground">幅度小于 ¥{summary.minimumMoveCnyGram.toFixed(1)}</p></div>
              </div>

              {!trainingAvailable && <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-100">训练台账暂时不可用；实时金价与规则判断仍可使用。</div>}

              <div className="mt-5 border-t border-border/70 pt-4">
                <div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium">最近预测台账</p><p className="text-[11px] text-muted-foreground">只有命中明确规则的新闻才入库</p></div>
                <div className="space-y-2">
                  {recentPredictions.length ? recentPredictions.slice(0, 6).map((prediction) => {
                    const settled = prediction.settled_at !== null;
                    const neutral = settled && prediction.correct === null;
                    return <div key={prediction.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border/60 bg-background/35 px-3 py-2.5">
                      {neutral ? <Scale className="size-4 text-muted-foreground" /> : settled ? prediction.correct ? <CheckCircle2 className="size-4 text-up" /> : <XCircle className="size-4 text-down" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                      <div className="min-w-0"><p className="truncate text-xs">{prediction.headline}</p><p className="mt-1 text-[10px] text-muted-foreground">预测 {prediction.predicted_direction} · 入场 ¥{prediction.entry_cny_gram.toFixed(2)} · {settled ? `结算 ¥${prediction.exit_cny_gram?.toFixed(2)}` : `${new Date(prediction.due_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 到期`}</p></div>
                      <Badge variant="outline" className={neutral ? 'text-muted-foreground' : settled ? prediction.correct ? 'border-up/25 text-up' : 'border-down/25 text-down' : 'text-muted-foreground'}>{neutral ? '震荡' : settled ? prediction.correct ? '命中' : '未命中' : '等待'}</Badge>
                    </div>;
                  }) : <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground"><Timer className="mx-auto mb-2 size-4" />正在建立第一批 24 小时预测样本。</div>}
                </div>
              </div>

              <details className="mt-4 border-t border-border/70 pt-4 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">查看规则训练方法</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1.2fr]">
                  <p className="leading-6">每克变化不足 ¥{summary.minimumMoveCnyGram.toFixed(1)} 的样本先剔除。同一规则至少有效结算 20 次后才允许微调权重；权重最多只增减 25%。整体至少 30 个有效样本后，命中率才具备初步参考意义。</p>
                  <div className="space-y-1.5">{ruleStats.length ? ruleStats.slice(0, 6).map((stat) => <div key={stat.ruleLabel} className="flex items-center justify-between gap-3"><span>{stat.ruleLabel}</span><span className="tabular-nums">n={stat.samples} · {percent(stat.accuracy)} · 权重×{stat.multiplier.toFixed(2)}</span></div>) : <p>暂无已结算的规则样本。</p>}</div>
                </div>
              </details>
            </CardContent>
          </Card>
        </section>

        <section className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-4"><div><div className="flex items-center gap-2"><Newspaper className="size-4 text-primary" /><h2 className="font-medium">实时相关新闻</h2></div><p className="mt-1 text-xs text-muted-foreground">点击新闻即可把标题送入规则引擎</p></div><Button onClick={() => void refresh()} disabled={loading} variant="ghost" size="sm" className="text-muted-foreground"><RefreshCw className={loading ? 'animate-spin' : ''} />刷新</Button></div>
          <div className="grid gap-2 md:grid-cols-2">
            {liveNews.length ? liveNews.slice(0, 8).map((item) => {
              const signal = analyse(item.title, ruleStats);
              const signalUp = signal.direction === '涨';
              return <article key={`${item.link}-${item.publishedAt}`} className="group rounded-xl border border-border/70 bg-card/65 p-4 transition hover:border-primary/35 hover:bg-card">
                <button type="button" onClick={() => { setNews(item.title); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full text-left">
                  <div className="mb-2 flex items-center justify-between gap-3"><Badge variant="outline" className={signal.hits.length ? signalUp ? 'border-up/25 text-up' : 'border-down/25 text-down' : 'text-muted-foreground'}>{signal.hits.length ? `${signal.direction} · 强度 ${signal.signalStrength}` : '无强信号'}</Badge><span className="truncate text-[11px] text-muted-foreground">{item.source}</span></div>
                  <h3 className="line-clamp-2 text-sm leading-6 transition group-hover:text-primary">{item.title}</h3>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><time>{new Date(item.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time><span>{signal.hits.slice(0, 2).map((hit) => hit.label).join(' · ') || '未命中规则'}</span></div>
                </button>
                <a href={item.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">查看原文 <ExternalLink className="size-3" /></a>
              </article>;
            }) : <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{loading ? '正在抓取最新新闻…' : '新闻源暂时不可用，可继续粘贴新闻判断。'}</div>}
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-2 border-t border-border/70 pt-4 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>金价：Gold API · 汇率：ExchangeRate-API · 新闻：公开财经 RSS · 仅供研究。</p><p>训练口径：人民币/克 · 24小时 · ±¥{summary.minimumMoveCnyGram.toFixed(1)} 死区</p></footer>

        <details className="mt-3 rounded-xl border border-border/60 bg-card/45 px-4 py-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium text-foreground">规则来源与局限</summary>
          <div className="mt-3 grid gap-4 leading-6 sm:grid-cols-2">
            <div><p className="mb-1 font-medium text-foreground/80">小Lin说 · 主要相关视频</p><ul className="list-inside list-disc"><li><a className="hover:text-primary" href="https://www.bilibili.com/video/BV19r421u7af/" target="_blank" rel="noreferrer">一口气了解黄金</a></li><li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=iGz2uWl-kGc" target="_blank" rel="noreferrer">一口气了解美联储</a></li><li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=u3Q9BpZOhP8" target="_blank" rel="noreferrer">关于利率，你需要知道的那些事儿</a></li><li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=vHUZVwvvP7o" target="_blank" rel="noreferrer">一口气了解通货膨胀</a></li><li><a className="hover:text-primary" href="https://www.youtube.com/watch?v=Q73s8v_d46M" target="_blank" rel="noreferrer">汇率为什么涨跌｜美元跌宕50年</a></li></ul></div>
            <div><p className="mb-1 font-medium text-foreground/80">交叉验证</p><ul className="list-inside list-disc"><li><a className="hover:text-primary" href="https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-full-year-2024/central-banks" target="_blank" rel="noreferrer">世界黄金协会：央行购金</a></li><li><a className="hover:text-primary" href="https://www.gold.org/goldhub/research/global-gold-etfs-popular-gateway-gold-market" target="_blank" rel="noreferrer">世界黄金协会：四类金价驱动</a></li><li><a className="hover:text-primary" href="https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows" target="_blank" rel="noreferrer">世界黄金协会：黄金ETF资金流</a></li></ul><p className="mt-2">这是第一阶规则，不理解数据“超预期”的幅度，也不预测目标价。结算依赖到期后首次观测价格，未必恰好落在第24小时。</p></div>
          </div>
        </details>
      </div>
    </main>
  );
}
