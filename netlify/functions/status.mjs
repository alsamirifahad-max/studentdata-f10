import { publicStatus } from "../lib/status.mjs";

// حالة منصات مدرستي وتيمز للطلاب (تُحدَّث كل 10 دقائق، وتُخزَّن مؤقتًا دقيقة واحدة)
export default async () => new Response(JSON.stringify({ ok: true, ...(await publicStatus()) }), {
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" },
});

export const config = { path: "/api/status" };
