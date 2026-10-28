/* Keeps the relational tables in step with the documents.

   project(db, group, file, docId, body) is called inside the same
   transaction as every document write: it clears whatever that document
   contributed to the tables and rebuilds it from the new JSON. The
   document text itself is never touched here -- it is stored and served
   exactly as sent (see store.mjs) -- so a mistake in this file can make a
   report wrong, but it cannot change what the app sees.

   reconstruct(db, group, file) builds the document back from the tables
   alone. It exists to prove the tables hold everything: the import checks
   every document with it (see sameData). */

const isScalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const asCol = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/* Splits a record into column values (scalar fields named in `fields`) and
   everything else, which goes to extra_json so nothing is lost. A field the
   map names but whose value is not a scalar is kept in extra_json too. */
function split(obj, fields, skip) {
  const cols = {};
  const extra = {};
  Object.keys(obj || {}).forEach((k) => {
    if (skip && skip.includes(k)) return;
    if (Object.prototype.hasOwnProperty.call(fields, k) && isScalar(obj[k])) cols[fields[k]] = asCol(obj[k]);
    else extra[k] = obj[k];
  });
  return { cols, extra: Object.keys(extra).length ? JSON.stringify(extra) : null };
}

function insert(db, table, row) {
  const keys = Object.keys(row);
  db.run(
    'INSERT INTO ' + table + ' (' + keys.join(', ') + ') VALUES (' + keys.map(() => '?').join(', ') + ')',
    keys.map((k) => (row[k] === undefined ? null : row[k]))
  );
}

function rows(db, sql, params) {
  const st = db.prepare(sql);
  const out = [];
  try {
    st.bind(params || []);
    while (st.step()) out.push(st.getAsObject());
  } finally { st.free(); }
  return out;
}
const textOf = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/* ---------- field maps: document key -> column ---------- */
const RECIPE = {
  id: 'id', name: 'name', servings: 'servings', description: 'description', course: 'course',
  dietaryCategory: 'dietary_category', version: 'version', reviewedBy: 'reviewed_by',
  reviewedAt: 'reviewed_at', dateLastUpdated: 'date_last_updated',
};
const RECIPE_ROW = {
  ingredientId: 'ingredient_id', name: 'name', qty: 'qty', unit: 'unit', prep: 'prep',
  allergens: 'allergens', canonicalName: 'canonical_name',
};
const HISTORY = { at: 'at', summary: 'summary' };
const INGREDIENT = {
  id: 'id', productName: 'product_name', category: 'category', packSize: 'pack_size',
  unitOfMeasure: 'unit_of_measure', currentPrice: 'current_price', recipeUnit: 'recipe_unit',
  recipeUnitYield: 'recipe_unit_yield', allergens: 'allergens', status: 'status',
  tescoUrl: 'tesco_url', tescoProductId: 'tesco_product_id', imageUrl: 'image_url',
  linkedToTesco: 'linked_to_tesco', nutritionBasis: 'nutrition_basis',
  nutritionSource: 'nutrition_source', nutritionLastUpdated: 'nutrition_last_updated',
  dateLastUpdated: 'date_last_updated', glutenFreeSwap: 'gluten_free_swap',
  dairyFreeSwap: 'dairy_free_swap', migratedFrom: 'migrated_from',
};
const SEASON = { key: 'key', label: 'label', file: 'file', startDate: 'start_date' };
const EXTRA_MENU = { label: 'label', weeks: 'weeks', allDay: 'all_day', teaVegChecked: 'tea_veg_checked' };
const DISH = { recipeId: 'recipe_id', baseServings: 'base_servings', description: 'description' };
const DISH_ROW = {
  ingredientId: 'ingredient_id', name: 'name', qty: 'qty', unit: 'unit', prep: 'prep', allergens: 'allergens',
};
const ALERT = { title: 'title', message: 'message' };
const RUN = { name: 'name', from: 'from_date', to: 'to_date' };
const COURSE = { name: 'name', time: 'time' };
const GROUP = { key: 'group_key', label: 'label', mult: 'mult' };
const valueOf = (o) => ('__value' in o ? o.__value : o);

/* ---------- which documents have tables ---------- */
export function docKind(group, file) {
  if (group === '_config') {
    return {
      'recipes.json': 'recipes', 'ingredients.json': 'ingredients', 'seasons.json': 'seasons',
      'extra-menus.json': 'extraMenus', 'site-menus.json': 'siteMenus',
      'siteAllergyAlerts.json': 'alerts',
    }[file] || null;
  }
  if (/\.json$/.test(file) && group && !group.startsWith('__')) return 'rotation';
  return null;
}

