import { store, getContent } from "../lib/common.mjs";

// تنزيل/عرض ملف مرفوع من لوحة التحكم (أدلة PDF وصور). الملفات عامة بطبيعتها (مراجع للطلاب).
export default async (req) => {
  const q = new URL(req.url).searchParams;
  const ann = q.get("ann");
  if (ann) {
    // التسجيل الصوتي المرفق بإعلان
    const a = ((await store("announcements").get("list", { type: "json" })) || []).find((x) => x.id === ann && x.audioType);
    const buf = a && (await store("files").get("ann-audio-" + ann, { type: "arrayBuffer" }));
    if (!buf) return new Response("التسجيل غير موجود", { status: 404 });
    return new Response(buf, { headers: { "content-type": a.audioType, "cache-control": "public, max-age=3600", "accept-ranges": "none", "x-content-type-options": "nosniff" } });
  }
  const id = q.get("id") || "";
  const meta = ((await getContent("files")) || []).find((f) => f.id === id);
  if (!meta || meta.url) return new Response("الملف غير موجود", { status: 404 });
  const data = await store("files").get(id, { type: "arrayBuffer" });
  if (!data) return new Response("الملف غير موجود", { status: 404 });
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[meta.type] || "bin";
  return new Response(data, { headers: {
    "content-type": meta.type || "application/octet-stream",
    "content-disposition": `inline; filename="file.${ext}"; filename*=UTF-8''${encodeURIComponent((meta.title || "ملف") + "." + ext)}`,
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
  } });
};

export const config = { path: "/api/file" };
