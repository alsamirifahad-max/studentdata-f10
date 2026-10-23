import { store } from "./common.mjs";

// فحص حالة المنصات من خادم الموقع. خوادم Netlify خارج المملكة، لذلك:
// - الاستجابة الطبيعية (2xx/3xx/4xx عدا 403) تعني أن المنصة تعمل
// - 5xx أو انتهاء المهلة مرتين متتاليتين تعني «متعثرة»
// - رفض الاتصال أو 403 تعني «تعذر الفحص» (قد يكون حجبًا للخوادم الخارجية) فلا نُظهرها حمراء
export const PLATFORMS = {
  madrasati: { name: "منصة مدرستي", url: process.env.STATUS_URL_MADRASATI || "https://schools.madrasati.sa/" },
  teams: { name: "Microsoft Teams", url: process.env.STATUS_URL_TEAMS || "https://teams.microsoft.com/" },
};
const st = () => store("status");

async function probe(url) {
  const t0 = Date.now();
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", signal: ctl.signal, headers: { "user-agent": "Mozilla/5.0 (StudentGuide status check)" } });
    const ms = Date.now() - t0;
    if (r.status >= 500) return { state: "down", code: r.status, ms };
    if (r.status === 403 || r.status === 429) return { state: "unknown", code: r.status, ms };
    return { state: "up", code: r.status, ms };
  } catch (e) {
    return { state: e.name === "AbortError" ? "down" : "unknown", code: 0, ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

export async function checkAll() {
  const prev = (await st().get("auto", { type: "json" })) || {};
  const now = new Date().toISOString();
  const out = {};
  for (const [k, p] of Object.entries(PLATFORMS)) {
    const r = await probe(p.url);
    const fails = r.state === "down" ? ((prev[k]?.fails || 0) + 1) : 0;
    // لا نعلن التعثر إلا بعد فحصين متتاليين فاشلين لتجنب الإنذار الكاذب
    out[k] = { state: r.state === "down" && fails < 2 ? (prev[k]?.state === "down" ? "down" : "slow") : r.state, code: r.code, ms: r.ms, fails, at: now };
  }
  await st().setJSON("auto", out);
  return out;
}

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

/** الحالة التي يراها الطالب: الإعلان اليدوي من المسؤول له الأولوية على الفحص الآلي */
export async function publicStatus({ refreshIfOlderMin = 15 } = {}) {
  let auto = (await st().get("auto", { type: "json" })) || {};
  const ages = Object.values(auto).map((x) => Date.now() - Date.parse(x.at || 0));
  if (!ages.length || Math.max(...ages) > refreshIfOlderMin * 60000) auto = await checkAll();
  const manual = await getManual();
  const items = Object.entries(PLATFORMS).map(([k, p]) => {
    const m = manual[k];
    const active = m && m.mode !== "auto" && (!m.until || Date.parse(m.until) > Date.now());
    const a = auto[k] || {};
    return { id: k, name: p.name, state: active ? m.mode : a.state || "unknown", source: active ? "manual" : "auto", note: active ? m.note : "", at: a.at || null };
  });
  return { items, checkedAt: items.map((x) => x.at).filter(Boolean).sort().pop() || null };
}
