/* Service Worker — Sổ chi tiêu chung
 * - Cache "vỏ app" (html/css/js/icon) để mở được cả khi mất mạng.
 * - TUYỆT ĐỐI không cache request tới Google Apps Script / Google đăng nhập:
 *   dữ liệu chi tiêu luôn đi qua cơ chế đồng bộ + hàng đợi sẵn có của app.
 * - Mỗi lần sửa file giao diện, tăng CACHE_VERSION để máy người dùng nhận bản mới.
 */
const CACHE_VERSION = "v16";
const SHELL_CACHE = "so-chi-tieu-shell-" + CACHE_VERSION;
const CDN_CACHE = "so-chi-tieu-cdn-" + CACHE_VERSION;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

// File KHÔNG bắt buộc: thiếu cũng không làm hỏng việc cài đặt (config.js có thể chưa tạo; xlsx nặng ~880 KB, chỉ cần cho Xuất/Nhập Excel
// nên được lấy sẵn ngầm để dùng được cả khi offline).
const OPTIONAL_FILES = ["./config.js", "./vendor/xlsx.full.min.js"];

// Chỉ font Google mới được cache; mọi host khác (Apps Script, đăng nhập Google...) đi thẳng ra mạng.
const CDN_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(SHELL_FILES).then(() =>
          Promise.all(OPTIONAL_FILES.map((u) => cache.add(u).catch(() => {})))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith("so-chi-tieu-") && k !== SHELL_CACHE && k !== CDN_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST tới Apps Script... không đụng tới

  const url = new URL(req.url);

  // 1) File của chính app: ưu tiên mạng (luôn nhận bản mới nhất), mất mạng thì lấy từ cache.
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Font / thư viện xlsx: lấy từ cache ngay, đồng thời cập nhật ngầm.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) Còn lại (script.google.com, accounts.google.com...): không can thiệp.
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
}

// App hỏi số phiên bản đang chạy để hiện trong menu.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "getVersion" && event.source) {
    event.source.postMessage({ type: "version", version: CACHE_VERSION });
  }
});
