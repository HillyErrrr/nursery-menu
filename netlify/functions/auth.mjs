// Logins for the kitchen pages (one per nursery) and the admin page.
// POST JSON:
//   {action:'status'}  -> {enforced, sites:[{slug, name, brand}]}
//        enforced is false until the database has been set up: until then
//        nobody is asked to log in, exactly as before.
//   {action:'login', username, credential}  (credential = SHA-256 of the password)
//        -> {ok, role, site, siteName, token}
//   {action:'check', siteToken, adminToken}
//        -> {enforced, site: <slug>|null, siteInvalid, admin: bool, adminInvalid}
import { loadDatabase, all, one } from '../lib/store.mjs';
import { checkCredential } from '../lib/users.mjs';
import { makeToken, checkToken } from '../lib/session.mjs';
import { SITE_SLUGS, brandOfSlug } from '../lib/sites.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
  let st = null;
  try { st = await loadDatabase(); } catch (e) {
    // The database exists but cannot be read just now. Say so; the kitchen
    // page treats this like "could not check" and does not lock anyone out.
    return json({ error: 'Logins are unavailable just now.' }, 503);
  }
  const enforced = !!st;

  if (body.action === 'status') {
    const sites = enforced
      ? all(st.db, 'SELECT s.slug, s.name, b.name AS brand FROM sites s LEFT JOIN brands b ON b.id = s.brand_id ORDER BY b.name DESC, s.name')
      : SITE_SLUGS.map((slug) => ({ slug, name: null, brand: brandOfSlug(slug) }));
    return json({ enforced, sites }, 200);
  }

  if (body.action === 'login') {
    if (!enforced) return json({ ok: false, error: 'Logins have not been switched on yet.' }, 409);
    const username = String(body.username || '').trim();
    const credential = String(body.credential || '');
    const user = username && /^[0-9a-f]{64}$/.test(credential) ? checkCredential(st.db, username, credential) : null;
    if (!user) {
      await new Promise((r) => setTimeout(r, 600)); // slows down guessing
      return json({ ok: false, error: 'That username or password is not right.' }, 401);
    }
    const site = user.site_slug ? one(st.db, 'SELECT name FROM sites WHERE slug = ?', [user.site_slug]) : null;
    return json({ ok: true, role: user.role, site: user.site_slug || null, siteName: site ? site.name : null, token: await makeToken(user) }, 200);
  }

  if (body.action === 'check') {
    if (!enforced) return json({ enforced: false }, 200);
    const s = body.siteToken ? await checkToken(String(body.siteToken)) : null;
    const a = body.adminToken ? await checkToken(String(body.adminToken)) : null;
    return json({
      enforced: true,
      site: s && s.role === 'site' ? s.site : null,
      siteInvalid: !!body.siteToken && !(s && s.role === 'site'),
      admin: !!(a && a.role === 'admin'),
      adminInvalid: !!body.adminToken && !(a && a.role === 'admin'),
    }, 200);
  }

  return json({ error: 'Unknown action' }, 400);
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
