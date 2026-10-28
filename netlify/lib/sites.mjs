/* The nurseries and the built-in nursery menus, as app.html knows them
   (SITE_SLUGS, SITE_MENU_GROUPS and NURSERY_MENUS_DEFAULT there). Used to
   fill the reference tables when the database is first set up; each
   site's name, address and contact details are then read from its
   sites/<slug>/config.json on the live site. */
export const SITE_SLUGS = [
  'green-giraffe-cardiff-bay', 'green-giraffe-cathedral-road', 'green-giraffe-parade',
  'green-giraffe-radnor-road', 'green-giraffe-penarth',
  'little-adventures-washwood-heath', 'little-adventures-stirchley', 'little-adventures-dudley',
  'little-adventures-st-philips-bristol', 'little-adventures-taunton', 'little-adventures-cheddar',
  'little-adventures-worle', 'little-adventures-victoria-park-bridgwater',
  'little-adventures-weston-super-mare', 'little-adventures-cheltenham-central',
];
export const BUILT_IN_MENUS = [
  { key: 'general', label: 'Main Menu', startedFrom: null },
  { key: 'weston-super-mare', label: 'WSM Only', startedFrom: null },
  { key: 'washwood-heath-nursery', label: 'Washwood Heath Only', startedFrom: 'general' },
];
export const BUILT_IN_SITE_MENUS = {
  'little-adventures-weston-super-mare': 'weston-super-mare',
  'little-adventures-washwood-heath': 'washwood-heath-nursery',
};
export const BUILT_IN_SEASONS = [
  { key: 'spring-summer-2026', label: 'Spring/Summer 2026', file: 'spring-summer-2026.json', startDate: null },
  { key: 'autumn-winter-2025', label: 'Autumn/Winter 2026', file: 'autumn-winter-2025.json', startDate: '2026-09-07' },
];
export function brandOfSlug(slug) {
  if (slug.startsWith('little-adventures-')) return 'Little Adventures';
  if (slug.startsWith('green-giraffe-')) return 'Green Giraffe';
  return null;
}
