import { fetchLiveNews } from '@/lib/live-news';

export async function GET() {
  try {
    const items = await fetchLiveNews();
    if (!items.length) throw new Error('No relevant news');
    return Response.json({ items }, { headers: { 'Cache-Control': 'public, max-age=120' } });
  } catch {
    return Response.json({ items: [] }, { status: 502 });
  }
}
