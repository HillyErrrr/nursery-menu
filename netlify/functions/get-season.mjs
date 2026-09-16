// Reads one menu GROUP's season JSON — a "group" is a shared master document
// (see SITE_MENU_GROUPS in app.html): most sites read the same "general"
// group, so one save updates every site sharing it at once. A site with its
// own separate menu (currently just Weston-super-Mare, group
// "weston-super-mare") gets its own group instead, so a general-menu edit
// can never silently overwrite its substitutions.
//
// Checked in this order:
//   1. Netlify Blobs — the latest version saved via the staff admin panel's
//      "Upload changes" button, if any edit has ever been saved for this
//      group+season since the site last went through a full redeploy.
//   2. The plain static file this deployment ships with (groups/<group>/
//      seasons/<file>), fetched from this same live site — the original
//      source of truth, and what's served if nothing has been saved via
//      Upload changes yet.
// No password is needed to READ — same as the static JSON files this
// replaces, which were never secret; only WRITING (save-season.mjs) is
// gated behind the staff password.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url = new URL(req.url);
  const group = url.searchParams.get('group');
  const file = url.searchParams.get('file');

  if (!group || !file) {
    return json({ error: 'group and file query params are required' }, 400);
  }

  const store = getStore('season-data');
  const key = group + '/' + file;

  // Whether the Blobs read FAILED, as opposed to cleanly returning nothing.
  // These are completely different answers and conflating them is a
  // data-loss bug: a client that reads "nothing is stored" when the truth
  // is "we could not tell" will happily seed the document from its own
  // copy, overwriting whatever was really there. The static fallback below
  // is right for a season (a kitchen iPad must show today's menu even if
  // Blobs is down) but a _config document has no static file, so its 404
  // has to mean genuinely empty and nothing else.
  /* Backups of what previous publishes replaced (see keepBackup in
     save-season). ?backups=1 lists them; ?backup=<key> returns one. Both
     are reads, so they need no password, same as everything else here. */
  if (url.searchParams.get('backups') === '1') {
    try {
      const listed = await store.list({ prefix: group + '/__backups/' + file + '.' });
      const blobs = (listed && listed.blobs ? listed.blobs : [])
        .map((b) => b.key)
        .sort()
        .reverse();
      return json({ backups: blobs }, 200);
    } catch (e) {
      return json({ error: 'Could not list backups: ' + e.message }, 503);
    }
  }
  const wantBackup = url.searchParams.get('backup');
  if (wantBackup) {
    if (!wantBackup.startsWith(group + '/__backups/' + file + '.')) {
      return json({ error: 'That backup does not belong to this menu and season.' }, 400);
    }
    try {
      const body = await store.get(wantBackup);
      if (body === null) return json({ error: 'No such backup.' }, 404);
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-RB-Source': 'backup' },
      });
    } catch (e) {
      return json({ error: 'Could not read that backup: ' + e.message }, 503);
    }
  }

  let blobsFailed = false;
  try {
    const saved = await store.getWithMetadata(key, { type: 'text' });
    if (saved !== null && saved !== undefined) {
      return new Response(saved.data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          // What this actually is, and the version of it, so a caller can
          // write back conditionally instead of blindly.
          'X-RB-Source': 'live',
          'X-RB-Etag': saved.etag || '',
        },
      });
    }
  } catch (e) {
    blobsFailed = true;
  }

  const staticUrl = new URL(
    '/groups/' + encodeURIComponent(group) + '/seasons/' + encodeURIComponent(file),
    req.url
  );
  let staticRes;
  try {
    staticRes = await fetch(staticUrl);
  } catch (e) {
    return json({ error: 'Could not reach the static file either: ' + e.message }, 502);
  }
  if (!staticRes.ok) {
    if (blobsFailed) {
      // 503, not 404: "we could not read it", never "there is nothing there".
      return json({
        error: 'Could not read ' + group + '/' + file + ' from storage, and there is no static copy.',
        unavailable: true,
      }, 503);
    }
    return json({ error: 'No data found for ' + group + '/' + file }, 404);
  }
  /* THE DEPLOY-TIME SNAPSHOT, not the live menu.
     It used to be returned as a plain 200, indistinguishable from a real
     blob -- so when storage had a bad moment, "Get the published version"
     replaced a rotation with a copy that could be weeks old and reported
     that it had loaded the live menu. Publishing after that put the old
     snapshot live for every site. The header says which it is; the client
     refuses to import a fallback over local work. */
  /* Two different things wear the same clothes here, and conflating them
     is what made this dangerous.

     - Storage answered and simply holds nothing for this menu yet. The
       file shipped with the deploy is then the legitimate starting point,
       and a new device is SUPPOSED to seed itself from it. 'static-seed'.

     - Storage could not be READ. The same file is then a snapshot that
       may be weeks out of date, and importing it over a rotation loses
       every change published since that deploy -- which is exactly what
       used to happen, silently, reported as "loaded the live menu".
       'static-fallback', and the client refuses to import it.

     blobsFailed is the only thing that can tell them apart, so it decides
     the header. */
  const text = await staticRes.text();
  return new Response(text, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-RB-Source': blobsFailed ? 'static-fallback' : 'static-seed',
    },
  });
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
