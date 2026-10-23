// عامل الخدمة: يجعل الصفحة قابلة للتثبيت ويفتحها بلا إنترنت بآخر نسخة محفوظة.
// لا يحفظ أبدًا أي طلب إلى /api (بيانات الطلاب والاستفسارات) ولا لوحة التحكم.
const CACHE = "bsh-v5";
const SHELL = ["./", "index.html", "assets/style.css", "assets/plus.css", "assets/app-plus.js", "assets/app-more.js", "assets/app-extra.js", "assets/ui.css", "assets/voice.js", "assets/app-finals.js", "assets/app-ui.js", "assets/icons/icon-192.png", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// تجاوز ذاكرة المتصفح المؤقتة حتى لا يبقى التطبيق المثبت على نسخة قديمة
const fetchFresh = (req) => { try { return fetch(req, { cache: "no-cache" }); } catch { return fetch(req); } };
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.includes("admin")) return;
  // الشبكة أولًا دائمًا (حتى تظهر التحديثات فورًا)، والنسخة المحفوظة عند انقطاع الإنترنت فقط
  e.respondWith(
    fetchFresh(req).then((res) => {
      if (res.ok && res.type === "basic") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});

// ===== الإشعارات على الجوال =====
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "دليل الطالب", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "دليل الطالب الرقمي", {
    body: d.body || "", icon: d.icon || "assets/icons/icon-192.png", badge: d.badge || "assets/icons/icon-192.png",
    tag: d.tag || undefined, renotify: !!d.tag, dir: "rtl", lang: "ar", data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
