/* The menu functions' way in to storage, built so the database layer can
   never take them down.

   The database code (SQLite engine and all) is loaded on first use, not
   at start-up, and if it fails to load for any reason the functions carry
   on exactly as they did before the database existed:
   - get-season reads from the old Blobs store, which always holds every
     document (it is kept as a mirror after the switch);
   - save-season saves to the old Blobs store as before when the database
     has not been set up; if it HAS been set up, it refuses (503) rather
     than save somewhere the next read would not look.
   Only @netlify/blobs is imported up front, as it always was. */
import { getStore } from '@netlify/blobs';

const LEGACY = () => getStore({ name: 'season-data', consistency: 'strong' });

let libPromise = null;
function databaseLib() {
  if (!libPromise) {
    libPromise = Promise.all([import('./store.mjs'), import('./users.mjs')])
      .then(([store, users]) => ({ store, users }))
      .catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

async function databaseExists() {
  try {
    return !!(await getStore({ name: 'kitchen-db', consistency: 'strong' }).getMetadata('kitchen.sqlite.gz'));
  } catch (e) {
    return true; // cannot tell: assume it does, so nothing is written to the wrong place
  }
}

/* For reads: the database store when it is set up and loads, else the old store. */
export async function storeForReading() {
  try {
    const { store } = await databaseLib();
    return (await store.openDocumentStore()).store;
  } catch (e) {
    console.error('database layer unavailable, reading the old store:', e && e.message);
    return LEGACY();
  }
}

/* For writes: {store} to use, or {error} to refuse with. */
export async function storeForWriting() {
  let lib;
  try {
    lib = await databaseLib();
  } catch (e) {
    console.error('database layer unavailable:', e && e.message);
    if (await databaseExists()) return { error: 'The database could not be loaded just now, so nothing was saved. Try again in a moment.' };
    return { store: LEGACY() };
  }
  const opened = await lib.store.openDocumentStore();
  if (opened.unavailable) return { error: 'Could not read the current document: ' + (opened.unavailable.message || opened.unavailable) };
  return { store: opened.store };
}

/* An admin user's password, once the database is set up. False otherwise. */
export async function isDatabaseAdmin(credential) {
  if (!credential) return false;
  try {
    const { store, users } = await databaseLib();
    const st = await store.loadDatabase();
    return !!(st && users.isAdminCredential(st.db, credential));
  } catch (e) {
    return false;
  }
}
