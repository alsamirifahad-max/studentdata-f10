import { json, normalizeTicket, findComplaint, lastAdminAt, rateLimit } from "../lib/common.mjs";

// تنبيه الطالب بوجود رد جديد على استفساراته المحفوظة في جهازه.
// يعيد فقط الحالة ووقت آخر رد، دون أي بيانات شخصية أو نص، ولا يكفي لعرض الاستفسار (يلزم رقم الهوية لذلك).
export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }
  const tickets = [...new Set((Array.isArray(b.tickets) ? b.tickets : []).map(normalizeTicket).filter(Boolean))].slice(0, 5);
  if (!tickets.length) return json({ ok: true, items: [] });
  if (!(await rateLimit(context, "peek", 30, 10 * 60 * 1000))) return json({ ok: true, items: [] });
  const items = [];
  for (const t of tickets) {
    const { item } = await findComplaint(t);
    if (item) items.push({ ticket: item.ticket, status: item.status, lastReplyAt: lastAdminAt(item) });
  }
  return json({ ok: true, items });
};

export const config = { path: "/api/peek" };
