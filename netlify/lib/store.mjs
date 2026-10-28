/* Where the app's documents are kept: the SQLite database once it has been
   set up, Netlify Blobs (as before) until then.

   The database is one SQLite file, kept gzipped in Netlify Blobs (store
   "kitchen-db", key "kitchen.sqlite.gz"). Netlify Functions have no disk
   that lasts beyond one request, so this is how SQLite runs on Netlify
   with no separate server: each function instance loads the file into
   memory, and every change writes the whole file back -- conditionally,
   on the version it started from, so two saves at the same moment can
   never overwrite each other (the loser re-reads and tries again).

   SqliteDocumentStore offers the same few methods the functions already
   used on the Blobs store (getWithMetadata, get, set with onlyIfMatch /
   onlyIfNew, list, delete), with the same answers, so get-season and
   save-season keep their logic line for line. What changes is only where
   the bytes live.

   Safety nets:
   - Until the database exists, everything runs on the old Blobs store,
     exactly as before. Setting it up is a deliberate step (db-admin).
   - After every saved document, the same text is also written to the old
     Blobs store (a mirror). If the database ever could not be loaded,
     reads fall back to that mirror instead of failing, and switching back
     (db-admin "rollback") loses nothing.
   - "Who else is editing" presence pings stay in the old Blobs store:
     they are not data, they change every 45 seconds per open screen, and
     writing the whole database for each would only slow real saves. */
import { getStore } from '@netlify/blobs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { sqliteEngine } from './sqlite.mjs';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.mjs';
import { project } from './projection.mjs';

export const DB_STORE_NAME = 'kitchen-db';
export const DB_KEY = 'kitchen.sqlite.gz';
export const LEGACY_STORE_NAME = 'season-data';
const BACKUPS_KEPT = 12;

/* Documents that stay in the old Blobs store whatever the mode. */
export function staysInBlobs(key) {
  return key === '_config/presence.json';
}

export function legacyStore() {
  return getStore({ name: LEGACY_STORE_NAME, consistency: 'strong' });
}
export function dbBlobStore() {
  return getStore({ name: DB_STORE_NAME, consistency: 'strong' });
}

/* ---------- loading and saving the database file ---------- */

// Per function instance: the last version of the database file seen.
let CACHE = null; // { etag, bytes, db }

export function forgetCachedDatabase() { CACHE = null; }

/* The current database, or null when it has not been set up. Reuses this
   instance's copy when the stored file has not changed since (a cheap
   metadata check, strongly consistent), so most requests load nothing. */
export async function loadDatabase() {
  const blobs = dbBlobStore();
  const meta = await blobs.getMetadata(DB_KEY);
  if (!meta) { CACHE = null; return null; }
  if (CACHE && meta.etag && CACHE.etag === meta.etag) return CACHE;
  const got = await blobs.getWithMetadata(DB_KEY, { type: 'arrayBuffer' });
  if (!got) { CACHE = null; return null; }
  const bytes = gunzipSync(Buffer.from(got.data));
  const SQL = await sqliteEngine();
  const db = new SQL.Database(bytes);
  db.run('PRAGMA foreign_keys = ON');
  CACHE = { etag: got.etag, bytes, db };
  return CACHE;
}

/* Runs `change(db)` on a private copy of the latest database and stores
   the result if `change` says to commit. Retries when another instance
   saved the file in between. Returns whatever `change` returned. */
