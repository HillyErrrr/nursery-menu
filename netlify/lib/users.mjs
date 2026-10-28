/* Users: one login per nursery site, and one admin.

   How the app proves who it is today: Staff admin sends the SHA-256 of the
   staff password in the x-rb-auth header, and save-season compares it with
   the UPLOAD_PASSWORD_HASH setting. A user's password is checked the same
   way -- the app sends SHA-256(password) -- and what is stored is a salted
   scrypt of that value, so the table never holds anything that could be
   sent as a password.

   The admin user's password is the existing staff password, so it does
   exactly what the shared password does now. Site logins are created
   with their own random passwords; nothing asks for them yet (kitchen
   pages still open without a login, as before). */
import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { all, one } from './store.mjs';

const nowIso = () => new Date().toISOString();
export const sha256Hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');

function hashCredential(credential, salt) {
  return scryptSync(String(credential), salt, 32).toString('hex');
}

/* `credential` is what the app sends: the SHA-256 hex of the password. */
export function setUser(db, { username, role, siteSlug, credential }) {
  const salt = randomBytes(16).toString('hex');
  const hash = hashCredential(credential, salt);
  const existing = one(db, 'SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    db.run('UPDATE users SET role = ?, site_slug = ?, password_salt = ?, password_hash = ?, active = 1, updated_at = ? WHERE id = ?',
      [role, siteSlug || null, salt, hash, nowIso(), existing.id]);
  } else {
    db.run('INSERT INTO users (username, role, site_slug, password_salt, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
      [username, role, siteSlug || null, salt, hash, nowIso(), nowIso()]);
  }
}

export function checkCredential(db, username, credential) {
  const u = one(db, 'SELECT * FROM users WHERE username = ? AND active = 1', [username]);
  if (!u) return null;
  const want = Buffer.from(u.password_hash, 'hex');
  const got = Buffer.from(hashCredential(credential, u.password_salt), 'hex');
  return want.length === got.length && timingSafeEqual(want, got) ? u : null;
}

/* True when `credential` is the password of any active admin user. */
export function isAdminCredential(db, credential) {
  if (!credential) return false;
  return all(db, "SELECT username FROM users WHERE role = 'admin' AND active = 1")
    .some((u) => !!checkCredential(db, u.username, credential));
}

/* A readable random password: no look-alike characters. */
export function newPassword(length = 12) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}
