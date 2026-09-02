# Roll Cutting Control Room — kaam karne ke niyam

Ye dashboard factory ke logon ke liye hai, developers ke liye nahi. Do cheezein har badlav
me sabse upar rehti hain: **informative** (har chart/card apne aap me kuch batata ho) aur
**responsive** (mobile par bhi utna hi kaam ka ho jitna desktop par).

Neeche jo likha hai wo pehle se lage hue faisle hain — inhe todne se pehle poochhein.

---

## 1. Data ke pakke niyam

- **Inward date jaisi likhi hai, waisi hi.** Har date **text** ki tarah padhi jati hai aur
  **dd/mm/yyyy** maani jati hai. Na din/mahina palatna, na saal badalna. `normalise()` galti
  **pehchanta** hai (`flag`: `swap` | `year` | `reversed`) taaki Data health drawer ginti dikha
  sake — par **sudhaarta nahi**. Galti sheet me theek hoti hai, dashboard me nahi.
- **Mahina hamesha DATE se nikalta hai**, sheet ke `Month (In)` / `Month (Cut stock)` text
  column se kabhi nahi. Wo columns formula nahi hain aur purane pad jate hain.
- **Ek hi hisaab poore page par:** `Opening + Inward − Cutting = Bacha stock`. Koi naya card
  ya table isse alag jawab de to wo bug hai.
- **Flow vs stock alag hain.** Inward/Cutting *period ke andar* ginte hain (`inFlowR`), pending
  stock *period ke end tak* (`<= rEnd`). Pending ek **stock** hai — "Last 30d" lagane par bhi
  90+ din wala ageing bucket bharna chahiye.
- Naye numbers add karein to unhe **live sheet ke against Node se cross-check karein**, screen
  dekh kar nahi. (`lib/rolls.js` import karke chhoti script — is repo me kai baar aisa kiya hai.)

## 2. Chart aur card ka standard

Har chart me ye teen cheezein honi chahiye, warna wo sirf sajावट hai:

- **Data labels** — value chart par likhi ho. Jagah kam ho to sabse badi values par, do labels
  ke beech kam se kam ~34px faasla (`TrendChart` me `labelSet` isi tarah kaam karta hai).
- **X-axis labels** — jitne bina takraye aa sakein (`tickEvery`, ~46px per label). Pehla/aakhri
  label andar ki taraf anchor ho taaki kate nahi.
- **Tooltip me meters + pcs dono.**

Aur:

- **Har chart apne scale par** jab tak comparison hi maqsad na ho. Teen units ko ek scale par
  daalne se chhoti units ki line chapti ho jati thi aur kuch samajh nahi aata tha — isliye unit
  cards ab **aakhri 5 mahine, apne scale par, bars me** dikhate hain.
- **Lambi history ko window me kaatein** (jaise 5 mahine) — poori timeline chhoti jagah me
  bekaar ho jati hai.
- **KPI cards ka dhaancha ek jaisa** rakhein: label (2 line reserve) → bada number → meta row
  (`.kpi-meta`, fixed height) → footer. Isse har card ka number ek hi height par baithta hai.
  **Card me beech me khali jagah nahi bachni chahiye** — content kam ho to ek kaam ki line
  jodein, ya `margin-top:auto` hata dein.
- Side-by-side cards ki height barabar rakhein — lambi table ko `tableHeight` prop se cap
  karke andar scroll karayein (heading `.tbl th` pehle se sticky hai).

## 3. Responsive — har badlav ke saath

Breakpoint **`760px`**. Sab mobile rules `@media (max-width: 760px)` ke andar hain taaki
desktop par ek pixel na hile.

- **Page kabhi horizontally scroll na kare.** Table/chart apne container ke andar scroll karein
  (`overflow-x: auto`), page nahi. Har tab par check karein.
- Header **ek hi row** me. Brand block `flex:1; min-width:0` leta hai aur naam ellipsis hota hai,
  isliye right ke chips kabhi kat kar bahar nahi jate.
- Filters mobile par **band** rehte hain (`.filter-toggle` button + lage hue filters ki ginti).
  Summary line hamesha dikhti hai.
- **KPI cards mobile par 2 per row** (`.kpi-grid`). Sparkline chhupa dete hain, delta pill apni
  line par jata hai — tabhi do cards ki rows aapas me milti hain.
- Table me cell ke andar wali mini-bars mobile par chhupi rehti hain — number zyada kaam ka hai.
- Card subtitles 2 line par clamp.
- Drawer poori chaudai (`100vw`).

## 4. Overlay / dropdown — zaroori baat

`.card` par `overflow:hidden` hai **aur** `.rise` animation (`fill-mode: both`) use ek
**stacking context** bana deti hai. Isliye card ke *andar* koi absolute dropdown daalne par:

- uska `z-index` card ke andar hi dab jata hai (bahar ka backdrop uske upar aa jata hai — click
  kaam karna band ho jata hai), aur
- `overflow:hidden` use kaat deta hai.

**Isliye har popover/dropdown `createPortal` se seedha `<body>` me jayega**, position button se
`getBoundingClientRect()` naap kar, aur scroll/resize par dobara naapi jayegi. Roll-type menu
isi tarah bana hai — usi pattern ko follow karein.

## 5. Data freshness (cold cache)

- `/api/rolls` par `force-dynamic` + `no-store` headers (Next, Vercel CDN, browser — teeno).
- Page ISR par hai (`revalidate = 60`) taaki pehla paint turant ho, aur client mount hote hi
  live data khud kheench leta hai — **plus** tab focus par aur har 5 minute.
- Auto-pull par **in-flight lock** aur **60s throttle** lage hain (warna mount + focus +
  visibilitychange milkar 3 call kar dete the). Refresh button dono ko bypass karta hai.
- Ye system chhedein to page load par API calls dobara ginein — **1 hona chahiye**.

## 6. Kaam khatam karne se pehle

1. `npm run build` pass ho.
2. Browser me **dono** widths par dekhein — **1440px aur 375px**.
3. Jo number badla hai use **live sheet se verify karein** (Node script), screenshot se nahi.
4. Page side-scroll na kare, koi label kate nahi.

## 7. Bhasha

UI text aur code comments **Hinglish** me hain (Roman script). Wahi tone rakhein — factory ke
log yahi padhte hain. Comment me *kya* nahi, **kyun** likhein.

---

## Project ka naksha

```
app/
  page.jsx            server component — ISR 60s, snapshot fallback
  api/rolls/route.js  Apps Script proxy, hamesha no-store
components/
  Dashboard.jsx       poora client app — filters, tabs, KPI, drawers
  charts.jsx          hand-rolled SVG: TrendChart, ComboChart, BarList, HeatMap, Histogram…
  ui.jsx              KpiCard, MonthTable, Drawer, StatusPill
lib/
  format.js           dates, numbers, CSV/JSON payload parsing
  rolls.js            row normalise + galti detection (sudhaar nahi)
```
