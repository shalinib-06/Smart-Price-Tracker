import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { triggerNotifications } from '../notify';

const router = Router();

const SimSchema = z.object({
  item_id: z.string().uuid().optional(),
  simulated_price: z.number().positive(),
  in_stock: z.boolean().optional().default(true),
});

// POST /simulate/price-change — Simulates a real price change on an item to demonstrate Telegram alerts
router.post('/price-change', async (req: Request, res: Response) => {
  const parsed = SimSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { simulated_price, in_stock } = parsed.data;

  // If item_id not provided, pick the latest tracked item
  let item: any;
  if (parsed.data.item_id) {
    item = await queryOne('SELECT * FROM tracked_items WHERE id = $1 AND deleted_at IS NULL', [parsed.data.item_id]);
  } else {
    item = await queryOne('SELECT * FROM tracked_items WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1');
  }

  if (!item) {
    res.status(404).json({ error: 'No tracked items found. Track an item first!' });
    return;
  }

  // Get last price from history
  const lastRow = await queryOne(
    'SELECT price, raw_text, in_stock FROM price_history WHERE item_id = $1 ORDER BY checked_at DESC LIMIT 1',
    [item.id]
  );

  const oldPrice = lastRow && lastRow.price !== null ? Number(lastRow.price) : 51.77;
  const newPrice = simulated_price;
  const targetPrice = item.target_price ? Number(item.target_price) : null;

  // Insert simulated record into price_history
  const rawText = `$${newPrice.toFixed(2)}`;
  await query(
    'INSERT INTO price_history (item_id, price, raw_text, in_stock) VALUES ($1, $2, $3, $4)',
    [item.id, newPrice, rawText, in_stock]
  );
  await query('UPDATE tracked_items SET last_checked = now() WHERE id = $1', [item.id]);

  // Determine event type
  let changeType: 'price_change' | 'price_drop' | 'price_increase' | 'target_reached' | 'restock' = 'price_change';
  let eventExplanation = '';

  const hitTarget = targetPrice !== null && newPrice <= targetPrice;

  if (hitTarget) {
    changeType = 'target_reached';
    eventExplanation = `Target price of ${item.currency || '$'}${targetPrice.toFixed(2)} reached!`;
  } else if (newPrice < oldPrice) {
    const diff = oldPrice - newPrice;
    const pct = ((diff / oldPrice) * 100).toFixed(1);
    changeType = 'price_drop';
    eventExplanation = `Price dropped by ${pct}% (-${item.currency || '$'}${diff.toFixed(2)})`;
  } else if (newPrice > oldPrice) {
    const diff = newPrice - oldPrice;
    const pct = ((diff / oldPrice) * 100).toFixed(1);
    changeType = 'price_increase';
    eventExplanation = `Price increased by ${pct}% (+${item.currency || '$'}${diff.toFixed(2)})`;
  }

  // Trigger Telegram notification
  await triggerNotifications({
    itemId: item.id,
    userId: item.user_id,
    label: item.label || 'Demo Product',
    retailer: item.retailer || 'Demo Store',
    url: item.url,
    oldPrice,
    newPrice,
    targetPrice,
    oldRawText: lastRow?.raw_text || `$${oldPrice.toFixed(2)}`,
    newRawText: rawText,
    wasInStock: lastRow ? Boolean(lastRow.in_stock) : true,
    isInStock: in_stock,
    changeType,
    eventExplanation,
  });

  res.json({
    ok: true,
    message: 'Simulated price change triggered & Telegram notification sent!',
    item: {
      id: item.id,
      label: item.label,
      oldPrice,
      newPrice,
      targetPrice,
      changeType,
      eventExplanation,
    },
  });
});

export default router;