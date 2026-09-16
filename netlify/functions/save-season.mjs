// Saves one menu GROUP's season JSON — a "group" is a shared master
// document (see SITE_MENU_GROUPS in app.html): saving here updates every
// site that reads from this group immediately, with nothing to repeat per
// site. Called by the staff admin panel's "Upload changes" button.
// Password-protected: the caller must send the SAME SHA-256 hash of the
// staff password that app.html itself checks (see RB_PASSWORD_HASH in
// app.html) as the x-rb-auth header. That hash has to be set here too, as
// the UPLOAD_PASSWORD_HASH environment variable, via the Netlify dashboard
// (Site configuration -> Environment variables) or `netlify env:set
// UPLOAD_PASSWORD_HASH <hash>` — see the README. Changing the staff
// password means updating BOTH places to the new hash.
//
// Never touches the site's actual deployed files or triggers a redeploy —
// it only writes into Netlify Blobs, a separate storage bucket. That means
// a bug here can fail a save, but it can never corrupt or take down the
// live static site the way a broken custom redeploy could.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Use POST' }, 405);
  }

  const expected = process.env.UPLOAD_PASSWORD_HASH || '';
  const provided = req.headers.get('x-rb-auth') || '';
  if (!expected) {
    return json({
      error: 'This site has no UPLOAD_PASSWORD_HASH environment variable set yet — see the README for the one-time setup steps.',
    }, 500);
  }
  if (provided !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { group, file, data, patch, ifMatch } = body || {};
  if (!group || !file || (data === undefined && patch === undefined)) {
    return json({ error: 'group, file and either data or patch are required' }, 400);
  }

  const store = getStore('season-data');
  const key = group + '/' + file;

  /* PATCH MODE, used by the shared recipe bank.
   *
   * A whole-document write makes "which records did this device change?"
   * a safety-critical question, and getting it wrong destroys the other
   * admin's work silently. Four separate data-loss paths in the previous
   * design all reduced to that. A patch removes the question from the
   * blast radius: the caller names the records it touched, this function
   * applies them to whatever is currently stored, and every record the
   * caller did NOT name is untouched by construction -- however stale,
   * partial or confused the caller's own copy happens to be.
   *
   * patch = { collection: 'recipes', set: {id: record, ...}, delete: [id] }
   *
   * Read-modify-write is now CONDITIONAL -- see applyWithRetry below.
   *
   * The previous note here claimed the remaining window was "a few
   * milliseconds inside one invocation" and could only lose "a record two
   * people changed at the same instant". Both were wrong, and measurably
   * so: two concurrent invocations are the normal case in a serverless
   * runtime, and an unconditional write loses the ENTIRE other patch,
   * including records nobody else touched -- while returning 200 to both
   * callers, so the client clears its dirty marks and never retries. A
   * delete came back from the dead the same way.
   */
  if (patch !== undefined) {
    const coll = patch.collection;
    if (!coll || typeof coll !== 'string') {
      return json({ error: 'patch.collection is required' }, 400);
    }
    const toSet = patch.set && typeof patch.set === 'object' ? patch.set : {};
    const toDelete = Array.isArray(patch.delete) ? patch.delete : [];
    if (!Object.keys(toSet).length && !toDelete.length) {
      return json({ ok: true, key, noop: true }, 200);
    }

    const result = await applyWithRetry(store, key, (doc) => {
      if (!doc[coll] || typeof doc[coll] !== 'object' || Array.isArray(doc[coll])) doc[coll] = {};
      Object.keys(toSet).forEach((id) => { doc[coll][id] = toSet[id]; });
      toDelete.forEach((id) => { delete doc[coll][id]; });
      return doc;
    });
    if (!result.ok) return json({ error: result.error, conflict: !!result.conflict }, result.status);

    return json({
      ok: true,
      key,
      applied: { set: Object.keys(toSet).length, deleted: toDelete.length },
      total: Object.keys((result.doc || {})[coll] || {}).length,
      attempts: result.attempts,
      savedAt: new Date().toISOString(),
    }, 200);
  }

  /* WHOLE-DOCUMENT MODE, used by the seasons and the ingredient database.
     Also conditional now: the ingredient database reads, merges in the
     BROWSER and writes the whole thing back, so its read-modify-write
     window is a full round trip. Anything a colleague saved inside it used
     to be erased completely -- every record, not just a contested one.
     The caller sends the etag it read, and a stale one is refused so the
     browser can re-read, re-merge and try again. */
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    // JSON.stringify(null) stores the literal "null", which get-season
    // then serves forever -- the static fallback can never fire again.
    return json({ error: 'data must be a JSON object' }, 400);
  }

  let previous = null;
  let etag;
  try {
    const got = await store.getWithMetadata(key, { type: 'text' });
    if (got) { previous = got.data; etag = got.etag; }
  } catch (e) {
    return json({ error: 'Could not read the current document: ' + e.message }, 503);
  }

  if (ifMatch && etag && ifMatch !== etag) {
    return json({
      error: 'Someone else saved this while you were working on it. Your copy was not written.',
      conflict: true,
      etag,
    }, 409);
  }

  if (!(await conditionalWritesWork(store))) {
    return json({
      error: 'This site\'s storage library is too old to make writes safely (no conditional writes), '
        + 'so nothing was saved. Redeploy to pick up a current @netlify/blobs.',
    }, 503);
  }

  if (previous !== null && !etag) {
    return json({
      error: 'The store returned a document with no version, so this write could not be made safely.',
    }, 503);
  }

  // Keep what we are about to replace, so a bad publish is survivable.
  const kept = await keepBackup(store, group, file, previous);

  try {
    const res = await store.set(key, JSON.stringify(data), etag ? { onlyIfMatch: etag } : { onlyIfNew: previous === null });
    if (res && res.modified === false) {
      return json({
        error: 'Someone else saved this a moment before you. Nothing was overwritten — reload and try again.',
        conflict: true,
      }, 409);
    }
  } catch (e) {
    return json({ error: 'Could not save: ' + e.message }, 502);
  }

  return json({ ok: true, key, backup: kept, savedAt: new Date().toISOString() }, 200);
};

