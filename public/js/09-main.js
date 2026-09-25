// ---- Sidebar navigation ----

const pages = {
  home: document.getElementById("page-home"),
  backlog: document.getElementById("page-backlog"),
  team: document.getElementById("page-team"),
  cskh: document.getElementById("page-cskh"),
  roadmap: document.getElementById("page-roadmap"),
  config: document.getElementById("page-config"),
  "feature-requests": document.getElementById("page-feature-requests"),
  "action-logs": document.getElementById("page-action-logs"),
  hdsd: document.getElementById("page-hdsd"),
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(pages).forEach(([key, section]) => {
      section.hidden = key !== btn.dataset.page;
    });
    if (btn.dataset.page === "roadmap") loadRoadmap().catch((err) => showToast(err.message));
    // Tải lại Nhân sự (kèm KPI theo task) mỗi lần vào lại trang Team & Nhân
    // sự — tránh hiển thị dữ liệu cũ nếu vừa sửa Phân loại/Tỷ lệ đóng góp ở
    // popup "Nhân sự tham gia" bên trang Backlog (2 trang khác nhau, không
    // tự đồng bộ state cho nhau).
    if (btn.dataset.page === "team") loadMembers().catch((err) => showToast(err.message));
    // Tải lại Backlog mỗi lần vào trang — tránh hiển thị dữ liệu cũ
    // (state.tasksAll cache từ lần xem trước) nếu vừa "Đưa vào Backlog" 1
    // task mới từ trang Yêu cầu tính năng (2 trang khác nhau, không tự
    // đồng bộ state cho nhau — giống lý do loadMembers() ở trang "team").
    if (btn.dataset.page === "backlog") loadTasks().catch((err) => showToast(err.message));
    // Yêu cầu tính năng — hộp thư dùng chung, tải lại mỗi lần vào trang để
    // thấy ngay yêu cầu mới từ phòng ban khác.
    if (btn.dataset.page === "feature-requests") loadFeatureRequests().catch((err) => showToast(err.message));
    // Nhật ký hoạt động — tải danh mục lọc (module/user) + dữ liệu mỗi lần
    // vào trang để thấy log mới nhất, chưa tải sẵn lúc khởi động app (chỉ
    // Admin dùng, tránh gọi API thừa cho editor/viewer).
    if (btn.dataset.page === "action-logs") {
      Promise.all([loadActionLogModules(), loadActionLogUsers(), loadActionLogs()]).catch((err) =>
        showToast(err.message),
      );
    }
    // HDSD — nạp NỘI DUNG (không phải iframe — bị chặn bởi
    // Content-Security-Policy frame-src của chính app) trực tiếp vào trang
    // hiện tại ở LẦN ĐẦU bấm vào mục này. Xem loadHdsdContent() bên dưới.
    if (btn.dataset.page === "hdsd") {
      loadHdsdContent().catch((err) => showToast(err.message));
    }
  });
});

