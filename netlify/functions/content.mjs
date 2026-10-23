import { getContent, store, todayRiyadh, addDays, DEFAULT_FAQ, DEFAULT_FILES, FAQ_CATS } from "../lib/common.mjs";
import { fileUrl } from "../lib/admin-extra.mjs";

// محتوى عام للصفحة الرئيسية. لا يحتوي أي بيانات شخصية سوى أسماء لوحة الشرف التي وافقت المدرسة على نشرها.
export default async () => {
  const today = todayRiyadh();
  const faq = ((await getContent("faq")) ?? DEFAULT_FAQ).filter((f) => !f.hidden).map(({ id, cat, q, a, link }) => ({ id, cat, q, a, link }));
  const tt = await getContent("timetable", { periods: [], sections: {} });
  const calendar = await getContent("calendar");
  const events = (await getContent("events", []))
    .filter((e) => (e.deadline && e.deadline >= today) || (e.end || e.date) >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 40)
    .map(({ id, title, kind, date, end, deadline, link, grade, note }) => ({ id, title, kind, date, end, deadline, link, grade, note }));
  const honor = (await getContent("honor", [])).filter((h) => !h.hidden && h.consent)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 60)
    .map(({ id, name, grade, section, title, cat, period }) => ({ id, name, grade, section, title, cat, period }));
  const votes = store("votes");
  const polls = await Promise.all((await getContent("polls", []))
    .filter((p) => !p.closed && p.until >= today || (p.showResults && p.until >= addDays(today, -14)))
    .map(async (p) => {
      const open = !p.closed && p.until >= today;
      const v = p.showResults ? (await votes.get(p.id, { type: "json" })) || { counts: [] } : null;
      return { id: p.id, q: p.q, options: p.options, grade: p.grade, sections: p.sections || [], until: p.until, open,
        results: v ? p.options.map((_, i) => v.counts[i] || 0) : null };
    }));
  const videos = (await getContent("videos", [])).filter((v) => !v.hidden).map(({ id, title, yt, cat }) => ({ id, title, yt, cat }));
  const files = ((await getContent("files")) ?? DEFAULT_FILES).map((f) => ({ id: f.id, title: f.title, section: f.section, cat: f.cat || "", type: f.type, size: f.size, url: fileUrl(f) }));
  const guide = files.find((f) => f.section === "guide");
  // ملخص عام للاختبارات النهائية (التواريخ فقط، بلا بيانات شخصية) لتهيئة واجهة «موسم الاختبارات»
  const fin = await getContent("finals", null);
  const finDates = fin && fin.visible ? (fin.schedule || []).map((r) => r.date).sort() : [];
  const finals = finDates.length ? { title: fin.title, from: finDates[0], to: finDates[finDates.length - 1] } : null;
  return new Response(JSON.stringify({
    ok: true, faq, faqCats: FAQ_CATS,
    calendar: calendar ? { terms: calendar.terms, breaks: calendar.breaks } : null,
    periods: tt.periods || [],
    periodsG1: tt.periodsG1 || null,
    sectionsWithTimetable: Object.keys(tt.sections || {}),
    events, honor, polls, videos,
    files: files.filter((f) => f.section !== "guide"),
    guideImage: guide ? guide.url : null,
    finals,
  }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
};

export const config = { path: "/api/content" };