export async function writeDatabase(change, { attempts = 5 } = {}) {
  const blobs = dbBlobStore();
  const SQL = await sqliteEngine();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const base = await loadDatabase();
    if (!base) throw new Error('The database has not been set up.');
    const db = new SQL.Database(base.bytes);
    db.run('PRAGMA foreign_keys = ON');
    let result;
    db.run('BEGIN');
    try {
      result = change(db, attempt) || {};
      db.run(result.commit ? 'COMMIT' : 'ROLLBACK');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (e2) { /* already rolled back */ }
      db.close();
      throw e;
    }
    if (!result.commit) { db.close(); return result; }
    const bytes = db.export();
    const res = await blobs.set(DB_KEY, toArrayBuffer(gzipSync(bytes)), { onlyIfMatch: base.etag });
    if (res && res.modified === false) {
      // Someone else saved the database first: start again on their version.
      db.close();
      CACHE = null;
      continue;
    }
    let etag = res && res.etag;
    if (!etag) { const m = await blobs.getMetadata(DB_KEY); etag = m && m.etag; }
    CACHE = { etag, bytes, db };
    result.attempts = attempt;
    return result;
  }
  const err = new Error('Another save kept landing first. Nothing was overwritten — try again in a moment.');
  err.conflict = true;
  throw err;
}

