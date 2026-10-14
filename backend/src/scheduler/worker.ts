import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { scrape } from '../scraper';
import { triggerNotifications } from '../notify';

const router = Router();

const WorkSchema = z.object({ item_id: z.string().uuid() });

// POST /scrape/work -- Scrape item, update price_history, evaluate alert conditions
router.post('/work', async (req: Request, res: Response) => {
  const parsed = WorkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { item_id } = parsed.data;
  console.log('[worker] Checking item', item_id);

  const item = await queryOne<{
    id: string;
    user_id: string;
    url: string;
    selector: string;
    label: string | null;
    retailer: string | null;
    currency: string | null;
    target_price: string | null;
    alert_on_drop: boolean;
    alert_on_increase: boolean;
    alert_threshold_pct: string | null;
    is_paused: boolean;
    status: string;
  }>(
    'SELECT id, user_id, url, selector, label, retailer, currency, target_price, alert_on_drop, alert_on_increase, alert_threshold_pct, is_paused, status FROM tracked_items WHERE id = $1 AND deleted_at IS NULL',
    [item_id]
  );

  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  if (item.is_paused) {
    console.log(`[worker] Skipping paused item ${item_id}`);
    res.json({ ok: true, skipped: 'paused', item_id });
    return;
  }

  const lastRow = await queryOne<{ price: string | null; raw_text: string | null; in_stock: boolean }>(
    'SELECT price, raw_text, in_stock FROM price_history WHERE item_id = $1 ORDER BY checked_at DESC LIMIT 1',
    [item_id]
  );

  let scrapeResult;
  try {
    scrapeResult = await scrape(item.url, item.selector);
  } catch (err: any) {
    console.error('[worker] Scrape failed for item', item_id, ':', err.message);
    await query('UPDATE tracked_items SET status = $1, last_checked = now() WHERE id = $2', ['failed', item_id]);
    res.status(200).json({ ok: false, error: 'Scrape failed', item_id });
    return;
  }

  // Insert observation into price_history
  await query(
    'INSERT INTO price_history (item_id, price, raw_text, in_stock) VALUES ($1, $2, $3, $4)',
    [item_id, scrapeResult.price, scrapeResult.rawText, scrapeResult.inStock]
  );

  const updatedCurrency = item.currency && item.currency !== 'USD' ? item.currency : scrapeResult.currency;
  await query('UPDATE tracked_items SET status = $1, currency = $2, last_checked = now() WHERE id = $3', ['ok', updatedCurrency, item_id]);

  // Alert condition evaluation
  const oldPrice = lastRow && lastRow.price !== null ? Number(lastRow.price) : null;
  const newPrice = scrapeResult.price;
  const targetPrice = item.target_price ? Number(item.target_price) : null;
  const thresholdPct = Number(item.alert_threshold_pct || 0);

  const restocked = lastRow && !lastRow.in_stock && scrapeResult.inStock;
  const wentOutOfStock = lastRow && lastRow.in_stock && !scrapeResult.inStock;

  let shouldNotify = false;
  let changeType: 'price_change' | 'price_drop' | 'price_increase' | 'target_reached' | 'restock' | 'out_of_stock' = 'price_change';
  let eventExplanation = '';

  if (restocked) {
    shouldNotify = true;
    changeType = 'restock';
    eventExplanation = 'Product is back in stock!';
  } else if (wentOutOfStock) {
    // Optionally log out of stock
    changeType = 'out_of_stock';
  } else if (oldPrice !== null && newPrice !== null && Math.abs(oldPrice - newPrice) > 0.01) {
    const diff = newPrice - oldPrice;
    const absPct = (Math.abs(diff) / oldPrice) * 100;

    // Check target price condition first
    const hitTarget = targetPrice !== null && newPrice <= targetPrice && (oldPrice > targetPrice || oldPrice === null);

    if (hitTarget) {
      shouldNotify = true;
      changeType = 'target_reached';
      eventExplanation = `Target price of ${item.currency || '$'}${targetPrice.toFixed(2)} reached!`;
    } else if (newPrice < oldPrice && item.alert_on_drop) {
      if (absPct >= thresholdPct) {
        shouldNotify = true;
        changeType = 'price_drop';
        eventExplanation = `Price decreased by ${absPct.toFixed(1)}% (Threshold: ${thresholdPct}%)`;
      }
    } else if (newPrice > oldPrice && item.alert_on_increase) {
      if (absPct >= thresholdPct) {
        shouldNotify = true;
        changeType = 'price_increase';
        eventExplanation = `Price increased by ${absPct.toFixed(1)}% (Threshold: ${thresholdPct}%)`;
      }
    }
  }

  if (shouldNotify) {
    await triggerNotifications({
      itemId: item_id,
      userId: item.user_id,
      label: item.label,
      retailer: item.retailer,
      url: item.url,
      oldPrice,
      newPrice,
      targetPrice,
      oldRawText: lastRow?.raw_text ?? null,
      newRawText: scrapeResult.rawText,
      wasInStock: lastRow ? Boolean(lastRow.in_stock) : true,
      isInStock: scrapeResult.inStock,
      changeType,
      eventExplanation,
    });
  }

  res.json({
    ok: true,
    item_id,
    scrapeResult,
    evaluation: {
      oldPrice,
      newPrice,
      targetPrice,
      shouldNotify,
      changeType,
      eventExplanation,
    },
  });
});

export default router;