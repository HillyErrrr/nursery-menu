# Family Adventures Group — Kitchen Prep Lists (multi-site)

This folder is a self-contained website: one shared app (`app.html`) plus one data
folder per nursery under `sites/`, plus one shared **master menu document** per
group of sites under `groups/`. Every setting uses the exact same code and reads
its recipes from a shared master document — editing that document once (through
the built-in recipe bank, see "Staff admin" below) updates every site that reads
from it immediately, with nothing to repeat per site. Each site still keeps its
own saved ticks/headcounts and its own branding — only the menu content itself is
shared.

## What's in here

- `index.html` — a picker page listing all 15 nurseries. Mainly useful once, for
  finding each site's own link.
- `app.html` — the actual prep list / shopping list app. Takes a `?site=` in the
  address, e.g. `app.html?site=little-adventures-wedmore`. Also includes a
  password-gated **staff admin** panel (recipe bank + weekly matrix editor) —
  see "Staff admin" below.
- `groups/<group>/seasons/<season-key>.json` — the **master document**: 4-week
  recipe data for one season, shared by every site in that group (e.g.
  `groups/general/seasons/spring-summer-2026.json` is read by all 14 general
  sites). Editing this file (by hand, or via the recipe bank's Upload changes
  button) changes the menu for every site that reads from that group at once —
  see "Menu groups — one master document, many sites" below for the full
  picture, including which sites are in which group.
- `sites/<slug>/config.json` — that site's name, address, phone and email shown
  in the header/footer. (Which menu group a site belongs to is set in
  `app.html` itself, not here — see "Menu groups" below.)

## Menu groups — one master document, many sites

Rather than each of the 15 sites keeping its own copy of the menu, every site
reads its recipes from a shared **menu group**. Right now there are two:

- **`general`** — the shared master menu, read by 14 of the 15 sites. Edit it
  once (via the recipe bank, or by hand-editing `groups/general/seasons/
  <season-key>.json`) and every one of those 14 sites shows the change the
  next time their page loads — nothing to repeat per site, and nothing to
  keep in sync by hand.
- **`weston-super-mare`** — Weston-super-Mare's own menu (`groups/
  weston-super-mare/seasons/<season-key>.json`), kept separate because it
  has its own dietary substitutions (no berries or cherries). Editing the
  general menu never touches Weston's version, and vice versa.

**Which group a site belongs to** is set in `app.html`, in the
`SITE_MENU_GROUPS` constant near the top of the `<script>` block:

```js
const SITE_MENU_GROUPS = {
  'little-adventures-weston-super-mare': 'weston-super-mare',
};
```

Any site not listed here uses `general` by default — which is why that object
only has one entry despite there being 15 sites. To give another site its own
separate menu later (a new dietary requirement, say), add one line here
mapping its slug to a new group key, create a `groups/<new-key>/seasons/`
folder with that site's own season files, and add a friendly display name to
`MENU_GROUP_FRIENDLY_NAMES` (a little further down in the same `<script>`
block) so it shows up nicely in the admin panel's dropdowns. To move a site
the other way — back onto the shared general menu — just delete its line
from `SITE_MENU_GROUPS`.

This is what "Upload changes" and "Import a week" (in the Staff admin panel,
below) mean when they ask which **menu** to update rather than which
**site**: picking "General menu (14 sites)" and clicking Upload changes
updates all 14 general sites at once, immediately, with no redeploy and
nothing to repeat.

## Seasons — how the menu switches automatically

Every site carries two seasonal menus on file at once: **Spring/Summer 2026**
and **Autumn/Winter 2026**. The app picks whichever one is "live" purely by
today's date — there is no button, tab, or setting for kitchen staff to
choose from, on purpose. A menu picker on a shared kitchen iPad is a daily
opportunity for someone to tap the wrong one, so the switch is automatic and
invisible on the day it happens.

The switchover date is set in `app.html`, in the `SEASONS_DEFAULT` list near
the top of the `<script>` block:

```js
const SEASONS_DEFAULT = [
  {key:'spring-summer-2026', label:'Spring/Summer 2026', file:'spring-summer-2026.json', startDate:null},
  {key:'autumn-winter-2025', label:'Autumn/Winter 2026', file:'autumn-winter-2025.json', startDate:'2026-09-07'},
];
```

(The internal key and file name stay `autumn-winter-2025` — only the
display label changed to `Autumn/Winter 2026` to match the year it's
actually served in. Renaming the key/file themselves isn't necessary and
would only add risk, since nothing outside this list ever shows the raw
key to a person.)

Spring/Summer 2026 has `startDate: null`, which makes it the fallback shown
before any dated season kicks in. Autumn/Winter 2026 takes over automatically
from **Monday 7th September 2026** onward, on every site, with no action
needed on the day itself.

### Previewing an upcoming season early

Add `&season=<key>` to any site's link to see that season's menu and shopping
list regardless of today's date — useful for giving whoever does the
pre-order shopping a look at the next season's ingredient list before the
switchover, without touching what the kitchen iPad shows. For example:

```
https://<your-netlify-address>/app.html?site=little-adventures-wedmore&season=autumn-winter-2025
```

A preview link like this shows a yellow banner at the top confirming it's a
preview, and it never affects the live menu — the kitchen iPad, opened
without a `season=` parameter, is completely unaffected by anyone using a
preview link. Ticked ingredients and headcounts are also kept separate per
season, so ticking things off in a preview doesn't touch the live season's
saved state (or vice versa).

**A "Preview kitchen page" button in Staff Admin builds this link for you**,
so you never need to type a URL by hand. In the Staff Admin topbar:

1. Pick the season you want to check (usually the upcoming one) in the
   season dropdown — this is the same dropdown you already use to edit
   that season's recipes.
2. Pick which site's kitchen page to preview, in the dropdown next to it
   (defaults to whichever site's link you opened Staff Admin from).
3. Click **👁 Preview kitchen page ↗**. It opens that site's real kitchen
   ticket for the season you picked, in a new tab — the exact prep list
   and shopping list that site will actually show once that season goes
   live, so you can read through it, tick a few things, and make sure it
   all looks right before the switchover date arrives.

The live kitchen iPad is never affected by this — it's the same safe
preview link described above, just generated for you instead of typed by
hand. Since every site can have a different menu (see "Menu groups"
above), it's worth spot-checking a couple of different sites, not just
one, especially if any of them use their own substituted menu (currently
only Weston-super-Mare).

If you ever click Preview and see a small message saying the season "isn't
in the live season list on this device," it means this particular browser's
local record of that season has gone out of sync with what's actually
saved centrally (this shouldn't normally happen — every season made via
"+ Add season" is saved centrally first — but there's no cleanup step yet
for a season removed some other way). The preview link still opens, but it
may just show today's live menu instead of the season you picked, with no
yellow banner to say so. Re-opening Staff Admin refreshes this browser's
season list and should clear it.

### Adding a new season later — no redeploy needed

Staff Admin has a **"+ Add season"** button (top bar, next to the season
picker) for this now — you don't need to ask Claude for a code change or run
a new deploy each year. Open Staff Admin, unlock it, and click **+ Add
season**:

1. Give it a name (e.g. "Spring/Summer 2027") and pick the date it should
   take over on.
2. Pick what to start it from — an existing season's menu (recommended, so
   there's something in the rotation to edit from day one) or blank.
3. Click **Create season**. This sets the new season up for *every* nursery
   site at once and switches Staff Admin's rotation view over to it
   immediately, ready to edit.

Behind the scenes this saves the same way "Upload changes" does — into
Netlify Blobs via the site's Functions — so the site does need to have been
through the one-time `netlify deploy` Functions setup below at least once;
after that, adding seasons never requires a redeploy again. If Functions
aren't set up yet, the button will say so clearly and nothing is created —
safe to just try again once they are.

Once a new season's rotation is filled in for a menu group, use the
existing **"Upload changes"** button (same as any other edit) to push that
group's shopping list live — same as updating any other season.

<details>
<summary>The old, manual way (only needed if you're editing files directly instead of using the button)</summary>

1. For each menu **group** (currently `general` and `weston-super-mare` — see
   "Menu groups" above), add a new file under `groups/<group>/seasons/`,
   named whatever you like (e.g. `spring-summer-2027.json`), in the same
   week → day → course → recipe JSON shape as the existing files. This is
   just two files total, not one per site, since sites share a group's menu.
2. Add one entry to `SEASONS_DEFAULT` in `app.html` with a unique `key`, a
   human-readable `label`, the `file` name you used, and the `startDate`
   (YYYY-MM-DD) it should take over on. Every menu group must have a file at
   that name for the season to work everywhere.
3. Redeploy (drag the folder onto Netlify Drop again, or ask Claude to do it).

Note this manual list (`SEASONS_DEFAULT`) is only ever used as the
fallback before any season has been created via the button above — once
"+ Add season" has been used at least once, the live season list is read
from Netlify Blobs instead and this hardcoded list is ignored on every
site.
</details>

## Site status

**Brand fonts and colours (LAN Mini Brand Guidelines, May 2025):** `app.html`
now uses Roca (headings) and Museo Sans (body text) — both embedded directly
in the file, so there's no separate font file to lose track of — and the
app's colour roles are mapped onto the brand palette: the header/dark UI uses
Indigo Blue, "prepped" green uses Olive Green, allergen warnings use
Strawberry Red, and buttons/active tabs/totals use Ochre Orange (the orange
and green are both very slightly darkened versus their exact brand hex so
white text on top still meets accessibility contrast — see the comment above
`:root` in `app.html` for the full reasoning). Only one weight of each font
was supplied, so bold headings are the browser's own faux-bold rather than a
true bold cut of Roca — send additional weights if you have them and this can
be tightened up.

All 15 sites started identical. Weston-super-Mare (`little-adventures-weston-super-mare`)
has its own menu in both seasons: in Autumn/Winter, every berry, cherry, and
"mixed fruit" ingredient across all 4 weeks was swapped for pears (recipe names
and method steps updated to match, e.g. "Cherry Yoghurt" -> "Pear Yoghurt"). In
Spring/Summer, the berry/cherry-free substitutions (mostly mango, apple and
pear) came pre-made from the nursery's own Weston-specific recipe cards. All
other 14 sites use the same general menu as each other in both seasons.

Allergen labelling: every "Oats"/"Rolled Oats" ingredient (the raw porridge/
flapjack ingredient, not branded products like Oatly or purchased Oatcakes)
across all 15 sites and both seasons now consistently shows as "May contain
Gluten" rather than a firmer "Gluten" tag.

Breakfast: every day of every week has a Breakfast course in both seasons.

Tea Vegetarian Option: some Spring/Summer 2026 days pair a vegetarian Tea
course alongside the usual lunchtime Main/Vegetarian Option pairing (e.g.
"Tofu Sweetcorn Crunch" next to "Tuna Sweetcorn Crunch"). The same "how many
are having the vegetarian option?" headcount on the prep page applies to
whichever vegetarian course(s) are on the menu that day — lunch, tea, or
both — so it only needs asking once per day.

## Deploying (Netlify, free)

There are two ways to get this folder live. Both are free and neither needs
GitHub. Pick based on whether you want the **"Upload changes"** button (see
"Staff admin" below) to work:

**Quick way — Netlify Drop (no account strictly required, but no "Upload
changes" button):**

1. Go to **https://app.netlify.com/drop** in a browser.
2. Drag this whole folder (`family-adventures-kitchen-prep`) onto the page.
3. Netlify gives you a live web address in a few seconds, something like
   `https://random-name-123.netlify.app`.
4. (Recommended) Make a free Netlify account and "claim" the site so the address
   is permanent and you can update it later by dragging the folder on again after
   any changes.

Everything works with Drop except the **Upload changes** button — Drop can't
run the small piece of server code that button needs (Netlify calls this
"Functions"), so clicking it will show a friendly setup message instead of
saving. Reading the kitchen list, the shopping list, and all season/site
switching work exactly the same either way. Staff can still get changes live
via **Option A (Export JSON, then redeploy by hand)** further down with no
extra setup at all.

**Full way — Netlify CLI (one-time setup, then "Upload changes" works):**
see "Enabling Upload changes" under "Staff admin" below. Do this once, and
from then on keep deploying updates the same way (not by dragging onto
Drop again) — see the note at the end of that section for why.

## Getting each site their own link

Once deployed, each nursery's link is:

```
https://<your-netlify-address>/app.html?site=<their-slug>
```

For example, Wedmore's link is:

```
https://<your-netlify-address>/app.html?site=little-adventures-wedmore
```

The full list of slugs is in `index.html` (or just open the site's root address
in Safari and tap through the picker once to get to the right page, then bookmark
that page).

## Setting each iPad up

On each nursery's kitchen iPad, in Safari:

1. Open that site's link (not the picker — their own direct `?site=...` link).
2. Tap the Share icon -> **Add to Home Screen**. This makes it behave like its own
   app icon and always opens in Safari's engine (avoids the Quick Look/JavaScript
   problem that comes from opening files via Mail attachments).

## Daily auto-refresh

Most kitchens leave `app.html` open on a wall-mounted iPad all day instead
of reopening it each morning, so a menu edit saved via Upload changes
wouldn't show up there until someone manually refreshed the page. To avoid
that, every page reloads itself automatically once a day, at **5:00am**
device-local time by default, so the latest master document is already
showing before the kitchen day starts. It won't interrupt anyone actively
using the Staff admin panel — it waits and checks again a minute later if a
modal (recipe edit, Import a week, Upload changes, etc.) is open.

