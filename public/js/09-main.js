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
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Mục "HDSD" là link mở tài liệu ở tab mới (thẻ <a target="_blank">,
    // không có data-page) — không thuộc bộ chuyển trang trong SPA này, bỏ
    // qua để không lỡ ẩn hết mọi trang đang xem ở tab hiện tại.
    if (!btn.dataset.page) return;
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
  });
});

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
