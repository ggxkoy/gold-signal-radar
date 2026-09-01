const RSS_URL = 'https://news.google.com/rss/search?q=%E9%BB%84%E9%87%91+OR+%E7%BE%8E%E8%81%94%E5%82%A8+OR+%E7%BE%8E%E5%85%83%E6%8C%87%E6%95%B0+OR+%E7%BE%8E%E5%80%BA%E6%94%B6%E7%9B%8A%E7%8E%87+OR+%E5%A4%AE%E8%A1%8C%E8%B4%AD%E9%87%91+OR+%E9%80%9A%E8%83%80&hl=zh-CN&gl=CN&ceid=CN:zh-Hans';

function decodeXml(value: string) {
  return value
    .replaceAll('<![CDATA[', '')
    .replaceAll(']]>', '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function tag(block: string, name: string) {
  return decodeXml(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]?.trim() ?? '');
}

export async function GET() {
  try {
    const response = await fetch(RSS_URL, {
      headers: { 'User-Agent': 'GoldSignal/1.0 (+https://openai.com)' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`RSS ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 16).map((match) => ({
      title: tag(match[1], 'title'),
      link: tag(match[1], 'link'),
      publishedAt: new Date(tag(match[1], 'pubDate')).toISOString(),
      source: tag(match[1], 'source') || 'Google News',
    })).filter((item) => item.title && item.link);

    return Response.json({ items }, { headers: { 'Cache-Control': 'public, max-age=120' } });
  } catch {
    return Response.json({ items: [] }, { status: 502 });
  }
}
