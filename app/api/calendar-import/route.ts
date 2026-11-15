import { resolve4 } from 'node:dns/promises';
import { get } from 'node:https';
import { BlockList } from 'node:net';

export const runtime = 'nodejs';

const restricted = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) restricted.addSubnet(address, bits);

const maxBytes = 2 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store' };

async function download(url: URL, signal: AbortSignal, redirects = 0): Promise<string> {
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !url.hostname.includes('.') || redirects > 3) {
    throw new Error('Ongeldige agenda-URL.');
  }
  const addresses = await resolve4(url.hostname);
  const address = addresses.find(value => !restricted.check(value));
  if (!address) throw new Error('De agenda-URL is niet publiek bereikbaar.');
  signal.throwIfAborted();

  return new Promise((resolve, reject) => {
    const request = get(url, {
      agent: false, family: 4, signal,
      lookup: (_host, _options, callback) => callback(null, address, 4),
      headers: { Accept: 'text/calendar, */*;q=0.2' },
    }, response => {
      response.on('error', reject);
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        try { resolve(download(new URL(response.headers.location, url), signal, redirects + 1)); }
        catch (error) { reject(error); }
        return;
      }
      if (status !== 200) {
        response.destroy();
        reject(new Error('De provider heeft geen agenda teruggegeven.'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) response.destroy(new Error('Agenda is te groot.'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('error', reject);
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 8192) return Response.json({}, { status: 400, headers });
    const { url } = JSON.parse(body);
    if (typeof url !== 'string') return Response.json({}, { status: 400, headers });
    const target = new URL(url.trim().replace(/^webcal:\/\//i, 'https://'));
    const feed = await download(target, AbortSignal.timeout(8000));
    if (!/^\s*BEGIN:VCALENDAR\s*$/im.test(feed)) return Response.json({}, { status: 422, headers });
    return new Response(feed, { headers: { ...headers, 'Content-Type': 'text/calendar; charset=utf-8' } });
  } catch {
    return Response.json({}, { status: 422, headers });
  }
}
