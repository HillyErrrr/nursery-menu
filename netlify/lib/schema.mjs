/* The kitchen-prep SQLite database: schema version 1.

   Two layers, in one database file.

   1. `documents` -- every document the app reads and writes, exactly as it
      was sent (the same JSON text, byte for byte, and its version tag). The
      two Netlify Functions serve and conditionally replace these, so the
      app sees precisely what it saw before the database existed: same
      responses, same version checks, same "someone else saved first"
      conflicts. This is what makes the move to SQLite change nothing.

   2. The relational tables -- sites, menus, seasons, recipes, ingredients,
      published rotations, extra menus, allergy alerts and users -- kept in
      step with the documents inside the same transaction on every save
      (see projection.mjs). They hold the same data broken out into proper
      rows and relationships, for querying, reporting and the features
      that come next (budgets, logins). Anything in a record that has no
      column of its own is kept in that row's extra_json, so nothing is
      dropped.

   Some links between records are deliberately "soft" (plain TEXT, indexed,
   no FOREIGN KEY): a recipe row may point at an ingredient that has since
   been deleted, and a published menu names recipes by the id they had when
   it was published. The app tolerates both by design, and an enforced
   foreign key would refuse to store data the app already has. Views
   (v_recipe_ingredient_links, v_published_dish_links) show which of those
   links resolve. Links that are always whole are real foreign keys. */

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

/* ---------- the app's documents, exactly as sent ---------- */
CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY,
  doc_group   TEXT NOT NULL,          -- "_config", a menu group key, or an extra menu key
  file        TEXT NOT NULL,          -- e.g. "recipes.json", "autumn-winter-2025.json"
  body        TEXT NOT NULL,          -- the JSON text, byte for byte
  etag        TEXT NOT NULL,          -- version tag the app sends back as ifMatch
  updated_at  TEXT NOT NULL,
  UNIQUE (doc_group, file)
);

