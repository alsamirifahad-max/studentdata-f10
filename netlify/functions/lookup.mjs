import { finalsFor } from "../lib/finals.mjs";
import { json, store, normalizeId, rateLimit, officialInfo, getContent, content, todayRiyadh } from "../lib/common.mjs";

// يعيد بيانات طالب واحد فقط عند إدخال رقم هويته. القائمة الكاملة لا تُرسل أبدًا للمتصفح.
export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }

  const id = normalizeId(b.id);
  if (!/^\d{10}$/.test(id)) return json({ error: "رقم الهوية يجب أن يكون 10 أرقام" }, 400);

  if (!(await rateLimit(context, "lookup", 150, 10 * 60 * 1000))) {
    return json({ error: "محاولات كثيرة. حاول بعد قليل." }, 429);
  }

  const data = await store("students").get("data", { type: "json" });
  if (!data || !data.records) return json({ error: "لم تُرفع بيانات الطلاب بعد. راجع إدارة المدرسة." }, 404);

  const row = data.records[id];
  if (!row) return json({ error: "لم يتم العثور على بيانات لرقم الهوية المدخل. تأكد من الرقم أو راجع إدارة المدرسة." }, 404);

  const roles = data.roles || {};
  const fields = data.columns
    .filter((c) => c !== data.idColumn && c !== roles.email)
    .map((c) => ({ label: c, value: row[c] ?? "" }))
    .filter((f) => String(f.value).trim() !== "");

  // بيانات معتمدة لتعبئة نموذج الطلب وقفلها
  const official = officialInfo(data, row);

  const email = roles.email ? String(row[roles.email] ?? "").trim() : "";

  // الاستدعاءات الموجّهة لهذا الطالب فقط (سارية حتى تاريخ انتهائها)
  const today = todayRiyadh();
  let callsList = await getContent("calls", []);
  if (b.action === "ack" && b.callId) {
    const c = callsList.find((x) => x.id === b.callId && x.studentId === id);
    if (c && !c.seenAt) { c.seenAt = new Date().toISOString(); await content().setJSON("calls", callsList); }
  }
  const calls = callsList.filter((c) => c.studentId === id && c.expires >= today)
    .map(({ id: cid, text, place, when, from, createdAt, seenAt }) => ({ id: cid, text, place, when, from, createdAt, seen: !!seenAt }));

  const finals = await finalsFor(id, official);
  return json({ ok: true, id, fields, email, official, calls, finals, updatedAt: data.updatedAt });
};

export const config = { path: "/api/lookup" };
