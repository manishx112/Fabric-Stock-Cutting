import { parsePayload, payloadCount } from '@/lib/format';

/* Ye route hamesha seedha sheet se padhta hai — na Next ise cache karta hai,
   na Vercel ka CDN, na browser. Refresh button aur auto-pull dono isi par chalte hain. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store'
};

export async function GET() {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) {
    return Response.json({ error: 'APPS_SCRIPT_URL set nahi hai — abhi built-in snapshot chal raha hai.' }, { status: 400, headers: NO_STORE });
  }
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const records = parsePayload(await r.text());
    const count = payloadCount(records);
    if (!count) throw new Error('Data array nahi mila');
    return Response.json({ records, at: new Date().toISOString(), count }, { headers: NO_STORE });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: NO_STORE });
  }
}
