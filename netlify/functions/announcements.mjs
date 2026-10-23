import { json, store } from "../lib/common.mjs";

// الإعلانات النشطة اليوم (بتوقيت مكة) للصفحة العامة. لا تحتوي أي بيانات شخصية.
export default async () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()); // YYYY-MM-DD
  const list = (await store("announcements").get("list", { type: "json" })) || [];
  const order = { urgent: 0, warn: 1, info: 2, congrats: 3 };
  const items = list
    .filter((a) => !a.hidden && a.from <= today && a.to >= today)
    .sort((a, b) => (b.pinned - a.pinned) || (order[a.type] - order[b.type]) || (a.from < b.from ? 1 : -1))
    .map(({ id, title, body, type, link, grade, section, sections, pinned, from, updatedAt, createdAt, audioType, audioV, audioSec }) =>
      ({ id, title, body, type, link, grade, sections: sections && sections.length ? sections : section ? [section] : [], pinned, from, v: updatedAt || createdAt, audio: audioType ? "/api/file?ann=" + id + "&v=" + audioV : "", audioSec: audioSec || 0 }));
  return new Response(JSON.stringify({ ok: true, items }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
  });
};

export const config = { path: "/api/announcements" };
