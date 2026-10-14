import { query, queryOne } from '../db';
import { sendTelegramMessage, buildPriceAlertMessage, buildRestockMessage } from './telegram';

const DEDUP_WINDOW_MIN = 30;

async function wasRecentlyNotified(itemId: string, channel: string): Promise<boolean> {
  const sql = `SELECT id FROM notifications_sent WHERE item_id = $1 AND channel = $2 AND sent_at > now() - INTERVAL '${DEDUP_WINDOW_MIN} minutes' LIMIT 1`;
  const row = await queryOne(sql, [itemId, channel]);
  return !!row;
}

async function logNotification(itemId: string, channel: string, message: string): Promise<void> {
  await query(
    'INSERT INTO notifications_sent (item_id, channel, message, delivery_status) VALUES ($1, $2, $3, $4)',
    [itemId, channel, message, 'sent']
  );
}

export interface NotifyPayload {
  itemId: string;
  userId?: string;
  label: string | null;
  retailer?: string | null;
  url: string;
  oldPrice: number | null;
  newPrice: number | null;
  targetPrice?: number | null;
  oldRawText: string | null;
  newRawText: string | null;
  wasInStock: boolean;
  isInStock: boolean;
  changeType: 'price_change' | 'price_drop' | 'price_increase' | 'target_reached' | 'restock' | 'out_of_stock';
  eventExplanation?: string;
}

export async function triggerNotifications(payload: NotifyPayload): Promise<void> {
  const { itemId, label, url, changeType } = payload;
  const name = label ?? 'Tracked Item';

  let message: string;
  if (changeType === 'restock') {
    message = buildRestockMessage({
      label: name,
      retailer: payload.retailer,
      url,
      currentPrice: payload.newRawText,
    });
  } else {
    message = buildPriceAlertMessage({
      label: name,
      retailer: payload.retailer,
      url,
      oldPrice: payload.oldPrice,
      newPrice: payload.newPrice,
      targetPrice: payload.targetPrice,
      oldRawText: payload.oldRawText,
      newRawText: payload.newRawText,
      inStock: payload.isInStock,
      eventExplanation: payload.eventExplanation,
    });
  }

  const duped = await wasRecentlyNotified(itemId, 'telegram');
  if (!duped) {
    try {
      // Look up user's specific telegram chat ID if available
      let userChatId: string | undefined;
      if (payload.userId) {
        const user = await queryOne('SELECT telegram_chat_id FROM users WHERE user_id = $1', [payload.userId]);
        if (user?.telegram_chat_id) {
          userChatId = user.telegram_chat_id;
        }
      }

      await sendTelegramMessage({ text: message, chatId: userChatId });
      await logNotification(itemId, 'telegram', message);
    } catch (err) {
      console.error('[notify] Telegram failed:', err);
    }
  } else {
    console.log('[notify] Skipping Telegram (recently sent for item', itemId, ')');
  }
}