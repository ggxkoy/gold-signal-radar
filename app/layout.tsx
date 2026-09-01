import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '金价雷达 · Gold Signal',
  description: '根据实时金价新闻，用透明规则判断黄金短线方向。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: '金价雷达', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: '金价雷达 · Gold Signal',
    description: '实时新闻 · 规则判断 · 涨跌信号',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '金价雷达' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '金价雷达 · Gold Signal',
    description: '实时新闻 · 规则判断 · 涨跌信号',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#181713',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
