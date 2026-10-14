// ---- Configuration ----
const BACKEND_URL = 'http://localhost:8083';
const API_KEY = 'price-tracker-secret-key-2026';
async function getUserId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["user_id"], (res) => {
      if (res.user_id) {
        resolve(res.user_id);
      } else {
        const newId = "user_" + Math.random().toString(36).substring(2, 10);
        chrome.storage.local.set({ user_id: newId }, () => resolve(newId));
      }
    });
  });
}

async function trackItem(payload: {
  url: string;
  selector: string;
  label?: string;
  retailer?: string;
  image_url?: string | null;
  initialPrice: number | null;
  currency?: string;
  target_price?: number | null;
  alert_on_drop?: boolean;
  alert_on_increase?: boolean;
}): Promise<{ ok: boolean; id?: string }> {
  try {
    const res = await fetch(`${BACKEND_URL}/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify({
        url: payload.url,
        selector: payload.selector,
        label: payload.label,
        retailer: payload.retailer,
        image_url: payload.image_url,
        currency: payload.currency || (payload.url.includes('.in') || payload.url.includes('flipkart') ? 'INR' : 'USD'),
        target_price: payload.target_price,
        alert_on_drop: payload.alert_on_drop ?? true,
        alert_on_increase: payload.alert_on_increase ?? false,
        initialPrice: payload.initialPrice,
        user_id: await getUserId(),
      }),
    });

    if (!res.ok) {
      console.error('[sw] /track failed:', res.status, await res.text());
      throw new Error('Backend error ' + res.status);
    }

    const item = await res.json();
    console.log('[sw] Item tracked on backend:', item);
    return { ok: true, id: item.id };
  } catch (err) {
    console.warn('[sw] Backend unreachable, saving locally:', err);
    await new Promise<void>((resolve) => {
      chrome.storage.local.get('pendingTracks', ({ pendingTracks = [] }) => {
        const list = [...pendingTracks, { ...payload, savedAt: Date.now() }];
        chrome.storage.local.set({ pendingTracks: list }, resolve);
      });
    });
    return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'TRACK_PAGE') {
    trackItem(msg.payload).then((result) => sendResponse(result));
    return true;
  }

  if (msg?.type === 'GET_CONFIG') {
    getUserId().then(uid => sendResponse({ backendUrl: BACKEND_URL, apiKey: API_KEY, userId: uid }));
    return true;
  }
});