/* Does this store actually honour conditional writes?

   Everything below depends on it, and the failure mode if it does not is
   the worst kind: `onlyIfMatch` on a client that ignores it is simply an
   unrecognised option, so the write goes through unconditionally and the
   protection is silently absent. That is indistinguishable from working,
   which is how you end up believing a problem is fixed when it is not.

   So: prove it once, on a key nothing reads, by writing to a key that
   already exists with onlyIfNew -- which MUST be refused. If it is not,
   this deployment's @netlify/blobs is too old and every write is refused
   loudly instead, because losing an admin's work silently is worse than
   failing to save it. The result is cached for the life of the instance,
   so this costs two writes per cold start, not per save. */
let CONDITIONAL_WRITES_OK = null;

async function conditionalWritesWork(store) {
  if (CONDITIONAL_WRITES_OK !== null) return CONDITIONAL_WRITES_OK;
  const probe = '__probe/conditional-write-support';
  try {
    await store.set(probe, 'x');
    const res = await store.set(probe, 'y', { onlyIfNew: true });
    // A store that honours the option refuses this, because the key exists.
    CONDITIONAL_WRITES_OK = !!(res && res.modified === false);
  } catch (e) {
    CONDITIONAL_WRITES_OK = false;
  }
  return CONDITIONAL_WRITES_OK;
}

/* Read, apply, write-if-unchanged, and try again if somebody got there
   first. Three attempts: enough for the realistic case of two admins
   pressing publish within the same second, few enough that a genuinely
   contended key fails loudly instead of spinning. */
async function applyWithRetry(store, key, apply) {
  if (!(await conditionalWritesWork(store))) {
    return {
      ok: false, status: 503,
      error: 'This site\'s storage library is too old to make writes safely (no conditional writes), '
        + 'so nothing was saved. Redeploy to pick up a current @netlify/blobs.',
    };
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    let current = null;
    let etag;
    try {
      const got = await store.getWithMetadata(key, { type: 'text' });
      if (got) { current = got.data; etag = got.etag; }
    } catch (e) {
      // Never fall back to "assume empty" -- that is how a transient read
      // error turns into a document rebuilt from one device's copy.
      return { ok: false, status: 503, error: 'Could not read the current document: ' + e.message };
    }

    let doc = {};
    if (current !== null) {
      try {
        doc = JSON.parse(current);
      } catch (e) {
        return { ok: false, status: 409, error: 'Stored document is not valid JSON; refusing to overwrite it' };
      }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        return { ok: false, status: 409, error: 'Stored document is not an object; refusing to overwrite it' };
      }
    }

    const next = apply(doc);

    if (current !== null && !etag) {
      return {
        ok: false, status: 503,
        error: 'The store returned a document with no version, so this write could not be made safely.',
      };
    }
    try {
      const res = await store.set(
        key,
        JSON.stringify(next),
        current === null ? { onlyIfNew: true } : { onlyIfMatch: etag }
      );
      // modified === false means the condition failed: somebody wrote in
      // between our read and our write. Go round again on their version.
      if (res && res.modified === false) continue;
      return { ok: true, doc: next, attempts: attempt };
    } catch (e) {
      return { ok: false, status: 502, error: 'Could not save: ' + e.message };
    }
  }
  return {
    ok: false, status: 409, conflict: true,
    error: 'Another save kept landing first. Nothing was overwritten — try again in a moment.',
  };
}

/* A copy of whatever a publish is about to replace.

   Nothing anywhere could undo a bad publish before this -- not a mistake,
   not a wrong menu group, not an empty rotation. get-season serves the
   stored blob whenever one exists, so the static file shipped with the
   deploy is shadowed the moment anything is published over it. Keeping the
   previous version costs one extra write and is the only thing that makes
   any of it reversible. */
const BACKUPS_KEPT = 12;

async function keepBackup(store, group, file, previous) {
  if (previous === null || previous === undefined) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupKey = group + '/__backups/' + file + '.' + stamp;
  try {
    await store.set(backupKey, previous);
  } catch (e) {
    // A backup that cannot be written must never block the publish the
    // user actually asked for.
    return null;
  }
  try {
    const listed = await store.list({ prefix: group + '/__backups/' + file + '.' });
    const keys = (listed && listed.blobs ? listed.blobs : []).map((b) => b.key).sort();
    while (keys.length > BACKUPS_KEPT) {
      const oldest = keys.shift();
      try { await store.delete(oldest); } catch (e) { /* pruning is best effort */ }
    }
  } catch (e) { /* listing is best effort too */ }
  return backupKey;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
