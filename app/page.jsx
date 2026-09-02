import Dashboard from '@/components/Dashboard';
import snapshot from '@/data/rolls.json';
import { parsePayload, payloadCount } from '@/lib/format';

/* CACHE
   Page ISR par hai taaki pehla paint turant ho, par window sirf 60 second ki hai.
   Build ke waqt data HTML me bake na ho jaye — isliye `dynamicParams`/prerender ke
   bharose nahi rehte: client mount hote hi ek baar /api/rolls se taaza data khud
   mangwa leta hai (dekhein Dashboard ka auto-pull). Isse teen problem khatam:
     1. deploy ke baad pehla visitor build-time ka purana data dekhta tha
     2. ISR ki 5 minute wali khidki me sheet badal jati thi par page purana rehta tha
     3. tab kholi chhod dene par ghanton purana aankda saamne rehta tha */
export const revalidate = 60;

async function load() {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url) return { payload: snapshot, source: 'snapshot', fetchedAt: null, liveConfigured: false };
  try {
    const r = await fetch(url, {
      next: { revalidate: 60 },
      redirect: 'follow',
      headers: { 'cache-control': 'no-cache' }   // Google ke apne CDN ko bhi baasi copy dene se roko
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const records = parsePayload(await r.text());
    if (!payloadCount(records)) throw new Error('empty response');
    return { payload: records, source: 'live', fetchedAt: new Date().toISOString(), liveConfigured: true };
  } catch (e) {
    // Sheet na mile to dashboard band nahi hota — snapshot par chalta hai.
    return { payload: snapshot, source: 'snapshot', fetchedAt: null, liveConfigured: true, error: String(e.message || e) };
  }
}

export default async function Page() {
  const d = await load();
  return <Dashboard initialPayload={d.payload} source={d.source} fetchedAt={d.fetchedAt} liveConfigured={d.liveConfigured} loadError={d.error || ''} />;
}
