// The SQLite database's admin actions, for the db-setup.html page:
//   status   -- is the database set up, how big, how many rows in each table
//   migrate  -- the one-time first load, run here and now (the set-up page uses
//               db-migrate-background instead, which has no time limit to hit)
//   migrate-result -- how the background set-up is getting on
//   verify   -- compare the database with the Blobs copy and rebuild every
//               document from its tables; changes nothing
//   rollback -- switch back to the Blobs store only
//   download -- the SQLite file itself
//   reset-site-password -- a new password for one site login
//   list-nurseries  -- every nursery, and whether it has a kitchen login
//   add-nursery     -- a new nursery (and its kitchen login, once the
//                      database is set up); the password is returned once
//   set-nursery-logo -- a new logo for a nursery added here
//   backup   -- everything saved on the site (every menu, recipe, ingredient
//               and setting) as one JSON file; no logins or passwords
// Staff password only (the same x-rb-auth header Staff admin sends).
import { loadDatabase, writeDatabase, dbBlobStore, legacyStore, staysInBlobs, all } from '../lib/store.mjs';
import { staffAuth } from '../lib/auth.mjs';
import { addNursery, setNurseryLogo, listNurseries } from '../lib/nurseries.mjs';
import { migrateFromBlobs, verifyDatabase, databaseStatus, rollbackToBlobs, resetSitePassword } from '../lib/migrate.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const { ok: authorised, expected } = await staffAuth(req);
  if (!authorised) return json({ error: expected ? 'Unauthorized' : 'This site has no UPLOAD_PASSWORD_HASH environment variable set yet.' }, expected ? 401 : 500);

  let body = {};
  try { body = await req.json(); } catch (e) { /* empty body: status */ }
  const action = body.action || 'status';
  try {
    if (action === 'status') return json(await databaseStatus(), 200);
    if (action === 'migrate') {
      const out = await migrateFromBlobs({ origin: new URL(req.url).origin, adminCredential: expected || req.headers.get('x-rb-auth') });
      return json(out, out.ok ? 200 : 409);
    }
    if (action === 'migrate-result') {
      // The background set-up's progress (see db-migrate-background.mjs).
      const raw = await dbBlobStore().get('migrate-result.json');
      return json(raw ? JSON.parse(raw) : { state: 'none' }, 200);
    }
    if (action === 'verify') { const out = await verifyDatabase(); return json(out, 200); }
    if (action === 'rollback') { const out = await rollbackToBlobs(); return json(out, out.ok ? 200 : 409); }
    if (action === 'download') {
      // The SQLite file itself, to open in any SQLite tool (e.g. DB Browser for SQLite).
      const st = await loadDatabase();
      if (!st) return json({ error: 'The database has not been set up yet.' }, 404);
      return new Response(st.bytes, { status: 200, headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': 'attachment; filename="kitchen-prep-' + new Date().toISOString().slice(0, 10) + '.sqlite"',
        'Cache-Control': 'no-store',
      } });
    }
    if (action === 'reset-site-password') {
      const out = await resetSitePassword(writeDatabase, String(body.username || ''));
      return json(out, out.ok ? 200 : 404);
    }
    if (action === 'backup') {
      // The documents only: never the users table or the session secret.
      const documents = {};
      const st = await loadDatabase();
      if (st) {
        all(st.db, 'SELECT doc_group, file, body FROM documents ORDER BY doc_group, file').forEach((d) => {
          let v = d.body; try { v = JSON.parse(d.body); } catch (e) { /* kept as text */ }
          documents[d.doc_group + '/' + d.file] = v;
        });
      } else {
        const store = legacyStore();
        const listed = await store.list();
        const keys = (listed && listed.blobs ? listed.blobs : []).map((b) => b.key)
          .filter((k) => !k.startsWith('__probe/') && !k.includes('/__backups/') && k !== '_config/presence.json');
        for (const k of keys) {
          const t = await store.get(k, { type: 'text' });
          if (t == null) continue;
          let v = t; try { v = JSON.parse(t); } catch (e) { /* kept as text */ }
          documents[k] = v;
        }
      }
      const body = JSON.stringify({ exportedAt: new Date().toISOString(), storage: st ? 'database' : 'blobs', documents });
      return new Response(body, { status: 200, headers: {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="kitchen-prep-backup-' + new Date().toISOString().slice(0, 10) + '.json"',
      } });
    }
    if (action === 'list-nurseries') return json(await listNurseries(), 200);
    if (action === 'add-nursery') {
      const out = await addNursery({ nursery: body.nursery, images: body.images || null });
      return json(out, out.ok ? 200 : (out.status || 400));
    }
    if (action === 'set-nursery-logo') {
      const out = await setNurseryLogo({ slug: String(body.slug || ''), images: body.images || null });
      return json(out, out.ok ? 200 : (out.status || 400));
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e && e.message ? e.message : String(e) }, 500);
  }
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
