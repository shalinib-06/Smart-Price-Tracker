import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db';

const router = Router();

// GET /items/:id/history — price history with statistical analytics
router.get('/:id/history', async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const item = await queryOne(
    'SELECT id, label, retailer, target_price, currency, url FROM tracked_items WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const history = await query(
    'SELECT id, item_id, price, raw_text, in_stock, checked_at FROM price_history WHERE item_id = $1 ORDER BY checked_at DESC LIMIT $2',
    [id, limit]
  );

  const chronological = history.reverse();

  // Calculate statistics (min, max, avg, volatility)
  const validPrices = chronological
    .map((r) => (r.price !== null && r.price !== undefined ? Number(r.price) : null))
    .filter((p): p is number => p !== null && !isNaN(p));

  let stats = {
    min_price: null as number | null,
    max_price: null as number | null,
    avg_price: null as number | null,
    total_checks: chronological.length,
    current_price: validPrices.length > 0 ? validPrices[validPrices.length - 1] : null,
    target_price: item.target_price ? Number(item.target_price) : null,
  };

  if (validPrices.length > 0) {
    const min = Math.min(...validPrices);
    const max = Math.max(...validPrices);
    const sum = validPrices.reduce((a, b) => a + b, 0);
    const avg = parseFloat((sum / validPrices.length).toFixed(2));
    stats.min_price = min;
    stats.max_price = max;
    stats.avg_price = avg;
  }

  res.json({
    item: {
      id: item.id,
      label: item.label,
      retailer: item.retailer,
      target_price: item.target_price,
      currency: item.currency,
      url: item.url,
    },
    stats,
    history: chronological,
  });
});

export default router;