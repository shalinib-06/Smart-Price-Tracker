import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// GET /items?user_id=xxx
router.get('/', async (req: Request, res: Response) => {
  const user_id = (req.query.user_id as string) || 'default';

  const sql = `
    SELECT
      t.id,
      t.url,
      t.selector,
      t.label,
      t.retailer,
      t.image_url,
      t.currency,
      t.target_price,
      t.alert_on_drop,
      t.alert_on_increase,
      t.alert_threshold_pct,
      t.is_paused,
      t.status,
      t.last_checked,
      t.created_at,
      ph.price        AS current_price,
      ph.raw_text     AS current_price_text,
      ph.in_stock     AS in_stock,
      ph.checked_at   AS last_price_at
    FROM tracked_items t
    LEFT JOIN LATERAL (
      SELECT price, raw_text, in_stock, checked_at
      FROM price_history
      WHERE item_id = t.id
      ORDER BY checked_at DESC
      LIMIT 1
    ) ph ON TRUE
    WHERE t.user_id = $1 AND t.deleted_at IS NULL
    ORDER BY t.created_at DESC
  `;

  const items = await query(sql, [user_id]);
  res.json(items);
});

// POST /items/telegram/disconnect — Unlinks telegram chat ID for user
router.post('/telegram/disconnect', async (req: Request, res: Response) => {
  const user_id = (req.body?.user_id as string) || (req.query?.user_id as string) || 'default';
  await query('UPDATE users SET telegram_chat_id = NULL, telegram_verified = false WHERE user_id = $1', [user_id]);
  res.json({ ok: true, message: 'Telegram disconnected successfully' });
});

// GET /items/telegram/status — Check if telegram is connected
router.get('/telegram/status', async (req: Request, res: Response) => {
  const user_id = (req.query?.user_id as string) || 'default';
  const user = await queryOne('SELECT telegram_chat_id, telegram_verified FROM users WHERE user_id = $1', [user_id]);
  res.json({
    connected: !!(user && user.telegram_chat_id && user.telegram_verified),
    chat_id: user?.telegram_chat_id || null,
  });
});

export default router;