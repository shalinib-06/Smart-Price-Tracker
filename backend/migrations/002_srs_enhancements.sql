-- Migration 002: SRS Enhancements (Target Price, Percentage Alerts, Product Metadata)

-- Enhance tracked_items
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS target_price NUMERIC(12, 2);
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS alert_on_drop BOOLEAN DEFAULT TRUE;
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS alert_on_increase BOOLEAN DEFAULT FALSE;
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS alert_threshold_pct NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS retailer TEXT;
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE tracked_items ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT FALSE;

-- Enhance notifications_sent
ALTER TABLE notifications_sent ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent';
ALTER TABLE notifications_sent ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Users table for multi-user / Telegram linking
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  telegram_chat_id TEXT,
  telegram_verified BOOLEAN DEFAULT FALSE,
  notification_prefs JSONB DEFAULT '{"alert_on_drop": true, "alert_on_increase": false, "threshold_pct": 0}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default user if not exists
INSERT INTO users (user_id, telegram_chat_id, telegram_verified)
VALUES ('default', '5560397163', true)
ON CONFLICT (user_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id;