To change the time, edit `DAILY_REFRESH_HOUR` near the top of `app.html`
(search for `menuGroupForSite`, it's just below) and redeploy.

## Updating the menu or fixing something later

- To change the menu for every site that shares it (the common case — see
  "Menu groups" above): edit the relevant file under `groups/<group>/
  seasons/`, then redeploy (drag the folder onto Netlify Drop again, or ask
  Claude to do it) — or use the Staff admin panel's Upload changes button
  instead, which skips the redeploy entirely (see "Staff admin" below).
- To change just one site's branding (name, address, phone, email, logo):
  edit that site's own `sites/<slug>/config.json` (and `sites/<slug>/
  assets/logo.png`), then redeploy.
- To fix a bug or add a feature for everyone at once: edit `app.html` — it's
  shared by all 15 sites, so one change updates every setting the next time
  their iPad reloads the page.

## Staff admin: recipe bank & rotation editor (built into `app.html`)

There's no separate admin file to open or lose track of — the recipe bank
and weekly Day × Course matrix editor live **inside `app.html` itself**,
behind a password. A small **"Staff admin"** link sits in the footer of
every site's page (below the phone/email/address line). Clicking it asks
for a password; only people who know it can get into the recipe editor —
kitchen staff and anyone just looking at the prep list never see it.

- **The password is `GreenGiraffe2026`** by default. Change it any time —
  ask Claude, or do it yourself: open `app.html` in a text editor, find the
  comment `RB_PASSWORD_HASH` near the end of the file, and follow the short
  instructions right above it (run one line in a browser console to turn
  your new password into the hash that goes in its place).
- The password is asked for **every time** Staff admin is clicked — it used
  to be remembered per device until someone tapped the **🔒 Lock** button,
  but that persistence is gone now, so there's no way to leave a device
  "still unlocked" for the next person to walk up to. The 🔒 Lock button
  still works the same way it always did from inside the panel (it just
  closes it, same as the ✕ button, since re-locking is automatic now).
- The admin panel opens pre-populated with the current general menu (both
  seasons) so it's never empty on first use; "Import a week" can still pull
  in a different menu group's file (e.g. Weston-super-Mare's dietary-
  substituted menu) to add its recipes too.
- To remove a recipe, click **Delete** next to it in the "All recipes" list,
  or **Delete recipe** on the recipe's own page. If it's currently used in
  any week (in any season — the same recipe can appear in more than one),
  it'll say exactly where before you confirm, and deleting it clears those
  slots to empty rather than leaving anything broken — pick a replacement
  for them from that week's view afterwards.
- This password check runs entirely in the browser — it's a real deterrent
  for keeping the editing tools out of casual reach on a shared kitchen
  iPad, not bank-grade security. Don't rely on it to protect something that
  absolutely must stay secret from a technically determined person.
- Every recipe has a **Course** field on its own page — Breakfast, Main,
  Vegetarian Option, Dessert, Snack, Tea, or Tea Vegetarian Option (the same
  seven slots as the Day × Course rotation itself). The "All recipes" list
  shows each recipe's course, and a dropdown next to the search box filters
  the list down to just one course — including a "Not categorised" option
  for spotting any recipe still needing a course set by hand. You don't
  need to go through and tag every recipe yourself: the app already works
  out a recipe's course from where it's actually used in the current
  rotation, the first time you open Staff admin after this update, and
  again any time a not-yet-categorised recipe gets used somewhere new — it
  never overrides a course you've set yourself. A brand new recipe created
  from a specific Day × Course cell (via "+ New recipe for this slot") is
  tagged with that slot's course immediately, and the recipe picker for a
  cell sorts recipes already tagged for that exact course to the top (it
  never hides the rest — a recipe you want to use somewhere unusual is
  still just a scroll away).

Everything done inside the admin panel — editing a recipe, rebuilding a
week's matrix, importing another menu's file — is saved only in **that
browser's** local storage. It does **not** change the live site by itself.
There are two ways to get changes from there onto the live, deployed site:

### Option A — Export JSON, then redeploy by hand

Click **Export JSON** on a week card (or inside a week's matrix view) to
download the season's file (e.g. `spring-summer-2026.json`), replace the
matching file under `groups/<group>/seasons/` (`general` for the shared
menu, or the specific group for a site with its own separate menu — see
"Menu groups" above), and redeploy the folder (drag onto Netlify Drop again,
or ask Claude to do it). This always works and needs no setup, but it's a
manual, multi-step process each time, and — because this is a plain
drag-and-drop redeploy — it updates the file for every site sharing that
group at once, same as Option B below.

### Option B — "Upload changes" button (one-time setup, then one click)

The **Upload changes** button saves a season's file straight to the live
site via a small password-checked piece of server code (a Netlify
"Function"), using Netlify's own storage ("Blobs") rather than any external
service. It shows up on the live site immediately — no redeploy, no waiting,
and it can never touch or corrupt any other file on the site, because it
only ever writes into that separate storage bucket. There's no GitHub
account, repository, or token involved anywhere in this. Because it saves
against a **menu group**, not a single site, one click here is what makes
this a true master document — pick "General menu (14 sites)" and every one
of those 14 sites shows the change immediately, with nothing to repeat per
site.

The trade-off for that safety is a one-time setup step, because Netlify
Drop's plain drag-and-drop can't run Functions — only a CLI-based deploy can
switch that on.

#### Enabling Upload changes (one-time setup)

You'll need [Node.js](https://nodejs.org) installed (any recent version).
Then, in a terminal, `cd` into this folder and run:

```
npm install -g netlify-cli
netlify login
```

This opens a browser to sign in to (or create) a free Netlify account and
authorize the CLI. Then:

- **If this site was already deployed via Netlify Drop:** run
  `netlify link` and choose the existing site from the list, so the CLI
  connects to the same site rather than creating a new one (keeping the same
  live address).
- **If this is a brand-new site:** run `netlify init` instead, and follow
  the prompts to create a new site (choose "no" if it asks about connecting
  to a Git repository — this doesn't need one).

Then install the one small package the Functions need, and do the one-time
deploy that switches Functions on:

```
npm install
netlify deploy --prod
```

That `netlify deploy --prod` command uploads this whole folder — `app.html`,
`sites/`, and `netlify/functions/` — exactly the way Drop did, but this way
Netlify also picks up and runs the two functions
(`netlify/functions/get-season.mjs` and `save-season.mjs`).

Finally, set the password the Upload changes button will check, as a Netlify
environment variable (this is separate from — but should match — the staff
password described above):

```
netlify env:set UPLOAD_PASSWORD_HASH <hash>
```

Use the exact same hash value as `RB_PASSWORD_HASH` in `app.html` (see the
comment right above it in the file for how that hash is generated from a
password). They must match exactly, or Upload changes will fail with an
"Unauthorized" error even though the staff lock screen itself accepts the
password fine. After setting it, run `netlify deploy --prod` one more time
so the new environment variable takes effect.

From this point on, the **Upload changes** button in the admin panel just
works — click it, pick which menu group the season's file belongs to
(defaults to whichever group the site you opened the admin panel from
belongs to), and it saves for every site sharing that group.

**Changing the staff password later:** update it in both places — the new
hash goes into `RB_PASSWORD_HASH` in `app.html` (then redeploy), and into
the `UPLOAD_PASSWORD_HASH` environment variable (`netlify env:set
UPLOAD_PASSWORD_HASH <new-hash>`, then redeploy once more). Missing either
one means Upload changes stops working (or, worse, still accepts the old
password) until both are updated to match.

**Important — keep deploying via the CLI from now on, not Drop:** once
Functions are enabled this way, a future drag-and-drop onto Netlify Drop
would replace the whole site *without* the Functions folder, silently
breaking the Upload changes button again (reading the menu would keep
working fine either way, via the fallback described in "Deploying"
above — only saving would break). Going forward, publish updates with
`netlify deploy --prod` from this folder instead. Ask Claude to do this for
you if you'd rather not run terminal commands yourself.

**Troubleshooting:**

  - *"Can't reach the save function — this site probably hasn't been
    through the one-time Netlify Functions setup yet"* on upload — this site
    is still on Drop, or the CLI deploy above hasn't been run yet. Follow
    "Enabling Upload changes" above.
  - *"This site has no UPLOAD_PASSWORD_HASH environment variable set yet"*
    — the CLI deploy worked and Functions are live, but the
    `netlify env:set UPLOAD_PASSWORD_HASH <hash>` step above hasn't been
    done (or was done before the last deploy — redeploy once after setting
    it).
  - *"Unauthorized"* — `RB_PASSWORD_HASH` in `app.html` and the
    `UPLOAD_PASSWORD_HASH` environment variable don't match. Recheck both
    hash values are identical.
  - Nothing seems to change on the live site after a successful upload —
    this shouldn't happen (Blobs updates are immediate, no build/redeploy
    involved), so try a hard refresh; if it persists, check the "Functions"
    tab on the Netlify dashboard for that site for error logs.

**If you previously deployed the old, separate `recipe-bank.html` file:**
this update folds it into `app.html` and no longer includes it, on purpose
— a standalone `recipe-bank.html` sitting on the live site would have no
password on it at all, letting anyone who found the link straight into the
editor, bypassing the whole point of the staff password. Redeploying this
folder (which no longer contains that file) won't automatically delete the
old one from a site that's still on Netlify Drop — after redeploying,
check `https://<your-netlify-address>/recipe-bank.html` yourself; if it
still loads, do one clean redeploy of this whole folder (Netlify Drop
replaces the entire site content on each drop) to clear it out.

## Standardised ingredient units

The **Unit** field on each ingredient row (in the recipe bank's Ingredients
table) is a dropdown, not a free-text box, so every recipe uses the same
spelling for the same measurement. This matters because the shopping list
totals ingredients across recipes by matching name **and** unit exactly —
mismatched spellings (`can` vs `tin` vs `tins`) used to silently split one
ingredient into several lines on the shopping list.

The full list, grouped by kind:

- **Weight/volume:** `g`, `kg`, `ml`, `l`
- **Spoons/small amounts:** `tsp`, `tbsp`, `tsp each`, `pinch`, `handful`
- **Counted items:** `ind` (each), `cloves`, `slices`, `sheets`
- **Packaging:** `tins`, `packs`, `tubes`, `rolls`, `bunches`, `punnets`,
  `wraps`, `loaves`
- **(none)** — leave the unit blank for rows where the amount lives in the
  ingredient name or the Qty field instead of a unit (e.g. "as needed",
  "to taste", "selection of").

**What got merged into what** when the existing recipe data was
standardised onto this list:

- `can` / `cans` / `tin` → `tins`
- `litres` / `ltr` / `L` → `l`
- `clove` → `cloves`, `tube` → `tubes`, `sheet` → `sheets`,
  `pack` → `packs`, `bunch` → `bunches`
- `hand` → `handful`
- `whole` / `large` / `medium` / `small` / `head` → `ind`
- **`cup` was removed entirely** (not on the list) — the handful of
  cup-based ingredient rows were converted to grams using the same
  cup-to-gram conversion already used elsewhere in the data (roughly
  1 cup = 150g, ½ cup = 75g, for the dry/frozen ingredients involved).
- A few rows that had container size baked into the unit itself (e.g.
  "tins (400g)", "tin (400ml)", "large tins") were split apart: the size
  moved into the ingredient name (e.g. "Coconut milk (400ml)") and the
  unit became a plain standardised value (`tins`).
- One compound unit (an ingredient row mixing two different measurements
  in one field) was split into two separate ingredient rows, each with
  its own proper unit.

If a future import or an old Blobs save still has an unrecognised unit
string in it, the app's existing unit-alias table (`UNIT_ALIASES` in
`app.html`) quietly maps common variants (like `tin` → `tins`) onto the
standard list automatically, so old data keeps displaying sensibly even
before someone opens and re-saves that recipe. New rows and the dropdown
itself only ever use the standardised list above.

## Ingredient Database (Phases 1–6 of the nutrition/allergy project)

