import { json, store, clean, normalizeId, normalizeTicket, findComplaint, publicView, rateLimit, CLOSED } from "../lib/common.mjs";

// متابعة الاستفسار: لا يُعرض الاستفسار إلا إذا تطابق رقم الطلب مع رقم هوية صاحبها.
// الطالب لا يستطيع أبدًا رؤية شكاوى غيره، ولا قائمة الشكاوى.
const NOT_FOUND = "لا يوجد استفسار بهذا الرقم مرتبط برقم الهوية المدخل. تأكد من رقم الطلب ورقم الهوية.";

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }

  const ticket = normalizeTicket(b.ticket);
  const studentId = normalizeId(b.studentId);
  if (!ticket) return json({ error: "اكتب رقم الطلب كما ظهر لك عند الإرسال، مثل BSH-7Q2K9A" }, 400);
  if (!/^\d{10}$/.test(studentId)) return json({ error: "رقم الهوية يجب أن يكون 10 أرقام" }, 400);

  if (!(await rateLimit(context, "track", 20, 10 * 60 * 1000))) {
    return json({ error: "محاولات كثيرة. حاول بعد 10 دقائق." }, 429);
  }

  const { key, item } = await findComplaint(ticket);
  // نفس الرسالة سواء كان الرقم غير موجود أو يخص طالبًا آخر، حتى لا يُستدل على وجود شكاوى الآخرين
  if (!item || item.studentId !== studentId) {
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: NOT_FOUND }, 404);
  }

  if (b.action === "reply") {
    if (CLOSED.includes(item.status)) return json({ error: "هذا الاستفسار مغلق. أرسل استفسارًا جديدًا إذا احتجت مساعدة أخرى." }, 400);
    const text = clean(b.text, 1000);
    if (text.length < 2) return json({ error: "اكتب ردك أولًا." }, 400);
    const msgs = item.messages || [];
    if (msgs.filter((m) => m.from === "student").length >= 20) return json({ error: "وصلت إلى الحد الأقصى للردود في هذا الاستفسار." }, 400);
    const now = new Date().toISOString();
    msgs.push({ from: "student", text, at: now });
    item.messages = msgs;
    item.unreadByAdmin = true;
    if (item.status === "تم الرد") item.status = "قيد المعالجة";
    item.updatedAt = now;
    await store("complaints").setJSON(key, item);
  }

  return json({ ok: true, complaint: publicView(item) });
};

export const config = { path: "/api/track" };
