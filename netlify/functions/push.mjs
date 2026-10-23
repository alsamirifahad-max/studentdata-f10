import { json, normalizeId, rateLimit, findStudent, officialInfo } from "../lib/common.mjs";
import { vapid, saveSub, removeSub } from "../lib/push.mjs";

// اشتراك جهاز الطالب في الإشعارات. يُتحقق من أن الطالب مسجّل في ملف المدرسة،
// ويُحفظ مع الاشتراك صفه وشعبته وبصمة غير قابلة للعكس من رقم هويته (لا يُحفظ الرقم نفسه).
export default async (req, context) => {
  if (req.method === "GET") return json({ ok: true, publicKey: (await vapid()).publicKey });
  if (req.method !== "POST") return json({ error: "الطريقة غير مسموحة" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "بيانات غير صالحة" }, 400); }
  const sub = b.subscription;
  if (!sub || typeof sub.endpoint !== "string" || !/^https?:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000 || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "اشتراك غير صالح" }, 400);
  if (!(await rateLimit(context, "push", 20, 10 * 60 * 1000))) return json({ error: "محاولات كثيرة. حاول بعد قليل." }, 429);
  if (b.action === "unsubscribe") { await removeSub(sub.endpoint); return json({ ok: true }); }
  const id = normalizeId(b.studentId);
  if (!/^\d{10}$/.test(id)) return json({ error: "رقم الهوية يجب أن يكون 10 أرقام" }, 400);
  const { data, row } = await findStudent(id);
  if (!row) return json({ error: "رقم الهوية غير مسجّل في بيانات المدرسة." }, 403);
  await saveSub(sub, id, officialInfo(data, row));
  return json({ ok: true });
};

export const config = { path: "/api/push" };
