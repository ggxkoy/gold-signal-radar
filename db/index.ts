import { env } from 'cloudflare:workers';

export function getD1() {
  if (!env.DB) throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  return env.DB;
}

export async function ensureSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at INTEGER NOT NULL,
      usd_oz REAL NOT NULL,
      usd_cny REAL NOT NULL,
      cny_gram REAL NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      headline TEXT NOT NULL,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      predicted_at INTEGER NOT NULL,
      horizon_hours INTEGER NOT NULL DEFAULT 24,
      predicted_direction TEXT NOT NULL CHECK (predicted_direction IN ('涨','跌')),
      raw_score REAL NOT NULL,
      signal_strength INTEGER NOT NULL,
      entry_cny_gram REAL NOT NULL,
      due_at INTEGER NOT NULL,
      settled_at INTEGER,
      exit_cny_gram REAL,
      actual_direction TEXT CHECK (actual_direction IN ('涨','跌')),
      correct INTEGER
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prediction_rules (
      prediction_id INTEGER NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
      rule_label TEXT NOT NULL,
      rule_direction TEXT NOT NULL CHECK (rule_direction IN ('涨','跌')),
      base_weight REAL NOT NULL,
      PRIMARY KEY (prediction_id, rule_label)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_price_snapshots_captured_at ON price_snapshots(captured_at)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_predictions_fingerprint ON predictions(fingerprint)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_predictions_due_unsettled ON predictions(due_at, settled_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_predictions_predicted_at ON predictions(predicted_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_prediction_rules_label ON prediction_rules(rule_label)'),
  ]);
  await db.prepare('PRAGMA optimize').run();
  return db;
}