CREATE TABLE IF NOT EXISTS document_backups (
  id          INTEGER PRIMARY KEY,
  backup_key  TEXT NOT NULL UNIQUE,   -- "<group>/__backups/<file>.<timestamp>", as listed to the app
  doc_group   TEXT NOT NULL,
  file        TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_document_backups_doc ON document_backups (doc_group, file);

/* ---------- organisation ---------- */
CREATE TABLE IF NOT EXISTS brands (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE          -- "Little Adventures", "Green Giraffe"
);

CREATE TABLE IF NOT EXISTS menu_groups (
  key           TEXT PRIMARY KEY,     -- "general", "weston-super-mare", "washwood-heath-nursery"
  label         TEXT NOT NULL,        -- "Main Menu", "WSM Only", ...
  started_from  TEXT,                 -- the menu it was split off (soft link to menu_groups)
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sites (
  slug            TEXT PRIMARY KEY,   -- "little-adventures-cheddar"
  brand_id        INTEGER REFERENCES brands (id),
  name            TEXT,               -- "Cheddar"
  menu_group_key  TEXT NOT NULL DEFAULT 'general' REFERENCES menu_groups (key),
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  config_json     TEXT                -- sites/<slug>/config.json as shipped
);
CREATE INDEX IF NOT EXISTS ix_sites_menu_group ON sites (menu_group_key);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'site')),
  site_slug       TEXT REFERENCES sites (slug) ON DELETE CASCADE,
  password_salt   TEXT NOT NULL,
  password_hash   TEXT NOT NULL,      -- scrypt of the SHA-256 the app sends (see users.mjs)
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  CHECK ((role = 'site') = (site_slug IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS seasons (
  key         TEXT PRIMARY KEY,       -- "autumn-winter-2025"
  label       TEXT NOT NULL,          -- "Autumn/Winter 2026"
  file        TEXT NOT NULL UNIQUE,   -- "autumn-winter-2025.json"
  start_date  TEXT,                   -- YYYY-MM-DD, or NULL for the fallback season
  position    INTEGER NOT NULL DEFAULT 0,
  extra_json  TEXT
);

CREATE TABLE IF NOT EXISTS site_allergy_alerts (
  site_slug   TEXT PRIMARY KEY,       -- soft link to sites (an alert may name a site not listed)
  title       TEXT,
  message     TEXT,
  extra_json  TEXT
);

/* ---------- ingredient database ---------- */
CREATE TABLE IF NOT EXISTS ingredients (
  id                      TEXT PRIMARY KEY,
  product_name            TEXT,
  category                TEXT,
  pack_size               TEXT,
  unit_of_measure         TEXT,
  current_price           REAL,
  recipe_unit             TEXT,
  recipe_unit_yield       REAL,
  allergens               TEXT,
  status                  TEXT,
  tesco_url               TEXT,
  tesco_product_id        TEXT,
  image_url               TEXT,
  linked_to_tesco         INTEGER,
  nutrition_basis         TEXT,
  nutrition_source        TEXT,
  nutrition_last_updated  TEXT,
  date_last_updated       TEXT,
  gluten_free_swap        TEXT,
  dairy_free_swap         TEXT,
  migrated_from           TEXT,
  extra_json              TEXT
);

CREATE TABLE IF NOT EXISTS ingredient_nutrition (
  ingredient_id  TEXT NOT NULL REFERENCES ingredients (id) ON DELETE CASCADE,
  nutrient       TEXT NOT NULL,       -- "energyKcal", "fat", "sugars", ...
  value          REAL,
  PRIMARY KEY (ingredient_id, nutrient)
);

CREATE TABLE IF NOT EXISTS ingredient_traffic_lights (
  ingredient_id  TEXT NOT NULL REFERENCES ingredients (id) ON DELETE CASCADE,
  nutrient       TEXT NOT NULL,
  level          TEXT,
  PRIMARY KEY (ingredient_id, nutrient)
);

CREATE TABLE IF NOT EXISTS ingredient_history (
  ingredient_id  TEXT NOT NULL REFERENCES ingredients (id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  at             TEXT,
  summary        TEXT,
  extra_json     TEXT,
  PRIMARY KEY (ingredient_id, position)
);

/* ---------- recipe bank ---------- */
CREATE TABLE IF NOT EXISTS recipes (
  id                 TEXT PRIMARY KEY,
  name               TEXT,
  servings           REAL,
  description        TEXT,
  course             TEXT,
  dietary_category   TEXT,
  version            INTEGER,
  reviewed_by        TEXT,
  reviewed_at        TEXT,
  date_last_updated  TEXT,
  available_everywhere INTEGER NOT NULL DEFAULT 1,  -- 0 when recipe_menu_groups narrows it
  extra_json         TEXT
);
CREATE INDEX IF NOT EXISTS ix_recipes_name ON recipes (name);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id      TEXT NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  ingredient_id  TEXT,                -- soft link to ingredients (may be blank or deleted)
  name           TEXT,
  qty,                                -- no type on purpose: a number, or text such as "as needed"
  unit           TEXT,
  prep           TEXT,
  allergens      TEXT,
  canonical_name TEXT,
  extra_json     TEXT,
  PRIMARY KEY (recipe_id, position)
);
CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_ingredient ON recipe_ingredients (ingredient_id);

-- A step is either plain text or a heading with sub-steps ("Make roux:" then its steps).
CREATE TABLE IF NOT EXISTS recipe_method_steps (
  recipe_id   TEXT NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  text        TEXT,
  extra_json  TEXT,
  PRIMARY KEY (recipe_id, position)
);

CREATE TABLE IF NOT EXISTS recipe_method_substeps (
  recipe_id      TEXT NOT NULL,
  step_position  INTEGER NOT NULL,
  position       INTEGER NOT NULL,
  text           TEXT,
  PRIMARY KEY (recipe_id, step_position, position),
  FOREIGN KEY (recipe_id, step_position) REFERENCES recipe_method_steps (recipe_id, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_utensils (
  recipe_id   TEXT NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  text        TEXT,
  extra_json  TEXT,
  PRIMARY KEY (recipe_id, position)
);

-- Which nursery menus may use a recipe, when it is narrowed (absent = every menu).
CREATE TABLE IF NOT EXISTS recipe_menu_groups (
  recipe_id       TEXT NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  menu_group_key  TEXT NOT NULL,      -- soft: may name a menu that has since been removed
  PRIMARY KEY (recipe_id, menu_group_key)
);

CREATE TABLE IF NOT EXISTS recipe_history (
  recipe_id   TEXT NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  at          TEXT,
  summary     TEXT,
  extra_json  TEXT,
  PRIMARY KEY (recipe_id, position)
);

/* ---------- extra menus (holiday clubs) ---------- */
CREATE TABLE IF NOT EXISTS extra_menus (
  key              TEXT PRIMARY KEY,
  label            TEXT,
  weeks            INTEGER,
  all_day          TEXT,
  tea_veg_checked  INTEGER,
  extra_json       TEXT
);

CREATE TABLE IF NOT EXISTS extra_menu_sites (
  menu_key   TEXT NOT NULL REFERENCES extra_menus (key) ON DELETE CASCADE,
  site_slug  TEXT NOT NULL,           -- soft link to sites
  PRIMARY KEY (menu_key, site_slug)
);

CREATE TABLE IF NOT EXISTS extra_menu_courses (
  menu_key  TEXT NOT NULL REFERENCES extra_menus (key) ON DELETE CASCADE,
  course    TEXT NOT NULL,            -- "Main", "Tea Vegetarian Option", ...
  position  INTEGER NOT NULL,
  name      TEXT,
  time      TEXT,
  extra_json TEXT,
  PRIMARY KEY (menu_key, course)
);

CREATE TABLE IF NOT EXISTS extra_menu_groups (
  menu_key   TEXT NOT NULL REFERENCES extra_menus (key) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  group_key  TEXT,
  label      TEXT,
  mult       REAL,
  extra_json TEXT,
  PRIMARY KEY (menu_key, position)
);

CREATE TABLE IF NOT EXISTS extra_menu_runs (
  menu_key   TEXT NOT NULL REFERENCES extra_menus (key) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  name       TEXT,
  from_date  TEXT,
  to_date    TEXT,
  extra_json TEXT,
  PRIMARY KEY (menu_key, position)
);

/* ---------- published rotations (what the kitchens are served) ---------- */
CREATE TABLE IF NOT EXISTS published_menus (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL UNIQUE REFERENCES documents (id) ON DELETE CASCADE,
  menu_key     TEXT NOT NULL,         -- nursery menu group key, or extra menu key
  season_key   TEXT,                  -- the season, for a nursery menu; NULL for an extra menu
  file         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS published_dishes (
  id                 INTEGER PRIMARY KEY,
  published_menu_id  INTEGER NOT NULL REFERENCES published_menus (id) ON DELETE CASCADE,
  week               TEXT NOT NULL,
  day                TEXT NOT NULL,
  course             TEXT NOT NULL,
  position           INTEGER NOT NULL,  -- order within the course (normally one dish)
  recipe_name        TEXT NOT NULL,
  recipe_id          TEXT,               -- soft link to recipes, as published
  base_servings      REAL,
  description        TEXT,
  extra_json         TEXT,
  UNIQUE (published_menu_id, week, day, course, position)
);
CREATE INDEX IF NOT EXISTS ix_published_dishes_recipe ON published_dishes (recipe_id);

CREATE TABLE IF NOT EXISTS published_dish_ingredients (
  dish_id        INTEGER NOT NULL REFERENCES published_dishes (id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  ingredient_id  TEXT,
  name           TEXT,
  qty,                                -- untyped, as above
  unit           TEXT,
  prep           TEXT,
  allergens      TEXT,
  extra_json     TEXT,
  PRIMARY KEY (dish_id, position)
);

CREATE TABLE IF NOT EXISTS published_dish_method_steps (
  dish_id     INTEGER NOT NULL REFERENCES published_dishes (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  text        TEXT,
  extra_json  TEXT,
  PRIMARY KEY (dish_id, position)
);

CREATE TABLE IF NOT EXISTS published_dish_method_substeps (
  dish_id        INTEGER NOT NULL,
  step_position  INTEGER NOT NULL,
  position       INTEGER NOT NULL,
  text           TEXT,
  PRIMARY KEY (dish_id, step_position, position),
  FOREIGN KEY (dish_id, step_position) REFERENCES published_dish_method_steps (dish_id, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS published_dish_utensils (
  dish_id     INTEGER NOT NULL REFERENCES published_dishes (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  text        TEXT,
  extra_json  TEXT,
  PRIMARY KEY (dish_id, position)
);

/* ---------- views ---------- */
CREATE VIEW IF NOT EXISTS v_recipe_ingredient_links AS
  SELECT ri.recipe_id, r.name AS recipe_name, ri.position, ri.ingredient_id,
         COALESCE(i.product_name, ri.name) AS ingredient_name,
         ri.qty, ri.unit, (i.id IS NOT NULL) AS linked
  FROM recipe_ingredients ri
  JOIN recipes r ON r.id = ri.recipe_id
  LEFT JOIN ingredients i ON i.id = ri.ingredient_id;

CREATE VIEW IF NOT EXISTS v_published_dish_links AS
  SELECT pm.menu_key, pm.season_key, d.week, d.day, d.course, d.recipe_name,
         d.recipe_id, (r.id IS NOT NULL) AS recipe_in_bank
  FROM published_dishes d
  JOIN published_menus pm ON pm.id = d.published_menu_id
  LEFT JOIN recipes r ON r.id = d.recipe_id;

CREATE VIEW IF NOT EXISTS v_site_menus AS
  SELECT s.slug, b.name AS brand, s.name AS site, s.menu_group_key, mg.label AS menu
  FROM sites s
  LEFT JOIN brands b ON b.id = s.brand_id
  LEFT JOIN menu_groups mg ON mg.key = s.menu_group_key;
`;
