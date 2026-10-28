/* Login sessions for the kitchen pages and the admin page.

   A session is a signed token the browser keeps (it stays logged in until
   someone logs out). It names the user, their role and nursery, and a
   fingerprint of their current password, so changing a password logs that
   login out everywhere. It is signed with a secret kept in the database's
   meta table, made the first time anyone logs in. */
import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { loadDatabase, writeDatabase, one } from './store.mjs';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const fingerprint = (user) => createHash('sha256').update(String(user.password_hash)).digest('hex').slice(0, 16);

async function sessionSecret() {
  let st = await loadDatabase();
  if (!st) return null;
  let row = one(st.db, "SELECT value FROM meta WHERE key = 'session_secret'");
  if (row) return row.value;
  await writeDatabase((db) => {
    if (one(db, "SELECT 1 AS x FROM meta WHERE key = 'session_secret'")) return { commit: false };
    db.run("INSERT INTO meta (key, value) VALUES ('session_secret', ?)", [randomBytes(32).toString('hex')]);
    return { commit: true };
  });
  st = await loadDatabase();
  row = one(st.db, "SELECT value FROM meta WHERE key = 'session_secret'");
  return row ? row.value : null;
}

export async function makeToken(user) {
  const secret = await sessionSecret();
  const payload = b64u(JSON.stringify({ u: user.username, r: user.role, s: user.site_slug || null, f: fingerprint(user), t: Date.now() }));
  const sig = b64u(createHmac('sha256', secret).update(payload).digest());
  return payload + '.' + sig;
}

/* The user a token belongs to, if it is genuine and still current; else null. */
export async function checkToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const st = await loadDatabase();
  if (!st) return null;
  const row = one(st.db, "SELECT value FROM meta WHERE key = 'session_secret'");
  if (!row) return null;
  const [payload, sig] = token.split('.');
  const want = createHmac('sha256', row.value).update(payload).digest();
  const got = fromB64u(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let data;
  try { data = JSON.parse(fromB64u(payload).toString('utf8')); } catch (e) { return null; }
  const user = one(st.db, 'SELECT * FROM users WHERE username = ? AND active = 1', [data.u]);
  if (!user || user.role !== data.r || fingerprint(user) !== data.f) return null;
  return { username: user.username, role: user.role, site: user.site_slug || null };
}
