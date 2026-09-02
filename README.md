# Roll Cutting Control Room

Fabric roll cutting register ka dashboard — **Gandhi Nagar (Ladies)**, **Gandhi Nagar (Mens)** aur **G-104**,
teeno cutting points ek jagah. Next.js (App Router) + Tailwind CSS, Vercel par deploy ke liye ready.

---

## Local par chalana

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build check karna ho to:

```bash
npm run build && npm start
```

---

## Data kahan se aata hai

| Source | Kab chalta hai |
|---|---|
| `data/rolls.json` (built-in snapshot, 1,701 rolls) | jab `APPS_SCRIPT_URL` set na ho |
| Google Apps Script (live sheet) | jab `APPS_SCRIPT_URL` set ho — server side fetch, isliye CORS ka jhanjhat nahi |
| File upload (JSON/CSV) | Data source drawer se, sirf us browser ke liye |

### Live sheet jodna

1. Sheet me **Extensions → Apps Script** kholein aur ye paste karein:

```js
function doGet() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Roll Cutting');
  const v  = sh.getDataRange().getDisplayValues();
  const h  = v.shift();
  const out = v.filter(r => r.join('')).map(r => {
    const o = {}; h.forEach((k, i) => o[k] = r[i]); return o;
  });
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
```

2. **Deploy → New deployment → Web app** — *Execute as* **Me**, *Who has access* **Anyone**. URL copy karein.
3. Local ke liye `.env.local` banayein:

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfy…/exec
```

4. Vercel par: **Project → Settings → Environment Variables** me wahi key-value daalein, phir redeploy.

### Data kitna taaza rehta hai (cold cache)

Teen layer milkar ye pakka karti hain ki kabhi baasi aankda saamne na aaye:

| Layer | Setting | Kya karta hai |
|---|---|---|
| Page (ISR) | `revalidate = 60` | server-rendered HTML zyada se zyada 1 minute purana |
| `/api/rolls` | `force-dynamic` + `no-store` headers | Next, Vercel CDN aur browser — teeno me se koi cache nahi karta |
| Client auto-pull | mount + tab focus + har 5 min | page khulte hi live data khud aa jata hai |

Isliye deploy ke turant baad bhi pehla visitor build-time ka purana data nahi dekhta —
HTML turant paint hota hai aur ~1 second me live data usme aa jata hai (tab tak numbers
dhundhle rehte hain aur Refresh icon ghoomta hai).

Auto-pull par do rok lagi hain taaki Apps Script par bekaar load na pade:

- **in-flight lock** — ek waqt me ek hi request (warna mount + focus + visibilitychange
  teeno ek saath chal kar 3 call kar dete the)
- **60 second throttle** — baar-baar tab badalne par dobara fetch nahi hota

Header ka **Refresh** button in dono ko bypass karta hai — wo hamesha turant fetch karta hai.
Live chip par hover karne se pata chalta hai data kab aaya tha.


Sheet ke column names wahi rahne dein: `Inward Date`, `Roll Type`, `Article name`, `Total Fabric Roll (Mtr.)`,
`Colour`, `Fabric Cutting (Mtr.)`, `Roll Cuting Date`, `Lot No.`, `Sheet Name`. (Alag naam ho to `lib/rolls.js`
ke `COL` map me add kar dein.)

---

## Vercel par deploy

**Option A — GitHub se (recommended)**

```bash
git init && git add . && git commit -m "Roll cutting dashboard"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Phir [vercel.com/new](https://vercel.com/new) → repo import → Framework **Next.js** (apne aap detect hota hai) → Deploy.

**Option B — CLI se**

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

---

## Project ka naksha

```
app/
  layout.jsx          fonts + globals
  page.jsx            server component — data load karke Dashboard ko deta hai
  globals.css         design tokens (light + dark) aur Tailwind
  api/rolls/route.js  Apps Script ka server-side proxy (Refresh button isi ko call karta hai)
components/
  Dashboard.jsx       filters, tabs, KPIs, drawers — poora client-side app
  charts.jsx          SVG charts: combo, bar list, heat map, histogram, sparkline, meter
  ui.jsx              KPI card, month tables, drawer, status pill
lib/
  format.js           dates, numbers, CSV parser, unit labels
  rolls.js            har row ko normalise karta hai + date typo auto-correct
data/rolls.json       built-in snapshot
```

---

## Data ke baare me do zaroori baatein

0. **Inward date jaisi likhi hai, waisi hi padhi jati hai.** Har date **text** ki tarah uthai jati hai aur
   **dd/mm/yyyy** maani jati hai — na din/mahina palta hai, na saal. Jahan cutting date inward se pehle hai
   (jo ho nahi sakta) wahan Data health drawer sirf **batata** hai, badalta nahi; chahein to wahin checkbox se
   anumaan wala sudhaar ON kar sakte hain (default OFF).

1. **Month hamesha date se nikala jata hai**, sheet ke `Month (In)` column se nahi — us column me 562 rows
   galat hain. Isliye December ka number purane dashboard se alag dikhega (aur sahi hai).
2. **Inward aur cutting ki timeline alag hai.** Ek roll July me aa sakta hai aur August me cut ho sakta hai,
   isliye "Fabric IN by inward month" aur "Fabric CUT by cutting month" do alag tables hain, aur filter bar me
   *Date basis* se chunte hain ki date filter kis par lage.

3. **Ek filter, ek scope.** *Date basis* jo chunte hain (Inward ya Cutting), poore page ke KPI, unit cards,
   charts, fabric register aur drawers usi ek row-set se bante hain. Isliye har jagah
   **Inward − Cut = Balance** milta hai, utilisation kabhi 100% ke upar nahi jaata, aur teeno units ka jod
   header ke KPI se match karta hai. Doosre basis ka aankda card ke neeche chhoti line me reference ke liye
   dikhta hai — kisi total ya ratio me nahi jaata.

4. **Pending ek stock hai, flow nahi.** "Pending & speed" tab period ke *end tak* ka poora bacha hua maal
   dikhata hai (unit/fabric/status/search filters wahan bhi lagte hain), warna "Last 30d" lagane par 90+ din
   wala ageing bucket kabhi bhar hi nahi sakta. Speed/TAT numbers period ke andar ke hote hain.

Data health drawer (header me ⚠ wala button) har load par ye check khud chalata hai aur batata hai
sheet me kya theek karna hai.
