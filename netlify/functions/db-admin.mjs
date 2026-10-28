// The SQLite database's admin actions, for the db-setup.html page:
//   status   -- is the database set up, how big, how many rows in each table
//   migrate  -- the one-time first load from the Blobs store (see ../lib/migrate.mjs)
//   verify   -- compare the database with the Blobs copy and rebuild every
//               document from its tables; changes nothing
//   rollback -- switch back to the Blobs store only
//   download -- the SQLite file itself
//   reset-site-password -- a new password for one site login
// Staff password only (the same x-rb-auth header Staff admin sends).
import { loadDatabase, writeDatabase } from '../lib/store.mjs';
import { isAdminCredential } from '../lib/users.mjs';
import { migrateFromBlobs, verifyDatabase, databaseStatus, rollbackToBlobs, resetSitePassword } from '../lib/migrate.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const expected = process.env.UPLOAD_PASSWORD_HASH || '';
  const provided = req.headers.get('x-rb-auth') || '';
  let authorised = !!expected && provided === expected;
  if (!authorised && provided) {
    try { const st = await loadDatabase(); if (st && isAdminCredential(st.db, provided)) authorised = true; } catch (e) { /* not set up */ }
  }
  if (!authorised) return json({ error: expected ? 'Unauthorized' : 'This site has no UPLOAD_PASSWORD_HASH environment variable set yet.' }, expected ? 401 : 500);

  let body = {};
  try { body = await req.json(); } catch (e) { /* empty body: status */ }
  const action = body.action || 'status';
  try {
    if (action === 'status') return json(await databaseStatus(), 200);
    if (action === 'migrate') {
      const out = await migrateFromBlobs({ origin: new URL(req.url).origin, adminCredential: expected || provided });
      return json(out, out.ok ? 200 : 409);
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
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e && e.message ? e.message : String(e) }, 500);
  }
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
