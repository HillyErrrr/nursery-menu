// The one-time database set-up, as a BACKGROUND function: Netlify answers
// 202 straight away and lets it run for up to 15 minutes, so a large site
// can never hit the time limit of an ordinary function (which is what
// showed "undefined" on the set-up page). The result is written to the
// kitchen-db store as migrate-result.json; db-setup.html polls for it
// through db-admin ("migrate-result").
import { dbBlobStore } from '../lib/store.mjs';
import { staffAuth } from '../lib/auth.mjs';
import { migrateFromBlobs } from '../lib/migrate.mjs';

const RESULT_KEY = 'migrate-result.json';

export default async (req) => {
  if (req.method !== 'POST') return;
  const auth = await staffAuth(req);
  const blobs = dbBlobStore();
  const runId = req.headers.get('x-rb-run') || String(Date.now());
  if (!auth.ok) {
    await blobs.set(RESULT_KEY, JSON.stringify({ runId, state: 'done', ok: false, error: 'That password was not accepted.' }));
    return;
  }
  let body = {};
  try { body = await req.json(); } catch (e) { /* no site passwords sent */ }
  await blobs.set(RESULT_KEY, JSON.stringify({ runId, state: 'running', startedAt: new Date().toISOString() }));
  let result;
  try {
    result = await migrateFromBlobs({
      origin: new URL(req.url).origin,
      adminCredential: auth.expected || auth.provided,
      siteCredentials: body.siteCredentials || null,
    });
  } catch (e) {
    result = { ok: false, error: 'The set-up stopped with an error, and nothing was switched: ' + (e && e.message ? e.message : String(e)) };
  }
  delete result.siteLogins; // passwords never stored
  await blobs.set(RESULT_KEY, JSON.stringify(Object.assign({ runId, state: 'done', finishedAt: new Date().toISOString() }, result)));
};
