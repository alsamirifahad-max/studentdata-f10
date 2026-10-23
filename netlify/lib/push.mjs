import crypto from "node:crypto";
import webpush from "web-push";
import { store, forStudent, idHash } from "./common.mjs";

// الإشعارات على الجوال (Web Push). مفاتيح VAPID تُنشأ تلقائيًا أول مرة وتُحفظ في التخزين الخاص بالموقع،
// ويمكن بدلًا من ذلك ضبطها من إعدادات Netlify: VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY.
const subs = () => store("push");
let cached = null;
export async function vapid() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const cfg = store("config");
    cached = await cfg.get("vapid", { type: "json" });
    if (!cached) { cached = webpush.generateVAPIDKeys(); await cfg.setJSON("vapid", cached); }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || (process.env.URL || "https://studentdata-f10.netlify.app"), cached.publicKey, cached.privateKey);
  return cached;
}

export const subKey = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 40);
export const studentKey = (studentId) => idHash("push", studentId);

/** يحفظ اشتراك جهاز الطالب (مرتبطًا ببصمة هويته وصفه وشعبته فقط) */
export async function saveSub(sub, studentId, info) {
  const key = subKey(sub.endpoint);
  const old = await subs().get(key, { type: "json" });
  await subs().setJSON(key, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, sid: studentKey(studentId),
    grade: info.grade || "", section: info.section || "", createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
}
export async function removeSub(endpoint) { await subs().delete(subKey(endpoint)); }

export async function allSubs() {
  const { blobs } = await subs().list();
  return (await Promise.all(blobs.map(async ({ key }) => ({ key, ...(await subs().get(key, { type: "json" })) })))).filter((s) => s.endpoint);
}

/** يرسل إشعارًا لكل اشتراك يحقق الشرط، ويحذف الاشتراكات المنتهية. يعيد عدد المرسل إليهم */
export async function notify(filter, payload) {
  const list = (await allSubs()).filter(filter);
  if (!list.length) return 0;
  await vapid();
  const body = JSON.stringify({ icon: "/assets/icons/icon-192.png", badge: "/assets/icons/icon-192.png", ...payload });
  let sent = 0;
  for (let i = 0; i < list.length; i += 40) {
    await Promise.all(list.slice(i, i + 40).map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 24 * 3600, timeout: 8000 }); sent++; }
      catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await subs().delete(s.key); }
    }));
  }
  return sent;
}

// أهداف جاهزة
export const toAudience = (x) => (s) => forStudent(x, s.grade, s.section);
export const toStudent = (studentId) => { const h = studentKey(studentId); return (s) => s.sid === h; };

/** تشغيل الإرسال في الخلفية دون تأخير رد المسؤول (إن دعمت المنصة ذلك) */
export function background(context, promise) {
  const p = Promise.resolve(promise).catch(() => {});
  if (context && typeof context.waitUntil === "function") context.waitUntil(p);
  return p;
}
