/* Setting up the database from what is stored today, checking it, and
   switching back. Run from db-admin (and the db-setup.html page).

   The first load copies every document in the Blobs store into the
   database with its text and its version tag unchanged -- so a Staff
   admin screen that was open during the switch can still save without a
   "someone else saved" conflict -- and fills the relational tables from
   them. It then checks, before anything is switched on:
     - every document's text in the database is identical to the Blobs copy;
     - every document that has tables can be rebuilt from those tables
       alone with the same data (see projection.sameData);
     - nothing was saved to Blobs while the copy was being made (if it was,
       the copy is made again).
   Only then is the database stored, and from that moment both functions
   use it. */
import {
  legacyStore, dbBlobStore, DB_KEY, createDatabase, storeNewDatabase, loadDatabase,
  putDocument, putBackup, all, one, staysInBlobs, newEtag, forgetCachedDatabase,
} from './store.mjs';
import { docKind, reconstruct, sameData } from './projection.mjs';
import { setUser, newPassword, sha256Hex } from './users.mjs';
import { SITE_SLUGS, BUILT_IN_MENUS, BUILT_IN_SITE_MENUS, BUILT_IN_SEASONS, brandOfSlug } from './sites.mjs';

const ORDER = ['seasons', 'siteMenus', 'ingredients', 'recipes', 'extraMenus', 'alerts', 'rotation'];

async function readBlobs() {
  const legacy = legacyStore();
  const listed = await legacy.list();
  const keys = (listed && listed.blobs ? listed.blobs : []).map((b) => b.key);
  const docs = [];
  const backups = [];
  for (const key of keys) {
    if (key.startsWith('__probe/') || staysInBlobs(key)) continue;
    const got = await legacy.getWithMetadata(key, { type: 'text' });
    if (!got) continue;
    if (key.includes('/__backups/')) backups.push({ key, data: got.data });
    else docs.push({ key, data: got.data, etag: got.etag || newEtag() });
  }
  return { docs, backups };
}

async function siteConfigs(origin) {
  const out = {};
  await Promise.all(SITE_SLUGS.map(async (slug) => {
    try {
      const res = await fetch(new URL('/sites/' + encodeURIComponent(slug) + '/config.json', origin));
      if (res.ok) out[slug] = await res.text();
    } catch (e) { /* the row is still created, without the details */ }
  }));
  return out;
}

function seedReference(db, configs) {
  ['Little Adventures', 'Green Giraffe'].forEach((b) => db.run('INSERT INTO brands (name) VALUES (?)', [b]));
  BUILT_IN_MENUS.forEach((m, i) => db.run('INSERT INTO menu_groups (key, label, started_from, position) VALUES (?, ?, ?, ?)', [m.key, m.label, m.startedFrom, i]));
  BUILT_IN_SEASONS.forEach((s, i) => db.run('INSERT INTO seasons (key, label, file, start_date, position) VALUES (?, ?, ?, ?, ?)', [s.key, s.label, s.file, s.startDate, i]));
  SITE_SLUGS.forEach((slug) => {
    let cfg = {};
    try { cfg = configs[slug] ? JSON.parse(configs[slug]) : {}; } catch (e) { cfg = {}; }
    const brand = one(db, 'SELECT id FROM brands WHERE name = ?', [brandOfSlug(slug)]);
    db.run('INSERT INTO sites (slug, brand_id, name, menu_group_key, address, phone, email, config_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      slug, brand ? brand.id : null, cfg.siteName || null, BUILT_IN_SITE_MENUS[slug] || 'general',
      cfg.address || null, cfg.phone || null, cfg.email || null, configs[slug] || null,
    ]);
  });
}

function kindRank(key) {
  const i = key.indexOf('/');
  const k = docKind(key.slice(0, i), key.slice(i + 1));
  const r = ORDER.indexOf(k);
  return r === -1 ? ORDER.length : r;
}