/* ---------- clear what one document contributed ---------- */
function clear(db, kind, docId) {
  if (kind === 'recipes') db.run('DELETE FROM recipes');
  else if (kind === 'ingredients') db.run('DELETE FROM ingredients');
  else if (kind === 'seasons') db.run('DELETE FROM seasons');
  else if (kind === 'extraMenus') db.run('DELETE FROM extra_menus');
  else if (kind === 'alerts') db.run('DELETE FROM site_allergy_alerts');
  else if (kind === 'rotation') db.run('DELETE FROM published_menus WHERE document_id = ?', [docId]);
  else if (kind === 'siteMenus') {
    db.run("UPDATE sites SET menu_group_key = 'general'");
    db.run("DELETE FROM menu_groups WHERE key <> 'general'");
  }
}

/* ---------- document -> tables ---------- */
export function project(db, group, file, docId, body) {
  const kind = docKind(group, file);
  if (!kind) return;
  let doc;
  try { doc = JSON.parse(body); } catch (e) { return; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return;
  /* In its own savepoint: if a document cannot be broken out into the
     tables (malformed data, say), the tables keep their previous contents
     for it and the problem is recorded -- the save itself always goes
     through, exactly as it did before the database existed. */
  db.run('SAVEPOINT projection');
  try {
    clear(db, kind, docId);
    const P = PROJECT[kind];
    if (P) P(db, doc, { group, file, docId });
    db.run('RELEASE projection');
    db.run('DELETE FROM meta WHERE key = ?', ['projection_error:' + group + '/' + file]);
  } catch (e) {
    db.run('ROLLBACK TO projection');
    db.run('RELEASE projection');
    db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      ['projection_error:' + group + '/' + file, new Date().toISOString() + ' ' + (e && e.message ? e.message : String(e))]);
  }
}

