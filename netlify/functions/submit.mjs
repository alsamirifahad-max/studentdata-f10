import { json, store, clean, normalizeId, rateLimit, findStudent, newTicket, officialInfo, SECTIONS, GRADES, TYPES } from "../lib/common.mjs";

// يستقبل بلاغ الطالب ويخزّنه في مخزن خاص لا يُقرأ إلا عبر لوحة المسؤول.
// لا توجد أي واجهة تتيح للطلاب قراءة البلاغات.
export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }

  // حقل مخفي لاصطياد البرامج الآلية
  if (b.website) return json({ ok: true, ticket: "BSH-000000" });

  const rec = {
    name: clean(b.name, 80),
    studentId: normalizeId(b.studentId),
    grade: clean(b.grade, 40),
    section: clean(b.section, 4),
    type: clean(b.type, 60),
    contact: clean(b.contact, 100),
    description: clean(b.description, 2000),
  };

  // التحقق من أن الطالب مسجّل في ملف المدرسة: لا يُقبل أي رقم هوية أو اسم من خارج الملف
  if (!/^\d{10}$/.test(rec.studentId)) return json({ error: "رقم الهوية يجب أن يكون 10 أرقام" }, 400);
  if (!(await rateLimit(context, "submit", 8, 10 * 60 * 1000))) {
    return json({ error: "تم إرسال عدة طلبات خلال وقت قصير. حاول بعد 10 دقائق." }, 429);
  }
  const { data, row } = await findStudent(rec.studentId);
  if (!data) return json({ error: "استقبال الطلبات غير مفعّل حاليًا. راجع إدارة المدرسة." }, 503);
  if (!row) return json({ error: "رقم الهوية غير مسجّل في بيانات المدرسة. تأكد من الرقم أو راجع إدارة المدرسة.", notRegistered: true }, 403);

  // الاسم والصف والشعبة تُؤخذ من ملف المدرسة متى توفرت، ولا يُعتمد ما يرسله المتصفح
  const off = officialInfo(data, row);
  if (off.name) rec.name = clean(off.name, 80);
  if (off.grade) rec.grade = off.grade;
  if (off.section) rec.section = off.section;
  rec.verified = true;

  const errors = [];
  if (rec.name.length < 3) errors.push("اكتب اسم الطالب");
  if (!GRADES.includes(rec.grade)) errors.push("اختر الصف الدراسي");
  if (!SECTIONS.includes(rec.section)) errors.push("اختر الشعبة");
  if (!TYPES.includes(rec.type)) errors.push("اختر نوع المشكلة");
  if (rec.contact.length < 3) errors.push("اكتب وسيلة تواصل");
  if (rec.description.length < 10) errors.push("اكتب وصفًا أوضح للمشكلة (10 أحرف على الأقل)");
  if (b.confirm !== true) errors.push("يجب تأكيد عدم كتابة كلمة مرور أو رمز تحقق");
  if (errors.length) return json({ error: errors.join("، ") }, 400);


  const complaints = store("complaints");
  let ticket = newTicket();
  while (await complaints.get(ticket)) ticket = newTicket();
  const createdAt = new Date().toISOString();

  // المفتاح هو رقم الطلب نفسه حتى يستطيع الطالب متابعته لاحقًا
  await complaints.setJSON(ticket, {
    ...rec,
    ticket,
    status: "جديد",
    adminNote: "",
    messages: [],
    unreadByAdmin: true,
    createdAt,
    updatedAt: createdAt,
  });

  return json({ ok: true, ticket });
};

export const config = { path: "/api/submit" };
