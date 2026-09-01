import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '金价雷达 · Gold Signal',
    short_name: '金价雷达',
    description: '实时金价、相关新闻与透明的涨跌规则判断。',
    start_url: '/',
    display: 'standalone',
    background_color: '#181713',
    theme_color: '#181713',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
