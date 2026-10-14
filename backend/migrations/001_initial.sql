-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table: tracked_items
CREATE TABLE IF NOT EXISTS tracked_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL DEFAULT 'default',
  url           TEXT NOT NULL,
  selector      TEXT NOT NULL,
  label         TEXT,
  status        TEXT NOT NULL DEFAULT 'ok',
  last_checked  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tracked_items_user_id ON tracked_items(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_items_status ON tracked_items(status);

-- Table: price_history
CREATE TABLE IF NOT EXISTS price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
  price       NUMERIC(12, 2),
  raw_text    TEXT,
  in_stock    BOOLEAN DEFAULT TRUE,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_history_item_id ON price_history(item_id);
CREATE INDEX IF NOT EXISTS idx_price_history_checked_at ON price_history(checked_at DESC);

-- Table: notifications_sent
CREATE TABLE IF NOT EXISTS notifications_sent (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  message     TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table: push_subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);