Staff Admin has a new **Ingredients** tab. This is part of a larger project
to redesign how recipes handle ingredients, nutrition and allergens —
described in full below — built deliberately so that **nothing about the
existing recipe bank, rotation editor, or shopping list breaks along the
way.** Phase 1 built the database and admin screen; Phase 2 (see "Recipe
ingredients now link to the database" further down) connects it to recipes;
Phase 3 (see "Nutrition calculations & traffic lights" and "Allergen matrix
& site allergy alerts" further down) uses that link to calculate nutrition
and allergen information automatically instead of typing it in by hand;
Phase 4 (see "Menu nutrition & menu guidance" further down) rolls per-recipe
nutrition up to whole days/weeks and checks the menu against published
early-years nutrition guidance; Phase 5 (see "Cost tracking & shopping
list" further down — partial, by request, covering the parts that don't
involve real purchasing decisions) adds recipe/portion costing and an
ingredient-database-driven order estimate.

### What it is right now

The Ingredients tab is a shared, central list of ingredient records — one
per real product — that every site sees the same copy of, saved the same
way the season files are (via the same password-checked "Upload changes"
Netlify Function and Blobs storage, just under its own key). Editing an
ingredient here saves immediately; there's no separate "publish" step like
the recipe bank's drafts have.

Each record can hold:

- **Product details** — name, a Tesco product page link, a product image,
  pack size, current price, and a "last updated" date.
- **Full nutrition per 100g/100ml** — Energy (kJ and kcal), Fat, Saturates,
  Carbohydrates, Sugars, Fibre, Protein, and Salt — plus where that data
  came from and when it was last checked.
- **Allergens** — using the same 14 UK/EU allergen checklist (and the same
  "Contains" / "May contain (traces)" picker) already used elsewhere in the
  recipe bank.

The list can be searched, filtered by status (Active / Needs Tesco link /
Archived), and grouped by category (Fruit & veg, Dairy, Meat & fish, Store
cupboard, etc.). Archiving a record hides it from pickers without deleting
its history; nothing currently references these records for archiving to
break.

### Where the starting ~329 records came from

When the Ingredients tab is opened for the first time, it automatically
generates one placeholder record for every distinct ingredient name already
used across the ~225 existing recipes — so the list isn't empty on day one
and reflects real, in-use ingredients rather than a generic starter set.
These starter records are **not** yet linked to a real Tesco product
("Needs Tesco link" status) and have no nutrition data filled in — they're
a checklist of what to go and fill in over time, not finished records.
Existing recipes are completely unaffected by this — they still store their
own ingredient names and quantities exactly as before. (Allergens are the
one exception: once Phase 2's linking runs — see below — a starter record
that has no allergen data of its own automatically picks up whatever the
recipes already using it had recorded, rather than starting blank; see "A
Phase 2 bug found and fixed while building Phase 3" further down.)

### "Fetch from Tesco"

On an ingredient's edit page, pasting a `https://www.tesco.com/...` product
URL and clicking **Fetch from Tesco** asks a small server-side function
(`fetch-tesco-product`, gated behind the same staff password as Upload
changes) to load that page and pull out whatever it can — product name,
image, pack size, price, and a nutrition table — and pre-fills the form
fields with it. **Nothing is saved automatically** — you review what came
back (and fix anything wrong or missing) before clicking Save on each card.

This is deliberately best-effort, for reasons worth knowing:

- Tesco has no public product API; this reads the same public page a
  shopper would see, so it can break silently if Tesco changes their page
  layout, and may occasionally be blocked or rate-limited.
- **Allergens are never auto-filled.** On a Tesco page they're just bolded
  words inside a paragraph of ingredients text, not a clean structured
  field — guessing wrong on an allergen for a nursery menu is a real safety
  risk, so this is always left for a person to enter and verify by hand.
- The nutrition parser looks for the standard UK/EU front-of-pack label
  order (Energy → Fat → Saturates → Carbohydrate → Sugars → Fibre →
  Protein → Salt), since that ordering is set by food-labelling regulation
  rather than by Tesco's own site design — more durable than guessing at
  Tesco-specific markup, but still not guaranteed on every page.
- If a price, image, or nutrition value can't be found, that field is just
  left blank rather than guessed — fill it in by hand.
- **A "Could not fetch that page (Tesco returned HTTP 403...)" message means
  Tesco blocked the request, not that anything is wrong with the URL you
  pasted.** Large retail sites commonly block automated requests coming
  from cloud-hosting services (which is what this function runs on)
  specifically to stop scraping — that's a decision on Tesco's side, not a
  bug here, and retrying the same or a different URL won't reliably fare
  any better. When this happens, filling the form in by hand (the product
  page is still perfectly viewable in your own browser — copy the numbers
  across from there) is the dependable option. If this turns out to happen
  most of the time in practice, the next improvement to consider is a
  paste-the-page-text-to-auto-fill fallback (parsing text copied from your
  own browser, no server fetch involved) rather than continuing to fight
  Tesco's bot-blocking from a server — ask Claude if that'd be worth
  building.

### Water is never linked to Tesco (Phase 17)

John flagged that a "Water" record in the Ingredient Database had ended up
linked to a bottled-water product on Tesco — wrong, since tap water is
free and isn't something the kitchen buys; it's also always been excluded
from every shopping list total (`isWaterIngredient` strips it out before
any pack/price calculation ever runs). "Water" (and "Boiling water") now
gets this treatment everywhere in the Ingredient Database too:

- The one-off starter-record generator (the thing that turns every
  ingredient name used across the recipe bank into a database record the
  first time the Ingredients tab is ever opened) skips water entirely —
  no record is created for it at all, so there's nothing sitting in the
  list inviting a Tesco link in the first place.
- **Self-heals automatically.** If a "Water" record already has a Tesco
  link, price, pack size, or product image saved (as had happened live),
  the next time anyone opens the Ingredients tab it's automatically
  stripped back to a plain, unlinked record and the fix is published to
  the shared database — no manual cleanup needed, and it explains itself
  in that record's own history log.
- Opening a "Water" record's edit page shows a plain explanatory note in
  place of the Tesco URL field and "Fetch from Tesco" button, so a new
  link can't be created going forward. If a Tesco link somehow still gets
  typed in around this (e.g. before a rename takes effect), saving the
  product silently drops it rather than persisting it — belt-and-braces
  behind the hidden field.
- It also no longer shows the "Needs Tesco link" badge or counts toward
  "N not yet linked to a Tesco product" on the Ingredients list — it was
  never meant to be linked, so it isn't a to-do item.

### Recipe ingredients now link to the database (Phase 2)

Every ingredient row on a recipe's page is now a link to a record in the
Ingredient Database above, not a typed-in name. Concretely:

- Each row shows the linked product's current name and allergens — read
  live from the database every time the recipe is opened, never typed or
  stored on the recipe itself. **Update a product's name, or add/remove an
  allergen, from the Ingredients tab, and every recipe using it shows the
  change immediately** — nothing to re-type, and nothing that can drift out
  of sync between a product and the recipes that use it.
- **"+ Add ingredient" on a recipe always opens a search-and-pick list** of
  the ingredient database — there's no free-text ingredient box any more.
  If the product genuinely isn't in the database yet, "+ Add new
  ingredient" creates a bare-bones record (just a name) right from there
  and links it immediately — fill in its Tesco link, nutrition, and
  allergens from the Ingredients tab whenever you get to it.
- Quantity and unit stay exactly as before — how much of something a
  recipe uses is specific to that recipe, so that's still typed in per row,
  same as always.
- **Your existing ~225 recipes didn't need re-entering.** The very first
  time this ran, every recipe's ingredient rows were automatically matched
  against the ingredient database by name and linked up — in testing this
  matched 100% of ingredient lines straight away, since the database's
  starter records were generated from those exact same names in Phase 1.
  This matching runs every time the database loads, not just once, so
  anything imported later (a new season, "+ Add season" copying from an
  existing one) gets linked up the same way automatically.
- **If a row genuinely can't be matched** (rare — mainly if you'd already
  renamed or merged something in the database before this update went
  live), it shows a yellow **"Needs link"** badge with its old name still
  visible, and a **"Link ingredient"** button to fix it — the same picker
  as everywhere else. Nothing about that row breaks or gets lost in the
  meantime; it just keeps working exactly as it always has until you link
  it, same spirit as everywhere else this project avoids blocking an
  unrelated edit over old data catching up.
- The recipe bank's search box, "Upload changes"/"Export JSON", and
  "Import a week" / "+ Add season" (recipe de-duplication) were all updated
  to work the same way whether a row is linked or still using its old
  name — nothing about those features changed from your side.

### A Phase 2 bug found and fixed while building Phase 3

While testing Phase 3's allergen matrix, a real gap was found in Phase 2's
automatic linking: the very first time a recipe's old free-text ingredient
row got linked to a database record, if that database record didn't have
any allergen info recorded yet, the row's own allergen text was being
**silently discarded** instead of carried across — so a product could end
up in the database with no allergens recorded even though the recipes using
it originally said, for example, "Milk". This has been fixed: linking a row
now copies its allergen text into the database record first if the record
doesn't already have its own (never overwriting a record that already has
allergen data on file), and immediately republishes the database if that
happened, so every device's copy heals the same way. This is already
included in this package — nothing extra to do — but it's worth knowing
about if anything looked short an allergen anywhere.

### Nutrition calculations & front-of-pack traffic lights (Phase 3)

Every recipe's page now has a **Nutrition** card underneath its ingredients,
calculated live — never typed in or stored — every time the recipe is
opened:

- **Per-portion and per-100g-of-finished-dish figures** for all nine
  tracked nutrients (energy, fat, saturates, carbohydrates, sugars, fibre,
  protein, salt), worked out by weighing each linked ingredient's amount
  against its own per-100g/100ml nutrition record and adding them up.
  Per-portion only shows once the recipe's "Recipe makes ... servings"
  field is filled in; per-100g always shows as soon as there's anything to
  calculate.
- **UK FSA front-of-pack traffic lights** (green/amber/red) for fat,
  saturates, sugars and salt, using the same thresholds as a real pack
  label (Fat: green ≤3g/red >17.5g per 100g; Saturates: green ≤1.5g/red
  >5g; Sugars: green ≤5g/red >22.5g; Salt: green ≤0.3g/red >1.5g — energy
  deliberately isn't colour-coded, matching how a real UK label works).
  These replace the Ingredient Database's old manual traffic-light dropdowns
  from Phase 1 — every product's own traffic lights are now calculated the
  same way, live from its nutrition fields, instead of being picked by
  hand.
- **Recalculates on every keystroke** — change a quantity, swap an
  ingredient, or edit a product's nutrition in the Ingredients tab, and the
  figures update immediately, with no separate save step for the
  calculation itself.
- **Honest about what it can't work out.** A recipe using an ingredient
  that isn't linked yet, has no nutrition recorded, or whose amount can't
  confidently be converted to grams (e.g. "3 individual" onions with no
  pack weight on file) shows a clear note naming exactly which ingredient
  and why, and the totals shown are marked as based on whatever *could* be
  calculated — never silently guessed or left out without saying so.
  Amounts already in g/kg/ml/l convert directly; small measures (tsp,
  tbsp, pinch, handful) use the same reasonable approximate gram values
  already used elsewhere in this app; anything else falls back to the
  linked product's own pack size when the recipe's unit matches how that
  product is normally bought (e.g. "2 tins" using a product with a 400g
  pack size).

### Allergen matrix & site allergy alerts (Phase 3)

Two new Staff Admin tabs, both driven by the same live-linked ingredient
data the recipe pages already use — nothing here is a separate copy that
can drift out of date:

- **Allergen matrix** — split into one searchable table per rotation week
  (Week 1 through Week 4, at John's request), each listing every recipe
  placed somewhere in that specific week against all 14 UK/EU allergens,
  with an icon for "contains" and a faded/dashed icon for "may contain"
  (clicking either shows the same allergen detail popup used elsewhere in
  the app). A recipe repeated across more than one week gets its own row
  in each week it's actually used in, rather than being folded into a
  single combined table the way it was originally — that made it
  impossible to check "what's the allergen picture for just this week." A
  blank cell means nothing is currently recorded against that recipe's
  linked ingredients for that allergen — it's flagged on the page as
  reflecting what's on file, not a guarantee, since it's only ever as
  complete as each ingredient's own allergen data.
- **Site allergy alerts** — lets you set a persistent red banner at the top
  of one specific site's own kitchen page, for a known, currently-confirmed
  hazard that isn't really about a single dish (the kind of example in the
  original brief: a child with a severe *airborne* allergy, where avoiding
  it means keeping something off the premises entirely, not just off one
  recipe). **This starts completely empty for every site** — nothing is
  pre-filled, including any example from the original project brief —
  because guessing or assuming a specific real child's allergy information
  is accurate would be genuinely dangerous. Add or change an alert here
  only once you've personally confirmed it's correct and current, ideally
  with that site's manager; removing an alert removes its banner
  immediately, same as adding one shows it immediately, no redeploy needed
  either way (same shared-config mechanism as the Ingredient Database and
  season data).

### Allergen icons on the Week rotation grid

Each populated Day × Course cell on a Week's rotation page (Staff admin →
The rotation → Week N) now shows a small row of allergen icon badges for
that dish, right under its "serves N" line — built the same way the
Allergen matrix's columns are (live against each recipe's linked
ingredients, not a separate copy), so it's always current with whatever's
on file in the Ingredients tab. A dish with no allergens recorded against
any of its ingredients shows no icons at all. Tapping a badge opens the
same allergen detail popup used everywhere else in the app (matrix, recipe
page, kitchen ticket) instead of opening that cell's "change this dish"
picker — tapping anywhere else in the cell still opens the picker as
before.

### Menu nutrition & menu guidance (Phase 4)

Two new Staff Admin tabs roll the recipe-level nutrition from Phase 3 up to
a whole day/week, and check the season against published early-years
nutrition guidance:

- **Menu nutrition** — pick a week (1–4) and see, for every day, a
  per-child total across everything actually offered that day (Breakfast +
  Main + Dessert + Snack + Tea, or the vegetarian-swap versions on a day
  that has one — never both added together, since no single child eats
  both), plus a week average. All 9 nutrients, recalculated live from
  whatever's currently in the rotation and the ingredient database — never
  a separate stored figure. Salt is shown against NHS guidance for
  children's total daily salt (1–3 years: max 2g; 4–6 years: max 3g) — the
  one nutrient here with a solid, directly-comparable published child
  limit. A day where nothing has both a linked recipe and a "servings"
  figure set shows as not-yet-countable rather than a misleading zero, and
  the week average only includes the days that could actually be counted
  (shown as "X of 5 days countable").
- **Menu guidance** — deliberately **not** called an "EYFS compliance
  dashboard": EYFS itself sets no numeric nutrition standard at all, only
  that meals must be "healthy, balanced and nutritious". The specific,
  checkable numbers here come from the Department for Education's
  **"Nutrition guidance for early years providers" (May 2025)** — voluntary
  guidance providers are expected to have regard to, not a legal
  requirement, and this screen is a planning aid, not a certificate.
  Three checks are genuinely automatic, calculated from real recipe/
  ingredient data: (1) **repeated meals** — the same recipe on the same
  weekday across 2+ of the season's 4 rotation weeks, directly answering
  the guidance's "try not to serve the same food on the same day of the
  week" rule; (2) **main meals with no linked Fruit & Vegetables
  ingredient**, based on each ingredient's category in the Ingredients tab
  — can flag a meal just because an ingredient hasn't been categorised yet,
  so it's worth a quick manual look either way; (3) a **best-effort oily
  fish keyword scan** (salmon, mackerel, sardine, trout, herring, pilchard,
  anchovy in linked ingredients' names) as a starting point for checking
  "oily fish at least once every 3 weeks, max twice a week" — explicitly
  not authoritative, since it can miss an unusual product name and can't
  judge portion size. Everything else the DfE guidance covers (starchy
  food per meal, wholegrain rotation, beans/pulses frequency, processed
  meat/fish frequency, 3 dairy portions/day, water/milk-only drinks) is
  shown as a **reference checklist** for a person to judge, not calculated
  automatically — this app has no reliable way to tell wholegrain from
  refined, fried from not, or processed from fresh from the data it has
  today. The NHS's free-sugars guidance (not the same as the "sugars"
  figure calculated elsewhere, which includes natural sugars in fruit and
  milk) is shown for reference only, deliberately not compared directly
  against anything calculated.

### Cost tracking & shopping list (Phase 5 — partial, by request)

Phase 5 was always a loose "future features" wishlist (cost tracking,
stock ordering, multi-supplier, parent reports, Ofsted evidence, approval
workflows) rather than a firm spec, and some of it needs real business
decisions only you can make — plus Claude can't place real orders or
payments on your behalf regardless. By request, this round covers only the
two clearly-buildable, no-purchasing-involved parts:

