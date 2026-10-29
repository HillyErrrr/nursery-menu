// The sites/<slug>/... files of a nursery added in Staff admin (Nurseries >
// Add a nursery), which has no files of its own in the site:
//   config.json, manifest.webmanifest, assets/logo.png, assets/icon-180.png,
//   assets/icon-192.png, assets/icon-512.png
// It answers /sites/* itself (see config below), but only where no shipped
// file matches (preferStatic), so the original nurseries are always served
// from their own files, and an address nobody has is still "not found".
// No password: the same as the shipped files, which were never secret.
// GET /sites/<slug>/<file>  (or ?site=<slug>&file=<file>)
import { getStore } from '@netlify/blobs';
import { storeForReading } from '../lib/safe-store.mjs';

const KEY = '_config/sites.json';
const FALLBACK = { 'Little Adventures': 'little-adventures', 'Green Giraffe': 'green-giraffe' };
const ICON = /^assets\/(logo|icon-180|icon-192|icon-512)\.png$/;

export default async (req) => {
  const url = new URL(req.url);
  let slug = url.searchParams.get('site') || '';
  let file = url.searchParams.get('file') || '';
  if (!slug || !file) {
    const m = /^\/sites\/([a-z0-9-]+)\/(.+)$/.exec(url.pathname);
    if (m) { slug = m[1]; file = m[2]; }
  }
  if (!/^[a-z0-9-]{3,100}$/.test(slug) || !file) return notFound();

  let entry = null;
  try {
    const store = await storeForReading();
    const text = await store.get(KEY);
    const doc = text ? JSON.parse(text) : null;
    entry = doc && doc.sites && typeof doc.sites === 'object' ? doc.sites[slug] || null : null;
  } catch (e) {
    return new Response('Could not read the nursery list just now.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!entry) return notFound();

  if (file === 'config.json') {
    return json({
      brand: 'Family Adventures Group',
      subBrand: entry.subBrand || entry.brand || '',
      siteName: entry.siteName || '',
      address: entry.address || '',
      phone: entry.phone || '',
      email: entry.email || '',
    });
  }
  if (file === 'manifest.webmanifest') {
    const v = entry.logoVersion ? '?v=' + entry.logoVersion : '';
    return new Response(JSON.stringify({
      name: (entry.siteName || 'Nursery') + ' Kitchen',
      short_name: entry.siteName || 'Kitchen',
      start_url: '../../app.html?site=' + slug,
      scope: '../../',
      display: 'standalone',
      background_color: '#F3EEE4',
      theme_color: '#1F3C55',
      icons: [
        { src: 'assets/icon-192.png' + v, sizes: '192x192', type: 'image/png' },
        { src: 'assets/icon-512.png' + v, sizes: '512x512', type: 'image/png' },
      ],
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } });
  }
  const im = ICON.exec(file);
  if (im) {
    if (entry.logo) {
      try {
        const buf = await getStore({ name: 'site-assets', consistency: 'strong' }).get(slug + '/' + im[1] + '.png', { type: 'arrayBuffer' });
        if (buf) return new Response(buf, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' } });
      } catch (e) { /* the brand's logo instead */ }
    }
    // No logo uploaded (yet): the brand's own, without a nursery name on it.
    const brand = FALLBACK[entry.brand];
    if (!brand) return notFound();
    const size = im[1] === 'logo' ? '' : '-' + im[1].slice(5);
    return new Response(null, { status: 302, headers: { Location: '/icons/brand-' + brand + size + '.png', 'Cache-Control': 'no-cache' } });
  }
  return notFound();
};

function notFound() { return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-cache' } }); }
function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } });
}

export const config = { path: '/sites/*', preferStatic: true };
