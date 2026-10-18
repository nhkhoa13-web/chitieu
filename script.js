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
  function animateValue(el, toValue, formatter){
    if(!el) return;
    formatter = formatter || money;
    const to = Number(toValue) || 0;
    if(prefersReducedMotion()){
      el.dataset.animVal = to;
      el.textContent = formatter(to);
      return;
    }
    const from = Number(el.dataset.animVal || 0);
    el.dataset.animVal = to;
    if(Math.abs(to - from) < 0.001){ el.textContent = formatter(to); return; }
    const duration = 550;
    const start = performance.now();
    if(el._animRaf) cancelAnimationFrame(el._animRaf);
    function tick(now){
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatter(from + (to - from) * eased);
      if(t < 1){ el._animRaf = requestAnimationFrame(tick); }
      else { el.textContent = formatter(to); el._animRaf = null; }
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

  function saveCache(){
    try{
      localStorage.setItem(CACHE_KEY, JSON.stringify({ months: monthsData, current: currentMonthKey }));
    }catch(e){ /* hết dung lượng hoặc trình duyệt chặn — bỏ qua, không ảnh hưởng hoạt động chính */ }
  }
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
  let syncPhase = "idle";   // idle | push | pull
  let lastSyncError = null; // { kind: "network" | "fatal", message }
  let startedWithCache = false;

  function saveQueue(){
    try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(syncQueue)); }catch(e){ /* ignore */ }
  }
  function saveRejected(){
    try{ localStorage.setItem(REJECTED_KEY, JSON.stringify(rejectedItems)); }catch(e){ /* ignore */ }
  }
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
  function enqueueItem(item){
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
    syncQueue = syncQueue.filter(it => it.monthKey !== monthKey || it === syncInFlight);
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
    try{
      while(syncQueue.length){
        const item = syncQueue[0];
        syncInFlight = item;
        try{
          await sheetRequest(buildPayload(item));
          removeFromQueue(item);
          saveQueue();   // xong 1 mục -> lưu ngay, tránh gửi lại nếu tải lại trang
          markPushed();
          retryAttempt = 0;
          lastSyncError = null;
        }catch(raw){
          const err = toSyncError(raw);
          item.attempts = (item.attempts || 0) + 1;
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
        }
      }
    }finally{
      syncPhase = "idle";
    }
    if(!result.ok && result.kind === "network") scheduleRetry();
    refreshSyncStatus();
    return result;
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
        '<button type="button" class="month-item' + (k === currentMonthKey ? " active" : "") + '" data-month="' + k + '">' +
          escapeHtml(monthLabel(k)) +
        '</button>' +
        '<button type="button" class="month-delete-btn" data-delete-month="' + k + '" aria-label="Xoá ' + escapeHtml(monthLabel(k)) + '">' +
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
    animateValue(balNum, isZero ? 0 : Math.abs(balance.net));
    balNum.className = "balance-number " + dir;
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
  const LEDGER_SWIPE_MAX = 100;     // giới hạn kéo tối đa (px) — chỉ để tạo hiệu ứng, không phải ngưỡng kích hoạt
  const LEDGER_SWIPE_TRIGGER = 74;  // kéo quá ngưỡng này rồi nhả tay mới kích hoạt Sửa/Xoá
  function renderLedger(){
    const body = document.getElementById("ledgerBody");
    const searchWords = stripDiacritics(ledgerFilterText).trim().split(/\s+/).filter(Boolean);
    const filtered = entries.filter(e => {
      if(ledgerFilterCat && e.category !== ledgerFilterCat) return false;
      if(ledgerFilterDay && Number(e.day) !== Number(ledgerFilterDay)) return false;
      if(searchWords.length){
        const cat = catById[e.category] || catById.ca_nhan;
        const haystack = stripDiacritics(e.name + " " + (e.note || "") + " " + cat.label + " " + money(e.amount) + " " + e.amount);
        if(!searchWords.every(w => haystack.includes(w))) return false;
      }
      return true;
    });
    const sorted = filtered.slice().sort((a,b) =>
      (ledgerSortDir === "asc" ? a.day - b.day : b.day - a.day) || String(a.id).localeCompare(String(b.id))
    );

    const clearBtn = document.getElementById("ledgerFilterClear");
    if(clearBtn) clearBtn.style.display = (ledgerFilterText || ledgerFilterCat || ledgerFilterDay) ? "" : "none";

    if(sorted.length === 0){
      body.innerHTML = entries.length === 0
        ? '<div class="empty-state">Chưa có khoản chi nào. Bấm "Thêm khoản chi" để bắt đầu ghi sổ.</div>'
        : '<div class="empty-state">Không có khoản chi nào khớp với bộ lọc.</div>';
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
          '<div class="t-row-wrap' + (isMergeSelected ? " merge-selected" : "") + '" data-id="' + e.id + '">' +
            '<div class="t-swipe-indicator t-swipe-delete-indicator" aria-hidden="true">' +
              '<svg width="18" height="18"><use href="#icon-trash-sprite"></use></svg>' +
              '<span>Xoá</span>' +
            '</div>' +
            '<div class="t-swipe-indicator t-swipe-edit-indicator" aria-hidden="true">' +
              '<svg width="18" height="18"><use href="#icon-edit-sprite"></use></svg>' +
              '<span>Sửa</span>' +
            '</div>' +
            '<div class="t-row" data-id="' + e.id + '">' +
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
  function openModal(mode, entry, customTitle, customSubmitLabel){
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
  modalOverlay.addEventListener("click", (e) => { if(e.target === modalOverlay) attemptCloseModal(); });

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
        entries.push(newEntry);
        commit();
        closeModal();
        render();
        queueSync("addEntry", newEntry);
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
  // Dùng Web Speech API (miễn phí, chạy ngay trên trình duyệt, không cần API key)
  // để chuyển giọng nói thành văn bản, sau đó tách câu theo đúng khuôn mẫu:
  // "... ngày X ... số tiền X ... tên X ... người thanh toán X ..."
  // (các mục có thể nói theo thứ tự khác nhau, miễn giữ đúng từ khoá).

  const VN_NUM_WORDS = {
    "không":0, "một":1, "mốt":1, "hai":2, "ba":3, "bốn":4, "tư":4,
    "năm":5, "lăm":5, "nhăm":5, "sáu":6, "bảy":7, "bẩy":7, "tám":8, "chín":9, "mười":10
  };
  // Chuyển cụm số viết bằng chữ tiếng Việt (vd. "hai mươi lăm", "một trăm") thành số.
  // Chỉ hỗ trợ tốt trong khoảng 0–999 — đủ dùng cho "ngày" (1–31) và "số tiền" (đơn vị nghìn).
  function vietnameseWordsToNumber(str){
    let words = String(str || "")
      .toLowerCase()
      .replace(/[^a-zà-ỹđ\s]/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if(!words.length) return null;
    let result = 0;
    let matchedAny = false;

    const tramIdx = words.indexOf("trăm");
    if(tramIdx !== -1){
      const before = words.slice(0, tramIdx);
      const hVal = before.length ? (VN_NUM_WORDS[before[before.length - 1]] ?? 1) : 1;
      result += hVal * 100;
      matchedAny = true;
      words = words.slice(tramIdx + 1).filter(w => w !== "linh" && w !== "lẻ");
    }

    const tenIdx = words.findIndex(w => w === "mươi" || w === "chục");
    if(tenIdx !== -1){
      const before = words.slice(0, tenIdx);
      const tVal = before.length ? (VN_NUM_WORDS[before[before.length - 1]] ?? 1) : 1;
      result += tVal * 10;
      matchedAny = true;
      const after = words.slice(tenIdx + 1);
      if(after.length){
        const last = after[after.length - 1];
        if(last in VN_NUM_WORDS) result += VN_NUM_WORDS[last];
      }
    } else if(words.indexOf("mười") !== -1){
      const idx = words.indexOf("mười");
      result += 10;
      matchedAny = true;
      const after = words.slice(idx + 1);
      if(after.length){
        const last = after[after.length - 1];
        if(last in VN_NUM_WORDS) result += VN_NUM_WORDS[last];
      }
    } else if(words.length){
      const last = words[words.length - 1];
      if(last in VN_NUM_WORDS){ result += VN_NUM_WORDS[last]; matchedAny = true; }
    }
    return matchedAny ? result : null;
  }

  // Tách số tiền nói ra: ưu tiên số/biểu thức viết bằng chữ số, nếu không có thì thử đọc chữ.
  // Hỗ trợ thêm đơn vị "triệu" (vd. "một triệu hai" -> 1.200.000đ, "một triệu" -> 1.000.000đ).
  function parseSpokenAmountPlain(raw){
    let s = String(raw || "").toLowerCase().trim();
    s = s.replace(/\b(nghìn|ngàn|đồng|vnđ|vnd|k)\b/g, " ").trim();
    const compact = s.replace(/\s+/g, "");
    const direct = evalAmountExpr(compact);
    if(direct !== null && !isNaN(direct) && direct > 0) return direct;
    const worded = vietnameseWordsToNumber(s);
    return (worded === null || worded <= 0) ? null : worded;
  }
  function parseSpokenAmount(raw){
    let s = String(raw || "").toLowerCase().trim();
    if(/triệu/.test(s)){
      const parts = s.split("triệu");
      const millionsPart = parts[0].trim();
      const remainderPart = (parts[1] || "").replace(/\b(nghìn|ngàn|đồng|vnđ|vnd|k)\b/g, " ").trim();
      let millions = parseSpokenAmountPlain(millionsPart);
      if(millions === null) millions = 1; // nói tắt "triệu hai" (không nói rõ "một triệu") -> mặc định 1 triệu
      let remainder = 0;
      if(remainderPart){
        const remWords = remainderPart.split(/\s+/).filter(Boolean);
        const remVal = parseSpokenAmountPlain(remainderPart);
        if(remVal !== null){
          // nói tắt kiểu "một triệu hai" (ý là 1 triệu HAI TRĂM nghìn) -> nếu phần dư chỉ là
          // đúng 1 chữ số đơn (không kèm "trăm"/"mươi"/"nghìn") thì hiểu là hàng trăm nghìn.
          const bareDigit = remWords.length === 1 && remVal < 10;
          remainder = bareDigit ? remVal * 100 : remVal;
        }
      }
      return millions * 1000 + remainder;
    }
    return parseSpokenAmountPlain(s);
  }

  // Tách ngày nói ra: hỗ trợ "hôm nay/hôm qua/hôm kia", số viết bằng số, và số viết bằng chữ.
  function parseSpokenDay(raw){
    const s = String(raw || "").toLowerCase().trim();
    const today = new Date().getDate();
    if(/hôm nay/.test(s)) return today;
    if(/hôm qua/.test(s)) return Math.max(1, today - 1);
    if(/hôm kia/.test(s)) return Math.max(1, today - 2);
    const digitMatch = s.match(/\d+/);
    if(digitMatch) return parseInt(digitMatch[0], 10);
    const worded = vietnameseWordsToNumber(s);
    return worded;
  }

  // Tách "người thanh toán" nói ra thành đúng id danh mục hiện có (Chồng tính, Vợ tính, ...).
  function parseSpokenCategory(raw){
    const s = stripDiacritics(raw || "");
    if(!s.trim()) return "ca_nhan";
    const hasChong = /\b(chong|anh)\b/.test(s);
    const hasVo = /\b(vo|vk|em)\b/.test(s);
    const hasThieu = /thieu|no\b/.test(s);
    const hasChung = /chung/.test(s);
    if(hasThieu && hasChong) return "ck_thieu";
    if(hasThieu && hasVo) return "vk_thieu";
    if(hasChung && hasChong) return "ck_chung";
    if(hasChung && hasVo) return "vk_chung";
    if(hasChong) return "ck_tinh";
    if(hasVo) return "vk_tinh";
    return "ca_nhan";
  }

  // Tách câu nói thành các trường theo từ khoá neo, không phụ thuộc thứ tự nói.
  // Mỗi trường có nhiều từ đồng nghĩa để hiểu được cách nói tự nhiên hơn (không bắt buộc
  // đúng khuôn mẫu cứng như trước) — vd. "mua cà phê hết 20 chồng trả" giờ hiểu được luôn,
  // không cần nói đủ "tên... tiền... loại...".
  const VOICE_FIELD_KEYWORDS = {
    day: ["ngày", "hôm nay", "hôm qua", "hôm kia"],
    amount: ["tiền", "số tiền", "tiền là", "giá", "hết", "mất", "tốn"],
    name: ["tên là", "tên", "mua", "khoản"],
    payer: [
      "loại chi tiêu", "loại", "người thanh toán", "ai thanh toán", "ai trả", "ai mua", "ai tính", "danh mục",
      "chồng trả", "vợ trả", "anh trả", "em trả",
      "chồng chịu", "vợ chịu",
      "chồng tính", "vợ tính",
      "chồng thiếu", "vợ thiếu",
      "chồng nợ", "vợ nợ"
    ]
  };
  // Các từ khoá "tự đủ nghĩa" — không cần đọc phần văn bản theo sau vì bản thân từ khoá đã
  // mang đủ thông tin (vd. "hôm qua", "chồng trả"), khác với từ khoá cần đọc giá trị đi kèm
  // (vd. "ngày" cần đọc số ngày theo sau, "loại" cần đọc tên danh mục theo sau).
  const SELF_CONTAINED_KEYWORDS = {
    day: ["hôm nay", "hôm qua", "hôm kia"],
    payer: ["chồng trả","vợ trả","anh trả","em trả","chồng chịu","vợ chịu","chồng tính","vợ tính","chồng thiếu","vợ thiếu","chồng nợ","vợ nợ"]
  };
  // Từ đệm đầu câu bỏ qua khi suy luận tên khoản chi từ phần văn bản còn sót lại (dùng khi
  // người dùng không nói rõ từ "tên"/"mua"/"khoản").
  const LEADING_FILLER_WORDS = ["thêm", "cho", "tôi", "vào", "sổ", "khoản", "chi", "là", "cái", "một"];

  function firstKeywordMatch(text, keywords){
    const lower = text.toLowerCase();
    for(const kw of keywords){
      const idx = lower.indexOf(kw);
      if(idx !== -1) return { kw, idx, end: idx + kw.length };
    }
    return null;
  }
  // Cắt bỏ các khoảng [start,end) đã "dùng rồi" khỏi văn bản gốc — dùng để suy luận tên khoản
  // chi từ phần còn sót lại sau khi đã nhận diện ngày/số tiền/danh mục.
  function removeTextRanges(text, ranges){
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    let result = "", cursor = 0;
    for(const [s, e] of sorted){
      if(s > cursor) result += text.slice(cursor, s);
      cursor = Math.max(cursor, e);
    }
    result += text.slice(cursor);
    return result;
  }
  function stripLeadingFillerWords(s){
    const words = s.trim().split(/\s+/).filter(Boolean);
    while(words.length && LEADING_FILLER_WORDS.includes(words[0].toLowerCase())) words.shift();
    return words.join(" ");
  }

  function parseVoiceText(rawText){
    const text = String(rawText || "").trim();
    if(!text) return { ok:false, reason:"Không nghe được gì cả, thử lại nhé." };

    const found = {};
    for(const field in VOICE_FIELD_KEYWORDS){
      const m = firstKeywordMatch(text, VOICE_FIELD_KEYWORDS[field]);
      if(m) found[field] = m;
    }
    if(!found.amount) return { ok:false, reason:"Không nghe rõ \"số tiền\", thử nói lại (vd. \"...hết 20\", \"...giá 20\", \"...tốn 20\")." };

    const ordered = Object.keys(found)
      .map(field => ({ field, kwStart: found[field].idx, valStart: found[field].end }))
      .sort((a, b) => a.kwStart - b.kwStart);
    const segments = {};
    const spans = {};
    for(let i = 0; i < ordered.length; i++){
      const cur = ordered[i];
      const nextStart = (i + 1 < ordered.length) ? ordered[i + 1].kwStart : text.length;
      segments[cur.field] = text.slice(cur.valStart, nextStart).trim().replace(/^[:,.\s]+/, "").replace(/[.,\s]+$/, "");
      // Từ khoá tự đủ nghĩa (vd. "hôm nay") -> chỉ loại đúng phần chữ của từ khoá đó khỏi
      // văn bản dùng suy luận tên, tránh nuốt nhầm tên khoản chi nằm ngay sau nó.
      const isSelfContained = (SELF_CONTAINED_KEYWORDS[cur.field] || []).includes(found[cur.field].kw);
      spans[cur.field] = isSelfContained ? [cur.kwStart, found[cur.field].end] : [cur.kwStart, nextStart];
    }

    const amount = parseSpokenAmount(segments.amount || "");
    if(amount === null) return { ok:false, reason:"Không hiểu số tiền \"" + (segments.amount || "") + "\", thử nói rõ hơn." };

    let name = (segments.name || "").trim();
    if(!name){
      // Không nói rõ từ "tên"/"mua"/"khoản" -> suy luận tên từ phần văn bản còn lại sau khi
      // đã bỏ các đoạn ngày/số tiền/danh mục và từ đệm đầu câu.
      const consumedRanges = ["day", "amount", "payer"].filter(f => spans[f]).map(f => spans[f]);
      const leftover = removeTextRanges(text, consumedRanges).replace(/\s+/g, " ").trim();
      name = stripLeadingFillerWords(leftover).replace(/^[:,.\s]+/, "").replace(/[.,\s]+$/, "");
    }
    if(!name) return { ok:false, reason:"Không nghe rõ tên khoản chi." };

    const totalDays = daysInMonthKey(currentMonthKey);
    const daySelfContained = found.day && SELF_CONTAINED_KEYWORDS.day.includes(found.day.kw);
    const dayInput = daySelfContained ? found.day.kw : segments.day; // từ khoá tự đủ nghĩa -> đọc chính từ khoá, không đọc phần theo sau
    let day = dayInput ? parseSpokenDay(dayInput) : new Date().getDate();
    if(day === null || isNaN(day)) day = new Date().getDate();
    day = Math.max(1, Math.min(totalDays, day));

    // Dùng cả chính từ khoá neo (vd. "chồng trả") lẫn phần văn bản theo sau để suy luận danh
    // mục — với các cụm tự nhiên kiểu này, thông tin nằm ngay trong từ khoá chứ không phải
    // phần chữ theo sau nó.
    const category = parseSpokenCategory((found.payer ? found.payer.kw + " " : "") + (segments.payer || ""));

    return { ok:true, day, name, amount, category };
  }

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

  function addEntryFromVoice(parsed){
    const newEntry = {
      id: genEntryId(), day: parsed.day, name: parsed.name, amount: parsed.amount,
      amountFormula: "", category: parsed.category, note: "", updatedAt: Date.now()
    };
    entries.push(newEntry);
    commit();
    render();
    queueSync("addEntry", newEntry);

    const cat = catById[parsed.category] || catById.ca_nhan;
    const catLabel = cat.label.replace(/\s*·\s*chia\s*\d+/i, "");
    const summary = "Đã thêm: <b>" + escapeHtml(newEntry.name) + "</b> · " + money(newEntry.amount) +
      " · " + escapeHtml(catLabel) + " · Ngày " + newEntry.day;
    showVoiceToast(false, summary, () => {
      entries = entries.filter(en => en.id !== newEntry.id);
      commit();
      render();
      queueSync("deleteEntry", { id: newEntry.id });
    });
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
  }

  // ---------- Ghi âm giọng nói ----------
  const fabMicBtn = document.getElementById("fabMicBtn");
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let voiceRecognizer = null;
  let voiceListening = false;

  if(!SpeechRecognitionCtor){
    fabMicBtn.addEventListener("click", () => {
      showVoiceToast(true, "Trình duyệt này chưa hỗ trợ nhận diện giọng nói. Hãy dùng Chrome/Edge trên máy tính hoặc điện thoại Android.", null);
    });
  }else{
    voiceRecognizer = new SpeechRecognitionCtor();
    voiceRecognizer.lang = "vi-VN";
    voiceRecognizer.continuous = false;
    voiceRecognizer.interimResults = false;
    voiceRecognizer.maxAlternatives = 1;

    function setListening(on){
      voiceListening = on;
      fabMicBtn.classList.toggle("listening", on);
    }

    voiceRecognizer.addEventListener("start", () => setListening(true));
    voiceRecognizer.addEventListener("end", () => setListening(false));
    voiceRecognizer.addEventListener("error", (e) => {
      setListening(false);
      const msgs = {
        "not-allowed": "Bạn chưa cho phép dùng micro. Vào cài đặt trình duyệt để cấp quyền micro cho trang này.",
        "no-speech": "Không nghe thấy giọng nói, thử lại nhé.",
        "audio-capture": "Không tìm thấy micro trên thiết bị này.",
        "network": "Lỗi mạng khi nhận diện giọng nói, thử lại."
      };
      showVoiceToast(true, msgs[e.error] || ("Lỗi nhận diện giọng nói: " + e.error), null);
    });
    voiceRecognizer.addEventListener("result", (e) => {
      const transcript = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : "";
      const parsed = parseVoiceText(transcript);
      if(!parsed.ok){
        showVoiceToast(true, (parsed.reason || "Không hiểu câu vừa nói.") + (transcript ? ' <span style="color:var(--text-faint)">— nghe được: "' + escapeHtml(transcript) + '"</span>' : ""), null);
        return;
      }
      addEntryFromVoice(parsed);
    });

    fabMicBtn.addEventListener("click", () => {
      if(voiceListening){
        voiceRecognizer.stop();
        return;
      }
      hideVoiceToast();
      try{
        voiceRecognizer.start();
      }catch(err){
        showVoiceToast(true, "Không khởi động được micro: " + err.message, null);
      }
    });
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
    let longPressTimer = null, longPressRow = null;

    function armLongPress(wrap, row){
      disarmLongPress();
      longPressRow = row;
      if(row) row.classList.add("long-press-armed");
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if(row) row.classList.remove("long-press-armed");
        if(navigator.vibrate) navigator.vibrate(12);
        // Đã "chốt" thao tác nhấn giữ -> bỏ theo dõi kéo/vuốt của cử chỉ này luôn,
        // tránh việc tay còn đang chạm bàn phím cảm ứng làm hàng bị kéo lệch dưới popup.
        activeRow = null; activeWrap = null; axisLocked = null;
        openDuplicateConfirm(wrap.getAttribute("data-id"));
      }, LEDGER_LONGPRESS_MS);
    }
    function disarmLongPress(){
      if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
      if(longPressRow){ longPressRow.classList.remove("long-press-armed"); longPressRow = null; }
    }

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

  const XLSX_HEADER = ["Ngày", "Tên khoản chi", "Số tiền (nghìn đ)", "Danh mục", "ID", "Cập nhật lúc (ms)", "Ghi chú", "Công thức"];
  const XLSX_AMOUNT_FMT = '#,##0" đ"';
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
  function openExportModal(){
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

  // Dựng 1 sheet cho 1 tháng: dữ liệu đã lọc + khối "Tổng theo danh mục" (A2) + khối "Cân bằng
  // Chồng/Vợ" (A5), dùng công thức Excel thật (SUMIF/SUM) tham chiếu đúng vùng dữ liệu — công thức
  // chia 2 / chia 3 / trừ "thiếu" lấy đúng theo computeBalance() app đang dùng ở màn hình chính, nên
  // mở file lên số dư luôn khớp với app. (A4: định dạng số tiền, đóng băng dòng đầu, auto-filter.)
  function buildMonthSheet(monthKey, selectedCatIds, dayFrom, dayTo){
    const rawEntries = (monthsData[monthKey] || []).filter(e => {
      if(!selectedCatIds.has(e.category)) return false;
      const d = Number(e.day);
      if(dayFrom !== null && d < dayFrom) return false;
      if(dayTo !== null && d > dayTo) return false;
      return true;
    }).slice().sort((a,b) => (Number(a.day)||0) - (Number(b.day)||0));

    const N = rawEntries.length;
    const dataRows = rawEntries.map(e => [e.day, e.name, e.amount, e.category, e.id, e.updatedAt || 0, e.note || "", e.amountFormula || ""]);
    const aoa = [XLSX_HEADER].concat(dataRows);

    const dataFirstRow = 2;
    const dataLastRow = Math.max(dataFirstRow, 1 + N);
    const dataRangeAmt = "C" + dataFirstRow + ":C" + dataLastRow;
    const dataRangeCat = "D" + dataFirstRow + ":D" + dataLastRow;

    // ---- A2: khối "Tổng theo danh mục" ----
    aoa.push([]);
    aoa.push(["── TỔNG THEO DANH MỤC ──"]);
    aoa.push(["Danh mục", "", "Tổng tiền", "Mỗi người (nếu có chia)"]);
    const catTotalRow = {}; // catId -> số dòng chứa tổng của danh mục đó (dùng lại cho khối cân bằng bên dưới)
    CATS.forEach(c => {
      if(!selectedCatIds.has(c.id)) return; // danh mục bị lọc bỏ thì không liệt kê
      catTotalRow[c.id] = aoa.length + 1;
      const emoji = CAT_EMOJI[c.id] ? CAT_EMOJI[c.id] + " " : "";
      aoa.push([emoji + c.label.replace(/\s*·\s*chia\s*\d+/i, ""), "", 0, ""]);
    });
    const totalRowNum = aoa.length + 1;
    aoa.push(["TỔNG CỘNG THÁNG", "", 0, ""]);

    // ---- A5: khối "Cân bằng Chồng / Vợ" — đúng công thức computeBalance() của app ----
    let balanceRows = null;
    const canHalf = !!(catTotalRow.ck_tinh && catTotalRow.vk_tinh);
    const canDebt = !!(catTotalRow.ck_thieu && catTotalRow.vk_thieu);
    const canThird = !!(catTotalRow.ck_chung && catTotalRow.vk_chung);
    if(canHalf || canDebt || canThird){
      aoa.push([]);
      aoa.push(["── CÂN BẰNG CHỒNG / VỢ ──"]);
      aoa.push(["Hạng mục", "", "Số tiền", ""]);
      balanceRows = {};
      if(canHalf){ balanceRows.halfRow = aoa.length + 1; aoa.push(["Chồng tính · chia 2  −  Vợ tính · chia 2  (÷2)", "", 0, ""]); }
      if(canDebt){ balanceRows.debtRow = aoa.length + 1; aoa.push(["Vợ thiếu  −  Chồng thiếu", "", 0, ""]); }
      if(canThird){ balanceRows.thirdRow = aoa.length + 1; aoa.push(["Chồng tính chung · chia 3  −  Vợ tính chung · chia 3  (÷3)", "", 0, ""]); }
      balanceRows.netRow = aoa.length + 1;
      aoa.push(["=> Số dư (dương = Vợ nợ Chồng · âm = Chồng nợ Vợ)", "", 0, ""]);
    } else if(Object.keys(catTotalRow).length > 0){
      aoa.push([]);
      aoa.push(["(Đã lọc bỏ hết danh mục liên quan nên không tính được Cân bằng Chồng/Vợ.)"]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    function setFormula(row, col, formula){
      ws[col + row] = { t: "n", f: formula, z: XLSX_AMOUNT_FMT };
    }
    if(N > 0){
      for(let r = dataFirstRow; r <= dataLastRow; r++){
        const ref = "C" + r;
        if(ws[ref]) ws[ref].z = XLSX_AMOUNT_FMT;
      }
    }
    CATS.forEach(c => {
      const rowNum = catTotalRow[c.id];
      if(!rowNum) return;
      setFormula(rowNum, "C", N > 0 ? 'SUMIF(' + dataRangeCat + ',"' + c.id + '",' + dataRangeAmt + ')' : "0");
      const m = c.label.match(/chia\s*(\d+)/i);
      if(m) setFormula(rowNum, "D", "C" + rowNum + "/" + m[1]);
    });
    setFormula(totalRowNum, "C", N > 0 ? "SUM(" + dataRangeAmt + ")" : "0");
    if(balanceRows){
      if(balanceRows.halfRow) setFormula(balanceRows.halfRow, "C", "(C" + catTotalRow.ck_tinh + "-C" + catTotalRow.vk_tinh + ")/2");
      if(balanceRows.debtRow) setFormula(balanceRows.debtRow, "C", "(C" + catTotalRow.vk_thieu + "-C" + catTotalRow.ck_thieu + ")");
      if(balanceRows.thirdRow) setFormula(balanceRows.thirdRow, "C", "(C" + catTotalRow.ck_chung + "-C" + catTotalRow.vk_chung + ")/3");
      const parts = [];
      if(balanceRows.halfRow) parts.push("C" + balanceRows.halfRow);
      if(balanceRows.debtRow) parts.push("C" + balanceRows.debtRow);
      if(balanceRows.thirdRow) parts.push("C" + balanceRows.thirdRow);
      setFormula(balanceRows.netRow, "C", parts.join("+"));
    }

    // ---- A4: cột rộng vừa nội dung, đóng băng dòng tiêu đề, bật auto-filter cho vùng dữ liệu ----
    ws["!cols"] = [{wch:6},{wch:28},{wch:14},{wch:14},{wch:18},{wch:16},{wch:34},{wch:16}];
    ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };
    if(N > 0) ws["!autofilter"] = { ref: "A1:H" + dataLastRow };
    return ws;
  }

  document.getElementById("exportConfirmBtn").addEventListener("click", () => {
    try{
      const selectedMonths = Array.from(exportMonthList.querySelectorAll(".export-chip.active")).map(c => c.dataset.value);
      const selectedCats = new Set(Array.from(exportCatList.querySelectorAll(".export-chip.active")).map(c => c.dataset.value));
      if(selectedMonths.length === 0){ showNotice("Chọn ít nhất 1 tháng để xuất file."); return; }
      if(selectedCats.size === 0){ showNotice("Chọn ít nhất 1 danh mục để xuất file."); return; }
      let dayFrom = exportDayFrom.value.trim() === "" ? null : Math.max(1, Math.min(31, Number(exportDayFrom.value)));
      let dayTo = exportDayTo.value.trim() === "" ? null : Math.max(1, Math.min(31, Number(exportDayTo.value)));
      if(dayFrom !== null && dayTo !== null && dayFrom > dayTo){ const tmp = dayFrom; dayFrom = dayTo; dayTo = tmp; }

      const wb = XLSX.utils.book_new();
      selectedMonths.slice().sort().forEach(monthKey => {
        const ws = buildMonthSheet(monthKey, selectedCats, dayFrom, dayTo);
        // Tên sheet Excel tối đa 31 ký tự, không chứa : \ / ? * [ ] — mã tháng "2026-07" luôn an toàn.
        XLSX.utils.book_append_sheet(wb, ws, monthKey.slice(0, 31));
      });
      const stamp = new Date().toISOString().slice(0,10);
      XLSX.writeFile(wb, "so-chi-tieu-" + stamp + ".xlsx");
      closeExportModal();
    }catch(err){ showErrorBanner("export: " + err.message); }
  });

  // ---------- Nhập từ Excel (B) ----------
  const importFileInput = document.getElementById("importFileInput");
  document.getElementById("importBtn").addEventListener("click", () => {
    closeMenuPanel();
    // Mở hộp chọn file ngay (trình duyệt chỉ cho phép ngay trong thao tác bấm), đồng thời nạp thư viện Excel ngầm.
    loadXlsx().catch(() => {});
    importFileInput.click();
  });

  // Nhận diện các dòng "TỔNG THEO DANH MỤC" / "CÂN BẰNG CHỒNG VỢ" mà chính app tự thêm vào cuối mỗi
  // sheet khi Xuất dữ liệu (xem buildMonthSheet) — để lỡ người dùng nhập lại đúng file vừa xuất ra thì
  // các dòng tổng đó không bị tính nhầm thành "dòng lỗi", chỉ đơn giản được bỏ qua trong im lặng.
  function isSummaryMarkerRow(row){
    const a = String((row && row[0]) || "").trim();
    if(a.startsWith("──") || a === "TỔNG CỘNG THÁNG" || a === "Danh mục" || a === "Hạng mục" || /^=>/.test(a)) return true;
    // Các dòng con trong khối tổng (vd. "🔵 Chồng tính", "Vợ thiếu − Chồng thiếu"...) để nhãn ở cột
    // Ngày thay vì số, và luôn bỏ trống cột Tên khoản chi — dùng đặc điểm này để nhận diện chung,
    // không cần liệt kê hết từng nhãn danh mục có thể xuất hiện.
    const dayNum = Number(row && row[0]);
    const hasName = String((row && row[1]) || "").trim() !== "";
    if(!hasName && a !== "" && !(Number.isFinite(dayNum) && dayNum >= 1 && dayNum <= 31)) return true;
    return false;
  }

  const importPreviewOverlay = document.getElementById("importPreviewOverlay");
  const importMonthList = document.getElementById("importMonthList");
  const importMonthToggleAll = document.getElementById("importMonthToggleAll");
  const importModeWarning = document.getElementById("importModeWarning");
  const importModeBtns = Array.from(document.querySelectorAll(".import-mode-btn"));
  let importPreviewMode = "overwrite"; // "overwrite" | "merge"
  let importPreviewData = null; // { parsedMonths, stats } — chờ người dùng xác nhận ở popup xem trước

  function importModeWarningText(mode){
    return mode === "merge"
      ? "Gộp thêm: giữ nguyên các khoản chi hiện có, chỉ THÊM khoản mới hoặc CẬP NHẬT khoản trùng ID lấy từ file — không xoá khoản chi nào đang có sẵn."
      : "Ghi đè hoàn toàn: THAY THẾ toàn bộ dữ liệu hiện có (cả trên Google Sheet) của các tháng được chọn bằng đúng nội dung trong file. Không thể hoàn tác.";
  }
  function setImportMode(mode){
    importPreviewMode = mode;
    importModeBtns.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    importModeWarning.textContent = importModeWarningText(mode);
    importModeWarning.classList.toggle("mode-merge", mode === "merge");
  }
  importModeBtns.forEach(b => b.addEventListener("click", () => setImportMode(b.dataset.mode)));

  function buildImportMonthRow(monthKey, stat){
    const row = document.createElement("label");
    row.className = "import-month-row";
    const existingCount = (monthsData[monthKey] || []).length;
    const bits = [stat.valid + " khoản chi"];
    if(stat.skipped > 0) bits.push('<span class="warn">bỏ qua ' + stat.skipped + ' dòng thiếu tên</span>');
    if(existingCount > 0) bits.push("app đang có sẵn " + existingCount + " khoản");
    row.innerHTML =
      '<input type="checkbox" checked data-month="' + monthKey + '" />' +
      '<span class="import-month-name">' + escapeHtml(monthKey) + '</span>' +
      '<span class="import-month-stats">' + bits.join(" · ") + '</span>';
    return row;
  }
  function refreshImportToggleAllLabel(){
    const boxes = importMonthList.querySelectorAll("input[type=checkbox]");
    const allChecked = boxes.length > 0 && Array.from(boxes).every(b => b.checked);
    importMonthToggleAll.textContent = allChecked ? "Bỏ chọn tất cả" : "Chọn tất cả";
  }
  importMonthList.addEventListener("change", (e) => {
    if(e.target && e.target.matches("input[type=checkbox]")) refreshImportToggleAllLabel();
  });
  importMonthToggleAll.addEventListener("click", () => {
    const boxes = Array.from(importMonthList.querySelectorAll("input[type=checkbox]"));
    if(boxes.length === 0) return;
    const allChecked = boxes.every(b => b.checked);
    boxes.forEach(b => { b.checked = !allChecked; });
    refreshImportToggleAllLabel();
  });

  function openImportPreview(parsedMonths, stats){
    importPreviewData = { parsedMonths, stats };
    setImportMode("overwrite");
    importMonthList.innerHTML = "";
    Object.keys(parsedMonths).sort().reverse().forEach(monthKey => {
      importMonthList.appendChild(buildImportMonthRow(monthKey, stats[monthKey]));
    });
    refreshImportToggleAllLabel();
    importPreviewOverlay.classList.add("show");
    pauseParticleBg();
  }
  function closeImportPreview(){
    importPreviewOverlay.classList.remove("show");
    importPreviewData = null;
    resumeParticleBg();
  }
  document.getElementById("importPreviewClose").addEventListener("click", closeImportPreview);
  document.getElementById("importPreviewCancel").addEventListener("click", closeImportPreview);
  importPreviewOverlay.addEventListener("click", (e) => { if(e.target === importPreviewOverlay) closeImportPreview(); });

  // Gộp dữ liệu cũ + dữ liệu nhập theo ID: ID trùng -> lấy bản trong file; ID mới -> thêm vào;
  // khoản chi cũ không có trong file (ID không trùng) -> giữ nguyên, không bị xoá.
  function mergeMonthEntries(existing, imported){
    const byId = new Map((existing || []).map(e => [e.id, e]));
    (imported || []).forEach(imp => byId.set(imp.id, imp));
    return Array.from(byId.values());
  }

  document.getElementById("importPreviewConfirm").addEventListener("click", () => {
    if(!importPreviewData) return;
    const checkedBoxes = Array.from(importMonthList.querySelectorAll("input[type=checkbox]:checked"));
    if(checkedBoxes.length === 0){ showNotice("Chọn ít nhất 1 tháng để nhập."); return; }
    const selectedMonths = checkedBoxes.map(b => b.dataset.month);
    const mode = importPreviewMode;
    const { parsedMonths, stats } = importPreviewData;

    const monthsToApply = {};
    selectedMonths.forEach(monthKey => {
      monthsToApply[monthKey] = mode === "merge"
        ? mergeMonthEntries(monthsData[monthKey], parsedMonths[monthKey])
        : parsedMonths[monthKey].slice();
    });

    monthsData = Object.assign({}, monthsData, monthsToApply);
    currentMonthKey = selectedMonths.slice().sort().reverse()[0];
    entries = monthsData[currentMonthKey] || [];
    saveCache();
    renderMonthUI();
    render();

    const totalEntries = selectedMonths.reduce((sum, k) => sum + (parsedMonths[k] ? parsedMonths[k].length : 0), 0);
    const totalSkipped = selectedMonths.reduce((sum, k) => sum + ((stats[k] && stats[k].skipped) || 0), 0);
    const modeLabel = mode === "merge" ? "gộp thêm" : "ghi đè";
    closeImportPreview();

    if(SHEET_SYNC_URL){
      setSyncStatus("Đang đẩy dữ liệu nhập lên Google Sheet…", false);
      pushFullMonths(monthsToApply).then(result => {
        const summary =
          "Đã nhập (" + modeLabel + "): <b>" + totalEntries + " khoản chi</b> cho " + selectedMonths.length + " tháng" +
          (totalSkipped > 0 ? " · bỏ qua " + totalSkipped + " dòng thiếu tên" : "") +
          (result.failed.length > 0
            ? ' · <span style="color:#e0455a">chưa gửi lên Sheet được ' + result.failed.length + ' tháng (xem dòng trạng thái, app sẽ tự thử lại)</span>'
            : " · đã đồng bộ Sheet xong");
        showVoiceToast(result.failed.length > 0, summary);
      });
    } else {
      showNotice("Chưa cấu hình Google Sheet — dữ liệu nhập chỉ được lưu tạm ở máy này, không có bản chính thức trên Sheet.");
      showVoiceToast(false,
        "Đã nhập (" + modeLabel + "): <b>" + totalEntries + " khoản chi</b> cho " + selectedMonths.length + " tháng (chỉ lưu tạm ở máy này)" +
        (totalSkipped > 0 ? " · bỏ qua " + totalSkipped + " dòng thiếu tên" : "")
      );
    }
  });

  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files && importFileInput.files[0];
    importFileInput.value = "";
    if(!file) return;
    try{ await loadXlsx(); }
    catch(err){ showNotice(EXCEL_LOAD_ERROR); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
        const parsedMonths = {};
        const stats = {};
        wb.SheetNames.forEach(sheetName => {
          const monthKey = sheetName.trim();
          if(!/^\d{4}-\d{2}$/.test(monthKey)) return; // bỏ qua sheet không đúng dạng "YYYY-MM"
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
          const dataRows = rows.slice(1) // bỏ dòng tiêu đề
            .filter(row => row && row.length && row.some(v => String(v).trim() !== "")) // bỏ dòng trống hoàn toàn
            .filter(row => !isSummaryMarkerRow(row)); // bỏ khối "Tổng theo danh mục"/"Cân bằng" tự thêm khi Xuất
          const entriesForMonth = dataRows
            .filter(row => String(row[1] || "").trim() !== "") // phải có "Tên khoản chi"
            .map((row, i) => ({
              day: Number(row[0]) || 1,
              name: String(row[1] || "").trim(),
              amount: Number(row[2]) || 0,
              category: String(row[3] || "ca_nhan").trim() || "ca_nhan",
              id: String(row[4] || "").trim() || genEntryId(),
              updatedAt: Number(row[5]) || Date.now(),
              note: String(row[6] || "").trim(),
              amountFormula: String(row[7] || "").trim()
            }));
          parsedMonths[monthKey] = entriesForMonth;
          stats[monthKey] = { valid: entriesForMonth.length, skipped: dataRows.length - entriesForMonth.length };
        });

        const monthCount = Object.keys(parsedMonths).length;
        if(monthCount === 0){
          openConfirm("File không hợp lệ", "Không tìm thấy sheet nào đúng định dạng tên tháng \"YYYY-MM\" (ví dụ \"2026-07\") trong file này.", "Đã hiểu", true, () => {});
          return;
        }
        openImportPreview(parsedMonths, stats);
      }catch(err){ showErrorBanner("import: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  });

  document.getElementById("syncNowBtn").addEventListener("click", () => {
    closeMenuPanel();
    // Gửi nốt thay đổi còn chờ rồi tải bản mới nhất của tháng đang xem. Thay đổi chưa lên Sheet luôn được giữ lại
    // trên màn hình, nên không cần hộp xác nhận nữa.
    retryAttempt = 0;
    pullMonth(currentMonthKey, { manual: true });
  });

  document.getElementById("autoPullToggle").addEventListener("click", () => {
    const next = !getAutoPull();
    setAutoPull(next);
    flashSyncStatus(next ? "Đã BẬT tự động tải bản mới khi mở/quay lại app" : "Đã TẮT tự động tải bản mới", 3000);
    if(next && SHEET_SYNC_URL) pullMonth(currentMonthKey);
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
  // Xoá cả trên Sheet là thao tác không hoàn tác được -> bấm 2 lần (lần 1 chỉ đổi nhãn, tự hoàn lại sau 4 giây).
  deleteMonthSheetBtn.addEventListener("click", () => {
    const key = deleteMonthKey;
    if(!key) return;
    if(!deleteMonthSheetBtn.classList.contains("armed")){
      deleteMonthSheetBtn.classList.add("armed");
      document.getElementById("deleteMonthSheetTitle").textContent = "Bấm lần nữa để xoá vĩnh viễn";
      deleteArmTimer = setTimeout(disarmSheetDelete, 4000);
      return;
    }
    closeDeleteMonth();
    removeMonthLocally(key);
    // Lệnh xoá đi qua hàng đợi chung: bỏ các thay đổi chưa gửi của tháng này, gửi đúng thứ tự, mất mạng thì tự thử lại.
    queueDeleteMonth(key);
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
  function monthLoadError(text){
    monthLoadList.innerHTML = '<p class="devices-empty">' + escapeHtml(text) + '</p><button type="button" class="mini-btn" id="monthLoadRetry">Thử lại</button>';
    updateMonthLoadButtons();
  }
  async function loadSheetMonths(){
    setMonthLoadMsg("");
    if(!SHEET_SYNC_URL){
      monthLoadList.innerHTML = '<p class="devices-empty">Chưa bật đồng bộ Google Sheet nên chưa có danh sách tháng trên Sheet. Bạn vẫn tạo được tháng mới ở bên dưới.</p>';
      updateMonthLoadButtons();
      return;
    }
    monthLoadList.innerHTML = '<p class="devices-empty">Đang lấy danh sách tháng từ Google Sheet…</p>';
    updateMonthLoadButtons();
    try{
      // Qua khoá đồng bộ: gửi nốt thay đổi còn chờ (vd. lệnh xoá tháng) trước, để danh sách phản ánh đúng Sheet.
      const data = await withSyncLock(async () => {
        await drainQueue();
        return sheetRequest({ action: "listMonths" });
      });
      sheetMonths = (data.months || []).filter((m) => m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.monthKey));
      renderMonthLoadList();
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
        const cb = monthLoadList.querySelector('input[data-month="' + k + '"]');
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

  document.getElementById("balanceSpotlight").addEventListener("click", () => {
    const btn = document.getElementById("balanceSpotlight");
    const isOpen = document.getElementById("infoBox").classList.toggle("show");
    btn.classList.toggle("open", isOpen);
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
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
  document.getElementById("ledgerSearch").addEventListener("input", (e) => {
    clearTimeout(ledgerSearchTimer);
    const val = e.target.value;
    ledgerSearchTimer = setTimeout(() => { ledgerFilterText = val; renderLedger(); }, 150);
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
  document.getElementById("ledgerFilterClear").addEventListener("click", () => {
    ledgerFilterText = "";
    ledgerFilterCat = "";
    ledgerFilterDay = "";
    document.getElementById("ledgerSearch").value = "";
    ledgerCatFilterEl.value = "";
    setLedgerCatTrigger("");
    buildLedgerCatList("");
    document.getElementById("ledgerDayTriggerLabel").textContent = "Tất cả ngày";
    buildDayCalendar(currentMonthKey, null, "ledgerDayGrid", "ledgerDayPanelTitle");
    renderLedger();
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

  // ---------- Init ----------
  initGoogleSignIn();
})();

// ================== Đồng hồ HUD trên header ==================
// Tự chạy độc lập, không đụng vào state/logic sổ chi tiêu — chỉ cập nhật đúng 1 dòng
// chữ mỗi giây (rất nhẹ, không cần dừng khi tab ẩn như hiệu ứng particle).
(() => {
  const timeEl = document.getElementById("hudClockTime");
  if(!timeEl) return;
  function pad2(n){ return String(n).padStart(2, "0"); }
  function tick(){
    const now = new Date();
    timeEl.textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes()) + ":" + pad2(now.getSeconds());
  }
  tick();
  setInterval(tick, 1000);
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
      versionText = "Phiên bản " + e.data.version + " · bấm để kiểm tra";
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
