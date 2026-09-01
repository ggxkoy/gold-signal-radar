import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const priceSnapshots = sqliteTable('price_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  capturedAt: integer('captured_at').notNull(),
  usdOz: real('usd_oz').notNull(),
  usdCny: real('usd_cny').notNull(),
  cnyGram: real('cny_gram').notNull(),
}, (table) => [index('idx_price_snapshots_captured_at').on(table.capturedAt)]);

export const predictions = sqliteTable('predictions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fingerprint: text('fingerprint').notNull(),
  headline: text('headline').notNull(),
  source: text('source').notNull(),
  url: text('url').notNull(),
  predictedAt: integer('predicted_at').notNull(),
  horizonHours: integer('horizon_hours').notNull().default(24),
  predictedDirection: text('predicted_direction', { enum: ['涨', '跌'] }).notNull(),
  rawScore: real('raw_score').notNull(),
  signalStrength: integer('signal_strength').notNull(),
  entryCnyGram: real('entry_cny_gram').notNull(),
  dueAt: integer('due_at').notNull(),
  settledAt: integer('settled_at'),
  exitCnyGram: real('exit_cny_gram'),
  actualDirection: text('actual_direction', { enum: ['涨', '跌'] }),
  correct: integer('correct'),
}, (table) => [
  uniqueIndex('idx_predictions_fingerprint').on(table.fingerprint),
  index('idx_predictions_due_unsettled').on(table.dueAt, table.settledAt),
  index('idx_predictions_predicted_at').on(table.predictedAt),
]);

export const predictionRules = sqliteTable('prediction_rules', {
  predictionId: integer('prediction_id').notNull().references(() => predictions.id, { onDelete: 'cascade' }),
  ruleLabel: text('rule_label').notNull(),
  ruleDirection: text('rule_direction', { enum: ['涨', '跌'] }).notNull(),
  baseWeight: real('base_weight').notNull(),
}, (table) => [
  primaryKey({ columns: [table.predictionId, table.ruleLabel] }),
  index('idx_prediction_rules_label').on(table.ruleLabel),
]);