/* Every check the import makes, on an open database. */
export function checkDatabase(db, blobsDocs) {
  const problems = [];
  const docs = all(db, 'SELECT doc_group, file, body FROM documents');
  let rebuilt = 0;
  if (blobsDocs) {
    const inDb = new Map(docs.map((d) => [d.doc_group + '/' + d.file, d.body]));
    blobsDocs.forEach((d) => {
      if (!inDb.has(d.key)) problems.push(d.key + ': missing from the database');
      else if (inDb.get(d.key) !== d.data) problems.push(d.key + ': text differs from the stored copy');
    });
  }
  docs.forEach((d) => {
    const kind = docKind(d.doc_group, d.file);
    if (!kind) return;
    let parsed;
    try { parsed = JSON.parse(d.body); } catch (e) { return; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const back = reconstruct(db, d.doc_group, d.file);
    const want = kind === 'rotation' ? parsed : pick(parsed, kind);
    if (!sameData(back, want)) problems.push(d.doc_group + '/' + d.file + ': the tables do not hold the same data');
    else rebuilt++;
  });
  all(db, "SELECT key, value FROM meta WHERE key LIKE 'projection_error:%'").forEach((m) => problems.push(m.key.slice(17) + ': ' + m.value));
  return { problems, documents: docs.length, rebuilt };
}
/* The part of a config document that has tables (the rest stays in the
   document only, as everything always did). */
function pick(doc, kind) {
  const field = { recipes: 'recipes', ingredients: 'ingredients', seasons: 'seasons', extraMenus: 'menus', alerts: 'alerts' }[kind];
  if (field) return { [field]: doc[field] };
  if (kind === 'siteMenus') return { menus: doc.menus, sites: doc.sites };
  return doc;
}

export function tableCounts(db) {
  const tables = all(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
  const out = {};
  tables.forEach((t) => { out[t] = one(db, 'SELECT COUNT(*) AS n FROM "' + t + '"').n; });
  return out;
}

/* The first load. */
export async function migrateFromBlobs({ origin, adminCredential }) {
  const existing = await loadDatabase();
  if (existing) return { ok: false, error: 'The database is already set up. Use "Check" to compare it, or "Switch back" first.' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { docs, backups } = await readBlobs();
    const configs = await siteConfigs(origin);
    const db = await createDatabase();
    const passwords = [];
    db.run('BEGIN');
    try {
      seedReference(db, configs);
      docs.slice().sort((a, b) => kindRank(a.key) - kindRank(b.key)).forEach((d) => putDocument(db, d.key, d.data, d.etag));
      backups.forEach((b) => putBackup(db, b.key, b.data));
      setUser(db, { username: 'admin', role: 'admin', credential: adminCredential });
      SITE_SLUGS.forEach((slug) => {
        const pw = newPassword();
        setUser(db, { username: slug, role: 'site', siteSlug: slug, credential: sha256Hex(pw) });
        const site = one(db, 'SELECT name FROM sites WHERE slug = ?', [slug]);
        passwords.push({ username: slug, site: (site && site.name) || slug, password: pw });
      });
      db.run("INSERT INTO meta (key, value) VALUES ('migrated_at', ?), ('migrated_documents', ?), ('migrated_backups', ?)",
        [new Date().toISOString(), String(docs.length), String(backups.length)]);
      db.run('COMMIT');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (e2) { /* nothing to undo */ }
      return { ok: false, error: 'Building the database failed, nothing was switched: ' + e.message };
    }
    const check = checkDatabase(db, docs);
    if (check.problems.length) {
      return { ok: false, error: 'The checks found differences, so nothing was switched.', problems: check.problems };
    }
    // Nothing saved to Blobs meanwhile? Otherwise take the copy again.
    const legacy = legacyStore();
    let moved = false;
    for (const d of docs) {
      const m = await legacy.getMetadata(d.key);
      if (!m || (m.etag && m.etag !== d.etag)) { moved = true; break; }
    }
    if (moved) continue;
    const stored = await storeNewDatabase(db);
    if (!stored) return { ok: false, error: 'Someone else set up the database at the same moment. Use "Check".' };
    return {
      ok: true, attempts: attempt,
      documents: docs.length, backups: backups.length, rebuiltFromTables: check.rebuilt,
      counts: tableCounts(db), siteLogins: passwords,
    };
  }
  return { ok: false, error: 'Menus kept being saved while the copy was made. Try again when nobody is editing.' };
}

/* Compares the database with the Blobs mirror and rebuilds every document
   from its tables. Changes nothing. */
export async function verifyDatabase() {
  const st = await loadDatabase();
  if (!st) return { ok: false, error: 'The database has not been set up yet.' };
  const { docs } = await readBlobs();
  const mirror = docs.filter((d) => one(st.db, 'SELECT 1 AS x FROM documents WHERE doc_group || \'/\' || file = ?', [d.key]));
  const check = checkDatabase(st.db, mirror);
  return { ok: !check.problems.length, problems: check.problems, documents: check.documents, rebuiltFromTables: check.rebuilt, counts: tableCounts(st.db) };
}

export async function databaseStatus() {
  const st = await loadDatabase();
  if (!st) return { mode: 'blobs', setUp: false };
  const meta = Object.fromEntries(all(st.db, 'SELECT key, value FROM meta').filter((r) => !r.key.startsWith('probe:')).map((r) => [r.key, r.value]));
  return {
    mode: 'sqlite', setUp: true, sizeBytes: st.bytes.length, meta,
    counts: tableCounts(st.db),
    users: all(st.db, 'SELECT username, role, site_slug AS site, active FROM users ORDER BY role, username'),
  };
}

/* Back to Blobs only: writes every document's current text from the
   database to the Blobs store (it is normally identical already, as the
   mirror), keeps a copy of the database file, then removes it -- after
   which both functions use Blobs exactly as before the database existed. */
export async function rollbackToBlobs() {
  const st = await loadDatabase();
  if (!st) return { ok: false, error: 'The database is not set up, so there is nothing to switch back from.' };
  const legacy = legacyStore();
  const docs = all(st.db, 'SELECT doc_group, file, body FROM documents');
  for (const d of docs) await legacy.set(d.doc_group + '/' + d.file, d.body);
  const blobs = dbBlobStore();
  const raw = await blobs.get(DB_KEY, { type: 'arrayBuffer' });
  const keep = DB_KEY + '.switched-off-' + new Date().toISOString().replace(/[:.]/g, '-');
  if (raw) await blobs.set(keep, raw);
  await blobs.delete(DB_KEY);
  forgetCachedDatabase();
  return { ok: true, documents: docs.length, keptCopy: keep };
}

/* A new password for one site login. */
export async function resetSitePassword(writeDatabase, username) {
  const pw = newPassword();
  const res = await writeDatabase((db) => {
    const u = one(db, "SELECT * FROM users WHERE username = ? AND role = 'site'", [username]);
    if (!u) return { commit: false };
    setUser(db, { username, role: 'site', siteSlug: u.site_slug, credential: sha256Hex(pw) });
    return { commit: true };
  });
  return res.commit ? { ok: true, username, password: pw } : { ok: false, error: 'No site login called ' + username };
}
