import { json, getContent, todayRiyadh, addDays, GRADES, SECTIONS } from "../lib/common.mjs";

// جدول الشعبة واختباراتها القادمة. الجداول ليست بيانات شخصية، لذلك تُعرض بالصف والشعبة دون رقم الهوية.
export default async (req) => {
  const u = new URL(req.url);
  const section = String(u.searchParams.get("section") || "");
  const grade = String(u.searchParams.get("grade") || "");
  if (!SECTIONS.includes(section)) return json({ error: "اختر الشعبة" }, 400);
  const tt = await getContent("timetable", { periods: [], sections: {} });
  const today = todayRiyadh(), until = addDays(today, 60);
  const exams = (await getContent("exams", []))
    .filter((e) => e.date >= today && e.date <= until && (e.section ? e.section === section : GRADES.includes(grade) && e.grade === grade))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.period || 0) - (b.period || 0)))
    .slice(0, 30)
    .map(({ id, subject, kind, date, period, note }) => ({ id, subject, kind, date, period, note }));
  // التوقيت الذكي: أوقات رمضان أو الاختبارات حسب الفترات التي حددها المسؤول
  const range = (tt.ranges || []).find((r) => today >= r.from && today <= r.to && (tt.modes?.[r.mode] || tt.modesG1?.[r.mode]));
  // أوقات الحصص للصف الأول الثانوي قد تختلف عن الثاني والثالث (الشعب 1–8 للأول)
  const g1 = grade === GRADES[0] || (!grade && +section < 10);
  const useG1 = g1 && Array.isArray(tt.periodsG1) && tt.periodsG1.length;
  const base = (useG1 ? tt.periodsG1 : tt.periods) || [];
  const modes = useG1 && tt.modesG1 ? tt.modesG1 : tt.modes || {};
  const alt = range && modes[range.mode];
  const periods = alt ? base.map((p, i) => ({ ...p, ...(alt[i]?.start ? alt[i] : {}) })) : base;
  return new Response(JSON.stringify({ ok: true, section, grade, periods, timing: range ? { mode: range.mode, label: range.label || (range.mode === "ramadan" ? "توقيت رمضان" : "توقيت الاختبارات") } : null, grid: tt.sections?.[section] || null, exams, updatedAt: tt.updatedAt || null }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
  });
};

export const config = { path: "/api/schedule" };
