import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { scrape } from '../scraper';

const router = Router();

const TrackSchema = z.object({
  url:                 z.string().url('Invalid URL'),
  selector:            z.string().min(1, 'Selector required'),
  user_id:             z.string().optional().default('default'),
  label:               z.string().optional(),
  target_price:        z.number().positive().optional().nullable(),
  alert_on_drop:       z.boolean().optional().default(true),
  alert_on_increase:   z.boolean().optional().default(false),
  alert_threshold_pct: z.number().min(0).optional().default(0),
  image_url:           z.string().optional().nullable(),
  retailer:            z.string().optional().nullable(),
  currency:            z.string().optional().default('USD'),
  initialPrice:        z.number().optional().nullable(),
});

const UpdateTrackSchema = z.object({
  target_price:        z.number().positive().optional().nullable(),
  alert_on_drop:       z.boolean().optional(),
  alert_on_increase:   z.boolean().optional(),
  alert_threshold_pct: z.number().min(0).optional(),
  is_paused:           z.boolean().optional(),
  label:               z.string().optional(),
});

// POST /track — Add product to watchlist
router.post('/', async (req: Request, res: Response) => {
  const parsed = TrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;

  // Extract retailer from hostname if not provided
  const retailer = data.retailer || (() => {
    try {
      return new URL(data.url).hostname.replace(/^www\./, '');
    } catch {
      return 'Unknown';
    }
  })();

  const existing = await queryOne(
    'SELECT id FROM tracked_items WHERE user_id = $1 AND url = $2 AND selector = $3 AND deleted_at IS NULL',
    [data.user_id, data.url, data.selector]
  );

  let itemId: string;

  if (existing) {
    itemId = (existing as any).id;
    if (data.target_price !== undefined) {
      await query(
        `UPDATE tracked_items SET 
           target_price = COALESCE($1, target_price),
           alert_on_drop = COALESCE($2, alert_on_drop),
           alert_on_increase = COALESCE($3, alert_on_increase),
           alert_threshold_pct = COALESCE($4, alert_threshold_pct),
           image_url = COALESCE($5, image_url),
           label = COALESCE($6, label)
         WHERE id = $7`,
        [data.target_price, data.alert_on_drop, data.alert_on_increase, data.alert_threshold_pct, data.image_url, data.label, itemId]
      );
    }
  } else {
    const [item] = await query(
      `INSERT INTO tracked_items 
         (user_id, url, selector, label, target_price, alert_on_drop, alert_on_increase, alert_threshold_pct, image_url, retailer, currency) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING id, url, selector, label, target_price, status, created_at`,
      [
        data.user_id,
        data.url,
        data.selector,
        data.label ?? null,
        data.target_price ?? null,
        data.alert_on_drop,
        data.alert_on_increase,
        data.alert_threshold_pct,
        data.image_url ?? null,
        retailer,
        data.currency,
      ]
    );
    itemId = item.id;
  }

  // Auto-detect currency
  let detectedCurrency = data.currency;
  const lowerUrl = data.url.toLowerCase();
  if (lowerUrl.includes('.in') || lowerUrl.includes('flipkart') || lowerUrl.includes('myntra')) {
    detectedCurrency = 'INR';
  } else if (lowerUrl.includes('.co.uk')) {
    detectedCurrency = 'GBP';
  }

  // 1. Immediately save the user's initial price so the popup and bot display it instantly
  if (data.initialPrice !== undefined && data.initialPrice !== null) {
    const sym = detectedCurrency === 'INR' ? '\u20B9' : (detectedCurrency === 'GBP' ? '\u00A3' : '$');
    const rawText = `${sym}${data.initialPrice.toLocaleString('en-IN')}`;
    await query(
      'INSERT INTO price_history (item_id, price, raw_text, in_stock) VALUES ($1, $2, $3, true)',
      [itemId, data.initialPrice, rawText]
    );
    await query('UPDATE tracked_items SET status = $1, currency = $2, last_checked = now() WHERE id = $3', ['ok', detectedCurrency, itemId]);
  }

  // 2. Perform background verification scrape
  try {
    const scrapeResult = await scrape(data.url, data.selector);
    if (scrapeResult && scrapeResult.price !== null) {
      if (scrapeResult.currency && (!data.currency || data.currency === 'USD')) {
        detectedCurrency = scrapeResult.currency;
      }
      await query(
        'INSERT INTO price_history (item_id, price, raw_text, in_stock) VALUES ($1, $2, $3, $4)',
        [itemId, scrapeResult.price, scrapeResult.rawText, scrapeResult.inStock]
      );
      await query('UPDATE tracked_items SET status = $1, currency = $2, last_checked = now() WHERE id = $3', ['ok', detectedCurrency, itemId]);
    }
  } catch (err: any) {
    console.warn('[track] Initial scrape warning:', err.message);
  }

  res.status(201).json({ id: itemId, url: data.url, selector: data.selector, label: data.label, target_price: data.target_price, status: 'ok' });
});

// PATCH /items/:id — Update target price, alert preferences, pause/resume
router.patch('/items/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = UpdateTrackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;

  const updates: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (d.target_price !== undefined) {
    updates.push(`target_price = $${paramIdx++}`);
    params.push(d.target_price);
  }
  if (d.alert_on_drop !== undefined) {
    updates.push(`alert_on_drop = $${paramIdx++}`);
    params.push(d.alert_on_drop);
  }
  if (d.alert_on_increase !== undefined) {
    updates.push(`alert_on_increase = $${paramIdx++}`);
    params.push(d.alert_on_increase);
  }
  if (d.alert_threshold_pct !== undefined) {
    updates.push(`alert_threshold_pct = $${paramIdx++}`);
    params.push(d.alert_threshold_pct);
  }
  if (d.is_paused !== undefined) {
    updates.push(`is_paused = $${paramIdx++}`);
    params.push(d.is_paused);
  }
  if (d.label !== undefined) {
    updates.push(`label = $${paramIdx++}`);
    params.push(d.label);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields provided to update' });
    return;
  }

  params.push(id);
  const sql = `UPDATE tracked_items SET ${updates.join(', ')} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING id, target_price, alert_on_drop, alert_on_increase, alert_threshold_pct, is_paused, label`;
  const result = await query(sql, params);

  if (result.length === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  res.json({ ok: true, item: result[0] });
});

// DELETE /items/:id — Soft delete
router.delete('/items/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await query(
    'UPDATE tracked_items SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
    [id]
  );
  if (result.length === 0) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }
  res.json({ deleted: true, id });
});

export default router;