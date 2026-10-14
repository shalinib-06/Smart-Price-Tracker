// Floating "Track price" button
function injectButton() {
  if (document.getElementById('pdt-track-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pdt-track-btn';
  btn.innerHTML = 'Track price';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '2147483647',
    padding: '12px 18px',
    background: '#4f46e5',
    color: '#ffffff',
    border: '2px solid #ffffff',
    borderRadius: '10px',
    cursor: 'pointer',
    font: 'bold 14px system-ui, -apple-system, sans-serif',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
    transition: 'all 0.2s ease',
  });

  btn.onmouseenter = () => { btn.style.transform = 'scale(1.05)'; };
  btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
  btn.onclick = (e) => {
    e.stopPropagation();
    startSelection(btn);
  };

  document.body.appendChild(btn);
}

function showInstructionBanner(): HTMLElement {
  const banner = document.createElement('div');
  banner.id = 'pdt-instruction-banner';
  banner.innerHTML = '<b>Click on the product price</b> to track it &nbsp; <span style="font-size:12px;opacity:0.8">(Press ESC to cancel)</span>';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483647',
    background: '#1e293b',
    color: '#f8fafc',
    padding: '10px 22px',
    borderRadius: '8px',
    border: '1px solid #6366f1',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    font: '14px system-ui, -apple-system, sans-serif',
    pointerEvents: 'none',
  });
  document.body.appendChild(banner);
  return banner;
}

