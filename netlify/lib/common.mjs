import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

export const SECTIONS = ["1","2","3","4","5","6","7","8","11","12","13","14","15","16","17","18","21","22","23","24","25","26","27","28"];
export const GRADES = ["الأول الثانوي", "الثاني الثانوي", "الثالث الثانوي"];
export const TYPES = [
  "تعذر الدخول إلى منصة مدرستي",
  "نسيان كلمة المرور",
  "مشكلة في حساب Microsoft",
  "تعذر الدخول إلى تيمز أو حضور الحصة",
  "استفسار عام",
  "شكوى أو ملاحظة",
  "مشكلة أخرى",
];
export const STATUSES = ["جديد", "قيد المعالجة", "تم الرد", "تم الحل", "مغلق"];
/** حالات لا يستطيع الطالب بعدها إضافة رد */
export const CLOSED = ["تم الحل", "مغلق"];

/** رقم طلب عشوائي يصعب تخمينه: BSH- + 6 أحرف/أرقام (بدون أحرف ملتبسة) */
export function newTicket() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let t = "";
  for (const b of bytes) t += A[b % A.length];
  return "BSH-" + t;
}

/** يوحّد صيغة رقم الطلب كما يكتبه الطالب (مسافات، أحرف صغيرة، بدون البادئة) */
export function normalizeTicket(v) {
  let t = String(v ?? "").toUpperCase().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^A-Z0-9]/g, "");
  if (t.startsWith("BSH")) t = t.slice(3);
  return /^[A-Z0-9]{6}$/.test(t) ? "BSH-" + t : "";
}

/** يجد الشكوى برقم الطلب: المفتاح هو رقم الطلب للشكاوى الجديدة، والبحث الكامل للشكاوى القديمة */
export async function findComplaint(ticket) {
  const s = store("complaints");
  const direct = await s.get(ticket, { type: "json" });
  if (direct) return { key: ticket, item: direct };
  const { blobs } = await s.list();
  const k = blobs.find((b) => b.key.endsWith("-" + ticket));
  if (!k) return { key: null, item: null };
  return { key: k.key, item: await s.get(k.key, { type: "json" }) };
}

/** ما يراه الطالب من استفساره فقط (بدون الملاحظات الداخلية، وبدون أسماء المسؤولين: يظهر الدور فقط) */
export const RATING_TAGS = ["رد سريع", "حل المشكلة", "واضح", "يحتاج تحسين"];
export function publicView(c) {
  return {
    ticket: c.ticket,
    name: c.name,
    grade: c.grade,
    section: c.section,
    type: c.type,
    description: c.description,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    resolvedAt: c.resolvedAt || null,
    assignedRole: c.assignedRole || "",
    messages: (c.messages || []).map((m) => ({ from: m.from, text: m.text, at: m.at, ...(m.from === "admin" ? { role: m.role && m.role !== "مدير النظام" ? m.role : "إدارة المدرسة" } : {}) })),
    canReply: !CLOSED.includes(c.status),
    rating: c.rating ? { stars: c.rating.stars, tags: c.rating.tags || [], at: c.rating.at } : null,
    canRate: CLOSED.includes(c.status) && !c.rating && (c.messages || []).some((m) => m.from === "admin"),
  };
}

/** وقت آخر رد من المسؤول (لتنبيه الطالب بوجود رد جديد) */
export const lastAdminAt = (c) => ((c.messages || []).filter((m) => m.from === "admin").pop() || {}).at || null;

// ===== المحتوى العام (أسئلة شائعة، جداول، اختبارات، تقويم، إعدادات) =====
export const content = () => store("content");
export async function getContent(key, def = null) {
  const v = await content().get(key, { type: "json" });
  return v ?? def;
}
/** تاريخ اليوم بتوقيت مكة YYYY-MM-DD */
export const todayRiyadh = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
export const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_SETTINGS = { archiveDays: 30, maskPhones: true };

export { DEFAULT_FAQ, DEFAULT_FILES, FAQ_CATS } from "./faq-data.mjs";

