import { store } from "./common.mjs";

// حالة منصتي مدرستي وتيمز: يعلنها المسؤول يدويًا من لوحة التحكم (لا فحص آلي، توفيرًا لموارد الاستضافة)
export const PLATFORMS = {
  madrasati: { name: "منصة مدرستي" },
  teams: { name: "Microsoft Teams" },
};
const st = () => store("status");

const MANUAL = ["auto", "up", "down"];
export async function getManual() { return (await st().get("manual", { type: "json" })) || {}; }
export async function setManual(m) {
  const clean = {};
  for (const k of Object.keys(PLATFORMS)) {
    const v = m?.[k] || {};
    clean[k] = { mode: MANUAL.includes(v.mode) ? v.mode : "auto", note: String(v.note || "").slice(0, 160), until: /^\d{4}-\d{2}-\d{2}T/.test(v.until || "") ? v.until : null };
  }
  await st().setJSON("manual", clean);
  return clean;
}

/** الحالة التي يراها الطالب: ما أعلنه المسؤول فقط (ينتهي تلقائيًا في الوقت المحدد) */
export async function publicStatus() {
  const manual = await getManual();
  const items = Object.entries(PLATFORMS).map(([k, p]) => {
    const m = manual[k];
    const active = m && m.mode !== "auto" && (!m.until || Date.parse(m.until) > Date.now());
    return { id: k, name: p.name, state: active ? m.mode : "none", source: active ? "manual" : "none", note: active ? m.note : "", until: active ? m.until : null };
  });
  return { items };
}
