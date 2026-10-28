(function(){
  "use strict";

  // Tạm dừng nền hạt (particle network) khi có lớp phủ toàn màn hình đang mở (modal thêm/sửa,
  // hộp xác nhận, chi tiết danh mục/ngày) — lúc đó nó bị che kín 100%, vẽ lại mỗi khung hình là
  // phí CPU vô ích, đúng lúc người dùng đang gõ liệu/thao tác nên dễ cảm nhận giật nhất.
  // Dùng bộ đếm (không phải cờ boolean) để an toàn nếu lỡ có 2 lớp phủ mở lồng nhau.
  // Bắt tay với initParticleNetwork() (định nghĩa riêng, cuối file) qua window.__particleStart/Stop
  // vì 2 khối code này cố tình tách biệt scope với nhau (không đụng vào state/logic của nhau).
  let __particlePauseDepth = 0;
  function pauseParticleBg(){
    __particlePauseDepth++;
    document.documentElement.classList.add("anim-paused"); // cán cân + chấm đồng hồ cũng tạm dừng (đang bị che kín)
    if(window.__particleStop) window.__particleStop();
  }
  function resumeParticleBg(){
    __particlePauseDepth = Math.max(0, __particlePauseDepth - 1);
    if(__particlePauseDepth === 0){
      document.documentElement.classList.remove("anim-paused");
      if(window.__particleStart) window.__particleStart();
    }
  }

  // ---------- Thông báo (toast) ----------
  // showNotice(msg)      : thông báo cho NGƯỜI DÙNG (nhập thiếu, mất mạng, chưa cấu hình...) — tự ẩn sau 5 giây.
  // showErrorBanner(msg) : lỗi bất ngờ của code — tự ẩn sau 9 giây, ghi thêm vào console để dễ tra cứu.
  // Cả hai đều có nút ✕, xếp chồng tối đa 3 thông báo, cùng nội dung thì chỉ hiện 1 (và tính lại giờ).
  const TOAST_MAX = 3;
  function toastHost(){
    let h = document.getElementById("toastHost");
    if(!h){
      h = document.createElement("div");
      h.id = "toastHost";
      h.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top, 0px)) 12px 0;pointer-events:none;";
      document.body.appendChild(h);
    }
    return h;
  }
  function dismissToast(el){
    if(!el || !el.parentNode) return;
    clearTimeout(el._timer);
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 180);
  }
  function showToast(msg, kind, ms){
    const text = String(msg == null ? "" : msg).trim();
    if(!text) return;
    const host = toastHost();
    const isError = kind === "error";
    const existing = Array.prototype.find.call(host.children, (c) => c._text === text);
    if(existing){
      clearTimeout(existing._timer);
      existing._timer = setTimeout(() => dismissToast(existing), ms);
      return;
    }
    while(host.children.length >= TOAST_MAX) host.removeChild(host.firstChild);
    const t = document.createElement("div");
    t._text = text;
    t.setAttribute("role", isError ? "alert" : "status");
    const accent = isError ? "var(--vk-soft)" : "var(--gold)";
    t.style.cssText = "pointer-events:auto;display:flex;align-items:flex-start;gap:10px;max-width:min(520px,100%);box-sizing:border-box;" +
      "padding:10px 10px 10px 14px;border-radius:12px;background:var(--surface2);color:var(--text-hi);" +
      "border:1px solid " + accent + ";border-left-width:4px;box-shadow:0 6px 24px rgba(0,0,0,.35);" +
      "font:13px/1.45 var(--sans, sans-serif);opacity:0;transform:translateY(-6px);transition:opacity .18s ease,transform .18s ease;word-break:break-word;";
    const span = document.createElement("span");
    span.style.cssText = "flex:1;min-width:0;white-space:pre-wrap;";
    span.textContent = (isError ? "Có lỗi xảy ra: " : "") + text;
    const x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", "Đóng thông báo");
    x.textContent = "\u2715";
    x.style.cssText = "flex:none;border:0;background:transparent;color:var(--text-muted);font-size:15px;line-height:1;padding:4px 6px;cursor:pointer;border-radius:6px;";
    x.addEventListener("click", () => dismissToast(t));
    t.appendChild(span);
    t.appendChild(x);
    host.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "none"; });
    t._timer = setTimeout(() => dismissToast(t), ms);
  }
  function showNotice(msg){ showToast(msg, "notice", 5000); }
  function showErrorBanner(msg){
    console.error("app error:", msg);
    showToast(msg, "error", 9000);
  }
  // Lỗi "ồn" của trình duyệt, không phải lỗi của app -> không làm phiền người dùng.
  function isIgnorableError(text){
    return /ResizeObserver loop|^Script error\.?$|AbortError|The user aborted a request|Load failed|Failed to fetch|NetworkError/i.test(String(text || ""));
  }
  window.addEventListener("error", (e) => { if(!isIgnorableError(e.message)) showErrorBanner(e.message); });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const text = (r && r.message) ? r.message : String(r);
    if(!isIgnorableError(text) && !isIgnorableError(r && r.name)) showErrorBanner(text);
  });

  // ---------- Category model ----------
  const CATS = [
    { id:"ca_nhan",  legacy:"-",              label:"Cá nhân",             sub:"Không chia, chi tiêu riêng",                 color:"var(--text-muted)" },
    { id:"ck_tinh",  legacy:"Ck tính",        label:"Chồng tính · chia 2", sub:"Chồng ứng tiền, chia đôi 2 người",           color:"var(--chong)" },
    { id:"vk_tinh",  legacy:"Vk tính",        label:"Vợ tính · chia 2",    sub:"Vợ ứng tiền, chia đôi 2 người",              color:"var(--vk)" },
    { id:"ck_thieu", legacy:"Ck thiếu",       label:"Chồng thiếu",         sub:"Chồng thiếu tiền Vợ (Chồng nợ Vợ)",          color:"var(--gold)" },
    { id:"vk_thieu", legacy:"Vk thiếu",       label:"Vợ thiếu",            sub:"Vợ thiếu tiền Chồng (Vợ nợ Chồng)",          color:"var(--gold)" },
    { id:"ck_chung", legacy:"CK tính chung",  label:"Chồng tính chung · chia 3",   sub:"Chi tiêu chung 3 người, Chồng ứng",          color:"var(--chong-soft)" },
    { id:"vk_chung", legacy:"Vk tính chung",  label:"Vợ tính chung · chia 3",      sub:"Chi tiêu chung 3 người, Vợ ứng",             color:"var(--vk-soft)" },
  ];
  const catById = Object.fromEntries(CATS.map(c => [c.id, c]));
  const legacyToId = Object.fromEntries(CATS.map(c => [c.legacy, c.id]));

  // ---------- Seed data ----------
  // Không còn dùng dữ liệu mẫu nữa — dữ liệu thật lấy từ Google Sheet mỗi khi bấm "Đồng bộ ngay".
  const RAW_SEED = [];
  const SEED = RAW_SEED.map(([day, name, amount, legacy], i) => ({
    id: "seed_" + i, day, name, amount, category: legacyToId[legacy] || "ca_nhan", updatedAt: 0,
  }));

  // Tháng mặc định khi CHƯA TỪNG mở app lần nào (chưa có gì trong cache) -> dùng đúng tháng hiện tại
  // theo ngày hệ thống, thay vì hardcode 1 tháng cố định.
  function currentSystemMonthKey(){
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  const DEFAULT_MONTH_KEY = currentSystemMonthKey();

  // ---------- Cấu hình (đọc từ file config.js, điền 1 lần, các lần cập nhật code sau không đụng tới) ----------
  // Google Sheet là nguồn dữ liệu chính — localStorage chỉ dùng làm LỚP ĐỆM AN TOÀN
  // (đề phòng mất mạng giữa chừng), không phải nơi lưu trữ chính thức.
  // Thiếu config.js hoặc để trống -> app chạy thuần cục bộ (không đồng bộ, không đăng nhập).
  const APP_CONFIG = window.APP_CONFIG || {};
  const SHEET_SYNC_URL = String(APP_CONFIG.SHEET_SYNC_URL || "").trim();
  const SHEET_SYNC_TOKEN = String(APP_CONFIG.SHEET_SYNC_TOKEN || "").trim();
  const GOOGLE_CLIENT_ID = String(APP_CONFIG.GOOGLE_CLIENT_ID || "").trim();
  const CACHE_KEY = "so_chi_tieu:cache:v1";
  const QUEUE_KEY = "so_chi_tieu:queue:v1";
  const LAST_SYNC_KEY = "so_chi_tieu:last_sync_at";
  const AUTO_PULL_KEY = "so_chi_tieu:auto_pull";
  const THEME_KEY = "so_chi_tieu:theme";
  const STALE_SYNC_MS = 15 * 60 * 1000; // 15 phút — quá thời gian này sẽ cảnh báo nhẹ

  // ---------- Giao diện sáng/tối ----------
  // Giá trị ban đầu ("dark"/"light") đã được set thẳng lên thẻ <html> bằng script
  // nhỏ ở <head> (trước khi trang vẽ khung hình đầu, tránh nháy sai màu) — ở đây
  // chỉ cần đọc lại đúng giá trị đó ra để đồng bộ trạng thái nút bấm + màu meta.
  function getTheme(){
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "light" ? "light" : "dark";
  }
  function setTheme(theme){
    const next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try{ localStorage.setItem(THEME_KEY, next); }catch(e){ /* ignore */ }
    renderThemeToggle(); // cũng tự cập nhật màu thanh trạng thái trên di động (meta theme-color)
    // Hiệu ứng nền particle đọc màu trực tiếp từ CSS variables -> cần đọc lại +
    // vẽ lại ngay 1 khung hình để đổi màu đồng bộ tức thì, không phải chờ khung kế tiếp.
    if(typeof window.__particleRefreshColors === "function") window.__particleRefreshColors();
  }
  function renderThemeToggle(){
    const btn = document.getElementById("themeToggle");
    const isLight = getTheme() === "light";
    if(btn){
      btn.setAttribute("aria-pressed", isLight ? "true" : "false");
      btn.title = isLight ? "Đang dùng giao diện SÁNG — bấm để chuyển sang tối" : "Đang dùng giao diện TỐI — bấm để chuyển sang sáng";
    }
    const label = document.getElementById("themeMenuLabel");
    if(label) label.textContent = isLight ? "Giao diện sáng" : "Giao diện tối";
    const metaTheme = document.getElementById("metaThemeColor");
    if(metaTheme) metaTheme.setAttribute("content", isLight ? "#F2F5F9" : "#080B10");
  }

  // ---------- Hiệu năng & pin ----------
  // Chế độ "Tiết kiệm pin" tắt các hiệu ứng động nặng (cán cân quay, nền hạt, đổ bóng, blur). Chưa chọn thì TỰ ĐỘNG:
  // bật khi hệ thống yêu cầu giảm chuyển động / tiết kiệm dữ liệu / máy ít RAM hoặc ít lõi; còn lại để chế độ đầy đủ.
  // Người dùng bấm công tắc trong menu thì lựa chọn đó được nhớ và thắng chế độ tự động.
  const PERF_KEY = "so_chi_tieu:perf_mode"; // "lite" | "full"
  let batteryLow = false; // pin <= 20% và không sạc (chỉ Chrome/Android có Battery API)
  function autoPerfLite(){
    try{
      if(batteryLow) return true;
      if(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      const conn = navigator.connection;
      if(conn && conn.saveData) return true;
      if(navigator.deviceMemory && navigator.deviceMemory <= 2) return true;
      if(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return true;
    }catch(err){ /* ignore */ }
    return false;
  }
  function getPerfLite(){
    try{
      const v = localStorage.getItem(PERF_KEY);
      if(v === "lite") return true;
      if(v === "full") return false;
    }catch(err){ /* ignore */ }
    return autoPerfLite();
  }
  function applyPerfMode(){
    const lite = getPerfLite();
    document.documentElement.setAttribute("data-perf", lite ? "lite" : "full");
    const btn = document.getElementById("perfToggle");
    if(btn) btn.setAttribute("aria-pressed", lite ? "true" : "false");
    const label = document.getElementById("perfMenuLabel");
    let explicit = null;
    try{ explicit = localStorage.getItem(PERF_KEY); }catch(err){ /* ignore */ }
    if(label) label.textContent = lite ? (explicit ? "Tiết kiệm pin: BẬT" : "Tiết kiệm pin: BẬT (tự động)") : "Tiết kiệm pin: TẮT";
    if(typeof window.__particleSetLite === "function") window.__particleSetLite(lite);
  }
  applyPerfMode(); // chạy sớm, trước khi nền hạt khởi động
  // Pin yếu (<= 20%) và đang không sạc -> tự bật Tiết kiệm pin (chỉ khi người dùng chưa tự chọn). Sạc/pin lên lại thì tự trả về như cũ.
  if(typeof navigator.getBattery === "function"){
    navigator.getBattery().then((bat) => {
      const update = () => {
        const low = !bat.charging && bat.level <= 0.2;
        if(low !== batteryLow){ batteryLow = low; applyPerfMode(); }
      };
      bat.addEventListener("levelchange", update);
      bat.addEventListener("chargingchange", update);
      update();
    }).catch(() => { /* trình duyệt không cho dùng -> bỏ qua */ });
  }
  document.getElementById("perfToggle").addEventListener("click", () => {
    try{ localStorage.setItem(PERF_KEY, getPerfLite() ? "full" : "lite"); }catch(err){ /* ignore */ }
    applyPerfMode();
  });
  // Cán cân cuộn khỏi màn hình thì dừng các animation của nó (không ai nhìn thấy nên vẽ cũng vô ích).
  (function(){
    const box = document.querySelector(".scale-box");
    if(!box || !("IntersectionObserver" in window)) return;
    new IntersectionObserver((list) => {
      list.forEach((en) => box.classList.toggle("offscreen", !en.isIntersecting));
    }).observe(box);
  })();

  // Bật/tắt tự động tải bản mới từ Google Sheet khi mở app, quay lại app (sau >= 2 phút) hoặc chuyển tháng.
  // Mặc định BẬT (sổ này dùng chung cho 2 người nên cần thấy khoản chi của nhau); người dùng có thể tắt bằng
  // icon cạnh icon menu (⋮) — lựa chọn được nhớ lại.
  function getAutoPull(){
    try{
      const raw = localStorage.getItem(AUTO_PULL_KEY);
      return raw === null ? true : raw === "1";
    }catch(e){ return true; }
  }
  function setAutoPull(val){
    try{ localStorage.setItem(AUTO_PULL_KEY, val ? "1" : "0"); }catch(e){ /* ignore */ }
    renderAutoPullToggle();
  }
  function renderAutoPullToggle(){
    const btn = document.getElementById("autoPullToggle");
    if(!btn) return;
    const on = getAutoPull();
    btn.classList.toggle("on", on);
    btn.classList.toggle("off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on
      ? "Đang BẬT tự động tải bản mới khi mở/quay lại app và chuyển tháng — bấm để tắt"
      : "Đang TẮT tự động tải bản mới — bấm để bật";
  }

  // ---------- Helpers ----------
  // Sinh ID duy nhất cho 1 khoản chi. TRƯỚC ĐÂY dùng "e_" + Date.now(), nhưng Date.now() chỉ có độ
  // phân giải 1 mili-giây -> nếu 2 khoản chi được thêm trong cùng 1 mili-giây (bấm đúp nút "Thêm" trên
  // di động, nhân bản nhanh, hoặc double-tap gây gọi hàm 2 lần) sẽ RA CÙNG 1 ID, khiến Apps Script coi
  // đó là "sửa lại đúng dòng cũ" (upsertEntry tìm theo id) và GHI ĐÈ mất khoản chi đầu tiên trên Sheet.
  // Dùng crypto.randomUUID() (có sẵn trên mọi trình duyệt hiện đại) để đảm bảo không bao giờ trùng；
  // nếu trình duyệt quá cũ không hỗ trợ, fallback về timestamp + số đếm tăng dần + số ngẫu nhiên.
  let entryIdCounter = 0;
  function genEntryId(){
    if(window.crypto && typeof window.crypto.randomUUID === "function"){
      return "e_" + window.crypto.randomUUID();
    }
    entryIdCounter = (entryIdCounter + 1) % 1000000;
    return "e_" + Date.now() + "_" + entryIdCounter + "_" + Math.random().toString(36).slice(2, 8);
  }
  const money = (thousands) => new Intl.NumberFormat("vi-VN").format(Math.round((thousands||0)*1000)) + " \u20ab";
  // Cho phép gõ biểu thức cộng/trừ/nhân/chia đơn giản vào ô "Số tiền", vd. "10+20", "=15*2".
  // Chỉ chấp nhận chuỗi CHỈ gồm số, dấu chấm/phẩy, khoảng trắng và + - * / ( ) — không cho phép
  // chữ cái hay ký tự khác lọt vào trước khi tính, để tránh chạy code lạ qua Function().
  function evalAmountExpr(raw){
    if(raw === null || raw === undefined) return NaN;
    let s = String(raw).trim();
    if(!s) return NaN;
    if(s[0] === "=") s = s.slice(1).trim(); // lỡ gõ kiểu công thức Excel/Sheet "=10+20"
    s = s.replace(/,/g, "."); // lỡ gõ dấu phẩy làm dấu thập phân
    if(!/^[0-9+\-*/().\s]+$/.test(s)) return NaN; // có ký tự lạ -> không tính, coi như không hợp lệ
    if(!/[0-9]/.test(s)) return NaN; // chỉ toàn dấu toán tử, không có số nào
    if(/\*\*|\/\/|\/\*|\+\+|--/.test(s)) return NaN; // các cụm toán tử không có nghĩa trong phép tính tiền
    // Bộ phân tích cú pháp tự viết (đệ quy xuống) — KHÔNG dùng eval/Function nên chạy được với
    // Content-Security-Policy chặn 'unsafe-eval'. Hỗ trợ: số, + - * /, ngoặc, dấu +/- đứng trước.
    const tokens = [];
    const re = /\s*(\d+\.?\d*|\.\d+|[()+\-*/])/y;
    let pos = 0;
    while(pos < s.length){
      re.lastIndex = pos;
      const m = re.exec(s);
      if(!m){ if(/^\s*$/.test(s.slice(pos))) break; return NaN; }
      tokens.push(m[1]);
      pos = re.lastIndex;
    }
    let i = 0;
    const fail = () => { throw new Error("bad expr"); };
    function primary(){
      const t = tokens[i++];
      if(t === undefined) fail();
      if(t === "("){
        const v = expr();
        if(tokens[i++] !== ")") fail();
        return v;
      }
      if(/^[0-9.]/.test(t)){
        const n = parseFloat(t);
        if(isNaN(n)) fail();
        return n;
      }
      return fail();
    }
    function unary(){
      if(tokens[i] === "-"){ i++; return -unary(); }
      if(tokens[i] === "+"){ i++; return unary(); }
      return primary();
    }
    function term(){
      let v = unary();
      while(tokens[i] === "*" || tokens[i] === "/"){
        const op = tokens[i++];
        const r = unary();
        v = (op === "*") ? v * r : v / r;
      }
      return v;
    }
    function expr(){
      let v = term();
      while(tokens[i] === "+" || tokens[i] === "-"){
        const op = tokens[i++];
        const r = term();
        v = (op === "+") ? v + r : v - r;
      }
      return v;
    }
    try{
      const result = expr();
      if(i !== tokens.length) return NaN; // còn token thừa (vd. "10 20", "2(3)")
      if(typeof result !== "number" || !isFinite(result)) return NaN;
      return Math.round(result * 100) / 100; // làm tròn 2 chữ số thập phân cho gọn
    }catch(err){
      return NaN;
    }
  }
  const prefersReducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animateValue(el, toValue, formatter, setter){
    if(!el) return;
    formatter = formatter || money;
    setter = setter || ((node, text) => { node.textContent = text; });
    const to = Number(toValue) || 0;
    if(prefersReducedMotion()){
      el.dataset.animVal = to;
      setter(el, formatter(to));
      return;
    }
    const from = Number(el.dataset.animVal || 0);
    el.dataset.animVal = to;
    if(Math.abs(to - from) < 0.001){ setter(el, formatter(to)); return; }
    const duration = 550;
    const start = performance.now();
    if(el._animRaf) cancelAnimationFrame(el._animRaf);
    function tick(now){
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setter(el, formatter(from + (to - from) * eased));
      if(t < 1){ el._animRaf = requestAnimationFrame(tick); }
      else { setter(el, formatter(to)); el._animRaf = null; }
    }
    el._animRaf = requestAnimationFrame(tick);
  }
  // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt có dấu/không dấu (gõ "com ga" vẫn ra "Cơm gà").
  function stripDiacritics(str){
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D")
      .toLowerCase();
  }
  const sumBy = (entries, catId) => entries.filter(e => e.category === catId).reduce((s,e) => s + Number(e.amount||0), 0);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function monthLabel(key){
    const parts = String(key).split("-");
    const y = parts[0], m = parseInt(parts[1], 10) || 1;
    return "Tháng " + m + " · " + y;
  }
  function daysInMonthKey(key){
    const parts = String(key).split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if(!y || !m) return 31;
    return new Date(y, m, 0).getDate(); // ngày cuối cùng của tháng m (1-12)
  }
  // Trả về nhãn thứ ngắn gọn (T2..T7, CN) cho 1 ngày cụ thể trong tháng — dùng để gắn vào
  // đầu mỗi cụm box "gom theo ngày" trong Sổ ghi chép.
  function weekdayShortLabel(monthKey, day){
    const parts = String(monthKey).split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if(!y || !m || !day) return "";
    const dow = new Date(y, m - 1, Number(day)).getDay(); // 0=CN..6=T7
    return ["CN","T2","T3","T4","T5","T6","T7"][dow];
  }
  function buildDayCalendar(monthKey, selectedDay, gridId, titleId){
    gridId = gridId || "dayGrid";
    titleId = titleId || "dayPanelTitle";
    const parts = String(monthKey).split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const total = daysInMonthKey(monthKey);
    const dow = new Date(y, (m || 1) - 1, 1).getDay(); // 0=CN..6=T7
    const leadingEmpty = (dow + 6) % 7; // đưa về Thứ 2 = 0 ... CN = 6
    const now = new Date();
    const isRealCurrentMonth = now.getFullYear() === y && (now.getMonth() + 1) === m;
    const todayDay = now.getDate();
    let html = "";
    for(let i = 0; i < leadingEmpty; i++) html += '<span class="day-cell empty"></span>';
    for(let d = 1; d <= total; d++){
      const cls = ["day-cell"];
      if(d === selectedDay) cls.push("active");
      if(isRealCurrentMonth && d === todayDay) cls.push("today");
      html += '<button type="button" class="' + cls.join(" ") + '" data-day="' + d + '">' + d + '</button>';
    }
    document.getElementById(gridId).innerHTML = html;
    document.getElementById(titleId).textContent = monthLabel(monthKey);
  }

  // ---------- State ----------
  // Google Sheet vẫn là nguồn dữ liệu chính (bấm "Đồng bộ ngay" để lấy bản mới nhất).
  // localStorage ở đây CHỈ là lớp đệm an toàn: lưu lại những gì đang có trong phiên làm
  // việc + hàng đợi các thay đổi chưa chắc đã lên được Sheet, để không mất trắng nếu
  // mất mạng/đóng tab giữa chừng — không dùng để merge hay thay thế việc đồng bộ.
  let monthsData = { [DEFAULT_MONTH_KEY]: SEED.slice() };
  let currentMonthKey = DEFAULT_MONTH_KEY;
  let entries = monthsData[currentMonthKey];
  let editingId = null;
  // ---------- Gộp 2 (hoặc nhiều) khoản chi làm 1 ----------
  let mergeMode = false; // đang ở chế độ chọn khoản chi để gộp hay không
  let mergeSelectedIds = []; // danh sách id đang được chọn (giữ thứ tự bấm chọn)
  let mergeSecondaryIds = []; // id của các khoản sẽ bị XOÁ sau khi khoản gộp (giữ lại) được lưu thành công
  // Đặt ở scope ngoài (không phải trong khối try bên dưới) để switchMonth()/pullMonth() — vốn nằm
  // ngoài khối try đó — vẫn gọi được, phòng khi người dùng đổi tháng hoặc bấm "Đồng bộ ngay" ngay
  // lúc đang chọn khoản để gộp (tránh chọn nhầm sang khoản của dữ liệu mới tải về).
  function resetMergeSelectionState(){
    mergeMode = false;
    mergeSelectedIds = [];
    const toggleBtn = document.getElementById("mergeModeToggle");
    if(toggleBtn) toggleBtn.classList.remove("active");
    const ledgerBodyEl = document.getElementById("ledgerBody");
    if(ledgerBodyEl) ledgerBodyEl.classList.remove("merge-mode");
    document.body.classList.remove("merge-mode-active");
    const bar = document.getElementById("mergeActionbar");
    if(bar) bar.classList.remove("show");
  }

  function commit(){ monthsData[currentMonthKey] = entries; saveCache(); }

  // Bản lưu tạm (dùng khi mở app lúc mất mạng). Ghi GỘP: nhiều thay đổi liên tiếp chỉ serialize 1 lần (sau 250ms),
  // và luôn ghi nốt khi app bị ẩn / đóng (xem khối "Lưu khi ẩn app" ở cuối). Hàng đợi đồng bộ thì vẫn lưu NGAY (saveQueue),
  // nên thay đổi chưa gửi không phụ thuộc vào bản lưu tạm này.
  const CACHE_SAVE_DELAY_MS = 250;
  let cacheTimer = null, cacheDirty = false, cacheFrozen = false, storageWarnAt = 0;
  function warnStorageFull(msg){
    const now = Date.now();
    if(now - storageWarnAt < 60000) return; // tối đa 1 lần/phút, tránh dội thông báo
    storageWarnAt = now;
    try{ showToast(msg, "error", 12000); }catch(e){ /* chưa dựng xong giao diện */ }
  }
  function writeCacheNow(){
    clearTimeout(cacheTimer); cacheTimer = null;
    if(!cacheDirty || cacheFrozen) return;
    cacheDirty = false;
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({ months: monthsData, current: currentMonthKey }));
    }catch(e){
      warnStorageFull("Bộ nhớ trên máy đã đầy: không ghi được bản lưu để dùng khi mất mạng. Dữ liệu vẫn được gửi lên Google Sheet.");
    }
  }
  function saveCache(){
    if(cacheFrozen) return;
    cacheDirty = true;
    if(!cacheTimer) cacheTimer = setTimeout(writeCacheNow, CACHE_SAVE_DELAY_MS);
  }
  function flushCache(){ writeCacheNow(); }
  // Dùng khi xoá sạch dữ liệu trên máy: huỷ mọi lần ghi đang chờ và chặn ghi lại cho tới khi tải lại trang.
  function freezeCacheWrites(){ clearTimeout(cacheTimer); cacheTimer = null; cacheDirty = false; cacheFrozen = true; }
  function loadCache(){
    try{
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return false;
      const parsed = JSON.parse(raw);
      if(parsed && parsed.months && typeof parsed.months === "object"){
        monthsData = parsed.months;
        if(parsed.current && monthsData[parsed.current]) currentMonthKey = parsed.current;
        if(!Array.isArray(monthsData[currentMonthKey])) monthsData[currentMonthKey] = [];
        // BẮT BUỘC gán lại "entries": nếu thiếu, sổ vẫn hiển thị mảng mặc định (trống) dù cache có dữ liệu,
        // và lần thêm khoản chi kế tiếp (commit) sẽ ghi mảng trống đó đè lên dữ liệu đã lưu của tháng.
        entries = monthsData[currentMonthKey];
        return true;
      }
    }catch(e){ /* cache hỏng — bỏ qua, dùng dữ liệu mặc định */ }
    return false;
  }
  // =====================================================================
  //  BỘ MÁY ĐỒNG BỘ GOOGLE SHEET
  //  Mọi thao tác mạng với Sheet — gửi thay đổi, xoá/nhập cả tháng, tải về — chạy TUẦN TỰ qua 1 khoá duy nhất
  //  (withSyncLock), nên không bao giờ chồng chéo nhau. Quy tắc cốt lõi:
  //   1) Tải về (pull) luôn gửi nốt hàng đợi trước, rồi tải, rồi "phủ lại" các thay đổi chưa lên được Sheet
  //      lên dữ liệu vừa tải -> khoản vừa thêm không bao giờ biến mất khỏi màn hình.
  //   2) Phân loại lỗi: mất mạng/quá giờ -> tự thử lại; hết phiên -> chờ đăng nhập; cấu hình sai -> báo rõ;
  //      Sheet từ chối dữ liệu -> chuyển sang danh sách "bị từ chối", KHÔNG chặn các thay đổi phía sau.
  //   3) Xoá/nhập cả tháng đi cùng hàng đợi (đúng thứ tự, có thử lại), nên tháng đã xoá không "sống lại".
  //   4) Dòng trạng thái luôn tính từ tình hình thật (refreshSyncStatus), không còn nơi nào ghi đè lung tung.
  // =====================================================================
  const REJECTED_KEY = "so_chi_tieu:rejected:v1";
  const LAST_PULL_KEY = "so_chi_tieu:last_pull_at";
  const REQUEST_TIMEOUT_MS = 20000;                    // 1 request quá lâu -> coi như mất mạng, thử lại sau
  const RETRY_DELAYS_MS = [2000, 5000, 15000, 60000];  // nhịp thử lại khi lỗi tạm thời (mức cuối lặp lại)
  const AUTO_PULL_MIN_GAP_MS = 2 * 60 * 1000;          // quay lại app: chỉ tự tải nếu lần tải trước đã cách >= 2 phút
  const FATAL_ERROR_RE = /Sai token|Không rõ action|Chưa cấu hình/i; // lỗi cấu hình: thử lại vô ích

  let syncQueue = [];       // thay đổi chờ gửi lên Sheet (lưu localStorage để không mất khi đóng app)
  let rejectedItems = [];   // [{ item, error, at }] thay đổi bị Sheet từ chối — chờ người dùng quyết: thử lại / bỏ
  let syncSeq = 0;          // số thứ tự tăng dần của mỗi thay đổi (giữ đúng thứ tự khi phủ lại / thử lại)
  let syncTimer = null;     // hẹn giờ gửi (gộp nhiều thay đổi liên tiếp)
  let retryTimer = null;    // hẹn giờ thử lại sau lỗi tạm thời
  let retryAttempt = 0;
  let retryAt = 0;
  let statusTick = null;
  let syncLock = Promise.resolve();
  let syncInFlight = null;  // mục đang gửi dở
  let syncInFlightBatch = new Set(); // các mục đang gửi dở trong 1 yêu cầu gộp (updateEntries)
  let serverBatchOk = true; // false nếu Code.gs chưa hỗ trợ updateEntries -> gửi từng khoản (thử lại khi tải lại app)
  const SYNC_BATCH_MAX = 100;
  let syncPhase = "idle";   // idle | push | pull
  let lastSyncError = null; // { kind: "network" | "fatal", message }
  let startedWithCache = false;

  // Ghi 1 khoá QUAN TRỌNG (thay đổi chưa gửi). Hết chỗ -> hy sinh bản lưu tạm (tải lại được từ Sheet) để giữ hàng đợi
  // (không tải lại được); vẫn không được thì báo rõ cho người dùng thay vì im lặng.
  function persistCritical(key, json){
    try{ localStorage.setItem(key, json); return true; }catch(e){ /* thử dọn chỗ bên dưới */ }
    try{
      clearTimeout(cacheTimer); cacheTimer = null; cacheDirty = false;
      localStorage.removeItem(CACHE_KEY);
      localStorage.setItem(key, json);
      warnStorageFull("Bộ nhớ trên máy gần đầy: đã dọn bản lưu tạm để giữ các thay đổi chưa gửi. Hãy bấm Đồng bộ ngay khi có mạng.");
      return true;
    }catch(e){
      warnStorageFull("Không lưu được thay đổi chưa gửi vì bộ nhớ máy đã đầy. Hãy bấm Đồng bộ ngay TRƯỚC khi đóng app, nếu không có thể mất chúng.");
      return false;
    }
  }
  function saveQueue(){ return persistCritical(QUEUE_KEY, JSON.stringify(syncQueue)); }
  function saveRejected(){ return persistCritical(REJECTED_KEY, JSON.stringify(rejectedItems)); }
  function loadQueue(){
    try{
      const raw = localStorage.getItem(QUEUE_KEY);
      if(raw){ const parsed = JSON.parse(raw); if(Array.isArray(parsed)) syncQueue = parsed; }
    }catch(e){ /* ignore */ }
    try{
      const raw = localStorage.getItem(REJECTED_KEY);
      if(raw){ const parsed = JSON.parse(raw); if(Array.isArray(parsed)) rejectedItems = parsed.filter(r => r && r.item); }
    }catch(e){ /* ignore */ }
    // Mục lưu từ phiên bản cũ chưa có số thứ tự -> đánh số theo vị trí.
    let max = 0;
    syncQueue.forEach(it => { if(it && it.seq > max) max = it.seq; });
    rejectedItems.forEach(r => { if(r.item.seq > max) max = r.item.seq; });
    syncQueue.forEach(it => { if(!it.seq) it.seq = ++max; });
    rejectedItems.forEach(r => { if(!r.item.seq) r.item.seq = ++max; });
    syncSeq = max;
  }
  function pendingChangeCount(){ return syncQueue.length + rejectedItems.length; }
  function markPushed(){
    try{ localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); }catch(e){ /* ignore */ }
  }
  function markPulled(){
    try{ localStorage.setItem(LAST_PULL_KEY, String(Date.now())); }catch(e){ /* ignore */ }
  }
  function getLastSyncAt(){
    try{ const raw = localStorage.getItem(LAST_SYNC_KEY); return raw ? Number(raw) : null; }catch(e){ return null; }
  }
  function getLastPullAt(){
    try{ const raw = localStorage.getItem(LAST_PULL_KEY); return raw ? Number(raw) : null; }catch(e){ return null; }
  }

  // ---------- Khởi tạo ----------
  async function loadData(){
    startedWithCache = loadCache();
    loadQueue();
    renderMonthUI();
    render();
    renderAutoPullToggle();
    renderThemeToggle();
    refreshSyncStatus();
    if(!SHEET_SYNC_URL) return;
    // Tải về luôn gửi nốt hàng đợi trước; nếu tắt tự tải thì chỉ gửi nốt thay đổi còn treo từ phiên trước.
    if(getAutoPull()) await pullMonth(currentMonthKey);
    else if(syncQueue.length) await processSyncQueue();
    refreshSyncStatus();
  }

  // ---------- Dòng trạng thái: luôn tính từ tình hình thật ----------
  function setSyncStatus(text, isError){
    const el = document.getElementById("syncStatus");
    if(!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "var(--vk-soft)" : "var(--text-faint)";
  }
  // Thông báo tạm thời trên dòng trạng thái (vd. "Đã tải 2 tháng…"). Dùng MỘT bộ hẹn giờ chung: thông báo mới thay thông báo cũ
  // và huỷ hẹn giờ cũ, nên hẹn giờ của thông báo trước không xoá nhầm thông báo sau.
  let flashTimer = null;
  function flashSyncStatus(text, ms){
    clearTimeout(flashTimer);
    setSyncStatus(text, false);
    flashTimer = setTimeout(refreshSyncStatus, ms || 5000);
  }
  function fmtClock(ms){
    return new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  function refreshSyncStatus(){
    const el = document.getElementById("syncStatus");
    if(!el) return;
    const n = syncQueue.length, r = rejectedItems.length;
    let text, isError = false, clickable = false;
    if(!SHEET_SYNC_URL){
      text = "Chưa cấu hình đồng bộ Google Sheet"; isError = true;
    }else if(syncPhase === "push"){
      text = "Đang gửi " + n + " thay đổi lên Sheet…";
    }else if(syncPhase === "pull"){
      text = "Đang tải bản mới từ Sheet…";
    }else if(r > 0){
      text = "⚠ " + r + " thay đổi bị Sheet từ chối — bấm để xem"; isError = true; clickable = true;
    }else if(lastSyncError && n > 0){
      if(lastSyncError.kind === "fatal"){
        text = "⚠ " + lastSyncError.message + " — còn " + n + " thay đổi chưa gửi";
      }else{
        const wait = retryAt ? Math.max(1, Math.ceil((retryAt - Date.now()) / 1000)) : 0;
        text = "Chờ kết nối — còn " + n + " thay đổi chưa gửi" + (wait ? " (thử lại sau " + wait + "s)" : "");
      }
      isError = true;
    }else if(n > 0){
      text = "Còn " + n + " thay đổi chờ gửi…";
    }else if(lastSyncError){
      text = "Không tải được bản mới từ Sheet — " + lastSyncError.message; isError = true;
    }else{
      const push = getLastSyncAt(), pull = getLastPullAt();
      if(pull && Date.now() - pull >= STALE_SYNC_MS && !getAutoPull()){
        text = "⚠️ Đã " + Math.floor((Date.now() - pull) / 60000) + " phút chưa tải bản mới từ Sheet"; isError = true;
      }else if(pull && (!push || push <= pull || fmtClock(push) === fmtClock(pull))){
        text = "Đã đồng bộ lúc " + fmtClock(pull);
      }else if(pull){
        text = "Đã gửi lúc " + fmtClock(push) + " · tải bản mới lúc " + fmtClock(pull);
      }else if(push){
        text = "Đã gửi lên Sheet lúc " + fmtClock(push) + " · chưa tải bản mới";
      }else{
        text = startedWithCache ? "Đang xem dữ liệu lưu tạm — chưa đồng bộ" : "Chưa đồng bộ";
      }
    }
    setSyncStatus(text, isError);
    el.classList.toggle("clickable", clickable);
  }
  function startStatusTick(){
    if(statusTick) return;
    statusTick = setInterval(() => {
      refreshSyncStatus();
      if(!retryAt){ clearInterval(statusTick); statusTick = null; }
    }, 1000);
  }
  setInterval(refreshSyncStatus, 60000); // nhắc nhẹ nếu đã lâu chưa tải bản mới (khi tắt tự tải)

  // ---------- Gọi Sheet: phân loại lỗi ----------
  // kind: "network" (mất mạng / quá giờ / máy chủ lỗi tạm -> thử lại) | "auth" (hết phiên) |
  //       "fatal" (cấu hình sai) | "rejected" (Sheet từ chối dữ liệu này)
  class SyncError extends Error{
    constructor(kind, message){ super(message); this.kind = kind; }
  }
  async function sheetRequest(body, timeoutMs){
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || REQUEST_TIMEOUT_MS);
    let res = null, data = null;
    try{
      res = await fetch(SHEET_SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ token: SHEET_SYNC_TOKEN, sessionToken: sessionToken }, body)),
        signal: ctl.signal
      });
      data = await res.json().catch(() => null);
    }catch(err){
      throw new SyncError("network", (err && err.name === "AbortError") ? "Quá thời gian chờ máy chủ" : "Không kết nối được máy chủ");
    }finally{
      clearTimeout(timer);
    }
    if(data && data.authError) throw new SyncError("auth", data.error || "Hết phiên đăng nhập");
    noteSessionExp(data);
    if(!res.ok || !data) throw new SyncError("network", "Máy chủ trả về lỗi (HTTP " + res.status + ")");
    if(data.ok !== true){
      const msg = data.error || "Sheet từ chối thay đổi này";
      if(data.retryable) throw new SyncError("network", msg);
      if(FATAL_ERROR_RE.test(msg)) throw new SyncError("fatal", msg);
      throw new SyncError("rejected", msg);
    }
    return data;
  }
  function toSyncError(err){
    return (err instanceof SyncError) ? err : new SyncError("network", (err && err.message) || "Lỗi không xác định");
  }

  // ---------- Hàng đợi ----------
  function withSyncLock(fn){
    const run = syncLock.then(() => fn());
    syncLock = run.then(() => {}, () => {});
    return run;
  }
  // Gộp thay đổi cùng 1 khoản chi còn nằm chờ trong hàng đợi (chưa gửi): thêm rồi sửa vài lần = 1 request thay vì nhiều
  // (mỗi request tới Apps Script mất 1–3 giây, chạy tuần tự). Không bao giờ đụng tới mục ĐANG gửi dở.
  function isUpsertAction(a){ return a === "addEntry" || a === "updateEntry"; }
  function findMergeTarget(item){
    if(!item.entry || item.entry.id == null) return -1;
    if(!isUpsertAction(item.action) && item.action !== "deleteEntry") return -1;
    const id = String(item.entry.id);
    for(let i = syncQueue.length - 1; i >= 0; i--){
      const q = syncQueue[i];
      if(q.monthKey !== item.monthKey) continue;
      if(q.action === "syncMonth" || q.action === "deleteMonth") return -1; // mốc cấp tháng: không gộp vượt qua
      if(!q.entry || String(q.entry.id) !== id) continue;
      return (q === syncInFlight || syncInFlightBatch.has(q)) ? -1 : i;   // mục đang gửi dở: để yên, xếp sau nó
    }
    return -1;
  }
  // Nhiều lệnh "sửa khoản" liền nhau cùng 1 tháng (vd. dọn ghi chú hàng loạt) -> gửi gộp 1 yêu cầu thay vì mỗi khoản 1–3 giây.
  function collectUpdateBatch(){
    const first = syncQueue[0];
    if(!first || first.action !== "updateEntry" || !first.entry) return null;
    const batch = [first];
    for(let i = 1; i < syncQueue.length && batch.length < SYNC_BATCH_MAX; i++){
      const q = syncQueue[i];
      if(q.action !== "updateEntry" || q.monthKey !== first.monthKey || !q.entry) break;
      batch.push(q);
    }
    return batch.length >= 2 ? batch : null;
  }
  function enqueueItem(item){
    const idx = findMergeTarget(item);
    if(idx >= 0){
      const t = syncQueue[idx];
      if(isUpsertAction(t.action) && isUpsertAction(item.action)){
        t.entry = item.entry;                       // chỉ giữ bản mới nhất của khoản này
        saveQueue(); refreshSyncStatus();
        return t;
      }
      if(isUpsertAction(t.action) && item.action === "deleteEntry"){
        syncQueue.splice(idx, 1);                   // sửa/thêm chưa gửi rồi xoá luôn -> bỏ mục cũ
        if(t.action === "addEntry" && !t.attempts){ // thêm mà chưa từng thử gửi: server chưa biết gì -> khỏi cần gửi xoá
          saveQueue(); refreshSyncStatus();
          return t;
        }
      }else if(t.action === "deleteEntry" && item.action === "deleteEntry"){
        return t;                                   // xoá trùng
      }
    }
    item.seq = ++syncSeq;
    item.attempts = 0;
    syncQueue.push(item);
    saveQueue();
    refreshSyncStatus();
    return item;
  }
  function scheduleSync(delay){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { processSyncQueue(); }, delay);
  }
  function queueSync(action, entry){
    if(!SHEET_SYNC_URL) return;
    enqueueItem({ action, monthKey: currentMonthKey, entry });
    scheduleSync(500);
  }
  // Bỏ các thay đổi CHƯA gửi của 1 tháng (sắp bị xoá/ghi đè nguyên tháng nên vô nghĩa). Giữ mục đang gửi dở để thứ tự vẫn đúng.
  function purgePending(monthKey){
    syncQueue = syncQueue.filter(it => it.monthKey !== monthKey || it === syncInFlight || syncInFlightBatch.has(it));
    rejectedItems = rejectedItems.filter(r => r.item.monthKey !== monthKey);
    saveQueue();
    saveRejected();
  }
  function queueDeleteMonth(monthKey){
    if(!SHEET_SYNC_URL) return;
    purgePending(monthKey);
    enqueueItem({ action: "deleteMonth", monthKey });
    scheduleSync(300);
  }
  function queueSyncMonth(monthKey, monthEntries){
    purgePending(monthKey);
    return enqueueItem({ action: "syncMonth", monthKey, entries: monthEntries });
  }
  function buildPayload(item){
    if(item.action === "syncMonth") return { action: "syncMonth", monthKey: item.monthKey, entries: item.entries || [] };
    if(item.action === "deleteMonth") return { action: "deleteMonth", monthKey: item.monthKey };
    return { action: item.action, monthKey: item.monthKey, entry: item.entry };
  }
  function removeFromQueue(item){
    const i = syncQueue.indexOf(item);
    if(i >= 0) syncQueue.splice(i, 1);
  }
  function scheduleRetry(){
    clearTimeout(retryTimer);
    const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
    retryAttempt++;
    retryAt = Date.now() + delay;
    retryTimer = setTimeout(() => { retryAt = 0; processSyncQueue(); }, delay);
    startStatusTick();
  }
  function signedIn(){ return !GOOGLE_CLIENT_ID || !!sessionRecord; }

  // Gửi lần lượt các mục trong hàng đợi (CHỈ gọi bên trong withSyncLock). Trả về { ok } hoặc { ok:false, kind }.
  async function drainQueue(){
    clearTimeout(syncTimer);
    clearTimeout(retryTimer);
    retryAt = 0;
    if(!SHEET_SYNC_URL) return { ok: true };
    if(!syncQueue.length){ lastSyncError = null; return { ok: true }; }
    if(!signedIn()) return { ok: false, kind: "auth" }; // chưa đăng nhập: đăng nhập xong loadData() sẽ chạy lại
    syncPhase = "push";
    refreshSyncStatus();
    let result = { ok: true };
    const staleMonths = new Set(); // tháng có thay đổi bị server bỏ qua vì khoản đó đã có bản mới hơn (từ thiết bị khác)
    let staleCount = 0;
    try{
      let singleMode = false; // gửi từng khoản (khi gửi gộp bị từ chối hoặc Code.gs chưa hỗ trợ)
      while(syncQueue.length){
        const item = syncQueue[0];
        const batch = (serverBatchOk && !singleMode) ? collectUpdateBatch() : null;
        syncInFlight = item;
        if(batch) batch.forEach(b => syncInFlightBatch.add(b));
        try{
          if(batch){
            const resp = await sheetRequest({ action: "updateEntries", monthKey: item.monthKey, entries: batch.map(b => b.entry) });
            const skipped = (resp && resp.staleIds ? resp.staleIds.length : 0) + (resp && resp.missingIds ? resp.missingIds.length : 0);
            if(skipped){ staleCount += skipped; if(item.monthKey) staleMonths.add(item.monthKey); }
            batch.forEach(removeFromQueue);
          }else{
            const resp = await sheetRequest(buildPayload(item));
            if(resp && resp.stale){ staleCount++; if(item.monthKey) staleMonths.add(item.monthKey); }
            removeFromQueue(item);
          }
          saveQueue();   // xong -> lưu ngay, tránh gửi lại nếu tải lại trang
          markPushed();
          retryAttempt = 0;
          lastSyncError = null;
        }catch(raw){
          const err = toSyncError(raw);
          if(batch && (err.kind === "rejected" || /Không rõ action/i.test(err.message))){
            // Gửi gộp không được (Code.gs cũ, hoặc 1 khoản trong lô bị từ chối): quay về gửi TỪNG khoản để chỉ khoản lỗi bị tách riêng.
            if(/Không rõ action/i.test(err.message)) serverBatchOk = false;
            singleMode = true;
            continue;
          }
          (batch || [item]).forEach(b => { b.attempts = (b.attempts || 0) + 1; });
          if(err.kind === "rejected"){
            // Sheet từ chối RIÊNG mục này (lỗi dữ liệu) -> tách ra, các mục phía sau vẫn được gửi.
            removeFromQueue(item);
            rejectedItems.push({ item, error: err.message, at: Date.now() });
            saveQueue();
            saveRejected();
            continue;
          }
          if(err.kind === "auth"){
            result = { ok: false, kind: "auth" };
            handleSyncAuthError({ authError: true, error: err.message });
            break;
          }
          lastSyncError = { kind: err.kind, message: err.message }; // network | fatal: dừng, giữ nguyên hàng đợi
          result = { ok: false, kind: err.kind };
          saveQueue();
          console.warn("sync:", err.kind, err.message);
          break;
        }finally{
          syncInFlight = null;
          syncInFlightBatch.clear();
        }
      }
    }finally{
      syncPhase = "idle";
    }
    if(!result.ok && result.kind === "network") scheduleRetry();
    refreshSyncStatus();
    if(staleCount) handleStaleWrites(staleMonths, staleCount);
    return result;
  }
  // Server giữ bản mới hơn (do thiết bị kia sửa sau) nên bỏ qua bản vừa gửi: báo cho người dùng và tải ngay bản trên Sheet,
  // để màn hình khớp với Sheet thay vì còn hiện bản cũ tới lần tải kế tiếp.
  function handleStaleWrites(months, count){
    showToast((count > 1 ? count + " thay đổi của bạn không được ghi" : "Thay đổi của bạn không được ghi") +
      " vì khoản chi đó vừa được sửa mới hơn ở thiết bị khác. Đang tải bản mới.", "info", 7000);
    // Hẹn sang lượt sau: ta đang ở trong khoá đồng bộ, gọi pullMonth ngay sẽ chờ chính mình.
    setTimeout(() => { months.forEach((k) => { if(monthsData[k]) pullMonth(k); }); }, 0); // tháng đã xoá trên máy thì không tải về lại
  }
  function processSyncQueue(){ return withSyncLock(drainQueue); }

  // ---------- Tải về ----------
  // Phủ các thay đổi CHƯA lên được Sheet (hàng đợi + mục bị từ chối) lên dữ liệu vừa tải, theo đúng thứ tự thực hiện.
  function overlayPending(monthKey, remoteList){
    const map = new Map();
    remoteList.forEach(e => map.set(String(e.id), e));
    const ops = syncQueue.filter(it => it.monthKey === monthKey)
      .concat(rejectedItems.map(r => r.item).filter(it => it.monthKey === monthKey))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
    ops.forEach(it => {
      if(it.action === "addEntry" || it.action === "updateEntry"){
        if(it.entry && it.entry.id != null) map.set(String(it.entry.id), it.entry);
      }else if(it.action === "deleteEntry"){
        if(it.entry && it.entry.id != null) map.delete(String(it.entry.id));
      }else if(it.action === "deleteMonth"){
        map.clear();
      }else if(it.action === "syncMonth"){
        map.clear();
        (it.entries || []).forEach(e => map.set(String(e.id), e));
      }
    });
    return Array.from(map.values()).sort((a, b) => (Number(a.day) || 0) - (Number(b.day) || 0));
  }
  function pullMonth(monthKey, opts){
    opts = opts || {};
    if(!SHEET_SYNC_URL){
      if(opts.manual) showNotice("Chưa cấu hình SHEET_SYNC_URL. Xem hướng dẫn đồng bộ Google Sheet.");
      return Promise.resolve({ ok: false, kind: "fatal" });
    }
    return withSyncLock(() => pullMonthLocked(monthKey, opts));
  }
  async function pullMonthLocked(monthKey, opts){
    if(!signedIn()) return { ok: false, kind: "auth" };
    const drained = await drainQueue(); // gửi nốt thay đổi còn treo TRƯỚC khi tải
    if(!drained.ok){
      if(opts.manual && drained.kind !== "auth") showNotice("Chưa gửi hết thay đổi lên Sheet nên chưa tải được bản mới: " + ((lastSyncError && lastSyncError.message) || "lỗi kết nối"));
      return drained;
    }
    syncPhase = "pull";
    refreshSyncStatus();
    try{
      const data = await sheetRequest({ action: "fetchMonth", monthKey });
      const merged = overlayPending(monthKey, Array.isArray(data.entries) ? data.entries : []);
      monthsData[monthKey] = merged;
      saveCache();
      if(monthKey === currentMonthKey){
        entries = monthsData[monthKey];
        resetMergeSelectionState(); // danh sách vừa được làm mới -> các id đang chọn để gộp có thể không còn đúng nữa
        try{ render(); }catch(err){ showErrorBanner("render sau khi đồng bộ: " + err.message); }
      }
      markPulled();
      lastSyncError = null;
      retryAttempt = 0;
      return { ok: true };
    }catch(raw){
      const err = toSyncError(raw);
      if(err.kind === "auth"){
        handleSyncAuthError({ authError: true, error: err.message });
      }else{
        lastSyncError = { kind: err.kind === "fatal" ? "fatal" : "network", message: err.message };
        if(opts.manual) showNotice("Đồng bộ Google Sheet thất bại: " + err.message);
      }
      console.warn("pull:", err.kind, err.message);
      return { ok: false, kind: err.kind };
    }finally{
      syncPhase = "idle";
      refreshSyncStatus();
    }
  }

  // Mở app / quay lại app / có mạng lại: gửi nốt hàng đợi, và (nếu bật tự tải) tải bản mới nếu lần tải trước đã cũ.
  function onAppResume(force){
    if(!SHEET_SYNC_URL || !signedIn()) return;
    if(force) retryAttempt = 0;
    const last = getLastPullAt();
    const due = force || !last || (Date.now() - last >= AUTO_PULL_MIN_GAP_MS);
    if(getAutoPull() && due) pullMonth(currentMonthKey); // pullMonth tự gửi nốt hàng đợi trước
    else if(syncQueue.length) processSyncQueue();
    refreshSyncStatus();
  }
  document.addEventListener("visibilitychange", () => {
    if(document.visibilityState === "visible") onAppResume(false);
  });
  window.addEventListener("online", () => onAppResume(true));

  // ---------- Danh sách thay đổi bị Sheet từ chối ----------
  const rejectedOverlay = document.getElementById("rejectedOverlay");
  const rejectedList = document.getElementById("rejectedList");
  const rejectedActions = document.getElementById("rejectedActions");
  const ACTION_LABEL = {
    addEntry: "Thêm khoản chi", updateEntry: "Sửa khoản chi", deleteEntry: "Xoá khoản chi",
    deleteMonth: "Xoá cả tháng", syncMonth: "Nhập dữ liệu cả tháng"
  };
  function describeItem(it){
    let what = monthLabel(it.monthKey);
    if(it.entry && it.entry.name) what = it.entry.name + " · " + what;
    return (ACTION_LABEL[it.action] || it.action) + " — " + what;
  }
  function renderRejected(){
    if(!rejectedItems.length){
      rejectedList.innerHTML = '<p class="devices-empty">Không còn thay đổi nào bị từ chối.</p>';
      rejectedActions.style.display = "none";
      return;
    }
    rejectedActions.style.display = "";
    rejectedList.innerHTML = rejectedItems.map((r) =>
      '<div class="device-row">' +
        '<div class="device-info">' +
          '<div class="device-name">' + escapeHtml(describeItem(r.item)) + "</div>" +
          '<div class="device-meta">Lý do: ' + escapeHtml(r.error) + "</div>" +
        "</div>" +
        '<div class="rejected-btns">' +
          '<button type="button" class="mini-btn" data-rj-retry="' + r.item.seq + '">Thử lại</button>' +
          '<button type="button" class="mini-btn danger" data-rj-drop="' + r.item.seq + '">Bỏ</button>' +
        "</div>" +
      "</div>"
    ).join("");
  }
  function openRejectedModal(){
    renderRejected();
    rejectedOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeRejectedModal(){
    rejectedOverlay.classList.remove("show");
    resumeParticleBg();
  }
  function retryRejected(which){
    const take = rejectedItems.filter(r => which === "all" || r.item.seq === which);
    if(!take.length) return;
    rejectedItems = rejectedItems.filter(r => !take.includes(r));
    take.forEach(r => { r.item.attempts = 0; syncQueue.push(r.item); });
    syncQueue.sort((a, b) => (a.seq || 0) - (b.seq || 0)); // giữ đúng thứ tự thực hiện ban đầu
    saveQueue();
    saveRejected();
    lastSyncError = null;
    retryAttempt = 0;
    renderRejected();
    refreshSyncStatus();
    processSyncQueue().then(() => { renderRejected(); refreshSyncStatus(); });
  }
  function dropRejected(which){
    const before = rejectedItems.length;
    rejectedItems = rejectedItems.filter(r => !(which === "all" || r.item.seq === which));
    if(rejectedItems.length === before) return;
    saveRejected();
    renderRejected();
    refreshSyncStatus();
    // Đưa màn hình về đúng dữ liệu đang có trên Sheet (khoản đã bỏ sẽ biến mất / khoản định xoá sẽ hiện lại).
    pullMonth(currentMonthKey).then(() => { renderRejected(); });
  }
  rejectedList.addEventListener("click", (e) => {
    const retryBtn = e.target.closest("[data-rj-retry]");
    const dropBtn = e.target.closest("[data-rj-drop]");
    if(retryBtn) retryRejected(Number(retryBtn.dataset.rjRetry));
    else if(dropBtn) dropRejected(Number(dropBtn.dataset.rjDrop));
  });
  document.getElementById("rejectedRetryAll").addEventListener("click", () => retryRejected("all"));
  document.getElementById("rejectedDropAll").addEventListener("click", () => dropRejected("all"));
  document.getElementById("rejectedClose").addEventListener("click", closeRejectedModal);
  rejectedOverlay.addEventListener("click", (e) => { if(e.target === rejectedOverlay) closeRejectedModal(); });
  document.getElementById("syncStatus").addEventListener("click", () => {
    if(rejectedItems.length) openRejectedModal();
  });


  // ---------- Month switching ----------
  function renderMonthUI(){
    const titleEl = document.getElementById("monthTitle");
    if(titleEl) titleEl.textContent = monthLabel(currentMonthKey);
    populateLedgerDayFilter();
    const list = document.getElementById("monthList");
    if(!list) return;
    const keys = Object.keys(monthsData).sort().reverse();
    list.innerHTML = keys.map(k =>
      '<div class="month-item-row">' +
        '<button type="button" class="month-item' + (k === currentMonthKey ? " active" : "") + '" data-month="' + escapeHtml(k) + '">' +
          escapeHtml(monthLabel(k)) +
        '</button>' +
        '<button type="button" class="month-delete-btn" data-delete-month="' + escapeHtml(k) + '" aria-label="Xoá ' + escapeHtml(monthLabel(k)) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>' +
        '</button>' +
      '</div>'
    ).join("");
  }
  function switchMonth(key, opts){
    if(!monthsData[key]) monthsData[key] = [];
    currentMonthKey = key;
    entries = monthsData[key];
    resetMergeSelectionState(); // đổi tháng -> các id đang chọn để gộp không còn hợp lệ nữa
    saveCache(); // nhớ lại tháng đang xem, để lần mở app sau tự mở đúng tháng này
    renderMonthUI();
    render();
    if(SHEET_SYNC_URL && getAutoPull() && !(opts && opts.skipPull)) pullMonth(key);
  }

  // ---------- Derived computations ----------
  function computeTotals(){
    const t = {};
    CATS.forEach(c => t[c.id] = sumBy(entries, c.id));
    return t;
  }
  function computeBalance(t){
    const half = (t.ck_tinh - t.vk_tinh) / 2;
    const debt = t.vk_thieu - t.ck_thieu;
    const third = (t.ck_chung - t.vk_chung) / 3;
    return { half, debt, third, net: half + debt + third };
  }

  // ---------- Rendering ----------
  function render(){
    const totals = computeTotals();
    const balance = computeBalance(totals);
    const grandTotal = entries.reduce((s,e) => s + Number(e.amount||0), 0);

    renderHero(totals, balance, grandTotal);
    renderCatGrid(totals, grandTotal);
    renderDayChart();
    renderLedger();
  }

  // Số tiền chính: phần số to, đơn vị ₫ nhỏ và mờ hơn (không còn trông như chữ "đ" bị gạch chân dính vào số).
  function setHeroAmount(el, text){
    let intEl = el.firstElementChild, unitEl = intEl && intEl.nextElementSibling;
    if(!intEl || !unitEl || !intEl.classList.contains("bn-int")){
      el.textContent = "";
      intEl = document.createElement("span"); intEl.className = "bn-int";
      unitEl = document.createElement("span"); unitEl.className = "bn-unit";
      el.appendChild(intEl); el.appendChild(unitEl);
    }
    const i = text.lastIndexOf(" ");
    intEl.textContent = i > 0 ? text.slice(0, i) : text;
    unitEl.textContent = i > 0 ? text.slice(i + 1) : "";
    el.setAttribute("aria-label", text);
  }
  // Tự chỉnh cỡ chữ để số lớn nhất có thể mà vẫn nằm gọn cạnh sơ đồ V → C (số 7-8 chữ số vẫn không bị tràn/xuống dòng).
  let fitHeroRaf = 0, fitHeroLastW = 0;
  function fitHeroAmount(){
    const num = document.getElementById("balanceNumber");
    const row = num && num.parentElement;
    const flow = row && row.querySelector(".balance-flow");
    if(!num || !row || !flow || !num.dataset.final) return;
    num.style.fontSize = "";                                  // về cỡ tối đa theo CSS
    const maxPx = parseFloat(getComputedStyle(num).fontSize) || 36;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 12;
    const avail = row.clientWidth - flow.offsetWidth - gap - 4;
    if(avail <= 40) return;
    const probe = num.cloneNode(false);
    probe.className = "balance-number";
    probe.removeAttribute("id");
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;flex:none;width:auto;font-size:100px;white-space:nowrap;";
    setHeroAmount(probe, num.dataset.final);
    row.appendChild(probe);
    const w100 = probe.getBoundingClientRect().width;
    row.removeChild(probe);
    if(!w100) return;
    const fit = Math.floor((avail / w100) * 100 * 2) / 2;
    num.style.fontSize = Math.max(22, Math.min(maxPx, fit)) + "px";
  }
  (function watchHeroAmount(){
    const row = document.querySelector(".balance-main");
    const refit = () => {
      if(fitHeroRaf) return;
      fitHeroRaf = requestAnimationFrame(() => { fitHeroRaf = 0; fitHeroAmount(); });
    };
    if(row && window.ResizeObserver){
      new ResizeObserver(() => {
        const w = row.clientWidth;
        if(Math.abs(w - fitHeroLastW) < 1) return; // chỉ phản ứng khi CHIỀU RỘNG đổi, tránh vòng lặp
        fitHeroLastW = w; refit();
      }).observe(row);
    }
    window.addEventListener("resize", refit, { passive: true });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(refit); // font tải xong chữ số đổi độ rộng -> tính lại
  })();

  function renderHero(totals, balance, grandTotal){
    const ownerLabel = document.getElementById("ownerLabel");
    const balNum = document.getElementById("balanceNumber");
    const beam = document.getElementById("beamGroup");
    const hangerLeft = document.getElementById("hangerLeft");
    const hangerRight = document.getElementById("hangerRight");
    const balanceCard = document.getElementById("balanceCard");
    const ownerIcon = document.getElementById("ownerIcon");

    const isZero = Math.abs(balance.net) < 0.01;
    const dir = isZero ? "zero" : (balance.net > 0 ? "to-chong" : "to-vk");
    ownerLabel.textContent = isZero ? "Đã cân bằng" : (balance.net > 0 ? "Vợ đang nợ Chồng" : "Chồng đang nợ Vợ");
    const balTarget = isZero ? 0 : Math.abs(balance.net);
    const balChanged = Math.abs(Number(balNum.dataset.animVal || 0) - balTarget) >= 0.001;
    animateValue(balNum, balTarget, money, setHeroAmount);
    balNum.dataset.final = money(balTarget);
    balNum.className = "balance-number " + dir;
    fitHeroAmount();
    if(balChanged && balNum.dataset.seen === "1" && !prefersReducedMotion() && document.documentElement.getAttribute("data-perf") !== "lite"){
      balNum.classList.remove("bn-bump"); void balNum.offsetWidth; balNum.classList.add("bn-bump");
    }
    balNum.dataset.seen = "1";
    balanceCard.className = "balance-card " + dir;
    ownerIcon.style.color = isZero ? "var(--zero)" : (dir === "to-chong" ? "var(--chong-soft)" : "var(--vk-soft)");
    ownerIcon.innerHTML = isZero
      ? '<path d="M20 6 9 17l-5-5"/>'
      : '<path d="M12 2v20M2 12h6M16 12h6M5 6l3 3M19 6l-3 3"/>';

    const tiltMax = 12;
    const tiltRatio = Math.max(-1, Math.min(1, balance.net / Math.max(1, grandTotal*0.15)));
    const tilt = isZero ? 0 : (balance.net > 0 ? 1 : -1) * tiltMax * Math.min(1, Math.abs(tiltRatio)+0.35);
    beam.style.transform = "rotate(" + tilt + "deg)";

    // Pans hang straight down under gravity: the cord+pan groups are
    // translated (not rotated) so their attach point rides the tilted
    // beam while the hex pan itself always stays level, same as
    // can-bang.html's rig.
    const PIVOT_X = 400, PIVOT_Y = 189, ARM = 190;
    const theta = tilt * Math.PI / 180;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    const leftAttachX  = PIVOT_X - ARM * cosT;
    const leftAttachY  = PIVOT_Y - ARM * sinT;
    const rightAttachX = PIVOT_X + ARM * cosT;
    const rightAttachY = PIVOT_Y + ARM * sinT;
    hangerLeft.style.transform  = "translate(" + (leftAttachX  - 210) + "px, " + (leftAttachY  - 189) + "px)";
    hangerRight.style.transform = "translate(" + (rightAttachX - 590) + "px, " + (rightAttachY - 189) + "px)";

    const wrapCk = (s) => '<b class="c-ck">' + s + '</b>';
    const wrapVk = (s) => '<b class="c-vk">' + s + '</b>';
    function valueBadge(val, elId){
      const el = document.getElementById(elId);
      const isZero = Math.abs(val) < 0.01;
      const dir = isZero ? "zero" : (val > 0 ? "to-chong" : "to-vk");
      el.className = "val-badge " + dir;
      let arrowEl = el.querySelector(".val-arrow");
      let numEl = el.querySelector(".val-num");
      if(!numEl){
        el.innerHTML = '<span class="val-arrow"></span><span class="val-num"></span>';
        arrowEl = el.querySelector(".val-arrow");
        numEl = el.querySelector(".val-num");
      }
      arrowEl.innerHTML = isZero ? "" : (val > 0
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>');
      animateValue(numEl, Math.abs(val));
    }

    document.getElementById("calcHalf").innerHTML =
      "(" + wrapCk(money(totals.ck_tinh)) + " − " + wrapVk(money(totals.vk_tinh)) + ") / 2";
    valueBadge(balance.half, "valHalf");

    document.getElementById("calcDebt").innerHTML =
      wrapCk(money(totals.ck_thieu)) + " − " + wrapVk(money(totals.vk_thieu));
    valueBadge(balance.debt, "valDebt");

    document.getElementById("calcThird").innerHTML =
      "(" + wrapCk(money(totals.ck_chung)) + " − " + wrapVk(money(totals.vk_chung)) + ") / 3";
    valueBadge(balance.third, "valThird");

    // 3 ô tóm tắt ngay trên thẻ số dư (không cần mở "chi tiết cách tính" mới thấy)
    function setChip(id, val){
      const el = document.getElementById(id);
      if(!el) return;
      const z = Math.abs(val) < 0.01;
      el.className = "bchip " + (z ? "zero" : (val > 0 ? "to-chong" : "to-vk"));
      animateValue(el.querySelector("b"), z ? 0 : Math.abs(val));
    }
    setChip("chipHalf", balance.half);
    setChip("chipDebt", balance.debt);
    setChip("chipThird", balance.third);

    animateValue(document.getElementById("grandTotal"), grandTotal);
    animateValue(document.getElementById("entryCount"), entries.length, (v) => String(Math.round(v)));
  }

  function renderCatGrid(totals, grandTotal){
    const grid = document.getElementById("catGrid");
    const maxVal = Math.max(0, ...CATS.map(c => totals[c.id] || 0));
    const needsRebuild = grid.children.length !== CATS.length ||
      CATS.some((c, i) => grid.children[i] && grid.children[i].dataset.cat !== c.id);
    if(needsRebuild){
      grid.innerHTML = CATS.map(c => (
        '<div class="cat-item" data-cat="' + c.id + '">' +
          '<div class="cat-item-top">' +
            '<span class="dot" style="background:' + c.color + '"></span>' +
            '<span class="cat-label"><span class="cat-label-text"></span><span class="cat-top-tag"></span></span>' +
            '<span class="cat-amount">0 ₫</span>' +
          '</div>' +
          '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:0%;background:' + c.color + '"></div></div>' +
        '</div>'
      )).join("");
    }
    CATS.forEach(c => {
      const item = grid.querySelector('.cat-item[data-cat="' + c.id + '"]');
      if(!item) return;
      const v = totals[c.id] || 0;
      const pct = grandTotal ? (v/grandTotal*100) : 0;
      const isTop = v > 0 && v === maxVal;
      item.classList.toggle("top-cat", isTop);
      item.querySelector(".cat-label-text").textContent = c.label.replace(/\s*·\s*chia\s*\d+/i, "");
      item.querySelector(".cat-top-tag").innerHTML = isTop
        ? '<span class="top-tag"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.1 18.2 21l-1.7-7.1L22 9.2l-7.2-.6Z"/></svg>Cao nhất</span>'
        : '';
      animateValue(item.querySelector(".cat-amount"), v);
      item.querySelector(".cat-bar-fill").style.width = pct + "%";
    });
  }

  // ---------- Biểu đồ chi tiêu: theo TUẦN (mặc định) hoặc theo NGÀY ----------
  // Tuần tính từ Thứ 2 đến Chủ nhật (khớp lịch chọn ngày): tuần đầu và tuần cuối của tháng có thể ngắn hơn 7 ngày.
  const CHART_MODE_KEY = "so_chi_tieu:chart_mode"; // "week" | "day"
  let chartMode = (function(){
    try{ return localStorage.getItem(CHART_MODE_KEY) === "day" ? "day" : "week"; }catch(e){ return "week"; }
  })();
  function setChartMode(mode){
    chartMode = mode === "day" ? "day" : "week";
    try{ localStorage.setItem(CHART_MODE_KEY, chartMode); }catch(e){ /* ignore */ }
    renderDayChart();
  }
  // Số tiền đang lưu theo đơn vị nghìn đồng -> rút gọn cho nhãn trên cột (vd. 850k, 1,2tr).
  function compactMoney(thousands){
    const v = Number(thousands) || 0;
    if(v <= 0) return "";
    if(v >= 1000) return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v / 1000) + "tr";
    return Math.round(v) + "k";
  }
  function monthWeekInfo(monthKey){
    const total = daysInMonthKey(monthKey);
    const parts = String(monthKey).split("-");
    const y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    const dow = (y && m) ? new Date(y, m - 1, 1).getDay() : 1; // 0=CN..6=T7
    const lead = (dow + 6) % 7;                                // số ô trống trước ngày 1 (Thứ 2 = 0)
    const weeks = Math.ceil((total + lead) / 7);
    const ranges = [];
    for(let w = 0; w < weeks; w++){
      ranges.push({ start: Math.max(1, w * 7 - lead + 1), end: Math.min(total, (w + 1) * 7 - lead) });
    }
    return { total, weeks, lead, ranges, weekOf: (d) => Math.min(weeks - 1, Math.floor((d - 1 + lead) / 7)) };
  }
  const weekRangeLabel = (r) => r.start === r.end ? String(r.start) : r.start + "–" + r.end;
  // Ngày lạc ngoài tháng (vd. nhập file có "ngày 31" cho tháng 30 ngày) được gộp vào ngày cuối để tổng biểu đồ luôn khớp tổng tháng.
  const clampDayToMonth = (d, total) => Math.min(total, Math.max(1, Number(d) || 1));

  function setPeakCaption(html){
    document.getElementById("peakCaption").innerHTML = html;
    document.getElementById("peakCaptionCollapsed").innerHTML = html;
  }
  function peakCaptionHtml(label, boldText, amount){
    return '<div class="peak-caption">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h7l-1 8 11-13h-8z"/></svg>' +
      label + ' <b>' + boldText + '</b> · ' + money(amount) +
    '</div>';
  }
  function isRealCurrentMonthKey(key){
    const now = new Date();
    const parts = String(key).split("-");
    return now.getFullYear() === parseInt(parts[0], 10) && (now.getMonth() + 1) === parseInt(parts[1], 10);
  }

  function renderDayChart(){
    const title = document.getElementById("chartTitle");
    if(title) title.textContent = chartMode === "week" ? "Chi tiêu theo tuần" : "Chi tiêu theo tháng";
    document.querySelectorAll(".chart-mode-btn").forEach(btn => {
      const on = btn.dataset.mode === chartMode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.getElementById("weekPager").hidden = chartMode !== "week";
    if(chartMode === "week") renderWeekChart(); else renderDailyChart();
  }

  const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  // Biểu đồ theo tuần xem MỖI LẦN 1 tuần: 7 cột Thứ 2 -> Chủ nhật, dưới mỗi cột là thứ + số ngày.
  // Ô ngoài tháng (tuần đầu/cuối) để mờ. Mặc định mở tuần chứa hôm nay (nếu đang xem tháng hiện tại), không thì Tuần 1.
  let chartWeek = null, chartWeekMonth = null; // tuần đang xem (0 = Tuần 1) và tháng của nó
  function ensureChartWeek(info){
    if(chartWeek === null || chartWeekMonth !== currentMonthKey){
      chartWeekMonth = currentMonthKey;
      chartWeek = isRealCurrentMonthKey(currentMonthKey) ? info.weekOf(new Date().getDate()) : 0;
    }
    chartWeek = Math.min(info.weeks - 1, Math.max(0, chartWeek));
    return chartWeek;
  }
  // Hiệu ứng chuyển tuần: cả biểu đồ trượt vào theo hướng bấm, các cột mọc lên lần lượt (nảy nhẹ), số tiền bay theo đỉnh cột,
  // tiêu đề trượt đổi chữ, cột cao nhất loé sáng. Tự tắt khi bật "giảm chuyển động" hoặc chế độ Tiết kiệm pin.
  let chartAnimDir = null;   // null = cập nhật tại chỗ; -1/1 = hướng chuyển tuần; 0 = hiện ra không trượt (đổi tháng/kiểu xem)
  let chartSlideAnim = null;
  const chartAnimOk = () =>
    !prefersReducedMotion() &&
    document.documentElement.getAttribute("data-perf") !== "lite" &&
    typeof Element.prototype.animate === "function";
  function shiftChartWeek(delta){
    if(chartMode !== "week") return;
    const info = monthWeekInfo(currentMonthKey);
    ensureChartWeek(info);
    const next = Math.min(info.weeks - 1, Math.max(0, chartWeek + delta));
    if(next === chartWeek) return;
    chartWeek = next;
    chartAnimDir = delta > 0 ? 1 : -1;
    renderDayChart();
  }

  function renderWeekChart(){
    const info = monthWeekInfo(currentMonthKey);
    const w = ensureChartWeek(info);
    const daySums = {};
    entries.forEach(e => {
      const d = clampDayToMonth(e.day, info.total);
      daySums[d] = (daySums[d] || 0) + Number(e.amount || 0);
    });
    const dayMax = Math.max(1, ...Object.values(daySums));   // thang chiều cao chung cả tháng -> lật qua các tuần vẫn so sánh được
    const weekSums = new Array(info.weeks).fill(0);
    for(let d = 1; d <= info.total; d++) weekSums[info.weekOf(d)] += daySums[d] || 0;
    const weekMax = Math.max(...weekSums);
    const isPeakWeek = weekSums[w] > 0 && weekSums[w] === weekMax;

    const chart = document.getElementById("dayChart");
    const key = "week:" + currentMonthKey;
    let rebuilt = false;
    if(chart.dataset.key !== key){ // đổi tháng hoặc đổi kiểu xem -> dựng lại 7 cột (chuyển tuần chỉ cập nhật tại chỗ nên cột "mọc" mượt)
      rebuilt = true;
      chart.dataset.key = key;
      chart.classList.add("week-mode");
      let html = "";
      for(let k = 0; k < 7; k++){
        html += '<div class="day-col" role="button"><span class="col-amt"></span>' +
                '<div class="day-bar" style="height:3%;opacity:0.18"></div>' +
                '<div class="col-tick"><span></span></div></div>';
      }
      chart.innerHTML = html;
    }
    const todayD = isRealCurrentMonthKey(currentMonthKey) ? new Date().getDate() : -1;
    let dir = chartAnimDir; chartAnimDir = null;
    const animate = chartAnimOk() && (dir !== null || rebuilt);
    if(dir === null) dir = 0;
    if(animate){ // đưa mọi cột về vạch 0 (không transition) rồi mới cho mọc lên đúng giá trị
      if(chartSlideAnim){ chartSlideAnim.cancel(); chartSlideAnim = null; }
      for(let k = 0; k < 7; k++){
        const b0 = chart.children[k].querySelector(".day-bar"), a0 = chart.children[k].querySelector(".col-amt");
        b0.style.transition = "none"; b0.style.height = "3%";
        a0.style.transition = "none"; a0.style.opacity = "0"; a0.style.bottom = "3%";
      }
      void chart.offsetWidth; // chốt trạng thái đầu trước khi gán giá trị cuối
    }
    let peakK = -1, peakAmt = 0;
    for(let k = 0; k < 7; k++){
      const col = chart.children[k];
      const d = w * 7 - info.lead + k + 1;
      const valid = d >= 1 && d <= info.total;
      col.classList.toggle("empty", !valid);
      col.classList.toggle("is-now", valid && d === todayD);
      col.querySelector(".col-tick span").textContent = WEEKDAY_SHORT[k];
      const bar = col.querySelector(".day-bar");
      const amtEl = col.querySelector(".col-amt");
      bar.classList.remove("peak");
      if(!valid){
        delete col.dataset.day;
        col.removeAttribute("title"); col.removeAttribute("aria-label");
        bar.style.height = "3%"; amtEl.textContent = ""; amtEl.style.bottom = "3%";
        if(!animate){ bar.style.transition = ""; amtEl.style.transition = ""; amtEl.style.opacity = ""; }
        continue;
      }
      col.dataset.day = String(d);
      const amt = daySums[d] || 0;
      const pct = amt ? Math.max(3, amt / dayMax * 78) : 3; // chừa chỗ phía trên cho nhãn số tiền
      const label = WEEKDAY_SHORT[k] + " · Ngày " + d + ": " + money(amt);
      col.title = label;
      col.setAttribute("aria-label", label);
      bar.style.height = pct + "%";
      bar.style.opacity = amt ? 1 : 0.18;
      amtEl.textContent = compactMoney(amt);
      amtEl.style.bottom = "calc(" + pct + "% + 3px)";
      if(animate){
        const delay = k * 45; // các cột mọc lần lượt từ T2 đến CN
        bar.style.transition = "height .62s cubic-bezier(.34,1.45,.64,1) " + delay + "ms, opacity .35s ease " + delay + "ms, filter .12s ease";
        amtEl.style.transition = "bottom .62s cubic-bezier(.34,1.45,.64,1) " + delay + "ms, opacity .35s ease " + (delay + 200) + "ms";
        amtEl.style.opacity = amt ? "1" : "0";
      } else {
        bar.style.transition = ""; amtEl.style.transition = ""; amtEl.style.opacity = "";
      }
      if(amt > peakAmt){ peakAmt = amt; peakK = k; }
    }
    if(peakK >= 0) chart.children[peakK].querySelector(".day-bar").classList.add("peak");

    // thanh chuyển tuần
    const pager = document.getElementById("weekPager");
    pager.hidden = false;
    document.getElementById("weekPrev").disabled = w <= 0;
    document.getElementById("weekNext").disabled = w >= info.weeks - 1;
    const titleBtn = document.getElementById("weekTitle");
    titleBtn.querySelector("b").textContent = "Tuần " + (w + 1) + " / " + info.weeks;
    titleBtn.querySelector("small").textContent = "Ngày " + weekRangeLabel(info.ranges[w]) + " · " + money(weekSums[w]) + (isPeakWeek ? " · cao nhất tháng" : "");

    if(animate){
      const ease = "cubic-bezier(.22,1,.36,1)";
      chartSlideAnim = chart.animate(
        [{ transform: "translateX(" + (dir * 26) + "px)", opacity: 0.15 }, { transform: "translateX(0)", opacity: 1 }],
        { duration: 380, easing: ease }
      );
      titleBtn.querySelectorAll("b, small").forEach((el, i) => el.animate(
        [{ opacity: 0, transform: dir ? "translateX(" + (dir * 18) + "px)" : "translateY(5px)" }, { opacity: 1, transform: "none" }],
        { duration: 300, delay: i * 50, easing: ease, fill: "backwards" }
      ));
      if(peakK >= 0){ // cột cao nhất loé sáng sau khi mọc xong
        chart.children[peakK].querySelector(".day-bar").animate(
          [{ filter: "brightness(1.75)" }, { filter: "brightness(1)" }],
          { duration: 850, delay: peakK * 45 + 380, easing: "ease-out" }
        );
      }
    }

    if(peakK >= 0){
      const pd = w * 7 - info.lead + peakK + 1;
      setPeakCaption(peakCaptionHtml("Chi tiêu nhiều nhất tuần:", weekdayShortLabel(currentMonthKey, pd) + " · Ngày " + pd, peakAmt));
    } else {
      setPeakCaption("");
    }
  }

  function renderDailyChart(){
    const total = daysInMonthKey(currentMonthKey); // 28–31 ngày tuỳ tháng, không còn cố định 31 cột
    const map = {};
    entries.forEach(e => {
      const d = clampDayToMonth(e.day, total);
      map[d] = (map[d] || 0) + Number(e.amount || 0);
    });
    const max = Math.max(1, ...Object.values(map));
    let peakDay = null;
    Object.entries(map).forEach(([d, v]) => { if(v === max && v > 0) peakDay = Number(d); });

    const chart = document.getElementById("dayChart");
    const key = "day:" + total;
    if(chart.dataset.key !== key){
      chart.dataset.key = key;
      chart.classList.remove("week-mode");
      let html = "";
      for(let d = 1; d <= total; d++){
        html += '<div class="day-col" data-day="' + d + '" role="button">' +
                  '<div class="day-bar" style="height:3%;opacity:0.18"></div>' +
                  (d % 5 === 0 ? '<div class="day-tick">' + d + '</div>' : '') +
                '</div>';
      }
      chart.innerHTML = html;
    }
    for(let d = 1; d <= total; d++){
      const amt = map[d] || 0;
      const pct = amt / max * 100;
      const col = chart.children[d - 1];
      const label = "Ngày " + d + ": " + money(amt);
      col.title = label;
      col.setAttribute("aria-label", label);
      const bar = col.querySelector(".day-bar");
      bar.style.height = Math.max(3, pct) + "%";
      bar.style.opacity = amt ? 1 : 0.18;
      bar.classList.toggle("peak", d === peakDay);
    }
    setPeakCaption(peakDay ? peakCaptionHtml("Chi tiêu nhiều nhất tháng:", weekdayShortLabel(currentMonthKey, peakDay) + " · Ngày " + peakDay, max) : "");
  }

  let ledgerFilterText = "";
  let ledgerFilterCat = "";
  let ledgerFilterDay = "";
  let ledgerSortDir = "desc";

  function populateLedgerDayFilter(){
    if(!document.getElementById("ledgerDayGrid")) return;
    ledgerFilterDay = "";
    document.getElementById("ledgerDayTriggerLabel").textContent = "Tất cả ngày";
    buildDayCalendar(currentMonthKey, null, "ledgerDayGrid", "ledgerDayPanelTitle");
  }

  // Vuốt trái = mở form Sửa ngay; vuốt phải = hiện popup xác nhận Xoá ngay (không cần bấm nút riêng).
  const LEDGER_SWIPE_MAX = 64;      // giới hạn kéo tối đa (px) — chỉ để tạo hiệu ứng, không phải ngưỡng kích hoạt
  const LEDGER_SWIPE_TRIGGER = 44;  // kéo quá ngưỡng này rồi nhả tay mới kích hoạt Sửa/Xoá (vuốt ngắn)
  // Bộ lọc đang áp dụng cho sổ ghi chép (danh mục + ngày + ô tìm kiếm). Dùng chung cho hiển thị và cho "Dọn ghi chú".
  // Nút "Dọn ghi chú" cạnh ô tìm kiếm: khi ô đang có chữ thì sáng lên + chú thích cho biết sẽ dọn đúng cụm đó.
  function syncNoteCleanBtn(){
    const b = document.getElementById("noteCleanBtn");
    if(!b) return;
    const t = String(ledgerFilterText || "").trim();
    b.classList.toggle("has-search", !!t);
    const label = t ? "Dọn ghi chú “" + (t.length > 28 ? t.slice(0, 27) + "…" : t) + "”" : "Dọn ghi chú hàng loạt";
    b.setAttribute("aria-label", label);
    b.setAttribute("title", label);
  }
  function ledgerFilterPredicate(){
    const searchWords = stripDiacritics(ledgerFilterText).trim().split(/\s+/).filter(Boolean);
    return (e) => {
      if(ledgerFilterCat && e.category !== ledgerFilterCat) return false;
      if(ledgerFilterDay && Number(e.day) !== Number(ledgerFilterDay)) return false;
      if(searchWords.length){
        const cat = catById[e.category] || catById.ca_nhan;
        const haystack = stripDiacritics(e.name + " " + (e.note || "") + " " + cat.label + " " + money(e.amount) + " " + e.amount);
        if(!searchWords.every(w => haystack.includes(w))) return false;
      }
      return true;
    };
  }
  function renderLedger(){
    const body = document.getElementById("ledgerBody");
    const filtered = entries.filter(ledgerFilterPredicate());
    const sorted = filtered.slice().sort((a,b) =>
      (ledgerSortDir === "asc" ? a.day - b.day : b.day - a.day) || String(a.id).localeCompare(String(b.id))
    );

    const searchClearBtn = document.getElementById("ledgerSearchClear");
    if(searchClearBtn) searchClearBtn.classList.toggle("show", !!ledgerFilterText); // nút ✕ trong ô tìm kiếm: chỉ hiện khi có chữ
    syncNoteCleanBtn();

    if(sorted.length === 0){
      body.innerHTML = entries.length === 0
        ? '<div class="empty-state">Chưa có khoản chi nào. Bấm "Thêm khoản chi" để bắt đầu ghi sổ.</div>'
        : '<div class="empty-state">Không có khoản chi nào khớp với bộ lọc.<button type="button" class="empty-reset" data-act="reset-filters">Xoá bộ lọc</button></div>';
      return;
    }

    // Gom các khoản chi liền kề có cùng "day" thành từng cụm — vì `sorted` đã được sắp xếp
    // theo ngày làm tiêu chí chính nên các khoản cùng ngày luôn nằm cạnh nhau ở đây.
    const groups = [];
    let curGroup = null;
    sorted.forEach(e => {
      const d = Number(e.day);
      if(!curGroup || curGroup.day !== d){
        curGroup = { day: d, items: [] };
        groups.push(curGroup);
      }
      curGroup.items.push(e);
    });

    const now = new Date();
    const mkParts = String(currentMonthKey).split("-");
    const isRealCurrentMonth = now.getFullYear() === parseInt(mkParts[0], 10) && (now.getMonth() + 1) === parseInt(mkParts[1], 10);
    const todayDay = now.getDate();

    body.innerHTML = groups.map(g => {
      const dayTotal = g.items.reduce((s, e) => s + Number(e.amount || 0), 0);
      const dow = weekdayShortLabel(currentMonthKey, g.day);
      const isToday = isRealCurrentMonth && g.day === todayDay;
      const rowsHtml = g.items.map(e => {
        const c = catById[e.category] || catById.ca_nhan;
        const isMergeSelected = mergeMode && mergeSelectedIds.includes(e.id);
        return (
          '<div class="t-row-wrap' + (isMergeSelected ? " merge-selected" : "") + '" data-id="' + escapeHtml(e.id) + '" style="--c:' + c.color + '">' +
            '<div class="t-swipe-indicator t-swipe-delete-indicator" aria-hidden="true">' +
              '<svg width="18" height="18"><use href="#icon-trash-sprite"></use></svg>' +
              '<span>Xoá</span>' +
            '</div>' +
            '<div class="t-swipe-indicator t-swipe-edit-indicator" aria-hidden="true">' +
              '<svg width="18" height="18"><use href="#icon-edit-sprite"></use></svg>' +
              '<span>Sửa</span>' +
            '</div>' +
            '<div class="t-row" data-id="' + escapeHtml(e.id) + '">' +
              '<span class="t-merge-check" aria-hidden="true"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>' +
              '<span class="t-name">' + escapeHtml(e.name) + (e.note ? ' <span class="t-note">— ' + escapeHtml(e.note) + '</span>' : '') + '</span>' +
              '<span class="t-cat"><span class="badge" style="border-color:' + c.color + ';color:' + c.color + '">' + escapeHtml(c.label.replace(/\s*·\s*chia\s*\d+/i, "")) + '</span></span>' +
              '<span class="t-amt">' + money(e.amount) + '</span>' +
              '<span class="t-actions">' +
                '<button type="button" class="icon-btn" data-action="edit" aria-label="Sửa">' +
                  '<svg width="14" height="14"><use href="#icon-edit-sprite"></use></svg>' +
                '</button>' +
                '<button type="button" class="icon-btn" data-action="delete" aria-label="Xoá">' +
                  '<svg width="14" height="14"><use href="#icon-trash-sprite"></use></svg>' +
                '</button>' +
              '</span>' +
            '</div>' +
          '</div>'
        );
      }).join("");
      return (
        '<div class="ledger-day-group">' +
          '<div class="ledger-day-head">' +
            '<div class="ledger-day-head-left">' +
              '<span class="ledger-day-num">Ngày ' + g.day + '</span>' +
              (dow ? '<span class="ledger-day-dow">' + dow + '</span>' : '') +
              (isToday ? '<span class="ledger-day-today-tag">Hôm nay</span>' : '') +
            '</div>' +
            '<span class="ledger-day-total">' + money(dayTotal) + '</span>' +
          '</div>' +
          '<div class="ledger-day-rows">' + rowsHtml + '</div>' +
        '</div>'
      );
    }).join("");
  }

  // Đẩy toàn bộ dữ liệu 1 hoặc nhiều tháng lên Sheet (ghi đè) — dùng khi khôi phục từ file backup.
  // Đi qua hàng đợi chung nên đúng thứ tự, mất mạng sẽ tự thử lại; trả về tháng nào đã lên, tháng nào chưa.
  async function pushFullMonths(monthsObj){
    const items = Object.keys(monthsObj).map(k => queueSyncMonth(k, monthsObj[k] || []));
    await processSyncQueue();
    const succeeded = [];
    const failed = [];
    items.forEach(it => {
      const rejected = rejectedItems.find(r => r.item === it);
      if(rejected) failed.push({ monthKey: it.monthKey, error: rejected.error });
      else if(syncQueue.includes(it)) failed.push({ monthKey: it.monthKey, error: (lastSyncError && lastSyncError.message) || "chưa gửi được" });
      else succeeded.push(it.monthKey);
    });
    return { succeeded, failed };
  }

  // closeAllPopovers phải gọi được từ MỌI nơi (kể cả openLogoutModal/openDevicesModal nằm ngoài khối khởi tạo bên dưới).
  // Hàm thật được khai báo trong khối try{} nên chỉ nhìn thấy trong khối đó (file chạy "use strict"); ở đây là cầu nối ra ngoài.
  let closeAllPopoversImpl = null;
  function closeAllPopovers(except){ if(closeAllPopoversImpl) closeAllPopoversImpl(except); }

  // ---------- Modal / form ----------
  try{
  const modalOverlay = document.getElementById("modalOverlay");
  const entryForm = document.getElementById("entryForm");
  const fDay = document.getElementById("fDay");
  const fName = document.getElementById("fName");
  const fAmount = document.getElementById("fAmount");
  const fAmountPreview = document.getElementById("fAmountPreview");
  const fCategory = document.getElementById("fCategory");
  const fNote = document.getElementById("fNote");
  const fCategoryHint = document.getElementById("fCategoryHint");
  const modalTitle = document.getElementById("modalTitle");
  const submitBtn = document.getElementById("submitBtn");
  const submitBtnBottom = document.getElementById("submitBtnBottom");
  const cancelModalBottom = document.getElementById("cancelModalBottom");
  let formSnapshot = null; // lưu lại trạng thái form lúc vừa mở, để phát hiện có thay đổi chưa lưu hay không

  // Tự động viết hoa chữ cái đầu tiên của "Tên khoản chi" khi gõ (giữ nguyên vị trí con trỏ).
  fName.addEventListener("input", () => {
    const v = fName.value;
    const first = v.charAt(0);
    const upper = first.toUpperCase();
    if(first && first !== upper){
      const pos = fName.selectionStart, endPos = fName.selectionEnd;
      fName.value = upper + v.slice(1);
      fName.setSelectionRange(pos, endPos);
    }
  });

  // Tự động viết hoa chữ cái đầu tiên của "Ghi chú" khi gõ (giữ nguyên vị trí con trỏ).
  fNote.addEventListener("input", () => {
    const v = fNote.value;
    const first = v.charAt(0);
    const upper = first.toUpperCase();
    if(first && first !== upper){
      const pos = fNote.selectionStart, endPos = fNote.selectionEnd;
      fNote.value = upper + v.slice(1);
      fNote.setSelectionRange(pos, endPos);
    }
  });

  // Có phải đang gõ "công thức" (có phép tính) hay chỉ là 1 số đơn thuần?
  // vd. "15" -> không phải công thức; "10+20", "=15*2", "-5" (số âm) -> "-5" KHÔNG tính là công thức.
  function isAmountFormula(raw){
    let s = String(raw || "").trim();
    if(!s) return false;
    if(s[0] === "=") return true; // gõ kiểu "=..." luôn coi là công thức
    s = s.replace(/^-/, ""); // bỏ dấu trừ đầu (số âm đơn thuần), không tính là công thức
    return /[+\-*/()]/.test(s);
  }

  // Ô "Số tiền" GIỮ NGUYÊN chữ bạn gõ (kể cả công thức như "10+20") — không tự thay bằng kết quả,
  // để khi bấm "Sửa" lại, công thức gốc vẫn hiện ra chứ không chỉ hiện con số đã tính.
  // Kết quả tính được chỉ hiện ở dòng gợi ý nhỏ bên dưới ô, và số đó mới là số thực sự được lưu.
  function updateAmountValidity(){
    const val = fAmount.value.trim();
    if(!val){ fAmount.setCustomValidity(""); fAmountPreview.textContent = ""; return; }
    const result = evalAmountExpr(val);
    if(result === null || isNaN(result) || result < 0){
      fAmount.setCustomValidity("Số tiền không hợp lệ — chỉ gõ số hoặc phép tính cộng/trừ/nhân/chia, vd. 15 hoặc 10+20");
      fAmountPreview.textContent = isAmountFormula(val) ? "⚠️ Chưa tính được, kiểm tra lại phép tính" : "";
    }else{
      fAmount.setCustomValidity("");
      fAmountPreview.textContent = isAmountFormula(val) ? ("= " + money(result)) : "";
    }
  }
  fAmount.addEventListener("input", updateAmountValidity);
  fAmount.addEventListener("blur", updateAmountValidity);

  fCategory.innerHTML = CATS.map(c => '<option value="' + c.id + '">' + escapeHtml(c.label.replace(/\s*·\s*chia\s*\d+/i, "")) + '</option>').join("");
  fCategory.addEventListener("change", updateCategoryHint);
  function updateCategoryHint(){
    fCategoryHint.textContent = catById[fCategory.value].sub;
    setCatTrigger(fCategory.value);
  }
  function setCatTrigger(id){
    const c = catById[id];
    document.getElementById("catTriggerLabel").textContent = c.label.replace(/\s*·\s*chia\s*\d+/i, "");
    document.getElementById("catTriggerDot").style.background = c.color;
  }
  function buildCatList(selectedId){
    document.getElementById("catList").innerHTML = CATS.map(c =>
      '<button type="button" class="cat-option' + (c.id === selectedId ? " active" : "") + '" data-cat="' + c.id + '">' +
        '<span class="cat-dot" style="background:' + c.color + '"></span>' +
        '<span>' + escapeHtml(c.label.replace(/\s*·\s*chia\s*\d+/i, "")) + '</span>' +
      '</button>'
    ).join("");
  }

  function populateDayOptions(selectedDay){
    const total = daysInMonthKey(currentMonthKey);
    const opts = [];
    for(let d = 1; d <= total; d++) opts.push('<option value="' + d + '">Ngày ' + d + '</option>');
    fDay.innerHTML = opts.join("");
    const day = Math.max(1, Math.min(total, Number(selectedDay) || new Date().getDate()));
    fDay.value = String(day);
    document.getElementById("dayTriggerLabel").textContent = "Ngày " + day;
    buildDayCalendar(currentMonthKey, day);
  }
  let modalOpenedAt = 0; // mốc mở popup: chặn cú "click ma" ngay sau khi nhấn giữ (ngón tay nhấc lên đúng chỗ lớp phủ)
  let dupSourceId = null; // khác null khi popup đang mở ở chế độ "Nhân bản khoản chi" (id khoản gốc)
  const dupFromEl = document.getElementById("dupFrom");
  const dupFromTxt = document.getElementById("dupFromTxt");
  function resetDupModalState(){
    dupSourceId = null;
    if(dupFromEl) dupFromEl.hidden = true;
    entryForm.classList.remove("dup-open");
  }
  function openModal(mode, entry, customTitle, customSubmitLabel){
    resetDupModalState();
    modalOpenedAt = Date.now();
    editingId = entry ? entry.id : null;
    modalTitle.textContent = customTitle || (mode === "edit" ? "Sửa khoản chi" : "Thêm khoản chi");
    submitBtn.setAttribute("aria-label", customSubmitLabel || (mode === "edit" ? "Lưu" : "Thêm"));
    submitBtnBottom.textContent = customSubmitLabel || (mode === "edit" ? "Lưu thay đổi" : "Thêm vào sổ");
    populateDayOptions(entry ? entry.day : null);
    fName.value = entry ? entry.name : "";
    fAmount.value = entry ? (entry.amountFormula || entry.amount) : "";
    fAmount.setCustomValidity("");
    updateAmountValidity();
    fCategory.value = entry ? entry.category : "ca_nhan";
    fNote.value = entry ? (entry.note || "") : "";
    updateCategoryHint();
    buildCatList(fCategory.value);
    closeAllPopovers();
    modalOverlay.classList.add("show");
    pauseParticleBg();
    // Chụp lại trạng thái form ngay sau khi mở, để biết sau này người dùng có gõ/đổi gì hay chưa.
    formSnapshot = { day: fDay.value, name: fName.value, amount: fAmount.value, category: fCategory.value, note: fNote.value };
  }
  function hasUnsavedFormChanges(){
    if(!formSnapshot) return false;
    return fDay.value !== formSnapshot.day ||
      fName.value !== formSnapshot.name ||
      fAmount.value !== formSnapshot.amount ||
      fCategory.value !== formSnapshot.category ||
      fNote.value !== formSnapshot.note;
  }
  // Đóng popup có kiểm tra: nếu đang có nội dung chưa lưu (gõ dở, lỡ tay bấm ra ngoài...),
  // hỏi lại 1 lần trước khi đóng thật, tránh mất dữ liệu vừa nhập oan uổng.
  function attemptCloseModal(){
    if(hasUnsavedFormChanges()){
      openConfirm(
        "Huỷ khoản chi đang nhập?",
        "Thông tin bạn vừa nhập/sửa sẽ bị mất, không thể khôi phục lại. Bạn có chắc muốn huỷ?",
        "Huỷ bỏ",
        true,
        closeModal
      );
    } else {
      closeModal();
    }
  }
  function closeModal(){
    modalOverlay.classList.remove("show");
    editingId = null;
    formSnapshot = null;
    resetDupModalState();
    mergeSecondaryIds = []; // đóng popup (kể cả huỷ) -> luôn bỏ cờ "đang chờ gộp", tránh gộp nhầm ở lần Sửa kế tiếp
    entryForm.reset();
    closeDayPanel();
    closeCatPanel();
    resumeParticleBg();
  }

  document.getElementById("addBtn").addEventListener("click", () => openModal("add", null));
  document.getElementById("fabAddBtn").addEventListener("click", () => openModal("add", null));
  document.getElementById("cancelModal").addEventListener("click", attemptCloseModal);
  cancelModalBottom.addEventListener("click", attemptCloseModal);
  modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay && Date.now() - modalOpenedAt > 450) attemptCloseModal(); });

  // ---------- Confirm dialog helper ----------
  const confirmOverlay = document.getElementById("confirmOverlay");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmOkBtn = document.getElementById("confirmOkBtn");
  const confirmCancelBtn = document.getElementById("confirmCancelBtn");
  let confirmCallback = null;

  function openConfirm(title, message, okLabel, danger, onConfirm){
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmOkBtn.textContent = okLabel || "Xác nhận";
    confirmOkBtn.className = "btn-primary" + (danger ? " danger" : "");
    confirmCallback = onConfirm;
    confirmOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeConfirm(){
    confirmOverlay.classList.remove("show");
    confirmCallback = null;
    resumeParticleBg();
  }
  confirmOkBtn.addEventListener("click", () => {
    const cb = confirmCallback;
    closeConfirm();
    if(cb) cb();
  });
  confirmCancelBtn.addEventListener("click", closeConfirm);
  confirmOverlay.addEventListener("click", (e) => { if(e.target === confirmOverlay) closeConfirm(); });

  // ---------- Modal chi tiết (dùng chung cho cả "theo danh mục" và "theo ngày") ----------
  const catDetailOverlay = document.getElementById("catDetailOverlay");
  const catDetailPrevBtn = document.getElementById("catDetailPrev");
  const catDetailNextBtn = document.getElementById("catDetailNext");
  let currentDetailDay = null; // null khi đang xem theo danh mục; là số ngày khi đang xem theo ngày
  let currentDetailWeek = null; // số thứ tự tuần (0 = Tuần 1) khi đang xem chi tiết theo tuần; null nếu không

  function openEntryDetail(title, dotColor, rows, calc, showCat, showDay){
    const sorted = rows.slice().sort((a,b) => a.day - b.day || String(a.id).localeCompare(String(b.id)));
    const total = sorted.reduce((s,e) => s + Number(e.amount||0), 0);
    const includeDay = showDay !== false; // mặc định vẫn hiện "Ngày N" mỗi dòng (dùng khi xem theo danh mục, gồm nhiều ngày khác nhau)

    const dotEl = document.getElementById("catDetailDot");
    dotEl.style.background = dotColor || "transparent";
    dotEl.style.display = dotColor ? "" : "none";
    document.getElementById("catDetailTitle").textContent = title;
    document.getElementById("catDetailTotal").textContent = money(total);
    const countNumEl = document.getElementById("catDetailCount");
    const countLabelEl = document.getElementById("catDetailCountLabel");
    if(calc && calc.divisor){
      countNumEl.textContent = money(total / calc.divisor);
      countLabelEl.textContent = calc.label;
    } else {
      countNumEl.textContent = String(sorted.length);
      countLabelEl.textContent = "Khoản chi";
    }

    const list = document.getElementById("catDetailList");
    list.innerHTML = sorted.length === 0
      ? '<div class="cat-detail-empty">Chưa có khoản chi nào.</div>'
      : sorted.map(e => {
          const c = catById[e.category] || catById.ca_nhan;
          return (
            '<div class="cat-detail-row">' +
              '<div class="cat-detail-row-left">' +
                (includeDay ? '<span class="cat-detail-row-day">Ngày ' + e.day + '</span>' : '') +
                '<span class="cat-detail-row-name">' + escapeHtml(e.name) + (e.note ? ' <span class="t-note">— ' + escapeHtml(e.note) + '</span>' : '') + '</span>' +
              '</div>' +
              (showCat ? '<span class="badge" style="border-color:' + c.color + ';color:' + c.color + ';flex-shrink:0;margin:0 8px;">' + escapeHtml(c.label.replace(/\s*·\s*chia\s*\d+/i, "")) + '</span>' : '') +
              '<span class="cat-detail-row-amt">' + money(e.amount) + '</span>' +
            '</div>'
          );
        }).join("");

    // openEntryDetail cũng được gọi lại khi bấm nút "ngày trước/sau" lúc hộp thoại ĐANG mở
    // (xem catDetailPrevBtn/catDetailNextBtn bên dưới) -> chỉ pause khi thật sự đang mở mới,
    // tránh pause nhiều lần liên tiếp mà chỉ resume 1 lần khi đóng (làm nền hạt bị đứng im luôn).
    const wasAlreadyOpen = catDetailOverlay.classList.contains("show");
    closeAllPopovers();
    catDetailOverlay.classList.add("show");
    if(!wasAlreadyOpen) pauseParticleBg();
  }
  function openCatDetail(catId){
    const cat = catById[catId];
    if(!cat) return;
    currentDetailDay = null;
    currentDetailWeek = null;
    catDetailPrevBtn.style.display = "none";
    catDetailNextBtn.style.display = "none";
    const personLabel = cat.label.replace(/\s*·\s*chia\s*\d+/i, "");
    const m = cat.label.match(/chia\s*(\d+)/i);
    const calc = m ? { divisor: parseInt(m[1], 10), label: personLabel + " / " + m[1] } : null;
    openEntryDetail(personLabel, cat.color, entries.filter(e => e.category === catId), calc, false);
  }
  function openDayDetail(day){
    const total = daysInMonthKey(currentMonthKey);
    currentDetailDay = Math.min(total, Math.max(1, Number(day)));
    currentDetailWeek = null;
    catDetailPrevBtn.style.display = "";
    catDetailNextBtn.style.display = "";
    catDetailPrevBtn.disabled = currentDetailDay <= 1;
    catDetailNextBtn.disabled = currentDetailDay >= total;
    openEntryDetail("Ngày " + currentDetailDay, null, entries.filter(e => Number(e.day) === currentDetailDay), null, true, false);
  }
  // Xem chi tiết 1 tuần của tháng (bấm vào cột trong biểu đồ theo tuần); nút trước/sau chuyển sang tuần kề.
  function openWeekDetail(week){
    const info = monthWeekInfo(currentMonthKey);
    currentDetailWeek = Math.min(info.weeks - 1, Math.max(0, Number(week) || 0));
    currentDetailDay = null;
    catDetailPrevBtn.style.display = "";
    catDetailNextBtn.style.display = "";
    catDetailPrevBtn.disabled = currentDetailWeek <= 0;
    catDetailNextBtn.disabled = currentDetailWeek >= info.weeks - 1;
    const w = currentDetailWeek;
    const rows = entries.filter(e => info.weekOf(clampDayToMonth(e.day, info.total)) === w);
    openEntryDetail("Tuần " + (w + 1) + " · ngày " + weekRangeLabel(info.ranges[w]), null, rows, null, true, true);
  }
  catDetailPrevBtn.addEventListener("click", () => {
    if(currentDetailWeek !== null) openWeekDetail(currentDetailWeek - 1);
    else if(currentDetailDay !== null) openDayDetail(currentDetailDay - 1);
  });
  catDetailNextBtn.addEventListener("click", () => {
    if(currentDetailWeek !== null) openWeekDetail(currentDetailWeek + 1);
    else if(currentDetailDay !== null) openDayDetail(currentDetailDay + 1);
  });
  function closeCatDetail(){ catDetailOverlay.classList.remove("show"); resumeParticleBg(); }
  document.getElementById("catGrid").addEventListener("click", (e) => {
    const item = e.target.closest(".cat-item");
    if(!item) return;
    openCatDetail(item.dataset.cat);
  });
  document.getElementById("dayChart").addEventListener("click", (e) => {
    const dayCol = e.target.closest(".day-col[data-day]");
    if(dayCol) openDayDetail(dayCol.dataset.day);               // bấm 1 cột = chi tiết ngày đó
  });
  document.querySelectorAll(".chart-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => setChartMode(btn.dataset.mode));
  });
  document.getElementById("weekPrev").addEventListener("click", () => shiftChartWeek(-1));
  document.getElementById("weekNext").addEventListener("click", () => shiftChartWeek(1));
  document.getElementById("weekTitle").addEventListener("click", () => { if(chartWeek !== null) openWeekDetail(chartWeek); });
  (function(){ // vuốt ngang trên biểu đồ để chuyển tuần
    const chartEl = document.getElementById("dayChart");
    let sx = 0, sy = 0, tracking = false;
    chartEl.addEventListener("touchstart", (e) => {
      if(chartMode !== "week" || e.touches.length !== 1) return;
      tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    chartEl.addEventListener("touchend", (e) => {
      if(!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if(Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftChartWeek(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();
  document.getElementById("closeCatDetail").addEventListener("click", closeCatDetail);
  document.getElementById("catDetailCloseBtn").addEventListener("click", closeCatDetail);
  catDetailOverlay.addEventListener("click", (e) => { if(e.target === catDetailOverlay) closeCatDetail(); });

  // Khoá nút "Thêm"/"Lưu thay đổi" trong lúc saveEntryFromForm() đang xử lý, để tránh bấm đúp (rất dễ
  // xảy ra trên di động khi tay chạm nhanh 2 lần) gọi hàm 2 lần liên tiếp và vô tình tạo 2 khoản chi
  // từ đúng 1 lần người dùng định thêm. Luôn mở khoá lại trong khối finally bên dưới, kể cả khi có lỗi
  // hoặc form không hợp lệ, để không bao giờ bị kẹt nút "Thêm" ở trạng thái vô hiệu hoá vĩnh viễn.
  let isSubmittingEntry = false;
  function setEntrySubmitDisabled(disabled){
    isSubmittingEntry = disabled;
    submitBtn.disabled = disabled;
    submitBtnBottom.disabled = disabled;
  }
  function saveEntryFromForm(){
    if(isSubmittingEntry) return; // đang xử lý lần bấm trước đó rồi -> bỏ qua lần bấm thêm này
    setEntrySubmitDisabled(true);
    try{
      updateAmountValidity();
      if(typeof entryForm.reportValidity === "function" && !entryForm.reportValidity()) return;
      const day = Math.max(1, Math.min(daysInMonthKey(currentMonthKey), Number(fDay.value) || 1));
      const rawAmountInput = fAmount.value.trim();
      const evaluated = evalAmountExpr(rawAmountInput);
      const amount = (evaluated !== null && !isNaN(evaluated)) ? evaluated : 0;
      // Chỉ lưu công thức gốc nếu người dùng thực sự gõ 1 phép tính (vd. "10+20"),
      // để lần "Sửa" sau app hiện lại đúng công thức đó thay vì chỉ hiện con số 30.
      const amountFormula = isAmountFormula(rawAmountInput) ? rawAmountInput : "";
      const name = fName.value.trim() || "Khoản chi";
      const category = fCategory.value;
      const note = fNote.value.trim();

      if(editingId){
        const id = editingId;
        // Chụp lại danh sách khoản sẽ bị xoá NGAY LÚC NÀY (trước khi mở hộp thoại xác nhận),
        // tránh trường hợp state bị đổi trong lúc người dùng còn đang cân nhắc bấm xác nhận.
        const secondaryIds = mergeSecondaryIds.slice();
        const isMerging = secondaryIds.length > 0;
        openConfirm(
          isMerging ? "Gộp khoản chi?" : "Lưu thay đổi?",
          isMerging
            ? "Gộp " + (secondaryIds.length + 1) + " khoản chi thành \"" + name + "\" · " + money(amount) + "? " + (secondaryIds.length === 1 ? "Khoản còn lại sẽ" : "Các khoản còn lại sẽ") + " bị xoá, không thể hoàn tác."
            : "Xác nhận cập nhật khoản chi \"" + name + "\" · " + money(amount) + "?",
          isMerging ? "Gộp lại" : "Lưu thay đổi",
          isMerging, // dùng style cảnh báo (đỏ) vì thao tác này xoá dữ liệu, giống nút Xoá
          () => {
            try{
              const updated = Object.assign({}, entries.find(en => en.id === id), { day, name, amount, amountFormula, category, note, updatedAt: Date.now() });
              entries = entries.map(en => en.id === id ? updated : en);
              if(isMerging){
                entries = entries.filter(en => !secondaryIds.includes(en.id));
              }
              commit();
              closeModal();
              if(isMerging) setMergeMode(false); else render();
              queueSync("updateEntry", updated);
              secondaryIds.forEach(sid => queueSync("deleteEntry", { id: sid }));
            }catch(err){ showErrorBanner("save-edit: " + err.message); }
          }
        );
      }else{
        const newEntry = { id: genEntryId(), day, name, amount, amountFormula, category, note, updatedAt: Date.now() };
        const wasDuplicate = !!dupSourceId; // phải đọc TRƯỚC closeModal() vì closeModal() xoá cờ này
        entries.push(newEntry);
        commit();
        closeModal();
        render();
        queueSync("addEntry", newEntry);
        if(wasDuplicate) playDuplicateLanded(newEntry.id);
      }
    }catch(err){ showErrorBanner("submit: " + err.message); }
    finally{
      // Mở khoá ngay sau khi xử lý xong (kể cả nhánh đang "Sửa" chỉ mới mở hộp xác nhận chứ chưa lưu
      // thật) — vì lúc hộp xác nhận hiện lên, nó che hẳn nút Lưu của form gốc nên không còn bấm đúp
      // được nữa; việc lưu thật (trong callback của openConfirm) không tạo khoản chi mới trùng ID nên
      // không cần giữ khoá xuyên suốt lúc chờ người dùng xác nhận.
      setEntrySubmitDisabled(false);
    }
  }

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEntryFromForm();
  });
  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    saveEntryFromForm();
  });
  submitBtnBottom.addEventListener("click", (e) => {
    e.preventDefault();
    saveEntryFromForm();
  });

  // ================== Thêm khoản chi bằng giọng nói ==================
  // Chuỗi xử lý: Web Speech API (miễn phí, chạy ngay trên trình duyệt) -> bộ phân tích "tìm số tiền trước"
  // (vpParse) -> nếu chắc chắn thì thêm luôn (có Hoàn tác); nếu chưa chắc thì mở bảng xem lại để sửa trước khi ghi.
  //
  // Bộ phân tích nằm giữa 2 dòng <voice-parser> ... </voice-parser>: KHÔNG đụng tới giao diện hay dữ liệu của app,
  // mọi thứ cần biết (ngày hôm nay, tháng đang xem, lịch sử tên khoản chi) đều truyền qua tham số ctx -> chạy thử riêng được.
  // Đơn vị tiền của app là NGHÌN ĐỒNG: "20k", "hai mươi nghìn", "20.000" đều ra amount = 20.

  // <voice-parser>
  const VP_DIGIT = { "một":1, "mốt":1, "hai":2, "ba":3, "bốn":4, "tư":4, "năm":5, "lăm":5, "nhăm":5, "sáu":6, "bảy":7, "bẩy":7, "tám":8, "chín":9 };
  const VP_SCALE = { "nghìn":1e3, "ngàn":1e3, "k":1e3, "triệu":1e6, "tr":1e6, "củ":1e6, "tỷ":1e9, "tỉ":1e9 };
  const VP_HALF = { "rưỡi":1, "rưởi":1 };
  const VP_REL = { "nay":0, "qua":-1, "kia":-2, "kìa":-2 };
  const VP_PART = { "sáng":1, "trưa":1, "chiều":1, "tối":1, "đêm":1 };
  const VP_LIQUID = { "xăng":1, "dầu":1, "nước":1, "sữa":1, "bia":1, "rượu":1, "nhớt":1, "cồn":1 };
  // Danh từ chỉ số lượng: "2 ly", "3 cái"... -> con số đứng trước KHÔNG phải tiền.
  const VP_QTY = new Set(["cái","chai","kg","ký","cân","người","cây","hộp","con","quả","trái","ly","tô","chiếc","lần","phần","bát","gói","lọ","túi","lon","đôi","bó","vé","suất","tuần","tháng","tiếng","giờ","phút","bữa","lốc","thùng","mét","cm","gram","km","bộ","tấm","cuốn","quyển","cặp","hũ","chậu","buổi","viên","miếng","đĩa","chén","cốc","tờ","ngày","lít"]);
  // Từ đứng ngay trước con số cho biết đó là ngày/giờ/thứ chứ không phải tiền.
  const VP_NOT_MONEY_PREV = new Set(["thứ","tháng","lúc","tuần","quý","năm"]);
  // Từ neo đứng sát trước số tiền. "Mạnh" = chắc chắn đang nói về giá.
  const VP_ANCHOR_STRONG = new Set(["hết","giá","tốn","mất","tiền"]);
  const VP_ANCHOR_ALL = new Set(["hết","giá","tốn","mất","tiền","số","là","khoảng","tầm","cỡ","chừng","gần","tổng","bằng"]);
  const VP_SEP_STRONG = { "rồi":1, "tiếp":1 };
  const VP_SEP_WEAK = { "và":1, "với":1, "còn":1, "thêm":1, "cộng":1 };
  const VP_FILLER_LEAD = new Set(["thêm","cho","tôi","vào","sổ","khoản","chi","là","cái","một","mua","tên","ghi","nhập","đã","vừa","mới","giúp","hộ","đó"]);
  const VP_FILLER_TAIL = new Set(["nhé","nha","nhá","ạ","đấy","đó","thôi","nghen","nhỉ","rồi","luôn"]);
  const VP_CK = { chong:1, ck:1, anh:1 };
  const VP_VK = { vo:1, vk:1, em:1 };
  const VP_VERB = { tra:"tinh", chiu:"tinh", ung:"tinh", tinh:"tinh", chi:"tinh", bao:"tinh", dong:"tinh", thieu:"thieu", no:"thieu" };
  const VP_ANCHORS = [["nguoi","thanh","toan"],["ai","thanh","toan"],["ai","tra"],["ai","mua"],["ai","tinh"],["danh","muc"],["loai","chi","tieu"],["loai"]];
  const VP_CATWORD = { chong:1, vo:1, ck:1, vk:1, anh:1, em:1, tinh:1, tra:1, chiu:1, ung:1, chung:1, thieu:1, no:1, ca:1, nhan:1, rieng:1, la:1, cua:1, thanh:1, toan:1 };

  function vpNorm(s){ return String(s == null ? "" : s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim(); }
  // Bỏ dấu từng ký tự (1 ký tự -> 1 ký tự) để vị trí chữ không bị lệch so với bản có dấu.
  function vpFold(s){
    let out = "";
    for(let i = 0; i < s.length; i++){
      const ch = s[i];
      if(ch === "đ"){ out += "d"; continue; }
      const f = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      out += f.length === 1 ? f : ch;
    }
    return out;
  }
  // Khoá so khớp tên khoản chi (dùng để nhớ "cà phê" thường do ai trả).
  function vpNameKey(name){ return vpFold(vpNorm(name)).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
  const vpPad = (n) => (n < 10 ? "0" : "") + n;
  const vpHas = (o, k) => k !== null && Object.prototype.hasOwnProperty.call(o, k);

  // "20.000" / "20,000" -> nghìn nhóm; "1,5" / "1.5" -> số thập phân.
  function vpDigits(t){
    if(/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) return { v: Number(t.replace(/\./g, "").replace(",", ".")), grouped: true };
    if(/^\d{1,3}(\.\d{3})+$/.test(t)) return { v: Number(t.replace(/\./g, "")), grouped: true };
    if(/^\d{1,3}(,\d{3})+$/.test(t)) return { v: Number(t.replace(/,/g, "")), grouped: true };
    if(/^\d+([.,]\d+)?$/.test(t)) return { v: Number(t.replace(",", ".")), grouped: false };
    return null;
  }
  function vpTokens(raw){
    const out = [], re = /\d[\d.,]*\d|\d|[\p{L}\p{M}]+/gu;
    let m;
    while((m = re.exec(raw))){
      const t = m[0];
      const d = /^\d/.test(t) ? vpDigits(t) : null;
      if(/^\d/.test(t) && !d) continue;
      out.push({ t, f: vpFold(t), s: m.index, e: m.index + t.length, num: d ? d.v : null, grouped: d ? d.grouped : false });
    }
    return out;
  }

  // Số viết bằng chữ 1..999 bắt đầu ở token j: "hai trăm năm mươi", "mười lăm", "ba mươi mốt"...
  function vpReadSmall(tk, j){
    const W = (k) => { const x = tk[j + k]; return (x && x.num === null) ? x.t : null; };
    const dg = (w) => vpHas(VP_DIGIT, w) ? VP_DIGIT[w] : null;
    let v = 0, k = 0, any = false, colloq = false;
    const d0 = dg(W(0));
    if(d0 !== null && W(1) === "trăm"){
      v = d0 * 100; k = 2; any = true;
      if(W(k) === "linh" || W(k) === "lẻ"){ k++; const d = dg(W(k)); if(d !== null){ v += d; k++; } return { v, j2: j + k, colloq }; }
      if(vpHas(VP_HALF, W(k))){ v += 50; k++; return { v, j2: j + k, colloq }; }
    }
    if(W(k) === "mười"){
      v += 10; k++;
      const d = dg(W(k)); if(d !== null){ v += d; k++; }
      return { v, j2: j + k, colloq };
    }
    const dt = dg(W(k));
    if(dt !== null && (W(k + 1) === "mươi" || W(k + 1) === "chục")){
      v += dt * 10; k += 2;
      const d = dg(W(k)); if(d !== null){ v += d; k++; }
      return { v, j2: j + k, colloq };
    }
    if(dt !== null){
      if(any){ v += dt * 10; k++; colloq = true; } // "hai trăm năm" nói tắt = 250
      else { v = dt; k++; any = true; }
    }
    return any ? { v, j2: j + k, colloq } : null;
  }
  // Một "lượng": số bằng chữ số (có thể kèm "trăm"/"chục") hoặc số bằng chữ.
  function vpReadQuantity(tk, j){
    const t = tk[j];
    if(!t) return null;
    if(t.num !== null){
      let q = t.num, j2 = j + 1;
      const nx = tk[j2];
      if(nx && nx.num === null){
        if(nx.t === "trăm"){ q *= 100; j2++; if(tk[j2] && tk[j2].num === null && vpHas(VP_HALF, tk[j2].t)){ q += 50; j2++; } }
        else if(nx.t === "chục"){ q *= 10; j2++; }
      }
      return { q, j2, digit: true, grouped: t.grouped, colloq: false };
    }
    const r = vpReadSmall(tk, j);
    return r ? { q: r.v, j2: r.j2, digit: false, grouped: false, colloq: r.colloq } : null;
  }
  // Cụm tiền bắt đầu ở token i. Trả về null nếu không phải tiền.
  function vpMoneyAt(tk, i){
    let j = i, total = 0, lastScale = 0, hasUnit = false, digit = false, grouped = false, colloq = false, slang = false, any = false, first = true, dong = false;
    for(;;){
      let q = vpReadQuantity(tk, j);
      if(!q && first && tk[j] && tk[j].num === null && (tk[j].t === "triệu" || tk[j].t === "củ")) q = { q: 1, j2: j, digit: false, grouped: false, colloq: false }; // "triệu hai"
      if(!q) break;
      first = false;
      if(q.digit){ digit = true; if(q.grouped) grouped = true; }
      if(q.colloq) colloq = true;
      const nx = tk[q.j2];
      const sc = (nx && nx.num === null && vpHas(VP_SCALE, nx.t)) ? VP_SCALE[nx.t] : 0;
      if(sc && (lastScale === 0 || sc < lastScale)){
        total += q.q * sc; lastScale = sc; any = true; hasUnit = true; j = q.j2 + 1;
        if(nx.t === "củ") slang = true;
        if(tk[j] && tk[j].num === null && vpHas(VP_HALF, tk[j].t)){ total += sc / 2; j++; break; }
        continue;
      }
      if(lastScale === 0 && nx && nx.num === null && nx.t === "lít" && !vpHas(VP_LIQUID, tk[q.j2 + 1] ? tk[q.j2 + 1].t : null)){
        total += q.q * 1e5; slang = true; hasUnit = true; any = true; j = q.j2 + 1; break; // "hai lít" = 200 nghìn
      }
      if(lastScale === 0){
        total += q.q; any = true; j = q.j2;
        if(tk[j] && tk[j].num === null && /^(đồng|đ|vnd|vnđ)$/.test(tk[j].t)){ dong = true; hasUnit = true; j++; }
        break;
      }
      // Số đứng trơ sau "triệu": "3 triệu 5" = 3,5 triệu; "1 triệu 250" = 1,25 triệu.
      if(lastScale >= 1e6 && q.q > 0 && q.q < 1000){
        total += q.q < 10 ? q.q * lastScale / 10 : (q.q < 100 ? q.q * lastScale / 100 : q.q * lastScale / 1000);
        j = q.j2;
      }
      break; // sau "nghìn" không đọc số trơ (tránh "30 nghìn năm 2026" thành 30,5)
    }
    if(!any || total <= 0) return null;
    const bare = !hasUnit;
    const amount = Math.round((bare ? (total < 1000 ? total : total / 1000) : total / 1000) * 1000) / 1000;
    return { j, total, bare, amount, digit, grouped, colloq, slang, dong, hasUnit };
  }

  // "ngày 15", "mùng 5", "ngày 15 tháng 10" -> số ngày hợp lệ 1..max
  function vpReadDayNumber(tk, j, max){
    const t = tk[j];
    if(!t) return null;
    if(t.num !== null){ return (Number.isInteger(t.num) && t.num >= 1 && t.num <= max) ? { v: t.num, j2: j + 1 } : null; }
    const r = vpReadSmall(tk, j);
    return (r && r.v >= 1 && r.v <= max) ? { v: r.v, j2: r.j2 } : null;
  }
  // Tìm các cụm chỉ thời gian. Trả về [{s,e,kind:"rel"|"abs", offset|day|month}]
  function vpFindDates(tk){
    const out = [];
    for(let i = 0; i < tk.length; i++){
      const t = tk[i];
      if(t.num !== null) continue;
      const n1 = tk[i + 1], n2 = tk[i + 2];
      if((t.t === "hôm" || t.t === "bữa") && n1 && n1.num === null && vpHas(VP_REL, n1.t)){
        const s = (i > 0 && tk[i - 1].t === "ngày") ? i - 1 : i;
        out.push({ s, e: i + 1, kind: "rel", offset: VP_REL[n1.t] }); i += 1; continue;
      }
      if(vpHas(VP_PART, t.t) && n1 && n1.num === null){
        if(n1.t === "nay" || n1.t === "qua"){ out.push({ s: i, e: i + 1, kind: "rel", offset: n1.t === "nay" ? 0 : -1 }); i += 1; continue; }
        if(n1.t === "hôm" && n2 && n2.num === null && (n2.t === "nay" || n2.t === "qua")){ out.push({ s: i, e: i + 2, kind: "rel", offset: n2.t === "nay" ? 0 : -1 }); i += 2; continue; }
      }
      if(t.t === "ngày" || t.t === "mùng" || t.t === "mồng"){
        const r = vpReadDayNumber(tk, i + 1, 31);
        if(r){
          let e = r.j2 - 1, month = null;
          if(tk[r.j2] && tk[r.j2].num === null && tk[r.j2].t === "tháng"){
            const m = vpReadDayNumber(tk, r.j2 + 1, 12);
            if(m){ month = m.v; e = m.j2 - 1; }
          }
          out.push({ s: i, e, kind: "abs", day: r.v, month }); i = e; continue;
        }
      }
    }
    return out;
  }
  function vpResolveDate(spec, ctx){
    const now = ctx.now;
    if(!spec || spec.kind === "rel"){
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (spec ? spec.offset : 0));
      return { day: d.getDate(), monthKey: d.getFullYear() + "-" + vpPad(d.getMonth() + 1), bad: false, said: !!spec, rel: true };
    }
    const vy = parseInt(String(ctx.viewMonthKey).split("-")[0], 10) || now.getFullYear();
    const mk = spec.month ? (vy + "-" + vpPad(spec.month)) : ctx.viewMonthKey;
    const total = ctx.daysIn(mk);
    return { day: Math.min(spec.day, total), monthKey: mk, bad: spec.day > total, said: true, rel: false };
  }

  // Các ứng viên "số tiền" trong câu. tier: 3 = có đơn vị tiền / số có dấu nhóm nghìn, 2 = có từ neo (hết/giá/tốn...) hoặc lóng,
  // 1 = số trần, 0 = chỉ là chữ không có gì xác nhận.
  function vpFindCandidates(tk, used){
    const out = [];
    for(let i = 0; i < tk.length; ){
      if(used[i]){ i++; continue; }
      const prev = i > 0 && !used[i - 1] && tk[i - 1].num === null ? tk[i - 1].t : null;
      if(prev !== null && VP_NOT_MONEY_PREV.has(prev)){ i++; continue; }
      const r = vpMoneyAt(tk, i);
      if(!r){ i++; continue; }
      const nxt = tk[r.j] && tk[r.j].num === null ? tk[r.j].t : null;
      const payerAnchor = nxt === "người" && tk[r.j + 1] && tk[r.j + 1].f === "thanh"; // "850 người thanh toán ..." không phải "850 người"
      if(r.bare && nxt !== null && VP_QTY.has(nxt) && !payerAnchor){ i = Math.max(r.j, i + 1); continue; } // "2 ly", "3 cái"...
      // chuỗi từ neo đứng sát trước
      let a = i, strong = false;
      while(a - 1 >= 0 && !used[a - 1] && tk[a - 1].num === null && VP_ANCHOR_ALL.has(tk[a - 1].t)){ a--; if(VP_ANCHOR_STRONG.has(tk[a].t)) strong = true; }
      if(!strong) a = i; // chuỗi không có từ mạnh (vd. chỉ "là") thì không nuốt
      let tier;
      if((r.hasUnit && !r.slang) || r.grouped) tier = 3;
      else if(r.slang || strong) tier = 2;
      else tier = r.digit ? 1 : 0;
      out.push({ s: i, e: r.j - 1, a, strong, tier, r });
      i = r.j;
    }
    return out;
  }
  function vpFindSeparator(tk, a, b){
    let strong = -1, weak = -1;
    for(let k = a; k <= b; k++){
      const t = tk[k];
      if(!t || t.num !== null) continue;
      if(t.t === "sau" && tk[k + 1] && tk[k + 1].t === "đó" && k + 1 <= b){ strong = k; continue; }
      if(vpHas(VP_SEP_STRONG, t.t)) strong = k; else if(vpHas(VP_SEP_WEAK, t.t)) weak = k;
    }
    return strong >= 0 ? strong : weak;
  }

  // words: mảng từ đã bỏ dấu, vd. ["chong","tinh","chung"] -> "ck_chung"
  function vpCategory(w){
    const has = (x) => w.indexOf(x) !== -1;
    if(has("rieng") || (has("ca") && has("nhan"))) return "ca_nhan";
    const ck = has("chong") || has("ck") || has("anh");
    const vk = has("vo") || has("vk") || has("em");
    if(ck === vk) return null; // không có ai, hoặc nhắc cả hai -> mơ hồ
    const who = ck ? "ck" : "vk";
    if(has("thieu") || has("no")) return who + "_thieu";
    if(has("chung")) return who + "_chung";
    return who + "_tinh";
  }
  function vpFindPayer(tk, a, b, used){
    for(let i = a; i <= b; i++){
      if(used[i] || tk[i].num !== null) continue;
      for(const anc of VP_ANCHORS){
        let ok = true;
        for(let k = 0; k < anc.length; k++){
          const x = tk[i + k];
          if(!x || i + k > b || used[i + k] || x.num !== null || x.f !== anc[k]){ ok = false; break; }
        }
        if(!ok) continue;
        let j = i + anc.length, cnt = 0;
        const words = [];
        while(j <= b && !used[j] && tk[j].num === null && vpHas(VP_CATWORD, tk[j].f) && cnt < 5){ words.push(tk[j].f); j++; cnt++; }
        const cat = vpCategory(words);
        if(cat) return { s: i, e: j - 1, cat };
      }
      const f = tk[i].f;
      if(vpHas(VP_CK, f) || vpHas(VP_VK, f)){
        let j = i + 1;
        const x = tk[j];
        if(x && j <= b && !used[j] && x.num === null){
          let verb = null;
          if(x.f === "thanh" && tk[j + 1] && j + 1 <= b && tk[j + 1].f === "toan"){ verb = "tinh"; j += 2; }
          else if(vpHas(VP_VERB, x.f)){ verb = VP_VERB[x.f]; j += 1; }
          if(verb){
            const words = [f, verb];
            if(tk[j] && j <= b && !used[j] && tk[j].f === "chung"){ words.push("chung"); j++; }
            const cat = vpCategory(words);
            if(cat) return { s: i, e: j - 1, cat };
          }
        }
      }
    }
    return null;
  }

  function vpBuildName(tk, raw, a, b, used){
    let start = a;
    for(let k = a; k <= b; k++){ // "tên (là) X": chỉ lấy phần sau chữ "tên"
      if(!used[k] && tk[k].num === null && tk[k].t === "tên"){
        used[k] = true; start = k + 1;
        if(start <= b && tk[start] && !used[start] && tk[start].t === "là"){ used[start] = true; start++; }
        break;
      }
    }
    const keep = [];
    for(let k = start; k <= b; k++) if(!used[k]) keep.push(k);
    while(keep.length && tk[keep[0]].num === null && VP_FILLER_LEAD.has(tk[keep[0]].t)) keep.shift();
    while(keep.length && tk[keep[keep.length - 1]].num === null && VP_FILLER_TAIL.has(tk[keep[keep.length - 1]].t)) keep.pop();
    let out = "", prev = -1;
    keep.forEach((k) => {
      if(prev >= 0) out += (k === prev + 1) ? raw.slice(tk[prev].e, tk[k].s) : " ";
      out += tk[k].t; prev = k;
    });
    out = out.replace(/\s+/g, " ").replace(/^[\s,.:;\-–—]+|[\s,.:;\-–—]+$/g, "");
    return out ? out.charAt(0).toLocaleUpperCase("vi") + out.slice(1) : "";
  }

  // Phân tích 1 câu -> { ok, items:[{day,monthKey,name,amount,category,catSource,reasons[]}], multi, needsReview, reason }
  function vpParse(text, ctx){
    const raw = vpNorm(text);
    const res = { ok: false, raw, items: [], multi: false, needsReview: false, reason: "" };
    if(!raw){ res.reason = "Không nghe được gì cả, thử lại nhé."; return res; }
    const tk = vpTokens(raw), n = tk.length;
    const used = new Array(n).fill(false);
    const dates = vpFindDates(tk);
    dates.forEach(d => { for(let k = d.s; k <= d.e; k++) used[k] = true; });

    let cands = vpFindCandidates(tk, used);
    if(!cands.length){ res.reason = "Không nghe thấy số tiền. Thử nói kiểu \"cà phê hết 20k chồng trả\"."; return res; }
    if(cands.some(c => c.tier >= 1)) cands = cands.filter(c => c.tier >= 1); // chữ trơn chỉ dùng khi không còn gì khác

    // Chọn các khoản: nhiều số chỉ tách thành nhiều khoản khi có từ nối (rồi/và/với...) nằm giữa.
    let ambiguous = false;
    const kept = [], seps = [];
    cands.forEach((c) => {
      if(!kept.length){ kept.push(c); return; }
      const prev = kept[kept.length - 1];
      const sp = vpFindSeparator(tk, prev.e + 1, c.a - 1);
      if(sp >= 0){ kept.push(c); seps.push(sp); }
      else if(c.tier > prev.tier){ kept[kept.length - 1] = c; }       // một bên rõ ràng mạnh hơn -> lấy bên đó
      else if(c.tier === prev.tier){ ambiguous = true; kept[kept.length - 1] = c; } // ngang nhau -> lấy số sau, bắt xem lại
    });

    const firstDate = dates.length ? dates[0] : null;
    for(let m = 0; m < kept.length; m++){
      const c = kept[m];
      const segA = m === 0 ? 0 : seps[m - 1] + 1;
      const segB = m === kept.length - 1 ? n - 1 : seps[m] - 1;
      if(m < seps.length) used[seps[m]] = true;
      for(let k = c.a; k <= c.e; k++) used[k] = true;
      let payer = vpFindPayer(tk, segA, segB, used);
      if(!payer){ // "... 45k cá nhân", "... 45k riêng" (chỉ nhận khi đứng ngay sau số tiền, vì "đồ dùng cá nhân" có thể là tên khoản)
        const x = tk[c.e + 1], y = tk[c.e + 2];
        if(x && c.e + 1 <= segB && !used[c.e + 1] && x.f === "rieng") payer = { s: c.e + 1, e: c.e + 1, cat: "ca_nhan" };
        else if(x && y && c.e + 2 <= segB && !used[c.e + 1] && !used[c.e + 2] && x.f === "ca" && y.f === "nhan") payer = { s: c.e + 1, e: c.e + 2, cat: "ca_nhan" };
      }
      if(payer) for(let k = payer.s; k <= payer.e; k++) used[k] = true;
      const name = vpBuildName(tk, raw, segA, segB, used);
      const spec = dates.filter(d => d.s >= segA && d.s <= segB)[0] || firstDate;
      const when = vpResolveDate(spec, ctx);

      const reasons = [];
      const r = c.r;
      let category = "ca_nhan", catSource = "default";
      if(payer){ category = payer.cat; catSource = "said"; }
      else if(name && ctx.lookupCategory){
        const h = ctx.lookupCategory(vpNameKey(name));
        if(h && h.cat){
          category = h.cat; catSource = "history";
          if(!(h.n >= 2 && h.agree)) reasons.push("Người trả lấy theo lần ghi trước, kiểm tra lại nhé");
        }
      }
      if(!name) reasons.push("Chưa nghe rõ tên khoản chi");
      if(r.slang) reasons.push("Cách nói tắt (củ/lít), kiểm tra lại số tiền");
      if(c.tier === 0) reasons.push("Chưa chắc đây là số tiền");
      if(r.bare && (!Number.isInteger(r.total) || (r.total >= 1000 && r.total < 10000))) reasons.push("Chưa rõ đơn vị tiền");
      if(r.colloq) reasons.push("Nói tắt, kiểm tra lại số tiền");
      if(r.amount >= 1000) reasons.push("Số tiền lớn, kiểm tra lại nhé");
      if(r.amount < 1) reasons.push("Số tiền rất nhỏ, kiểm tra lại nhé");
      if(ambiguous) reasons.push("Trong câu có nhiều số, kiểm tra lại số tiền");
      if(when.bad) reasons.push("Ngày nói ra không có trong tháng này");
      if(when.monthKey !== ctx.viewMonthKey) reasons.push("Khoản này sẽ vào " + (ctx.monthLabel ? ctx.monthLabel(when.monthKey) : when.monthKey) + ", không phải tháng đang xem");
      res.items.push({ day: when.day, monthKey: when.monthKey, name, amount: r.amount, category, catSource, reasons });
    }
    res.ok = true;
    res.multi = res.items.length > 1;
    res.needsReview = res.multi || res.items.some(it => it.reasons.length > 0);
    return res;
  }

  // Nhiều phương án nhận diện: lấy phương án đầu có kết quả; nếu các phương án khác nghe ra số tiền khác -> bắt xem lại.
  function vpParseBest(alts, ctx){
    const list = (alts || []).filter(a => a && String(a).trim());
    if(!list.length) return { ok: false, raw: "", items: [], multi: false, needsReview: false, reason: "Không nghe được gì cả, thử lại nhé." };
    const parsed = list.slice(0, 5).map(a => vpParse(a, ctx));
    let pick = parsed.find(p => p.ok);
    if(!pick) return parsed[0];
    const idx = parsed.indexOf(pick);
    parsed.slice(idx + 1, idx + 3).forEach((o) => {
      if(!o.ok || o.items.length !== pick.items.length) return;
      if(o.items.some((it, k) => Math.abs(it.amount - pick.items[k].amount) > 1e-9)){
        pick.items.forEach(it => { if(it.reasons.indexOf("Nghe có nhiều cách hiểu số tiền") === -1) it.reasons.push("Nghe có nhiều cách hiểu số tiền"); });
        pick.needsReview = true;
      }
    });
    pick.heardAlts = list;
    return pick;
  }
  // </voice-parser>

  // ---------- Toast xác nhận + Hoàn tác ----------
  const voiceToastWrap = document.getElementById("voiceToastWrap");
  const voiceToastEl = document.getElementById("voiceToast");
  const voiceToastIconPath = document.getElementById("voiceToastIconPath");
  const voiceToastText = document.getElementById("voiceToastText");
  const voiceToastUndoBtn = document.getElementById("voiceToastUndoBtn");
  let voiceToastTimer = null;
  let voiceToastUndoHandler = null;

  function hideVoiceToast(){
    voiceToastWrap.classList.remove("show");
    clearTimeout(voiceToastTimer);
    voiceToastUndoHandler = null;
  }
  function showVoiceToast(isError, html, onUndo){
    clearTimeout(voiceToastTimer);
    voiceToastEl.classList.toggle("err", !!isError);
    voiceToastIconPath.setAttribute("d", isError ? "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" : "m5 13 4 4L19 7");
    voiceToastText.innerHTML = html;
    voiceToastUndoBtn.style.display = onUndo ? "" : "none";
    voiceToastUndoHandler = onUndo || null;
    voiceToastWrap.classList.add("show");
    voiceToastTimer = setTimeout(hideVoiceToast, 6000);
  }
  voiceToastUndoBtn.addEventListener("click", () => {
    const cb = voiceToastUndoHandler;
    hideVoiceToast();
    if(cb) cb();
  });

  // ---------- Ghi khoản chi lấy từ giọng nói vào sổ ----------
  // Gợi ý người trả theo lịch sử: "cà phê" lần trước ai trả thì lần này gợi ý như vậy (chỉ khi người dùng không nói).
  let voiceNameIndex = null;
  function voiceBuildIndex(){
    const idx = {};
    Object.keys(monthsData).forEach((mk) => {
      (monthsData[mk] || []).forEach((e) => {
        const k = vpNameKey(e.name);
        if(!k || !catById[e.category]) return;
        (idx[k] = idx[k] || []).push({ cat: e.category, t: Number(e.updatedAt) || 0, mk });
      });
    });
    Object.keys(idx).forEach((k) => idx[k].sort((a, b) => (b.t - a.t) || (a.mk < b.mk ? 1 : -1)));
    voiceNameIndex = idx;
  }
  function voiceLookupCategory(key){
    if(!voiceNameIndex) voiceBuildIndex();
    const hits = voiceNameIndex[key];
    if(!hits || !hits.length) return null;
    return { cat: hits[0].cat, n: hits.length, agree: hits.length >= 2 && hits[0].cat === hits[1].cat };
  }
  function voiceCtx(){
    return { now: new Date(), viewMonthKey: currentMonthKey, daysIn: daysInMonthKey, monthLabel, lookupCategory: voiceLookupCategory };
  }

  // items: [{ monthKey, day, name, amount, amountFormula, category }] -> trả về danh sách đã thêm (để Hoàn tác).
  // Khoản thuộc tháng khác tháng đang xem thì chuyển sang tháng đó trước (queueSync gắn theo tháng đang mở).
  function voiceCommitItems(items){
    const added = [];
    items.forEach((it) => {
      if(it.monthKey !== currentMonthKey) switchMonth(it.monthKey);
      const e = {
        id: genEntryId(), day: Math.max(1, Math.min(daysInMonthKey(currentMonthKey), Number(it.day) || 1)),
        name: it.name, amount: it.amount, amountFormula: it.amountFormula || "",
        category: it.category, note: "", updatedAt: Date.now()
      };
      entries.push(e);
      commit();
      render();
      queueSync("addEntry", e);
      added.push({ monthKey: currentMonthKey, id: e.id, entry: e });
    });
    return added;
  }
  function voiceUndo(added){
    added.forEach((a) => {
      if(currentMonthKey !== a.monthKey) switchMonth(a.monthKey, { skipPull: true });
      entries = entries.filter(en => en.id !== a.id);
      commit();
      render();
      queueSync("deleteEntry", { id: a.id });
    });
  }
  function voiceAnnounceAdded(added){
    if(!added.length) return;
    let summary;
    if(added.length === 1){
      const e = added[0].entry;
      const cat = catById[e.category] || catById.ca_nhan;
      summary = "Đã thêm: <b>" + escapeHtml(e.name) + "</b> · " + money(e.amount) +
        " · " + escapeHtml(cat.label.replace(/\s*·\s*chia\s*\d+/i, "")) + " · Ngày " + e.day;
    }else{
      const total = added.reduce((s, a) => s + Number(a.entry.amount || 0), 0);
      summary = "Đã thêm <b>" + added.length + " khoản</b> · tổng " + money(total);
    }
    showVoiceToast(false, summary, () => voiceUndo(added));
  }

  // ---------- Nhấn giữ 1 khoản chi = mở popup "Thêm khoản chi" đã điền sẵn (kiểu giống popup Sửa) ----------
  // Điền sẵn tên/số tiền/danh mục/ghi chú giống khoản đang giữ, ngày mặc định lấy NGÀY HÔM NAY — người
  // dùng có thể chỉnh lại trước khi bấm lưu, khác với "Sửa" ở chỗ đây luôn tạo ra 1 khoản chi MỚI
  // (không đụng tới khoản gốc) vì effectively không set editingId.
  function openDuplicateConfirm(id){
    const entry = entries.find(en => en.id === id);
    if(!entry) return;
    const todayDay = Math.max(1, Math.min(daysInMonthKey(currentMonthKey), new Date().getDate()));
    const draft = Object.assign({}, entry, { id: null, day: todayDay });
    openModal("add", draft, "Nhân bản khoản chi", "Nhân bản");
    // Đánh dấu popup đang ở chế độ nhân bản (đặt SAU openModal vì openModal luôn reset cờ này)
    dupSourceId = id;
    const cat = catById[entry.category] || catById.ca_nhan;
    if(dupFromEl && dupFromTxt){
      dupFromEl.style.setProperty("--dup-c", cat.color);
      dupFromTxt.innerHTML = "Bản sao của <b>" + escapeHtml(entry.name) + "</b> · " + money(entry.amount) + " · Ngày " + entry.day;
      dupFromEl.hidden = false;
    }
    entryForm.classList.add("dup-open");
  }

  // ---------- Hiệu ứng nhân bản ----------
  const dupFxOff = () => prefersReducedMotion() || document.documentElement.getAttribute("data-perf") === "lite";

  // Đủ thời gian giữ: hàng nảy nhẹ, một BẢN SAO tách khỏi hàng, bay lên và mờ dần dưới lớp mờ của popup.
  function playDuplicateCommit(wrap){
    if(!wrap) return;
    wrap.classList.add("lp-commit");
    setTimeout(() => wrap.classList.remove("lp-commit"), 520);
    if(dupFxOff() || !wrap.isConnected) return;
    try{
      const r = wrap.getBoundingClientRect();
      if(r.width < 20 || r.height < 10) return;
      const g = wrap.cloneNode(true);
      g.className = "t-row-wrap dup-ghost";
      g.removeAttribute("data-id");
      g.setAttribute("aria-hidden", "true");
      g.querySelectorAll("[data-id]").forEach(n => n.removeAttribute("data-id"));
      g.querySelectorAll("button").forEach(n => { n.tabIndex = -1; });
      g.style.left = r.left + "px"; g.style.top = r.top + "px";
      g.style.width = r.width + "px"; g.style.height = r.height + "px";
      const done = () => { if(g.parentNode) g.parentNode.removeChild(g); };
      g.addEventListener("animationend", (ev) => { if(ev.target === g) done(); });
      document.body.appendChild(g);
      setTimeout(done, 900); // phòng trường hợp animationend không bắn (tab ẩn...)
    }catch(err){ /* hiệu ứng lỗi thì thôi, không ảnh hưởng việc nhân bản */ }
  }

  // Lưu xong: tự cuộn tới khoản mới nếu nó nằm ngoài màn hình (khoản mới nằm ở nhóm ngày HÔM NAY, thường xa khoản gốc),
  // rồi quét sáng bằng màu danh mục để người dùng thấy ngay nó vừa "đáp" xuống đâu.
  function playDuplicateLanded(id){
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const bodyEl = document.getElementById("ledgerBody");
      if(!bodyEl) return;
      let wrap = null;
      bodyEl.querySelectorAll(".t-row-wrap").forEach(w => { if(w.getAttribute("data-id") === id) wrap = w; });
      if(!wrap) return; // đang lọc/tìm kiếm nên khoản mới không hiện -> thôi
      const r = wrap.getBoundingClientRect();
      if(r.top < 80 || r.bottom > window.innerHeight - 96){
        try{ wrap.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" }); }
        catch(err){ wrap.scrollIntoView(); }
      }
      wrap.classList.remove("row-dup");
      void wrap.offsetWidth; // khởi động lại animation nếu lỡ còn class cũ
      wrap.classList.add("row-dup");
      setTimeout(() => wrap.classList.remove("row-dup"), 1500);
    }));
  }

  // ---------- Nghe giọng nói + bảng "Đang nghe" / "Xem lại" ----------
  // Luồng: bấm mic -> bảng hiện chữ ngay khi đang nói (interim) -> xong thì phân tích:
  //   chắc chắn (1 khoản, có đơn vị/từ khoá rõ, số hợp lý) -> thêm luôn + Hoàn tác;
  //   chưa chắc / nhiều khoản / tháng khác -> chuyển sang bảng xem lại để sửa rồi mới ghi.
  const fabMicBtn = document.getElementById("fabMicBtn");
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const vsOverlay = document.getElementById("voiceOverlay");
  const vsTitle = document.getElementById("voiceSheetTitle");
  const vsSub = document.getElementById("vsSub");
  const vsListenPane = document.getElementById("vsListen");
  const vsReviewPane = document.getElementById("vsReview");
  const vsTranscript = document.getElementById("vsTranscript");
  const vsRowsEl = document.getElementById("vsRows");
  const vsErrorEl = document.getElementById("vsError");
  const vsSecondaryBtn = document.getElementById("vsSecondaryBtn");
  const vsPrimaryBtn = document.getElementById("vsPrimaryBtn");
  const vsCloseBtn = document.getElementById("vsCloseBtn");
  const VS_MAX_LISTEN_MS = 15000;
  const VS_FATAL = {
    "not-allowed": "Bạn chưa cho phép dùng micro. Vào cài đặt trình duyệt để cấp quyền micro cho trang này.",
    "service-not-allowed": "Trình duyệt không cho dùng nhận diện giọng nói ở đây. Thử mở app bằng Chrome.",
    "audio-capture": "Không tìm thấy micro trên thiết bị này.",
    "network": "Lỗi mạng khi nhận diện giọng nói, thử lại nhé.",
    "language-not-supported": "Thiết bị chưa hỗ trợ nhận diện tiếng Việt."
  };
  const vs = {
    open: false, mode: "idle", rec: null, finals: [], interim: "", restarts: 0, startedAt: 0,
    userStopped: false, lastError: "", maxTimer: null, endGuard: null, rows: [], heard: ""
  };
  const vsBuzz = (p) => { try{ if(navigator.vibrate) navigator.vibrate(p); }catch(err){ /* thiết bị không rung được */ } };
  const vsCatLabel = (c) => c.label.replace(/\s*·\s*chia\s*\d+/i, "");

  function vsSetMode(mode){
    vs.mode = mode;
    vsOverlay.classList.toggle("is-listening", mode === "listen");
    vsOverlay.classList.toggle("is-review", mode === "review");
    fabMicBtn.classList.toggle("listening", mode === "listen");
    fabMicBtn.setAttribute("aria-pressed", mode === "listen" ? "true" : "false");
    vsListenPane.hidden = mode !== "listen";
    vsReviewPane.hidden = mode !== "review";
    if(mode === "listen"){
      vsTitle.textContent = "Đang nghe…";
      vsSub.textContent = "Nói tên khoản, số tiền và người trả";
      vsSecondaryBtn.textContent = "Huỷ";
      vsPrimaryBtn.textContent = "Xong";
    }else if(mode === "review"){
      vsTitle.textContent = "Xem lại trước khi thêm";
      vsSub.textContent = vs.heard ? "Nghe được: “" + vs.heard + "”" : "";
      vsSecondaryBtn.textContent = "Nói lại";
    }
  }
  function vsSetError(msg){ vsErrorEl.textContent = msg || ""; }
  function vsRenderTranscript(){
    const fin = vs.finals.map(a => a[0]).join(" ").trim();
    vsTranscript.innerHTML = (fin ? '<span class="fin">' + escapeHtml(fin) + "</span> " : "") +
      (vs.interim ? '<span class="int">' + escapeHtml(vs.interim) + "</span>" : "");
    vsTranscript.classList.toggle("empty", !fin && !vs.interim);
  }
  // Các phương án nghe được cho cả câu: phần đã chốt (phương án đầu) + các phương án của đoạn cuối.
  function vsAlternatives(){
    const segs = vs.finals.slice();
    if(vs.interim.trim()) segs.push([vs.interim]);
    if(!segs.length) return [];
    const prefix = segs.slice(0, -1).map(s => s[0]).join(" ");
    return segs[segs.length - 1].map(a => (prefix + " " + a).trim()).filter(Boolean);
  }

  function vsOpen(){
    voiceBuildIndex();
    vs.open = true;
    vsOverlay.classList.add("show");
    vsOverlay.setAttribute("aria-hidden", "false");
    vsStartSession();
  }
  function vsClose(){
    clearTimeout(vs.maxTimer);
    clearTimeout(vs.endGuard);
    if(vs.rec){ const r = vs.rec; vs.rec = null; try{ r.abort(); }catch(err){ /* đã dừng */ } } // vs.rec = null -> mọi sự kiện muộn bị bỏ qua
    vs.open = false;
    vs.mode = "idle";
    vsOverlay.classList.remove("show", "is-listening", "is-review");
    vsOverlay.setAttribute("aria-hidden", "true");
    fabMicBtn.classList.remove("listening");
    fabMicBtn.setAttribute("aria-pressed", "false");
  }
  function vsStartSession(){
    vs.finals = []; vs.interim = ""; vs.restarts = 0; vs.userStopped = false; vs.lastError = ""; vs.heard = "";
    vs.startedAt = Date.now();
    vsSetError("");
    vsSetMode("listen");
    vsRenderTranscript();
    clearTimeout(vs.maxTimer);
    vs.maxTimer = setTimeout(() => { if(vs.mode === "listen") vsStopListening(); }, VS_MAX_LISTEN_MS);
    vsBeginRecognition();
  }
  function vsStopListening(){
    vs.userStopped = true;
    clearTimeout(vs.endGuard);
    vs.endGuard = setTimeout(() => { if(vs.open && vs.mode === "listen") vsOnEnd(); }, 3500); // phòng trình duyệt không bắn sự kiện "end"
    try{ if(vs.rec) vs.rec.stop(); }catch(err){ vsOnEnd(); }
  }
  function vsBeginRecognition(){
    const rec = new SpeechRecognitionCtor();
    rec.lang = "vi-VN";
    rec.continuous = false;
    rec.interimResults = true;   // hiện chữ ngay khi đang nói
    rec.maxAlternatives = 5;     // lấy nhiều phương án, chọn cái phân tích ra kết quả hợp lệ
    vs.rec = rec;
    vs.lastError = "";
    rec.onstart = () => { if(rec === vs.rec) vsBuzz(10); };
    rec.onresult = (e) => {
      if(rec !== vs.rec) return;
      let interim = "";
      for(let i = e.resultIndex; i < e.results.length; i++){
        const r = e.results[i];
        if(r.isFinal){
          const alts = [];
          for(let k = 0; k < r.length; k++) alts.push(r[k].transcript);
          vs.finals.push(alts);
        }else{
          interim += r[0].transcript;
        }
      }
      vs.interim = interim;
      vsRenderTranscript();
    };
    rec.onerror = (e) => { if(rec === vs.rec) vs.lastError = (e && e.error) || "error"; };
    rec.onend = () => { if(rec === vs.rec) vsOnEnd(); };
    try{
      rec.start();
    }catch(err){
      vsClose();
      showVoiceToast(true, "Không khởi động được micro: " + escapeHtml(err && err.message ? err.message : String(err)), null);
    }
  }
  function vsOnEnd(){
    if(!vs.open || vs.mode !== "listen") return;
    clearTimeout(vs.endGuard);
    const err = vs.lastError;
    vs.lastError = "";
    if(err === "aborted") return;
    if(err && VS_FATAL[err]){ vsClose(); showVoiceToast(true, VS_FATAL[err], null); return; }
    const alts = vsAlternatives();
    if(!alts.length){ vsClose(); showVoiceToast(true, "Không nghe thấy giọng nói, thử lại nhé.", null); return; }
    const parsed = vpParseBest(alts, voiceCtx());
    // Chưa ra số tiền mà người dùng chưa bấm Xong -> có thể chỉ ngừng lấy hơi: nghe tiếp (giữ phần đã nghe), tối đa 2 lần.
    if(!parsed.ok && !vs.userStopped && vs.restarts < 2 && (Date.now() - vs.startedAt) < 12000){
      vs.restarts++;
      vs.interim = "";
      vsBeginRecognition();
      return;
    }
    vsFinish(parsed, alts[0]);
  }
  function vsFinish(parsed, heard){
    clearTimeout(vs.maxTimer);
    if(!parsed.ok){
      vsClose();
      showVoiceToast(true, escapeHtml(parsed.reason || "Không hiểu câu vừa nói.") +
        (heard ? ' <span style="color:var(--text-faint)">— nghe được: "' + escapeHtml(heard) + '"</span>' : ""), null);
      return;
    }
    if(!parsed.needsReview){
      vsClose();
      vsBuzz([12, 40, 12]);
      voiceAnnounceAdded(voiceCommitItems(parsed.items.map(it => ({
        monthKey: it.monthKey, day: it.day, name: it.name, amount: it.amount, amountFormula: "", category: it.category
      }))));
      return;
    }
    vsOpenReview(parsed, heard);
  }

  // ----- Bảng xem lại -----
  function vsMoneyText(text){
    const v = evalAmountExpr(text);
    return (isFinite(v) && v > 0) ? "= " + money(v) : "Số tiền chưa hợp lệ";
  }
  function vsRowHtml(r, i, many){
    const days = daysInMonthKey(r.monthKey);
    let dayOpts = "";
    for(let d = 1; d <= days; d++) dayOpts += '<option value="' + d + '"' + (d === r.day ? " selected" : "") + ">Ngày " + d + "</option>";
    const catOpts = CATS.map(c => '<option value="' + c.id + '"' + (c.id === r.category ? " selected" : "") + ">" + escapeHtml(vsCatLabel(c)) + "</option>").join("");
    const months = Array.from(new Set([r.monthKey, currentMonthKey, DEFAULT_MONTH_KEY]));
    const monthSel = months.length > 1
      ? '<select class="vs-month" data-f="month" aria-label="Tháng">' + months.map(mk => '<option value="' + escapeHtml(mk) + '"' + (mk === r.monthKey ? " selected" : "") + ">" + escapeHtml(monthLabel(mk)) + "</option>").join("") + "</select>"
      : "";
    const why = r.reasons.length ? '<ul class="vs-why">' + r.reasons.map(x => "<li>" + escapeHtml(x) + "</li>").join("") + "</ul>" : "";
    const del = many ? '<button type="button" class="icon-btn vs-del" data-act="del" aria-label="Bỏ khoản này"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' : "";
    return '<div class="vs-row" data-i="' + i + '">' +
      '<div class="vs-line">' +
        '<input class="vs-name" type="text" value="' + escapeHtml(r.name) + '" placeholder="Tên khoản chi" aria-label="Tên khoản chi" autocomplete="off" enterkeyhint="next">' + del +
      "</div>" +
      '<div class="vs-line">' +
        '<label class="vs-amt"><input class="vs-amount" type="text" inputmode="decimal" value="' + escapeHtml(r.amountText) + '" aria-label="Số tiền, tính bằng nghìn đồng" autocomplete="off"><span>nghìn</span></label>' +
        '<output class="vs-money">' + escapeHtml(vsMoneyText(r.amountText)) + "</output>" +
      "</div>" +
      '<div class="vs-line vs-pick">' +
        '<select class="vs-cat" data-f="cat" aria-label="Người trả">' + catOpts + "</select>" +
        '<select class="vs-day" data-f="day" aria-label="Ngày">' + dayOpts + "</select>" + monthSel +
      "</div>" + why +
    "</div>";
  }
  function vsRenderRows(){
    const many = vs.rows.length > 1;
    vsRowsEl.innerHTML = vs.rows.map((r, i) => vsRowHtml(r, i, many)).join("");
    vsPrimaryBtn.textContent = many ? "Thêm " + vs.rows.length + " khoản" : "Thêm vào sổ";
  }
  function vsOpenReview(parsed, heard){
    vs.heard = heard || "";
    vs.rows = parsed.items.map(it => ({
      monthKey: it.monthKey, day: it.day, name: it.name, amountText: String(it.amount), category: it.category, reasons: it.reasons.slice()
    }));
    vsSetError("");
    vsSetMode("review");
    vsRenderRows();
    vsBuzz(15);
    const empty = vsRowsEl.querySelector(".vs-name[value='']");
    setTimeout(() => { try{ (empty || vsPrimaryBtn).focus({ preventScroll: true }); }catch(err){ /* bỏ qua */ } }, 60);
  }
  function vsConfirmReview(){
    const items = [];
    let firstBad = null;
    vs.rows.forEach((r, i) => {
      const name = r.name.trim();
      const amt = evalAmountExpr(r.amountText);
      const okName = !!name, okAmt = isFinite(amt) && amt > 0;
      const rowEl = vsRowsEl.querySelector('.vs-row[data-i="' + i + '"]');
      if(rowEl){
        rowEl.querySelector(".vs-name").classList.toggle("bad", !okName);
        rowEl.querySelector(".vs-amount").classList.toggle("bad", !okAmt);
        if(!firstBad && !okName) firstBad = rowEl.querySelector(".vs-name");
        if(!firstBad && !okAmt) firstBad = rowEl.querySelector(".vs-amount");
      }
      if(okName && okAmt){
        items.push({
          monthKey: r.monthKey, day: r.day, name, amount: Math.round(amt * 1000) / 1000,
          amountFormula: isAmountFormula(r.amountText) ? r.amountText.trim() : "", category: r.category
        });
      }
    });
    if(firstBad){
      vsSetError("Điền tên và số tiền hợp lệ cho mọi khoản, hoặc bấm × để bỏ khoản đó.");
      try{ firstBad.focus(); }catch(err){ /* bỏ qua */ }
      return;
    }
    vsClose();
    vsBuzz([12, 40, 12]);
    voiceAnnounceAdded(voiceCommitItems(items));
  }

  if(!SpeechRecognitionCtor){
    fabMicBtn.addEventListener("click", () => {
      showVoiceToast(true, "Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy dùng Chrome/Edge trên máy tính hoặc điện thoại Android.", null);
    });
  }else{
    fabMicBtn.addEventListener("click", () => {
      if(vs.open){ if(vs.mode === "listen") vsStopListening(); return; }
      hideVoiceToast();
      vsOpen();
    });
    vsPrimaryBtn.addEventListener("click", () => {
      if(vs.mode === "listen") vsStopListening();
      else if(vs.mode === "review") vsConfirmReview();
    });
    vsSecondaryBtn.addEventListener("click", () => {
      if(vs.mode === "review") vsStartSession(); // "Nói lại"
      else vsClose();                            // "Huỷ"
    });
    vsCloseBtn.addEventListener("click", vsClose);
    // Bấm nền (hoặc nút Back / phím Esc, vốn được chuyển thành bấm nền) = đóng.
    vsOverlay.addEventListener("click", (e) => { if(e.target === vsOverlay) vsClose(); });
    vsRowsEl.addEventListener("input", (e) => {
      const rowEl = e.target.closest(".vs-row");
      const r = rowEl ? vs.rows[Number(rowEl.dataset.i)] : null;
      if(!r) return;
      if(e.target.classList.contains("vs-name")){ r.name = e.target.value; e.target.classList.remove("bad"); }
      else if(e.target.classList.contains("vs-amount")){
        r.amountText = e.target.value;
        e.target.classList.remove("bad");
        const out = rowEl.querySelector(".vs-money");
        out.textContent = vsMoneyText(r.amountText);
        out.classList.toggle("bad", !(evalAmountExpr(r.amountText) > 0));
      }
      vsSetError("");
    });
    vsRowsEl.addEventListener("change", (e) => {
      const rowEl = e.target.closest(".vs-row");
      const r = rowEl ? vs.rows[Number(rowEl.dataset.i)] : null;
      if(!r) return;
      const f = e.target.getAttribute("data-f");
      if(f === "cat") r.category = e.target.value;
      else if(f === "day") r.day = Number(e.target.value) || 1;
      else if(f === "month"){
        r.monthKey = e.target.value;
        r.day = Math.min(r.day, daysInMonthKey(r.monthKey));
        r.reasons = r.reasons.filter(x => x.indexOf("không phải tháng đang xem") === -1 && x.indexOf("Ngày nói ra") === -1);
        vsRenderRows(); // số ngày của tháng đổi -> dựng lại danh sách ngày
      }
    });
    vsRowsEl.addEventListener("click", (e) => {
      const del = e.target.closest("[data-act='del']");
      if(!del) return;
      vs.rows.splice(Number(del.closest(".vs-row").dataset.i), 1);
      if(!vs.rows.length){ vsClose(); return; }
      vsRenderRows();
    });
    document.addEventListener("visibilitychange", () => { if(document.hidden && vs.open && vs.mode === "listen") vsClose(); });
  }

  // ---------- Gộp 2 (hoặc nhiều) khoản chi làm 1 ----------
  const mergeModeToggleBtn = document.getElementById("mergeModeToggle");
  const mergeActionbarEl = document.getElementById("mergeActionbar");
  const mergeActionbarTextEl = document.getElementById("mergeActionbarText");
  const mergeActionbarConfirmBtn = document.getElementById("mergeActionbarConfirm");

  function updateMergeActionbar(){
    mergeActionbarEl.classList.toggle("show", mergeMode);
    mergeActionbarTextEl.textContent = mergeSelectedIds.length === 0
      ? "Chọn các khoản chi cần gộp"
      : "Đã chọn " + mergeSelectedIds.length + " khoản";
    mergeActionbarConfirmBtn.disabled = mergeSelectedIds.length < 2;
  }

  function setMergeMode(on){
    if(!on){
      resetMergeSelectionState();
    }else{
      mergeMode = true;
      mergeSelectedIds = [];
      mergeModeToggleBtn.classList.add("active");
      document.getElementById("ledgerBody").classList.add("merge-mode");
      document.body.classList.add("merge-mode-active");
    }
    updateMergeActionbar();
    render(); // vẽ lại để hiện/ẩn ô tròn chọn + cập nhật tổng (phòng khi vừa gộp xong)
  }
  mergeModeToggleBtn.addEventListener("click", () => setMergeMode(!mergeMode));
  document.getElementById("mergeActionbarCancel").addEventListener("click", () => setMergeMode(false));

  // Gộp N khoản đã chọn: lấy khoản có "Ngày" sớm nhất làm khoản GIỮ LẠI (đổi tên/số tiền/ghi chú
  // thành bản gộp), các khoản còn lại sẽ bị xoá SAU KHI người dùng xác nhận ở popup (giống popup Sửa,
  // để họ còn cơ hội chỉnh sửa/huỷ trước khi lưu thật).
  function openMergeConfirm(){
    const selected = mergeSelectedIds.map(id => entries.find(en => en.id === id)).filter(Boolean);
    if(selected.length < 2) return;
    const ordered = selected.slice().sort((a,b) => Number(a.day) - Number(b.day) || String(a.id).localeCompare(String(b.id)));
    const primary = ordered[0];
    const rest = ordered.slice(1);

    const totalAmount = ordered.reduce((s,e) => s + Number(e.amount||0), 0);
    const mergedName = ordered.map(e => e.name).filter(Boolean).join(" + ");
    const mergedNote = ordered.map(e => (e.note||"").trim()).filter(Boolean).join("; ");
    // Ghi lại công thức "a+b+..." (dùng đúng tính năng "gõ công thức" đã có) để sau này mở lại
    // khoản đã gộp vẫn thấy được nó gồm những khoản tiền nào.
    const mergedFormula = ordered.map(e => Number(e.amount||0)).join("+");

    const draft = Object.assign({}, primary, {
      name: mergedName,
      amount: totalAmount,
      amountFormula: mergedFormula,
      note: mergedNote
    });

    mergeSecondaryIds = rest.map(e => e.id);
    openModal("edit", draft, "Gộp " + ordered.length + " khoản chi", "Gộp lại");
  }
  mergeActionbarConfirmBtn.addEventListener("click", () => {
    if(mergeSelectedIds.length < 2) return;
    openMergeConfirm();
  });

  document.getElementById("ledgerBody").addEventListener("click", (e) => {
    try{
      if(mergeMode){
        const wrap = e.target.closest(".t-row-wrap");
        if(!wrap) return;
        const id = wrap.getAttribute("data-id");
        const idx = mergeSelectedIds.indexOf(id);
        if(idx === -1) mergeSelectedIds.push(id); else mergeSelectedIds.splice(idx, 1);
        wrap.classList.toggle("merge-selected", idx === -1);
        updateMergeActionbar();
        return;
      }
      const btn = e.target.closest("button[data-action]");
      if(!btn) return;
      const wrap = e.target.closest(".t-row-wrap");
      const id = wrap.getAttribute("data-id");
      if(btn.dataset.action === "edit"){
        const entry = entries.find(en => en.id === id);
        if(entry) openModal("edit", entry);
      }else if(btn.dataset.action === "delete"){
        const entry = entries.find(en => en.id === id);
        const label = entry ? (entry.name + " · " + money(entry.amount)) : "khoản chi này";
        openConfirm(
          "Xoá khoản chi?",
          "Xoá \"" + label + "\"? Không thể hoàn tác.",
          "Xoá",
          true,
          () => {
            try{
              entries = entries.filter(en => en.id !== id);
              commit();
              render();
              queueSync("deleteEntry", { id });
            }catch(err){ showErrorBanner("delete: " + err.message); }
          }
        );
      }
    }catch(err){ showErrorBanner("ledger click: " + err.message); }
  });

  // ---------- Vuốt trái = Sửa ngay, vuốt phải = Xoá ngay (mobile) ----------
  // ---------- Nhấn giữ (không kéo) = hiện popup "Nhân bản khoản chi" ----------
  (function(){
    const body = document.getElementById("ledgerBody");
    let activeRow = null, activeWrap = null, startX = 0, startY = 0, axisLocked = null;
    let lastTouchLongPressAt = 0; // dùng để chặn sự kiện "mouse" giả lập ngay sau cảm ứng trên di động

    // Nhấn giữ ~550ms mà không kéo ngang/dọc quá 6px -> coi là "nhấn giữ" và mở popup
    // nhân bản. Bất kỳ chuyển động thật nào (kéo vuốt, cuộn trang) đều huỷ ngay, để
    // không đụng chạm với thao tác vuốt Sửa/Xoá đã có.
    const LEDGER_LONGPRESS_MS = 550;
    // Hiệu ứng tia quét chỉ bắt đầu sau 120ms: chạm nhanh / bắt đầu cuộn trang sẽ không bị nháy màu oan.
    const LEDGER_LP_VISUAL_DELAY = 120;
    document.documentElement.style.setProperty("--lp-ms", (LEDGER_LONGPRESS_MS - LEDGER_LP_VISUAL_DELAY) + "ms");
    let longPressTimer = null, longPressVisualTimer = null, longPressRow = null, longPressWrap = null;
    let lastLongPressCommitAt = 0;

    function armLongPress(wrap, row){
      disarmLongPress();
      longPressRow = row;
      longPressVisualTimer = setTimeout(() => {
        longPressVisualTimer = null;
        if(wrap && longPressTimer){ wrap.classList.add("lp-armed"); longPressWrap = wrap; }
      }, LEDGER_LP_VISUAL_DELAY);
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        const w = longPressWrap || wrap;
        if(w) w.classList.remove("lp-armed");
        longPressWrap = null; longPressRow = null;
        lastLongPressCommitAt = Date.now();
        if(navigator.vibrate) navigator.vibrate(12);
        // Đã "chốt" thao tác nhấn giữ -> bỏ theo dõi kéo/vuốt của cử chỉ này luôn,
        // tránh việc tay còn đang chạm bàn phím cảm ứng làm hàng bị kéo lệch dưới popup.
        activeRow = null; activeWrap = null; axisLocked = null;
        playDuplicateCommit(wrap);
        openDuplicateConfirm(wrap.getAttribute("data-id"));
      }, LEDGER_LONGPRESS_MS);
    }
    function disarmLongPress(){
      if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
      if(longPressVisualTimer){ clearTimeout(longPressVisualTimer); longPressVisualTimer = null; }
      if(longPressWrap){ longPressWrap.classList.remove("lp-armed"); longPressWrap = null; }
      longPressRow = null;
    }
    // Android/Chrome có thể bật menu ngữ cảnh (chọn chữ/sao chép) ngay giữa lúc giữ tay -> chặn để không phá hiệu ứng.
    body.addEventListener("contextmenu", (e) => {
      if(longPressTimer || Date.now() - lastLongPressCommitAt < 1500){
        if(e.target.closest && e.target.closest(".t-row-wrap")) e.preventDefault();
      }
    });

    function setIndicators(wrap, x){
      const editInd = wrap.querySelector(".t-swipe-edit-indicator");
      const delInd = wrap.querySelector(".t-swipe-delete-indicator");
      if(editInd) editInd.classList.toggle("armed", x <= -LEDGER_SWIPE_TRIGGER);
      if(delInd) delInd.classList.toggle("armed", x >= LEDGER_SWIPE_TRIGGER);
    }
    function clearIndicators(wrap){
      const editInd = wrap.querySelector(".t-swipe-edit-indicator");
      const delInd = wrap.querySelector(".t-swipe-delete-indicator");
      if(editInd) editInd.classList.remove("armed");
      if(delInd) delInd.classList.remove("armed");
    }
    body.addEventListener("touchstart", (e) => {
      if(mergeMode) return; // đang chọn khoản để gộp -> tắt hẳn vuốt Sửa/Xoá + nhấn giữ Nhân bản, tránh xung đột thao tác
      const wrap = e.target.closest(".t-row-wrap");
      if(!wrap || e.target.closest("button[data-action]")){ activeRow = null; activeWrap = null; disarmLongPress(); return; }
      activeWrap = wrap;
      activeRow = wrap.querySelector(".t-row");
      activeRow.classList.remove("snap");
      activeRow.classList.add("dragging");
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      axisLocked = null;
      armLongPress(wrap, activeRow);
      lastTouchLongPressAt = Date.now();
    }, { passive: true });
    body.addEventListener("touchmove", (e) => {
      if(!activeRow) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if(axisLocked === null){
        if(Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        disarmLongPress();
        axisLocked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if(axisLocked === "y"){ activeRow.classList.remove("dragging"); activeRow = null; activeWrap = null; return; }
      }
      if(axisLocked !== "x") return;
      e.preventDefault();
      const next = Math.max(-LEDGER_SWIPE_MAX, Math.min(LEDGER_SWIPE_MAX, dx));
      activeRow.style.transform = "translateX(" + next + "px)";
      setIndicators(activeWrap, next);
    }, { passive: false });
    body.addEventListener("touchend", () => {
      disarmLongPress();
      if(!activeRow) return;
      const m = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(activeRow.style.transform);
      const x = m ? parseFloat(m[1]) : 0;
      const wrap = activeWrap;
      const id = wrap.getAttribute("data-id");
      activeRow.classList.remove("dragging");
      activeRow.classList.add("snap");
      activeRow.style.transform = "translateX(0px)";
      clearIndicators(wrap);
      activeRow = null;
      activeWrap = null;
      if(x <= -LEDGER_SWIPE_TRIGGER){
        const entry = entries.find(en => en.id === id);
        if(entry) openModal("edit", entry);
      }else if(x >= LEDGER_SWIPE_TRIGGER){
        const entry = entries.find(en => en.id === id);
        const label = entry ? (entry.name + " · " + money(entry.amount)) : "khoản chi này";
        openConfirm(
          "Xoá khoản chi?",
          "Xoá \"" + label + "\"? Không thể hoàn tác.",
          "Xoá",
          true,
          () => {
            try{
              entries = entries.filter(en => en.id !== id);
              commit();
              render();
              queueSync("deleteEntry", { id });
            }catch(err){ showErrorBanner("delete: " + err.message); }
          }
        );
      }
    });
    body.addEventListener("touchcancel", () => {
      disarmLongPress();
      if(activeRow){ activeRow.classList.remove("dragging"); activeRow.style.transform = "translateX(0px)"; }
      if(activeWrap) clearIndicators(activeWrap);
      activeRow = null; activeWrap = null;
    });

    // Nhấn giữ bằng chuột (desktop) = cũng mở popup nhân bản, tương tự nhấn giữ trên di động.
    // Bỏ qua nếu vừa có thao tác cảm ứng (tránh sự kiện "mouse" giả lập trên di động bắn trùng).
    let mouseDownWrap = null, mouseDownX = 0, mouseDownY = 0;
    body.addEventListener("mousedown", (e) => {
      if(mergeMode) return; // đang chọn khoản để gộp -> không kích hoạt nhấn giữ Nhân bản
      if(e.button !== 0) return;
      if(Date.now() - lastTouchLongPressAt < 1000) return;
      const wrap = e.target.closest(".t-row-wrap");
      if(!wrap || e.target.closest("button[data-action]")) return;
      mouseDownWrap = wrap;
      mouseDownX = e.clientX; mouseDownY = e.clientY;
      armLongPress(wrap, wrap.querySelector(".t-row"));
    });
    document.addEventListener("mousemove", (e) => {
      if(!mouseDownWrap || !longPressTimer) return;
      if(Math.abs(e.clientX - mouseDownX) > 6 || Math.abs(e.clientY - mouseDownY) > 6){
        disarmLongPress();
      }
    });
    document.addEventListener("mouseup", () => {
      mouseDownWrap = null;
      disarmLongPress();
    });
  })();

  // ---------- Backup: export / import ----------
  // Thư viện Excel (xlsx, ~880 KB) CHỈ được nạp khi bạn bấm Xuất/Nhập — mở app nhanh hơn, ít tốn RAM/pin hơn.
  // Từ lần thứ hai trở đi lấy thẳng từ bộ nhớ đệm của Service Worker (cả khi offline).
  let xlsxPromise = null;
  function loadXlsx(){
    if(typeof XLSX !== "undefined") return Promise.resolve();
    if(xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "vendor/xlsx.full.min.js";
      el.async = true;
      el.onload = () => {
        if(typeof XLSX !== "undefined") resolve();
        else{ xlsxPromise = null; reject(new Error("init")); }
      };
      el.onerror = () => { el.remove(); xlsxPromise = null; reject(new Error("load")); }; // cho phép thử lại
      document.head.appendChild(el);
    });
    return xlsxPromise;
  }
  const EXCEL_LOAD_ERROR = "Chưa tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.";

  // Thứ tự cột: A Ngày · B Tên · C Số tiền (ĐỒNG) · D Danh mục · E Ghi chú · F Công thức · G ID (ẩn) · H Cập nhật lúc (ẩn).
  // Khi nhập, app tìm cột theo TÊN tiêu đề nên file cũ (số tiền "nghìn đ", ID ở cột E) vẫn đọc được.
  const XLSX_HEADER = ["Ngày", "Tên khoản chi", "Số tiền (đ)", "Danh mục", "Ghi chú", "Công thức", "ID", "Cập nhật lúc (ms)"];
  const XLSX_AMOUNT_FMT = '#,##0" ₫"';
  // Biểu tượng màu thay cho tô màu ô: bản xlsx miễn phí đang dùng KHÔNG ghi được màu nền/màu chữ khi
  // tạo file mới (chỉ giữ lại được style nếu đọc từ file Excel đã có sẵn) — dùng emoji màu để vẫn phân
  // biệt được Chồng/Vợ bằng mắt khi mở file, mà không cần thêm thư viện ngoài.
  const CAT_EMOJI = { ca_nhan:"⚪", ck_tinh:"🔵", vk_tinh:"🔴", ck_thieu:"🟡", vk_thieu:"🟡", ck_chung:"🔵", vk_chung:"🔴" };

  // ---------- Popup bộ lọc trước khi xuất (A3) ----------
  const exportOverlay = document.getElementById("exportOverlay");
  const exportMonthList = document.getElementById("exportMonthList");
  const exportCatList = document.getElementById("exportCatList");
  const exportMonthToggleAll = document.getElementById("exportMonthToggleAll");
  const exportCatToggleAll = document.getElementById("exportCatToggleAll");
  const exportDayFrom = document.getElementById("exportDayFrom");
  const exportDayTo = document.getElementById("exportDayTo");

  function buildExportChip(value, label, dotColor){
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "export-chip active";
    chip.dataset.value = value;
    chip.innerHTML = (dotColor ? '<span class="cat-dot" style="background:' + dotColor + '"></span>' : '') + '<span>' + escapeHtml(label) + '</span>';
    return chip;
  }
  function refreshToggleAllLabel(listEl, btnEl){
    const chips = listEl.querySelectorAll(".export-chip");
    const allActive = chips.length > 0 && Array.from(chips).every(c => c.classList.contains("active"));
    btnEl.textContent = allActive ? "Bỏ chọn tất cả" : "Chọn tất cả";
  }
  function toggleChipListAll(listEl, btnEl){
    const chips = Array.from(listEl.querySelectorAll(".export-chip"));
    if(chips.length === 0) return;
    const allActive = chips.every(c => c.classList.contains("active"));
    chips.forEach(c => c.classList.toggle("active", !allActive));
    refreshToggleAllLabel(listEl, btnEl);
  }
  // Tab Xuất / Nhập trong cùng popup
  const xlTabs = Array.from(document.querySelectorAll(".xl-tab"));
  const xlPanes = { export: document.getElementById("xlPaneExport"), import: document.getElementById("xlPaneImport") };
  function setExcelTab(name){
    xlTabs.forEach((t) => {
      const on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    Object.keys(xlPanes).forEach((k) => { xlPanes[k].hidden = k !== name; });
  }
  xlTabs.forEach((t, i) => {
    t.addEventListener("click", () => setExcelTab(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      if(e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const nx = xlTabs[(i + (e.key === "ArrowRight" ? 1 : xlTabs.length - 1)) % xlTabs.length];
      setExcelTab(nx.dataset.tab);
      nx.focus();
    });
  });
  function openExportModal(){
    setExcelTab("export");
    refreshImportUndoUI();
    const monthKeys = Object.keys(monthsData).sort().reverse();
    exportMonthList.innerHTML = "";
    if(monthKeys.length === 0){
      exportMonthList.innerHTML = '<div class="export-filter-empty">Chưa có tháng nào có dữ liệu.</div>';
    } else {
      monthKeys.forEach(k => exportMonthList.appendChild(buildExportChip(k, monthLabel(k))));
    }
    exportCatList.innerHTML = "";
    CATS.forEach(c => exportCatList.appendChild(buildExportChip(c.id, c.label.replace(/\s*·\s*chia\s*\d+/i, ""), c.color)));
    refreshToggleAllLabel(exportMonthList, exportMonthToggleAll);
    refreshToggleAllLabel(exportCatList, exportCatToggleAll);
    exportDayFrom.value = "";
    exportDayTo.value = "";
    closeAllPopovers();
    exportOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeExportModal(){
    exportOverlay.classList.remove("show");
    resumeParticleBg();
  }
  exportMonthList.addEventListener("click", (e) => {
    const chip = e.target.closest(".export-chip");
    if(!chip) return;
    chip.classList.toggle("active");
    refreshToggleAllLabel(exportMonthList, exportMonthToggleAll);
  });
  exportCatList.addEventListener("click", (e) => {
    const chip = e.target.closest(".export-chip");
    if(!chip) return;
    chip.classList.toggle("active");
    refreshToggleAllLabel(exportCatList, exportCatToggleAll);
  });
  exportMonthToggleAll.addEventListener("click", () => toggleChipListAll(exportMonthList, exportMonthToggleAll));
  exportCatToggleAll.addEventListener("click", () => toggleChipListAll(exportCatList, exportCatToggleAll));
  document.getElementById("exportModalClose").addEventListener("click", closeExportModal);
  document.getElementById("exportCancelBtn").addEventListener("click", closeExportModal);
  exportOverlay.addEventListener("click", (e) => { if(e.target === exportOverlay) closeExportModal(); });

  document.getElementById("exportBtn").addEventListener("click", async () => {
    closeMenuPanel();
    try{
      commit();
      if(typeof XLSX === "undefined"){
        setSyncStatus("Đang tải thư viện Excel…", false);
        try{ await loadXlsx(); }
        catch(err){ refreshSyncStatus(); showNotice(EXCEL_LOAD_ERROR); return; }
        refreshSyncStatus();
      }
      openExportModal();
    }catch(err){ showErrorBanner("export: " + err.message); }
  });

  // ---------- Gói .xlsx tối giản ----------
  // SheetJS bản miễn phí KHÔNG ghi được: đóng băng dòng tiêu đề, danh sách chọn (dropdown). Sau khi SheetJS tạo file, mở gói zip,
  // chèn 2 thứ đó vào XML của từng sheet rồi đóng gói lại. Bước này lỗi ở bất kỳ đâu thì dùng nguyên file gốc, không mất gì.
  const ZIP_CRC_TABLE = (function(){
    const t = new Uint32Array(256);
    for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function zipCrc32(u8){
    let c = 0xFFFFFFFF;
    for(let i = 0; i < u8.length; i++) c = ZIP_CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function zipInflateRaw(u8){
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function zipRead(u8){
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let e = u8.length - 22;
    while(e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if(e < 0) throw new Error("zip: không thấy cuối gói");
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const dec = new TextDecoder();
    const files = [];
    for(let i = 0; i < count; i++){
      if(dv.getUint32(p, true) !== 0x02014b50) throw new Error("zip: mục lục hỏng");
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = u8.subarray(start, start + csize);
      let data;
      if(method === 0) data = raw.slice();
      else if(method === 8) data = await zipInflateRaw(raw);
      else throw new Error("zip: kiểu nén lạ " + method);
      files.push({ name, data });
      p += 46 + nlen + elen + clen;
    }
    return files;
  }
  function zipWrite(files){
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name), data = f.data, crc = zipCrc32(data);
      const lh = new Uint8Array(30 + name.length), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0x0021, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true); lh.set(name, 30);
      parts.push(lh, data);
      const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x0021, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    });
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const all = parts.concat(central, [end]);
    const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
    let pos = 0;
    all.forEach((c) => { out.set(c, pos); pos += c.length; });
    return out;
  }
  const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function buildValidationXml(dataLastRow){
    const labels = xmlEsc(CATS.map(c => c.label).join(","));
    return '<dataValidations count="2">' +
      '<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Ngày không hợp lệ" error="Nhập số nguyên từ 1 đến 31." sqref="A2:A' + dataLastRow + '"><formula1>1</formula1><formula2>31</formula2></dataValidation>' +
      '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Danh mục không hợp lệ" error="Hãy chọn một danh mục trong danh sách." sqref="D2:D' + dataLastRow + '"><formula1>"' + labels + '"</formula1></dataValidation>' +
      '</dataValidations>';
  }
  async function patchXlsxBytes(bytes, sheetPatches){
    try{
      if(typeof DecompressionStream === "undefined" || typeof Blob === "undefined") return bytes;
      const files = await zipRead(bytes);
      const dec = new TextDecoder(), enc = new TextEncoder();
      sheetPatches.forEach((p, i) => {
        const f = files.find(x => x.name === "xl/worksheets/sheet" + (i + 1) + ".xml");
        if(!f) throw new Error("thiếu sheet" + (i + 1));
        let xml = dec.decode(f.data);
        if(!/<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)) throw new Error("không thấy sheetViews");
        xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,
          '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>');
        xml = xml.replace(/hidden="true"/g, 'hidden="1"'); // Excel đọc "1" chắc chắn hơn "true"
        const dv = buildValidationXml(p.dataLastRow);
        xml = /<ignoredErrors/.test(xml) ? xml.replace("<ignoredErrors", dv + "<ignoredErrors") : xml.replace("</worksheet>", dv + "</worksheet>");
        f.data = enc.encode(xml);
      });
      const out = zipWrite(files);
      const check = await zipRead(out); // đọc lại thử: không đọc được thì bỏ bản vá
      if(check.length !== files.length) throw new Error("đóng gói lại sai số file");
      return out;
    }catch(err){
      console.warn("Bỏ qua bước bổ sung định dạng Excel:", err);
      return bytes;
    }
  }
  function downloadBytes(bytes, filename){
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Dựng 1 sheet cho 1 tháng. Số tiền xuất bằng ĐỒNG đầy đủ (app lưu theo nghìn đồng, nhân 1000 khi xuất) để Excel hiện đúng.
  // Cột Danh mục ghi TÊN tiếng Việt (có danh sách chọn); ID và thời gian cập nhật nằm ở 2 cột ẩn cuối (G, H).
  // Các ô công thức đều có sẵn kết quả để trình xem trước trên điện thoại cũng hiện đúng số.
  function buildMonthSheet(monthKey, selectedCatIds, dayFrom, dayTo){
    const rawEntries = (monthsData[monthKey] || []).filter(e => {
      if(!selectedCatIds.has(e.category)) return false;
      const d = Number(e.day);
      if(dayFrom !== null && d < dayFrom) return false;
      if(dayTo !== null && d > dayTo) return false;
      return true;
    }).slice().sort((a,b) => (Number(a.day)||0) - (Number(b.day)||0));

    const toDong = (v) => Math.round((Number(v) || 0) * 1000);
    const labelById = Object.fromEntries(CATS.map(c => [c.id, c.label]));
    const N = rawEntries.length;
    const dataRows = rawEntries.map(e => [Number(e.day) || 1, e.name, toDong(e.amount), labelById[e.category] || String(e.category || ""), e.note || "", e.amountFormula || "", e.id, e.updatedAt || 0]);
    const aoa = [XLSX_HEADER].concat(dataRows);

    const dataFirstRow = 2;
    const dataLastRow = Math.max(dataFirstRow, 1 + N);
    const dataRangeAmt = "C" + dataFirstRow + ":C" + dataLastRow;
    const dataRangeCat = "D" + dataFirstRow + ":D" + dataLastRow;

    // giá trị tính sẵn (đồng) cho từng danh mục
    const sums = {};
    CATS.forEach(c => { sums[c.id] = 0; });
    rawEntries.forEach(e => { if(e.category in sums) sums[e.category] += toDong(e.amount); });
    const grand = rawEntries.reduce((s, e) => s + toDong(e.amount), 0);

    // ---- Khối "Tổng theo danh mục" ----
    aoa.push([]);
    aoa.push(["── TỔNG THEO DANH MỤC ──"]);
    aoa.push(["Danh mục", null, "Tổng tiền", "Mỗi người (nếu có chia)"]);
    const catTotalRow = {};
    CATS.forEach(c => {
      if(!selectedCatIds.has(c.id)) return;
      catTotalRow[c.id] = aoa.length + 1;
      const emoji = CAT_EMOJI[c.id] ? CAT_EMOJI[c.id] + " " : "";
      aoa.push([emoji + c.label.replace(/\s*·\s*chia\s*\d+/i, ""), null, 0, null]);
    });
    const totalRowNum = aoa.length + 1;
    aoa.push(["TỔNG CỘNG THÁNG", null, 0, null]);

    // ---- Khối "Cân bằng Chồng / Vợ" — đúng công thức computeBalance() của app ----
    let balanceRows = null;
    const canHalf = !!(catTotalRow.ck_tinh && catTotalRow.vk_tinh);
    const canDebt = !!(catTotalRow.ck_thieu && catTotalRow.vk_thieu);
    const canThird = !!(catTotalRow.ck_chung && catTotalRow.vk_chung);
    if(canHalf || canDebt || canThird){
      aoa.push([]);
      aoa.push(["── CÂN BẰNG CHỒNG / VỢ ──"]);
      aoa.push(["Hạng mục", null, "Số tiền", null]);
      balanceRows = {};
      if(canHalf){ balanceRows.halfRow = aoa.length + 1; aoa.push(["Chồng tính · chia 2  −  Vợ tính · chia 2  (÷2)", null, 0, null]); }
      if(canDebt){ balanceRows.debtRow = aoa.length + 1; aoa.push(["Vợ thiếu  −  Chồng thiếu", null, 0, null]); }
      if(canThird){ balanceRows.thirdRow = aoa.length + 1; aoa.push(["Chồng tính chung · chia 3  −  Vợ tính chung · chia 3  (÷3)", null, 0, null]); }
      balanceRows.netRow = aoa.length + 1;
      aoa.push(["=> Số dư (dương = Vợ nợ Chồng · âm = Chồng nợ Vợ)", null, 0, null]);
    } else if(Object.keys(catTotalRow).length > 0){
      aoa.push([]);
      aoa.push(["(Đã lọc bỏ hết danh mục liên quan nên không tính được Cân bằng Chồng/Vợ.)"]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    function setFormula(row, col, formula, value){
      ws[col + row] = { t: "n", f: formula, v: value, z: XLSX_AMOUNT_FMT };
    }
    for(let r = dataFirstRow; r <= 1 + N; r++){
      const ref = "C" + r;
      if(ws[ref]) ws[ref].z = XLSX_AMOUNT_FMT;
    }
    CATS.forEach(c => {
      const rowNum = catTotalRow[c.id];
      if(!rowNum) return;
      // Điều kiện SUMIF là TÊN danh mục đúng như đang ghi ở cột D của các dòng dữ liệu.
      setFormula(rowNum, "C", N > 0 ? 'SUMIF(' + dataRangeCat + ',"' + c.label.replace(/"/g, '""') + '",' + dataRangeAmt + ')' : "0", sums[c.id]);
      const m = c.label.match(/chia\s*(\d+)/i);
      if(m) setFormula(rowNum, "D", "C" + rowNum + "/" + m[1], sums[c.id] / Number(m[1]));
    });
    setFormula(totalRowNum, "C", N > 0 ? "SUM(" + dataRangeAmt + ")" : "0", grand);
    if(balanceRows){
      const half = ((sums.ck_tinh || 0) - (sums.vk_tinh || 0)) / 2;
      const debt = (sums.vk_thieu || 0) - (sums.ck_thieu || 0);
      const third = ((sums.ck_chung || 0) - (sums.vk_chung || 0)) / 3;
      if(balanceRows.halfRow) setFormula(balanceRows.halfRow, "C", "(C" + catTotalRow.ck_tinh + "-C" + catTotalRow.vk_tinh + ")/2", half);
      if(balanceRows.debtRow) setFormula(balanceRows.debtRow, "C", "(C" + catTotalRow.vk_thieu + "-C" + catTotalRow.ck_thieu + ")", debt);
      if(balanceRows.thirdRow) setFormula(balanceRows.thirdRow, "C", "(C" + catTotalRow.ck_chung + "-C" + catTotalRow.vk_chung + ")/3", third);
      const parts = [];
      let net = 0;
      if(balanceRows.halfRow){ parts.push("C" + balanceRows.halfRow); net += half; }
      if(balanceRows.debtRow){ parts.push("C" + balanceRows.debtRow); net += debt; }
      if(balanceRows.thirdRow){ parts.push("C" + balanceRows.thirdRow); net += third; }
      setFormula(balanceRows.netRow, "C", parts.join("+"), net);
    }

    ws["!cols"] = [{wch:6},{wch:28},{wch:16},{wch:26},{wch:32},{wch:16},{wch:18,hidden:true},{wch:16,hidden:true}];
    if(N > 0) ws["!autofilter"] = { ref: "A1:H" + dataLastRow };
    return { ws, dataLastRow };
  }

  let exportBusy = false;
  document.getElementById("exportConfirmBtn").addEventListener("click", async () => {
    if(exportBusy) return;
    exportBusy = true;
    try{
      const selectedMonths = Array.from(exportMonthList.querySelectorAll(".export-chip.active")).map(c => c.dataset.value);
      const selectedCats = new Set(Array.from(exportCatList.querySelectorAll(".export-chip.active")).map(c => c.dataset.value));
      if(selectedMonths.length === 0){ showNotice("Chọn ít nhất 1 tháng để xuất file."); return; }
      if(selectedCats.size === 0){ showNotice("Chọn ít nhất 1 danh mục để xuất file."); return; }
      let dayFrom = exportDayFrom.value.trim() === "" ? null : Math.max(1, Math.min(31, Number(exportDayFrom.value)));
      let dayTo = exportDayTo.value.trim() === "" ? null : Math.max(1, Math.min(31, Number(exportDayTo.value)));
      if(dayFrom !== null && dayTo !== null && dayFrom > dayTo){ const tmp = dayFrom; dayFrom = dayTo; dayTo = tmp; }

      const months = selectedMonths.slice().sort();
      const wb = XLSX.utils.book_new();
      const patches = [];
      months.forEach(monthKey => {
        const built = buildMonthSheet(monthKey, selectedCats, dayFrom, dayTo);
        // Tên sheet Excel tối đa 31 ký tự, không chứa : \ / ? * [ ] — mã tháng "2026-07" luôn an toàn.
        XLSX.utils.book_append_sheet(wb, built.ws, monthKey.slice(0, 31));
        patches.push({ dataLastRow: built.dataLastRow });
      });
      let bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
      bytes = await patchXlsxBytes(bytes, patches);
      const fname = "so-chi-tieu_" + (months.length === 1 ? months[0] : months[0] + "_" + months[months.length - 1]) + ".xlsx";
      downloadBytes(bytes, fname);
      closeExportModal();
    }catch(err){ showErrorBanner("export: " + err.message); }
    finally{ exportBusy = false; }
  });

  // ---------- Nhập từ Excel ----------
  const IMPORT_MAX_BYTES = 15 * 1024 * 1024;
  const IMPORT_BIG_AMOUNT = 50000; // ≥ 50 triệu đồng (đơn vị nghìn) thì nhắc kiểm tra đơn vị
  const normKey = (s) => stripDiacritics(String(s == null ? "" : s)).replace(/[^a-z0-9]+/g, " ").trim();
  // Tra danh mục không phân biệt hoa/thường/dấu: nhận mã (ck_tinh), tên cũ (Ck tính), tên đầy đủ, tên không "· chia N".
  const CAT_LOOKUP = (function(){
    const m = new Map();
    const put = (k, id) => { k = normKey(k); if(k && !m.has(k)) m.set(k, id); };
    CATS.forEach(c => { put(c.id, c.id); put(c.legacy, c.id); put(c.label, c.id); });
    CATS.forEach(c => { put(c.label.replace(/\s*·\s*chia\s*\d+/i, ""), c.id); });
    return m;
  })();

  function normalizeSheetMonth(name){
    const t = String(name).trim();
    let m = t.match(/^(\d{4})\s*[-\/.]\s*(\d{1,2})$/), y, mo;
    if(m){ y = Number(m[1]); mo = Number(m[2]); }
    else if((m = t.match(/^(\d{1,2})\s*[-\/.]\s*(\d{4})$/))){ mo = Number(m[1]); y = Number(m[2]); }
    else if((m = stripDiacritics(t).match(/^thang\s*(\d{1,2})\s*[-\/.,· ]*\s*(\d{4})$/))){ mo = Number(m[1]); y = Number(m[2]); }
    else return null;
    if(mo < 1 || mo > 12 || y < 2000 || y > 2100) return null;
    return y + "-" + String(mo).padStart(2, "0");
  }

  // Tìm cột theo TÊN tiêu đề (nên đổi thứ tự cột hay thêm cột cũng không sao). Không nhận ra tiêu đề thì dùng thứ tự cũ A..H.
  function mapImportHeader(headerRow){
    const cols = {}; let unit = null;
    (headerRow || []).forEach((h, i) => {
      const k = normKey(h); if(!k) return;
      if(cols.day == null && /^ngay\b/.test(k)) cols.day = i;
      else if(cols.name == null && /^(ten|noi dung|khoan chi|dien giai)/.test(k)) cols.name = i;
      else if(cols.amount == null && /^(so tien|tien|gia tri)/.test(k)){
        cols.amount = i;
        if(/\b(nghin|ngan|k)\b/.test(k)) unit = "nghin";
        else if(/\b(d|dong|vnd)\b/.test(k)) unit = "dong";
      }
      else if(cols.category == null && /^(danh muc|loai|nhom)/.test(k)) cols.category = i;
      else if(cols.note == null && /^(ghi chu|chu thich)/.test(k)) cols.note = i;
      else if(cols.formula == null && /^cong thuc/.test(k)) cols.formula = i;
      else if(cols.id == null && /^(id|ma)$/.test(k)) cols.id = i;
      else if(cols.updated == null && /^cap nhat/.test(k)) cols.updated = i;
    });
    if(cols.name == null || cols.amount == null){
      return { cols: { day: 0, name: 1, amount: 2, category: 3, id: 4, updated: 5, note: 6, formula: 7 }, unit: "nghin", unitAssumed: true, positional: true };
    }
    return { cols, unit: unit || "nghin", unitAssumed: !unit, positional: false };
  }

  function parseLooseNumber(t){
    let neg = false;
    if(t[0] === "-"){ neg = true; t = t.slice(1); }
    if(!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return NaN;
    const dots = (t.match(/\./g) || []).length, commas = (t.match(/,/g) || []).length;
    let intPart = t, frac = "";
    if(dots && commas){
      const last = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
      intPart = t.slice(0, last).replace(/[.,]/g, ""); frac = t.slice(last + 1);
    }else if(dots + commas > 1){
      const parts = t.split(dots ? "." : ",");
      if(!parts.slice(1).every(p => p.length === 3)) return NaN;
      intPart = parts.join("");
    }else if(dots + commas === 1){
      const sep = dots ? "." : ",";
      const pr = t.split(sep);
      if(pr[1].length === 3 && pr[0].length >= 1 && pr[0].length <= 3 && pr[0] !== "0"){ intPart = pr[0] + pr[1]; }
      else{ intPart = pr[0] || "0"; frac = pr[1]; }
    }
    const v = Number(intPart + (frac ? "." + frac : ""));
    return neg ? -v : v;
  }
  // Trả về số tiền theo đơn vị của app (nghìn đồng). unit = đơn vị của cột trong file ("dong" | "nghin").
  function parseImportAmount(raw, unit){
    const perUnit = unit === "dong" ? 1 / 1000 : 1; // 1 đơn vị trong ô = bao nhiêu nghìn đồng
    if(typeof raw === "number"){
      if(!isFinite(raw)) return { ok: false, msg: "Số tiền không hợp lệ" };
      if(raw < 0) return { ok: false, msg: "Số tiền âm (" + raw + ")" };
      return finishAmount(raw * perUnit, null);
    }
    const s = String(raw == null ? "" : raw).trim();
    if(!s) return { ok: false, msg: "Thiếu số tiền" };
    const low = stripDiacritics(s).replace(/[₫\s]/g, "");
    const m = low.match(/^(-?[\d.,]+)(k|nghin|ngan|tr|trieu|m|d|dong|vnd)?$/);
    if(!m) return { ok: false, msg: 'Số tiền không đọc được: "' + s + '"' };
    const n = parseLooseNumber(m[1]);
    if(!isFinite(n)) return { ok: false, msg: 'Số tiền không đọc được: "' + s + '"' };
    if(n < 0) return { ok: false, msg: 'Số tiền âm ("' + s + '")' };
    let thousands;
    if(m[2]){
      const mult = /^(k|nghin|ngan)$/.test(m[2]) ? 1000 : /^(tr|trieu|m)$/.test(m[2]) ? 1e6 : 1; // thành đồng
      thousands = n * mult / 1000;
    }else thousands = n * perUnit;
    thousands = Math.round(thousands * 1000) / 1000;
    return finishAmount(thousands, 'Số tiền ghi dạng chữ "' + s + '", hiểu là ' + money(thousands));
  }
  function finishAmount(thousands, textWarn){
    thousands = Math.round(thousands * 1000) / 1000;
    const warns = [];
    if(textWarn) warns.push(textWarn);
    if(thousands >= IMPORT_BIG_AMOUNT) warns.push("Số tiền rất lớn (" + money(thousands) + ") — kiểm tra lại đơn vị");
    return { ok: true, value: thousands, warns };
  }

  function parseImportDay(raw, monthKey){
    const dim = daysInMonthKey(monthKey);
    const parts = monthKey.split("-").map(Number), Y = parts[0], M = parts[1];
    const checkDay = (d) => (Number.isInteger(d) && d >= 1 && d <= dim) ? { ok: true, day: d } : { ok: false, msg: "Ngày " + d + " không có trong tháng " + monthKey + " (tháng này có " + dim + " ngày)" };
    const fromParts = (y, m, d) => (m !== M || (y && y !== Y)) ? { ok: false, msg: "Ngày " + d + "/" + m + (y ? "/" + y : "") + " không thuộc tháng " + monthKey } : checkDay(d);
    if(raw instanceof Date){
      if(isNaN(raw)) return { ok: false, msg: "Ngày không hợp lệ" };
      const t = new Date(raw.getTime() + 12 * 3600 * 1000); // +12h để lệch múi giờ/giây không làm nhảy ngày
      return fromParts(t.getFullYear(), t.getMonth() + 1, t.getDate());
    }
    if(typeof raw === "number"){
      if(Number.isInteger(raw) && raw >= 1 && raw < 36526) return checkDay(raw);
      if(raw >= 36526 && raw <= 73050){ const t = new Date(Math.round((raw - 25569) * 86400000)); return fromParts(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
      return { ok: false, msg: 'Ngày "' + raw + '" không hợp lệ' };
    }
    const s = String(raw == null ? "" : raw).trim();
    if(!s) return { ok: false, msg: "Thiếu ngày" };
    const low = stripDiacritics(s).replace(/^ngay\s*/, "");
    let m;
    if(/^\d{1,2}$/.test(low)) return checkDay(Number(low));
    if((m = low.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]));
    if((m = low.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?$/))){
      let y = m[3] ? Number(m[3]) : 0; if(m[3] && m[3].length === 2) y += 2000;
      return fromParts(y, Number(m[2]), Number(m[1]));
    }
    return { ok: false, msg: 'Ngày không đọc được: "' + s + '"' };
  }

  const cellStr = (v) => (v == null ? "" : String(v)).trim();
  // Đọc 1 dòng dữ liệu. Có lỗi -> dòng đó KHÔNG được nhập (kèm lý do); cảnh báo -> vẫn nhập nhưng nói rõ đã tự sửa gì.
  function parseImportRow(row, map, monthKey, xlRow, seenIds){
    const errors = [], warnings = [];
    const cell = (k) => (map.cols[k] == null ? "" : row[map.cols[k]]);
    const name = cellStr(cell("name"));
    if(!name) errors.push("Thiếu tên khoản chi");
    const dayR = parseImportDay(cell("day"), monthKey);
    if(!dayR.ok) errors.push(dayR.msg);
    const amtR = parseImportAmount(cell("amount"), map.unit);
    if(!amtR.ok) errors.push(amtR.msg); else amtR.warns.forEach(w => warnings.push(w));
    const rawCat = cellStr(cell("category"));
    let category = null;
    if(!rawCat){ category = "ca_nhan"; warnings.push('Danh mục trống → tự đặt "Cá nhân"'); }
    else{
      category = CAT_LOOKUP.get(normKey(rawCat)) || null;
      if(!category) errors.push('Danh mục không nhận ra: "' + rawCat + '"');
    }
    if(errors.length) return { xlRow, errors, warnings };
    let id = cellStr(cell("id"));
    if(id){
      if(seenIds.has(id)){ warnings.push("ID trùng với dòng " + seenIds.get(id) + " → tạo ID mới"); id = genEntryId(); }
    }else id = genEntryId();
    seenIds.set(id, xlRow);
    const entry = {
      id, day: dayR.day, name, amount: amtR.value, amountFormula: cellStr(cell("formula")), category,
      note: cellStr(cell("note")), updatedAt: Number(cell("updated")) || 0
    };
    return { xlRow, entry, errors, warnings };
  }

  // Đọc cả workbook: trả về { months: {mk: {entries, issues, stats, notes}}, ignored: [{name, reason}] }
  function parseImportWorkbook(wb){
    const months = {}, ignored = [];
    wb.SheetNames.forEach((sn) => {
      const mk = normalizeSheetMonth(sn);
      if(!mk){ ignored.push({ name: sn, reason: 'tên sheet không phải dạng tháng (ví dụ "2026-07")' }); return; }
      if(months[mk]){ ignored.push({ name: sn, reason: "trùng tháng " + mk + " với sheet đã đọc" }); return; }
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      if(rows.length < 2){ ignored.push({ name: sn, reason: "sheet không có dòng dữ liệu" }); return; }
      const startRow = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.r : 0;
      const map = mapImportHeader(rows[0]);
      let cut = rows.length;
      for(let i = 1; i < rows.length; i++){ if(cellStr(rows[i][0]).startsWith("──")){ cut = i; break; } } // từ dòng "── TỔNG THEO DANH MỤC ──" trở xuống là khối tính toán
      const issues = [], entries = [], notes = [], seenIds = new Map();
      let errors = 0, warns = 0, below = 0;
      for(let i = 1; i < rows.length; i++){
        const row = rows[i];
        if(i >= cut){
          const dv = row[map.cols.day != null ? map.cols.day : 0];
          if(i > cut && cellStr(row[map.cols.name]) && typeof dv === "number" && dv >= 1 && dv <= 31) below++;
          continue;
        }
        if(!row.some(v => cellStr(v) !== "")) continue; // dòng trống
        const xlRow = startRow + i + 1;
        const r = parseImportRow(row, map, mk, xlRow, seenIds);
        if(r.entry) entries.push(r.entry);
        r.errors.forEach(m => { issues.push({ row: xlRow, level: "err", msg: m }); });
        r.warnings.forEach(m => { issues.push({ row: xlRow, level: "warn", msg: m }); });
        if(r.errors.length) errors++; else if(r.warnings.length) warns++;
      }
      if(map.positional) notes.push("Không nhận ra dòng tiêu đề, đọc theo thứ tự cột A–H như file cũ.");
      else if(map.unitAssumed) notes.push('Tiêu đề cột số tiền không ghi đơn vị, hiểu là NGHÌN đồng (như app). Nếu file ghi đồng đầy đủ, hãy đổi tiêu đề thành "Số tiền (đ)".');
      else if(map.unit === "dong") notes.push("Số tiền trong file là ĐỒNG, app tự quy đổi sang nghìn đồng.");
      if(below > 0) notes.push(below + " dòng nằm dưới khối \"Tổng theo danh mục\" nên bị bỏ qua (hãy chèn dòng mới phía trên khối tổng).");
      months[mk] = { entries, issues, notes, stats: { valid: entries.length, errors, warnings: warns } };
    });
    return { months, ignored };
  }

  // ---------- Gộp / ghi đè ----------
  const sameEntryContent = (a, b) =>
    Number(a.day) === Number(b.day) && String(a.name).trim() === String(b.name).trim() &&
    Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)) < 0.0005 &&
    a.category === b.category && String(a.note || "").trim() === String(b.note || "").trim() &&
    String(a.amountFormula || "").trim() === String(b.amountFormula || "").trim();

  // Gộp theo ID, dùng mốc updatedAt: bản mới hơn thắng. Riêng khoản bị sửa TRỰC TIẾP trong Excel (mốc không đổi) thì nhận bản trong file.
  function planMerge(existing, imported, allowOverride){
    const map = new Map((existing || []).map(e => [e.id, e]));
    const out = { add: 0, update: 0, same: 0, keep: 0, keepNames: [], result: null };
    const now = Date.now();
    imported.forEach((imp) => {
      const cur = map.get(imp.id);
      if(!cur){ map.set(imp.id, Object.assign({}, imp, { updatedAt: imp.updatedAt || now })); out.add++; return; }
      if(sameEntryContent(cur, imp)){ out.same++; return; }
      const fu = imp.updatedAt || 0, cu = Number(cur.updatedAt) || 0;
      if(fu > cu){ map.set(imp.id, Object.assign({}, imp)); out.update++; }
      else if(fu === cu || fu === 0 || allowOverride){ map.set(imp.id, Object.assign({}, imp, { updatedAt: now })); out.update++; }
      else{ out.keep++; out.keepNames.push(cur.name); }
    });
    out.result = Array.from(map.values());
    return out;
  }
  function planOverwrite(existing, imported){
    const now = Date.now();
    return { replaced: (existing || []).length, count: imported.length, result: imported.map(e => Object.assign({}, e, { updatedAt: e.updatedAt || now })) };
  }

  // ---------- Hoàn tác lần nhập gần nhất ----------
  const IMPORT_UNDO_KEY = "so_chi_tieu:import_undo:v1";
  const IMPORT_UNDO_TTL_MS = 10 * 60 * 1000;
  let importUndoMem = null;
  function saveImportUndo(snap){
    importUndoMem = snap;
    try{ localStorage.setItem(IMPORT_UNDO_KEY, JSON.stringify(snap)); }catch(e){ /* đầy bộ nhớ: vẫn giữ bản trong RAM cho tới khi tải lại trang */ }
  }
  function clearImportUndo(){ importUndoMem = null; try{ localStorage.removeItem(IMPORT_UNDO_KEY); }catch(e){} }
  function loadImportUndo(){
    let s = importUndoMem;
    if(!s){ try{ s = JSON.parse(localStorage.getItem(IMPORT_UNDO_KEY) || "null"); }catch(e){ s = null; } }
    if(!s || !s.months || Date.now() - Number(s.at) > IMPORT_UNDO_TTL_MS){ if(s) clearImportUndo(); return null; }
    return s;
  }
  function refreshImportUndoUI(){
    const btn = document.getElementById("importUndoBtn");
    if(!btn) return;
    const s = loadImportUndo();
    if(!s){ btn.hidden = true; return; }
    const mins = Math.max(1, Math.ceil((Number(s.at) + IMPORT_UNDO_TTL_MS - Date.now()) / 60000));
    const d = new Date(Number(s.at));
    btn.textContent = "Hoàn tác lần nhập lúc " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + " (còn " + mins + " phút)";
    btn.hidden = false;
  }
  function undoLastImport(){
    const s = loadImportUndo();
    if(!s){ showNotice("Không còn lần nhập nào để hoàn tác (chỉ giữ 10 phút)."); refreshImportUndoUI(); return; }
    const keys = Object.keys(s.months).sort();
    const restore = {};
    let removedLocal = 0;
    keys.forEach((k) => {
      if(Array.isArray(s.months[k])){ monthsData[k] = s.months[k]; restore[k] = s.months[k]; }
      else if(monthsData[k]){ removedLocal++; removeMonthLocally(k); } // tháng này trước đó chưa có trên máy
    });
    if(!monthsData[currentMonthKey] || !Array.isArray(monthsData[currentMonthKey])){
      const ks = Object.keys(monthsData).sort().reverse();
      currentMonthKey = ks[0] || currentMonthKey;
      if(!monthsData[currentMonthKey]) monthsData[currentMonthKey] = [];
    }
    entries = monthsData[currentMonthKey];
    clearImportUndo();
    saveCache(); renderMonthUI(); render(); refreshImportUndoUI();
    const done = () => { showNotice("Đã hoàn tác lần nhập: " + keys.map(monthLabel).join(", ") + (removedLocal ? ". " + removedLocal + " tháng do lần nhập tạo ra đã bị gỡ khỏi máy (trên Google Sheet vẫn còn, xoá bằng menu tháng nếu cần)." : ".")); };
    if(SHEET_SYNC_URL && Object.keys(restore).length){
      pushFullMonths(restore).then((r) => {
        if(r.failed.length) showNotice("Đã hoàn tác trên máy nhưng chưa gửi được lên Google Sheet: " + r.failed.map(f => monthLabel(f.monthKey)).join(", ") + ". App sẽ tự thử lại.");
        else done();
      }).catch(() => done());
    }else done();
  }
  document.getElementById("importUndoBtn").addEventListener("click", () => {
    const s = loadImportUndo();
    if(!s){ refreshImportUndoUI(); return; }
    const keys = Object.keys(s.months).sort();
    openConfirm("Hoàn tác lần nhập gần nhất?",
      "Đưa " + keys.map(monthLabel).join(", ") + " về đúng như trước khi nhập. Khoản chi thêm hoặc sửa trong các tháng này SAU lúc nhập sẽ mất. Tháng trước đó chưa có trên máy sẽ bị gỡ khỏi máy.",
      "Hoàn tác", true, undoLastImport);
  });

  // ---------- Xem trước khi nhập ----------
  const importPreviewOverlay = document.getElementById("importPreviewOverlay");
  const importMonthList = document.getElementById("importMonthList");
  const importModeWarning = document.getElementById("importModeWarning");
  const importSheetNote = document.getElementById("importSheetNote");
  const importOptRow = document.getElementById("importOptRow");
  const importAllowOverride = document.getElementById("importAllowOverride");
  const importTypeBox = document.getElementById("importTypeBox");
  const importTypeInput = document.getElementById("importTypeInput");
  let importPreviewData = null; // { months, ignored }
  let importMode = "merge";
  let importChecked = new Set();

  function importExistingCount(mk){ return (monthsData[mk] || []).length; }
  function importPlanFor(mk){
    const pm = importPreviewData.months[mk];
    return importMode === "merge" ? planMerge(monthsData[mk], pm.entries, importAllowOverride.checked) : planOverwrite(monthsData[mk], pm.entries);
  }
  function importNeedsTypeConfirm(){
    if(importMode !== "overwrite") return false;
    return Array.from(importChecked).some(mk => importExistingCount(mk) > 0);
  }
  function setImportMode(mode){
    importMode = mode;
    importPreviewOverlay.querySelectorAll(".import-mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    importModeWarning.classList.toggle("mode-merge", mode === "merge");
    importModeWarning.innerHTML = mode === "overwrite"
      ? "<b>Ghi đè hoàn toàn:</b> các tháng được tích sẽ bị <b>thay hẳn</b> bằng nội dung file, cả trên máy lẫn Google Sheet. Khoản đang có mà không nằm trong file sẽ mất. Có thể hoàn tác trong 10 phút."
      : "<b>Gộp thêm:</b> khoản chưa có thì được thêm; khoản trùng ID thì lấy bản <b>mới hơn</b> (so mốc cập nhật). Khoản bạn vừa sửa trực tiếp trong Excel sẽ được nhận. Khoản không có trong file được giữ nguyên.";
    importOptRow.hidden = mode !== "merge";
    renderImportList();
  }
  function renderImportList(){
    const pd = importPreviewData;
    if(!pd) return;
    const keys = Object.keys(pd.months).sort();
    importMonthList.innerHTML = keys.map((mk) => {
      const pm = pd.months[mk], st = pm.stats, plan = importPlanFor(mk);
      const usable = st.valid > 0;
      const checked = usable && importChecked.has(mk);
      const bits = [];
      if(importMode === "merge"){
        bits.push("thêm " + plan.add, "cập nhật " + plan.update, "không đổi " + plan.same);
        if(plan.keep) bits.push('<span class="warn">giữ bản app ' + plan.keep + "</span>");
      }else{
        bits.push(plan.count + " khoản");
        if(plan.replaced) bits.push('<span class="warn">thay ' + plan.replaced + " khoản đang có</span>");
      }
      if(st.errors) bits.push('<span class="err">✕ ' + st.errors + " lỗi</span>");
      if(st.warnings) bits.push('<span class="warn">⚠ ' + st.warnings + " cảnh báo</span>");
      const extra = [];
      if(SHEET_SYNC_URL && !monthsData[mk]) extra.push('<div class="import-flag">Tháng này chưa có trên máy. Nếu Google Sheet đã có dữ liệu tháng này, nó sẽ bị thay bằng nội dung file. Muốn gộp thì dùng "＋ Thêm tháng" để tải tháng đó về trước.</div>');
      pm.notes.forEach(n => extra.push('<div class="import-note">' + escapeHtml(n) + "</div>"));
      let detail = "";
      const lines = pm.issues.slice().sort((a, b) => a.row - b.row);
      if(lines.length || (importMode === "merge" && plan.keepNames.length)){
        const shown = lines.slice(0, 60).map(i => '<li class="' + i.level + '"><b>Dòng ' + i.row + "</b> " + (i.level === "err" ? "✕ " : "⚠ ") + escapeHtml(i.msg) + "</li>").join("");
        const more = lines.length > 60 ? "<li>… và " + (lines.length - 60) + " dòng nữa</li>" : "";
        const keep = (importMode === "merge" && plan.keepNames.length) ? '<li class="warn">Giữ bản trên app (mới hơn file): ' + escapeHtml(plan.keepNames.slice(0, 10).join(", ")) + (plan.keepNames.length > 10 ? "…" : "") + "</li>" : "";
        detail = '<details class="import-issues"><summary>Chi tiết (' + (lines.length + (keep ? 1 : 0)) + ')</summary><ul>' + keep + shown + more + "</ul></details>";
      }
      return '<div class="import-month-item"><label class="import-month-row' + (usable ? "" : " disabled") + '"><input type="checkbox" data-month="' + mk + '"' + (checked ? " checked" : "") + (usable ? "" : " disabled") + ' /><span class="import-month-name">' + escapeHtml(monthLabel(mk)) + '</span><span class="import-month-stats">' + (usable ? bits.join(" · ") : '<span class="err">không có dòng hợp lệ' + (st.errors ? " · ✕ " + st.errors + " lỗi" : "") + "</span>") + "</span></label>" + extra.join("") + detail + "</div>";
    }).join("");
    updateImportConfirmState();
  }
  function updateImportConfirmState(){
    const toggle = document.getElementById("importMonthToggleAll");
    const total = importPreviewData ? Object.keys(importPreviewData.months).filter(k => importPreviewData.months[k].stats.valid > 0).length : 0;
    toggle.textContent = importChecked.size >= total ? "Bỏ chọn tất cả" : "Chọn tất cả";
    importTypeBox.hidden = !importNeedsTypeConfirm();
    if(importTypeBox.hidden) importTypeInput.value = "";
    document.getElementById("importPreviewConfirm").disabled = importChecked.size === 0;
  }
  function openImportPreview(data){
    importPreviewData = data;
    importChecked = new Set(Object.keys(data.months).filter(k => data.months[k].stats.valid > 0));
    importAllowOverride.checked = false;
    importTypeInput.value = "";
    if(data.ignored.length){
      importSheetNote.innerHTML = "<b>Sheet bị bỏ qua:</b> " + data.ignored.map(i => escapeHtml(i.name) + " (" + escapeHtml(i.reason) + ")").join("; ");
      importSheetNote.hidden = false;
    }else importSheetNote.hidden = true;
    setImportMode("merge");
    importPreviewOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeImportPreview(){
    importPreviewOverlay.classList.remove("show");
    importPreviewData = null;
    importChecked = new Set();
    resumeParticleBg();
  }
  importPreviewOverlay.querySelectorAll(".import-mode-btn").forEach(b => b.addEventListener("click", () => setImportMode(b.dataset.mode)));
  importAllowOverride.addEventListener("change", renderImportList);
  importMonthList.addEventListener("change", (e) => {
    const cb = e.target.closest("input[data-month]");
    if(!cb) return;
    if(cb.checked) importChecked.add(cb.dataset.month); else importChecked.delete(cb.dataset.month);
    updateImportConfirmState();
  });
  document.getElementById("importMonthToggleAll").addEventListener("click", () => {
    if(!importPreviewData) return;
    const usable = Object.keys(importPreviewData.months).filter(k => importPreviewData.months[k].stats.valid > 0);
    importChecked = importChecked.size >= usable.length ? new Set() : new Set(usable);
    renderImportList();
  });
  document.getElementById("importPreviewClose").addEventListener("click", closeImportPreview);
  document.getElementById("importPreviewCancel").addEventListener("click", closeImportPreview);
  importPreviewOverlay.addEventListener("click", (e) => { if(e.target === importPreviewOverlay) closeImportPreview(); });

  let importApplying = false;
  document.getElementById("importPreviewConfirm").addEventListener("click", () => {
    if(!importPreviewData || importApplying) return;
    const selected = Array.from(importChecked).filter(k => importPreviewData.months[k] && importPreviewData.months[k].stats.valid > 0).sort();
    if(!selected.length){ showNotice("Chưa chọn tháng nào để nhập."); return; }
    if(importNeedsTypeConfirm() && normKey(importTypeInput.value) !== "ghi de"){
      showNotice('Gõ "ghi đè" vào ô xác nhận để tiếp tục.');
      importTypeInput.focus();
      return;
    }
    importApplying = true;
    try{
      const mode = importMode;
      const snapshot = { at: Date.now(), mode, months: {} };
      const toApply = {};
      let add = 0, upd = 0, kept = 0, total = 0;
      selected.forEach((mk) => {
        snapshot.months[mk] = monthsData[mk] ? JSON.parse(JSON.stringify(monthsData[mk])) : null;
        const plan = importPlanFor(mk);
        toApply[mk] = plan.result;
        if(mode === "merge"){ add += plan.add; upd += plan.update; kept += plan.keep; } else total += plan.count;
      });
      saveImportUndo(snapshot); // lưu bản sao TRƯỚC khi ghi để luôn hoàn tác được
      Object.keys(toApply).forEach((mk) => { purgePending(mk); monthsData[mk] = toApply[mk]; });
      const newest = selected.slice().sort().reverse()[0];
      currentMonthKey = newest;
      entries = monthsData[currentMonthKey];
      saveCache(); renderMonthUI(); render();
      closeImportPreview();
      closeExportModal();
      const summary = mode === "merge"
        ? "Đã gộp " + selected.length + " tháng: thêm <b>" + add + "</b>, cập nhật <b>" + upd + "</b>" + (kept ? ", giữ bản app " + kept : "")
        : "Đã ghi đè " + selected.length + " tháng, <b>" + total + "</b> khoản";
      const undo = () => undoLastImport();
      if(SHEET_SYNC_URL){
        showVoiceToast(false, summary + ". Đang gửi lên Google Sheet…", undo);
        pushFullMonths(toApply).then((result) => {
          if(result.failed.length) showNotice("Đã nhập trên máy, nhưng chưa gửi được lên Google Sheet: " + result.failed.map(f => monthLabel(f.monthKey)).join(", ") + ". App sẽ tự thử lại.");
          else showVoiceToast(false, summary + " và đã đồng bộ", undo);
        }).catch(() => showNotice("Đã nhập trên máy; đồng bộ lên Google Sheet sẽ được thử lại."));
      }else showVoiceToast(false, summary, undo);
    }catch(err){
      showErrorBanner("import: " + err.message);
    }finally{ importApplying = false; }
  });

  // ---------- Chọn file ----------
  const importFileInput = document.getElementById("importFileInput");
  document.getElementById("importPickBtn").addEventListener("click", () => {
    // Mở hộp chọn file ngay (trình duyệt chỉ cho phép ngay trong thao tác bấm), đồng thời nạp thư viện Excel ngầm.
    loadXlsx().catch(() => {});
    closeExportModal();
    importFileInput.click();
  });
  document.getElementById("importCancelBtn").addEventListener("click", closeExportModal);
  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files && importFileInput.files[0];
    importFileInput.value = "";
    if(!file) return;
    if(file.size > IMPORT_MAX_BYTES){ showNotice("File quá lớn (" + Math.round(file.size / 1048576) + " MB). Chỉ nhập file Excel dưới 15 MB."); return; }
    try{
      await loadXlsx();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      const data = parseImportWorkbook(wb);
      if(!Object.keys(data.months).length){
        showNotice("Không thấy sheet tháng nào trong file." + (data.ignored.length ? " Đã bỏ qua: " + data.ignored.map(i => i.name).join(", ") + ". Tên sheet cần dạng 2026-07." : ""));
        return;
      }
      openImportPreview(data);
    }catch(err){
      if(err && (err.message === "load" || err.message === "init")){ showNotice(EXCEL_LOAD_ERROR); return; }
      showNotice("Không đọc được file Excel này: " + (err && err.message ? err.message : "định dạng lạ") + ". Hãy thử lưu lại thành .xlsx rồi nhập lại.");
    }
  });

  // ---------- Dọn ghi chú hàng loạt ----------
  // CHỈ sửa ô Ghi chú. Ô tìm kiếm vẫn chỉ để lọc hiển thị; hộp thoại này lấy chữ đang tìm làm gợi ý ban đầu rồi tự quét lại
  // phần ghi chú của từng khoản (đúng cụm, nguyên từ, giữ dấu) — khoản chỉ khớp qua tên/danh mục/số tiền sẽ không bị đụng tới.
  const NOTE_UNDO_KEY = "so_chi_tieu:note_undo:v1";
  const NOTE_UNDO_TTL_MS = 10 * 60 * 1000;
  const NOTE_CLEAN_CONFIRM_FROM = 10; // từ ngần này khoản trở lên phải gõ số lượng để xác nhận
  let noteUndoMem = null;
  function saveNoteUndo(s){ noteUndoMem = s; try{ localStorage.setItem(NOTE_UNDO_KEY, JSON.stringify(s)); }catch(e){} }
  function clearNoteUndo(){ noteUndoMem = null; try{ localStorage.removeItem(NOTE_UNDO_KEY); }catch(e){} }
  function loadNoteUndo(){
    let s = noteUndoMem;
    if(!s){ try{ s = JSON.parse(localStorage.getItem(NOTE_UNDO_KEY) || "null"); }catch(e){ s = null; } }
    if(!s || !Array.isArray(s.items) || Date.now() - Number(s.at) > NOTE_UNDO_TTL_MS){ if(s) clearNoteUndo(); return null; }
    return s;
  }

  const ncOverlay = document.getElementById("noteCleanOverlay");
  const ncPhrase = document.getElementById("ncPhrase");
  const ncModeAll = document.getElementById("ncModeAll");
  const ncScope = document.getElementById("ncScope"); // <select> ẩn giữ giá trị (cùng kiểu với các bảng chọn khác của app)
  const ncScopeTrigger = document.getElementById("ncScopeTrigger");
  const ncScopePanel = document.getElementById("ncScopePanel");
  const ncScopeList = document.getElementById("ncScopeList");
  const ncScopeLabel = document.getElementById("ncScopeLabel");
  const ncSummary = document.getElementById("ncSummary");
  const ncListWrap = document.getElementById("ncListWrap");
  const ncList = document.getElementById("ncList");
  const ncToggleAll = document.getElementById("ncToggleAll");
  const ncTypeBox = document.getElementById("ncTypeBox");
  const ncTypeInput = document.getElementById("ncTypeInput");
  const ncTypeCount = document.getElementById("ncTypeCount");
  const ncConfirm = document.getElementById("ncConfirm");
  const ncUndoBtn = document.getElementById("ncUndoBtn");
  let ncPlan = { items: [], scanned: 0, visibleTotal: 0 };
  let ncChecked = new Set();
  let ncTimer = null;
  let ncApplying = false;

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Khớp NGUYÊN CỤM (khoảng trắng linh hoạt), không phân biệt hoa/thường, GIỮ dấu ("chợ" ≠ "cho"), không cắt giữa từ ("chợ lớn" không bị cắt thành "lớn").
  function buildPhraseRegex(phrase){
    const p = String(phrase || "").normalize("NFC").trim().replace(/\s+/g, " ");
    if(!p) return null;
    try{ return new RegExp("(^|[^\\p{L}\\p{N}])(" + escapeRegExp(p).replace(/ /g, "\\s+") + ")(?![\\p{L}\\p{N}])", "giu"); }
    catch(e){ return null; }
  }
  // Sau khi bỏ cụm: gọn lại khoảng trắng và dấu phân cách thừa ("Mua ở chợ; ăn sáng" -> "ăn sáng").
  function tidyNote(s){
    return s.replace(/\s+/g, " ")
      .replace(/\s+([;,.:!?|])/g, "$1")
      .replace(/([;,|\/])(\s*[;,|\/])+/g, "$1")
      .replace(/^[\s;,.:|\/\-–—]+/, "")
      .replace(/[\s;,:|\/\-–—]+$/, "")
      .replace(/\s+/g, " ").trim();
  }
  const ncListFor = (mk) => mk === currentMonthKey ? entries : monthsData[mk];
  // Ghi chú có thể gồm nhiều đoạn ngăn bằng ; , | xuống dòng hoặc " - ". Khớp ĐÚNG = có 1 đoạn đúng bằng cụm cần xoá
  // (vd. "Mua ở chợ" hay "ăn sáng; Mua ở chợ"). Cụm nằm lọt trong câu dài hơn ("Mua ở Chợ Lớn") chỉ là khớp MỘT PHẦN: hiện riêng, không chọn sẵn.
  const NC_SEP_RE = /(\s*(?:[;,|\n]|\s[-–—]\s)\s*)/;
  const normSeg = (s) => String(s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").replace(/[.!\s]+$/, "").trim();
  function removeExactSegments(note, phraseNorm){
    const parts = String(note).normalize("NFC").split(NC_SEP_RE); // [đoạn, ngăn, đoạn, ngăn, ...]
    const segs = [], seps = [];
    parts.forEach((p, i) => { (i % 2 === 0 ? segs : seps).push(p); });
    const keep = [];
    let removed = false;
    segs.forEach((sg, i) => { if(normSeg(sg) === phraseNorm) removed = true; else keep.push(i); });
    if(!removed) return null;
    let out = "";
    keep.forEach((i, k) => { if(k > 0) out += (seps[i - 1] !== undefined ? seps[i - 1] : "; "); out += segs[i]; });
    return tidyNote(out);
  }

  function buildNoteCleanPlan(){
    const plan = { items: [], scanned: 0, visibleTotal: 0, empty: false, exact: 0, partial: 0 };
    const re = buildPhraseRegex(ncPhrase.value);
    if(!re){ plan.empty = true; return plan; }
    const phraseNorm = normSeg(ncPhrase.value);
    const mode = ncModeAll.checked ? "all" : "phrase";
    const scope = ncScope.value;
    const sources = [];
    if(scope === "all") Object.keys(monthsData).sort().forEach(mk => sources.push({ mk, list: ncListFor(mk) || [] }));
    else sources.push({ mk: currentMonthKey, list: scope === "visible" ? entries.filter(ledgerFilterPredicate()) : entries });
    const exact = [], partial = [];
    sources.forEach((src) => {
      src.list.forEach((e) => {
        plan.scanned++;
        const note = String(e.note || "").normalize("NFC");
        if(!note.trim()) return;
        const base = { monthKey: src.mk, id: e.id, day: e.day, name: e.name, amount: e.amount, before: String(e.note) };
        const seg = removeExactSegments(note, phraseNorm);
        if(seg !== null){ exact.push(Object.assign(base, { after: mode === "all" ? "" : seg, kind: "exact" })); return; }
        re.lastIndex = 0;
        if(!re.test(note)) return;
        re.lastIndex = 0;
        partial.push(Object.assign(base, { after: mode === "all" ? "" : tidyNote(note.replace(re, "$1")), kind: "partial" }));
      });
    });
    plan.items = exact.concat(partial);
    plan.exact = exact.length;
    plan.partial = partial.length;
    plan.visibleTotal = scope === "visible" ? plan.scanned : 0;
    return plan;
  }

  function renderNoteCleanPlan(){
    ncPlan = buildNoteCleanPlan();
    ncChecked = new Set(ncPlan.items.map((it, i) => it.kind === "exact" ? i : -1).filter(i => i >= 0)); // khớp một phần: không chọn sẵn
    const phrase = ncPhrase.value.trim();
    if(ncPlan.empty){
      ncSummary.innerHTML = "Nhập cụm chữ cần xoá khỏi ghi chú.";
      ncListWrap.hidden = true;
    }else if(!ncPlan.items.length){
      ncSummary.innerHTML = "Không có ghi chú nào chứa “<b>" + escapeHtml(phrase) + "</b>” trong phạm vi đã chọn (đã xem " + ncPlan.scanned + " khoản).";
      ncListWrap.hidden = true;
    }else{
      const untouched = ncScope.value === "visible" ? ncPlan.scanned - ncPlan.items.length : 0;
      ncSummary.innerHTML = "Ghi chú <b>đúng là</b> “<b>" + escapeHtml(phrase) + "</b>”: <b>" + ncPlan.exact + "</b> khoản (đã chọn sẵn)." +
        (ncPlan.partial ? " Ghi chú chỉ <b>chứa</b> cụm này trong câu dài hơn: <b>" + ncPlan.partial + "</b> khoản (chưa chọn, tự xem xét)." : "") +
        (untouched > 0 ? " Còn " + untouched + " khoản đang hiện nhưng ghi chú không liên quan — <b>sẽ không bị đổi</b>." : "");
      ncListWrap.hidden = false;
    }
    drawNoteCleanList();
  }
  function drawNoteCleanList(){
    const MAX_SHOWN = 150;
    const multiMonth = ncScope.value === "all";
    ncList.innerHTML = ncPlan.items.slice(0, MAX_SHOWN).map((it, i) =>
      '<label class="nc-item' + (it.kind === "partial" ? " partial" : "") + '"><input type="checkbox" data-i="' + i + '"' + (ncChecked.has(i) ? " checked" : "") + ' />' +
      '<span class="nc-item-main"><span class="nc-item-top">' + (multiMonth ? escapeHtml(monthLabel(it.monthKey)) + " · " : "") + "Ngày " + escapeHtml(it.day) + " · " + escapeHtml(it.name) + " · " + escapeHtml(money(it.amount)) + (it.kind === "partial" ? ' <em class="nc-badge">nằm trong câu dài hơn</em>' : "") + "</span>" +
      '<span class="nc-diff"><span class="nc-before">' + escapeHtml(it.before) + '</span><span class="nc-arrow">→</span><span class="nc-after' + (it.after ? "" : " empty") + '">' + (it.after ? escapeHtml(it.after) : "(để trống)") + "</span></span></span></label>"
    ).join("") + (ncPlan.items.length > MAX_SHOWN ? '<div class="nc-more">… và ' + (ncPlan.items.length - MAX_SHOWN) + " khoản nữa (vẫn được dọn nếu còn chọn)</div>" : "");
    updateNoteCleanState();
  }
  function updateNoteCleanState(){
    const n = ncChecked.size;
    ncToggleAll.textContent = n >= ncPlan.items.length ? "Bỏ chọn tất cả" : "Chọn tất cả";
    const need = n >= NOTE_CLEAN_CONFIRM_FROM;
    ncTypeBox.hidden = !need;
    ncTypeCount.textContent = String(n);
    if(!need) ncTypeInput.value = "";
    ncConfirm.disabled = n === 0;
    ncConfirm.textContent = n > 0 ? "Dọn ghi chú (" + n + " khoản)" : "Dọn ghi chú";
  }
  function refreshNoteUndoUI(){
    const s = loadNoteUndo();
    if(!s){ ncUndoBtn.hidden = true; return; }
    const mins = Math.max(1, Math.ceil((Number(s.at) + NOTE_UNDO_TTL_MS - Date.now()) / 60000));
    ncUndoBtn.textContent = "Hoàn tác lần dọn gần nhất: " + s.items.length + " khoản (còn " + mins + " phút)";
    ncUndoBtn.hidden = false;
  }
  // ---- Bảng chọn "Phạm vi": cùng kiểu .cat-picker / .cat-panel / .cat-option như bảng chọn danh mục & ngày ----
  function ncScopeCounts(){
    return {
      visible: entries.filter(ledgerFilterPredicate()).length,
      month: entries.length,
      all: Object.keys(monthsData).reduce((s, mk) => s + ((ncListFor(mk) || []).length), 0)
    };
  }
  function ncScopeVisibleDisabled(){ return ncScope.querySelector('option[value="visible"]').disabled; }
  function buildNcScopeList(){
    const cnt = ncScopeCounts();
    ncScopeList.innerHTML = Array.from(ncScope.options).map((o) => {
      const dis = o.disabled;
      return '<button type="button" class="cat-option' + (o.value === ncScope.value ? " active" : "") + (dis ? " disabled" : "") + '" role="option"' +
        ' aria-selected="' + (o.value === ncScope.value ? "true" : "false") + '"' + (dis ? ' aria-disabled="true"' : "") + ' data-v="' + o.value + '">' +
        '<span class="nc-scope-opt-label">' + escapeHtml(o.textContent) + '</span>' +
        '<span class="nc-scope-count">' + (dis ? "chưa lọc" : cnt[o.value] + " khoản") + "</span></button>";
    }).join("");
  }
  function setNcScope(v, silent){
    ncScope.value = v;
    const opt = ncScope.querySelector('option[value="' + v + '"]');
    ncScopeLabel.textContent = opt ? opt.textContent : "";
    buildNcScopeList();
    if(!silent) ncScope.dispatchEvent(new Event("change"));
  }
  function closeNcScopePanel(){
    ncScopePanel.classList.remove("show");
    ncScopeTrigger.classList.remove("open");
    ncScopeTrigger.setAttribute("aria-expanded", "false");
  }
  ncScopeTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if(typeof closeAllPopovers === "function") closeAllPopovers("ncScope");
    const willOpen = !ncScopePanel.classList.contains("show");
    if(willOpen) buildNcScopeList(); // số khoản luôn là số mới nhất
    ncScopePanel.classList.toggle("show", willOpen);
    ncScopeTrigger.classList.toggle("open", willOpen);
    ncScopeTrigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });
  ncScopeList.addEventListener("click", (e) => {
    e.stopPropagation();
    const opt = e.target.closest(".cat-option");
    if(!opt || opt.classList.contains("disabled")) return;
    setNcScope(opt.dataset.v);
    closeNcScopePanel();
  });
  document.addEventListener("click", (e) => { if(!e.target.closest("#ncScopePicker")) closeNcScopePanel(); });
  ncScopeTrigger.addEventListener("keydown", (e) => { if(e.key === "Escape" && ncScopePanel.classList.contains("show")){ e.stopPropagation(); closeNcScopePanel(); } });

  function openNoteClean(){
    const filterActive = !!(ledgerFilterText || ledgerFilterCat || ledgerFilterDay);
    ncPhrase.value = ledgerFilterText.trim(); // chỉ là gợi ý từ ô tìm kiếm; sửa tuỳ ý. Ô tìm kiếm không bị thay đổi.
    document.getElementById("ncModePhrase").checked = true;
    ncScope.querySelector('option[value="visible"]').disabled = !filterActive;
    closeNcScopePanel();
    setNcScope(filterActive ? "visible" : "month", true);
    ncTypeInput.value = "";
    refreshNoteUndoUI();
    renderNoteCleanPlan();
    ncOverlay.classList.add("show");
    pauseParticleBg();
    setTimeout(() => { try{ ncPhrase.focus(); }catch(e){} }, 60);
  }
  function closeNoteClean(){
    closeNcScopePanel();
    ncOverlay.classList.remove("show");
    resumeParticleBg();
  }

  // Áp danh sách thay đổi ghi chú: [{monthKey, id, note, ...}]. requireField (tuỳ chọn) = tên trường mà ghi chú HIỆN TẠI phải còn khớp
  // (dùng cho hoàn tác: nếu bạn đã sửa lại ghi chú đó sau khi dọn thì không ghi đè bản mới của bạn).
  function applyNoteChanges(changes, requireField){
    const byMonth = new Map();
    changes.forEach((c) => { if(!byMonth.has(c.monthKey)) byMonth.set(c.monthKey, []); byMonth.get(c.monthKey).push(c); });
    const now = Date.now();
    const queued = [];
    let n = 0;
    byMonth.forEach((list, mk) => {
      const src = ncListFor(mk);
      if(!src) return;
      const map = new Map(list.map(c => [String(c.id), c]));
      const next = src.map((e) => {
        const c = map.get(String(e.id));
        if(!c) return e;
        if(requireField && String(e.note || "").trim() !== String(c[requireField] || "").trim()) return e;
        n++;
        const u = Object.assign({}, e, { note: c.note, updatedAt: now });
        queued.push({ monthKey: mk, entry: u });
        return u;
      });
      if(mk === currentMonthKey){ entries = next; commit(); }
      else{ monthsData[mk] = next; saveCache(); }
    });
    if(SHEET_SYNC_URL && queued.length){
      queued.forEach(q => enqueueItem({ action: "updateEntry", monthKey: q.monthKey, entry: q.entry }));
      scheduleSync(300); // các lệnh sửa liền nhau được gửi gộp 1 yêu cầu (xem collectUpdateBatch)
    }
    render();
    return { n, skipped: changes.length - n };
  }

  function runNoteClean(){
    if(ncApplying) return;
    const picked = ncPlan.items.filter((_, i) => ncChecked.has(i));
    if(!picked.length) return;
    if(picked.length >= NOTE_CLEAN_CONFIRM_FROM && ncTypeInput.value.trim() !== String(picked.length)){
      showNotice("Gõ đúng số " + picked.length + " vào ô xác nhận để tiếp tục.");
      ncTypeInput.focus();
      return;
    }
    ncApplying = true;
    try{
      // Lưu bản sao ghi chú cũ TRƯỚC khi sửa để luôn hoàn tác được (giữ 10 phút, kể cả khi tải lại trang).
      saveNoteUndo({ at: Date.now(), items: picked.map(it => ({ monthKey: it.monthKey, id: it.id, before: it.before, after: it.after })) });
      const r = applyNoteChanges(picked.map(it => ({ monthKey: it.monthKey, id: it.id, note: it.after })));
      closeNoteClean();
      showVoiceToast(false, "Đã dọn ghi chú <b>" + r.n + "</b> khoản" + (SHEET_SYNC_URL ? ". Đang gửi lên Google Sheet…" : ""), () => undoNoteClean());
    }catch(err){
      showErrorBanner("note-clean: " + err.message);
    }finally{ ncApplying = false; }
  }
  function undoNoteClean(){
    const s = loadNoteUndo();
    if(!s){ showNotice("Không còn lần dọn nào để hoàn tác (chỉ giữ 10 phút)."); refreshNoteUndoUI(); return; }
    const r = applyNoteChanges(s.items.map(it => ({ monthKey: it.monthKey, id: it.id, note: it.before, after: it.after })), "after");
    clearNoteUndo();
    refreshNoteUndoUI();
    showNotice("Đã khôi phục ghi chú cũ cho " + r.n + " khoản" + (r.skipped ? ". " + r.skipped + " khoản giữ nguyên vì bạn đã sửa lại ghi chú (hoặc khoản không còn)." : "."));
  }

  document.getElementById("noteCleanBtn").addEventListener("click", () => { openNoteClean(); });
  document.getElementById("ncClose").addEventListener("click", closeNoteClean);
  document.getElementById("ncCancel").addEventListener("click", closeNoteClean);
  ncOverlay.addEventListener("click", (e) => { if(e.target === ncOverlay) closeNoteClean(); });
  ncPhrase.addEventListener("input", () => { clearTimeout(ncTimer); ncTimer = setTimeout(renderNoteCleanPlan, 150); });
  ncScope.addEventListener("change", renderNoteCleanPlan);
  document.getElementById("ncModePhrase").addEventListener("change", renderNoteCleanPlan);
  ncModeAll.addEventListener("change", renderNoteCleanPlan);
  ncList.addEventListener("change", (e) => {
    const cb = e.target.closest("input[data-i]");
    if(!cb) return;
    const i = Number(cb.dataset.i);
    if(cb.checked) ncChecked.add(i); else ncChecked.delete(i);
    updateNoteCleanState();
  });
  ncToggleAll.addEventListener("click", () => {
    ncChecked = ncChecked.size >= ncPlan.items.length ? new Set() : new Set(ncPlan.items.map((_, i) => i));
    drawNoteCleanList();
  });
  ncConfirm.addEventListener("click", runNoteClean);
  ncUndoBtn.addEventListener("click", () => {
    const s = loadNoteUndo();
    if(!s){ refreshNoteUndoUI(); return; }
    openConfirm("Hoàn tác lần dọn ghi chú gần nhất?",
      "Khôi phục ghi chú cũ cho " + s.items.length + " khoản. Khoản nào bạn đã sửa lại ghi chú sau lúc dọn sẽ được giữ nguyên.",
      "Hoàn tác", false, () => { undoNoteClean(); closeNoteClean(); });
  });

  document.getElementById("syncNowBtn").addEventListener("click", () => {
    closeMenuPanel();
    // Gửi nốt thay đổi còn chờ rồi tải bản mới nhất của tháng đang xem. Thay đổi chưa lên Sheet luôn được giữ lại
    // trên màn hình, nên không cần hộp xác nhận nữa.
    retryAttempt = 0;
    pullMonth(currentMonthKey, { manual: true });
  });

  // Bấm ⚡ -> hỏi xác nhận trước khi đổi (tránh bấm nhầm); chỉ đổi khi bấm nút xác nhận.
  document.getElementById("autoPullToggle").addEventListener("click", () => {
    const next = !getAutoPull();
    const apply = () => {
      setAutoPull(next);
      flashSyncStatus(next ? "Đã BẬT tự động tải bản mới khi mở/quay lại app" : "Đã TẮT tự động tải bản mới", 3000);
      if(next && SHEET_SYNC_URL) pullMonth(currentMonthKey);
    };
    if(next){
      openConfirm(
        "Bật tự động tải bản mới?",
        "App sẽ tự tải dữ liệu mới từ Google Sheet khi bạn mở hoặc quay lại app (cách lần tải trước từ 2 phút) và khi chuyển tháng, để thấy khoản chi của người kia mà không cần bấm Đồng bộ.",
        "Bật", false, apply
      );
    }else{
      openConfirm(
        "Tắt tự động tải bản mới?",
        "Khi tắt, bạn sẽ không thấy khoản chi mới của người kia cho đến khi tự bấm \"Đồng bộ\" trong menu ⋮. Thay đổi của bạn vẫn được gửi lên Sheet bình thường.",
        "Tắt", false, apply
      );
    }
  });

  document.getElementById("themeToggle").addEventListener("click", () => {
    setTheme(getTheme() === "light" ? "dark" : "light");
  });
  // Nếu người dùng CHƯA từng tự chọn giao diện trên máy này, tự đổi theo khi họ
  // đổi chế độ sáng/tối của hệ điều hành (ví dụ theo lịch mặt trời của macOS/Windows).
  if(window.matchMedia){
    const schemeQuery = window.matchMedia("(prefers-color-scheme: light)");
    const onSchemeChange = (e) => {
      let hasSavedChoice = false;
      try{ hasSavedChoice = localStorage.getItem(THEME_KEY) !== null; }catch(err){ /* ignore */ }
      if(!hasSavedChoice){
        document.documentElement.setAttribute("data-theme", e.matches ? "light" : "dark");
        renderThemeToggle();
        if(typeof window.__particleRefreshColors === "function") window.__particleRefreshColors();
      }
    };
    if(schemeQuery.addEventListener) schemeQuery.addEventListener("change", onSchemeChange);
  }

  // ---------- Options menu wiring ----------
  const menuToggleBtn = document.getElementById("menuToggle");
  const menuPanel = document.getElementById("menuPanel");
  function closeMenuPanel(){
    menuPanel.classList.remove("show");
    collapseAccountMail();
  }
  menuToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("menu");
    menuPanel.classList.toggle("show");
    if(!menuPanel.classList.contains("show")) collapseAccountMail();
  });
  // Bấm vào dòng tên (MR. KHOA) -> hiện email ngay bên dưới; bấm lần nữa -> ẩn. Đóng menu cũng tự ẩn.
  function collapseAccountMail(){
    const mail = document.getElementById("menuAccountMail");
    const row = document.getElementById("menuAccount");
    if(mail) mail.hidden = true;
    if(row) row.setAttribute("aria-expanded", "false");
  }
  function toggleAccountMail(){
    const mail = document.getElementById("menuAccountMail");
    const row = document.getElementById("menuAccount");
    if(!mail || !row) return;
    mail.hidden = !mail.hidden;
    row.setAttribute("aria-expanded", mail.hidden ? "false" : "true");
  }
  (function(){
    const row = document.getElementById("menuAccount");
    if(!row) return;
    row.addEventListener("click", toggleAccountMail);
    row.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); toggleAccountMail(); }
    });
  })();

  // ---------- Day picker wiring ----------
  const dayTriggerBtn = document.getElementById("dayTrigger");
  const dayPanelEl = document.getElementById("dayPanel");
  function closeDayPanel(){
    dayPanelEl.classList.remove("show");
    dayTriggerBtn.classList.remove("open");
  }
  dayTriggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("day");
    dayPanelEl.classList.toggle("show");
    dayTriggerBtn.classList.toggle("open");
  });
  document.getElementById("dayGrid").addEventListener("click", (e) => {
    e.stopPropagation();
    const cell = e.target.closest(".day-cell");
    if(!cell || cell.classList.contains("empty")) return;
    const d = cell.dataset.day;
    fDay.value = d;
    document.getElementById("dayTriggerLabel").textContent = "Ngày " + d;
    buildDayCalendar(currentMonthKey, Number(d));
    closeDayPanel();
  });

  // ---------- Category picker wiring ----------
  const catTriggerBtn = document.getElementById("catTrigger");
  const catPanelEl = document.getElementById("catPanel");
  function closeCatPanel(){
    catPanelEl.classList.remove("show");
    catTriggerBtn.classList.remove("open");
  }
  catTriggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("cat");
    catPanelEl.classList.toggle("show");
    catTriggerBtn.classList.toggle("open");
  });
  document.getElementById("catList").addEventListener("click", (e) => {
    e.stopPropagation();
    const opt = e.target.closest(".cat-option");
    if(!opt) return;
    const id = opt.dataset.cat;
    fCategory.value = id;
    updateCategoryHint();
    buildCatList(id);
    closeCatPanel();
  });

  // ---------- Month switcher wiring ----------
  const monthTrigger = document.getElementById("monthTrigger");
  const monthPanel = document.getElementById("monthPanel");
  function closeMonthPanel(){
    monthPanel.classList.remove("show");
    monthTrigger.classList.remove("open");
    closeYmPanel();
  }
  monthTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("month");
    const opening = !monthPanel.classList.contains("show");
    monthPanel.classList.toggle("show");
    monthTrigger.classList.toggle("open");
    if(opening) populateNewMonthPickers();
  });
  document.getElementById("monthList").addEventListener("click", (e) => {
    e.stopPropagation();
    const delBtn = e.target.closest(".month-delete-btn");
    if(delBtn){
      deleteMonth(delBtn.dataset.deleteMonth);
      return;
    }
    const item = e.target.closest(".month-item");
    if(!item) return;
    switchMonth(item.dataset.month);
    closeMonthPanel();
  });
  // ---------- Xoá tháng: chọn xoá CHỈ trên máy này, hay cả trên Google Sheet ----------
  const deleteMonthOverlay = document.getElementById("deleteMonthOverlay");
  const deleteMonthNote = document.getElementById("deleteMonthNote");
  const deleteMonthLocalBtn = document.getElementById("deleteMonthLocalBtn");
  const deleteMonthSheetBtn = document.getElementById("deleteMonthSheetBtn");
  const SHEET_DELETE_LABEL = "Xoá cả trên máy và Google Sheet";
  let deleteMonthKey = null;
  let deleteArmTimer = null;
  // Bỏ tháng khỏi máy (dùng chung cho cả 2 cách xoá): chuyển sang tháng khác nếu đang xem tháng này.
  function removeMonthLocally(key){
    delete monthsData[key];
    if(key === currentMonthKey){
      const remainingKeys = Object.keys(monthsData).sort().reverse();
      if(remainingKeys.length){
        currentMonthKey = remainingKeys[0];
      }else{
        currentMonthKey = key;
        monthsData[key] = [];
      }
      entries = monthsData[currentMonthKey];
    }
    saveCache();
    renderMonthUI();
    render();
    closeMonthPanel();
  }
  function disarmSheetDelete(){
    clearTimeout(deleteArmTimer);
    deleteMonthSheetBtn.classList.remove("armed");
    document.getElementById("deleteMonthSheetTitle").textContent = SHEET_DELETE_LABEL;
  }
  function openDeleteMonth(key){
    if(!monthsData[key]) return;
    deleteMonthKey = key;
    disarmSheetDelete();
    const count = monthsData[key].length;
    const pending = syncQueue.filter((it) => it.monthKey === key).length + rejectedItems.filter((r) => r.item.monthKey === key).length;
    document.getElementById("deleteMonthTitle").textContent = "Xoá " + monthLabel(key);
    document.getElementById("deleteMonthInfo").textContent = "Tháng này có " + count + " khoản chi trên máy.";
    const localTitle = document.getElementById("deleteMonthLocalTitle");
    const localSub = document.getElementById("deleteMonthLocalSub");
    if(!SHEET_SYNC_URL){
      // Chưa bật đồng bộ: chỉ có dữ liệu trên máy, xoá là mất hẳn.
      deleteMonthSheetBtn.style.display = "none";
      deleteMonthLocalBtn.classList.add("danger");
      deleteMonthLocalBtn.disabled = false;
      localTitle.textContent = "Xoá tháng này";
      localSub.textContent = "Xoá toàn bộ " + count + " khoản chi trên máy. Không thể hoàn tác.";
      deleteMonthNote.style.display = "none";
    }else{
      deleteMonthSheetBtn.style.display = "";
      deleteMonthLocalBtn.classList.remove("danger");
      localTitle.textContent = "Chỉ xoá trên máy này";
      const onlyMonth = Object.keys(monthsData).length <= 1;
      deleteMonthLocalBtn.disabled = onlyMonth;
      localSub.textContent = onlyMonth
        ? "Đây là tháng duy nhất trên máy nên không xoá riêng được. Muốn dọn máy, dùng Menu ⋮ → Đăng xuất và xoá dữ liệu trên máy."
        : "Giữ nguyên trên Google Sheet. Tải lại được bằng ＋ Thêm tháng.";
      if(pending){
        deleteMonthNote.textContent = "Còn " + pending + " thay đổi của tháng này chưa gửi lên Sheet. Nếu chỉ xoá trên máy, chúng vẫn được gửi lên Sheet sau. Nếu xoá cả trên Sheet, chúng bị bỏ.";
        deleteMonthNote.style.display = "";
      }else{
        deleteMonthNote.style.display = "none";
      }
    }
    closeAllPopovers();
    deleteMonthOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeDeleteMonth(){
    disarmSheetDelete();
    deleteMonthOverlay.classList.remove("show");
    deleteMonthKey = null;
    resumeParticleBg();
  }
  function deleteMonth(key){ openDeleteMonth(key); }
  deleteMonthLocalBtn.addEventListener("click", () => {
    const key = deleteMonthKey;
    if(!key || deleteMonthLocalBtn.disabled) return;
    const label = monthLabel(key);
    closeDeleteMonth();
    removeMonthLocally(key);
    // Không đụng tới Sheet và KHÔNG bỏ các thay đổi đang chờ gửi (chúng vẫn được gửi lên Sheet, không mất gì).
    if(SHEET_SYNC_URL){
      flashSyncStatus("Đã xoá " + label + " trên máy (vẫn còn trên Google Sheet)", 5000);
    }
  });
  // Xoá cả trên Sheet ảnh hưởng mọi thiết bị (tab được đưa vào thùng rác ẩn 30 ngày, không xoá hẳn ngay) -> vẫn bấm 2 lần cho chắc
  // (lần 1 chỉ đổi nhãn, tự hoàn lại sau 4 giây).
  deleteMonthSheetBtn.addEventListener("click", () => {
    const key = deleteMonthKey;
    if(!key) return;
    if(!deleteMonthSheetBtn.classList.contains("armed")){
      deleteMonthSheetBtn.classList.add("armed");
      document.getElementById("deleteMonthSheetTitle").textContent = "Bấm lần nữa để xoá";
      deleteArmTimer = setTimeout(disarmSheetDelete, 4000);
      return;
    }
    const label = monthLabel(key);
    closeDeleteMonth();
    removeMonthLocally(key);
    // Lệnh xoá đi qua hàng đợi chung: bỏ các thay đổi chưa gửi của tháng này, gửi đúng thứ tự, mất mạng thì tự thử lại.
    queueDeleteMonth(key);
    if(SHEET_SYNC_URL) flashSyncStatus("Đã xoá " + label + " (trên Sheet được giữ trong thùng rác 30 ngày)", 6000);
  });
  document.getElementById("deleteMonthCancel").addEventListener("click", closeDeleteMonth);
  deleteMonthOverlay.addEventListener("click", (e) => { if(e.target === deleteMonthOverlay) closeDeleteMonth(); });
  let ymDisplayYear = null;
  const YM_YEAR_MIN = new Date().getFullYear() - 2;
  const YM_YEAR_MAX = new Date().getFullYear() + 2;
  function populateNewMonthPickers(){
    const monthSelect = document.getElementById("newMonthSelect");
    const yearSelect = document.getElementById("newYearSelect");
    const parts = String(currentMonthKey).split("-");
    const y = parseInt(parts[0], 10) || new Date().getFullYear();
    const m = parts[1] || "01";
    monthSelect.value = m;
    yearSelect.value = String(y);
    ymDisplayYear = Math.min(YM_YEAR_MAX, Math.max(YM_YEAR_MIN, y));
    setYmTrigger(m, y);
    buildYmYearHeader();
    buildYmMonthGrid();
  }
  function setYmTrigger(m, y){
    document.getElementById("ymTriggerLabel").textContent = "Tháng " + parseInt(m, 10) + " · " + y;
  }
  function buildYmYearHeader(){
    document.getElementById("ymYearLabel").textContent = ymDisplayYear;
    document.getElementById("ymYearPrev").disabled = ymDisplayYear <= YM_YEAR_MIN;
    document.getElementById("ymYearNext").disabled = ymDisplayYear >= YM_YEAR_MAX;
  }
  function buildYmMonthGrid(){
    const selectedM = document.getElementById("newMonthSelect").value;
    const selectedY = document.getElementById("newYearSelect").value;
    const isSelectedYear = String(ymDisplayYear) === selectedY;
    document.getElementById("ymMonthGrid").innerHTML = Array.from({length: 12}, (_, i) => {
      const v = String(i + 1).padStart(2, "0");
      const active = isSelectedYear && v === selectedM;
      return '<button type="button" class="ym-month-cell' + (active ? " active" : "") + '" data-val="' + v + '">Th' + (i + 1) + '</button>';
    }).join("");
  }
  // ---------- Popup "Thêm tháng": tải các tháng có trên Google Sheet về máy, hoặc tạo tháng mới ----------
  const monthLoadOverlay = document.getElementById("monthLoadOverlay");
  const monthLoadList = document.getElementById("monthLoadList");
  const monthLoadConfirm = document.getElementById("monthLoadConfirm");
  const monthLoadMsg = document.getElementById("monthLoadMsg");
  const monthLoadAllBtn = document.getElementById("monthLoadSelectAll");
  const monthTrashBox = document.getElementById("monthTrash");
  const monthTrashList = document.getElementById("monthTrashList");
  let deletedMonths = [];     // [{ monthKey, trashName, deletedAt, expiresAt, count }] tháng trong thùng rác của Sheet (mới xoá nhất trước)
  let sheetMonths = [];       // [{ monthKey, count }] các tháng đang có trên Sheet (mới nhất trước)
  let monthLoadBusy = false;  // đang tải -> khoá các nút để không bấm chồng
  function setMonthLoadMsg(text, isError){
    monthLoadMsg.textContent = text || "";
    monthLoadMsg.classList.toggle("error", !!isError);
    monthLoadMsg.style.display = text ? "" : "none";
  }
  function selectedMonthKeys(){
    return Array.from(monthLoadList.querySelectorAll('input[type="checkbox"]:not(:disabled):checked')).map((i) => i.dataset.month);
  }
  function updateMonthLoadButtons(){
    const n = selectedMonthKeys().length;
    const selectable = monthLoadList.querySelectorAll('input[type="checkbox"]:not(:disabled)').length;
    monthLoadConfirm.disabled = monthLoadBusy || n === 0;
    monthLoadConfirm.textContent = n ? "Tải (" + n + ")" : "Tải";
    monthLoadAllBtn.style.display = selectable ? "" : "none";
    monthLoadAllBtn.textContent = (n && n === selectable) ? "Bỏ chọn tất cả" : "Chọn tất cả tháng chưa có";
  }
  function renderMonthLoadList(){
    if(!sheetMonths.length){
      monthLoadList.innerHTML = '<p class="devices-empty">Trên Google Sheet chưa có tháng nào.</p>';
      updateMonthLoadButtons();
      return;
    }
    monthLoadList.innerHTML = sheetMonths.map((m) => {
      const local = Object.prototype.hasOwnProperty.call(monthsData, m.monthKey);
      return '<label class="month-load-row' + (local ? " is-local" : "") + '">' +
        '<input type="checkbox" data-month="' + escapeHtml(m.monthKey) + '"' + (local ? " checked disabled" : "") + " />" +
        '<span class="month-load-name">' + escapeHtml(monthLabel(m.monthKey)) + "</span>" +
        '<span class="month-load-meta">' + (local ? "Đã có trên máy" : (m.count + " khoản")) + "</span>" +
      "</label>";
    }).join("");
    updateMonthLoadButtons();
  }
  // ----- Tháng đã xoá trên Sheet (thùng rác 30 ngày): liệt kê + khôi phục -----
  function renderMonthTrash(){
    if(!deletedMonths.length){ monthTrashBox.hidden = true; monthTrashList.innerHTML = ""; return; }
    monthTrashBox.hidden = false;
    monthTrashList.innerHTML = deletedMonths.map((d) => {
      const daysLeft = Math.max(0, Math.ceil((Number(d.expiresAt) - Date.now()) / 864e5));
      return '<div class="month-load-row month-trash-row">' +
        '<span class="month-load-name">' + escapeHtml(monthLabel(d.monthKey)) +
          '<span class="month-trash-sub">Xoá ' + escapeHtml(relTime(d.deletedAt)) + " · " + (Number(d.count) || 0) + " khoản · còn " + daysLeft + " ngày</span></span>" +
        '<button type="button" class="mini-btn" data-restore="' + escapeHtml(d.trashName) + '" aria-label="Khôi phục ' + escapeHtml(monthLabel(d.monthKey)) + '"' + (monthLoadBusy ? " disabled" : "") + ">Khôi phục</button>" +
      "</div>";
    }).join("");
  }
  async function restoreDeletedMonthFromTrash(trashName){
    const d = deletedMonths.find((x) => x.trashName === trashName);
    if(!d || monthLoadBusy) return;
    const label = monthLabel(d.monthKey);
    monthLoadBusy = true;
    renderMonthTrash();
    updateMonthLoadButtons();
    setMonthLoadMsg("Đang khôi phục " + label + "…");
    try{
      // Qua khoá đồng bộ: gửi nốt thay đổi còn chờ trước, để thứ tự đúng.
      await withSyncLock(async () => {
        await drainQueue();
        return sheetRequest({ action: "restoreMonth", trashName: d.trashName });
      });
    }catch(raw){
      const err = toSyncError(raw);
      monthLoadBusy = false;
      if(err.kind === "auth"){ handleSyncAuthError({ authError: true, error: err.message }); return; }
      const why = /Không rõ action/i.test(err.message) ? "Máy chủ chưa cập nhật Code.gs (cần bản v16 trở lên)." : err.message;
      await loadSheetMonths(true); // làm mới 2 danh sách (tháng có thể đã được khôi phục / tạo lại ở thiết bị khác)
      setMonthLoadMsg("Không khôi phục được " + label + ": " + why, true);
      return;
    }
    // Đã khôi phục trên Sheet -> tải luôn về máy cho thấy ngay.
    setMonthLoadMsg("Đã khôi phục " + label + ". Đang tải về máy…");
    const r = await pullMonth(d.monthKey);
    monthLoadBusy = false;
    renderMonthUI();
    if(r && r.ok){
      closeMonthLoad();
      switchMonth(d.monthKey, { skipPull: true }); // vừa tải xong nên không cần tải lại
      flashSyncStatus("Đã khôi phục " + label + " từ thùng rác", 5000);
    }else{
      await loadSheetMonths(true);
      setMonthLoadMsg("Đã khôi phục " + label + " trên Google Sheet nhưng chưa tải về máy được. Chọn tháng đó ở danh sách trên rồi bấm Tải.", true);
    }
  }
  monthTrashList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-restore]");
    if(b && !b.disabled) restoreDeletedMonthFromTrash(b.getAttribute("data-restore"));
  });
  function monthLoadError(text){
    monthLoadList.innerHTML = '<p class="devices-empty">' + escapeHtml(text) + '</p><button type="button" class="mini-btn" id="monthLoadRetry">Thử lại</button>';
    updateMonthLoadButtons();
  }
  async function loadSheetMonths(keepMsg){
    if(!keepMsg) setMonthLoadMsg("");
    deletedMonths = [];
    renderMonthTrash();
    if(!SHEET_SYNC_URL){
      monthLoadList.innerHTML = '<p class="devices-empty">Chưa bật đồng bộ Google Sheet nên chưa có danh sách tháng trên Sheet. Bạn vẫn tạo được tháng mới ở bên dưới.</p>';
      updateMonthLoadButtons();
      return;
    }
    monthLoadList.innerHTML = '<p class="devices-empty">Đang lấy danh sách tháng từ Google Sheet…</p>';
    updateMonthLoadButtons();
    try{
      // Qua khoá đồng bộ: gửi nốt thay đổi còn chờ (vd. lệnh xoá tháng) trước, để danh sách phản ánh đúng Sheet.
      const res = await withSyncLock(async () => {
        await drainQueue();
        const months = await sheetRequest({ action: "listMonths" });
        let deleted = [];
        try{
          const t = await sheetRequest({ action: "listDeletedMonths" });
          if(Array.isArray(t.deleted)) deleted = t.deleted;
        }catch(e2){
          // Máy chủ cũ (chưa có thùng rác) hoặc lỗi lẻ: chỉ ẩn mục "đã xoá", danh sách tháng chính vẫn hiện bình thường.
          if(toSyncError(e2).kind === "auth") throw e2;
        }
        return { months, deleted };
      });
      sheetMonths = (res.months.months || []).filter((m) => m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.monthKey));
      deletedMonths = res.deleted.filter((d) => d && /^\d{4}-(0[1-9]|1[0-2])$/.test(d.monthKey) && d.trashName);
      renderMonthLoadList();
      renderMonthTrash();
    }catch(raw){
      const err = toSyncError(raw);
      if(err.kind === "auth"){ handleSyncAuthError({ authError: true, error: err.message }); return; }
      monthLoadError("Không lấy được danh sách tháng từ Sheet: " + err.message);
    }
  }
  function openMonthLoad(){
    closeMonthPanel();
    populateNewMonthPickers();
    closeYmPanel();
    closeAllPopovers();
    monthLoadOverlay.classList.add("show");
    pauseParticleBg();
    loadSheetMonths();
  }
  function closeMonthLoad(){
    if(monthLoadBusy) return;
    closeYmPanel();
    monthLoadOverlay.classList.remove("show");
    resumeParticleBg();
  }
  async function downloadSelectedMonths(){
    const keys = selectedMonthKeys();
    if(!keys.length || monthLoadBusy) return;
    monthLoadBusy = true;
    updateMonthLoadButtons();
    const done = [], failed = [];
    for(let i = 0; i < keys.length; i++){
      setMonthLoadMsg("Đang tải " + (i + 1) + "/" + keys.length + ": " + monthLabel(keys[i]) + "…");
      const r = await pullMonth(keys[i]);
      if(r && r.ok) done.push(keys[i]);
      else{
        failed.push(keys[i]);
        if(r && r.kind === "auth") break; // hết phiên: cổng đăng nhập đã hiện
      }
    }
    monthLoadBusy = false;
    renderMonthUI(); // danh sách tháng trên máy cập nhật ngay
    if(failed.length){
      const why = (lastSyncError && lastSyncError.message) ? " (" + lastSyncError.message + ")" : "";
      setMonthLoadMsg((done.length ? "Đã tải " + done.length + " tháng. " : "") + "Chưa tải được: " + failed.map(monthLabel).join(", ") + why + ". Bấm Tải để thử lại.", true);
      renderMonthLoadList(); // các tháng đã tải xong chuyển sang "Đã có trên máy"
      // Giữ nguyên dấu tích ở các tháng chưa tải được, để bấm Tải là thử lại đúng các tháng đó.
      failed.forEach((k) => {
        const cb = monthLoadList.querySelector('input[data-month="' + String(k).replace(/["\\]/g, "\\$&") + '"]');
        if(cb && !cb.disabled) cb.checked = true;
      });
      updateMonthLoadButtons();
      return;
    }
    closeMonthLoad();
    if(done.length === 1){
      switchMonth(done[0], { skipPull: true }); // vừa tải xong nên không cần tải lại lần nữa
    }else{
      flashSyncStatus("Đã tải " + done.length + " tháng từ Google Sheet: " + done.map(monthLabel).join(", "), 5000);
    }
  }
  document.getElementById("addMonthBtn").addEventListener("click", openMonthLoad);
  document.getElementById("monthLoadClose").addEventListener("click", closeMonthLoad);
  document.getElementById("monthLoadCancel").addEventListener("click", closeMonthLoad);
  monthLoadOverlay.addEventListener("click", (e) => { if(e.target === monthLoadOverlay) closeMonthLoad(); });
  monthLoadList.addEventListener("change", updateMonthLoadButtons);
  monthLoadList.addEventListener("click", (e) => { if(e.target.closest("#monthLoadRetry")) loadSheetMonths(); });
  monthLoadAllBtn.addEventListener("click", () => {
    const boxes = Array.from(monthLoadList.querySelectorAll('input[type="checkbox"]:not(:disabled)'));
    const all = boxes.length > 0 && boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = !all; });
    updateMonthLoadButtons();
  });
  monthLoadConfirm.addEventListener("click", downloadSelectedMonths);
  // Tạo tháng mới (chưa có trên Sheet): chọn tháng/năm ở bộ chọn trong popup rồi bấm Tạo — như nút "Thêm" trước đây.
  document.getElementById("createMonthBtn").addEventListener("click", () => {
    const m = document.getElementById("newMonthSelect").value;
    const y = document.getElementById("newYearSelect").value;
    if(!m || !y || monthLoadBusy) return;
    closeMonthLoad();
    switchMonth(y + "-" + m);
  });
  const ymTriggerBtn = document.getElementById("ymTrigger");
  const ymPanelEl = document.getElementById("ymPanel");
  function closeYmPanel(){
    ymPanelEl.classList.remove("show");
    ymTriggerBtn.classList.remove("open");
  }
  ymTriggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("ym");
    ymDisplayYear = Math.min(YM_YEAR_MAX, Math.max(YM_YEAR_MIN, parseInt(document.getElementById("newYearSelect").value, 10) || YM_YEAR_MIN));
    buildYmYearHeader();
    buildYmMonthGrid();
    ymPanelEl.classList.toggle("show");
    ymTriggerBtn.classList.toggle("open");
  });
  document.getElementById("ymYearPrev").addEventListener("click", (e) => {
    e.stopPropagation();
    if(ymDisplayYear <= YM_YEAR_MIN) return;
    ymDisplayYear -= 1;
    buildYmYearHeader();
    buildYmMonthGrid();
  });
  document.getElementById("ymYearNext").addEventListener("click", (e) => {
    e.stopPropagation();
    if(ymDisplayYear >= YM_YEAR_MAX) return;
    ymDisplayYear += 1;
    buildYmYearHeader();
    buildYmMonthGrid();
  });
  document.getElementById("ymMonthGrid").addEventListener("click", (e) => {
    e.stopPropagation();
    const cell = e.target.closest(".ym-month-cell");
    if(!cell) return;
    const v = cell.dataset.val;
    document.getElementById("newMonthSelect").value = v;
    document.getElementById("newYearSelect").value = String(ymDisplayYear);
    setYmTrigger(v, ymDisplayYear);
    buildYmMonthGrid();
    closeYmPanel();
  });
  document.addEventListener("click", (e) => {
    if(!e.target.closest(".month-switcher")) closeMonthPanel();
    if(!e.target.closest(".menu-switcher")) closeMenuPanel();
    if(!e.target.closest("#dayPicker")) closeDayPanel();
    if(!e.target.closest("#ledgerDayPicker")) closeLedgerDayPanel();
    if(!e.target.closest("#catPicker")) closeCatPanel();
    if(!e.target.closest("#ledgerCatPicker")) closeLedgerCatPanel();
    if(!e.target.closest("#ymPicker")) closeYmPanel();
  });
  // Chỉ cho mở MỘT bảng chọn/menu tại một thời điểm: mỗi nút mở bảng đều chặn sự kiện bấm nên bộ đóng ở trên
  // không chạy được; vì vậy mỗi nút gọi hàm này (truyền tên bảng của chính nó để giữ lại).
  function closePopoversNow(except){
    if(except !== "month" && except !== "ym") closeMonthPanel();
    if(except !== "menu") closeMenuPanel();
    if(except !== "day") closeDayPanel();
    if(except !== "cat") closeCatPanel();
    if(except !== "ledgerDay") closeLedgerDayPanel();
    if(except !== "ledgerCat") closeLedgerCatPanel();
    if(except !== "ym") closeYmPanel();
    if(except !== "ncScope" && typeof closeNcScopePanel === "function") closeNcScopePanel();
  }
  closeAllPopoversImpl = closePopoversNow;

  document.getElementById("balanceSpotlight").addEventListener("click", () => {
    const btn = document.getElementById("balanceSpotlight");
    const isOpen = document.getElementById("infoBox").classList.toggle("show");
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const hintTxt = document.getElementById("balanceHintText");
    if(hintTxt) hintTxt.textContent = isOpen ? "Thu gọn chi tiết" : "Xem chi tiết cách tính";
  });
  document.getElementById("statsToggle").addEventListener("click", () => {
    document.getElementById("statsBody").classList.toggle("show");
    document.getElementById("statsToggle").classList.toggle("open");
  });

  // ---------- Bộ lọc Sổ ghi chép ----------
  const ledgerCatFilterEl = document.getElementById("ledgerCatFilter");
  ledgerCatFilterEl.innerHTML = '<option value="">Tất cả danh mục</option>' +
    CATS.map(c => '<option value="' + c.id + '">' + escapeHtml(c.label.replace(/\s*·\s*chia\s*\d+/i, "")) + '</option>').join("");
  function setLedgerCatTrigger(id){
    const label = id ? catById[id].label.replace(/\s*·\s*chia\s*\d+/i, "") : "Tất cả danh mục";
    const color = id ? catById[id].color : "var(--text-muted)";
    document.getElementById("ledgerCatTriggerLabel").textContent = label;
    document.getElementById("ledgerCatTriggerDot").style.background = color;
  }
  function buildLedgerCatList(selectedId){
    const allOpt = '<button type="button" class="cat-option' + (!selectedId ? " active" : "") + '" data-cat="">' +
      '<span class="cat-dot" style="background:var(--text-muted)"></span><span>Tất cả danh mục</span></button>';
    document.getElementById("ledgerCatList").innerHTML = allOpt + CATS.map(c =>
      '<button type="button" class="cat-option' + (c.id === selectedId ? " active" : "") + '" data-cat="' + c.id + '">' +
        '<span class="cat-dot" style="background:' + c.color + '"></span>' +
        '<span>' + escapeHtml(c.label.replace(/\s*·\s*chia\s*\d+/i, "")) + '</span>' +
      '</button>'
    ).join("");
  }
  buildLedgerCatList("");
  let ledgerSearchTimer = null;
  const ledgerSearchEl = document.getElementById("ledgerSearch");
  const ledgerSearchClearEl = document.getElementById("ledgerSearchClear");
  ledgerSearchEl.addEventListener("input", (e) => {
    clearTimeout(ledgerSearchTimer);
    const val = e.target.value;
    ledgerSearchClearEl.classList.toggle("show", val.length > 0); // hiện/ẩn ✕ ngay khi gõ, không chờ lọc xong
    ledgerSearchTimer = setTimeout(() => { ledgerFilterText = val; renderLedger(); }, 150);
  });
  // ✕ trong ô: xoá chữ tìm kiếm (không đụng bộ lọc danh mục/ngày). Giữ nguyên trạng thái gõ: đang gõ thì bàn phím không bị đóng.
  let searchWasFocused = false;
  ledgerSearchClearEl.addEventListener("pointerdown", (e) => { searchWasFocused = document.activeElement === ledgerSearchEl; e.preventDefault(); });
  ledgerSearchClearEl.addEventListener("mousedown", (e) => e.preventDefault());
  function clearLedgerSearchText(refocus){
    clearTimeout(ledgerSearchTimer);
    ledgerSearchEl.value = "";
    ledgerFilterText = "";
    ledgerSearchClearEl.classList.remove("show");
    renderLedger();
    if(refocus) ledgerSearchEl.focus();
  }
  ledgerSearchClearEl.addEventListener("click", () => { clearLedgerSearchText(searchWasFocused || document.activeElement === ledgerSearchEl); searchWasFocused = false; });
  ledgerSearchEl.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && ledgerSearchEl.value){ e.preventDefault(); clearLedgerSearchText(true); }
  });
  function updateLedgerSortTrigger(){
    const label = ledgerSortDir === "asc" ? "Sắp xếp: Cũ nhất" : "Sắp xếp: Mới nhất";
    const btn = document.getElementById("ledgerSortToggle");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    document.getElementById("ledgerSortIcon").style.transform = ledgerSortDir === "asc" ? "rotate(0deg)" : "rotate(180deg)";
  }
  document.getElementById("ledgerSortToggle").addEventListener("click", () => {
    ledgerSortDir = ledgerSortDir === "asc" ? "desc" : "asc";
    updateLedgerSortTrigger();
    renderLedger();
  });
  const ledgerCatTriggerBtn = document.getElementById("ledgerCatTrigger");
  const ledgerCatPanelEl = document.getElementById("ledgerCatPanel");
  function closeLedgerCatPanel(){
    ledgerCatPanelEl.classList.remove("show");
    ledgerCatTriggerBtn.classList.remove("open");
  }
  ledgerCatTriggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("ledgerCat");
    ledgerCatPanelEl.classList.toggle("show");
    ledgerCatTriggerBtn.classList.toggle("open");
  });
  document.getElementById("ledgerCatList").addEventListener("click", (e) => {
    e.stopPropagation();
    const opt = e.target.closest(".cat-option");
    if(!opt) return;
    const id = opt.dataset.cat;
    ledgerFilterCat = id;
    ledgerCatFilterEl.value = id;
    setLedgerCatTrigger(id);
    buildLedgerCatList(id);
    closeLedgerCatPanel();
    renderLedger();
  });
  const ledgerDayTriggerBtn = document.getElementById("ledgerDayTrigger");
  const ledgerDayPanelEl = document.getElementById("ledgerDayPanel");
  function closeLedgerDayPanel(){
    ledgerDayPanelEl.classList.remove("show");
    ledgerDayTriggerBtn.classList.remove("open");
  }
  ledgerDayTriggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllPopovers("ledgerDay");
    ledgerDayPanelEl.classList.toggle("show");
    ledgerDayTriggerBtn.classList.toggle("open");
  });
  document.getElementById("ledgerDayGrid").addEventListener("click", (e) => {
    e.stopPropagation();
    const cell = e.target.closest(".day-cell");
    if(!cell || cell.classList.contains("empty")) return;
    const d = cell.dataset.day;
    ledgerFilterDay = d;
    document.getElementById("ledgerDayTriggerLabel").textContent = "Ngày " + d;
    buildDayCalendar(currentMonthKey, Number(d), "ledgerDayGrid", "ledgerDayPanelTitle");
    closeLedgerDayPanel();
    renderLedger();
  });
  document.getElementById("ledgerDayClear").addEventListener("click", () => {
    ledgerFilterDay = "";
    document.getElementById("ledgerDayTriggerLabel").textContent = "Tất cả ngày";
    buildDayCalendar(currentMonthKey, null, "ledgerDayGrid", "ledgerDayPanelTitle");
    closeLedgerDayPanel();
    renderLedger();
  });
  // Xoá HẾT bộ lọc (chữ tìm kiếm + danh mục + ngày). Nút nằm trong thông báo "Không có khoản chi nào khớp".
  function clearAllLedgerFilters(){
    clearTimeout(ledgerSearchTimer);
    ledgerFilterText = "";
    ledgerFilterCat = "";
    ledgerFilterDay = "";
    ledgerSearchEl.value = "";
    ledgerCatFilterEl.value = "";
    setLedgerCatTrigger("");
    buildLedgerCatList("");
    document.getElementById("ledgerDayTriggerLabel").textContent = "Tất cả ngày";
    buildDayCalendar(currentMonthKey, null, "ledgerDayGrid", "ledgerDayPanelTitle");
    renderLedger();
  }
  document.getElementById("ledgerBody").addEventListener("click", (e) => {
    if(e.target.closest && e.target.closest('[data-act="reset-filters"]')) clearAllLedgerFilters();
  });
  document.getElementById("signOutBtn").addEventListener("click", () => {
    closeMenuPanel();
    openLogoutModal();
  });
  document.getElementById("devicesBtn").addEventListener("click", () => {
    closeMenuPanel();
    openDevicesModal();
  });
  }catch(err){ showErrorBanner("khởi tạo: " + err.message); }

  // ---------- Đăng nhập Google + phiên "ghi nhớ thiết bị" ----------
  // Luồng: đăng nhập Google ĐÚNG 1 LẦN -> server (Code.gs) đổi lấy 1 "phiên" riêng (token ngẫu nhiên, 15 ngày,
  // tự gia hạn khi dùng). Các lần mở app sau chỉ cần phiên này, KHÔNG đụng tới Google nữa -> mở app nhanh,
  // dùng được cả khi offline. Mỗi phiên = 1 thiết bị, có thể xem/thu hồi trong menu "Thiết bị đăng nhập".
  let sessionToken = null;   // gửi kèm mọi request lên Code.gs
  let sessionRecord = null;  // { token, email, exp, deviceId, remember }
  let googleUserEmail = null;
  const SESSION_KEY = "so_chi_tieu:session:v2";
  const SESSION_REMEMBER_DAYS = Number(APP_CONFIG.REMEMBER_DAYS) > 0 ? Number(APP_CONFIG.REMEMBER_DAYS) : 15; // phải KHỚP SESSION_TTL_DAYS trong Code.gs
  const REMEMBER_PREF_KEY = "so_chi_tieu:remember_pref";
  const OLD_AUTH_KEY = "so_chi_tieu:auth:v1"; // khoá phiên kiểu cũ (idToken 1 giờ) — dọn đi

  const pad2 = (n) => String(n).padStart(2, "0");
  function isStandaloneApp(){
    try{
      return (window.matchMedia && (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches))
        || navigator.standalone === true;
    }catch(err){ return false; }
  }
  // Mở từ icon màn hình chính -> mặc định GHI NHỚ; mở trên trình duyệt thường -> mặc định KHÔNG (có thể là máy chung).
  // Nếu người dùng đã tự chọn thì nhớ lựa chọn đó.
  function defaultRemember(){
    try{
      const pref = localStorage.getItem(REMEMBER_PREF_KEY);
      if(pref === "1") return true;
      if(pref === "0") return false;
    }catch(err){}
    return isStandaloneApp();
  }
  function deviceLabel(){
    const ua = navigator.userAgent || "";
    let os = "Thiết bị";
    if(/Android/i.test(ua)) os = "Android";
    else if(/iPhone/i.test(ua)) os = "iPhone";
    else if(/iPad/i.test(ua)) os = "iPad";
    else if(/Windows/i.test(ua)) os = "Windows";
    else if(/Mac OS X|Macintosh/i.test(ua)) os = "Mac";
    else if(/CrOS/i.test(ua)) os = "Chromebook";
    else if(/Linux/i.test(ua)) os = "Linux";
    let br = "";
    if(/Edg\//.test(ua)) br = "Edge";
    else if(/OPR\/|Opera/.test(ua)) br = "Opera";
    else if(/SamsungBrowser/i.test(ua)) br = "Samsung Internet";
    else if(/Firefox|FxiOS/i.test(ua)) br = "Firefox";
    else if(/Chrome|CriOS/i.test(ua)) br = "Chrome";
    else if(/Safari/i.test(ua)) br = "Safari";
    return os + (br ? " · " + br : "") + (isStandaloneApp() ? " (app)" : "");
  }

  // ----- Lưu/đọc phiên: "ghi nhớ" -> localStorage (sống qua các lần đóng app); không ghi nhớ -> sessionStorage -----
  function storeSession(rec){
    try{
      const json = JSON.stringify(rec);
      if(rec.remember){ localStorage.setItem(SESSION_KEY, json); sessionStorage.removeItem(SESSION_KEY); }
      else{ sessionStorage.setItem(SESSION_KEY, json); localStorage.removeItem(SESSION_KEY); }
    }catch(err){}
  }
  function removeStoredSession(){
    try{ localStorage.removeItem(SESSION_KEY); }catch(err){}
    try{ sessionStorage.removeItem(SESSION_KEY); }catch(err){}
  }
  function readStoredSession(){
    const tryRead = (st) => {
      try{
        const raw = st.getItem(SESSION_KEY);
        if(!raw) return null;
        const d = JSON.parse(raw);
        if(!d || typeof d.token !== "string" || !d.email || !d.exp || d.exp <= Date.now()) return null;
        return d;
      }catch(err){ return null; }
    };
    return tryRead(localStorage) || tryRead(sessionStorage);
  }
  function adoptSession(rec){
    sessionRecord = rec;
    sessionToken = rec.token;
    googleUserEmail = rec.email;
    updateAccountUi();
  }
  function clearSessionLocal(){
    sessionRecord = null;
    sessionToken = null;
    googleUserEmail = null;
    removeStoredSession();
    updateAccountUi();
  }
  // Server gia hạn phiên khi dùng -> cập nhật hạn mới vào bản lưu trên máy.
  function noteSessionExp(data){
    if(!data || !sessionRecord) return;
    const exp = Number(data.sessionExp);
    if(exp && exp !== sessionRecord.exp){
      sessionRecord.exp = exp;
      storeSession(sessionRecord);
    }
  }

  // ----- Giao diện cổng đăng nhập -----
  function authGateShow(msg, isError){
    document.getElementById("authGate").classList.add("show");
    const errEl = document.getElementById("authGateError");
    if(isError && msg){
      errEl.textContent = msg;
      errEl.style.display = "";
    }else{
      errEl.style.display = "none";
    }
  }
  function authGateHide(){
    document.getElementById("authGate").classList.remove("show");
  }
  function setAuthStatus(text){
    const el = document.getElementById("authGateStatus");
    if(text){ el.textContent = text; el.style.display = ""; }
    else{ el.style.display = "none"; }
  }
  function setAuthRetry(visible){
    document.getElementById("authRetryBtn").style.display = visible ? "" : "none";
  }
  function parseJwtPayload(token){
    try{
      const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
      return JSON.parse(json);
    }catch(err){ return null; }
  }
  // Tên hiện ở đầu menu ⋮ (thay cho địa chỉ email). Mặc định "MR. KHOA".
  // Muốn mỗi email một tên riêng, thêm vào config.js: DISPLAY_NAMES: { "email@gmail.com": "MRS. LAN" }
  const DEFAULT_DISPLAY_NAME = "MR. KHOA";
  function displayNameFor(email){
    const map = APP_CONFIG.DISPLAY_NAMES;
    const key = String(email || "").trim().toLowerCase();
    if(map && typeof map === "object" && key){
      for(const k in map){
        if(Object.prototype.hasOwnProperty.call(map, k) && String(k).trim().toLowerCase() === key){
          const v = String(map[k] || "").trim();
          if(v) return v;
        }
      }
    }
    return DEFAULT_DISPLAY_NAME;
  }
  function updateAccountUi(){
    const emailEl = document.getElementById("menuAccountEmail");
    const avatarEl = document.getElementById("menuAccountAvatar");
    const mailEl = document.getElementById("menuAccountMail");
    if(mailEl) mailEl.textContent = googleUserEmail || (GOOGLE_CLIENT_ID ? "Chưa đăng nhập" : "Chưa đăng nhập Google (chạy cục bộ)");
    if(googleUserEmail || !GOOGLE_CLIENT_ID){
      // Đã đăng nhập, hoặc app chạy cục bộ không cần đăng nhập -> hiện tên.
      const name = displayNameFor(googleUserEmail);
      emailEl.textContent = name;
      emailEl.title = googleUserEmail || "";
      avatarEl.textContent = name.replace(/^(mr|mrs|ms)\.?\s+/i, "").slice(0, 1) || name.slice(0, 1);
    }else{
      emailEl.textContent = "Chưa đăng nhập";
      emailEl.title = "";
      avatarEl.textContent = "?";
    }
  }
  function initRememberCheckbox(){
    const cb = document.getElementById("authRemember");
    const label = document.getElementById("authRememberLabel");
    if(label) label.textContent = "Ghi nhớ trên thiết bị này (" + SESSION_REMEMBER_DAYS + " ngày)";
    cb.checked = defaultRemember();
    cb.addEventListener("change", () => {
      try{ localStorage.setItem(REMEMBER_PREF_KEY, cb.checked ? "1" : "0"); }catch(err){}
    });
  }

  // ----- Nạp script đăng nhập Google: có giới hạn thời gian + nút Thử lại (không còn treo vô hạn) -----
  const GSI_URL = "https://accounts.google.com/gsi/client";
  const GSI_TIMEOUT_MS = 12000;
  let gsiPromise = null;
  let gsiInitialized = false;
  const gsiReady = () => !!(window.google && google.accounts && google.accounts.id);
  function loadGsi(){
    if(gsiReady()) return Promise.resolve();
    if(gsiPromise) return gsiPromise;
    gsiPromise = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = GSI_URL;
      el.async = true;
      el.defer = true;
      let settled = false;
      const fail = (why) => {
        if(settled) return;
        settled = true;
        clearTimeout(timer);
        el.remove();
        gsiPromise = null; // cho phép thử lại từ đầu
        reject(new Error(why));
      };
      const timer = setTimeout(() => fail("timeout"), GSI_TIMEOUT_MS);
      el.onload = () => {
        if(settled) return;
        if(!gsiReady()) return fail("init");
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      el.onerror = () => fail("load");
      document.head.appendChild(el);
    });
    return gsiPromise;
  }
  function initGoogleSignInButton(){
    if(!GOOGLE_CLIENT_ID || !gsiReady()) return;
    const slot = document.getElementById("googleSignInBtn");
    slot.innerHTML = "";
    google.accounts.id.renderButton(slot, {
      theme: "filled_black", size: "large", shape: "pill", text: "signin_with", width: 280
    });
  }
  async function startSignInFlow(){
    setAuthRetry(false);
    setAuthStatus("Đang tải đăng nhập Google…");
    try{
      await loadGsi();
    }catch(err){
      setAuthStatus("");
      const offline = (navigator.onLine === false);
      authGateShow(offline
        ? "Không có kết nối mạng. Hãy bật mạng rồi bấm Thử lại."
        : "Không tải được dịch vụ đăng nhập của Google (mạng chậm, bị chặn hoặc có trình chặn quảng cáo). Bấm Thử lại.", true);
      setAuthRetry(true);
      return;
    }
    if(sessionRecord) { setAuthStatus(""); return; } // trong lúc chờ đã đăng nhập xong (vd. từ tab khác)
    setAuthStatus("");
    if(!gsiInitialized){
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        auto_select: true
      });
      gsiInitialized = true;
    }
    initGoogleSignInButton();
    try{ google.accounts.id.prompt(); }catch(err){}
  }
  document.getElementById("authRetryBtn").addEventListener("click", () => {
    authGateShow("", false);
    startSignInFlow();
  });
  // Có mạng lại trong lúc đang kẹt ở màn hình đăng nhập vì lỗi mạng -> tự thử lại.
  window.addEventListener("online", () => {
    const gate = document.getElementById("authGate");
    const retryBtn = document.getElementById("authRetryBtn");
    if(gate.classList.contains("show") && retryBtn.style.display !== "none" && !sessionRecord){
      authGateShow("", false);
      startSignInFlow();
    }
  });

  // ----- Đăng nhập: đổi idToken của Google lấy phiên riêng -----
  let loginInFlight = false;
  async function postLogin(idToken, remember){
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    let res = null, data = null;
    try{
      res = await fetch(SHEET_SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: SHEET_SYNC_TOKEN, action: "login", idToken, deviceName: deviceLabel(), remember }),
        signal: ctl.signal
      });
      data = await res.json().catch(() => null);
    }catch(err){
      const e = new Error("network");
      e.userMessage = "Không kết nối được máy chủ để đăng nhập. Kiểm tra mạng rồi thử lại.";
      throw e;
    }finally{
      clearTimeout(timer);
    }
    if(!data || data.ok !== true || !data.sessionToken){
      const raw = (data && data.error) || ("HTTP " + (res && res.status));
      const e = new Error(raw);
      e.userMessage = /Không rõ action/.test(raw)
        ? "Máy chủ chưa cập nhật Code.gs bản mới. Hãy dán Code.gs mới vào Apps Script rồi Deploy lại (New version)."
        : (data && data.error) ? data.error : "Máy chủ trả về lỗi, hãy thử lại sau.";
      throw e;
    }
    return data;
  }
  function startSession(rec){
    adoptSession(rec);
    storeSession(rec);
    authGateHide();
    setAuthStatus("");
    setAuthRetry(false);
    loadData();
  }
  async function handleGoogleCredential(response){
    if(loginInFlight) return;
    const idToken = response && response.credential;
    const payload = idToken ? parseJwtPayload(idToken) : null;
    if(!payload || !payload.email){
      authGateShow("Không đọc được thông tin tài khoản Google. Thử lại.", true);
      return;
    }
    const remember = !!document.getElementById("authRemember").checked;
    try{ localStorage.setItem(REMEMBER_PREF_KEY, remember ? "1" : "0"); }catch(err){}
    loginInFlight = true;
    authGateShow("", false);
    setAuthStatus("Đang đăng nhập…");
    try{
      if(!SHEET_SYNC_URL){
        // Chưa bật đồng bộ Google Sheet: chỉ khoá giao diện trên máy này (không có phiên phía server).
        startSession({ token: "", email: payload.email, exp: Date.now() + (remember ? SESSION_REMEMBER_DAYS : 1) * 864e5, deviceId: "", remember });
        return;
      }
      const data = await postLogin(idToken, remember);
      startSession({
        token: data.sessionToken, email: data.email || payload.email,
        exp: Number(data.sessionExp) || (Date.now() + (remember ? SESSION_REMEMBER_DAYS : 1) * 864e5),
        deviceId: data.deviceId || "", remember
      });
    }catch(err){
      authGateShow((err && err.userMessage) || ("Đăng nhập thất bại: " + (err && err.message)), true);
      if(gsiReady()){ try{ google.accounts.id.disableAutoSelect(); }catch(e){} }
    }finally{
      loginInFlight = false;
      if(!sessionRecord) setAuthStatus("");
    }
  }

  // ----- Gọi Code.gs kèm phiên (dùng cho đăng xuất / quản lý thiết bị) -----
  async function sheetCall(body, timeoutMs, opts){
    opts = opts || {};
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 20000);
    try{
      const res = await fetch(SHEET_SYNC_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ token: SHEET_SYNC_TOKEN, sessionToken: sessionToken }, body)),
        signal: ctl.signal
      });
      const data = await res.json().catch(() => null);
      if(data && data.authError){
        if(!opts.silentAuth) handleSyncAuthError(data);
        throw new Error(data.error || "Hết phiên đăng nhập");
      }
      noteSessionExp(data);
      if(!res.ok || !data || data.ok !== true) throw new Error((data && data.error) || ("HTTP " + res.status));
      return data;
    }finally{
      clearTimeout(timer);
    }
  }

  function closeAuthModals(){
    ["logoutOverlay", "devicesOverlay"].forEach((id) => document.getElementById(id).classList.remove("show"));
  }
  // Thoát cục bộ (không gọi server): dùng khi server báo phiên hết hạn/bị thu hồi, hoặc sau khi đã báo server xong.
  function signOutLocal(msg){
    clearSessionLocal();
    closeAuthModals();
    if(gsiReady()){ try{ google.accounts.id.disableAutoSelect(); }catch(err){} }
    authGateShow(msg || "", !!msg);
    startSignInFlow();
  }
  function handleSyncAuthError(data){
    if(data && data.authError){
      signOutLocal((data.error && /thu hồi|hết hạn|không còn quyền/i.test(data.error))
        ? data.error
        : "Phiên đăng nhập đã hết hạn hoặc không có quyền truy cập — vui lòng đăng nhập lại.");
      return true;
    }
    return false;
  }

  // ----- Đăng xuất: hỏi có xoá dữ liệu trên máy không -----
  const logoutOverlay = document.getElementById("logoutOverlay");
  const logoutNote = document.getElementById("logoutPendingNote");
  const logoutKeepBtn = document.getElementById("logoutKeepBtn");
  const logoutWipeBtn = document.getElementById("logoutWipeBtn");
  const WIPE_LABEL = "Đăng xuất và xoá dữ liệu trên máy";
  let logoutWipeArmed = false;
  function openLogoutModal(){
    logoutWipeArmed = false;
    logoutWipeBtn.textContent = WIPE_LABEL;
    logoutKeepBtn.disabled = false;
    logoutWipeBtn.disabled = false;
    const n = pendingChangeCount();
    if(n){
      logoutNote.textContent = "Đang còn " + n + " thay đổi chưa gửi lên Google Sheet. Nếu chọn giữ dữ liệu, chúng vẫn nằm trên máy và sẽ được gửi sau khi bạn đăng nhập lại.";
      logoutNote.style.display = "";
    }else{
      logoutNote.style.display = "none";
    }
    closeAllPopovers();
    logoutOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeLogoutModal(){
    logoutOverlay.classList.remove("show");
    resumeParticleBg();
  }
  async function doLogout(wipe){
    logoutKeepBtn.disabled = true;
    logoutWipeBtn.disabled = true;
    let done = false;
    try{
      // Muốn xoá dữ liệu: cố gửi nốt các thay đổi còn treo lên Sheet trước, để không mất khoản chi nào.
      if(wipe && syncQueue.length && SHEET_SYNC_URL && sessionToken){
        logoutWipeBtn.textContent = "Đang gửi nốt thay đổi…";
        await processSyncQueue();
        if(!sessionRecord){ closeAuthModals(); resumeParticleBg(); done = true; return; } // phiên hết hạn giữa chừng
      }
      if(wipe && pendingChangeCount() > 0 && !logoutWipeArmed){
        logoutWipeArmed = true;
        const n = pendingChangeCount();
        logoutNote.textContent = "Còn " + n + " thay đổi KHÔNG gửi được lên Google Sheet (có thể đang mất mạng). Xoá bây giờ sẽ MẤT chúng. Bấm nút đỏ lần nữa nếu vẫn muốn xoá, hoặc chọn \"giữ dữ liệu\".";
        logoutNote.style.display = "";
        logoutWipeBtn.textContent = "Vẫn xoá (mất " + n + " thay đổi)";
        return;
      }
      // Báo server thu hồi phiên này (cố gắng tối đa 4 giây; mất mạng thì vẫn thoát được trên máy này —
      // phiên còn lại trên server có thể thu hồi từ thiết bị khác ở mục "Thiết bị đăng nhập").
      if(SHEET_SYNC_URL && sessionToken){
        try{
          await Promise.race([
            sheetCall({ action: "logout" }, 4000, { silentAuth: true }).catch(() => null),
            new Promise((resolve) => setTimeout(resolve, 4000))
          ]);
        }catch(err){}
      }
      done = true;
      closeLogoutModal();
      if(wipe){
        freezeCacheWrites(); // huỷ lần ghi bản lưu tạm đang chờ, kẻo nó ghi lại dữ liệu vừa xoá
        [CACHE_KEY, QUEUE_KEY, LAST_SYNC_KEY, REJECTED_KEY, LAST_PULL_KEY].forEach((k) => { try{ localStorage.removeItem(k); }catch(err){} });
        clearSessionLocal();
        location.reload(); // nạp lại cho sạch trạng thái trong bộ nhớ
        return;
      }
      signOutLocal("");
    }finally{
      if(!done){
        logoutKeepBtn.disabled = false;
        logoutWipeBtn.disabled = false;
        if(!logoutWipeArmed) logoutWipeBtn.textContent = WIPE_LABEL;
      }
    }
  }
  logoutKeepBtn.addEventListener("click", () => doLogout(false));
  logoutWipeBtn.addEventListener("click", () => doLogout(true));
  document.getElementById("logoutCancelBtn").addEventListener("click", closeLogoutModal);
  logoutOverlay.addEventListener("click", (e) => { if(e.target === logoutOverlay) closeLogoutModal(); });

  // ----- Quản lý thiết bị đã đăng nhập -----
  const devicesOverlay = document.getElementById("devicesOverlay");
  const devicesList = document.getElementById("devicesList");
  const devicesRevokeOthersBtn = document.getElementById("devicesRevokeOthers");
  function relTime(ms){
    const d = Date.now() - Number(ms || 0);
    if(d < 60e3) return "vừa xong";
    if(d < 3600e3) return Math.floor(d / 60e3) + " phút trước";
    if(d < 864e5) return Math.floor(d / 3600e3) + " giờ trước";
    return Math.floor(d / 864e5) + " ngày trước";
  }
  function fmtDate(ms){
    const dt = new Date(Number(ms || 0));
    return pad2(dt.getDate()) + "/" + pad2(dt.getMonth() + 1) + "/" + dt.getFullYear();
  }
  function devicesMessage(text){
    devicesList.innerHTML = '<p class="devices-empty">' + escapeHtml(text) + "</p>";
    devicesRevokeOthersBtn.style.display = "none";
  }
  function renderDevices(list){
    if(!list.length){ devicesMessage("Chưa có thiết bị nào."); return; }
    devicesList.innerHTML = list.map((d) =>
      '<div class="device-row' + (d.current ? " current" : "") + '">' +
        '<div class="device-info">' +
          '<div class="device-name">' + escapeHtml(d.name) + (d.current ? ' <span class="device-badge">Thiết bị này</span>' : "") + "</div>" +
          '<div class="device-meta">Dùng gần nhất: ' + relTime(d.lastSeen) + " · Hết hạn: " + fmtDate(d.expiresAt) + (d.remember ? "" : " · phiên ngắn") + "</div>" +
        "</div>" +
        (d.current ? "" : '<button type="button" class="device-revoke" data-revoke="' + escapeHtml(d.id) + '">Thu hồi</button>') +
      "</div>"
    ).join("");
    devicesRevokeOthersBtn.style.display = list.length > 1 ? "" : "none";
    devicesRevokeOthersBtn.classList.remove("armed");
    devicesRevokeOthersBtn.textContent = "Đăng xuất các thiết bị khác";
  }
  async function loadDevices(){
    if(!SHEET_SYNC_URL || !sessionToken){
      devicesMessage("Quản lý thiết bị chỉ dùng được khi đã bật đồng bộ Google Sheet và đăng nhập.");
      return;
    }
    devicesMessage("Đang tải danh sách…");
    try{
      const data = await sheetCall({ action: "listDevices" });
      renderDevices(data.devices || []);
    }catch(err){
      if(sessionRecord) devicesMessage("Không tải được danh sách thiết bị: " + err.message);
    }
  }
  function openDevicesModal(){
    closeAllPopovers();
    devicesOverlay.classList.add("show");
    pauseParticleBg();
    loadDevices();
  }
  function closeDevicesModal(){
    devicesOverlay.classList.remove("show");
    resumeParticleBg();
  }
  // Bấm 2 lần để xác nhận (lần 1 đổi nhãn "Chắc chắn?", tự hoàn lại sau 3,5 giây) — tránh thu hồi nhầm mà không cần hộp thoại lồng nhau.
  function armTwoStep(btn, armedText, run){
    if(btn.classList.contains("armed")){
      clearTimeout(btn._armTimer);
      run();
      return;
    }
    const original = btn.textContent;
    btn.classList.add("armed");
    btn.textContent = armedText;
    btn._armTimer = setTimeout(() => { btn.classList.remove("armed"); btn.textContent = original; }, 3500);
  }
  devicesList.addEventListener("click", (e) => {
    const btn = e.target.closest(".device-revoke");
    if(!btn) return;
    armTwoStep(btn, "Chắc chắn?", async () => {
      btn.disabled = true;
      try{
        await sheetCall({ action: "revokeDevice", deviceId: btn.dataset.revoke });
        await loadDevices();
      }catch(err){
        btn.disabled = false;
        btn.classList.remove("armed");
        btn.textContent = "Thu hồi";
        if(sessionRecord) alert("Không thu hồi được: " + err.message);
      }
    });
  });
  devicesRevokeOthersBtn.addEventListener("click", () => {
    armTwoStep(devicesRevokeOthersBtn, "Chắc chắn đăng xuất hết?", async () => {
      devicesRevokeOthersBtn.disabled = true;
      try{
        await sheetCall({ action: "revokeDevice", deviceId: "others" });
        await loadDevices();
      }catch(err){
        if(sessionRecord) alert("Không thực hiện được: " + err.message);
      }finally{
        devicesRevokeOthersBtn.disabled = false;
      }
    });
  });
  document.getElementById("devicesClose").addEventListener("click", closeDevicesModal);
  devicesOverlay.addEventListener("click", (e) => { if(e.target === devicesOverlay) closeDevicesModal(); });

  // ----- Đồng bộ trạng thái đăng nhập giữa các tab (đăng xuất ở tab này -> tab kia cũng thoát) -----
  window.addEventListener("storage", (e) => {
    if(e.key !== SESSION_KEY || !GOOGLE_CLIENT_ID) return;
    if(!e.newValue){
      if(sessionRecord){
        clearSessionLocal();
        closeAuthModals();
        authGateShow("Bạn đã đăng xuất ở một tab khác.", true);
        startSignInFlow();
      }
    }else if(!sessionRecord){
      const saved = readStoredSession();
      if(saved){ adoptSession(saved); authGateHide(); loadData(); }
    }
  });

  function initGoogleSignIn(){
    try{ sessionStorage.removeItem(OLD_AUTH_KEY); }catch(err){}
    if(!GOOGLE_CLIENT_ID){
      // Chưa cấu hình đăng nhập Google -> bỏ qua, chạy app bình thường (tương thích ngược).
      updateAccountUi();
      loadData();
      return;
    }
    initRememberCheckbox();
    const saved = readStoredSession();
    if(saved){
      // Đã đăng nhập từ trước và còn hạn -> vào thẳng app, không cần nạp Google.
      adoptSession(saved);
      loadData();
      return;
    }
    authGateShow("", false);
    startSignInFlow();
  }

  // ---------- Lưu khi ẩn app ----------
  // Bản lưu tạm được ghi gộp (saveCache) nên phải ghi nốt ngay lúc app bị ẩn / đóng.
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") flushCache(); });
  window.addEventListener("pagehide", flushCache);

  // ---------- Hộp thoại: nút Back, phím Esc, trợ năng ----------
  // Áp dụng chung cho mọi ".modal-overlay" mà không đụng vào từng hàm mở/đóng: theo dõi lớp "show".
  //  - Mở hộp thoại -> thêm 1 mục lịch sử, nên nút Back (Android / vuốt cạnh iOS) ĐÓNG hộp thoại thay vì thoát app.
  //  - Đóng bằng cách khác (nút Huỷ, bấm nền...) -> gỡ mục lịch sử tương ứng.
  //  - Esc đóng hộp thoại trên cùng (hoặc các bảng chọn đang mở); Tab xoay vòng trong hộp thoại.
  //  - Đóng = bấm vào nền hộp thoại, tức đi đúng đường sẵn có của từng hộp (vd. hỏi "bỏ thay đổi?" của form).
  (function setupOverlayNav(){
    const overlays = Array.prototype.slice.call(document.querySelectorAll(".modal-overlay"));
    if(!overlays.length) return;
    const stack = [];          // hộp thoại đang mở, theo thứ tự mở (cuối = trên cùng)
    const openers = new Map(); // phần tử đã bấm để mở, để trả focus khi đóng
    let histDepth = 0;         // số mục lịch sử mình đã thêm mà chưa gỡ
    let ignorePops = 0;        // số popstate do chính mình gây ra (history.go) cần bỏ qua

    overlays.forEach((ov, i) => {
      const dlg = ov.querySelector(".modal");
      if(!dlg) return;
      dlg.setAttribute("role", "dialog");
      dlg.setAttribute("aria-modal", "true");
      dlg.setAttribute("tabindex", "-1");
      dlg.style.outline = "none";
      const title = dlg.querySelector(".modal-title");
      if(title){
        if(!title.id) title.id = (ov.id || ("dlg" + i)) + "Title";
        dlg.setAttribute("aria-labelledby", title.id);
      }
    });

    const isShown = (ov) => ov.classList.contains("show");
    const dialogOf = (ov) => ov.querySelector(".modal");
    function dismiss(ov){ ov.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); }
    function releaseHistory(){
      const extra = histDepth - stack.length;
      if(extra > 0){
        histDepth -= extra;
        ignorePops++;
        try{ history.go(-extra); }catch(e){ ignorePops--; }
      }
    }
    function sync(ov){
      const idx = stack.indexOf(ov), shown = isShown(ov);
      if(shown && idx === -1){
        stack.push(ov);
        openers.set(ov, document.activeElement);
        try{ history.pushState({ ovl: ov.id }, "", location.href); histDepth++; }catch(e){ /* không có lịch sử: vẫn dùng được, chỉ mất nút Back */ }
        const dlg = dialogOf(ov);
        if(dlg && !dlg.contains(document.activeElement)){ try{ dlg.focus({ preventScroll: true }); }catch(e){} }
      }else if(!shown && idx !== -1){
        stack.splice(idx, 1);
        const op = openers.get(ov);
        openers.delete(ov);
        releaseHistory();
        const topDlg = stack.length ? dialogOf(stack[stack.length - 1]) : null;
        if(op && op.isConnected && op !== document.body && !/^(INPUT|TEXTAREA|SELECT)$/.test(op.tagName) && (!topDlg || topDlg.contains(op))){
          try{ op.focus({ preventScroll: true }); }catch(e){}
        }
      }
    }
    const mo = new MutationObserver((muts) => {
      const seen = new Set();
      muts.forEach((m) => { if(!seen.has(m.target)){ seen.add(m.target); sync(m.target); } });
    });
    overlays.forEach((ov) => { mo.observe(ov, { attributes: true, attributeFilter: ["class"] }); sync(ov); });

    window.addEventListener("popstate", () => {
      if(ignorePops > 0){ ignorePops--; return; }
      if(!stack.length) return;
      histDepth = Math.max(0, histDepth - 1);          // mục lịch sử của hộp thoại trên cùng vừa bị Back lấy đi
      const top = stack[stack.length - 1];
      dismiss(top);
      if(isShown(top)){                                // chưa đóng (vd. đang hỏi "bỏ thay đổi?") -> trả lại mục lịch sử
        try{ history.pushState({ ovl: top.id }, "", location.href); histDepth++; }catch(e){}
      }
    });

    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    document.addEventListener("keydown", (e) => {
      if(e.isComposing) return;
      if(e.key === "Escape" || e.key === "Esc"){
        if(stack.length){ e.preventDefault(); dismiss(stack[stack.length - 1]); }
        else if(document.body) document.body.click(); // không có hộp thoại: để bộ xử lý "bấm ra ngoài" sẵn có đóng các bảng chọn / menu
        return;
      }
      if(e.key === "Tab" && stack.length){
        const dlg = dialogOf(stack[stack.length - 1]);
        if(!dlg) return;
        const f = Array.prototype.filter.call(dlg.querySelectorAll(FOCUSABLE), (el) => el.offsetParent !== null);
        const a = document.activeElement;
        if(!f.length){ e.preventDefault(); dlg.focus(); return; }
        const first = f[0], last = f[f.length - 1];
        if(!dlg.contains(a)){ e.preventDefault(); first.focus(); }
        else if(e.shiftKey && (a === first || a === dlg)){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && a === last){ e.preventDefault(); first.focus(); }
      }
    });
  })();

  // ---------- Init ----------
  initGoogleSignIn();
})();

// ================== Đồng hồ HUD trên header ==================
// Tự chạy độc lập, không đụng vào state/logic sổ chi tiêu — chỉ cập nhật đúng 1 dòng
// chữ mỗi giây, và tự dừng khi tab/app bị ẩn.
(() => {
  const timeEl = document.getElementById("hudClockTime");
  if(!timeEl) return;
  function pad2(n){ return String(n).padStart(2, "0"); }
  function tick(){
    const now = new Date();
    timeEl.textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds());
  }
  // Chỉ chạy khi trang đang hiện: tab ẩn / app ở nền thì dừng hẳn, đỡ đánh thức CPU mỗi giây.
  let timer = null;
  function start(){ if(timer) return; tick(); timer = setInterval(tick, 1000); }
  function stop(){ clearInterval(timer); timer = null; }
  document.addEventListener("visibilitychange", () => { if(document.hidden) stop(); else start(); });
  if(!document.hidden) start();
})();

// ================== Hiệu ứng nền: Particle Network ==================
// Toàn bộ nằm gọn trong hàm initParticleNetwork() — không đụng vào state/logic sổ
// chi tiêu. Muốn gỡ hiệu ứng: xoá hàm này (và lệnh gọi initParticleNetwork() ngay
// dưới nó) cùng thẻ <canvas id="particleNetwork"> trong <body> là sạch, không ảnh
// hưởng gì đến phần còn lại của app.
function initParticleNetwork(){
  const canvas = document.getElementById("particleNetwork");
  if(!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if(!ctx) return;

  const reduceMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduceMotion = !!(reduceMotionQuery && reduceMotionQuery.matches);

  let width = 0, height = 0, dpr = 1;
  let targetFrameMs = 0; // 0 = không giới hạn (desktop chạy đúng tốc độ màn hình); di động sẽ đặt lại trong resize()
  let rafId = null;
  let running = false;
  let lastTime = 0;   // mốc "lưới nhịp" để giới hạn fps (dịch lùi theo phần dư để nhịp đều)
  let lastRender = 0; // thời điểm thật của khung vừa vẽ -> tính dt chính xác
  let lastVw = 0, lastVh = 0;
  let edgeZone = 40;  // bề dày vùng đệm mềm sát mép màn hình (px)
  let mouseX = -9999, mouseY = -9999; // để xa màn hình -> mặc định không có lực né nào cả
  const coarsePointer = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  // ---------- Màu theo theme (đọc từ CSS variables sẵn có của app) ----------
  // Chỉ dùng đúng 2 màu chủ đạo: cyan (--chong) và hồng (--vk) — không thêm màu khác.
  const PALETTE_VARS = ["--chong-rgb", "--vk-rgb"];
  let palette = ["41,231,240", "247,49,143"];
  function refreshColors(){
    const cs = getComputedStyle(document.documentElement);
    palette = PALETTE_VARS.map((v, i) => (cs.getPropertyValue(v) || palette[i]).trim());
  }
  // Cyan chiếm đa số, hồng chỉ xuất hiện làm điểm nhấn hiếm (~15% số hạt).
  function pickColorIndex(){ return Math.random() < 0.85 ? 0 : 1; }

  // ---------- Cấp phát 1 lần duy nhất (Typed Arrays), KHÔNG tạo mới mỗi khung hình ----------
  // Trần hạt: mobile ≤60, desktop ≤140 — cấp phát sẵn ở mức trần lớn nhất (140),
  // chỉ dùng "activeCount" phần tử đầu mảng theo mật độ thực tế của màn hình hiện tại.
  const MAX_CAP = 140;
  const px = new Float32Array(MAX_CAP);     // vị trí X
  const py = new Float32Array(MAX_CAP);     // vị trí Y
  const pvx = new Float32Array(MAX_CAP);    // vận tốc hiệu dụng X (trôi nền + né chuột, có easing)
  const pvy = new Float32Array(MAX_CAP);    // vận tốc hiệu dụng Y
  const pangle = new Float32Array(MAX_CAP); // hướng trôi hiện tại (radian) — tự đổi rất chậm mỗi khung hình để quỹ đạo cong mềm mại, không đi thẳng cứng nhắc
  const pspeed = new Float32Array(MAX_CAP); // tốc độ trôi nền của từng hạt (hằng số riêng mỗi hạt)
  const pr = new Float32Array(MAX_CAP);     // bán kính hạt
  const pcolor = new Uint8Array(MAX_CAP);   // chỉ số màu (0/1 -> palette)
  let activeCount = 0;

  const WANDER = 0.03; // biên độ đổi hướng ngẫu nhiên (tính theo căn bậc hai của thời gian -> cùng "độ cong" ở 30/60/120 fps)
  const EDGE_TURN = 0.05; // mức bẻ hướng mỗi khung (ở 60 fps) khi hạt lọt vào vùng đệm sát mép; càng sát mép càng mạnh
  function wrapAngle(a){
    while(a > Math.PI) a -= Math.PI * 2;
    while(a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function initParticleAt(i){
    px[i] = 8 + Math.random() * Math.max(1, width - 16);   // sinh hạt cách mép ≥ 8px -> không bị chốt an toàn lật hướng ngay khung đầu
    py[i] = 8 + Math.random() * Math.max(1, height - 16);
    pangle[i] = Math.random() * Math.PI * 2;
    pspeed[i] = 0.12 + Math.random() * 0.20;
    pvx[i] = Math.cos(pangle[i]) * pspeed[i];
    pvy[i] = Math.sin(pangle[i]) * pspeed[i];
    pr[i] = 1.6 + Math.random() * 1.8;
    pcolor[i] = pickColorIndex();
  }

  // Mật độ hạt tự tính theo diện tích màn hình, có trần riêng cho mobile/desktop.
  function targetCount(){
    const area = width * height;
    const isSmall = width < 640;
    const cap = isSmall ? 60 : 140;
    return Math.max(24, Math.min(cap, Math.round(area / 9000)));
  }

  // ---------- Spatial grid: gom hạt vào ô lưới để chỉ so khoảng cách với hạt LÂN CẬN ----------
  // thay vì so mọi cặp hạt (O(n²) -> gần O(n)) — hiệu quả rõ khi số hạt tăng lên gần trần.
  const MAX_LINK_DIST = 118;
  const MAX_LINK_DIST_SQ = MAX_LINK_DIST * MAX_LINK_DIST;
  const CELL_SIZE = MAX_LINK_DIST;
  let gridCols = 1, gridRows = 1;
  let gridCells = []; // mảng các mảng (reuse) — mỗi ô chỉ set length = 0 mỗi khung hình, không tạo mảng mới

  function rebuildGridShape(){
    gridCols = Math.max(1, Math.ceil(width / CELL_SIZE));
    gridRows = Math.max(1, Math.ceil(height / CELL_SIZE));
    const total = gridCols * gridRows;
    gridCells = new Array(total);
    for(let i = 0; i < total; i++) gridCells[i] = [];
  }
  function cellIndexOf(x, y){
    let cx = (x / CELL_SIZE) | 0, cy = (y / CELL_SIZE) | 0;
    if(cx < 0) cx = 0; else if(cx >= gridCols) cx = gridCols - 1;
    if(cy < 0) cy = 0; else if(cy >= gridRows) cy = gridRows - 1;
    return cy * gridCols + cx;
  }

  // ---------- Resize (debounce ở nơi gọi) ----------
  function resize(force){
    const vw = document.documentElement.clientWidth || window.innerWidth || 1, vh = window.innerHeight || 1; // clientWidth: không tính thanh cuộn dọc của desktop
    // Thanh địa chỉ trình duyệt co/giãn khi cuộn chỉ làm chiều cao đổi vài chục px: bỏ qua, KHÔNG cấp phát lại canvas
    // (cấp phát lại xoá trắng canvas + dựng lại lưới -> chớp/giật lúc đang cuộn).
    if(!force && width && vw === lastVw && Math.abs(vh - lastVh) < 150) return;
    lastVw = vw; lastVh = vh;
    // Màn cảm ứng: canvas cao hơn khung nhìn 100px để khi thanh địa chỉ ẩn đi vẫn không hở dải trống ở đáy.
    width = Math.max(1, Math.round(vw));
    height = Math.max(1, Math.round(vh + (coarsePointer ? 100 : 0)));
    canvas.style.width = width + "px";   // kích thước CSS cố định theo lần cấp phát -> canvas không bị kéo giãn khi khung nhìn đổi nhẹ
    canvas.style.height = height + "px";
    edgeZone = Math.max(24, Math.min(56, Math.min(width, height) * 0.12));
    const isMobile = width < 640;
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 2); // di động: DPR trần thấp hơn hẳn -> ít pixel phải vẽ/hoà trộn mỗi khung hình, mượt hơn xuyên suốt kể cả lúc cuộn
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    targetFrameMs = isMobile ? 1000 / 30 : 0; // di động: giới hạn ~30fps (đủ mượt cho hạt trôi chậm, giảm ~1 nửa khối lượng tính toán mỗi giây so với 60fps)

    const want = targetCount();
    if(want > activeCount){
      for(let i = activeCount; i < want; i++) initParticleAt(i);
    }
    activeCount = want;
    // Giữ hạt trong khung hình mới sau khi xoay màn hình / đổi kích thước cửa sổ.
    for(let i = 0; i < activeCount; i++){
      if(px[i] > width) px[i] = Math.random() * width;
      if(py[i] > height) py[i] = Math.random() * height;
    }

    rebuildGridShape();
  }

  // ---------- Vòng lặp animate (không cấp phát object/mảng mới trong này) ----------
  const REPEL_RADIUS = 90;
  const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
  const REPEL_STRENGTH = 0.7; // tốc độ né tối đa (px/khung ở 60 fps) ~2–3 lần tốc độ trôi nền: hạt "lách" nhẹ chứ không bị bắn đi
  const EASE = 0.08; // hệ số hồi về hướng trôi nền (ở 60 fps); được quy đổi theo dt thật mỗi khung

  function renderFrame(dt){
    ctx.clearRect(0, 0, width, height);

    // Cập nhật vị trí: hướng trôi tự đổi rất chậm (wander), né nhẹ theo con trỏ chuột, và được BẺ CONG MỀM
    // khi tới gần mép màn hình (không còn bật cứng). Mọi hệ số đều quy đổi theo dt thật nên 30/60/120 fps cho cùng chuyển động.
    const easeK = 1 - Math.pow(1 - EASE, dt);
    const wanderStep = WANDER * Math.sqrt(dt);
    const edgeTurnBase = EDGE_TURN;
    for(let i = 0; i < activeCount; i++){
      let ang = pangle[i] + (Math.random() - 0.5) * wanderStep;

      // Vùng đệm mềm: càng sát mép, hướng trôi càng được xoay về phía trong màn hình.
      let ex = 0, ey = 0;
      const xi = px[i], yi = py[i];
      if(xi < edgeZone) ex = 1 - xi / edgeZone;
      else if(xi > width - edgeZone) ex = -(1 - (width - xi) / edgeZone);
      if(yi < edgeZone) ey = 1 - yi / edgeZone;
      else if(yi > height - edgeZone) ey = -(1 - (height - yi) / edgeZone);
      if(ex !== 0 || ey !== 0){
        let strength = Math.sqrt(ex * ex + ey * ey);
        if(strength > 1) strength = 1;
        const diff = wrapAngle(Math.atan2(ey, ex) - ang);
        ang += diff * (1 - Math.pow(1 - edgeTurnBase * strength, dt));
      }
      pangle[i] = ang;

      let targetVx = Math.cos(ang) * pspeed[i];
      let targetVy = Math.sin(ang) * pspeed[i];
      const dx = xi - mouseX, dy = yi - mouseY;
      const distSq = dx * dx + dy * dy;
      if(distSq < REPEL_RADIUS_SQ && distSq > 0.0001){
        const dist = Math.sqrt(distSq);
        const t = 1 - dist / REPEL_RADIUS;
        const force = t * t * (3 - 2 * t) * REPEL_STRENGTH; // smoothstep: vừa vào/ra vùng né thì lực tăng/giảm êm, không "bật" đột ngột
        targetVx += (dx / dist) * force;
        targetVy += (dy / dist) * force;
      }
      pvx[i] += (targetVx - pvx[i]) * easeK;
      pvy[i] += (targetVy - pvy[i]) * easeK;

      let x = xi + pvx[i] * dt;
      let y = yi + pvy[i] * dt;
      // Chốt an toàn: nếu vẫn lọt mép (vd. bị con trỏ ép sát tường) thì giữ lại trong khung, và CHỈ đổi hướng
      // khi hạt đang bay RA ngoài — hạt đang bay vào trong thì giữ nguyên hướng (hết hiện tượng lật hướng mỗi khung gây rung).
      const r = pr[i];
      if(x < r){ x = r; if(Math.cos(ang) < 0) pangle[i] = Math.PI - ang; }
      else if(x > width - r){ x = width - r; if(Math.cos(ang) > 0) pangle[i] = Math.PI - ang; }
      if(y < r){ y = r; if(Math.sin(ang) < 0) pangle[i] = -pangle[i]; }
      else if(y > height - r){ y = height - r; if(Math.sin(ang) > 0) pangle[i] = -pangle[i]; }
      px[i] = x; py[i] = y;
    }

    // Gom vào lưới (reuse mảng có sẵn, chỉ reset length).
    for(let c = 0; c < gridCells.length; c++) gridCells[c].length = 0;
    for(let i = 0; i < activeCount; i++){
      gridCells[cellIndexOf(px[i], py[i])].push(i);
    }

    // Vẽ đường nối — chỉ so với hạt trong 3x3 ô lưới lân cận thay vì toàn bộ hạt còn lại.
    // Gom các đường nối theo "bậc" độ mờ (alpha) rồi vẽ gộp 1 lần/bậc bằng Path2D, thay vì
    // beginPath+strokeStyle+stroke riêng cho TỪNG đường (có thể lên tới hàng trăm đường/khung
    // hình) — đổi hàng trăm lệnh vẽ + hàng trăm lần dựng chuỗi màu (toFixed/nối chuỗi) mỗi khung
    // hình thành tối đa 12 lệnh stroke() cố định, không phụ thuộc số hạt. Mắt thường không phân
    // biệt được 12 bậc mờ liền kề nên hình ảnh hiển thị ra không đổi.
    ctx.lineWidth = 1;
    const LINK_ALPHA_BUCKETS = 12;
    let linkPaths = renderFrame._linkPaths;
    if(!linkPaths){ linkPaths = renderFrame._linkPaths = []; }
    for(let b = 0; b < LINK_ALPHA_BUCKETS; b++) linkPaths[b] = new Path2D();
    let anyLinkInBucket = renderFrame._anyLinkInBucket;
    if(!anyLinkInBucket){ anyLinkInBucket = renderFrame._anyLinkInBucket = new Array(LINK_ALPHA_BUCKETS); }
    for(let b = 0; b < LINK_ALPHA_BUCKETS; b++) anyLinkInBucket[b] = false;

    for(let cy = 0; cy < gridRows; cy++){
      for(let cx = 0; cx < gridCols; cx++){
        const cell = gridCells[cy * gridCols + cx];
        for(let k = 0; k < cell.length; k++){
          const i = cell[k];
          for(let ny = Math.max(0, cy - 1); ny <= Math.min(gridRows - 1, cy + 1); ny++){
            for(let nx = Math.max(0, cx - 1); nx <= Math.min(gridCols - 1, cx + 1); nx++){
              const neighborCell = gridCells[ny * gridCols + nx];
              for(let m = 0; m < neighborCell.length; m++){
                const j = neighborCell[m];
                if(j <= i) continue; // tránh vẽ 2 lần cùng 1 cặp
                const dx = px[i] - px[j], dy = py[i] - py[j];
                const distSq = dx * dx + dy * dy;
                if(distSq > MAX_LINK_DIST_SQ) continue;
                const alpha = (1 - Math.sqrt(distSq) / MAX_LINK_DIST) * 0.16;
                if(alpha <= 0.004) continue;
                let bIdx = (alpha / 0.16 * LINK_ALPHA_BUCKETS) | 0;
                if(bIdx >= LINK_ALPHA_BUCKETS) bIdx = LINK_ALPHA_BUCKETS - 1;
                linkPaths[bIdx].moveTo(px[i], py[i]);
                linkPaths[bIdx].lineTo(px[j], py[j]);
                anyLinkInBucket[bIdx] = true;
              }
            }
          }
        }
      }
    }
    for(let b = 0; b < LINK_ALPHA_BUCKETS; b++){
      if(!anyLinkInBucket[b]) continue;
      const bucketAlpha = ((b + 0.5) / LINK_ALPHA_BUCKETS) * 0.16;
      ctx.strokeStyle = "rgba(" + palette[0] + "," + bucketAlpha.toFixed(3) + ")";
      ctx.stroke(linkPaths[b]);
    }

    // Vẽ hạt đè lên trên các đường nối.
    for(let i = 0; i < activeCount; i++){
      ctx.beginPath();
      ctx.fillStyle = "rgba(" + palette[pcolor[i]] + ",0.55)";
      ctx.arc(px[i], py[i], pr[i], 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function step(now){
    if(!running) return;
    rafId = requestAnimationFrame(step); // luôn đặt lịch khung kế tiếp trước tiên -> vòng lặp không bao giờ dừng, kể cả lúc cuộn
    const elapsed = now - lastTime;
    // Giới hạn ~30fps: chừa dung sai 1ms (khung vsync thứ 2 hay đến sớm 0,01–0,3ms so với 33,33ms; nếu chặn cứng nó bị bỏ
    // và khung hiển thị rơi về 50ms -> nhịp lúc 33ms lúc 50ms, nhìn như giật) và dịch mốc theo phần dư để nhịp luôn đều.
    if(targetFrameMs && lastTime && elapsed < targetFrameMs - 1) return;
    const dt = lastRender ? Math.min(2.5, (now - lastRender) / 16.6667) : 1; // chuẩn hoá ~60fps, chặn bước nhảy khi tab quay lại
    lastTime = (targetFrameMs && lastTime && elapsed >= targetFrameMs) ? now - (elapsed % targetFrameMs) : now;
    lastRender = now;
    renderFrame(dt);
  }

  function perfLite(){ return document.documentElement.getAttribute("data-perf") === "lite"; }
  function start(){
    if(running || reduceMotion || perfLite()) return;
    // Đang có hộp thoại phủ kín (class anim-paused) thì không chạy lại — vd. quay lại tab khi hộp thoại còn mở.
    if(document.documentElement.classList.contains("anim-paused")) return;
    running = true;
    lastTime = 0;
    lastRender = 0;
    rafId = requestAnimationFrame(step);
  }
  function stop(){
    running = false;
    if(rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  // Cho phần app chính (modal/dialog) gọi tạm dừng/tiếp tục khi có lớp phủ toàn màn hình che kín
  // nền hạt — xem pauseParticleBg()/resumeParticleBg() ở đầu file.
  window.__particleStart = start;
  window.__particleStop = stop;
  // Công tắc "Tiết kiệm pin" gọi vào đây: bật -> dừng hẳn vòng lặp vẽ; tắt -> chạy lại (nếu tab đang hiện).
  window.__particleSetLite = function(on){
    if(on) stop();
    else if(!document.hidden) start();
  };
  // Cho nút chuyển giao diện sáng/tối (định nghĩa ở phần app chính) gọi lại khi người
  // dùng đổi theme, để hạt đổi màu ngay lập tức thay vì đợi lần load trang kế tiếp.
  window.__particleRefreshColors = function(){
    refreshColors();
    if(!running) renderFrame(0); // đang dừng (tab ẩn / giảm chuyển động) -> tự vẽ lại 1 khung với màu mới
  };

  // ---------- Sự kiện ----------
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize(false);
      if(reduceMotion) renderFrame(0); // giảm chuyển động -> vẽ lại đúng 1 khung tĩnh sau khi đổi kích thước
    }, 150); // gộp các lần resize liên tiếp, tránh tính lại lưới/mật độ quá nhiều lần khi kéo cửa sổ
  });

  document.addEventListener("visibilitychange", () => {
    if(document.hidden) stop(); else start();
  });


  // Hạt "né nhẹ" theo con trỏ chuột / ngón tay — canvas vẫn pointer-events:none nên phải lắng nghe trên window.
  // Chuột thật: dùng pointermove (pointerType = mouse). Ngón tay: dùng touch events (pointer events bị trình duyệt
  // huỷ ngay khi bắt đầu cuộn, còn touchmove thì vẫn chạy suốt lúc kéo).
  // Nhấc tay / bị huỷ cảm ứng / rời cửa sổ -> xoá vị trí, để không còn "con trỏ ma" đẩy hạt đứng yên.
  function setMouse(x, y){ mouseX = x; mouseY = y; }
  function clearMouse(){ mouseX = -9999; mouseY = -9999; }
  if(window.PointerEvent){
    window.addEventListener("pointermove", (e) => { if(e.pointerType === "mouse") setMouse(e.clientX, e.clientY); }, { passive: true });
  }else{
    window.addEventListener("mousemove", (e) => setMouse(e.clientX, e.clientY), { passive: true });
  }
  function onTouch(e){
    const t = e.touches && e.touches[0];
    if(t) setMouse(t.clientX, t.clientY);
  }
  window.addEventListener("touchstart", onTouch, { passive: true });
  window.addEventListener("touchmove", onTouch, { passive: true });
  window.addEventListener("touchend", clearMouse, { passive: true });
  window.addEventListener("touchcancel", clearMouse, { passive: true });
  document.addEventListener("mouseleave", clearMouse);
  window.addEventListener("blur", clearMouse);

  if(reduceMotionQuery && reduceMotionQuery.addEventListener){
    reduceMotionQuery.addEventListener("change", (e) => {
      reduceMotion = e.matches;
      if(reduceMotion){ stop(); renderFrame(0); } else { start(); }
    });
  }

  refreshColors();
  resize(true);
  if(reduceMotion){
    renderFrame(0); // chỉ vẽ đúng 1 khung tĩnh, không animate — tôn trọng prefers-reduced-motion
  }else if(!document.hidden){
    start();
  }
}
initParticleNetwork();

// ================== PWA: Service Worker + số phiên bản + thông báo có bản mới ==================
// Cần HTTPS (GitHub Pages) hoặc localhost. Lỗi đăng ký không được làm hỏng app.
(function(){
  if(!("serviceWorker" in navigator)) return;
  var versionEl = document.getElementById("menuVersion");
  var toast = document.getElementById("updateToast");
  var hadController = !!navigator.serviceWorker.controller; // lần cài đầu tiên chưa có -> không báo "bản mới"
  var reg = null, lastCheck = 0, updateShown = false, versionText = "";

  function showVersion(text){ if(versionEl) versionEl.textContent = text; }
  function askVersion(){
    var sw = navigator.serviceWorker.controller;
    if(sw) sw.postMessage({ type: "getVersion" });
  }
  function showUpdateToast(){
    updateShown = true;
    if(toast) toast.hidden = false;
  }
  navigator.serviceWorker.addEventListener("message", function(e){
    if(e.data && e.data.type === "version"){
      versionText = "Phiên bản " + e.data.version + ".";
      showVersion(versionText);
    }
  });
  // Service Worker mới đã tiếp quản: file mới đã sẵn sàng, nhưng trang đang mở vẫn chạy bản cũ cho tới khi tải lại.
  navigator.serviceWorker.addEventListener("controllerchange", function(){
    if(hadController) showUpdateToast();
    hadController = true;
    askVersion();
  });
  function checkForUpdate(manual){
    if(!reg) return;
    lastCheck = Date.now();
    if(manual) showVersion("Đang kiểm tra…");
    reg.update().catch(function(){}).then(function(){
      if(!manual) return;
      setTimeout(function(){
        if(updateShown){ askVersion(); return; }
        showVersion("✓ Đã là bản mới nhất");
        setTimeout(function(){ showVersion(versionText || "Phiên bản …"); }, 2500);
      }, 1200);
    });
  }
  if(versionEl) versionEl.addEventListener("click", function(){ checkForUpdate(true); });
  var reloadBtn = document.getElementById("updateToastBtn");
  if(reloadBtn) reloadBtn.addEventListener("click", function(){ location.reload(); });
  var closeBtn = document.getElementById("updateToastClose");
  if(closeBtn) closeBtn.addEventListener("click", function(){ if(toast) toast.hidden = true; });
  // App chạy nền lâu (PWA không tự "mở trang mới") -> khi quay lại, tự hỏi xem có bản mới không (tối đa 30 phút/lần).
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "visible" && reg && Date.now() - lastCheck > 30 * 60 * 1000) checkForUpdate(false);
  });
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").then(function(r){
      reg = r;
      lastCheck = Date.now();
      askVersion();
      navigator.serviceWorker.ready.then(askVersion);
    }).catch(function(err){
      console.warn("Không đăng ký được Service Worker:", err);
    });
  });
})();

// ================== PWA: điều khiển Splash động ==================
// Tự gỡ sau SPLASH_MIN_MS (hoặc chạm vào để bỏ qua). Mỗi phiên chỉ hiện 1 lần (tải lại trang không chiếu lại).
(function(){
  var el = document.getElementById("splash");
  if(!el) return;
  var root = document.documentElement;
  if(!root.classList.contains("splash-on")){ el.remove(); return; }
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SPLASH_MIN_MS = reduce ? 1000 : 2300;
  var done = false;
  try{ sessionStorage.setItem("so_chi_tieu:splash", "1"); }catch(e){}
  function hide(){
    if(done) return; done = true;
    el.classList.add("out");
    setTimeout(function(){ el.remove(); root.classList.remove("splash-on"); }, reduce ? 350 : 650);
  }
  setTimeout(hide, SPLASH_MIN_MS);
  el.addEventListener("click", hide);
})();

// ================== Font Google: nạp không chặn lần vẽ đầu ==================
(function(){
  var fl = document.getElementById("gfont");
  if(!fl) return;
  if(fl.sheet){ fl.media = "all"; return; }
  fl.addEventListener("load", function(){ fl.media = "all"; });
})();

/* ======================= HIỆU ỨNG GIAO DIỆN (trước đây là fx.js) ======================= */
/* fx.js — lớp hiệu ứng tương tác cho giao diện V2. Chạy độc lập với script.js: lỗi ở đây không ảnh hưởng dữ liệu.
 * - Đèn rọi theo con trỏ trên thẻ/hero (chỉ khi có chuột)
 * - Gợn sóng (ripple) khi bấm nút
 * - Header đổ bóng khi cuộn; nút nổi tự ẩn khi cuộn xuống, hiện lại khi cuộn lên
 * - Hàng chi tiêu mới "trượt vào" lần lượt (chỉ hàng chưa từng thấy; đổi tháng thì chạy lại)
 * Tự tắt khi bật Tiết kiệm pin hoặc hệ thống yêu cầu giảm chuyển động. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function calm() { return reduce.matches || root.getAttribute("data-perf") === "lite"; }

  /* 1) Đèn rọi theo con trỏ */
  var canHover = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (canHover) {
    var spotEl = null, spotX = 0, spotY = 0, spotRaf = 0;
    document.addEventListener("pointermove", function (e) {
      if (calm()) return;
      var t = e.target.closest ? e.target.closest(".card, .hero") : null;
      if (spotEl && spotEl !== t) spotEl.style.setProperty("--sp", "0");
      spotEl = t;
      if (!t) return;
      spotX = e.clientX; spotY = e.clientY;
      if (spotRaf) return;
      spotRaf = requestAnimationFrame(function () {
        spotRaf = 0;
        if (!spotEl) return;
        var r = spotEl.getBoundingClientRect();
        spotEl.style.setProperty("--mx", (spotX - r.left) + "px");
        spotEl.style.setProperty("--my", (spotY - r.top) + "px");
        spotEl.style.setProperty("--sp", "1");
      });
    }, { passive: true });
    document.addEventListener("pointerleave", function () {
      if (spotEl) spotEl.style.setProperty("--sp", "0");
      spotEl = null;
    });
  }

  /* 2) Ripple + rung nhẹ */
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest ? e.target.closest(".btn-primary, .fab-add") : null;
    if (!b || b.disabled) return;
    if (!calm()) {
      var r = b.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 2;
      var s = document.createElement("span");
      s.className = "fx-ripple";
      s.style.width = s.style.height = size + "px";
      s.style.left = (e.clientX - r.left - size / 2) + "px";
      s.style.top = (e.clientY - r.top - size / 2) + "px";
      b.appendChild(s);
      s.addEventListener("animationend", function () { s.remove(); });
    }
    if (b.classList.contains("fab-add") && navigator.vibrate) { try { navigator.vibrate(8); } catch (_) {} }
  }, { passive: true });

  /* 3) Header + nút nổi theo hướng cuộn */
  var header = document.querySelector("header.top");
  var fabs = [document.getElementById("fabAddBtn"), document.getElementById("fabMicBtn")];
  var lastY = window.scrollY, ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY;
    if (header) header.classList.toggle("scrolled", y > 8);
    var dy = y - lastY;
    if (Math.abs(dy) > 6) {
      var hide = dy > 0 && y > 220;
      setFabs(hide);
      lastY = y;
      // Dừng cuộn ~0.7 giây thì nút tự hiện lại: luôn bấm được, không phải cuộn ngược lên.
      clearTimeout(fabTimer);
      if (hide) fabTimer = setTimeout(function () { setFabs(false); }, 700);
    }
  }
  var fabTimer = 0;
  function setFabs(hide) { fabs.forEach(function (f) { if (f) f.classList.toggle("fab-hide", hide); }); }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* 4) Hàng chi tiêu mới trượt vào */
  var body = document.getElementById("ledgerBody");
  var title = document.getElementById("monthTitle");
  if (body && window.MutationObserver) {
    var seen = new Set(), monthKey = title ? title.textContent : "";
    var onRows = function () {
      var cur = title ? title.textContent : "";
      if (cur !== monthKey) { monthKey = cur; seen.clear(); }
      var rows = body.querySelectorAll(".t-row-wrap");
      var fresh = 0, add = [];
      for (var i = 0; i < rows.length; i++) {
        var id = rows[i].getAttribute("data-id");
        if (!seen.has(id)) {
          add.push(id);
          if (!calm() && fresh < 14) {
            rows[i].style.setProperty("--i", fresh++);
            rows[i].classList.add("row-in");
          }
        }
      }
      add.forEach(function (id) { seen.add(id); });
    };
    new MutationObserver(onRows).observe(body, { childList: true });
    onRows(); // lần hiển thị đầu tiên cũng được tính (trượt vào lần lượt khi mở app, và không chạy lại khi lọc/bỏ lọc)
  }
})();
