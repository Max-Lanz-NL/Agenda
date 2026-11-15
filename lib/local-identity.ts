import { createHash } from 'node:crypto';
export const localMode = () => !process.env.VERCEL && !process.env.NEXT_PUBLIC_SUPABASE_URL;
export const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function localBrowser(request: Request) {
  if (!localMode() || request.headers.get('sec-fetch-site') === 'cross-site') return null;
  const host = request.headers.get('host') || new URL(request.url).host;
  if (!/^(localhost|127[.]0[.]0[.]1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) return null;
  const origin = request.headers.get('origin');
  const key = request.headers.get('x-agenda-browser');
  if (origin && origin !== 'http://' + host && origin !== 'https://' + host) return null;
  return key && uuid.test(key) ? createHash('sha256').update(key).digest('hex') : null;
}
