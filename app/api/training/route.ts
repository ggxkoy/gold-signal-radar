import { getD1 } from '@/db';
import { analyse, ruleMultiplier, type RuleStat } from '@/lib/gold-rules';
import { fetchLiveNews } from '@/lib/live-news';
import { fetchMarketData } from '@/lib/market-data';

const HORIZON_HOURS = 24;
const HORIZON_MS = HORIZON_HOURS * 60 * 60 * 1_000;
const MIN_MOVE_CNY_GRAM = 3.8;

type RuleRow = { rule_label: string; samples: number; hits: number };

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getRuleStats(db: D1Database): Promise<RuleStat[]> {
  const { results } = await db.prepare(`
    SELECT pr.rule_label, COUNT(*) AS samples, COALESCE(SUM(p.correct), 0) AS hits
    FROM prediction_rules pr
    JOIN predictions p ON p.id = pr.prediction_id
    WHERE p.settled_at IS NOT NULL
    GROUP BY pr.rule_label
    ORDER BY samples DESC, pr.rule_label ASC
  `).all<RuleRow>();
  return results.map((row) => ({
    ruleLabel: row.rule_label,
    samples: Number(row.samples),
    hits: Number(row.hits),
    accuracy: Number(row.samples) ? Number(row.hits) / Number(row.samples) : null,
    multiplier: ruleMultiplier(Number(row.samples), Number(row.hits)),
  }));
}

async function getDashboard(db: D1Database, ruleStats: RuleStat[]) {
  const summary = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN settled_at IS NULL THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN settled_at IS NOT NULL AND correct IS NOT NULL THEN 1 ELSE 0 END) AS settled,
      SUM(CASE WHEN settled_at IS NOT NULL AND correct IS NULL THEN 1 ELSE 0 END) AS neutral,
      COALESCE(SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END), 0) AS hits
    FROM predictions
  `).first<{ total: number; pending: number; settled: number; neutral: number; hits: number }>();

  const { results: recentPredictions } = await db.prepare(`
    SELECT id, headline, source, predicted_at, due_at, predicted_direction,
           signal_strength, entry_cny_gram, settled_at, exit_cny_gram,
           actual_direction, correct
    FROM predictions
    ORDER BY predicted_at DESC
    LIMIT 10
  `).all();

  const settled = Number(summary?.settled ?? 0);
  const hits = Number(summary?.hits ?? 0);
  return {
    horizonHours: HORIZON_HOURS,
    summary: {
      total: Number(summary?.total ?? 0),
      pending: Number(summary?.pending ?? 0),
      settled,
      neutral: Number(summary?.neutral ?? 0),
      hits,
      accuracy: settled ? hits / settled : null,
      minimumSample: 30,
      minimumMoveCnyGram: MIN_MOVE_CNY_GRAM,
    },
    ruleStats,
    recentPredictions,
  };
}

export async function POST() {
  try {
    const db = getD1();
    const [market, items] = await Promise.all([fetchMarketData(), fetchLiveNews()]);
    const now = Date.now();

    await db.prepare(`
      INSERT INTO price_snapshots (captured_at, usd_oz, usd_cny, cny_gram)
      SELECT ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM price_snapshots WHERE captured_at > ?
      )
    `).bind(now, market.usdOz, market.usdCny, market.cnyGram, now - 60_000).run();

    await db.prepare(`
      UPDATE predictions
      SET settled_at = ?,
          exit_cny_gram = ?,
          actual_direction = CASE
            WHEN ? - entry_cny_gram >= ? THEN '涨'
            WHEN ? - entry_cny_gram <= -? THEN '跌'
            ELSE NULL
          END,
          correct = CASE
            WHEN ABS(? - entry_cny_gram) < ? THEN NULL
            WHEN predicted_direction = CASE WHEN ? - entry_cny_gram >= ? THEN '涨' ELSE '跌' END THEN 1
            ELSE 0
          END
      WHERE settled_at IS NULL AND due_at <= ?
    `).bind(
      now, market.cnyGram,
      market.cnyGram, MIN_MOVE_CNY_GRAM,
      market.cnyGram, MIN_MOVE_CNY_GRAM,
      market.cnyGram, MIN_MOVE_CNY_GRAM,
      market.cnyGram, MIN_MOVE_CNY_GRAM,
      now,
    ).run();

    const ruleStats = await getRuleStats(db);

    for (const item of items.slice(0, 8)) {
      const result = analyse(item.title, ruleStats);
      if (!result.hits.length || result.signalStrength < 40) continue;
      const key = await fingerprint(`${HORIZON_HOURS}:${item.link}`);
      const inserted = await db.prepare(`
        INSERT INTO predictions (
          fingerprint, headline, source, url, predicted_at, horizon_hours,
          predicted_direction, raw_score, signal_strength, entry_cny_gram, due_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fingerprint) DO NOTHING
        RETURNING id
      `).bind(
        key, item.title, item.source, item.link, now, HORIZON_HOURS,
        result.direction, result.score, result.signalStrength, market.cnyGram, now + HORIZON_MS,
      ).first<{ id: number }>();

      if (inserted?.id && result.hits.length) {
        await db.batch(result.hits.map((hit) => db.prepare(`
          INSERT OR IGNORE INTO prediction_rules
            (prediction_id, rule_label, rule_direction, base_weight)
          VALUES (?, ?, ?, ?)
        `).bind(inserted.id, hit.label, hit.direction, hit.weight)));
      }
    }

    const dashboard = await getDashboard(db, await getRuleStats(db));
    return Response.json({ market, items, ...dashboard }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('training refresh failed', error);
    return Response.json({ error: 'training_unavailable' }, { status: 503 });
  }
}
