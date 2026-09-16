// ---- Sidebar navigation ----

const pages = {
  home: document.getElementById("page-home"),
  backlog: document.getElementById("page-backlog"),
  team: document.getElementById("page-team"),
  cskh: document.getElementById("page-cskh"),
  roadmap: document.getElementById("page-roadmap"),
  config: document.getElementById("page-config"),
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(pages).forEach(([key, section]) => {
      section.hidden = key !== btn.dataset.page;
    });
    if (btn.dataset.page === "roadmap") loadRoadmap().catch((err) => showToast(err.message));
  });
});

// ---- Init & Auth ----

async function checkAuth() {
  try {
    const res = await fetch("/auth/me");
    if (!res.ok) return;
    const data = await res.json();
    state.currentUserId = data.userId ?? null; // id cục bộ (bảng users) — dùng để tự nhận "chính mình" ở Quản lý User

    // Mục "Quản lý User" chỉ Admin thấy được. Tắt SSO (dev/test, không có
    // khái niệm role) thì hiện sẵn cho tiện làm việc — giống các phần khác
    // của app vốn không phân quyền gì khi SSO tắt.
    const usersPill = document.getElementById("config-users-pill");
    if (usersPill) usersPill.hidden = data.ssoEnabled && data.role !== "admin";

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

(function init() {
  checkAuth();
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
      ]),
    )
    .catch((err) => showToast(err.message));
})();
