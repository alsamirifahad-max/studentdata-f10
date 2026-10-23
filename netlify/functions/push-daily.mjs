import { getContent, store, todayRiyadh, addDays } from "../lib/common.mjs";
import { notify, toAudience } from "../lib/push.mjs";

// تذكيرات يومية الساعة 6:30 صباحًا بتوقيت مكة: اختبارات الغد، وإعلانات تبدأ اليوم، ومواعيد تسجيل تنتهي غدًا.
export async function runDaily() {
  const today = todayRiyadh(), tomorrow = addDays(today, 1);
  let sent = 0;
  for (const e of (await getContent("exams", [])).filter((x) => x.date === tomorrow)) {
    sent += await notify(toAudience({ grade: e.grade, sections: e.section ? [e.section] : [] }),
      { title: "تذكير: " + e.kind + " غدًا", body: e.subject + (e.period ? " – الحصة " + e.period : "") + (e.note ? " · " + e.note : ""), url: "/#myschedule", tag: "exam-" + e.id });
  }
  const anns = (await store("announcements").get("list", { type: "json" })) || [];
  for (const a of anns.filter((x) => !x.hidden && x.notify !== false && x.from === today && x.createdAt && x.createdAt.slice(0, 10) < today)) {
    sent += await notify(toAudience(a), { title: a.title, body: a.body || "إعلان جديد من المدرسة", url: "/#news", tag: "ann-" + a.id });
  }
  for (const e of (await getContent("events", [])).filter((x) => x.deadline === tomorrow)) {
    sent += await notify(toAudience({ grade: e.grade }), { title: "آخر يوم للتسجيل غدًا", body: e.title, url: "/#events", tag: "ev-" + e.id });
  }
  return sent;
}

export default async () => { await runDaily(); };
export const config = { schedule: "30 3 * * *" };