// الرقم السري لا يُكتب في الكود أبدًا (المستودع قد يكون عامًا)؛ يُضبط من إعدادات Netlify فقط
const ADMIN_PASSWORD = () => String(process.env.ADMIN_PASSWORD || "");
export const adminConfigured = () => ADMIN_PASSWORD().length >= 4;
const TOKEN_SECRET = () =>
  process.env.TOKEN_SECRET || crypto.createHash("sha256").update("bsh-support::" + ADMIN_PASSWORD()).digest("hex");
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 ساعات

export const store = (name) => getStore({ name, consistency: "strong" });

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** يحوّل الأرقام العربية/الفارسية إلى لاتينية ويحذف ما عدا الأرقام */
export function normalizeId(v) {
  return String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

export function clean(v, max) {
  return String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(p) {
  if (!adminConfigured()) return false;
  return safeEqual(p, ADMIN_PASSWORD());
}

/** رمز الجلسة: معرّف المستخدم + وقت الانتهاء + توقيع. owner = مدير النظام */
export function issueToken(uid = "owner") {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${uid}.${exp}`;
  const sig = crypto.createHmac("sha256", TOKEN_SECRET()).update(payload).digest("base64url");
  return { token: `${payload}.${sig}`, exp };
}

/** يتحقق من الرمز ويعيد { uid } أو false */
export function verifyToken(req) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const parts = t.split(".");
  if (parts.length !== 3 || !/^[a-z0-9]{1,40}$/i.test(parts[0])) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const sig = crypto.createHmac("sha256", TOKEN_SECRET()).update(`${parts[0]}.${exp}`).digest("base64url");
  return safeEqual(sig, parts[2]) ? { uid: parts[0] } : false;
}

/** بصمة لا يمكن عكسها لرقم الهوية (لمنع التصويت المكرر دون حفظ الهوية نفسها) */
export const idHash = (scope, id) => crypto.createHmac("sha256", TOKEN_SECRET()).update(scope + ":" + id).digest("base64url").slice(0, 22);
/** تنظيف قائمة شعب */
export const cleanSections = (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => SECTIONS.includes(x)))];
/** هل يستهدف العنصر هذا الطالب؟ (عام، أو لصفه، أو لشعبته) */
export const forStudent = (x, grade, section) => {
  const secs = Array.isArray(x.sections) && x.sections.length ? x.sections : x.section ? [x.section] : [];
  if (secs.length) return secs.includes(section);
  return !x.grade || x.grade === grade;
};

/** حدّ بسيط لعدد الطلبات لكل عنوان IP خلال نافذة زمنية */
export async function rateLimit(context, bucket, limit, windowMs) {
  const ip = context?.ip || "unknown";
  const key = `${bucket}/${crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
  const s = store("ratelimit");
  const now = Date.now();
  let hits = [];
  try { hits = (await s.get(key, { type: "json" })) || []; } catch { hits = []; }
  hits = hits.filter((t) => now - t < windowMs);
  if (hits.length >= limit) return false;
  hits.push(now);
  await s.setJSON(key, hits);
  return true;
}

/** يحوّل قيمة الصف من ملف الطلاب إلى أحد خيارات النموذج */
export function matchGrade(v) {
  const s = String(v ?? "");
  const n = normalizeId(s);
  if (/أول|اول/.test(s) || n === "1" || n === "10") return GRADES[0];
  if (/ثالث|تالث/.test(s) || n === "3" || n === "12") return GRADES[2];
  if (/ثاني|تاني/.test(s) || n === "2" || n === "11") return GRADES[1];
  return "";
}

/** يستخرج رقم الشعبة من قيمة الملف إن كان ضمن القائمة المعتمدة */
export function matchSection(v) {
  const n = normalizeId(v);
  return SECTIONS.includes(n) ? n : "";
}

/** يقرأ ملف الطلاب ويعيد سجل الطالب المعتمد (أو null) */
export async function findStudent(id) {
  const data = await store("students").get("data", { type: "json" });
  if (!data || !data.records) return { data: null, row: null };
  return { data, row: data.records[id] || null };
}

/** بيانات الطالب الرسمية من الملف: الاسم والصف والشعبة */
export function officialInfo(data, row) {
  const r = data.roles || {};
  return {
    name: r.name ? String(row[r.name] ?? "").trim() : "",
    grade: r.grade ? matchGrade(row[r.grade]) : "",
    section: r.section ? matchSection(row[r.section]) : "",
  };
}
