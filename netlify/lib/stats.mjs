import { CLOSED, TYPES, GRADES, todayRiyadh, addDays } from "./common.mjs";

// مؤشرات الاستفسارات لشهر معيّن (بتوقيت مكة)، محسوبة على الاستفسارات التي يحق للمستخدم رؤيتها فقط
const monthOf = (iso) => todayRiyadh(new Date(iso)).slice(0, 7);
const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`; };
const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 36e5;
const firstReply = (i) => i.firstReplyAt || ((i.messages || []).find((m) => m.from === "admin") || {}).at || null;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function computeStats(all, month, me) {
  const inMonth = all.filter((i) => monthOf(i.createdAt) === month);
  const prev = all.filter((i) => monthOf(i.createdAt) === prevMonth(month));
  const respH = inMonth.map((i) => (firstReply(i) ? hoursBetween(i.createdAt, firstReply(i)) : null)).filter((v) => v != null && v >= 0);
  const resolveH = inMonth.filter((i) => i.resolvedAt).map((i) => hoursBetween(i.createdAt, i.resolvedAt)).filter((v) => v >= 0);
  const rated = inMonth.filter((i) => i.rating);
  const allRated = all.filter((i) => i.rating);

  const count = (arr, f) => { const m = {}; for (const i of arr) { const k = f(i); if (k) m[k] = (m[k] || 0) + 1; } return m; };
  const byType = count(inMonth, (i) => i.type);
  const byGrade = count(inMonth, (i) => i.grade);
  const bySection = Object.entries(count(inMonth, (i) => i.section)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([section, n]) => ({ section, n }));
  const byStatus = count(inMonth, (i) => i.status);
  const tags = {};
  for (const i of rated) for (const t of i.rating.tags || []) tags[t] = (tags[t] || 0) + 1;
  const stars = [1, 2, 3, 4, 5].map((s) => rated.filter((i) => i.rating.stars === s).length);
  const byResponder = {};
  for (const i of inMonth) for (const m of i.messages || []) if (m.from === "admin") { const k = m.role || "إدارة المدرسة"; byResponder[k] = (byResponder[k] || 0) + 1; }

  // آخر 8 أسابيع: متوسط زمن أول رد (بالساعات) حسب أسبوع الإرسال
  const today = todayRiyadh();
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const end = addDays(today, -7 * w), start = addDays(end, -6);
    const xs = all.filter((i) => { const d = todayRiyadh(new Date(i.createdAt)); return d >= start && d <= end; });
    const hs = xs.map((i) => (firstReply(i) ? hoursBetween(i.createdAt, firstReply(i)) : null)).filter((v) => v != null && v >= 0);
    weeks.push({ start, end, count: xs.length, avgResponseH: round1(avg(hs)) });
  }

  // تحتاج انتباهك: جديد، أو فيه رد من الطالب لم يُقرأ، أو محوّل إليك ولم يُغلق
  const pending = all.filter((i) => !CLOSED.includes(i.status) && (i.status === "جديد" || i.unreadByAdmin || (me && i.assignedTo === me.id)));
  const attention = pending
    .sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1)).slice(0, 8)
    .map((i) => ({ key: i.key, ticket: i.ticket, name: i.name, grade: i.grade, section: i.section, type: i.type, status: i.status, updatedAt: i.updatedAt,
      reason: me && i.assignedTo === me.id && i.assignedBy !== me.name ? "محوّل إليك" : (i.messages || []).some((m) => m.from === "student") && i.unreadByAdmin ? "ردّ جديد من الطالب" : "جديد" }));
  const waiting = all.filter((i) => i.status === "جديد" || (i.unreadByAdmin && !CLOSED.includes(i.status)));
  const oldestWaiting = waiting.reduce((m, i) => (!m || i.updatedAt < m ? i.updatedAt : m), null);

  return {
    month, generatedAt: new Date().toISOString(),
    total: inMonth.length, prevTotal: prev.length,
    change: prev.length ? Math.round(((inMonth.length - prev.length) / prev.length) * 100) : null,
    waiting: waiting.length, oldestWaiting,
    resolved: inMonth.filter((i) => CLOSED.includes(i.status)).length,
    avgResponseH: round1(avg(respH)), prevAvgResponseH: round1(avg(prev.map((i) => (firstReply(i) ? hoursBetween(i.createdAt, firstReply(i)) : null)).filter((v) => v != null && v >= 0))),
    avgResolveH: round1(avg(resolveH)),
    rating: { avg: round1(avg(rated.map((i) => i.rating.stars))), count: rated.length, stars, tags, allTimeAvg: round1(avg(allRated.map((i) => i.rating.stars))), allTimeCount: allRated.length },
    byType: TYPES.map((t) => ({ type: t, n: byType[t] || 0 })).concat(Object.keys(byType).filter((t) => !TYPES.includes(t)).map((t) => ({ type: t, n: byType[t] }))).sort((a, b) => b.n - a.n),
    byGrade: GRADES.map((g) => ({ grade: g, n: byGrade[g] || 0 })),
    bySection, byStatus, byResponder, weeks, attention,
    comments: rated.filter((i) => i.rating.note).slice(-10).map((i) => ({ stars: i.rating.stars, note: i.rating.note, type: i.type })),
  };
}
