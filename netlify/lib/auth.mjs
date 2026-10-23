import crypto from "node:crypto";
import { store, clean, checkPassword, verifyToken, TYPES } from "./common.mjs";

// ===== حسابات المسؤولين وصلاحياتهم =====
// مدير النظام (owner) يدخل بالرقم السري ADMIN_PASSWORD من إعدادات Netlify، وله كل الصلاحيات.
// باقي المسؤولين حسابات يضيفها المدير، وكلمات مرورهم تُحفظ مشفّرة (scrypt) ولا تُحفظ نصًا أبدًا.

export const ROLES = ["الموجه الطلابي", "وكيل الشؤون التعليمية", "مدير المدرسة", "منسق موهبة", "المنسق الصحي", "رائد النشاط", "وكيل شؤون الطلاب", "مسؤول التقنية", "معلم", "أخرى"];
/** الهيكل الإداري المقترح: عدد المقاعد لكل دور (للعرض في لوحة الإعدادات) */
export const ROLE_SLOTS = { "الموجه الطلابي": 3, "وكيل الشؤون التعليمية": 1, "مدير المدرسة": 1, "منسق موهبة": 1, "المنسق الصحي": 1, "رائد النشاط": 1 };
/** المسمى الظاهر: المسمى المخصص عند اختيار «أخرى» */
export const roleName = (u) => (u.role === "أخرى" && u.title ? u.title : u.role);
export const PERM_KEYS = ["announcements", "students", "faq", "schedule", "calls", "events", "honor", "polls"];
const users = () => store("users");

export async function loadUsers() {
  return (await users().get("list", { type: "json" })) || [];
}
export async function saveUsers(list) {
  await users().setJSON("list", list);
}

function hash(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString("base64");
}
export function setPassword(u, pw) {
  u.salt = crypto.randomBytes(16).toString("base64");
  u.hash = hash(pw, u.salt);
}
export function checkUserPassword(u, pw) {
  if (!u || !u.salt || !u.hash) return false;
  const a = Buffer.from(hash(pw, u.salt)), b = Buffer.from(u.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** رقم سري مؤقت سهل القراءة (بدون أحرف ملتبسة) */
export function tempPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let t = ""; for (const b of crypto.randomBytes(10)) t += A[b % A.length];
  return t;
}
export const newId = () => crypto.randomBytes(6).toString("hex");
export const normUser = (v) => clean(v, 30).toLowerCase().replace(/\s+/g, "");

/** تنظيف الصلاحيات القادمة من النموذج */
export function cleanPerms(p) {
  const inq = p?.inquiries;
  return {
    inquiries: inq === "all" ? "all" : Array.isArray(inq) ? inq.filter((t) => TYPES.includes(t)) : [],
    announcements: !!p?.announcements,
    ...Object.fromEntries(PERM_KEYS.map((k) => [k, !!p?.[k]])),
  };
}

const OWNER = { id: "owner", owner: true, name: "مدير النظام", role: "مدير النظام", username: "",
  perms: { inquiries: "all", ...Object.fromEntries(PERM_KEYS.map((k) => [k, true])) }, mustChange: false };

/** الجلسة الحالية من رمز الدخول؛ تُقرأ بيانات الحساب في كل طلب حتى يسري الإيقاف وتغيير الصلاحيات فورًا */
export async function getSession(req) {
  const t = verifyToken(req);
  if (!t) return null;
  if (t.uid === "owner") return OWNER;
  const u = (await loadUsers()).find((x) => x.id === t.uid);
  if (!u || !u.active) return null;
  return { id: u.id, owner: false, name: u.name, role: roleName(u), username: u.username, perms: cleanPerms(u.perms), mustChange: !!u.mustChange };
}

/** الدخول: اسم دخول فارغ = مدير النظام */
export async function login(username, password) {
  const un = normUser(username);
  if (!un) return checkPassword(password) ? OWNER : null;
  const list = await loadUsers();
  const u = list.find((x) => x.username === un && x.active);
  if (!u || !checkUserPassword(u, password)) return null;
  u.lastLogin = new Date().toISOString();
  await saveUsers(list);
  return getSessionFromUser(u);
}
function getSessionFromUser(u) {
  return { id: u.id, owner: false, name: u.name, role: roleName(u), username: u.username, perms: cleanPerms(u.perms), mustChange: !!u.mustChange };
}

export const publicMe = (s) => ({ id: s.id, owner: !!s.owner, name: s.name, role: s.role, username: s.username || "", perms: s.perms, mustChange: !!s.mustChange });

/** هل يستطيع المستخدم رؤية/معالجة استفسار من هذا النوع؟ */
export function canInquiry(s, type) {
  if (!s) return false;
  const p = s.perms.inquiries;
  if (p === "all") return true;
  return Array.isArray(p) && (type === undefined ? p.length > 0 : p.includes(type));
}

/** هل يستطيع المستخدم رؤية/معالجة هذا الاستفسار؟ (حسب النوع، أو لأنه محوّل إليه) */
export function canItem(s, item) {
  return !!item && (canInquiry(s, item.type) || (!!item.assignedTo && item.assignedTo === s.id));
}

/** قائمة المسؤولين النشطين لاختيار من يُحوَّل إليه الاستفسار */
export async function staffList() {
  const list = await loadUsers();
  return [{ id: "owner", name: "مدير النظام", role: "مدير النظام" },
    ...list.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: roleName(u) }))];
}
