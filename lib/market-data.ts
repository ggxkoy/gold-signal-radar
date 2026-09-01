export type MarketData = {
  usdOz: number;
  usdCny: number;
  cnyGram: number;
  updatedAt: string;
};

type GoldResponse = { price: number; updatedAt: string };
type FxResponse = { rates: { CNY: number } };

export async function fetchMarketData(): Promise<MarketData> {
  const [goldResponse, fxResponse] = await Promise.all([
    fetch('https://api.gold-api.com/price/XAU', { cache: 'no-store', signal: AbortSignal.timeout(8_000) }),
    fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store', signal: AbortSignal.timeout(8_000) }),
  ]);
  if (!goldResponse.ok || !fxResponse.ok) throw new Error('Market data unavailable');
  const [gold, fx] = await Promise.all([
    goldResponse.json() as Promise<GoldResponse>,
    fxResponse.json() as Promise<FxResponse>,
  ]);
  const usdCny = fx.rates.CNY;
  return {
    usdOz: gold.price,
    usdCny,
    cnyGram: (gold.price * usdCny) / 31.1034768,
    updatedAt: gold.updatedAt,
  };
}