- **Cost, on each recipe's own page** — a new Cost card under Nutrition,
  showing the recipe's total cost and cost per portion, calculated from
  each linked ingredient's own price and pack size (same fields Phase 1
  already added), recalculated live the same way nutrition is. An
  ingredient with no price recorded, or whose pack size can't be turned
  into a cost for the amount used, is named rather than silently left out
  — the total is then clearly marked "(partial)". The Ingredients table
  above it also has its own **Cost column**, between Allergens and
  "remove," showing that one ingredient's own cost for the quantity/unit
  on that row (the same figure the Cost card's total is built from), so
  you can see straight away which line is driving the total rather than
  only the sum. It updates live as you edit a row's quantity or unit,
  before you even click "Save ingredients"; a row with no price recorded,
  or that can't be converted to a cost, shows a "—" with a tooltip
  explaining why (same reasons the Cost card lists under "Incomplete").
- **Shopping list, a new Staff Admin tab** — pick a week and a headcount
  (plus, of those, how many need the vegetarian option — the same split
  the kitchen iPad's own shopping list already uses), and get an estimate
  of how much of each linked ingredient that week's whole rotation needs,
  how many packs to buy, and the estimated cost, with a "Download as CSV"
  button for taking it to an actual order. This is deliberately simpler
  than the kitchen iPad's own day-by-day ticked shopping list — one
  headcount for the whole week, meant for rough ordering/budgeting, not as
  a replacement for the operational daily list. Anything that can't be
  converted to a quantity or has no price on file is named under the
  table rather than silently skipped or guessed at.

### Shopping list: an editable "To Order" quantity and a live running total

The Shopping list tab's table now has a **To Order** column (between Unit
price and Cost), and its final column is **Cost** — To Order × unit
price, recalculated the instant you change a quantity. To Order starts
out pre-filled with the app's own suggested "Packs to buy" figure for
each ingredient, but it's a genuinely free edit from there: round it up
for a buffer, round it down because you already have stock, or leave it
as suggested — whichever you type is what Cost, the table's own "Total to
order" footer row, and the floating summary box below all use. Only whole
numbers are accepted (no decimal packs). Changing the week or headcount
rebuilds the table and resets every row's To Order back to the new
suggestion, since an old quantity worked out for a different headcount
wouldn't mean anything against the new one.

A small **floating summary box** stays pinned to the bottom-right of the
screen while you scroll the table, showing the running total items to
order and the total projected order value (£) across every row — so you
can review the expected spend at a glance before placing a real order,
without having to scroll back up to the table. "Download as CSV" exports
exactly what's on screen at that moment, including whatever you've typed
into To Order, not just the original suggested quantities.

**Fix: loose/weighed items with no fixed pack now cost correctly.** The Cost
card originally required a "Pack size" it could parse a weight or count out
of (e.g. "400g", "1kg", "3 Pack") before it would work out a cost at all —
so any ingredient that's genuinely sold loose or by weight (fresh veg, meat,
fish, milk, oil, and similar, priced "by the kilo"/"by the litre"/"each"
with no fixed pack to describe) showed "pack size/price can't be converted
to a cost" for every recipe it appeared in, even though its price and Unit
of measure were both filled in correctly. This is fixed: if the Pack size
field is blank or unparseable, but the ingredient's own Unit of measure is
itself a real unit (a weight/volume — g, kg, ml, l — or a plain count-style
unit like "ind" or "tins"), the Cost card now reads the recorded price as
the price for exactly one of that unit directly, using only the two fields
already on the Ingredient Database record — no guessing, same as
everywhere else in this app. Existing ingredients with a proper pack size
(e.g. "400g tin", "1kg bag") are unaffected; the fix only ever fills a gap
where there was nothing to compute a cost from before. The Shopping list
tab deliberately keeps its stricter requirement — it needs a real, discrete
pack to say "buy N packs," so a loose item with genuinely no fixed pack
(and no "Recipe unit" set either — see below) still shows under "Couldn't
include" there, same as before.

**Products bought whole but used in recipes as a smaller unit** — garlic
bought as a bulb but used as "cloves," bread bought as a loaf but used as
"slices," and similar — are a different problem from the one above: there
*is* a real, fixed pack, but recipes describe how much of it they use with
a completely different unit than either the pack size or "Unit of
measure" is written in, so nothing could convert between them. Each
Ingredient Database record now has two extra, optional fields for exactly
this: **Recipe unit** (the smaller unit recipes actually use — must be
spelled the same way as on the recipe's own ingredient row, e.g.
"cloves," "slices") and **how many per pack** (e.g. 10 cloves in a bulb,
16 slices in a loaf). Once both are filled in, Cost, the Shopping list,
and Nutrition (when the pack size also has a real weight, e.g. an "800g"
loaf) all use it automatically — a garlic bulb never even needs a weight
recorded at all, since cost and shopping-list quantity both work directly
from the pack's price divided by its yield. Leave these two fields blank
for every ordinary product; they only need filling in for the handful of
products recipes measure differently than they're bought.

**The recipe editor's own unit picker now dims out units that wouldn't
work for whichever product a row is linked to** — e.g. once "Test Bread"
is linked and set up as above (Unit of measure "loaves," Recipe unit
"slices"), that row's unit dropdown only offers g, kg, slices and loaves;
ml, tsp, tbsp, pinch, handful and every other product's whole-item unit
(cloves, tins, ind, and so on) are greyed out. For an ordinary bulk
ingredient (bought and priced by weight or volume, no Recipe unit set —
flour, oil, milk, and most things) every weight/volume/spoon-measure unit
stays available, since any of those can sensibly describe an amount of a
loose ingredient; only other products' whole-item units (tins, loaves,
cloves...) get greyed out there. This is a picker convenience only — a
row already saved with an unusual unit keeps showing it, and nothing about
which units are actually accepted by Cost/Nutrition/the Shopping list has
changed.

### The site "Weekly shopping list" now matches the admin Shopping list tab's table

The kitchen-facing **Weekly shopping list** (the "shop" tab on each site's
own ticket page, alongside "Today") is now the same kind of table as the
Staff Admin Shopping list tab, at John's request: **Ingredient, Amount
needed, Pack size, Packs to buy, Unit price, To Order, Cost**, plus a
leading tick-off checkbox column the admin version doesn't need (staff
actually shop from this page, so ticking items off as they go in the
trolley still matters here). The existing grouping — the main ingredient
list by aisle-style category, then "Store cupboard (top up if low)," then
"Buy as needed / to stock" — is kept as section header rows within the
same table rather than separate cards.

**To Order** and **Cost** work exactly as before this redesign: To Order
starts out pre-filled with a suggested pack count for the main list,
defaults to 1 for a store-cupboard staple and 0 for a buy-as-needed item;
only whole numbers are accepted; Cost is blank ("—") unless the ingredient
is linked to a priced Ingredient Database product; a typed quantity is
saved per site/week and read back on every re-draw (rather than reset,
unlike the admin table, since this page re-draws on every single tick, not
just a headcount/week change) so it survives both an unrelated tick and
closing/reopening the page; and a floating summary box shows the running
total items to order and projected order value across all three sections.
**Amount needed** (the raw total before any pack rounding, e.g. "1.19kg"),
**Pack size**, and **Packs to buy** are new to this page, worked out the
same way the admin table does it — a "No pack weight" note appears instead
of a number when there's genuinely no pack/price on file for that
ingredient, same wording as the admin version.

One visible change from the old design: the table has no allergen badges
(matching the admin table it's modelled on, which never had them). Allergy
information while prepping still lives on the "Today" tab's own ingredient
rows, unaffected by this change — it just no longer duplicates onto the
shopping list itself. Worth a mention if that visibility mattered to staff
while actually shopping; it's a one-line change to bring back if so.

### Shopping list table fixes: fractional quantities, spoon-measured liquids, "large wraps" (Phase 16)

John flagged real errors in the new table shortly after it shipped, with
screenshots from live sites: "Amount needed" showing raw, unrounded
fractions like **3.375 ind**, **22.5 slices**, **3.9375 large wraps**, and
**10.125 tsp + 1.125 tbsp**; and a **"No pack weight"** badge sitting right
next to a real, populated Unit price for Organic Olive Oil and Wholemeal
Tortilla Wraps, which reads as contradictory. Three separate causes, all
fixed:

1. **Unrounded discrete quantities.** `amountNeededLabel()`'s discrete-unit
   branch printed `entry.qty` — a raw servings-scaled total — completely
   as-is. It now reuses the same whole-item-vs-fraction rounding rule a
   recipe's own per-portion quantity already used elsewhere
   (`formatDisplayQty`/`WHOLE_UNITS`): a true whole-item unit (ind, slices,
   cloves, wraps, rolls, bunches, punnets, loaves...) rounds *up* to a
   whole count, anything else rounds to a sensible number of decimal
   places. `WHOLE_UNITS` picked up the units missing from that list
   (wraps, rolls, bunches, punnets, loaves) so they get the same whole-count
   treatment. This only changes the displayed text — the precise,
   unrounded quantity is still what the actual "Packs to buy" math uses
   underneath, so purchasing suggestions haven't changed.
2. **"large wraps" never matched anything.** A recipe's unit field was
   typed as the compound phrase "large wraps" instead of plain "wraps" —
   `normalizeUnit()` only ever recognised a *standalone* `large`/`medium`/
   `small` word (see the existing alias table), so this literal string
   never matched the `wraps` whole-item handling, never merged with a
   different recipe's plain "wraps" entry for the same ingredient, and
   never matched a linked product's own "wraps" Unit of measure for a pack
   lookup. `normalizeUnit()` now strips a leading size adjective before the
   alias lookup, so "large wraps" resolves the same as "wraps" would have.
3. **Spoon-measured liquids couldn't resolve a pack at all.** Olive Oil
   (and anything else recorded in tsp/tbsp that isn't a dry staple —
   see `isDryStaple`'s oil/purée/juice/zest exclusions) has no way to match
   a linked product's Unit of measure of "ml"/"l", because `toBaseAmount()`
   only understood kg/g/l/ml — a spoon quantity fell into its own
   unresolvable discrete "N tsp + M tbsp" bucket. A teaspoon and tablespoon
   are fixed volumes by definition (~5ml/~15ml) regardless of what's in
   them — unlike the *grams*-per-spoon estimate used only for the
   nutrition calc (`APPROX_GRAMS_PER_UNIT`), which depends on density and
   isn't safe to reuse here. `toBaseAmount()` now converts tsp/tbsp to ml,
   so a liquid recorded in spoons in one recipe folds into the very same
   running ml/l total as one recorded directly in ml/l in another, and can
   resolve a real pack size/price the same way any other liquid does.

One thing worth knowing if a "No pack weight" badge still turns up next to
a real price after this fix: it usually means the linked Ingredient
Database product's own "Unit of measure" doesn't match the unit the
recipes actually use for it (e.g. a product set up as "ind" when recipes
call for it in "wraps," or a pack size string the parser can't read) —
that's a data-entry mismatch to fix on the product record itself, not
something the app should guess around.

### A real under-ordering bug: "Packs to buy" silently dropped part of the total for mixed-unit ingredients (Phase 18)

A follow-up screenshot found a more serious version of the same family of
issue. **Organic Carrots** showed Amount needed "14 ind + 2.76kg" (some
recipes call for whole carrots, others for a weight) but **Packs to buy:
4** — which turned out to be `ceil(2.76kg ÷ 700g)`, i.e. exactly the
weight bucket alone. The 14 whole carrots weren't rounded into that number
at all; they contributed nothing, because Organic Carrots has no "Recipe
unit"/yield telling the app how much one whole carrot weighs, so that
bucket simply couldn't resolve a pack count on its own. The same pattern
showed up on **Organic Brown Onions** ("16 ind + 563g" → Packs to buy "1",
= `ceil(563g ÷ 750g)` alone) and **Mixed Sweet Peppers** ("3 ind + 1.24kg"
→ Packs to buy "3", = `ceil(1.24kg ÷ 500g)` alone). This isn't just a
cosmetic display issue — a kitchen relying on that number would show up
short.

Root cause: when the same ingredient is used two incompatible ways across
recipes (some by weight, some by whole-item count), the site shopping
list already merges them into one row (`mergeItemsByName`) and sums
whichever bucket(s) resolve a pack count. The bug was that a bucket which
*couldn't* resolve a pack (no matching Recipe unit/yield or Unit of
measure) was silently treated as contributing **zero** rather than
**unknown** — so the merged total looked complete and confident even
though part of it was never counted.

Fixed by tracking, per merged row, how many separate unit-buckets went
into it and how many of those couldn't resolve a pack at all. A genuinely
multi-bucket ingredient where *some* (not all, not none) of its buckets
resolved now shows the real, known number with a visible **"may be
more"** warning next to it (hover for why) instead of a falsely-precise
figure — e.g. Organic Carrots now shows "4 *may be more*" rather than a
bare "4". A single-bucket ingredient that simply never resolves at all
(like **Oranges**, "3 ind" with no matching product setup) is unaffected
by this change — there's no second bucket for it to be "incomplete"
against, so it correctly keeps the plain "No pack weight" badge exactly as
before.

This flag is a safety net, not a fix for the underlying data gap — the
actual fix for Carrots/Onions/Peppers (and anything else showing "may be
more") is the same one already documented for Organic Bananas earlier in
this file: give the product a **Recipe unit** of "ind" and a **↳ how many
per pack** yield (e.g. "how many carrots in a 700g bag"), so the app can
convert the whole-item quantity into the same weight total and give one
accurate, complete pack count instead of a flagged partial one.

### Drag-and-drop ingredient reordering, and a default "Recipe makes" of 20 (Phase 19, polished in Phase 20)

Two small Recipe Bank requests, both in the per-recipe Ingredients editor:

Every ingredient row has a drag handle (⋮⋮) in a leading column. Press and
drag it up or down to reorder the list — while dragging, the row you're
moving lifts up into a small floating card with a shadow, the other rows
smoothly slide out of the way, and a dashed highlighted gap shows exactly
where it'll land; letting go settles it into place. This only changes the
order ingredients are listed in (on this screen, on the kitchen prep
sheet, and anywhere else the recipe's ingredient list prints) — it doesn't
touch quantities, units, or links — and the new order **saves itself the
moment you drop it**, with no need to also click "Save ingredients" (that
button is still there for actual field edits — qty, unit, prep, links —
same as before).

The same drag handle works identically with a mouse on a desktop and a
finger on a touchscreen — this whole app runs in Safari on the kitchen
iPad, so both had to work well from day one. It's built on one shared
interaction (Pointer Events, which cover mouse/touch/pen uniformly) rather
than bolting a separate touch version onto a mouse-only one, and both
input types are covered by their own automated test.

Separately, clicking **"+ New recipe"** (from the Recipe Bank list, or
**"+ New recipe for this slot"** from the Week planner) now pre-fills
**"Recipe makes … servings"** with **20** instead of leaving it blank,
since most recipes here are batch-cooked in that size. It's still a
completely ordinary number field — change it to whatever the recipe
actually makes, or clear it entirely for a bought-in item that isn't
scaled by servings at all. Existing recipes that were already saved with a
blank "Recipe makes" (genuinely bought-in items) are untouched — the
default only applies at the moment a brand-new recipe record is created,
never as a fallback shown for existing data.

### A parent-facing "Description" field on every recipe (Phase 21)

Each recipe now has a **Description for parents** box on its own page, just
above Course — a short one-line blurb like *"Tender chicken, butternut
squash and vegetables gently cooked in a mild creamy coconut and yoghurt
korma sauce, served with brown rice"*. This is separate from the existing
**Preparation** field lower down, which is the kitchen's own cooking method
and was never meant to be shown outside the kitchen — the two are stored
independently and neither affects the other.

This came out of a request to reproduce John's branded weekly Menu Pack
(the parent/kitchen-facing PDF with the italic line under every meal) as
something the app generates automatically from live recipe data, instead
of it being retyped into a separate document every season. The description
field is the one piece of that pack's content that doesn't already exist
anywhere in the app — everything else (which meals are on which day,
allergens, the weekly rotation) is already there. It's a plain manual field
for now: type in what you want parents to read, save, done — and because
it lives on the recipe itself rather than in a separate document, it
carries forward automatically the next time a recipe is reused in a future
season, rather than needing to be retyped again.

### Generate Menu Pack (Phase 22) — the branded parent/kitchen PDF, built from live data

The Staff admin's **The rotation** page now has a **🖨 Generate Menu Pack**
button. It builds the exact branded, landscape Menu Pack John's team already
prints and hands to both kitchen staff and parents each season — a cover
page explaining the three weaning stages, followed by one page per week
(Week 1–4) laid out as Breakfast / Mid Morning Snack / Lunch / Vegetarian
Option / 2nd Course / Afternoon Snack / Light Tea / Late Snack, with the UK
allergen icons on every dish and an allergy key at the bottom of each week
page — straight from the season currently open in this admin session: the
weekly rotation, each recipe's linked-ingredient allergens (the same
calculation the Allergen matrix page already uses), and each recipe's
**Description for parents** field (Phase 21) if one's been filled in. There
is deliberately no separate typed document to keep in sync any more — this
pack can never drift from what the kitchen prep list itself says a day
serves, the same principle behind every other admin export in this app.

Click the button and a confirmation dialog names which menu the pack will
be built from — **General menu** or **Weston-super-Mare (dietary
substituted)** — based on which site's `?site=` link this Staff Admin
session was opened from, exactly the way "Upload changes" already shows/
picks a target group. There's no separate group picker: to generate the
other menu's pack, reopen Staff Admin from a site on that menu first (e.g.
`?site=little-adventures-weston-super-mare` for the Weston pack).

Clicking "Generate PDF" opens the finished pack in a new browser tab as
print-ready HTML, with a **🖨 Print / Save as PDF** button pinned at the
top (hidden automatically when actually printing). Use the browser's own
print dialog and choose "Save as PDF" — this deliberately doesn't bundle a
PDF-generation library; the browser's print pipeline already produces
crisp, small, selectable-text PDFs, and it keeps `app.html` exactly what it
has always been: one dependency-free file. The page is styled for A4
landscape with each week's table sized to fit one sheet; a week with
unusually long dish names/descriptions can still push onto a second sheet
for that page, the same way the original hand-built document would run out
of room.

A few deliberate simplifications versus John's original hand-typed pack,
worth knowing about:

- **No separate "Tea Vegetarian Option" row.** The rotation data can carry
  one (some days do), but John's own reference pack never printed a
  separate row for it, so this generator matches that and leaves it out.
  The Lunch/Main course's own Vegetarian Option row is unaffected.
- **A day with no separate Vegetarian Option recipe on file just prints
  blank** in that day's column, rather than a guessed "Same as above" (the
  phrase John's old hand-typed pack used on days when the veg dish
  happened to match the main course). There's nothing in the data that
  says *why* a day has no separate veg dish, so nothing is invented. If a
  day's veg option is genuinely identical to that day's main course, the
  cleanest fix is to put the *same* recipe in both the Main and Vegetarian
  Option slots for that day in the rotation editor — then this generator
  prints that dish's real name in both places, which is more informative
  to parents than "Same as above" and stays perfectly in sync automatically.
- **The two brand logos, the apple illustration, and the "Reviewed by
  Startwell" badge** were extracted from John's uploaded reference PDF and
  are embedded in `app.html` (base64, like the allergen icons) purely as
  static header artwork — they're brand-wide, not tied to any one site's
  own logo (`sites/<slug>/assets/logo.png`, used elsewhere in the app).
- **Meal times** (8.30am–9.15am for Breakfast, and so on) are fixed text
  in the generator, not stored per-recipe — John confirmed these never
  vary week to week.

### Menu Pack fixes: white icon backgrounds, black-and-white/blank print

Shortly after Phase 22 shipped, two real problems turned up from actually
using the feature:

- **The 14 allergen icons had a solid white square behind them.** They were
  plain RGB PNGs (no transparency) with a white background baked in, which
  looked fine sitting on the app's own white cards but showed as an
  obvious white box wherever an icon sits on a coloured background — like
  the Menu Pack's tan/green meal rows. Every icon has had its background
  square removed (each is now a transparent PNG), while keeping each icon's
  own *internal* white details exactly as they were — the white ring on
  some icons, the white bottle/egg/fish shape drawn inside the coloured
  circle, and so on. This is a shared icon set (`ALLERGEN_ICONS`), so the
  fix applies everywhere allergen icons appear, not just the Menu Pack:
  recipe pages, the Allergen matrix, the rotation grid, and the kitchen
  ticket.
- **The white square was still showing up specifically on printed/saved
  Menu Packs even after the above fix**, reported with a screenshot showing
  a sharp-edged white square behind every icon on an actual saved PDF.
  This app's own automated checks (which render a PDF the same way the
  headless testing tool does) never reproduced it, which points to a real
  browser's interactive "Print → Save as PDF" pipeline occasionally
  flattening a transparent PNG's see-through background against plain
  white instead of the page behind it, rather than the icon artwork itself
  being wrong again. Rather than keep depending on every possible printer/
  browser combination handling transparency correctly, the Menu Pack now
  uses its own pre-flattened, fully opaque version of each icon for every
  exact background colour a dish row can have (the tan and green row
  bands, plus each of the four Enhanced Menu Layout row colours) —
  generated once and embedded alongside the transparent originals. An
  opaque PNG that already *is* the right colour behind the icon cannot be
  mis-flattened to white by any renderer, since there is no transparency
  left for it to get wrong. The shared `ALLERGEN_ICONS` used everywhere
  else in the app (recipe pages, Allergen matrix, rotation grid, kitchen
  ticket) is untouched — this only affects the Menu Pack's own print
  output, the one place this was ever actually reported.