const PROJECT = {
  recipes(db, doc) {
    const all = doc.recipes && typeof doc.recipes === 'object' ? doc.recipes : {};
    Object.keys(all).forEach((key) => {
      const r = all[key];
      if (!r || typeof r !== 'object') return;
      const { cols, extra } = split(r, RECIPE, ['ingredients', 'method', 'utensils', 'history', 'menus']);
      const narrowed = Array.isArray(r.menus);
      const extraObj = extra ? JSON.parse(extra) : {};
      keyNote(r, key, extraObj);
      if ('menus' in r && !narrowed) extraObj.menus = r.menus;    // keep an odd value as it was
      insert(db, 'recipes', Object.assign({}, cols, {
        id: key,
        available_everywhere: narrowed ? 0 : 1,
        extra_json: Object.keys(extraObj).length ? JSON.stringify(extraObj) : null,
      }));
      listOf(r.ingredients).forEach((row, i) => {
        if (!row || typeof row !== 'object') return;
        const s = split(row, RECIPE_ROW);
        insert(db, 'recipe_ingredients', Object.assign({ recipe_id: key, position: i }, s.cols, { extra_json: s.extra }));
      });
      projectSteps(db, 'recipe_method_steps', 'recipe_method_substeps', { recipe_id: key }, r.method);
      projectSteps(db, 'recipe_utensils', null, { recipe_id: key }, r.utensils);
      listOf(r.history).forEach((h, i) => {
        const s = split(h || {}, HISTORY);
        insert(db, 'recipe_history', Object.assign({ recipe_id: key, position: i }, s.cols, { extra_json: s.extra }));
      });
      if (narrowed) {
        Array.from(new Set(r.menus.map(String))).forEach((g) => insert(db, 'recipe_menu_groups', { recipe_id: key, menu_group_key: g }));
      }
    });
  },

  ingredients(db, doc) {
    const all = doc.ingredients && typeof doc.ingredients === 'object' ? doc.ingredients : {};
    Object.keys(all).forEach((key) => {
      const rec = all[key];
      if (!rec || typeof rec !== 'object') return;
      const { cols, extra } = split(rec, INGREDIENT, ['nutrition', 'trafficLights', 'history']);
      const extraObj = extra ? JSON.parse(extra) : {};
      keyNote(rec, key, extraObj);
      ['nutrition', 'trafficLights'].forEach((k) => {
        if (k in rec && (!rec[k] || typeof rec[k] !== 'object' || Array.isArray(rec[k]))) extraObj[k] = rec[k];
      });
      if ('history' in rec && !Array.isArray(rec.history)) extraObj.history = rec.history;
      insert(db, 'ingredients', Object.assign({}, cols, { id: key, extra_json: Object.keys(extraObj).length ? JSON.stringify(extraObj) : null }));
      if (rec.nutrition && typeof rec.nutrition === 'object' && !Array.isArray(rec.nutrition)) {
        Object.keys(rec.nutrition).forEach((n) => insert(db, 'ingredient_nutrition', { ingredient_id: key, nutrient: n, value: isScalar(rec.nutrition[n]) ? asCol(rec.nutrition[n]) : JSON.stringify(rec.nutrition[n]) }));
      }
      if (rec.trafficLights && typeof rec.trafficLights === 'object' && !Array.isArray(rec.trafficLights)) {
        Object.keys(rec.trafficLights).forEach((n) => insert(db, 'ingredient_traffic_lights', { ingredient_id: key, nutrient: n, level: isScalar(rec.trafficLights[n]) ? asCol(rec.trafficLights[n]) : JSON.stringify(rec.trafficLights[n]) }));
      }
      listOf(rec.history).forEach((h, i) => {
        const s = split(h || {}, HISTORY);
        insert(db, 'ingredient_history', Object.assign({ ingredient_id: key, position: i }, s.cols, { extra_json: s.extra }));
      });
    });
  },

  seasons(db, doc) {
    const seen = new Set();
    listOf(doc.seasons).forEach((s, i) => {
      if (!s || typeof s !== 'object' || !s.key || seen.has(s.key)) return;
      seen.add(s.key);
      const { cols, extra } = split(s, SEASON);
      insert(db, 'seasons', Object.assign({ label: String(s.label || s.key), file: String(s.file || s.key + '.json') }, cols, { position: i, extra_json: extra }));
    });
    // Published rotations name their season by file: keep that link current.
    db.run('UPDATE published_menus SET season_key = (SELECT key FROM seasons WHERE seasons.file = published_menus.file)');
  },

  extraMenus(db, doc) {
    const all = doc.menus && typeof doc.menus === 'object' ? doc.menus : {};
    Object.keys(all).forEach((key) => {
      const m = all[key];
      if (!m || typeof m !== 'object') return;
      const { cols, extra } = split(m, EXTRA_MENU, ['sites', 'courses', 'groups', 'runs']);
      const extraObj = extra ? JSON.parse(extra) : {};
      ['sites', 'groups', 'runs'].forEach((k) => { if (k in m && !Array.isArray(m[k])) extraObj[k] = m[k]; });
      if ('courses' in m && (!m.courses || typeof m.courses !== 'object' || Array.isArray(m.courses))) extraObj.courses = m.courses;
      insert(db, 'extra_menus', Object.assign({ key }, cols, { extra_json: Object.keys(extraObj).length ? JSON.stringify(extraObj) : null }));
      if (Array.isArray(m.sites)) Array.from(new Set(m.sites.map(String))).forEach((s) => insert(db, 'extra_menu_sites', { menu_key: key, site_slug: s }));
      if (m.courses && typeof m.courses === 'object' && !Array.isArray(m.courses)) {
        Object.keys(m.courses).forEach((c, i) => {
          const v = m.courses[c];
          const s = split(v && typeof v === 'object' ? v : { __value: v }, COURSE);
          insert(db, 'extra_menu_courses', Object.assign({ menu_key: key, course: c, position: i }, s.cols, { extra_json: s.extra }));
        });
      }
      if (Array.isArray(m.groups)) m.groups.forEach((g, i) => {
        const s = split(g && typeof g === 'object' ? g : { __value: g }, GROUP);
        insert(db, 'extra_menu_groups', Object.assign({ menu_key: key, position: i }, s.cols, { extra_json: s.extra }));
      });
      if (Array.isArray(m.runs)) m.runs.forEach((r, i) => {
        const s = split(r || {}, RUN);
        insert(db, 'extra_menu_runs', Object.assign({ menu_key: key, position: i }, s.cols, { extra_json: s.extra }));
      });
    });
  },

  siteMenus(db, doc) {
    const menus = doc.menus && typeof doc.menus === 'object' ? doc.menus : {};
    let pos = 1;
    Object.keys(menus).forEach((key) => {
      const m = menus[key] || {};
      const label = String(m.label || key);
      const from = m.startedFrom ? String(m.startedFrom) : null;
      if (key === 'general') { db.run('UPDATE menu_groups SET label = ? WHERE key = ?', [label, 'general']); return; }
      db.run('INSERT INTO menu_groups (key, label, started_from, position) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET label = excluded.label, started_from = excluded.started_from, position = excluded.position', [key, label, from, pos++]);
    });
    const sites = doc.sites && typeof doc.sites === 'object' ? doc.sites : {};
    Object.keys(sites).forEach((slug) => {
      const g = sites[slug];
      db.run("INSERT OR IGNORE INTO sites (slug, menu_group_key) VALUES (?, 'general')", [slug]);
      // A site on a menu that does not exist reads the Main Menu (same rule as app.html).
      const known = rows(db, 'SELECT 1 FROM menu_groups WHERE key = ?', [g]).length;
      db.run('UPDATE sites SET menu_group_key = ? WHERE slug = ?', [known ? g : 'general', slug]);
    });
  },

  alerts(db, doc) {
    const all = doc.alerts && typeof doc.alerts === 'object' ? doc.alerts : {};
    Object.keys(all).forEach((slug) => {
      const a = all[slug];
      const { cols, extra } = split(a && typeof a === 'object' ? a : { __value: a }, ALERT);
      insert(db, 'site_allergy_alerts', Object.assign({ site_slug: slug }, cols, { extra_json: extra }));
    });
  },

  rotation(db, doc, { group, file, docId }) {
    const season = rows(db, 'SELECT key FROM seasons WHERE file = ?', [file])[0];
    insert(db, 'published_menus', { document_id: docId, menu_key: group, season_key: season ? season.key : null, file });
    const pm = rows(db, 'SELECT id FROM published_menus WHERE document_id = ?', [docId])[0].id;
    Object.keys(doc).forEach((wk) => {
      const days = doc[wk];
      if (!days || typeof days !== 'object') return;
      Object.keys(days).forEach((day) => {
        const courses = days[day];
        if (!courses || typeof courses !== 'object') return;
        Object.keys(courses).forEach((course) => {
          const dishes = courses[course];
          if (!dishes || typeof dishes !== 'object') return;
          Object.keys(dishes).forEach((name, pos) => {
            const d = dishes[name] || {};
            const { cols, extra } = split(d, DISH, ['ingredients', 'method', 'utensils']);
            const extraObj = extra ? JSON.parse(extra) : {};
            ['ingredients', 'method', 'utensils'].forEach((k) => { if (k in d && !Array.isArray(d[k])) extraObj[k] = d[k]; });
            insert(db, 'published_dishes', Object.assign({ published_menu_id: pm, week: wk, day, course, position: pos, recipe_name: name }, cols, { extra_json: Object.keys(extraObj).length ? JSON.stringify(extraObj) : null }));
            const dishId = rows(db, 'SELECT last_insert_rowid() AS id')[0].id;
            listOf(d.ingredients).forEach((row, i) => {
              const s = split(row || {}, DISH_ROW);
              insert(db, 'published_dish_ingredients', Object.assign({ dish_id: dishId, position: i }, s.cols, { extra_json: s.extra }));
            });
            projectSteps(db, 'published_dish_method_steps', 'published_dish_method_substeps', { dish_id: dishId }, d.method);
            projectSteps(db, 'published_dish_utensils', null, { dish_id: dishId }, d.utensils);
          });
        });
      });
    });
  },
};

