// Page URL for the dev tools. BASE=http://localhost:4173/ points them at `npm run preview`
// (the production build), which exposes the test handle only with ?dev.
export function pageUrl(query = '') {
  const base = process.env.BASE ?? 'http://localhost:5173/';
  const u = new URL(query, base);
  if (process.env.BASE) u.searchParams.set('dev', '1');
  return u.toString();
}
