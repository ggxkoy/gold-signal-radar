const FEEDS = [
  { source: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { source: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
  { source: 'MarketWatch', url: 'https://www.marketwatch.com/rss/topstories' },
  { source: 'WSJ Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { source: 'Investing.com', url: 'https://www.investing.com/rss/news_285.rss' },
];

const RELEVANT = /gold|bullion|xau|federal reserve|\bfed\b|rate cut|rate hike|interest rate|yield|inflation|\bcpi\b|dollar|central bank|geopolit|war|conflict|sanction|tariff|recession|黄金|美联储|利率|收益率|通胀|美元|央行|冲突|制裁|衰退/i;

function decodeXml(value: string) {
  return value
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function tag(block: string, name: string) {
  return decodeXml(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.trim() ?? '');
}

function publishedAt(block: string) {
  const value = tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'dc:date');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export async function GET() {
  try {
    const results = await Promise.allSettled(FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 GoldSignal/1.0' },
        signal: AbortSignal.timeout(7_000),
      });
      if (!response.ok) throw new Error(`${feed.source} ${response.status}`);
      const xml = await response.text();
      return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => ({
        title: tag(match[1], 'title').replace(/<[^>]+>/g, ''),
        link: tag(match[1], 'link'),
        publishedAt: publishedAt(match[1]),
        source: feed.source,
      }));
    }));

    const items = results
      .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .filter((item) => item.title && item.link && RELEVANT.test(item.title))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 16);

    if (!items.length) throw new Error('No relevant news');

    return Response.json({ items }, { headers: { 'Cache-Control': 'public, max-age=120' } });
  } catch {
    return Response.json({ items: [] }, { status: 502 });
  }
}
