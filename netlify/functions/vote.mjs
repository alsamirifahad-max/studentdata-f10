import { json, store, normalizeId, rateLimit, findStudent, officialInfo, getContent, todayRiyadh, idHash, forStudent } from "../lib/common.mjs";

// التصويت في استطلاع: صوت واحد لكل طالب مسجّل في ملف المدرسة. لا يُحفظ رقم الهوية، بل بصمة لا يمكن عكسها.
export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }
  const id = normalizeId(b.studentId);
  if (!/^\d{10}$/.test(id)) return json({ error: "رقم الهوية يجب أن يكون 10 أرقام" }, 400);
  if (!(await rateLimit(context, "vote", 30, 10 * 60 * 1000))) return json({ error: "محاولات كثيرة. حاول بعد قليل." }, 429);
  const poll = (await getContent("polls", [])).find((p) => p.id === b.pollId);
  if (!poll) return json({ error: "الاستطلاع غير موجود" }, 404);
  if (poll.closed || poll.until < todayRiyadh()) return json({ error: "انتهى التصويت في هذا الاستطلاع." }, 400);
  const { data, row } = await findStudent(id);
  if (!row) return json({ error: "رقم الهوية غير مسجّل في بيانات المدرسة." }, 403);
  const off = officialInfo(data, row);
  if (!forStudent(poll, off.grade, off.section)) return json({ error: "هذا الاستطلاع مخصص لصف أو شعبة أخرى." }, 403);
  const opt = Number(b.option);
  if (!Number.isInteger(opt) || opt < 0 || opt >= poll.options.length) return json({ error: "اختر أحد الخيارات." }, 400);
  const votes = store("votes");
  const v = (await votes.get(poll.id, { type: "json" })) || { counts: [], voters: {}, total: 0 };
  const h = idHash("poll:" + poll.id, id);
  if (v.voters[h] != null) return json({ error: "سبق أن صوّتّ في هذا الاستطلاع.", already: true, results: poll.showResults ? poll.options.map((_, i) => v.counts[i] || 0) : null }, 409);
  v.voters[h] = opt; v.counts[opt] = (v.counts[opt] || 0) + 1; v.total = (v.total || 0) + 1;
  await votes.setJSON(poll.id, v);
  return json({ ok: true, results: poll.showResults ? poll.options.map((_, i) => v.counts[i] || 0) : null });
};

export const config = { path: "/api/vote" };
