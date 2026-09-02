import { parseDate, toNum, monthIdx, mkey, days } from './format';

/* Sheet ke column names — naam thoda badle to yahan add kar dein */
const COL = {
  sheet:   ['Sheet Name', 'sheet', 'Unit'],
  type:    ['Roll Type', 'Fabric', 'Quality'],
  article: ['Article name', 'Article No', 'Article'],
  total:   ['Total Fabric Roll (Mtr.)', 'Total Fabric Roll', 'Roll Mtr'],
  cut:     ['Fabric Cutting (Mtr.)', 'Fabric Cutting', 'Cut Mtr'],
  inD:     ['Inward Date', 'In Date', 'Date In'],
  cutD:    ['Roll Cuting Date', 'Roll Cutting Date', 'Cut Date'],
  lot:     ['Lot No.', 'Lot', 'Lot No'],
  colour:  ['Colour', 'Color'],
  mIn:     ['Month (Inward stock)', 'Month (In)'],
  mCut:    ['Month (Cut stock)', 'Month (Cut)']
};
const pick = (o, keys) => { for (const k of keys) if (o[k] !== undefined) return o[k]; return ''; };

/* Din aur mahina aapas me palat kar dobara padho — "06/05" se "05/06".
   Sirf tab mumkin hai jab pehla number 12 ya kam ho (13+ mahina ho hi nahi sakta). */
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;
function swapDayMonth(raw) {
  const m = String(raw || '').trim().match(DMY);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  let y = +m[3]; if (y < 100) y += 2000;
  if (a > 12) return null;
  return new Date(y, a - 1, b);
}

/**
 * Do shapes chalte hain:
 *  1) compact snapshot  { sheets:[], types:[], rows:[[si,ti,article,total,cut,inISO,cutISO,lot,colour,mIn,mCut]] }
 *  2) records array     [{ 'Sheet Name': …, 'Roll Type': …, … }]  ← Apps Script / CSV upload
 *
 * DATE READING (fixDates, default OFF — inward date jaisi likhi hai waisi hi)
 * Har date TEXT ki tarah padhi jati hai aur dd/mm/yyyy maani jati hai — bas itna hi.
 * Sheet me jo inward date likhi hai, dashboard wahi maanta hai: na din/mahina palatta hai,
 * na saal badalta hai. Cutting dates bhi kabhi nahi badaltin.
 *
 * GALTI PAKADNA band nahi hai — sirf SUDHAARNA band hai. Jahan cutting date inward se
 * pehle hai (jo ho nahi sakta), wahan `flag` batata hai kya lagta hai:
 *   '' | 'swap' (din/mahina ulta) | 'year' (saal ki typo) | 'reversed' (koi saaf wajah nahi)
 * Health drawer ye ginti dikhata hai taaki sheet me entry theek ki ja sake.
 *
 * `fixDates` param default OFF hai aur dashboard use kabhi ON nahi karta — numbers
 * hamesha sheet ki likhi hui dd/mm/yyyy dates se bante hain.
 *
 * cutE = EFFECTIVE cutting date. Jo thodi si rows sudhaar ke baad bhi ulti rehti hain,
 * unki cutting arrival ke din maani jati hai — isse Opening + Inward − Cutting = Closing
 * har mahine exact baithta hai. Register me asli date hi dikhti hai.
 */
export function normalise(payload, fixDates = false) {
  let src = [];
  if (!payload) return [];
  if (payload.rows && payload.sheets) {
    src = payload.rows.map((r) => ({
      sheet: payload.sheets[r[0]], type: payload.types[r[1]], article: r[2],
      total: r[3], cut: r[4], inD: r[5], cutD: r[6], lot: r[7], colour: r[8], mIn: r[9], mCut: r[10]
    }));
  } else if (Array.isArray(payload)) {
    src = payload.map((o) => ({
      sheet: String(pick(o, COL.sheet)).trim(), type: String(pick(o, COL.type)).trim(),
      article: String(pick(o, COL.article)).trim(), total: toNum(pick(o, COL.total)),
      cut: toNum(pick(o, COL.cut)), inD: pick(o, COL.inD), cutD: pick(o, COL.cutD),
      lot: String(pick(o, COL.lot)).trim(), colour: String(pick(o, COL.colour)).trim(),
      mIn: monthIdx(pick(o, COL.mIn)), mCut: monthIdx(pick(o, COL.mCut))
    }));
  }

  const cutDs = src.map((s) => parseDate(s.cutD));

  const out = [];
  src.forEach((s, i) => {
    if (!s.sheet && !s.type && !s.total) return;
    const shown = parseDate(s.inD);        // sheet me jo dikh raha hai, wahi — dd/mm/yyyy
    let inD = shown;
    const cutD = cutDs[i];

    /* Yahan sirf GALTI PAKDI jati hai, sudhaari nahi. Row NAMUMKIN hai jab roll apne
       aane se pehle hi cut ho gaya — us par sochte hain: din/mahina ulta hai, ya saal ki
       typo. Ye sirf 'flag' me likh dete hain taaki Health drawer sheet me theek karne ko
       keh sake. inD ko haath tabhi lagta hai jab fixDates ON kiya jaye (default OFF) —
       warna jo sheet me dd/mm/yyyy likha hai, dashboard bhi wahi maanta hai. */
    let flag = '', better = null;
    if (shown && cutD && cutD < shown) {
      const sw = swapDayMonth(s.inD);
      if (sw && sw <= cutD && days(sw, cutD) <= 120) { flag = 'swap'; better = sw; }
      else {
        const yr = new Date(shown.getFullYear() - 1, shown.getMonth(), shown.getDate());
        if (yr <= cutD && days(yr, cutD) <= 120) { flag = 'year'; better = yr; }
        else flag = 'reversed';                     // koi saaf wajah nahi mili
      }
    }
    if (fixDates && better) inD = better;

    const total = toNum(s.total), cut = Math.min(toNum(s.cut), total), bal = Math.max(0, total - cut);
    const cutE = cut > 0 ? (cutD ? (inD && cutD < inD ? inD : cutD) : inD) : null;
    out.push({
      i, sheet: s.sheet, type: s.type, article: s.article, lot: s.lot, colour: s.colour,
      total, cut, bal, inD, cutD, cutE, shown,
      tat: inD && cutE ? Math.max(0, days(inD, cutE)) : null,
      rawTat: inD && cutD ? days(inD, cutD) : null,
      /* flag = galti ka type — Health drawer isi se ginti dikhata hai */
      flag,
      inM: mkey(inD), cutM: mkey(cutD), cutEM: mkey(cutE), mIn: s.mIn, mCut: s.mCut,
      status: cut <= 0 ? 'pending' : cut < total ? 'partial' : 'cut'
    });
  });
  return out;
}