function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/* A new, empty database with the schema and the fixed reference rows. */
export async function createDatabase() {
  const SQL = await sqliteEngine();
  const db = new SQL.Database();
  db.run(SCHEMA_SQL);
  db.run("INSERT INTO meta (key, value) VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
  return db;
}

/* Stores a database built from scratch, only if none exists yet. */
export async function storeNewDatabase(db) {
  const blobs = dbBlobStore();
  const bytes = db.export();
  const res = await blobs.set(DB_KEY, toArrayBuffer(gzipSync(bytes)), { onlyIfNew: true });
  if (res && res.modified === false) return false;
  CACHE = null;
  return true;
}

/* ---------- small helpers on an open database ---------- */
export function all(db, sql, params) {
  const st = db.prepare(sql);
  const out = [];
  try {
    st.bind(params || []);
    while (st.step()) out.push(st.getAsObject());
  } finally { st.free(); }
  return out;
}
export function one(db, sql, params) { return all(db, sql, params)[0] || null; }

function splitKey(key) {
  const i = key.indexOf('/');
  return i === -1 ? { group: '', file: key } : { group: key.slice(0, i), file: key.slice(i + 1) };
}
function isBackupKey(key) { return key.includes('/__backups/'); }
function parseBackupKey(key) {
  const m = /^(.*?)\/__backups\/(.+)\.([0-9TZ-]+)$/.exec(key);
  return m ? { group: m[1], file: m[2] } : null;
}
export function newEtag() { return '"' + randomUUID().replace(/-/g, '') + '"'; }
const nowIso = () => new Date().toISOString();

/* Writes one document's text inside an open transaction, and keeps the
   relational tables in step. Used by the store and by the first import. */
export function putDocument(db, key, text, etag) {
  const { group, file } = splitKey(key);
  const existing = one(db, 'SELECT id FROM documents WHERE doc_group = ? AND file = ?', [group, file]);
  if (existing) db.run('UPDATE documents SET body = ?, etag = ?, updated_at = ? WHERE id = ?', [text, etag, nowIso(), existing.id]);
  else db.run('INSERT INTO documents (doc_group, file, body, etag, updated_at) VALUES (?, ?, ?, ?, ?)', [group, file, text, etag, nowIso()]);
  const id = existing ? existing.id : one(db, 'SELECT last_insert_rowid() AS id').id;
  project(db, group, file, id, text);
  return id;
}
export function putBackup(db, key, text) {
  const p = parseBackupKey(key) || splitKey(key);
  db.run('INSERT INTO document_backups (backup_key, doc_group, file, body, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (backup_key) DO UPDATE SET body = excluded.body',
    [key, p.group, p.file, text, nowIso()]);
  // Keep the newest few per document, the same number as before.
  const keys = all(db, 'SELECT backup_key FROM document_backups WHERE doc_group = ? AND file = ? ORDER BY backup_key', [p.group, p.file]).map((r) => r.backup_key);
  while (keys.length > BACKUPS_KEPT) db.run('DELETE FROM document_backups WHERE backup_key = ?', [keys.shift()]);
}

/* ---------- the document store the functions use ---------- */
export class SqliteDocumentStore {
  constructor() { this.legacy = legacyStore(); }

  async getWithMetadata(key) {
    if (staysInBlobs(key)) return this.legacy.getWithMetadata(key, { type: 'text' });
    const st = await loadDatabase();
    if (!st) throw new Error('The database has not been set up.');
    if (isBackupKey(key)) {
      const b = one(st.db, 'SELECT body FROM document_backups WHERE backup_key = ?', [key]);
      return b ? { data: b.body, etag: '"' + key + '"' } : null;
    }
    if (key.startsWith('__probe/')) {
      const m = one(st.db, 'SELECT value FROM meta WHERE key = ?', ['probe:' + key]);
      return m ? { data: m.value, etag: '"probe"' } : null;
    }
    const { group, file } = splitKey(key);
    const d = one(st.db, 'SELECT body, etag FROM documents WHERE doc_group = ? AND file = ?', [group, file]);
    return d ? { data: d.body, etag: d.etag } : null;
  }

  async get(key) {
    const got = await this.getWithMetadata(key);
    return got ? got.data : null;
  }

  async set(key, value, options) {
    if (staysInBlobs(key)) return this.legacy.set(key, value, options);
    const text = typeof value === 'string' ? value : Buffer.from(value).toString('utf8');
    const opts = options || {};
    const etag = newEtag();
    const result = await writeDatabase((db) => {
      if (isBackupKey(key)) { putBackup(db, key, text); return { commit: true }; }
      if (key.startsWith('__probe/')) {
        const exists = one(db, 'SELECT 1 AS x FROM meta WHERE key = ?', ['probe:' + key]);
        if (opts.onlyIfNew && exists) return { commit: false };
        db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', ['probe:' + key, text]);
        return { commit: true };
      }
      const { group, file } = splitKey(key);
      const cur = one(db, 'SELECT etag FROM documents WHERE doc_group = ? AND file = ?', [group, file]);
      if (opts.onlyIfNew && cur) return { commit: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { commit: false };
      putDocument(db, key, text, etag);
      return { commit: true, document: true };
    });
    if (!result.commit) return { modified: false };
    if (result.document) {
      // The mirror: best effort, never fails the save the user asked for.
      try { await this.legacy.set(key, text); } catch (e) { /* mirror is a safety net only */ }
    }
    return { modified: true, etag };
  }

  async list({ prefix } = {}) {
    if (prefix && staysInBlobs(prefix)) return this.legacy.list({ prefix });
    const st = await loadDatabase();
    if (!st) throw new Error('The database has not been set up.');
    const p = prefix || '';
    const keys = all(st.db, "SELECT backup_key AS k FROM document_backups UNION ALL SELECT doc_group || '/' || file AS k FROM documents")
      .map((r) => r.k).filter((k) => k.startsWith(p));
    return { blobs: keys.map((k) => ({ key: k })), directories: [] };
  }

  async delete(key) {
    if (staysInBlobs(key)) return this.legacy.delete(key);
    await writeDatabase((db) => {
      if (isBackupKey(key)) db.run('DELETE FROM document_backups WHERE backup_key = ?', [key]);
      else if (key.startsWith('__probe/')) db.run('DELETE FROM meta WHERE key = ?', ['probe:' + key]);
      else {
        const { group, file } = splitKey(key);
        db.run('DELETE FROM documents WHERE doc_group = ? AND file = ?', [group, file]);
      }
      return { commit: true };
    });
  }
}

/* Which store a request should use: the database when it exists, the old
   Blobs store otherwise. `unavailable` is set when the database exists but
   could not be loaded; reads then use the mirror, writes are refused. */
export async function openDocumentStore() {
  let st;
  try {
    st = await loadDatabase();
  } catch (e) {
    return { store: legacyStore(), mode: 'legacy', unavailable: e };
  }
  if (!st) return { store: legacyStore(), mode: 'legacy' };
  return { store: new SqliteDocumentStore(), mode: 'sqlite' };
}