- **The Allergy information key row at the bottom of each page kept
  showing the same white square, even with the fix above.** That row is
  the one place an icon doesn't sit on a plain, flat row colour — it sits
  directly on the page's own subtle paper-grain texture. Baking a flat
  "paper colour" version of the icon the same way as the dish rows turned
  out to make this one worse, not better: sampling an actual rendered PDF
  showed the real, textured page tone runs measurably darker and grainier
  than a flat, unblended swatch of that same colour — so the baked icon
  itself was the mismatch causing the square, not a rendering quirk. Since
  no single flat colour can disappear into a genuinely textured, grainy
  background, the key row's icons now keep their original see-through
  artwork — real transparency shows whatever paper grain is actually
  there, pixel for pixel, which is the only way to blend in perfectly
  regardless of exactly where that row lands on the page.
- **Print preview showed in black and white, and the saved PDF was blank.**
  Two separate causes, both fixed:
  1. Browsers can silently drop CSS background colours when printing
     unless told not to — the Menu Pack's tan/green/cream row shading was
     disappearing in print/PDF for exactly this reason. Fixed by adding the
     standard `print-color-adjust: exact` CSS hint, so background colours
     now print (and save to PDF) exactly as shown on screen.
  2. The blank saved PDF was a separate bug in how the pack's preview tab
     was opened. It previously wrote the pack's HTML into a bare popup
     window with `document.write()`, which some browsers' "Save as PDF"
     print backend can't reliably capture, because that popup was never a
     real, fully-loaded page. The preview now opens as a real, independently
     loaded page (via a Blob URL) instead, which prints and saves to PDF
     the same reliable way any ordinary web page does.

Both are covered by the existing Phase 22 automated test, plus manual
rendering checks (generating a PDF and inspecting its actual pixels, not
just its HTML) — this is the same double-check pattern used to catch a
couple of other Phase 22 issues before John ever saw them.

### Larger, easier-to-read cell text

John reported the Menu Pack's table text was hard to read. Every piece of
text inside the weekly table — dish names, meal labels and times, the
condensed "Water or milk to drink"-style info bars, and the weekday
headings — was sized up across the board (both the standard layout and
Enhanced Menu Layout, keeping the same relative hierarchy between them —
Lunch/Light Tea are still the largest, and Breakfast/Afternoon Snack are
still a touch smaller). This app's own automated checks (headless Chromium)
showed every week still fitting on one A4 landscape sheet with room to
spare — but see the next section: John's own real printed PDF showed
otherwise, and the sizing was subsequently dialled back slightly to restore
a safe margin. Text is still noticeably larger than the original Phase 22
sizing.

### Page-fit safety margin — a real overflow found only in John's own printed PDF (Phase 24)

After the text-size increase above, John reported two things from his own
downloaded PDF (generated via Safari on his Mac, not this app's own
Chromium-based testing tool): the pack came out as 6 pages instead of 5,
with the Allergy information key spilling onto a stray extra page, and —
worse — a screenshot of Week 3's own table showed the "Late Snack 5.00pm"
row's adjacent cell rendering as a blank coloured rectangle with no visible
text at all.

Both symptoms had the same root cause. The larger text from the section
above, combined with the existing cell padding and row heights, had eaten
almost all of the Menu Pack's built-in page-fit margin — leaving each week
page's true content only 4–7% narrower than the printable area in Enhanced
Menu Layout. This app's own automated tests never caught it, for two
compounding reasons:

1. **Chromium's print pipeline isn't a perfect stand-in for Safari's.**
   Safari renders this pack's custom embedded fonts (Roca, Museo Sans)
   with measurably different metrics than headless Chromium, so a layout
   that just barely fits in this app's own testing tool can genuinely
   overflow in the browser John actually uses.
2. **The table's own layout was hiding the true numbers from a naive
   check.** Each week page's table is set to stretch and fill whatever
   space is left after the header and allergy key take their own room
   (`flex:1 1 auto`) — so simply measuring the table's rendered height
   never revealed whether its actual content needed more room than that;
   it only ever showed the space it had been given.

The "Late Snack" text loss was the sharper symptom of the same problem: when
a table row is forced to straddle a print page break, some browsers paint
that row's background colour on both page fragments while drawing its text
on only one of them — so the row doesn't just get pushed to a new page, its
own words disappear.

Two fixes went in together:

- **A real safety margin was restored.** Cell padding, row heights, and
  line-heights in Enhanced Menu Layout (and, to a smaller extent, the
  standard layout) were tightened slightly — without undoing the
  readability improvement from the previous section; the text is still
  larger than the original Phase 22 sizing, just no longer sized right up
  against the page's edge. Measuring each week page's *true* natural
  content height (by briefly overriding the table's stretch behaviour to
  read its unconstrained size, then restoring it) now shows 27–30% of
  spare room in the standard layout and 16–18% in Enhanced Menu Layout,
  for every week — comfortably clear of the point where a different
  browser's font metrics could tip it over.
- **A table row can no longer be split across a page break.** Every table
  row, the weekly header, and the Allergy information key now carry
  `break-inside: avoid`, so a print engine that's running short on room for
  one of them is forced to push the *whole* row or block onto the next
  page rather than slicing it in half. This turns any future marginal-fit
  case back into "an extra, slightly untidy page" — annoying but safe —
  instead of a row silently losing its own text.

A new permanent regression test
(`test_phase24_menu_pack_page_fit_safety_margin.py`) measures this true
safety margin directly and fails if any week page in either layout drops
below an 8%-of-page floor, specifically so this class of "passes in our own
testing tool but overflows in a real browser" bug can't quietly creep back
in as text sizes or spacing change in the future. Re-verified against
John's own flagged case: Week 3's Late Snack row and the Allergy
information key both render fully and correctly, with the pack coming out
to exactly 5 pages, in both the standard and Enhanced Menu Layout.

### Automatic page-fit safety net — content-length-proof, not just margin-tuned (Phase 25)

Phase 24 (above) fixed one real overflow by hand-tuning padding and line-heights against the one season's sample content this app's own tests happened to use. That was never going to be the last word: every nursery re-types its own dish names and parent-facing descriptions each season, and John hit a fresh overflow — reported as the pack printing as 6 pages instead of 5, straight from his own live Autumn/Winter 2026 season, printed on his own physical printer — using real content this app had never specifically measured against.

Rather than chase another one-off margin bump that only holds until the next season's wording runs a little longer, the Menu Pack now checks its own fit every time it's generated, against whatever real content and whatever real browser is doing the printing, and automatically tightens its own spacing — in two graduated steps — only as far as actually needed. A season with ordinary-length dish names is completely unaffected, pixel for pixel. A season with unusually long dish names or descriptions now quietly gets a slightly more compact pack instead of an overflow page. This turns "does it fit" from something that has to be re-verified by hand every time text gets longer into something the pack checks and corrects for itself.

Verified by deliberately inflating every dish name and description in a generated pack far beyond anything in this app's real data, and confirming the safety net engages automatically and restores a full, healthy margin (both the milder first-step and the more aggressive second-step tightening were exercised and confirmed working); a genuinely extreme, unrealistic amount of injected text was also tried to confirm the fallback behaviour stays safe even beyond what the two steps can fully absorb — content still doesn't lose any text, it just spills onto a normal extra page, exactly as the Phase 24 defensive rules intend.

### Print orientation warning — the pages were never the problem, the print dialog's default was (Phase 26)

After Phase 25 shipped, John reported the pack was still printing wrong on his own machine — but this time he sent screenshots of the actual print dialog, and they showed the real cause: pressing Cmd+P opened the dialog defaulted to **Portrait**, which scrambled the weaning information and Week 1's table onto a single page and threw every later page out of alignment. Selecting **Landscape** by hand fixed the page order completely.

This app's Menu Pack has always been built for A4 Landscape, and the page itself already says so in code (`@page { size: A4 landscape }`). The missing piece is that some browsers — Safari included — never apply that as the print dialog's *default* orientation; it's a real, confirmed platform limitation, not a bug in this app's CSS. The dialog's orientation and its separate "Print backgrounds" toggle both stay in whatever state the browser last used, and there is no CSS or JavaScript that can override either one. Every previous "still broken" report in this saga was very likely this same manual step going differently each time, not a regression in the margin or auto-fit work.

