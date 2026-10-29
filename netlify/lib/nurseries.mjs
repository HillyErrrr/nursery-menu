/* Nurseries added from Staff admin (Nurseries > Add a nursery).

   The 15 original nurseries are files shipped with the site
   (sites/<slug>/config.json, logo, icons). A nursery added later has no
   files: its details are kept in the _config/sites.json document

     { sites: { <slug>: { brand, subBrand, siteName, address, phone, email,
                          addedAt, logo, logoVersion } } }

   its logo and home-screen icons in the "site-assets" Blobs store, and the
   site-asset function answers the same sites/<slug>/... addresses for it
   (see _redirects: a shipped file always wins, so the original nurseries
   are untouched).

   With the database set up, adding a nursery also gives it a row in the
   sites table and its own kitchen login, all in one transaction, and
   returns the new password once. Only a salted hash of it is kept, as for
   every other login. */
import { getStore } from '@netlify/blobs';
import { loadDatabase, writeDatabase, legacyStore, one, putDocument, newEtag } from './store.mjs';
import { setUser, newPassword, sha256Hex } from './users.mjs';
import { SITE_SLUGS } from './sites.mjs';

export const NURSERIES_KEY = '_config/sites.json';
export const BRANDS = {
  'Little Adventures': { prefix: 'little-adventures-', subBrand: 'Little Adventures Nursery', fallback: 'little-adventures' },
  'Green Giraffe': { prefix: 'green-giraffe-', subBrand: 'Green Giraffe', fallback: 'green-giraffe' },
};
export const ASSET_FILES = ['logo.png', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const MAX_IMAGE_BYTES = 1500000;

export function assetStore() { return getStore({ name: 'site-assets', consistency: 'strong' }); }

export function slugify(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

/* The kitchen page's config.json for an added nursery. */
export function siteConfigOf(entry) {
  return {
    brand: 'Family Adventures Group',
    subBrand: entry.subBrand || (BRANDS[entry.brand] || {}).subBrand || entry.brand || '',
    siteName: entry.siteName || '',
    address: entry.address || '',
    phone: entry.phone || '',
    email: entry.email || '',
  };
}

const str = (v, max) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

/* Checks what the form sent. Returns {entry, slug} or {error}. */
export function cleanNursery(input) {
  const i = input && typeof input === 'object' ? input : {};
  const brand = str(i.brand, 40);
  if (!BRANDS[brand]) return { error: 'Choose Little Adventures or Green Giraffe.' };
  const siteName = str(i.siteName, 60);
  if (siteName.length < 2) return { error: 'Give the nursery a name, e.g. "Frome".' };
  const tail = slugify(siteName);
  if (!tail) return { error: 'The name needs some letters or numbers in it.' };
  const email = str(i.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That email address does not look right.' };
  const entry = {
    brand, subBrand: BRANDS[brand].subBrand, siteName,
    address: str(i.address, 200), phone: str(i.phone, 40), email,
  };
  return { entry, slug: BRANDS[brand].prefix + tail };
}

/* The images the admin page made in the browser: PNG data, base64. */
export function cleanImages(images) {
  if (!images) return { files: null };
  const files = {};
  for (const name of ASSET_FILES) {
    const raw = images[name];
    if (!raw) return { error: 'The logo upload was incomplete (' + name + '). Try choosing the picture again.' };
    const b64 = String(raw).replace(/^data:image\/png;base64,/, '');
    let buf;
    try { buf = Buffer.from(b64, 'base64'); } catch (e) { buf = null; }
    if (!buf || buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return { error: 'The logo must be a picture (PNG, JPG or similar).' };
    if (buf.length > MAX_IMAGE_BYTES) return { error: 'The logo picture is too large. Try a smaller one.' };
    files[name] = buf;
  }
  return { files };
}

async function saveImages(slug, files) {
  const store = assetStore();
  for (const name of Object.keys(files)) {
    const b = files[name];
    await store.set(slug + '/' + name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
}

/* The sites table row (and its brand), for a nursery in the document. */
export function upsertNurseryRow(db, slug, entry) {
  let brandId = null;
  if (entry.brand) {
    db.run('INSERT OR IGNORE INTO brands (name) VALUES (?)', [entry.brand]);
    const b = one(db, 'SELECT id FROM brands WHERE name = ?', [entry.brand]);
    brandId = b ? b.id : null;
  }
  db.run(`INSERT INTO sites (slug, brand_id, name, menu_group_key, address, phone, email, config_json)
          VALUES (?, ?, ?, 'general', ?, ?, ?, ?)
          ON CONFLICT (slug) DO UPDATE SET brand_id = excluded.brand_id, name = excluded.name, address = excluded.address,
            phone = excluded.phone, email = excluded.email, config_json = excluded.config_json`,
  [slug, brandId, entry.siteName || null, entry.address || null, entry.phone || null, entry.email || null, JSON.stringify(siteConfigOf(entry))]);
}

function parseDoc(text) {
  let doc = null;
  try { doc = text ? JSON.parse(text) : null; } catch (e) { doc = null; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) doc = {};
  if (!doc.sites || typeof doc.sites !== 'object' || Array.isArray(doc.sites)) doc.sites = {};
  return doc;
}

/* The added nurseries, from whichever store is in use. */
export async function readAddedNurseries(store) {
  const text = await store.get(NURSERIES_KEY);
  return parseDoc(text).sites;
}

const taken = (slug, doc, db) => SITE_SLUGS.includes(slug) || !!doc.sites[slug]
  || (db ? !!one(db, 'SELECT 1 AS x FROM sites WHERE slug = ?', [slug]) || !!one(db, 'SELECT 1 AS x FROM users WHERE username = ?', [slug]) : false);

/* Adds a nursery. Returns {ok, slug, siteName, login: {username, password} | null} or {ok:false, error, status}. */
export async function addNursery({ nursery, images }) {
  const c = cleanNursery(nursery);
  if (c.error) return { ok: false, status: 400, error: c.error };
  const img = cleanImages(images);
  if (img.error) return { ok: false, status: 400, error: img.error };
  const { slug } = c;
  const entry = Object.assign({}, c.entry, { addedAt: new Date().toISOString(), logo: !!img.files });
  if (img.files) entry.logoVersion = Date.now();

  const st = await loadDatabase();
  if (st) {
    // Not before the name is known to be free: a second "Frome" must not
    // replace the first one's logo.
    const pre = st.db ? one(st.db, 'SELECT body FROM documents WHERE doc_group = ? AND file = ?', ['_config', 'sites.json']) : null;
    if (taken(slug, parseDoc(pre && pre.body), st.db)) return { ok: false, status: 409, error: 'There is already a nursery called ' + c.entry.siteName + ' (' + c.entry.brand + ').' };
    if (img.files) await saveImages(slug, img.files);
    const password = newPassword();
    const res = await writeDatabase((db) => {
      const row = one(db, 'SELECT body FROM documents WHERE doc_group = ? AND file = ?', ['_config', 'sites.json']);
      const doc = parseDoc(row && row.body);
      if (taken(slug, doc, db)) return { commit: false, taken: true };
      doc.sites[slug] = entry;
      const text = JSON.stringify(doc);
      putDocument(db, NURSERIES_KEY, text, newEtag());
      upsertNurseryRow(db, slug, entry);
      setUser(db, { username: slug, role: 'site', siteSlug: slug, credential: sha256Hex(password) });
      return { commit: true, text };
    });
    if (res.taken) return { ok: false, status: 409, error: 'There is already a nursery called ' + c.entry.siteName + ' (' + c.entry.brand + ').' };
    // The mirror, as every database save keeps one: best effort.
    try { await legacyStore().set(NURSERIES_KEY, res.text); } catch (e) { /* a safety net only */ }
    return { ok: true, slug, siteName: entry.siteName, brand: entry.brand, login: { username: slug, password } };
  }

  // Before the database is set up there are no logins: just the nursery.
  const store = legacyStore();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const cur = await store.getWithMetadata(NURSERIES_KEY, { type: 'text' });
    const doc = parseDoc(cur && cur.data);
    if (taken(slug, doc, null)) return { ok: false, status: 409, error: 'There is already a nursery called ' + c.entry.siteName + ' (' + c.entry.brand + ').' };
    if (attempt === 1 && img.files) await saveImages(slug, img.files);
    doc.sites[slug] = entry;
    const r = await store.set(NURSERIES_KEY, JSON.stringify(doc), cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (!r || r.modified !== false) return { ok: true, slug, siteName: entry.siteName, brand: entry.brand, login: null };
  }
  return { ok: false, status: 409, error: 'Someone else saved at the same moment. Try again.' };
}

/* A new logo for a nursery added here (the original 15 have theirs in the site's files). */
export async function setNurseryLogo({ slug, images }) {
  const img = cleanImages(images);
  if (img.error || !img.files) return { ok: false, status: 400, error: img.error || 'Choose a picture first.' };
  const st = await loadDatabase();
  const change = (doc) => {
    if (!doc.sites[slug]) return false;
    doc.sites[slug].logo = true;
    doc.sites[slug].logoVersion = Date.now();
    return true;
  };
  if (st) {
    const pre = one(st.db, 'SELECT body FROM documents WHERE doc_group = ? AND file = ?', ['_config', 'sites.json']);
    if (!parseDoc(pre && pre.body).sites[slug]) return { ok: false, status: 404, error: 'Only a nursery added on this page can have its logo changed here.' };
    await saveImages(slug, img.files);
    const res = await writeDatabase((db) => {
      const row = one(db, 'SELECT body FROM documents WHERE doc_group = ? AND file = ?', ['_config', 'sites.json']);
      const doc = parseDoc(row && row.body);
      if (!change(doc)) return { commit: false };
      const text = JSON.stringify(doc);
      putDocument(db, NURSERIES_KEY, text, newEtag());
      return { commit: true, text };
    });
    if (!res.commit) return { ok: false, status: 404, error: 'That nursery is not on the list.' };
    try { await legacyStore().set(NURSERIES_KEY, res.text); } catch (e) { /* a safety net only */ }
    return { ok: true };
  }
  const store = legacyStore();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const cur = await store.getWithMetadata(NURSERIES_KEY, { type: 'text' });
    const doc = parseDoc(cur && cur.data);
    if (!doc.sites[slug]) return { ok: false, status: 404, error: 'Only a nursery added on this page can have its logo changed here.' };
    if (attempt === 1) await saveImages(slug, img.files);
    change(doc);
    const r = await store.set(NURSERIES_KEY, JSON.stringify(doc), { onlyIfMatch: cur.etag });
    if (!r || r.modified !== false) return { ok: true };
  }
  return { ok: false, status: 409, error: 'Someone else saved at the same moment. Try again.' };
}

/* Every nursery, for the Nurseries page: the original ones and the added
   ones, and whether each has a kitchen login. */
export async function listNurseries() {
  const st = await loadDatabase();
  let added = {};
  if (st) {
    const row = one(st.db, 'SELECT body FROM documents WHERE doc_group = ? AND file = ?', ['_config', 'sites.json']);
    added = parseDoc(row && row.body).sites;
    const rows = st.db.exec(`SELECT s.slug, s.name, b.name AS brand, s.address,
        (SELECT COUNT(*) FROM users u WHERE u.site_slug = s.slug AND u.role = 'site' AND u.active = 1) AS logins
      FROM sites s LEFT JOIN brands b ON b.id = s.brand_id`);
    const list = rows.length ? rows[0].values.map((v) => ({ slug: v[0], name: v[1], brand: v[2], address: v[3], hasLogin: v[4] > 0 })) : [];
    list.forEach((n) => { n.added = !!added[n.slug]; n.logo = n.added ? !!added[n.slug].logo : true; });
    return { logins: true, nurseries: list };
  }
  const text = await legacyStore().get(NURSERIES_KEY);
  added = parseDoc(text).sites;
  const list = SITE_SLUGS.map((slug) => ({ slug, name: null, brand: null, added: false, hasLogin: false, logo: true }))
    .concat(Object.keys(added).map((slug) => ({ slug, name: added[slug].siteName, brand: added[slug].brand, address: added[slug].address, added: true, hasLogin: false, logo: !!added[slug].logo })));
  return { logins: false, nurseries: list };
}