function listOf(v) { return Array.isArray(v) ? v : []; }

/* Method steps and utensils: each is plain text, or an object such as
   {text: "Make roux:", subs: [...]} -- a heading with sub-steps, which go
   to their own table. */
function projectSteps(db, table, subTable, parent, list) {
  listOf(list).forEach((step, i) => {
    const base = Object.assign({}, parent, { position: i });
    if (typeof step === 'string') { insert(db, table, Object.assign(base, { text: step })); return; }
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      insert(db, table, Object.assign(base, { text: null, extra_json: JSON.stringify({ __value: step }) }));
      return;
    }
    const withSubs = subTable && Array.isArray(step.subs);
    const s = split(step, { text: 'text' }, withSubs ? ['subs'] : []);
    const extraObj = s.extra ? JSON.parse(s.extra) : {};
    extraObj.__object = true;
    insert(db, table, Object.assign(base, s.cols, { extra_json: JSON.stringify(extraObj) }));
    if (withSubs) step.subs.forEach((sub, j) => insert(db, subTable, Object.assign({}, parent, { step_position: i, position: j, text: textOf(sub) })));
  });
}
function rebuildSteps(stepRows, subRows) {
  return stepRows.map((r) => {
    const extra = r.extra_json ? JSON.parse(r.extra_json) : null;
    if (!extra) return r.text;
    if ('__value' in extra) return extra.__value;
    const obj = {};
    if (r.text !== null && r.text !== undefined) obj.text = r.text;
    Object.keys(extra).forEach((k) => { if (k !== '__object') obj[k] = extra[k]; });
    const subs = (subRows || []).filter((x) => x.step_position === r.position);
    if (subs.length) obj.subs = subs.map((x) => x.text);
    return obj;
  });
}
/* A record is filed under its key; normally its own id is the same. Note
   when it is not, so the record can be rebuilt exactly. */