Since the browser genuinely can't be told to default correctly, the fix makes the manual step impossible to miss instead of trying to force it: the Menu Pack now shows a persistent on-screen banner right above the pages, naming both settings the print dialog needs — **Orientation → Landscape** and **Print backgrounds → on** — before the Print/Save as PDF button is even used. And if Portrait reaches the printer anyway, the pack no longer prints its scrambled real content at all — a print-only rule detects Portrait and swaps the entire pack for one clear "This pack needs Landscape" page with the same instructions, so a mistaken print comes out as one obvious, harmless page instead of a garbled multi-page document.

Verified with real Chromium PDF output in both orientations: a Portrait print now produces exactly one page containing only the warning (confirmed no menu content — no week or meal text — leaks through), a Landscape print is completely unaffected (still the normal 5 pages, with neither the on-screen banner nor the warning page appearing in the printed output), and the on-screen banner is present and names both settings correctly. This closes a testing gap too: every earlier automated print test always told the PDF engine which orientation to use, so nothing in this project had ever actually exercised what a real, un-configured print dialog does by default — this phase adds that exact check as a permanent regression test.

The "little white area at the bottom of each page" and the extra 6th page John also mentioned were seen together with the Portrait mix-up in his screenshots, so it's not yet confirmed whether that's a separate, still-open issue or was itself just a symptom of the wrong orientation. Worth a quick retest once Landscape and Print backgrounds are both set correctly, to see if it's still there.

### Staff Admin now syncs a season from the live site instead of showing an old sample (Phase 27)

John reported that he and a colleague, both in Staff Admin, were seeing different information in the same season's recipe rotation. The cause: the rotation editor's data (everything in Staff Admin — the recipe bank, the weekly matrix) lives in that browser's own local storage, not on the server. It's only ever filled in by hand-editing or "Import a week" on that specific device, and it only reaches anyone else once "Upload changes" is clicked. A colleague opening Staff Admin on a different laptop or iPad, for a season they've personally never imported, doesn't see "nothing yet" — they see whatever sample menu happens to be built into that copy of the app, which can easily be an old test season that's since been replaced by real edits and uploads nobody's device but the editor's ever received.

Staff Admin now fixes this itself: whenever it opens, or whenever the season picker is switched, it checks whether this device's copy of that season has ever actually been changed from what the app shipped with. If it hasn't, it quietly fetches whatever's genuinely live on the server (the same source every kitchen's real menu page reads from) and loads that in instead — so a colleague opening Staff Admin for the first time now sees the real current menu, not an old sample. A season with real local edits or imports already on a device is never touched by this — it's only for a device that's never had a chance to see the real thing yet. If nothing has been published yet, or the site can't be reached, it simply leaves things as they were.

Verified in both directions: a device that's never touched a season correctly pulls in the live content the next time it's opened, and a device with genuine local edits keeps them exactly as they are, with nothing from the server overwriting them.

### A reliable "Refresh from live site" button, since the automatic sync above wasn't enough on its own (Phase 28)

John tried Phase 27 and reported it still wasn't working — his colleague's Staff Admin was still showing old information. The automatic check only ever helps a device that has genuinely never touched a season at all, compared byte-for-byte against the exact sample data this file shipped with. In practice, almost any real device — including his colleague's — has already opened Staff Admin at some point before this feature existed, and its saved local copy can easily differ from the newest version in some small, harmless way that has nothing to do with a real edit. Phase 27 correctly refuses to guess in that situation (to protect real work-in-progress), which unfortunately also means it does nothing useful for an already-used device like this.

