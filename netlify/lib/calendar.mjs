import { clean, ISO_DAY, addDays } from "./common.mjs";

// التقويم الدراسي: الفصول (بداية الأحد الأول ونهاية آخر يوم دراسي) والإجازات.
// يوم العودة يُحسب تلقائيًا: أول يوم من الأحد إلى الخميس بعد آخر يوم في الإجازة.
const dow = (iso) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = الأحد
export function backDay(to) {
  let d = addDays(to, 1);
  while (dow(d) === 5 || dow(d) === 6) d = addDays(d, 1);
  return d;
}

export function cleanCalendar(c) {
  const terms = Array.isArray(c?.terms) ? c.terms : [];
  const breaks = Array.isArray(c?.breaks) ? c.breaks : [];
  if (!terms.length || terms.length > 3) return { error: "أضف فصلًا دراسيًا واحدًا على الأقل (3 كحد أقصى)." };
  if (breaks.length > 25) return { error: "عدد الإجازات كبير جدًا." };
  const out = { terms: [], breaks: [] };
  for (const [i, t] of terms.entries()) {
    const x = { name: clean(t?.name, 40) || `الفصل ${i + 1}`, start: String(t?.start || ""), end: String(t?.end || "") };
    if (!ISO_DAY.test(x.start) || !ISO_DAY.test(x.end)) return { error: `حدد بداية ونهاية «${x.name}».` };
    if (dow(x.start) !== 0) return { error: `بداية «${x.name}» يجب أن تكون يوم أحد.` };
    if (x.end < x.start) return { error: `نهاية «${x.name}» قبل بدايته.` };
    if (out.terms.length && x.start <= out.terms[out.terms.length - 1].end) return { error: "الفصول يجب أن تكون مرتبة ولا تتداخل." };
    out.terms.push(x);
  }
  for (const b of breaks) {
    const x = { name: clean(b?.name, 60), from: String(b?.from || ""), to: String(b?.to || "") };
    if (!x.name) return { error: "اكتب اسم كل إجازة." };
    if (!ISO_DAY.test(x.from) || !ISO_DAY.test(x.to)) return { error: `حدد تاريخ بداية ونهاية «${x.name}».` };
    if (x.to < x.from) return { error: `نهاية «${x.name}» قبل بدايتها.` };
    x.back = backDay(x.to);
    const note = clean(b?.startNote, 60); if (note) x.startNote = note;
    if (ISO_DAY.test(b?.shownFrom || "")) x.shownFrom = b.shownFrom;
    out.breaks.push(x);
  }
  out.breaks.sort((a, b) => (a.from < b.from ? -1 : 1));
  return { calendar: out };
}
