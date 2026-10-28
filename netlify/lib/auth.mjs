/* The staff password check shared by the database functions: the same
   x-rb-auth header Staff admin sends (SHA-256 of the staff password),
   compared with UPLOAD_PASSWORD_HASH -- or, once the database exists, an
   admin user's password. */
import { loadDatabase } from './store.mjs';
import { isAdminCredential } from './users.mjs';

export async function staffAuth(req) {
  const expected = process.env.UPLOAD_PASSWORD_HASH || '';
  const provided = req.headers.get('x-rb-auth') || '';
  let ok = !!expected && provided === expected;
  if (!ok && provided) {
    try { const st = await loadDatabase(); if (st && isAdminCredential(st.db, provided)) ok = true; } catch (e) { /* not set up */ }
  }
  return { ok, expected, provided };
}