Rather than trying to make the automatic guess smarter (and risk it guessing wrong in the other direction — silently overwriting someone's real unsaved edits), Staff Admin's topbar now has a direct, explicit **"⟳ Refresh from live site"** button next to the season picker. Click it, and it fetches exactly what's currently published for that season, warns clearly that any of your own unsaved local changes will be lost, and only replaces your local copy once you confirm. This works no matter how a device's local content got the way it is — it doesn't need to guess anything. If a colleague's rotation is ever showing something different from what you see, this button is the reliable fix.

Verified with a device carrying a genuine, already-saved local draft (exactly the situation the automatic Phase 27 check correctly leaves alone): clicking "Refresh from live site" and confirming correctly replaces it with the real published content.

### The actual bug behind three "still didn't work" reports: refreshing never cleared old slots (Phase 29)

John sent over his own Staff Admin export and his colleague's, taken right after clicking "Refresh from live site." Comparing them line by line found the real cause: every single difference was the colleague's copy having an extra recipe sitting in a day/course slot that John's own (correct) copy had nothing in at all. The colleague's refresh had reported success, and the live site genuinely had the right, smaller menu — but importing only ever *added or updated* the slots present in whatever was being loaded in. It never *removed* a slot that used to have a recipe but has since been cleared in the real menu. So a device that had ever picked up an old recipe in some slot would keep showing it forever, no matter how many times it refreshed or re-imported — there was simply no code path that ever cleared anything.

Fixed at the source: importing a season now fully replaces each week it covers, rather than layering on top of whatever was already there. Any old recipe sitting in a slot the current menu no longer uses now correctly disappears the moment that week is refreshed or re-imported — matching what "Import a week," "Refresh from live site," and "+ Add season" were always meant to do (replace with the real thing), not what they were accidentally doing (merge with it forever).

Verified directly against the real files from this report: reproduced the exact shape found in them (a device with a genuine leftover slot the live menu no longer has), confirmed it survived a refresh before this fix and is correctly cleared after it, and confirmed a fresh regression test fails against the old code and passes against the new one.

### A "Download PDF" button that bypasses the print dialog entirely (Phase 30)

John asked whether the Menu Pack could just generate a downloadable PDF directly, rather than relying on the browser's own Print / Save as PDF flow — the three previous print phases (24–26) had all been spent fighting problems that lived in that dialog (wrong default orientation, print backgrounds switched off, margin quirks), not in the pack's own layout.

The Menu Pack now has a second button, **"⬇ Download PDF"**, next to the existing Print button. It builds a real `.pdf` file directly in the browser and triggers a normal file download — no print dialog appears at any point, so there's no orientation default, no "print backgrounds" toggle, and no per-browser margin behaviour left to go wrong. The existing Print / Save as PDF button is still there as a fallback, with its on-screen instructions now pointing to Download PDF as the reliable first choice.

This is built with no external library at all (no jsPDF, no html2canvas) — deliberately, since this project is a single static HTML file with no build step, and every image and font the Menu Pack uses is already a self-contained base64 `data:` URI, so nothing here needs a network fetch to work. Each page is rasterized to an image using a standard, dependency-free browser technique (an SVG `<foreignObject>` holding a clone of the page, drawn onto a canvas), and those images are assembled into a PDF file by a small hand-written PDF builder — enough to place one image per page, which is all a visual, already-designed pack like this needs. The trade-off is that text in the downloaded PDF isn't selectable or searchable, the same as a scanned document; if that's ever needed, it would mean a much larger rebuild that redraws the whole layout with a real PDF text/vector library instead of images.

One real bug turned up and was fixed before this shipped: the first version rasterized each page using the browser's plain HTML serialization (`.outerHTML`), which doesn't produce well-formed XML (for example, an `<img>` tag isn't self-closed) — and the rasterization technique requires well-formed XML, so every download silently failed. Switched to `XMLSerializer`, which always produces valid XML from the same DOM content, and downloads now succeed reliably. A second, more subtle issue was caught during review rather than by a user report: the auto-fit tightening (Phase 25) and Enhanced Menu Layout (Phase 23) styles both only apply to a page when it has a specific ancestor wrapper with the right class on it, and the first version of the rasterizer cloned only the page itself, losing that ancestor — so a downloaded PDF could have silently ignored active tightening or the enhanced layout, even though the on-screen preview looked correct. Fixed by carrying the real wrapper's current classes into the isolated copy used for rasterization.

Verified by actually downloading real PDF files (not just checking that a file exists): page count and A4 landscape page size confirmed with `pdfinfo`, and each page's rendered content confirmed non-blank. The two scenarios most at risk from the ancestor-class bug were tested directly by comparing rendered pixels: a downloaded Enhanced Menu Layout PDF and a downloaded auto-fit-tightened PDF are both confirmed to look meaningfully different from a plain download, proving those styles really do carry through into the downloaded file rather than being silently dropped.

### Downloaded PDFs were silently using the wrong font, and dish names needed more contrast against their descriptions (Phase 31)

John tried the new Download PDF button and it worked, but felt the result wasn't as polished as a sample menu his marketing team had put together separately — he specifically wanted dish names to read bolder, with the descriptive line underneath receding into the background rather than competing with it, and sent over both his download and the marketing team's version for comparison.

Comparing the two side by side turned up something bigger than a styling tweak: the downloaded PDF's text wasn't even in the right font. Every dish name and description was rendering in a generic fallback serif font instead of this pack's own brand font — something no amount of on-screen checking would have caught, since the on-screen preview and the Print button both use the real page directly and were never affected; only the separately-rasterized Download PDF path was wrong. The cause was specific to how that download is built (see Phase 30): each page is captured in isolation without the rest of the real page around it, and the font choice was set on the page's `<body>` element — which doesn't exist in that isolated capture, so the font silently fell back to the browser's generic default instead of the brand font. Fixed by carrying the real page's font choice directly into the capture, rather than relying on an ancestor element that isn't there anymore.

With the correct font restored, dish names and descriptions were then tuned to match what John asked for: names are now bolder and slightly larger, and descriptions are smaller, in a softer, lighter tone that clearly reads as secondary supporting text — matching the visual hierarchy in the marketing team's sample.

Verified by generating a real downloaded PDF and comparing it directly against both the previous (wrong-font) download and the marketing team's sample: confirmed the correct brand font now appears throughout the document (not just in the meal table, also the weaning-stages intro page), and confirmed the dish-name/description contrast now matches the intended bolder-name, lighter-description hierarchy. Full regression suite still passes, including both Enhanced Menu Layout and the standard layout.

### A recipe's own description never actually reached a colleague's device (Phase 34)

The exact same "two devices, genuinely different content" complaint that Phases 27–29 chased for the weekly rotation surfaced again, this time in the Menu Pack itself: John sent over his own downloaded pack alongside screenshots from a colleague's, and several dishes' "description for parents" text was present in one and completely missing in the other — in both directions, on different weeks — even right after the colleague clicked "Refresh from live site."

The cause turned out to be two gaps stacked on top of each other, both dating back further than Phases 27–29 (which only ever dealt with *which recipe sits in which day/course slot*, never a recipe's own content): first, a recipe's description was never actually included in what "Upload changes" sends to the server at all — so it could never reach the live site, no matter how many times someone typed one in and uploaded. Second, even if it had been included, "Refresh from live site" (and Import a week / + Add season, which share the same code) only ever re-linked an *already-known* recipe's weekly slot — it never touched that recipe's own saved content on the device doing the refreshing. So a description could only ever appear on the one device it was typed on, and any amount of refreshing elsewhere would never bring it across.

Both are fixed: descriptions are now part of what gets uploaded, and refreshing/importing now brings a matched recipe's description fully in line with whatever's genuinely published — matching what the Refresh button's own confirmation message has always promised ("Any changes made here that haven't been uploaded yet will be lost"). This is deliberately scoped to the description field alone rather than also force-syncing a matched recipe's ingredients, method or servings on every refresh — those can carry a live link into the Ingredient Database or other structure this import path doesn't safely round-trip, so overwriting them here would risk trading one sync bug for a worse regression. The description is a plain line of text with no such risk.

Verified directly against the reported shape: a device that already has a recipe locally with no description, refreshing from a "live" copy of that same recipe that now has one, correctly picks it up — and a brand-new recipe that has a description from the moment it's first imported keeps it. Confirmed this test fails against the pre-fix code with exactly the two symptoms reported (an existing recipe's description not updating, a new recipe's description missing entirely) and passes against the fix. Full regression suite, including Phases 27–29's own sync tests, still passes.

### The Phase 34 fix itself wiped out real descriptions on its very first use (Phase 35)

John tried Phase 34 and immediately reported something worse: "Now when I've done a refresh from live site all the descriptions have disappeared" — his own downloaded pack, which previously had every description, came back completely blank after one click of Refresh from live site.

The cause was a gap in Phase 34's own fix, not a new, unrelated bug: making a matched recipe's description unconditionally overwrite from the incoming data (`recipeBank[id].description = r.description || ''`) is only correct once the live copy was genuinely published under the new, description-aware upload code. But every season blob published before that fix landed — which, right after deploying it, is every season blob that actually exists — has recipes with no `description` field at all, not an empty one. `r.description || ''` can't tell "this is genuinely blank" apart from "this field doesn't exist in this payload yet", so the very first refresh anyone did against the still-old live data quietly blanked out every real, already-typed description on that device. This is exactly why the warning in this same section about needing an "Upload changes" first, before anyone refreshes, wasn't enough on its own — the order matters, and there was nothing in the code actually protecting against getting it the other way round.

Fixed by only overwriting a matched recipe's description when the incoming data genuinely has that field present at all (not just checking whether it's non-empty) — so a refresh against an old-format, description-less season is correctly treated as "this field is unknown here," leaving whatever's already saved locally alone, while a refresh against a season that was genuinely published under the fixed code (even with a description deliberately cleared to nothing) still updates exactly as intended.

Verified by reproducing the exact reported shape: a device with a real, already-typed description refreshing against an old-format live payload with no description field at all now keeps its description untouched, confirmed to fail against the code from earlier in this same phase with precisely the reported symptom before the fix and pass after it; a second case confirms a genuine deliberate clear from a properly-published season still correctly propagates, so the original fix's own purpose isn't lost in the process. Full regression suite passes. Separately, since this incident meant real, already-typed descriptions were lost from the one device that had them, the missing text was recovered from a Menu Pack PDF John had already sent before the incident and handed back as a reference document for pasting the descriptions back in by hand — the safest path, since reconstructing and re-importing a season file automatically risked creating duplicate, unlinked recipe records if it didn't match his live data's ingredients and method exactly.

### Independent recheck of the description-sync fix, end to end (Phase 36)

After the Phase 35 fix, John asked for the fix to be rechecked — reasonably, since the previous fix (Phase 34) had itself caused the data loss Phase 35 was cleaning up. Rather than re-running the existing Phase 34/35 tests (both of which hand-write the "server" response rather than exercising the real Upload/Refresh code), a new test was built that drives the actual UI end to end: one browser genuinely clicks "Upload changes" (running the real export code, not a stand-in payload), a second, independent browser genuinely clicks "Refresh from live site" against whatever the first one actually uploaded, and the result is checked not just in local storage but in a real generated Menu Pack's rendered output — the same thing John looks at.

This surfaced one genuine finding, though not a sync bug: the first version of the test placed its test recipe in the Breakfast slot and found no description in the generated pack. That's the Menu Pack's own by-design behaviour — descriptions are only ever shown for Lunch, 2nd Course and Tea (`showDescription` per meal slot in `MENU_PACK_MEAL_ROWS`), never for Breakfast, Vegetarian Option or Snack, regardless of whether one is saved. Moving the test recipe to a course that does show descriptions confirmed the sync itself works correctly end to end: upload → shared live copy → refresh on a second device → correct text in that device's saved data → correct text in its generated Menu Pack. The device that uploaded was also confirmed stable across two consecutive refreshes of its own data (no oscillation, no loss).

Full regression suite (47 files, including this new end-to-end test) passes.

### Light Tea gets its own Vegetarian Option row (Phase 37)

John pointed out the Menu Pack was missing a Vegetarian Option row under Light Tea, across all 4 weeks — Lunch already gets one, but Light Tea never did (a deliberate simplification from when the Menu Pack was first built, matching the reference PDF at the time; the underlying data — the course dropdown, the rotation grid, the "Tea Vegetarian Option" course itself — already supported it, the printed pack just never had a row for it).

To make room for the new row without pushing any week onto a second printed page, the "Water or milk to drink" and "Water or Milk (M) to drink" lines — previously their own full-width row under Breakfast and Light Tea — now print inside the Breakfast/Light Tea box itself, directly under the meal name and time, with the milk allergy icon kept alongside. That freed two whole rows' worth of space per week, in exchange for at most one new row (and only on the days a Vegetarian Option for Light Tea is actually filled in — an empty week still prints with no gap, exactly like Lunch's own Vegetarian Option row already does).

The new row shares Lunch's Vegetarian Option row's own look (pale green, italic, in Enhanced Menu Layout) rather than getting its own separate colour, since it's the same relationship to Light Tea that the existing row has to Lunch.

Verified against the seed data's own Spring/Summer 2026 season, which already has real Tea Vegetarian Option dishes assigned across all 4 weeks: the new row appears correctly (in both the standard and Enhanced layouts), the relocated "water/milk to drink" note and its icon render correctly in the Breakfast/Light Tea boxes, the old full-width sub-rows for those two meals are gone, Lunch and Afternoon Snack's own sub-rows are untouched, and all 4 weeks still print as a single page each. Confirmed the test fails with precisely these symptoms against a reverted copy of the code, and passes with the fix restored. Full regression suite — 48 files — passes. (Lunch's own sub-row was moved the same way in Phase 38, right below.)

### Lunch's sub-row moves too, and bigger allergy icons (Phase 38)

Straight after Phase 37, John asked for the same treatment on Lunch: move "Lunch served with water" out of its own full-width row and into the Lunch box, under the timing — same pattern as Breakfast/Light Tea. He also suggested making the per-dish allergy icons bigger now that there's more room, and separately asked what had happened to the recipe descriptions, since none showed up in the Phase 37 screenshot.

Both requests were straightforward once the Phase 37 pattern existed: Lunch's row lost its `afterText`/`afterIcon` sub-row and gained the same `labelNote` treatment (with no icon, since Lunch's own line never had one), and the per-dish allergy icons under every dish (`.mpIcons img`) grew from 3.4mm to 4.2mm, using some of the room Phase 37 and this change together freed up. Afternoon Snack is now the only meal still using a full-width sub-row.

On the missing descriptions: nothing was wrong. The Phase 37 screenshot was generated against the app's own built-in seed/demo data, and none of its 222 recipes have a description typed in — there was nothing to show, the same as any real day where nobody's filled that field in yet. It has nothing to do with Breakfast/Lunch/Light Tea's sub-rows moving; a recipe's own description only ever depends on whether someone's typed one into its "Description for parents" field, which this change never touches. Verified directly: attached a real description to a live recipe and generated a fresh pack — it renders correctly under the dish exactly as before, in both layouts.

Verified with a dedicated test (and, again, a deliberately reverted copy of the code to confirm the test actually fails first): Lunch's sub-row is gone, its "Lunch served with water" text (no icon) appears in the label cell, only Afternoon Snack's sub-row remains, the allergy icons measure visibly larger, a freshly-attached description still renders correctly under its dish, and all 4 weeks still print as a single page each. Full regression suite — 49 files — passes.

### A downloadable Allergen Matrix, modelled on a government-format sample (Phase 32)

John wanted the allergy information in the Menu Pack to match the format used by a government-approved allergen matrix his team already works with — a table of dishes down the side (name plus a short description) against all 14 UK/EU allergens across the top, each with its own colour, and a colour-matched tick in the cell rather than repeating the same icon over and over.

Before building anything, two quick mockups were put together using real Recipe Bank data and shown to John: one closer to the plain white/dark-teal look of the official template, one restyled in the Menu Pack's own warm paper-and-colour branding. John picked the compliance-style look, one table per rotation week (matching the existing Staff Admin Allergen matrix page), a faded tick with a small "may contain" label underneath for traces (rather than a confirmed Contains), and — importantly — appended after the 4 week pages in the same Menu Pack download, rather than as a separate document.

The Allergen Matrix now appears automatically every time a Menu Pack is generated or downloaded, calculated live from each recipe's linked ingredients — the same data source the recipe pages' own allergen badges and Staff Admin's existing Allergen matrix page already use, so it can never disagree with what's shown elsewhere in the app. The one genuinely tricky part: a week's number of distinct dishes varies hugely (a handful some weeks, two dozen or more once every course is filled in for others), so there's no safe fixed number of rows that always fits one page. Rather than guess, the pack measures the real, rendered height of each week's full table once it's loaded and splits it across as many pages as it actually needs — the same "measure the truth, don't guess it" approach already used for the menu pages' own auto-fit safety net (Phase 25), just solving the opposite problem (growing the page count to fit the content, rather than shrinking the content to fit the page count).

Verified against real Recipe Bank data: every week's rows are confirmed to land on the correct number of pages with nothing cut off or duplicated across the split, both checkmark states (confirmed Contains and faded may-contain-with-label) are confirmed to actually appear and render correctly, the compliance colour palette is confirmed distinct from the Menu Pack's own branding, and the Download PDF button is confirmed to include the new pages correctly (rasterized with real visible content, not blank). The existing Menu Pack tests were updated to check specifically for the 5 menu pages (excluding the new allergen pages) where that was their original intent, since the total page count is now correctly higher and varies with the season's real data.

Two quick follow-up tweaks after John saw it rendered with real data: the checkmarks were doubled in size (they were reading as faint marks rather than a clear "yes, this allergen" signal), and the vertical allergen-name labels across the top of each table are now properly centred over their own column/icon — they'd been quietly hugging the left edge of their column instead.

A third, more structural fix once real production data revealed it: whenever a week's pagination left a trailing page with only a handful of dishes (occasionally just one), that final page rendered with one giant, mostly-empty row — the dish name stranded near the bottom of a cell many times taller than any other row, with no visible checkmarks. The cause was the matrix table being stretched to fill the full page (so the "Contains/May contain" key always sits at the bottom), which is fine when a page is nearly full, but a real HTML table with very few rows distributes *all* of that stretch into the rows themselves rather than leaving it as blank space. Fixed by keeping the table at its natural height always and letting a plain (row-free) spacer element absorb the leftover space instead — the key still lands at the bottom of the page exactly as before, but a light week's last page now just has honest blank space under a normal-sized row rather than one grotesquely tall one.

### Specific gluten sources — Wheat / Barley / Rye / Oats (Phase 33)

The UK/EU's 14 legally-recognised allergens treat gluten as one category, and the official allergen matrix template still only has one Gluten column — but John wanted the option to record *which* cereal a dish's gluten actually comes from, since that matters to some families even though it's not a separate legal allergen.

The **Allergens** editor (used both for a recipe's own ingredient rows and for records in the Ingredient Database) now shows an extra, optional "Which cereal(s)?" section the moment "Cereals containing gluten" is ticked in either the Contains or May contain list — Wheat, Barley, Rye and Oats, tick as many as apply. It stays hidden the rest of the time, and un-ticking gluten again discards whatever was picked under it, so there's never a stray cereal note left on an ingredient that no longer says it has gluten at all.

Whatever's ticked shows up automatically on the downloadable Allergen Matrix: a dish with gluten from, say, wheat and oats gets a small "Wheat, Oats" note under its Gluten tick, right on the matrix, using exactly the plain names John asked for rather than the longer explanatory text — Wheat and Barley's fuller descriptions ("Includes spelt, kamut (khorasan wheat), durum, einkorn, and emmer" and "Includes malt and barley extracts") ride along as a hover tooltip on that note instead, for anyone who wants the detail without it crowding the cell. A dish with gluten but no specific source ever recorded just keeps showing the plain tick, exactly as before — this is additional detail, not a requirement.

Verified end-to-end against real seed data (`test_phase33_gluten_sources.py`): the cereal sub-picker only appears once gluten is ticked and disappears (with its picks discarded) once gluten is unticked; ticking Wheat + Oats on a real Ingredient Database record and saving persists correctly; generating a real Menu Pack shows "Wheat, Oats" under that dish's Gluten tick with Wheat's fuller description in the tooltip (and correctly leaves Oats, which has no fuller description on file, out of it); and a different dish whose gluten comes from an ingredient with no recorded source still shows a plain, unannotated tick — proving the detail is genuinely per-ingredient rather than leaking onto every gluten cell.

### Enhanced Menu Layout — an optional, more magazine-styled pack design (Phase 23)

The Generate Menu Pack dialog now has an **"Enhanced Menu Layout"**
checkbox, **off by default** — leaving it unchecked produces the exact
same pack as before this feature existed (verified: the standard output is
unchanged, pixel for pixel, whether this feature exists in the code or
not). Checking it before clicking "Generate PDF" produces a more strongly
designed version of the same pack, aimed at making the day's key meals
easier to spot at a glance:

- **Lunch and Light Tea** — the two most important meals of the day — get
  a warm tan/ochre row background, a bolder and roughly 10–15% larger dish
  name, and a taller row, so they stand out immediately on the page.
- **Vegetarian Option** gets a pale green row background and its dish name
  renders in italic, clearly marking it as the alternative to the main
  Lunch dish rather than a second main course.
- **2nd Course (Dessert)** gets a pale cream row background — present, but
  visually quieter than Lunch/Tea.
- **Breakfast and Afternoon Snack** stay visually calm (a touch smaller
  than Lunch/Light Tea, muted banding) since they're not the meals a
  parent needs to find first — every dish name on the pack is bold,
  though; size and colour carry the hierarchy, not weight.
- A subtle divider line appears between meal sections, and column widths,
  row heights, cell padding and icon alignment are all tightened up for a
  cleaner, more consistent look than the standard layout — while keeping
  every week to one printed A4 landscape sheet.

This is purely a presentation option — it reads exactly the same rotation
data, allergens, and descriptions as the standard pack; nothing about
what's *on* the pack changes, only how it's styled. Covered by a new
automated test suite (`test_phase23_enhanced_menu_layout.py`) that checks
the toggle defaults to off, that checking it actually adds the enhanced
styling (verified via real computed styles — italic Vegetarian Option
text, three genuinely different row background colours for Lunch/
Vegetarian Option/2nd Course, a larger Lunch font size than Breakfast's —
not just the presence of a CSS class), and that the standard pack is
completely unaffected either way.

### Preparation notes on recipe ingredients (e.g. "diced", "finely chopped")

Each ingredient row on a recipe's own page now has a **Preparation**
column (between Ingredient and Allergens) — a short free-text note like
"diced," "finely chopped," or "grated," describing how that ingredient
needs preparing for that specific recipe. This lives on the recipe's own
ingredient row rather than on the product in the Ingredient Database,
since the same product is often prepared differently in different
recipes — Organic Carrots might be "diced" in one dish and "grated" in
another. Leave it blank for anything that doesn't need a note.

Once a season is exported or uploaded, this note flows straight through
to the kitchen iPad's own "Today" ticket, showing as a small note directly
under that ingredient's name and quantity — exactly where staff are
already looking when prepping — with nothing shown at all for an
ingredient that has no note set.

### The kitchen iPad's own shopping list now uses the database too (Phase 6)

Everything above (Phases 1–5) lives in the Staff Admin recipe bank. But
there's a second, older shopping list — the day-by-day one on the actual
kitchen iPad's "Shop" tab, ticked off while shopping — and it had a real
gap: it still relied entirely on a hardcoded table of guessed Tesco pack
sizes (`PACK_RULES`) with no connection to the Ingredient Database at all,
even after everything above was built. So a product you'd already looked
up and linked in the database — with its real pack size and current price
— made no difference to what the kitchen list showed; it kept guessing.

This is now fixed: whenever a recipe's ingredient exactly matches an
active (non-archived) product name in the database, the kitchen list uses
that product's real pack size and price instead of the guess table, and
shows a small "Linked product: *name* — £*price* per *pack size*" note so
it's visible which items are backed by a real, staff-confirmed product and
which are still a best-effort guess. This also flows into the printable/
shareable text version of the list. Nothing changes for an ingredient that
isn't in the database yet, or whose only matching database record has been
archived — those still use the existing `PACK_RULES` guesses exactly as
before.

Matching is done by exact product name (case-insensitive), not a new ID
field — every linked ingredient's name, wherever it's exported into a
season's JSON, is already always that database record's current
`productName` (see Phase 2 above), so no format change was needed to make
this work; it's "through the existing workflow" rather than a new one.

### Bugs found and fixed while rechecking this work

A full recheck (an independent review pass plus the existing 8 automated
test suites) turned up four real bugs, on top of the ones already caught
and fixed while building Phases 2–4 (see above):

- **Multi-pack sizes written "size first" were silently misread.**
  `parsePackWeightGrams` (used for nutrition, cost, and now the kitchen
  list) only recognised a multipack written as "2 x 500g" (count first). A
  pack size written the more common retail way round — "500g x 2", or a
  Tesco-style "60g x 6" — matched the wrong, simpler regex and silently
  read as just 500g/60g, ignoring the "x 2"/"x 6" entirely. Both orders
  are now recognised. If you've already entered any pack sizes this way,
  it's worth a quick check on the Ingredients tab — the number itself
  didn't change, but what it's now correctly multiplied by has.
- **One bad ingredient record could silently disable the whole database
  for a page load.** If `_config/ingredients.json` ever contained a
  corrupted or malformed entry (a bad blob write, a hand-edited file), the
  kitchen list's loader would throw partway through reading it and quietly
  fall back to guessing for *every* ingredient, not just the bad one, with
  no visible error. It now skips a malformed entry and keeps everything
  else.
- **A shopping-list line folding a "tins/cans/packs" count into a weight
  total could silently produce `NaN`.** One entry in the pack-size guess
  table (fresh cherry tomatoes, which deliberately has no pack size — see
  the code comment) was being treated as a usable match anyway in one code
  path, before this recheck. In practice this could only ever be triggered
  by cherry tomatoes specifically being counted in tins, which the existing
  recipe data never does — so it's not a bug this app has actually hit in
  the ~225 real recipes on file — but it's now guarded properly rather than
  relying on that always staying true.
- **Two different products linked under the same shopping-list grouping
  could show one product's price against the other's quantity.** The
  kitchen list groups ingredients by a cleaned-up "canonical" name (so
  "Cheese", "Grated Cheese" and "Cheddar Cheese" all become one shopping
  line), but the Ingredient Database match is by *exact* product name —
  so if two recipes used different wording for what the database has as
  two genuinely different products, the combined line could have picked
  up just one of those products' price/pack size and shown it against the
  whole combined amount. This is now detected: a disagreement blanks the
  "Linked product" note out entirely for that line (falling back to the
  existing guess-table display) rather than showing a number that might be
  wrong for part of the quantity.

A new automated test suite (mirroring the existing 7) covers all of the
above, alongside the 8th run of the full existing suite with no
regressions.

### Bugs found and fixed while rechecking the Cost/Recipe unit work

A further recheck of the Cost card fallback, the "Recipe unit" conversion
feature, and the unit-dimming picker turned up two more real bugs:

- **The Shopping list could show the same ingredient as two separate
  rows.** If a product with a "Recipe unit" set (e.g. garlic) happened to
  be measured directly in grams in one recipe and in its recipe unit (e.g.
  "cloves") in another, the two amounts were tallied separately and shown
  as two different lines instead of one combined one. Now merged into a
  single row per ingredient, showing both amounts together (e.g. "100g +
  12 cloves") when this happens.
- **A non-numeric price on a product could show "£NaN" instead of naming
  it as missing a price.** Only reachable via a corrupted or hand-edited
  record, not through the normal "Add ingredient" form — but now guarded
  the same way every other missing-data case in the Cost card already is.

### Kitchen "Shop" list: discrete units (ind/cloves/slices/...) now resolve to a real pack and price

The kitchen iPad's own day-by-day "Shop" list (not the admin panel's
shopping list — this is the older, kitchen-facing one) is built by a
separate piece of code from the admin panel, and that code had never been
taught about the "Recipe unit" feature added earlier this round. It could
fold a weight- or volume-based ingredient into a real pack count (e.g. "2 x
300g pack cheddar"), and it had one narrow special case for "tins/cans/
packs", but any *other* whole-item unit — "ind" (each), "cloves", "slices",
and so on — just showed the raw number needed with no pack or price at
all, even when the product was fully set up in the Ingredient Database with
a real price on file. This is what was behind Weetabix and Organic Garlic
still looking wrong on the kitchen list after being correctly set up in the
Ingredient Database.

Two things are fixed:

- **Whole-item units now resolve against the database on the kitchen list,
  not just in the admin panel.** If a product has a "Recipe unit" set (e.g.
  Organic Garlic's "cloves", yield 10 per bulb), or its Unit of measure
  itself matches what the recipe uses (e.g. Weetabix's "ind") together with
  a pack size that gives a count, the kitchen list now shows "N × pack
  (£cost)" the same way the admin Cost card does, instead of a bare
  uncosted number.
- **A Pack size written as a bare number with no word at all (e.g. "48" for
  a box of 48 Weetabix) is now read as a count.** Previously, a pack size
  had to contain the word "x", "Pack", or "pk" (e.g. "6 x", "3 Pack") to be
  recognised as a count at all. A bare "48" matched nothing, and fell
  through to a fallback that assumes the price on file is for a single
  unit — silently treating the whole box's £5.50 as the price of *one*
  biscuit, and overstating that ingredient's cost by roughly 48×. This was
  a live, active bug affecting the admin Cost card as well as the kitchen
  list for any product recorded this way. A bare number is now recognised
  as a count everywhere `parsePackCount` is used.

Covered by a new automated test suite (14 total), alongside a full rerun of
the existing 13 with no regressions.

Two related items reported at the same time — Pitta Bread and the
allergen-icon products with a Recipe unit already set — are covered by this
same fix as long as their Ingredient Database record uses either a "Recipe
unit"/"how many per pack" pair, or a Unit of measure that matches the
recipe together with a Pack size `parsePackCount` can read a count out of
(a number with "x"/"Pack"/"pk", or a bare number). If either still looks
wrong after this fix, the most likely cause is that its Pack size field is
something `parsePackCount` genuinely can't read as a count (e.g. blank, or
a weight like "400g" for an item actually used by count) — worth checking
that field specifically for that item.

### Bare-number Pack size + a weight-style Unit of measure (Organic Carrots and similar)

Four other items reported at the same time — mixed sweet peppers, organic
carrots, Oatly oat drink, and organic oats — turned out to be a different,
more dangerous case than Weetabix/Garlic: these are loose/weighed products,
and a bare-number Pack size paired with a *weight-style* Unit of measure
(g/kg/ml/l) is genuinely ambiguous (does "500" mean 500g, or a count of 500
items?) in a way "ind"/"cloves" isn't. Rather than guess, a screenshot of
Organic Carrots' actual record was checked: Pack size **"700"**, Unit of
measure **"g"**, Current price **£1.35** — no Recipe unit needed here at
all (Recipe unit is only for when a recipe uses a *different, smaller* unit
than the pack, like "cloves" out of a whole bulb; carrots are weighed
directly in grams in every recipe, so that field should stay blank).

With that real example in hand, two things were confirmed broken by the
same root cause as the Weetabix bug, just on the weight side instead of the
count side:

- **Admin Cost card**: with no parseable weight in the Pack size string,
  `costPerBaseUnit` fell back to treating the Unit of measure directly as
  the priced unit — i.e. read the £1.35 as the price of *one gram*, not one
  700g bag. Any recipe using carrots by weight was overstating their cost
  roughly 700×.
- **Kitchen "Shop" list**: `resolvePackInfo` couldn't read a real pack out
  of "700" at all (its parser, like `parsePackWeightGrams`, requires the
  unit letters *inside* the Pack size string itself — "700g" would have
  worked, "700" didn't), so it silently fell back to the generic
  `PACK_RULES` guess table instead of the real, staff-confirmed £1.35/700g
  record — this is what "pack sizes not pulling properly" looked like on
  the kitchen iPad.

Fixed the same way as the Weetabix case: `parsePackWeightGrams` (and its
kitchen-script and family-detection counterparts) now read a bare number
together with the product's own Unit of measure — if that's itself a
weight or volume unit (g/kg/ml/l), the bare number is read as that many of
it. "700" + "g" now correctly means "a 700g pack", both for costing and for
the kitchen list's pack-count display. This is a straight correction, not a
new interpretation added alongside the old one — the old "price is per
gram" reading for a bare-number pack size was never right when the number
was actually meant as the pack's weight, so there's no remaining case where
the old behaviour was the correct one. (An ingredient with no Pack size at
all — genuinely priced "by the kilo" with no fixed pack, e.g. £3.00/kg
carrots with the Pack size field left blank — is untouched by this change
and still reads the price directly against the Unit of measure exactly as
before.)

Covered by a new automated test suite (15 total, alongside the two above),
plus an existing test's own expectation had to be corrected: a Phase 5
regression suite had encoded the *old*, buggy behaviour as expected (a bare
"300" Pack size with Unit of measure "g" was asserted to price at "£0.90
per gram") — updated to assert the corrected reading (a 300g pack for
£0.90) instead, since that old assertion was itself pinning down the very
bug this fix closes. All 15 suites pass.

If mixed sweet peppers, Oatly oat drink, or organic oats still look wrong
after this fix, the same troubleshooting applies as for any other item:
check whether the Pack size field actually holds a number `parsePackWeightGrams`
can read (with or without a unit letter, now that it can borrow the unit
from Unit of measure) — a genuinely blank Pack size for a "priced by the
kilo, no fixed pack" item is a different, already-supported case and needs
no change.

### How to set up an ingredient bought by weight but used by count (and vice versa)

Three more product patterns came up while going through this round of
fixes — none needed a code change, just the right combination of the
Ingredient Database's fields:

- **Bought whole/weighed, used as individual items in recipes** (e.g.
  Organic Apples — a 630g pack, but recipes call for "3 ind" apples): set
  Pack size to the pack's real weight (`630g`), Unit of measure to `g`,
  and use the **Recipe unit** fields — Recipe unit `ind`, "how many per
  pack" set to however many apples are actually in that pack. This costs
  each individual apple as a fraction of the pack price, lets Nutrition
  work out an average weight per apple (pack weight ÷ your count), and
  restricts the recipe builder's unit picker for this ingredient to just
  g/kg/ind.
- **Bought as a fixed-weight single item, used by weight in recipes, but
  wanted as a whole-item count on the shopping list** (e.g. Broccoli — one
  head weighs 335g, recipes measure it in grams, but the shopping list
  should say "3 × broccoli" rather than "1005g"): no Recipe unit needed
  here at all — just set Pack size to the one item's real weight (`335g`)
  and Unit of measure to `g`, with Current price being the price of one
  whole item. Recipes keep using grams directly; the shopping list (both
  the admin panel's and the kitchen iPad's) rounds the total grams needed
  up to whole items using that weight, exactly the same mechanism already
  used for a fixed-weight block of cheese.
- **A generic "closest organic equivalent" suggestion showing an unrelated
  product name.** The kitchen "Shop" list used to also show a second,
  independent suggestion (a leaf icon) drawn from a small hardcoded
  "Tesco Organic range" table, matched purely on a broad regex against the
  ingredient's name (e.g. anything matching `/cheese/i` suggested "Yeo
  Valley Organic Mature Cheddar 300g") — regardless of whether a specific,
  correctly-priced product was already linked via the Ingredient Database.
  This could show a real linked product (e.g. "Mild Grated Cheddar
  Cheese — £2.75 per 250g") right alongside an unrelated generic
  suggestion for a different product entirely, which is confusing at best
  and could send staff to buy the wrong physical item at worst. Removed
  from both the on-screen kitchen Shop list and the printable/shareable
  text export — only the real linked Ingredient Database product is shown
  now, never a generic guess. (The underlying `ORGANIC_MATCHES` table and
  `findOrganicMatch` function are left in the code, unused, in case a
  future "suggest something for anything still unlinked" feature wants to
  build on them properly — with an explicit "only when nothing real is
  linked" check this time.)

Covered by a new automated test suite (`test_phase6e_no_generic_organic_
suggestion.py`), plus a full rerun of the existing 15 with no regressions.

### What this does *not* do yet

On purpose, **none** of the following exist yet:

- Real ordering/checkout — placing an actual order with a supplier,
  handling payment, or tracking deliveries. The shopping list above stops
  at "here's what to buy and roughly what it'll cost"; turning that into a
  real order is still a manual step, and always will be for anything
  involving real money moving.
- Multi-supplier comparison, approval workflows, parent-facing reports, or
  Ofsted-evidence exports — the rest of the original "Future Features"
  wishlist. These need real decisions about how they should actually work
  (who approves what, what a parent report should contain, what counts as
  Ofsted evidence) that weren't in scope for this round — ask any time
  you'd like to scope one of these properly.

## 25 September 2026: grid view, new-season picker, and three save fixes

Built on `master` at `8e78c2f`. Everything below was checked against the existing test suites (all 149 checks pass) and against a new two-device harness, which is kept in `kitchen-prep-save-fixes.zip`.

### Kitchen page: grid view and recipe screen

A new **Grid view** button next to "Print prep sheets" switches the prep page to one card per dish for the day. Tapping a card opens that recipe full-screen, with Ingredients and Method side by side. Each side scrolls on its own and can be expanded to full width. **Back** or the Esc key returns to the grid.

The list view is unchanged and is still the default. Ticks are shared between the two views, because both draw their ingredient rows from the same `buildIngRow()`. On narrow screens (680px wide or less) the recipe screen stacks Ingredients above Method.

### Staff admin: a season added on one device now shows up on the other

A season created with **+ Add season** was published correctly, but the other admin's season picker never listed it. The picker was built only from the seasons that browser already held (`DATA.seasons`).

The picker now lists the shared season list first. Picking a season this device hasn't held yet pulls in its published rotation through the existing hydration path. The shared list is also re-read every time Staff admin opens, so a page left open picks up new seasons too.

### Staff admin: allergens undone by a colleague

The ingredient database's "what have I changed" baseline (`INGREDIENTS_BASE`) was kept only in memory. So after every reload, every product on the device counted as locally changed. The screen showed that browser's old allergens, and the next save of **any** product published them over a colleague's newer ones.

The baseline is now saved on the device. A device with no baseline trusts the shared copy.

### Staff admin: allergens lost straight after "+ Add new ingredient"

After a save, the baseline used to be taken from whatever was on screen once the save finished, not from what was actually sent. An allergen ticked while that save was still in progress was treated as the colleague's value at the next merge, and was quietly replaced with the blank one, under the toast "Allergens saved".

The baseline is now captured at the moment the request is sent.

### Staff admin: recipe ingredient-table changes that never saved

These actions now save immediately, through `commitRecipeEdit`:

- the row allergen picker's **Save** (it used to only change what was on screen)
- adding a row
- re-linking a row
- removing a row

Typed changes to quantity, unit or preparation, and typed changes to the details form, turn the button amber ("unsaved changes"). Moving to another admin page now asks first. If the admin leaves anyway, the table goes back to what was last saved, rather than leaving half an edit in memory.