// Shows preview modal allowing user to confirm product details & configure target price (FR-02)
function showTrackModal(params: {
  url: string;
  selector: string;
  text: string;
  price: number | null;
  label: string;
  retailer: string;
  imageUrl: string | null;
}) {
  const existing = document.getElementById('pdt-confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pdt-confirm-modal';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#1e293b',
    color: '#f8fafc',
    borderRadius: '14px',
    padding: '24px',
    width: '400px',
    maxWidth: '90vw',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
    border: '1px solid #334155',
  });

    const { symbol, currency } = parsePriceAndCurrency(params.text);
  const priceStr = params.price !== null ? `${symbol}${params.price.toLocaleString('en-IN')}` : params.text;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;font-size:16px;font-weight:700;color:#fff;"> Track Product</h3>
      <span style="font-size:11px;background:#4f46e5;color:#fff;padding:2px 8px;border-radius:4px;">${params.retailer}</span>
    </div>
    <div style="margin-bottom:14px;">
      <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">Product Name</label>
      <input id="pdt-input-label" type="text" value="${escapeHtml(params.label)}" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;color:#fff;padding:8px 10px;border-radius:6px;font-size:13px;" />
    </div>
    <div style="display:flex;gap:12px;margin-bottom:14px;">
      <div style="flex:1;">
        <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">Current Price</label>
        <div style="font-size:18px;font-weight:700;color:#4ade80;">${priceStr}</div>
      </div>
      <div style="flex:1;">
        <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px;">Target Price (Optional)</label>
        <input id="pdt-input-target" type="number" step="0.01" placeholder="e.g. 40.00" style="width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;color:#fff;padding:6px 10px;border-radius:6px;font-size:13px;" />
      </div>
    </div>
    <div style="background:#0f172a;padding:10px 12px;border-radius:8px;margin-bottom:18px;font-size:12px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;">
        <input id="pdt-alert-drop" type="checkbox" checked />
        <span>Notify when price drops</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
        <input id="pdt-alert-increase" type="checkbox" />
        <span>Notify when price increases</span>
      </label>
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button id="pdt-btn-cancel" style="background:#334155;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;">Cancel</button>
      <button id="pdt-btn-save" style="background:#4f46e5;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">Start Tracking</button>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  document.getElementById('pdt-btn-cancel')!.onclick = () => overlay.remove();

  document.getElementById('pdt-btn-save')!.onclick = () => {
    const labelInput = (document.getElementById('pdt-input-label') as HTMLInputElement).value.trim();
    const targetInput = (document.getElementById('pdt-input-target') as HTMLInputElement).value;
    const alertDrop = (document.getElementById('pdt-alert-drop') as HTMLInputElement).checked;
    const alertIncrease = (document.getElementById('pdt-alert-increase') as HTMLInputElement).checked;
    const targetPrice = targetInput ? parseFloat(targetInput) : null;

    chrome.runtime.sendMessage({
      type: 'TRACK_PAGE',
      payload: {
        url: params.url,
        selector: params.selector,
        label: labelInput || params.label,
        retailer: params.retailer,
        image_url: params.imageUrl,
        initialPrice: params.price,
        currency: currency,
        target_price: targetPrice && !isNaN(targetPrice) ? targetPrice : null,
        alert_on_drop: alertDrop,
        alert_on_increase: alertIncrease,
      },
    }, (res) => {
      console.log('[content] TRACK_PAGE response:', res);
    });

    overlay.remove();
    toast(` Now tracking: ${labelInput || params.label}`);
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function startSelection(btn: HTMLButtonElement) {
  let hovered: HTMLElement | null = null;
  const banner = showInstructionBanner();
  btn.style.display = 'none';

  const onMove = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target || target === btn || target === banner) return;

    if (hovered && hovered !== target) {
      hovered.style.outline = '';
      hovered.style.cursor = '';
    }
    hovered = target;
    hovered.style.outline = '3px dashed #f59e0b';
    hovered.style.cursor = 'crosshair';
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === btn || target === banner) return;

    e.preventDefault();
    e.stopPropagation();
    cleanup();

    const selector = getSmartSelector(target);
    const text = (target.textContent || '').trim();
    const parsed = parsePrice(text);
    const label = getPageTitle();
    const retailer = getRetailerName();
    const imageUrl = getProductImage();

    showTrackModal({
      url: location.href,
      selector,
      text,
      price: parsed,
      label,
      retailer,
      imageUrl,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanup();
      toast('Selection cancelled');
    }
  };

  const cleanup = () => {
    if (hovered) {
      hovered.style.outline = '';
      hovered.style.cursor = '';
    }
    banner.remove();
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    btn.style.display = 'block';
  };

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function toast(msg: string) {
  const t = document.createElement('div');
  t.innerHTML = msg;
  Object.assign(t.style, {
    position: 'fixed',
    bottom: '80px',
    right: '24px',
    zIndex: '2147483647',
    background: '#0f172a',
    color: '#4ade80',
    padding: '12px 20px',
    borderRadius: '8px',
    border: '1px solid #22c55e',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    font: '14px system-ui, -apple-system, sans-serif',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function getRetailerName(): string {
  try {
    return location.hostname.replace(/^www\./, '');
  } catch {
    return 'Web Store';
  }
}

function getProductImage(): string | null {
  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg) {
    const c = ogImg.getAttribute('content');
    if (c) return c;
  }
  const mainImg = document.querySelector('img#landingImage, img.product-image, .thumbnail img, article img');
  if (mainImg) {
    const src = (mainImg as HTMLImageElement).src;
    if (src) return src;
  }
  return null;
}

function getPageTitle(): string {
  const host = location.hostname.toLowerCase();

  // Amazon exact product title
  if (host.includes("amazon.")) {
    const azTitle = document.getElementById("productTitle");
    if (azTitle && azTitle.textContent) {
      return azTitle.textContent.trim().replace(/\s+/g, " ");
    }
  }

  // Flipkart exact product title
  if (host.includes("flipkart.")) {
    const fkTitle = document.querySelector("span.B_NuCI, h1._6EBuvT, span.VU-ZEz");
    if (fkTitle && fkTitle.textContent) {
      return fkTitle.textContent.trim().replace(/\s+/g, " ");
    }
  }

  const h1 = document.querySelector("h1");
  if (h1 && h1.textContent) {
    const t = h1.textContent.trim().replace(/\s+/g, " ");
    if (t.length > 3 && !t.toLowerCase().includes("keyboard shortcut")) return t;
  }

  const og = document.querySelector("meta[property=\"og:title\"]");
  if (og) {
    const c = og.getAttribute("content");
    if (c) return c.trim().replace(/\s+/g, " ");
  }

  const title = document.title || "";
  return title.replace(/\|.*/, "").replace(/-.*/, "").replace(/:\s*Amazon\..*/i, "").trim() || "Product Item";
}

function getSmartSelector(el: Element): string {
  const host = location.hostname.toLowerCase();

  if (host.includes("amazon.")) {
    return ".priceToPay span.a-price-whole, span.a-price span.a-offscreen, #corePriceDisplay_desktop_feature_div .a-price-whole, #priceblock_ourprice";
  }

  if (host.includes("flipkart.")) {
    return "div._30jeq3, div.Nx9daj, div._25b18c ._30jeq3";
  }

  if (el.id) return `#${CSS.escape(el.id)}`;

  const classList = Array.from(el.classList).filter(c => !c.startsWith("pdt-") && c.length > 2);
  for (const c of classList) {
    const sel = `${el.tagName.toLowerCase()}.${CSS.escape(c)}`;
    if (document.querySelectorAll(sel).length === 1) {
      return sel;
    }
  }

  return el.tagName.toLowerCase();
}

function parsePriceAndCurrency(text: string | null | undefined): { price: number | null; currency: string; symbol: string } {
  if (!text) return { price: null, currency: 'INR', symbol: '₹' };
  const d = location.hostname.toLowerCase();
  let currency = 'INR';
  let symbol = '₹';

  if (text.includes('₹') || /rs\.?|inr/i.test(text) || d.includes('.in') || d.includes('flipkart') || d.includes('myntra')) {
    currency = 'INR';
    symbol = '₹';
  } else if (text.includes('£') || d.includes('.co.uk')) {
    currency = 'GBP';
    symbol = '£';
  } else if (text.includes('€')) {
    currency = 'EUR';
    symbol = '€';
  } else if (text.includes('$') || d.includes('.com') || d.includes('.us')) {
    currency = 'USD';
    symbol = '$';
  }

  // Clean out currency words & signs
  const cleaned = text.replace(/[\$\u20B9\u00A3\u20AC]/g, ' ')
                      .replace(/(?:^|\s)(?:rs\.?|inr|mrp)(?:\s|$)/gi, ' ')
                      .trim();

  const m = cleaned.match(/([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  if (!m) return { price: null, currency, symbol };

  const num = parseFloat(m[1].replace(/,/g, ''));
  return {
    price: isNaN(num) ? null : num,
    currency,
    symbol
  };
}

function parsePrice(s: string): number | null {
  return parsePriceAndCurrency(s).price;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectButton);
} else {
  injectButton();
}