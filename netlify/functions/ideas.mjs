import { json, clean, normalizeId, rateLimit, findStudent, officialInfo, getContent, content, idHash } from "../lib/common.mjs";
import { newId } from "../lib/auth.mjs";
import { PUBLIC_IDEA } from "../lib/admin-extra.mjs";

// صندوق المبادرات: يقترح الطالب فكرة (تراجعها الإدارة قبل نشرها)، ويصوّت الطلاب على المنشورة.
// لا يظهر اسم صاحب المبادرة للطلاب؛ يظهر صفه فقط.
const pub = (x) => ({ id: x.id, title: x.title, body: x.body, grade: x.grade, status: x.status, reply: x.reply || "", votes: x.votes || 0, createdAt: x.createdAt });

export default async (req, context) => {
  if (req.method === "GET") {
    const list = (await getContent("ideas", [])).filter((x) => PUBLIC_IDEA.includes(x.status))
      .sort((a, b) => (b.status === "نُفذت") - (a.status === "نُفذت") || (b.votes || 0) - (a.votes || 0)).slice(0, 50).map(pub);
    return new Response(JSON.stringify({ ok: true, items: list }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=30" } });
  }
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }
  const id = normalizeId(b.studentId);
  if (!/^\d{10}$/.test(id)) return json({ error: "رقم الهوية يجب أن يكون 10 أرقام" }, 400);
  const { data, row } = await findStudent(id);
  if (!row) return json({ error: "رقم الهوية غير مسجّل في بيانات المدرسة." }, 403);
  const list = await getContent("ideas", []);

  if (b.action === "submit") {
    if (!(await rateLimit(context, "idea", 3, 60 * 60 * 1000))) return json({ error: "أرسلت عدة مبادرات خلال وقت قصير. حاول لاحقًا." }, 429);
    const title = clean(b.title, 100), body = clean(b.body, 600);
    if (title.length < 5) return json({ error: "اكتب عنوانًا واضحًا لمبادرتك." }, 400);
    if (body.length < 15) return json({ error: "اشرح مبادرتك في سطر أو سطرين على الأقل." }, 400);
    if (list.length >= 300) return json({ error: "الصندوق ممتلئ حاليًا. حاول لاحقًا." }, 400);
    const off = officialInfo(data, row);
    list.push({ id: newId(), title, body, studentId: id, name: off.name, grade: off.grade, section: off.section, status: "بانتظار المراجعة", votes: 0, voters: {}, createdAt: new Date().toISOString() });
    await content().setJSON("ideas", list);
    return json({ ok: true });
  }
  if (b.action === "vote") {
    if (!(await rateLimit(context, "idea-vote", 40, 10 * 60 * 1000))) return json({ error: "محاولات كثيرة. حاول بعد قليل." }, 429);
    const it = list.find((x) => x.id === b.id && x.status === "منشورة للتصويت");
    if (!it) return json({ error: "التصويت غير متاح لهذه المبادرة." }, 400);
    const h = idHash("idea:" + it.id, id);
    it.voters = it.voters || {};
    if (it.voters[h]) return json({ error: "سبق أن دعمت هذه المبادرة.", already: true, votes: it.votes || 0 }, 409);
    it.voters[h] = 1; it.votes = (it.votes || 0) + 1;
    await content().setJSON("ideas", list);
    return json({ ok: true, votes: it.votes });
  }
  return json({ error: "إجراء غير معروف" }, 400);
};

export const config = { path: "/api/ideas" };