// public/huong-dan-su-dung.html có <style>/<link> RIÊNG (font, biến màu,
// tên class) — nếu chèn thẳng vào <head> của trang chính, các selector
// tổng quát trong đó (body, a, p, table, th, td...) sẽ ĐÈ LÊN style của
// TOÀN BỘ app, không chỉ trang HDSD. Cô lập bằng Shadow DOM (attachShadow)
// — CSS/DOM bên trong hoàn toàn tách biệt 2 chiều với trang chính.
let hdsdLoaded = false;
async function loadHdsdContent() {
  if (hdsdLoaded) return;
  const root = document.getElementById("hdsd-root");
  if (!root) return;
  const res = await fetch("huong-dan-su-dung.html");
  if (!res.ok) throw new Error("Không tải được nội dung hướng dẫn.");
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const linkTag = doc.querySelector('link[rel="stylesheet"]')?.outerHTML ?? "";
  // ":root" trong 1 stylesheet gắn ở shadow tree KHÔNG khớp gì cả (":root"
  // luôn chỉ <html> của document gốc, nằm ngoài shadow tree) — biến CSS
  // (--paper, --ink, --accent...) sẽ không bao giờ được định nghĩa, toàn bộ
  // màu sắc vỡ hết. Đổi thành ":host" (đúng cách khai báo biến CSS dùng
  // trong đúng shadow tree này).
  const styleTag = (doc.querySelector("style")?.textContent ?? "").replace(/:root/g, ":host");
  const shadow = root.shadowRoot ?? root.attachShadow({ mode: "open" });
  shadow.innerHTML = `${linkTag}<style>${styleTag}</style>${doc.body.innerHTML}`;
  // Dải tab ngang ở đầu trang (kiểu chrome-tabs chung của app) — bấm 1 tab
  // thì hiện đúng section đó, ẩn các section còn lại.
  function showHdsdPanel(id) {
    shadow.querySelectorAll(".doc-section").forEach((sec) => {
      sec.hidden = sec.id !== id;
    });
    shadow.querySelectorAll(".hdsd-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.panel === id);
    });
  }
  shadow.addEventListener("click", (e) => {
    const tab = e.target.closest(".hdsd-tab");
    if (tab) {
      showHdsdPanel(tab.dataset.panel);
      return;
    }
    // Link tham chiếu chéo trong nội dung (VD "xem Phòng ban") trỏ tới 1
    // section khác đang ẩn (không phải tab đang mở) — phải BẬT đúng tab đó
    // trước rồi mới cuộn tới, không thì cuộn tới 1 phần tử đang hidden.
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const target = shadow.getElementById(a.getAttribute("href").slice(1));
    if (!target) return;
    const panel = target.classList.contains("doc-section") ? target : target.closest(".doc-section");
    if (panel) showHdsdPanel(panel.id);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  hdsdLoaded = true;
}

// ---- Init & Auth ----

async function checkAuth() {
  try {
    const res = await fetch("/auth/me");
    if (!res.ok) return;
    const data = await res.json();
    state.currentUserId = data.userId ?? null; // id cục bộ (bảng users) — dùng để tự nhận "chính mình" ở Quản lý User
    if (data.scope) state.userScope = data.scope;

    // Gắn role lên <body> để CSS tự ẩn nút Thêm/Sửa/Xóa mà role hiện tại
    // chắc chắn không có quyền (xem style.css — cuối file). Chỉ gắn khi SSO
    // bật; SSO tắt (dev/test) thì không có data-role, CSS không match gì,
    // mọi thứ hiện như cũ (không phân quyền UI khi không có SSO).
    if (data.ssoEnabled && data.role) {
      document.body.dataset.role = data.role;
    } else {
      delete document.body.dataset.role;
    }

    // Mục "Quản lý User", "Cấu hình" và "Nhật ký hoạt động" chỉ Admin thấy
    // được (xem tài liệu nghiệp vụ Phân quyền — cả editor lẫn viewer đều
    // không vào được các màn này; Nhật ký hoạt động còn lộ hành động của
    // MỌI phòng ban khác, không riêng phòng của người xem, nên siết chặt
    // như Cấu hình). Tắt SSO (dev/test, không có khái niệm role) thì hiện
    // sẵn cho tiện làm việc — giống các phần khác của app vốn không phân
    // quyền gì khi SSO tắt.
    const usersPill = document.getElementById("config-users-pill");
    if (usersPill) usersPill.hidden = data.ssoEnabled && data.role !== "admin";
    const configNav = document.querySelector('.nav-item[data-page="config"]');
    if (configNav) configNav.hidden = data.ssoEnabled && data.role !== "admin";
    const actionLogNav = document.querySelector('.nav-item[data-page="action-logs"]');
    if (actionLogNav) actionLogNav.hidden = data.ssoEnabled && data.role !== "admin";

    if (data.ssoEnabled) {
      if (!data.authenticated) {
        window.location.href = "/auth/login";
        return;
      }
      const sidebarUser = document.getElementById("sidebar-user");
      const userName = document.getElementById("user-name");
      const userEmail = document.getElementById("user-email");
      if (sidebarUser && data.user) {
        sidebarUser.style.display = "flex";
        if (userName) userName.textContent = data.user.name || data.user.username;
        if (userEmail) {
          const roleLabel = USER_ROLE_LABELS[data.role] ?? "";
          userEmail.textContent = roleLabel ? `${data.user.email || data.user.username} · ${roleLabel}` : (data.user.email || data.user.username);
        }
      }
    }
  } catch (err) {
    console.warn("Auth check error:", err);
  }
}

(async function init() {
  // Phải đợi checkAuth() xong (biết state.userScope) TRƯỚC khi loadDepartments()
  // — loadDepartments() cần userScope để khoá đúng phòng ban ngay từ lần vẽ
  // đầu tiên, tránh nháy hiện switcher mở rồi mới khoá lại.
  await checkAuth();
  const now = today();
  el.newYear.value = now.getFullYear();
  el.newMonth.value = now.getMonth() + 1;
  // Phòng ban phải nạp trước loadPeriods() vì loadTeams/loadMembers phụ thuộc
  // state.currentDepartmentId.
  loadDepartments()
    .then(() =>
      Promise.all([
        loadPeriods(),
        loadIncidents(),
        loadTickets(),
        loadCreationRates(),
        loadCriteria(),
        loadRanking(),
        loadTags(),
        loadCategory(),
        loadGroup(),
        loadPosition(),
        loadDepartmentConfig(),
        loadSystem(),
        loadObjective(),
        loadMemberParticipation(),
        loadRoadmap(),
        refreshFeatureRequestNavBadge(),
      ]),
    )
    .catch((err) => showToast(err.message));
})();
