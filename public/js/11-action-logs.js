// ---- Nhật ký hoạt động (Action Log) — chỉ Admin xem được (nav-item ẩn với
// role khác ở checkAuth(), server cũng chặn riêng bằng requireAdmin ở
// "/api/action-logs", xem app.ts). Ghi log tự động ở server (mọi request
// ghi tới /api — xem actionLog.middleware.ts + đăng nhập/đăng xuất ở
// auth.controller.ts), trang này CHỈ đọc/lọc, không có thao tác ghi nào.
// Lọc THEO SERVER (query params) chứ không lọc client-side như Yêu cầu
// tính năng — dữ liệu có thể nhiều, server đã tự giới hạn 90 ngày gần
// nhất + tối đa 2000 dòng khi không lọc ngày (xem actionLog.service.ts).

const AL_ACTION_BADGE_CLASS = {
  dang_nhap: "al-badge-login",
  dang_xuat: "al-badge-logout",
  tao_moi: "al-badge-create",
  cap_nhat: "al-badge-update",
  xoa: "al-badge-delete",
  chuyen_du_lieu: "al-badge-transfer",
};
const AL_ACTION_LABELS = {
  dang_nhap: "Đăng nhập",
  dang_xuat: "Đăng xuất",
  tao_moi: "Tạo mới",
  cap_nhat: "Cập nhật",
  xoa: "Xóa",
  chuyen_du_lieu: "Chuyển dữ liệu",
};

function alFormatDateTime(value) {
  if (!value) return "";
  const [datePart, timePart] = String(value).split(" ");
  const [y, m, d] = (datePart ?? "").split("-");
  if (!y || !m || !d) return value;
  return timePart ? `${d}/${m}/${y} ${timePart.slice(0, 5)}` : `${d}/${m}/${y}`;
}

// Query params gửi lên server theo đúng bộ lọc đang chọn trên form.
function alBuildQuery() {
  const params = new URLSearchParams();
  const search = document.getElementById("al-filter-search")?.value.trim();
  const action = document.getElementById("al-filter-action")?.value;
  const module_ = document.getElementById("al-filter-module")?.value;
  const userId = document.getElementById("al-filter-user")?.value;
  const from = document.getElementById("al-filter-from")?.value;
  const to = document.getElementById("al-filter-to")?.value;
  if (search) params.set("q", search);
  if (action) params.set("action", action);
  if (module_) params.set("module", module_);
  if (userId) params.set("user_id", userId);
  if (from) params.set("date_from", from);
  if (to) params.set("date_to", to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function loadActionLogModules() {
  const select = document.getElementById("al-filter-module");
  if (!select) return;
  const current = select.value;
  try {
    const modules = await api("/api/action-logs/modules");
    select.innerHTML =
      `<option value="">Tất cả</option>` + modules.map((m) => `<option value="${m}">${m}</option>`).join("");
    select.value = modules.includes(current) ? current : "";
  } catch {
    // Không phải Admin (hoặc SSO tắt và trang này lỡ mở khi chưa đăng nhập)
    // -> im lặng bỏ qua, để nguyên dropdown rỗng.
  }
}

async function loadActionLogUsers() {
  const select = document.getElementById("al-filter-user");
  if (!select) return;
  const current = select.value;
  try {
    state.actionLogUsers = await api("/api/users");
    select.innerHTML =
      `<option value="">Tất cả</option>` +
      state.actionLogUsers.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
    select.value = current;
  } catch {
    // Không phải Admin -> im lặng bỏ qua.
  }
}

async function loadActionLogs() {
  const tbody = document.getElementById("al-tbody");
  if (!tbody) return;
  try {
    state.actionLogs = await api(`/api/action-logs${alBuildQuery()}`);
  } catch (err) {
    state.actionLogs = [];
    showToast(err.message);
  }
  actionLogPagination.reset();
  renderActionLogTable();
}

function renderActionLogTable() {
  const tbody = document.getElementById("al-tbody");
  const empty = document.getElementById("al-empty");
  if (!tbody) return;
  const rows = state.actionLogs;
  empty.hidden = rows.length > 0;
  const pageItems = actionLogPagination.slice(rows);

  tbody.innerHTML = pageItems
    .map(
      (log) => `
    <tr>
      <td>${alFormatDateTime(log.created_at)}</td>
      <td>${log.user_name ?? `<span class="muted">—</span>`}</td>
      <td>${log.department_name ?? `<span class="muted">—</span>`}</td>
      <td>${log.module ?? `<span class="muted">—</span>`}</td>
      <td><span class="status-badge ${AL_ACTION_BADGE_CLASS[log.action] ?? "status-default"}">${AL_ACTION_LABELS[log.action] ?? log.action}</span></td>
      <td>${log.description}</td>
    </tr>`,
    )
    .join("");
}

// Mọi thay đổi bộ lọc đều gọi lại loadActionLogs() (lọc server-side, khác
// Yêu cầu tính năng) — search text debounce nhẹ để không gọi API liên tục
// theo từng phím gõ, các select/date đổi ít nên gọi ngay không cần debounce.
let alSearchDebounceTimer = null;
document.getElementById("al-filter-search")?.addEventListener("input", () => {
  clearTimeout(alSearchDebounceTimer);
  alSearchDebounceTimer = setTimeout(() => loadActionLogs().catch((err) => showToast(err.message)), 350);
});
["al-filter-action", "al-filter-module", "al-filter-user", "al-filter-from", "al-filter-to"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", () => {
    loadActionLogs().catch((err) => showToast(err.message));
  });
});
