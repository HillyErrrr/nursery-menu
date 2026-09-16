// Best-effort helper for the Ingredient Database's "Fetch from Tesco"
// button: given a Tesco product page URL, fetches it server-side (a
// browser can't do this itself — Tesco's site blocks cross-origin
// requests from other pages) and tries to pull out a name, image, pack
// size, price and nutrition table to pre-fill the admin form with.
//
// IMPORTANT — this is explicitly best-effort, by design:
//   - Tesco's page markup can change at any time without notice, silently
//     breaking any one of the extraction strategies below. Nothing here
//     is guaranteed to keep working.
//   - Allergens are deliberately NOT attempted here — on a Tesco page
//     they're just bolded words inside the ingredients paragraph, not a
//     separate structured field, and guessing wrong on an allergen for a
//     nursery menu is far worse than leaving it blank for a human to set.
//   - The nutrition parser looks for the standard UK/EU front-of-pack
//     label ordering (Energy, Fat, of which Saturates, Carbohydrate, of
//     which Sugars, Fibre, Protein, Salt) in the page's plain text, since
//     that ordering is set by food-labelling regulation rather than by
//     Tesco's own site design — that makes it noticeably more durable
//     than guessing at Tesco-specific CSS classes or JSON field names,
//     but it can still fail on a page laid out differently than usual.
//   - Every field this returns is meant to be reviewed by a person before
//     saving (see app.html's "Fetch from Tesco" handler) — this never
//     saves anything by itself.
//
// Restricted to tesco.com URLs only (checked below) and gated behind the
// same staff password as Upload changes (x-rb-auth / UPLOAD_PASSWORD_HASH)
// — this endpoint makes the SERVER fetch a URL of the caller's choosing,
// which needs to not be left open to the whole internet as a free proxy.
export default async (req) => {
  const url = new URL(req.url);
  const target = url.searchParams.get('url');

  const expected = process.env.UPLOAD_PASSWORD_HASH || '';
  const provided = req.headers.get('x-rb-auth') || '';
  if (!expected) {
    return json({
      error: 'This site has no UPLOAD_PASSWORD_HASH environment variable set yet — see the README for the one-time setup steps.',
    }, 500);
  }
  if (provided !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!target) {
    return json({ error: 'A "url" query parameter is required' }, 400);
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return json({ error: 'That is not a valid URL' }, 400);
  }
  if (parsed.protocol !== 'https:' || !/(^|\.)tesco\.com$/i.test(parsed.hostname)) {
    return json({ error: 'Only https://www.tesco.com product URLs are supported' }, 400);
  }

  let html;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        // A fuller set of browser-like headers than just User-Agent — sites
        // with bot-management (Tesco's included) often check that the whole
        // header set looks like a real browser request, not just the UA
        // string on its own. This still won't get past IP-reputation or
        // TLS-fingerprint-based blocking (see the 403 handling below) — only
        // a real browser session can do that — but it costs nothing to send
        // and may help against lighter checks.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://www.google.com/',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      // A 403 here specifically (as opposed to a 404/500/timeout) almost
      // always means Tesco's bot-management blocked the request outright —
      // this runs from Netlify's shared cloud hosting, and large retail
      // sites commonly block requests from cloud/datacenter IP ranges
      // wholesale regardless of what headers are sent, precisely to stop
      // automated scraping. That's a block on Tesco's side this function
      // can't talk its way around — it isn't a bug to keep retrying, and a
      // different pasted URL won't fare any better. Manual entry is the
      // reliable path when this happens.
      const note = res.status === 403
        ? ' — Tesco is very likely blocking automated requests from this server rather than anything wrong with this URL; manual entry is the reliable option here.'
        : '';
      return json({ error: 'Tesco returned HTTP ' + res.status + ' for that URL' + note }, 502);
    }
    // Cap how much we read — a product page is a few hundred KB; anything
    // wildly larger suggests something unexpected and isn't worth parsing.
    const reader = res.body ? res.body.getReader() : null;
    if (reader) {
      const chunks = [];
      let total = 0;
      const CAP = 4 * 1024 * 1024;
      while (total < CAP) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
    } else {
      html = await res.text();
    }
  } catch (e) {
    return json({ error: 'Could not reach that page: ' + e.message }, 502);
  }

  const warnings = [];
  const data = {
    productName: null,
    imageUrl: null,
    packSize: null,
    currentPrice: null,
    tescoProductId: null,
    nutrition: null,
  };

  // ---- 1. JSON-LD Product schema (stable, standard, if present) ----
  try {
    const ldBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldBlocks) {
      let parsedLd;
      try { parsedLd = JSON.parse(m[1]); } catch (e) { continue; }
      const candidates = Array.isArray(parsedLd) ? parsedLd : [parsedLd];
      for (const c of candidates) {
        const t = c && (c['@type'] || '');
        if (String(t).toLowerCase() !== 'product') continue;
        if (c.name && !data.productName) data.productName = String(c.name);
        if (c.image && !data.imageUrl) data.imageUrl = Array.isArray(c.image) ? c.image[0] : String(c.image);
        if (c.sku && !data.tescoProductId) data.tescoProductId = String(c.sku);
        const offer = Array.isArray(c.offers) ? c.offers[0] : c.offers;
        if (offer && offer.price != null && data.currentPrice == null) {
          const p = Number(offer.price);
          if (!isNaN(p)) data.currentPrice = p;
        }
      }
    }
  } catch (e) {
    warnings.push('Could not read structured product data (' + e.message + ')');
  }

  // ---- 2. Fallbacks from meta tags / title if JSON-LD didn't have it ----
  if (!data.productName) {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) data.productName = titleMatch[1].replace(/\s*[-|]\s*Tesco Groceries.*$/i, '').trim();
  }
  if (!data.imageUrl) {
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogImage) data.imageUrl = ogImage[1];
  }
  if (data.currentPrice == null) {
    const priceMeta = html.match(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([\d.]+)["']/i)
      || html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i);
    if (priceMeta) data.currentPrice = Number(priceMeta[1]);
  }
  if (!data.tescoProductId) {
    const idMatch = parsed.pathname.match(/products\/(\d+)/);
    if (idMatch) data.tescoProductId = idMatch[1];
  }
  if (!data.productName) warnings.push('Could not find a product name');
  if (!data.imageUrl) warnings.push('Could not find a product image');
  if (data.currentPrice == null) warnings.push('Could not find a price');

  // ---- 3. Pack size — look for a weight/volume/count near the name ----
  // e.g. "400G", "3 Pack", "2 Litre" / "2L" right after the product title.
  const packMatch = html.match(/\b(\d+(?:\.\d+)?\s?(?:g|kg|ml|l|litre|litres)|\d+\s?(?:x|X)\s?\d+(?:\.\d+)?\s?(?:g|kg|ml|l)|\d+\s?[Pp]ack)\b/);
  if (packMatch) data.packSize = packMatch[1]; else warnings.push('Could not detect a pack size');

  // ---- 4. Nutrition table — plain-text label parsing, in the fixed order
  // the UK/EU nutrition declaration is legally required to follow. This is
  // the most durable part of this function precisely because it doesn't
  // depend on Tesco's own markup at all, just on the regulated wording. ----
  try {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ');

    const num = '([\\d]+(?:\\.[\\d]+)?)';
    const nutrition = {};
    let found = 0;

    const energyMatch = text.match(new RegExp('Energy[^\\d]{0,40}' + num + '\\s*kJ[^\\d]{0,20}' + num + '\\s*kcal', 'i'));
    if (energyMatch) { nutrition.energyKj = Number(energyMatch[1]); nutrition.energyKcal = Number(energyMatch[2]); found += 2; }

    const simple = (label, key) => {
      const m = text.match(new RegExp(label + '[^\\d]{0,25}' + num + '\\s*g', 'i'));
      if (m) { nutrition[key] = Number(m[1]); found++; }
    };
    simple('Fat', 'fat');
    simple('(?:of which )?[Ss]aturates', 'saturates');
    simple('Carbohydrate', 'carbohydrates');
    simple('(?:of which )?[Ss]ugars', 'sugars');
    simple('Fibre', 'fibre');
    simple('Protein', 'protein');
    simple('Salt', 'salt');

    if (found >= 4) {
      data.nutrition = nutrition;
      data.nutritionBasis = /per\s*100\s*ml/i.test(text) ? '100ml' : '100g';
    } else {
      warnings.push('Could not reliably read a nutrition table from this page — please enter it by hand');
    }
  } catch (e) {
    warnings.push('Nutrition parsing failed (' + e.message + ')');
  }

  return json({ ok: true, data, warnings }, 200);
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