function keyNote(rec, key, extraObj) {
  if (!('id' in rec)) extraObj.__noId = true;
  else if (rec.id !== key) extraObj.__id = rec.id;
}
function restoreId(rec, key) {
  rec.id = key;
  if (rec.__noId) delete rec.id;
  else if ('__id' in rec) rec.id = rec.__id;
  delete rec.__noId; delete rec.__id;
}

/* ---------- tables -> document (for checking) ---------- */
function unsplit(row, fields) {
  const out = {};
  Object.keys(fields).forEach((k) => { if (row[fields[k]] !== null && row[fields[k]] !== undefined) out[k] = row[fields[k]]; });
  if (row.extra_json) Object.assign(out, JSON.parse(row.extra_json));
  return out;
}
function byKey(list, key) {
  const m = new Map();
  list.forEach((r) => { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}

export function reconstruct(db, group, file) {
  const kind = docKind(group, file);
  if (kind === 'recipes') {
    const ing = byKey(rows(db, 'SELECT * FROM recipe_ingredients ORDER BY recipe_id, position'), 'recipe_id');
    const meth = byKey(rows(db, 'SELECT * FROM recipe_method_steps ORDER BY recipe_id, position'), 'recipe_id');
    const subs = byKey(rows(db, 'SELECT * FROM recipe_method_substeps ORDER BY recipe_id, step_position, position'), 'recipe_id');
    const ut = byKey(rows(db, 'SELECT * FROM recipe_utensils ORDER BY recipe_id, position'), 'recipe_id');
    const hist = byKey(rows(db, 'SELECT * FROM recipe_history ORDER BY recipe_id, position'), 'recipe_id');
    const mg = byKey(rows(db, 'SELECT * FROM recipe_menu_groups'), 'recipe_id');
    const out = {};
    rows(db, 'SELECT * FROM recipes').forEach((r) => {
      const rec = unsplit(r, RECIPE);
      const key = r.id;
      restoreId(rec, key);
      if (ing.has(r.id)) rec.ingredients = ing.get(r.id).map((x) => unsplit(x, RECIPE_ROW));
      if (meth.has(r.id)) rec.method = rebuildSteps(meth.get(r.id), subs.get(r.id));
      if (ut.has(r.id)) rec.utensils = rebuildSteps(ut.get(r.id));
      if (hist.has(r.id)) rec.history = hist.get(r.id).map((x) => unsplit(x, HISTORY));
      if (!r.available_everywhere) rec.menus = (mg.get(r.id) || []).map((x) => x.menu_group_key);
      out[key] = rec;
    });
    return { recipes: out };
  }
  if (kind === 'ingredients') {
    const nut = byKey(rows(db, 'SELECT * FROM ingredient_nutrition'), 'ingredient_id');
    const tl = byKey(rows(db, 'SELECT * FROM ingredient_traffic_lights'), 'ingredient_id');
    const hist = byKey(rows(db, 'SELECT * FROM ingredient_history ORDER BY ingredient_id, position'), 'ingredient_id');
    const out = {};
    rows(db, 'SELECT * FROM ingredients').forEach((r) => {
      const rec = unsplit(r, INGREDIENT);
      const key = r.id;
      restoreId(rec, key);
      if (nut.has(r.id)) rec.nutrition = Object.fromEntries(nut.get(r.id).map((x) => [x.nutrient, x.value]));
      if (tl.has(r.id)) rec.trafficLights = Object.fromEntries(tl.get(r.id).map((x) => [x.nutrient, x.level]));
      if (hist.has(r.id)) rec.history = hist.get(r.id).map((x) => unsplit(x, HISTORY));
      out[key] = rec;
    });
    return { ingredients: out };
  }
  if (kind === 'seasons') {
    return { seasons: rows(db, 'SELECT * FROM seasons ORDER BY position').map((r) => unsplit(r, SEASON)) };
  }
  if (kind === 'extraMenus') {
    const sites = byKey(rows(db, 'SELECT * FROM extra_menu_sites'), 'menu_key');
    const courses = byKey(rows(db, 'SELECT * FROM extra_menu_courses ORDER BY menu_key, position'), 'menu_key');
    const groups = byKey(rows(db, 'SELECT * FROM extra_menu_groups ORDER BY menu_key, position'), 'menu_key');
    const runs = byKey(rows(db, 'SELECT * FROM extra_menu_runs ORDER BY menu_key, position'), 'menu_key');
    const out = {};
    rows(db, 'SELECT * FROM extra_menus').forEach((r) => {
      const m = unsplit(r, EXTRA_MENU);
      if (sites.has(r.key)) m.sites = sites.get(r.key).map((x) => x.site_slug);
      if (courses.has(r.key)) m.courses = Object.fromEntries(courses.get(r.key).map((x) => [x.course, valueOf(unsplit(x, COURSE))]));
      if (groups.has(r.key)) m.groups = groups.get(r.key).map((x) => valueOf(unsplit(x, GROUP)));
      if (runs.has(r.key)) m.runs = runs.get(r.key).map((x) => unsplit(x, RUN));
      out[r.key] = m;
    });
    return { menus: out };
  }
  if (kind === 'siteMenus') {
    const menus = {};
    rows(db, 'SELECT * FROM menu_groups ORDER BY position').forEach((g) => {
      menus[g.key] = g.started_from ? { label: g.label, startedFrom: g.started_from } : { label: g.label };
    });
    const sites = {};
    rows(db, 'SELECT slug, menu_group_key FROM sites').forEach((s) => { sites[s.slug] = s.menu_group_key; });
    return { menus, sites };
  }
  if (kind === 'alerts') {
    const out = {};
    rows(db, 'SELECT * FROM site_allergy_alerts').forEach((r) => {
      const a = unsplit(r, ALERT);
      out[r.site_slug] = '__value' in a ? a.__value : a;
    });
    return { alerts: out };
  }
  if (kind === 'rotation') {
    const pm = rows(db, 'SELECT pm.id FROM published_menus pm JOIN documents d ON d.id = pm.document_id WHERE d.doc_group = ? AND d.file = ?', [group, file])[0];
    if (!pm) return null;
    const dishes = rows(db, 'SELECT * FROM published_dishes WHERE published_menu_id = ? ORDER BY id', [pm.id]);
    const ids = dishes.map((d) => d.id);
    const q = (t) => (ids.length ? byKey(rows(db, 'SELECT * FROM ' + t + ' WHERE dish_id IN (' + ids.map(() => '?').join(',') + ') ORDER BY dish_id, position', ids), 'dish_id') : new Map());
    const ing = q('published_dish_ingredients'), meth = q('published_dish_method_steps'), ut = q('published_dish_utensils');
    const subs = ids.length ? byKey(rows(db, 'SELECT * FROM published_dish_method_substeps WHERE dish_id IN (' + ids.map(() => '?').join(',') + ') ORDER BY dish_id, step_position, position', ids), 'dish_id') : new Map();
    const out = {};
    dishes.forEach((d) => {
      const dish = unsplit(d, DISH);
      if (ing.has(d.id)) dish.ingredients = ing.get(d.id).map((x) => unsplit(x, DISH_ROW));
      if (meth.has(d.id)) dish.method = rebuildSteps(meth.get(d.id), subs.get(d.id));
      if (ut.has(d.id)) dish.utensils = rebuildSteps(ut.get(d.id));
      ((out[d.week] = out[d.week] || {})[d.day] = out[d.week][d.day] || {});
      (out[d.week][d.day][d.course] = out[d.week][d.day][d.course] || {})[d.recipe_name] = dish;
    });
    return out;
  }
  return null;
}

/* The same data, allowing for what a table cannot tell apart: key order,
   a missing field versus null, true/false versus 1/0, an empty list versus
   none, and a number stored in a REAL column. */
export function sameData(a, b) {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
function norm(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  if (Array.isArray(v)) return v.length ? v.map(norm) : undefined;
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach((k) => {
      const n = norm(v[k]);
      if (n !== undefined && n !== null) out[k] = n;
    });
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 1e9) / 1e9;
  return v;
}
