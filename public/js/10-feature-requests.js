// "Yêu cầu tính năng" — luồng Duyệt/Từ chối:
// - Tạo xong: bên đề xuất (A) thấy "Đã gửi yêu cầu", bên đích (B) thấy
//   "Chờ duyệt" kèm 2 nút Duyệt/Từ chối.
// - B bấm Duyệt: A thấy "Đã tiếp nhận yêu cầu"; B thấy "Đã duyệt" kèm 2 nút
//   "Đưa vào Backlog"/"Đưa vào Roadmap năm" (làm được cả 2, độc lập nhau,
//   mỗi cái chỉ 1 lần — xem linked_task_id/linked_roadmap_item_id).
// - B bấm Từ chối: CẢ 2 bên đều thấy "Từ chối yêu cầu".
// Trạng thái lưu 1 giá trị duy nhất (Chờ duyệt/Đã duyệt/Từ chối) — nhãn
// hiển thị khác nhau theo phòng đang xem, xem frStatusLabel() bên dưới.

// Màu badge trạng thái đi theo NHÃN HIỂN THỊ (khác nhau theo phòng đang
// xem — frStatusLabel) chứ không chỉ trạng thái gốc: cùng 1 trạng thái
// "Chờ duyệt", bên đề xuất thấy "Đã gửi yêu cầu" (xám — đang chờ bên kia
// quyết định) còn bên đích thấy "Chờ duyệt" (vàng — cần mình Duyệt/Từ
// chối), để 2 badge trong cùng bảng không bao giờ giống hệt nhau. "Đã
// duyệt"/"Đã tiếp nhận yêu cầu" → xanh lá, "Từ chối yêu cầu" → đỏ.
function frStatusBadgeClass(r) {
  switch (frStatusLabel(r)) {
    case "Đã gửi yêu cầu":
      return "status-default";
    case "Chờ duyệt":
      return "status-dang-thuc-hien";
    case "Từ chối yêu cầu":
      return "status-huy";
    default:
      return "status-hoan-thanh";
  }
}
// Độ tăng dần theo yêu cầu: xám (Thấp) -> xanh (Trung bình) -> vàng (Cao)
// -> đỏ (Khẩn cấp).
const FR_PRIORITY_CLASS = {
  Thấp: "status-default",
  "Trung bình": "status-hoan-thanh",
  Cao: "status-dang-thuc-hien",
  "Khẩn cấp": "status-huy",
};

// ---- Cấu hình cột hiển thị ở bảng Yêu cầu tính năng ----
// Giống bảng Nhiệm vụ (TASK_TOGGLEABLE_COLUMNS ở 04-tasks.js): bảng có 19
// cột dữ liệu nên rất dài theo chiều ngang — cho người dùng tự chọn ẩn cột
// nào không cần xem, lưu riêng theo máy/trình duyệt (localStorage, KHÔNG
// lưu server) vì đây chỉ là tuỳ chọn hiển thị cá nhân. Cột checkbox và cột
// hành động (Duyệt/Từ chối/Đưa vào...) không cho ẩn.
const FR_TOGGLEABLE_COLUMNS = [
  { key: "stt", label: "STT" },
  { key: "linh_vuc", label: "Lĩnh vực" },
  { key: "mang", label: "Mảng" },
  { key: "hoat_dong", label: "Hoạt động/nghiệp vụ" },
  { key: "quy_trinh_so_hoa", label: "Quy trình số hóa" },
  { key: "ma_quy_trinh", label: "Mã quy trình" },
  { key: "buoc_so_hoa", label: "Bước số hóa" },
  { key: "mo_ta", label: "Mô tả từng bước đang thực hiện" },
  { key: "van_de_ton_tai", label: "Vấn đề tồn tại" },
  { key: "he_thong", label: "Hệ thống cần cải tiến (nếu có)" },
  { key: "de_xuat_quy_trinh", label: "Đề xuất quy trình/nghiệp vụ" },
  { key: "hieu_qua", label: "Hiệu quả khi thực hiện" },
  { key: "thoi_gian", label: "Thời gian mong muốn thực hiện" },
  { key: "quy", label: "Quý thực hiện" },
  { key: "ke_hoach_software", label: "Kế hoạch software" },
  { key: "ket_qua", label: "Kết quả mong muốn" },
  { key: "do_uu_tien", label: "Ưu tiên" },
  { key: "don_vi_de_xuat", label: "Đơn vị đề xuất" },
  { key: "nguoi_dau_moi", label: "Nhân sự đầu mối" },
  { key: "ghi_chu", label: "Ghi chú" },
  { key: "trang_thai", label: "Trạng thái" },
];
const FR_COL_LS_KEY = "backlog.frColumns.hiddenV1";

function loadHiddenFrColumns() {
  try {
    const raw = localStorage.getItem(FR_COL_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh, site data bị khoá) —
    // bỏ qua, chỉ mất tuỳ chọn ẩn cột đã lưu trước đó trên máy này.
    return new Set();
  }
}

function saveHiddenFrColumns() {
  try {
    localStorage.setItem(FR_COL_LS_KEY, JSON.stringify([...state.hiddenFrColumns]));
  } catch {
    // Không lưu được thì bỏ qua — tuỳ chọn vẫn áp dụng cho phiên hiện tại,
    // chỉ không nhớ lại cho lần sau.
  }
}

function isFrColHidden(key) {
  return state.hiddenFrColumns.has(key);
}

// Đồng bộ thuộc tính hidden của các <th> tiêu đề theo đúng tuỳ chọn đã lưu —
// header là markup tĩnh (không render lại theo state.featureRequests như
// tbody) nên cần hàm riêng, gọi lúc khởi động trang (initFrColumnMenu) và
// mỗi lần vẽ lại bảng (renderFeatureRequestTable).
function applyFrColumnHeaderVisibility() {
  FR_TOGGLEABLE_COLUMNS.forEach(({ key }) => {
    const th = document.querySelector(`#fr-table thead [data-col="${key}"]`);
    if (!th) return;
    th.hidden = isFrColHidden(key);
  });
}

function renderFrColMenu() {
  const list = document.getElementById("fr-col-menu-list");
  list.innerHTML = FR_TOGGLEABLE_COLUMNS.map(
    ({ key, label }) => `
    <label class="col-menu-item">
      <input type="checkbox" class="fr-col-checkbox" data-col-key="${key}" ${isFrColHidden(key) ? "" : "checked"} />
      ${label}
    </label>`,
  ).join("");
  list.querySelectorAll(".fr-col-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      if (e.target.checked) state.hiddenFrColumns.delete(key);
      else state.hiddenFrColumns.add(key);
      saveHiddenFrColumns();
      renderFeatureRequestTable();
    });
  });
}

function openFrColMenu() {
  renderFrColMenu();
  document.getElementById("fr-col-menu").hidden = false;
  document.getElementById("fr-col-menu-btn").setAttribute("aria-expanded", "true");
}

function closeFrColMenu() {
  document.getElementById("fr-col-menu").hidden = true;
  document.getElementById("fr-col-menu-btn").setAttribute("aria-expanded", "false");
}

function initFrColumnMenu() {
  state.hiddenFrColumns = loadHiddenFrColumns();
  applyFrColumnHeaderVisibility();

  const menuWrap = document.getElementById("fr-col-menu-wrap");
  const menuBtn = document.getElementById("fr-col-menu-btn");
  const menu = document.getElementById("fr-col-menu");
  if (!menuWrap || !menuBtn || !menu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openFrColMenu();
    else closeFrColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menuWrap.contains(e.target)) closeFrColMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFrColMenu();
  });
  document.getElementById("fr-col-menu-reset").addEventListener("click", () => {
    state.hiddenFrColumns.clear();
    saveHiddenFrColumns();
    applyFrColumnHeaderVisibility();
    renderFrColMenu();
    renderFeatureRequestTable();
  });
}
initFrColumnMenu();

async function loadFeatureRequests() {
  // deptParam() -> chỉ trả yêu cầu mà phòng đang xem là bên đề xuất hoặc
  // bên đích (xem listFeatureRequestsHandler) — không dùng prefix mặc định
  // "&" vì đây là query đầu tiên của URL.
  state.featureRequests = await api(`/api/feature-requests${deptParam("?")}`);
  const frIds = new Set(state.featureRequests.map((r) => r.id));
  state.selectedFeatureRequestIds.forEach((id) => {
    if (!frIds.has(id)) state.selectedFeatureRequestIds.delete(id);
  });
  populateFrHeThongFilter();
  populateFrTargetDeptFilter();
  frPagination.reset();
  renderFeatureRequestTable();
  updateFeatureRequestNavBadge(countPendingFeatureRequestsForTarget(state.featureRequests));
}

// Số yêu cầu đang "Chờ duyệt" mà PHÒNG ĐANG XEM là bên đích (phòng cần xử
// lý) — dùng cho chấm đỏ ở menu trái. Không đếm yêu cầu do chính phòng này
// gửi đi (bên đề xuất không cần Duyệt/Từ chối, không phải việc cần làm).
function countPendingFeatureRequestsForTarget(rows) {
  return (rows || []).filter(
    (r) => r.target_department_id === state.currentDepartmentId && r.trang_thai === "Chờ duyệt",
  ).length;
}

function updateFeatureRequestNavBadge(count) {
  const badge = document.getElementById("fr-nav-badge");
  if (!badge) return;
  badge.hidden = !(count > 0);
  badge.textContent = count > 99 ? "99+" : String(count);
}

// Cập nhật chấm đỏ ở menu trái KỂ CẢ KHI trang "Yêu cầu tính năng" chưa mở
// (loadFeatureRequests() ở trên chỉ được gọi khi trang đã/đang mở) — gọi
// riêng ở lúc khởi động app + mỗi lần đổi phòng ban, xem 09-main.js và
// 02-departments-periods-teams.js.
async function refreshFeatureRequestNavBadge() {
  if (state.currentDepartmentId == null) {
    updateFeatureRequestNavBadge(0);
    return;
  }
  try {
    const rows = await api(`/api/feature-requests${deptParam("?")}`);
    updateFeatureRequestNavBadge(countPendingFeatureRequestsForTarget(rows));
  } catch {
    // Lỗi mạng tạm thời — bỏ qua, giữ nguyên chấm đỏ cũ, không làm gián
    // đoạn phần còn lại của app.
  }
}

function populateFrHeThongFilter() {
  const select = document.getElementById("fr-filter-he-thong");
  if (!select) return;
  const current = select.value;
  const heThongSet = new Set(state.featureRequests.map((r) => r.he_thong).filter(Boolean));
  select.innerHTML =
    `<option value="">Tất cả</option>` +
    Array.from(heThongSet)
      .sort((a, b) => a.localeCompare(b))
      .map((h) => `<option value="${h}">${h}</option>`)
      .join("");
  select.value = heThongSet.has(current) ? current : "";
}

function populateFrTargetDeptFilter() {
  const select = document.getElementById("fr-filter-target-dept");
  if (!select) return;
  const current = select.value;
  select.innerHTML =
    `<option value="">Tất cả</option>` +
    state.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  select.value = current;
}

function filteredFeatureRequests() {
  const term = (document.getElementById("fr-filter-search")?.value ?? "").trim().toLowerCase();
  const status = document.getElementById("fr-filter-status")?.value ?? "";
  const heThong = document.getElementById("fr-filter-he-thong")?.value ?? "";
  const targetDept = document.getElementById("fr-filter-target-dept")?.value ?? "";
  return state.featureRequests.filter((r) => {
    if (status && r.trang_thai !== status) return false;
    if (heThong && r.he_thong !== heThong) return false;
    if (targetDept && String(r.target_department_id ?? "") !== targetDept) return false;
    if (
      term &&
      // Tìm trong TOÀN BỘ dữ liệu của yêu cầu (giống ô "Tìm kiếm" ở bảng
      // Nhiệm vụ — applyTaskFilters) chứ không chỉ vài trường: mọi cột hiển
      // thị trên bảng + phòng đề xuất/đích + trạng thái + mức ưu tiên.
      ![
        r.tieu_de,
        r.mo_ta,
        r.he_thong,
        r.nguoi_de_xuat,
        r.department_name,
        r.target_department_name,
        r.linh_vuc,
        r.mang,
        r.hoat_dong_nghiep_vu,
        r.quy_trinh_so_hoa,
        r.ma_quy_trinh,
        r.buoc_so_hoa,
        r.van_de_ton_tai,
        r.de_xuat_quy_trinh,
        r.hieu_qua_khi_thuc_hien,
        r.quy_trinh_hien,
        r.thoi_gian_mong_muon,
        r.ke_hoach_software,
        r.ket_qua_mong_muon,
        r.ghi_chu_xu_ly,
        r.do_uu_tien,
        r.trang_thai,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    ) {
      return false;
    }
    return true;
  });
}

function frFormatDate(value) {
  return formatDbDateTime(value)?.date ?? "";
}

// Quý thực hiện tự suy từ "Thời gian mong muốn thực hiện" (không lưu DB):
// 1 năm 4 quý, 3 tháng = 1 quý — tháng 1-3 → Quý I, 4-6 → Quý II, 7-9 →
// Quý III, 10-12 → Quý IV; năm lấy theo năm của ngày nhập. Ví dụ
// 6/10/2026 → "Quý IV/2026". Giá trị lưu luôn là "YYYY-MM-DD" (input
// type=date của form + parseDateToIso ở import) nên cắt thẳng chuỗi, tránh
// lệch múi giờ nếu đi vòng qua new Date().
const FR_QUARTER_LABELS = ["Quý I", "Quý II", "Quý III", "Quý IV"];
function frQuarterOf(value) {
  const m = String(value ?? "").match(/^(\d{4})-(\d{1,2})/);
  if (!m) return "";
  const month = Number(m[2]);
  if (month < 1 || month > 12) return "";
  return `${FR_QUARTER_LABELS[Math.floor((month - 1) / 3)]}/${m[1]}`;
}

// Phòng đang xem là bên nào của yêu cầu này? "target" | "proposer" | null
// (không liên quan — không nên xảy ra vì list() đã lọc, chỉ phòng thủ).
function frViewerSide(r) {
  if (r.target_department_id === state.currentDepartmentId) return "target";
  if (r.department_id === state.currentDepartmentId) return "proposer";
  return null;
}

// Nhãn trạng thái hiển thị khác nhau theo phòng đang xem — xem comment đầu
// file.
function frStatusLabel(r) {
  const side = frViewerSide(r);
  if (r.trang_thai === "Từ chối") return "Từ chối yêu cầu";
  if (r.trang_thai === "Đã duyệt") return side === "target" ? "Đã duyệt" : "Đã tiếp nhận yêu cầu";
  // "Chờ duyệt"
  return side === "target" ? "Chờ duyệt" : "Đã gửi yêu cầu";
}

// Badge "Đã đưa vào Backlog/Roadmap" — 2 màu khác nhau (tím/xanh dương) để
// phân biệt Backlog/Roadmap với nhau, đồng thời KHÔNG trùng bất kỳ màu nào
// đã dùng cho các badge trạng thái chính (xám "Đã gửi yêu cầu", vàng "Chờ
// duyệt", xanh lá "Đã duyệt", đỏ "Từ chối" — xem frStatusBadgeClass) hay
// màu Ưu tiên trong cùng bảng — tránh đọc nhầm badge nào là trạng thái gì.
function frLinkedBadgesHtml(r) {
  return (
    (r.linked_task_id ? `<span class="status-badge fr-linked-badge-backlog" title="Đã đưa vào Backlog">✓ Backlog</span>` : "") +
    (r.linked_roadmap_item_id
      ? `<span class="status-badge fr-linked-badge-roadmap" title="Đã đưa vào Roadmap năm">✓ Roadmap</span>`
      : "")
  );
}

// HTML các nút thao tác cho 1 yêu cầu — DÙNG CHUNG cho ô Thao tác ở bảng
// danh sách và khối Thao tác ở dialog xem chi tiết (wireFrActionButtons()
// bên dưới gắn listener chung cho cả 2 nơi).
function frActionsHtml(r, side) {
  let actions = "";
  const id = r.id;
  // Duyệt/Từ chối/Đưa vào Backlog/Roadmap: CHỈ phòng đích được thao tác
  // (chặn thật ở server — requireTargetScope), và chỉ user có quyền ghi
  // (editor/admin — write-action ẩn với viewer, xem style.css) mới thấy
  // nút. Viewer thuộc phòng đích vẫn thấy trạng thái "Chờ duyệt" bình
  // thường, chỉ không thấy 2 nút này.
  if (side === "target" && r.trang_thai === "Chờ duyệt") {
    actions += `<button class="small btn-grade write-action approve-fr-btn" data-id="${id}">Duyệt</button>`;
    actions += `<button class="small btn-reject write-action reject-fr-btn" data-id="${id}">Từ chối</button>`;
  }
  if (side === "target" && r.trang_thai === "Đã duyệt") {
    // Chỉ hiện NÚT khi còn thao tác thật sự cần làm — đã đưa vào rồi thì bỏ
    // hẳn khỏi Thao tác (không để "trạng thái xong" giả dạng nút gây nhầm
    // bấm được), đọc trạng thái đã đưa vào qua badge (frLinkedBadgesHtml).
    if (!r.linked_task_id) {
      actions += `<button class="small btn-exclude write-action to-backlog-fr-btn" data-id="${id}">Đưa vào Backlog</button>`; // vàng (giống nút Backlog sẵn có)
    }
    if (!r.linked_roadmap_item_id) {
      actions += `<button class="small btn-progress write-action to-roadmap-fr-btn" data-id="${id}">Đưa vào Roadmap</button>`; // xanh dương — tách biệt màu với nút Backlog
    }
  }
  // Chuyển đơn vị thực hiện: CẢ 2 phía (đề xuất hoặc đích) được chuyển khi
  // còn "Chờ duyệt" — yêu cầu đổi phòng đích, sau đó hiển thị ở hộp thư của
  // phòng mới thay vì phòng cũ (server chặn cùng luật isInScope + Chờ duyệt).
  if (r.trang_thai === "Chờ duyệt") {
    actions += `<button class="small btn-progress write-action transfer-fr-btn" data-id="${id}">Chuyển đơn vị thực hiện</button>`;
  }
  // Sửa/Xóa: chỉ bên đề xuất, chỉ khi còn "Chờ duyệt" (đã Duyệt/Từ chối thì
  // khoá nội dung, tránh sửa sau khi bên kia đã hành động). Khác với "Tạo
  // mới" (mọi quyền kể cả viewer), Sửa vẫn là PUT nên cần quyền ghi —
  // write-action ẩn với viewer.
  if (side === "proposer" && r.trang_thai === "Chờ duyệt") {
    actions += `<button class="small btn-edit write-action edit-fr-btn" data-id="${id}">Sửa</button>`;
    actions += `<button class="small btn-delete delete-fr-btn" data-id="${id}">Xóa</button>`;
  }
  return actions;
}

// Gắn listener cho các nút thao tác (.approve-fr-btn/.reject-fr-btn/...)
// tìm thấy bên trong `root` — dùng chung cho tbody bảng danh sách lẫn khối
// Thao tác ở dialog chi tiết. `id` lấy từ data-id ở chính nút bấm (không
// phải closest("tr") nữa vì dialog chi tiết không có <tr>).
function wireFrActionButtons(root) {
  root.querySelectorAll(".edit-fr-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("fr-detail-dialog").close();
      openFeatureRequestDialog(state.featureRequests.find((r) => r.id === Number(btn.dataset.id)));
    });
  });
  root.querySelectorAll(".delete-fr-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      if (!(await confirmDialog("Xóa yêu cầu tính năng này?"))) return;
      try {
        await api(`/api/feature-requests/${id}${deptParam("?")}`, { method: "DELETE" });
        document.getElementById("fr-detail-dialog").close();
        await loadFeatureRequests();
        showToast("Đã xóa yêu cầu.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  root.querySelectorAll(".transfer-fr-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openFrTransferDialog(state.featureRequests.find((r) => r.id === Number(btn.dataset.id)));
    });
  });
  root.querySelectorAll(".approve-fr-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      if (!(await confirmDialog("Duyệt yêu cầu tính năng này?", { danger: false }))) return;
      try {
        await api(`/api/feature-requests/${id}/approve${deptParam("?")}`, { method: "POST" });
        document.getElementById("fr-detail-dialog").close();
        await loadFeatureRequests();
        showToast("Đã duyệt yêu cầu.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  root.querySelectorAll(".reject-fr-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("fr-detail-dialog").close();
      document.getElementById("fr-reject-id").value = btn.dataset.id;
      document.getElementById("fr-reject-reason").value = "";
      document.getElementById("fr-reject-dialog").showModal();
    });
  });
  root.querySelectorAll(".to-backlog-fr-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("fr-detail-dialog").close();
      openFrBacklogDialog(Number(btn.dataset.id));
    });
  });
  root.querySelectorAll(".to-roadmap-fr-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("fr-detail-dialog").close();
      openFrRoadmapDialog(Number(btn.dataset.id));
    });
  });
}

// Chọn nhiều để xóa hàng loạt — CHỈ admin (nút "Xóa đã chọn" mang class
// "delete-action", tự ẩn với viewer/editor qua CSS role, khớp luật chặn
// thật ở server — requireAdmin gắn riêng cho path "delete-selected", xem
// app.ts). Checkbox từng dòng/chọn tất cả vẫn hiện với mọi quyền (giống
// bảng Nhân sự) — chỉ nút Xóa mới ẩn, không phải cả cột.
function updateFrSelectionUI() {
  const visible = filteredFeatureRequests();
  const visibleSelectedCount = visible.filter((r) => state.selectedFeatureRequestIds.has(r.id)).length;
  const btn = document.getElementById("delete-selected-fr-btn");
  const countEl = document.getElementById("selected-fr-count");
  const selectAll = document.getElementById("fr-select-all");
  if (btn) btn.hidden = state.selectedFeatureRequestIds.size === 0;
  if (countEl) countEl.textContent = String(state.selectedFeatureRequestIds.size);
  if (selectAll) {
    selectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

// Ô text dài trong bảng — cắt tối đa 3 dòng, bấm vào dòng (hoặc rê chuột
// xem title) để đọc đầy đủ ở dialog chi tiết.
function frClamp(text, title) {
  const value = text ?? "";
  if (!value) return `<span class="muted">—</span>`;
  return `<div class="fr-clamp" title="${value.replace(/"/g, "&quot;")}">${value.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
}

function renderFeatureRequestTable() {
  const tbody = document.getElementById("fr-tbody");
  const empty = document.getElementById("fr-empty");
  if (!tbody) return;
  // Header là markup tĩnh — đồng bộ lại hidden mỗi lần vẽ (menu "Cột hiển
  // thị" đổi tuỳ chọn rồi gọi renderFeatureRequestTable, xem applyFrColumn
  // HeaderVisibility).
  applyFrColumnHeaderVisibility();
  const rows = filteredFeatureRequests();
  empty.hidden = rows.length > 0;
  const pageItems = frPagination.slice(rows);
  const pageStart = (frPagination.page - 1) * frPagination.pageSize;

  // Bảng hiển thị đủ các cột theo biểu mẫu Excel "Quy trình số hóa" (xem
  // featureRequest-import.service.ts cho mapping cột import): các cột cũ
  // trùng biểu mẫu đã GỘP — mo_ta hiện ở "Mô tả từng bước đang thực hiện",
  // he_thong ở "Hệ thống cần cải tiến (nếu có)", department_name ở "Đơn vị
  // đề xuất", nguoi_de_xuat ở "Nhân sự đầu mối", ghi_chu_xu_ly ở "Ghi chú",
  // do_uu_tien ở "Ưu tiên". Cột Tiêu đề đứng ngay sau STT, không cho ẩn
  // (nhận diện dòng, giống cột "Nhiệm vụ" ở bảng Nhiệm vụ); giữ Trạng thái +
  // Thao tác cho luồng Duyệt/Từ chối/Đưa vào Backlog-Roadmap. Ô text dài cắt
  // 3 dòng (fr-clamp), bấm dòng để xem chi tiết đầy đủ. Cột bị ẩn qua
  // menu "Cột
   // hiển thị" (isFrColHidden) phải ẩn ĐỒNG BỘ ở cả th lẫn td — ô thiếu
   // thuộc tính hidden sẽ lệch cột so với header.
   const colHidden = (key) => (isFrColHidden(key) ? "hidden" : "");
   // Mỗi td cũng mang data-col giống th (CSS căn giữa #fr-table dùng
   // [data-col=...] thay vì nth-child — nth-child lệch vị trí khi có cột
   // bị ẩn giữa bảng).
   tbody.innerHTML = pageItems
     .map((r, i) => {
       const side = frViewerSide(r);
       const statusLabel = frStatusLabel(r);
       const actions = frActionsHtml(r, side);
       const hoatDongCell =
         (r.hoat_dong_nghiep_vu || r.tieu_de || `<span class="muted">—</span>`) +
         (r.attachment_filename
           ? `<svg class="icon" aria-hidden="true" title="Có file đính kèm" style="margin-left:4px;vertical-align:-2px"><use href="icons.svg#i-paperclip"/></svg>`
           : "");

       return `
     <tr data-id="${r.id}" class="fr-row-clickable" title="Bấm để xem chi tiết yêu cầu">
       <td><input type="checkbox" class="fr-row-checkbox" ${state.selectedFeatureRequestIds.has(r.id) ? "checked" : ""} /></td>
       <td data-col="stt" ${colHidden("stt")}>${pageStart + i + 1}</td>
       <td>${frClamp(r.tieu_de)}</td>
       <td data-col="linh_vuc" ${colHidden("linh_vuc")}>${frClamp(r.linh_vuc)}</td>
       <td data-col="mang" ${colHidden("mang")}>${frClamp(r.mang)}</td>
       <td data-col="hoat_dong" ${colHidden("hoat_dong")}>${hoatDongCell}</td>
       <td data-col="quy_trinh_so_hoa" ${colHidden("quy_trinh_so_hoa")}>${frClamp(r.quy_trinh_so_hoa)}</td>
       <td data-col="ma_quy_trinh" ${colHidden("ma_quy_trinh")}>${frClamp(r.ma_quy_trinh)}</td>
       <td data-col="buoc_so_hoa" ${colHidden("buoc_so_hoa")}>${frClamp(r.buoc_so_hoa)}</td>
       <td data-col="mo_ta" ${colHidden("mo_ta")}>${frClamp(r.mo_ta)}</td>
       <td data-col="van_de_ton_tai" ${colHidden("van_de_ton_tai")}>${frClamp(r.van_de_ton_tai)}</td>
       <td data-col="he_thong" ${colHidden("he_thong")}>${
         r.he_thong
           ? `<span class="status-badge ${systemColorClass(r.he_thong)}">${r.he_thong}</span>`
           : `<span class="muted">—</span>`
       }</td>
       <td data-col="de_xuat_quy_trinh" ${colHidden("de_xuat_quy_trinh")}>${frClamp(r.de_xuat_quy_trinh)}</td>
       <td data-col="hieu_qua" ${colHidden("hieu_qua")}>${frClamp(r.hieu_qua_khi_thuc_hien)}</td>
       <td data-col="thoi_gian" ${colHidden("thoi_gian")}>${r.thoi_gian_mong_muon ? frFormatDate(r.thoi_gian_mong_muon) : `<span class="muted">—</span>`}</td>
       <td data-col="quy" ${colHidden("quy")}>${frQuarterOf(r.thoi_gian_mong_muon) || `<span class="muted">—</span>`}</td>
       <td data-col="ke_hoach_software" ${colHidden("ke_hoach_software")}>${frClamp(r.ke_hoach_software)}</td>
       <td data-col="ket_qua" ${colHidden("ket_qua")}>${frClamp(r.ket_qua_mong_muon)}</td>
       <td data-col="do_uu_tien" ${colHidden("do_uu_tien")}><span class="status-badge ${FR_PRIORITY_CLASS[r.do_uu_tien] ?? "status-default"}">${r.do_uu_tien}</span></td>
       <td data-col="don_vi_de_xuat" ${colHidden("don_vi_de_xuat")}>${r.department_name ?? `<span class="muted">—</span>`}</td>
       <td data-col="nguoi_dau_moi" ${colHidden("nguoi_dau_moi")}>${frClamp(r.nguoi_de_xuat)}</td>
       <td data-col="ghi_chu" ${colHidden("ghi_chu")}>${frClamp(r.ghi_chu_xu_ly)}</td>
       <td data-col="trang_thai" ${colHidden("trang_thai")}>
         <div class="row" style="gap:5px;flex-wrap:wrap">
           <span class="status-badge ${frStatusBadgeClass(r)}">${statusLabel}</span>
           ${frLinkedBadgesHtml(r)}
         </div>
       </td>
       <td><div class="actions-cell" title="">${actions}</div></td>
     </tr>`;
     })
     .join("");

  tbody.querySelectorAll(".fr-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedFeatureRequestIds.add(id);
      } else {
        state.selectedFeatureRequestIds.delete(id);
      }
      updateFrSelectionUI();
    });
  });

  tbody.querySelectorAll("tr.fr-row-clickable").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      // Bấm vào ô checkbox hoặc nút/link thao tác (Sửa/Xóa/Duyệt/Từ
      // chối/Đưa vào...) thì để đúng handler của nó chạy, không mở dialog
      // chi tiết đè lên.
      if (e.target.closest("input, button, a, .actions-cell")) return;
      const id = Number(tr.dataset.id);
      openFrDetailDialog(state.featureRequests.find((r) => r.id === id));
    });
  });
  wireFrActionButtons(tbody);
  updateFrSelectionUI();
}

document.getElementById("fr-select-all")?.addEventListener("change", (e) => {
  const visible = filteredFeatureRequests();
  if (e.target.checked) {
    visible.forEach((r) => state.selectedFeatureRequestIds.add(r.id));
  } else {
    visible.forEach((r) => state.selectedFeatureRequestIds.delete(r.id));
  }
  renderFeatureRequestTable();
});

document.getElementById("delete-selected-fr-btn")?.addEventListener("click", async () => {
  const ids = [...state.selectedFeatureRequestIds];
  if (ids.length === 0) return;
  if (!(await confirmDialog(`Xóa ${ids.length} yêu cầu tính năng đã chọn?`))) return;
  try {
    const res = await api(`/api/feature-requests/delete-selected${deptParam("?")}`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedFeatureRequestIds.clear();
    await loadFeatureRequests();
    showToast(`Đã xóa ${res?.deleted ?? 0} yêu cầu.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Xem chi tiết ----

function openFrDetailDialog(r) {
  if (!r) return;
  const side = frViewerSide(r);
  const statusLabel = frStatusLabel(r);

  document.getElementById("fr-detail-he-thong").className = `status-badge ${systemColorClass(r.he_thong)}`;
  document.getElementById("fr-detail-he-thong").textContent = r.he_thong;
  document.getElementById("fr-detail-title").textContent = r.tieu_de;
  document.getElementById("fr-detail-status-badges").innerHTML =
    `<span class="status-badge ${frStatusBadgeClass(r)}">${statusLabel}</span>${frLinkedBadgesHtml(r)}`;

  document.getElementById("fr-detail-loai").textContent = r.loai_yeu_cau || "—";
  document.getElementById("fr-detail-uu-tien").innerHTML = `<span class="status-badge ${FR_PRIORITY_CLASS[r.do_uu_tien] ?? "status-default"}">${r.do_uu_tien}</span>`;
  document.getElementById("fr-detail-linh-vuc").textContent = r.linh_vuc || "—";
  document.getElementById("fr-detail-mang").textContent = r.mang || "—";
  document.getElementById("fr-detail-hoat-dong").textContent = r.hoat_dong_nghiep_vu || r.tieu_de || "—";
  document.getElementById("fr-detail-quy-trinh-so-hoa").textContent = r.quy_trinh_so_hoa || "—";
  document.getElementById("fr-detail-ma-quy-trinh").textContent = r.ma_quy_trinh || "—";
  document.getElementById("fr-detail-buoc-so-hoa").textContent = r.buoc_so_hoa || "—";
  document.getElementById("fr-detail-quy-trinh-hien").textContent = r.quy_trinh_hien || "—";
  document.getElementById("fr-detail-ke-hoach-software").textContent = r.ke_hoach_software || "—";
  document.getElementById("fr-detail-from-dept").textContent = r.department_name || "—";
  document.getElementById("fr-detail-to-dept").textContent = r.target_department_name || "—";
  document.getElementById("fr-detail-nguoi-de-xuat").textContent = r.nguoi_de_xuat || "—";
  document.getElementById("fr-detail-thoi-gian").textContent = r.thoi_gian_mong_muon ? frFormatDate(r.thoi_gian_mong_muon) : "—";
  document.getElementById("fr-detail-ngay-tao").textContent = frFormatDate(r.created_at);
  document.getElementById("fr-detail-attachment").innerHTML = r.attachment_filename
    ? `<a href="/api/feature-requests/${r.id}/attachment${deptParam("?")}" target="_blank" rel="noopener" class="fr-attachment-chip" title="Tải file đính kèm: ${r.attachment_filename}"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-paperclip"/></svg>${r.attachment_filename}</a>`
    : "—";

  document.getElementById("fr-detail-mo-ta").textContent = r.mo_ta || "Không có mô tả.";
  document.getElementById("fr-detail-van-de-ton-tai").textContent = r.van_de_ton_tai || "—";
  document.getElementById("fr-detail-de-xuat-quy-trinh").textContent = r.de_xuat_quy_trinh || "—";
  document.getElementById("fr-detail-hieu-qua-khi-thuc-hien").textContent = r.hieu_qua_khi_thuc_hien || "—";
  document.getElementById("fr-detail-ket-qua").textContent = r.ket_qua_mong_muon || "Không có.";

  const ghiChuWrap = document.getElementById("fr-detail-ghi-chu-wrap");
  if (r.ghi_chu_xu_ly && r.ghi_chu_xu_ly.trim()) {
    document.getElementById("fr-detail-ghi-chu").textContent = r.ghi_chu_xu_ly;
    ghiChuWrap.hidden = false;
  } else {
    ghiChuWrap.hidden = true;
  }

  const actionsEl = document.getElementById("fr-detail-actions");
  actionsEl.innerHTML = frActionsHtml(r, side);
  wireFrActionButtons(actionsEl);

  document.getElementById("fr-detail-dialog").showModal();
}

// ---- Thêm/Sửa yêu cầu ----

function openFeatureRequestDialog(item) {
  const form = document.getElementById("feature-request-form");
  form.reset();
  document.getElementById("fr-id").value = item?.id ?? "";
  document.getElementById("fr-dialog-title").textContent = item ? "Sửa yêu cầu tính năng" : "Thêm yêu cầu tính năng";
  // Danh mục Hệ thống lấy đúng từ Cấu hình > Hệ thống (state.systemOptions,
  // cùng danh mục Roadmap năm đang dùng — xem loadSystem() ở 06-config.js).
  // Nếu đang sửa 1 yêu cầu cũ có giá trị KHÔNG còn trong danh mục (VD danh
  // mục đã bị xóa/đổi tên sau khi yêu cầu được tạo), vẫn thêm tạm option đó
  // vào để không âm thầm đổi mất dữ liệu khi Lưu.
  const heThongSelect = document.getElementById("fr-he-thong");
  const heThongNames = state.systemOptions.map((h) => h.ten_he_thong);
  const extra = item?.he_thong && !heThongNames.includes(item.he_thong) ? [item.he_thong] : [];
  heThongSelect.innerHTML =
    `<option value="">-- Chọn hệ thống --</option>` +
    [...heThongNames, ...extra].map((h) => `<option value="${h}">${h}</option>`).join("");
  heThongSelect.value = item?.he_thong ?? "";

  // Danh mục Loại yêu cầu lấy từ Cấu hình > Mục tiêu (state.objectiveOptions
  // — cùng danh mục Roadmap năm đang dùng cho cột "Mục tiêu", xem
  // loadObjective() ở 06-config.js) — cùng cách xử lý "giá trị cũ đã bị
  // xóa khỏi danh mục" như Hệ thống ở trên.
  const loaiSelect = document.getElementById("fr-loai-yeu-cau");
  const loaiNames = state.objectiveOptions.map((m) => m.ten_muc_tieu);
  const loaiExtra = item?.loai_yeu_cau && !loaiNames.includes(item.loai_yeu_cau) ? [item.loai_yeu_cau] : [];
  loaiSelect.innerHTML =
    `<option value="">-- Không chọn --</option>` +
    [...loaiNames, ...loaiExtra].map((l) => `<option value="${l}">${l}</option>`).join("");
  loaiSelect.value = item?.loai_yeu_cau ?? "";

  const targetDeptSelect = document.getElementById("fr-target-department");
  targetDeptSelect.innerHTML =
    `<option value="">-- Chọn phòng ban --</option>` +
    state.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  targetDeptSelect.value = item?.target_department_id ?? "";

  document.getElementById("fr-tieu-de").value = item?.tieu_de ?? "";
  document.getElementById("fr-mo-ta").value = item?.mo_ta ?? "";
  document.getElementById("fr-linh-vuc").value = item?.linh_vuc ?? "";
  document.getElementById("fr-mang").value = item?.mang ?? "";
  document.getElementById("fr-hoat-dong").value = item?.hoat_dong_nghiep_vu ?? "";
  document.getElementById("fr-quy-trinh-so-hoa").value = item?.quy_trinh_so_hoa ?? "";
  document.getElementById("fr-ma-quy-trinh").value = item?.ma_quy_trinh ?? "";
  document.getElementById("fr-buoc-so-hoa").value = item?.buoc_so_hoa ?? "";
  document.getElementById("fr-quy-trinh-hien").value = item?.quy_trinh_hien ?? "";
  document.getElementById("fr-van-de-ton-tai").value = item?.van_de_ton_tai ?? "";
  document.getElementById("fr-de-xuat-quy-trinh").value = item?.de_xuat_quy_trinh ?? "";
  document.getElementById("fr-hieu-qua-khi-thuc-hien").value = item?.hieu_qua_khi_thuc_hien ?? "";
  document.getElementById("fr-ke-hoach-software").value = item?.ke_hoach_software ?? "";
  document.getElementById("fr-ket-qua-mong-muon").value = item?.ket_qua_mong_muon ?? "";
  document.getElementById("fr-nguoi-de-xuat").value = item?.nguoi_de_xuat ?? "";
  document.getElementById("fr-thoi-gian-mong-muon").value = item?.thoi_gian_mong_muon ?? "";
  document.getElementById("fr-do-uu-tien").value = item?.do_uu_tien ?? "Trung bình";

  // File đính kèm — chỉ hiện khối "đã có file X, [Xóa file]" khi ĐANG SỬA
  // 1 yêu cầu đã có sẵn file (tạo mới thì chưa có id nên chưa thể upload
  // file, chọn file lúc này chỉ được UPLOAD SAU KHI Lưu tạo ra id — xem
  // submit handler bên dưới).
  const attachmentCurrent = document.getElementById("fr-attachment-current");
  const attachmentLink = document.getElementById("fr-attachment-link");
  if (item?.attachment_filename) {
    attachmentLink.textContent = item.attachment_filename;
    attachmentLink.href = `/api/feature-requests/${item.id}/attachment${deptParam("?")}`;
    attachmentCurrent.hidden = false;
  } else {
    attachmentCurrent.hidden = true;
  }

  document.getElementById("feature-request-dialog").showModal();
}

document.getElementById("add-feature-request-btn")?.addEventListener("click", () => {
  openFeatureRequestDialog(null);
});
document.getElementById("feature-request-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("feature-request-dialog").close();
});

document.getElementById("fr-attachment-remove-btn")?.addEventListener("click", async () => {
  const id = document.getElementById("fr-id").value;
  if (!id) return;
  if (!(await confirmDialog("Xóa file đính kèm của yêu cầu này?"))) return;
  try {
    await api(`/api/feature-requests/${id}/attachment${deptParam("?")}`, { method: "DELETE" });
    document.getElementById("fr-attachment-current").hidden = true;
    await loadFeatureRequests();
    showToast("Đã xóa file đính kèm.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// Upload file đính kèm (nếu có chọn) sau khi đã có id (tạo mới xong mới có
// id, sửa thì đã có sẵn) — dùng fetch() thẳng thay vì api() vì Content-Type
// ở đây là kiểu file, không phải application/json (giống mọi chỗ upload
// file khác trong hệ thống, xem 03-members.js#memberFileInput).
async function uploadFeatureRequestAttachment(id, file) {
  const buffer = await file.arrayBuffer();
  // deptParam() luôn dùng prefix mặc định "&" — tự thêm "?" ở đầu query
  // (không dùng deptParam("?") vì còn phải nối thêm "filename" sau đó,
  // không đoán trước được deptParam() có trả rỗng hay không).
  const url = `/api/feature-requests/${id}/attachment?filename=${encodeURIComponent(file.name)}${deptParam()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Lỗi ${res.status} khi tải file đính kèm`);
  }
}

document.getElementById("feature-request-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("fr-id").value;
  const targetDeptValue = document.getElementById("fr-target-department").value;
  if (!targetDeptValue) {
    showToast("Hãy chọn Phòng ban đích trước khi lưu.");
    return;
  }
  const payload = {
    he_thong: document.getElementById("fr-he-thong").value.trim(),
    loai_yeu_cau: document.getElementById("fr-loai-yeu-cau").value || undefined,
    target_department_id: Number(targetDeptValue),
    tieu_de: document.getElementById("fr-tieu-de").value.trim(),
    mo_ta: document.getElementById("fr-mo-ta").value.trim() || undefined,
    linh_vuc: document.getElementById("fr-linh-vuc").value.trim() || undefined,
    mang: document.getElementById("fr-mang").value.trim() || undefined,
    hoat_dong_nghiep_vu: document.getElementById("fr-hoat-dong").value.trim() || undefined,
    quy_trinh_so_hoa: document.getElementById("fr-quy-trinh-so-hoa").value.trim() || undefined,
    ma_quy_trinh: document.getElementById("fr-ma-quy-trinh").value.trim() || undefined,
    buoc_so_hoa: document.getElementById("fr-buoc-so-hoa").value.trim() || undefined,
    quy_trinh_hien: document.getElementById("fr-quy-trinh-hien").value.trim() || undefined,
    van_de_ton_tai: document.getElementById("fr-van-de-ton-tai").value.trim() || undefined,
    de_xuat_quy_trinh: document.getElementById("fr-de-xuat-quy-trinh").value.trim() || undefined,
    hieu_qua_khi_thuc_hien: document.getElementById("fr-hieu-qua-khi-thuc-hien").value.trim() || undefined,
    ke_hoach_software: document.getElementById("fr-ke-hoach-software").value.trim() || undefined,
    ket_qua_mong_muon: document.getElementById("fr-ket-qua-mong-muon").value.trim() || undefined,
    nguoi_de_xuat: document.getElementById("fr-nguoi-de-xuat").value.trim() || undefined,
    thoi_gian_mong_muon: document.getElementById("fr-thoi-gian-mong-muon").value || undefined,
    do_uu_tien: document.getElementById("fr-do-uu-tien").value,
  };
  if (!id) {
    // Gắn nhãn "phòng ban đề xuất" = phòng đang chọn ở sidebar lúc gửi yêu
    // cầu — CHỈ để hiển thị, không dùng để giới hạn ai xem được yêu cầu này.
    payload.department_id = state.currentDepartmentId ?? undefined;
  }

  const attachmentFile = document.getElementById("fr-attachment-input").files[0];

  try {
    let savedId = id;
    if (id) {
      await api(`/api/feature-requests/${id}${deptParam("?")}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      const created = await api("/api/feature-requests", { method: "POST", body: JSON.stringify(payload) });
      savedId = created.id;
    }
    // File đính kèm cần ID có sẵn nên luôn upload SAU KHI tạo/sửa xong —
    // nếu bước này lỗi, yêu cầu chính vẫn đã lưu thành công (chỉ báo lỗi
    // riêng cho phần file, không rollback/không mất dữ liệu vừa nhập).
    if (attachmentFile) {
      try {
        await uploadFeatureRequestAttachment(savedId, attachmentFile);
      } catch (attachErr) {
        showToast(`Đã lưu yêu cầu nhưng lỗi khi tải file đính kèm: ${attachErr.message}`);
      }
    }
    showToast(id ? "Đã cập nhật yêu cầu." : "Đã gửi yêu cầu tính năng.", "success");
    document.getElementById("feature-request-dialog").close();
    await loadFeatureRequests();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Từ chối ----

document.getElementById("fr-reject-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("fr-reject-dialog").close();
});
document.getElementById("fr-reject-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("fr-reject-id").value;
  const ghiChu = document.getElementById("fr-reject-reason").value.trim();
  try {
    await api(`/api/feature-requests/${id}/reject${deptParam("?")}`, {
      method: "POST",
      body: JSON.stringify({ ghi_chu: ghiChu || undefined }),
    });
    document.getElementById("fr-reject-dialog").close();
    await loadFeatureRequests();
    showToast("Đã từ chối yêu cầu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Đưa vào Backlog ----

async function openFrBacklogDialog(id) {
  document.getElementById("fr-backlog-id").value = id;
  const periodSelect = document.getElementById("fr-backlog-period");
  const now = today();
  const currentYm = now.getFullYear() * 100 + (now.getMonth() + 1);
  // Không cho chọn tháng backlog đã qua — chỉ liệt kê tháng hiện tại trở đi.
  const eligiblePeriods = state.periods.filter((p) => p.year * 100 + p.month >= currentYm);
  periodSelect.innerHTML = eligiblePeriods
    .slice()
    .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
    .map((p) => `<option value="${p.id}">${p.label}</option>`)
    .join("");
  const currentPeriod = eligiblePeriods.find((p) => p.year * 100 + p.month === currentYm);
  if (currentPeriod) periodSelect.value = String(currentPeriod.id);

  await frFillBacklogTeamOptions();
  periodSelect.onchange = frFillBacklogTeamOptions;

  if (eligiblePeriods.length === 0) {
    showToast("Chưa có tháng backlog nào từ tháng hiện tại trở đi — hãy tạo tháng mới trước.");
    return;
  }
  document.getElementById("fr-backlog-dialog").showModal();
}

async function frFillBacklogTeamOptions() {
  const periodId = document.getElementById("fr-backlog-period").value;
  const teamSelect = document.getElementById("fr-backlog-team");
  const noTeamMsg = document.getElementById("fr-backlog-no-team");
  if (!periodId) {
    teamSelect.innerHTML = "";
    return;
  }
  const teams = await api(`/api/teams?period_id=${periodId}${deptParam()}`);
  teamSelect.innerHTML = teams.map((t) => `<option value="${t.name}">${t.name}</option>`).join("");
  noTeamMsg.hidden = teams.length > 0;
  teamSelect.hidden = teams.length === 0;
}

document.getElementById("fr-backlog-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("fr-backlog-dialog").close();
});
document.getElementById("fr-backlog-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("fr-backlog-id").value;
  const periodId = document.getElementById("fr-backlog-period").value;
  const team = document.getElementById("fr-backlog-team").value;
  if (!periodId || !team) {
    showToast("Hãy chọn đủ Tháng backlog và Team.");
    return;
  }
  try {
    await api(`/api/feature-requests/${id}/to-backlog${deptParam("?")}`, {
      method: "POST",
      body: JSON.stringify({ period_id: Number(periodId), team }),
    });
    document.getElementById("fr-backlog-dialog").close();
    await loadFeatureRequests();
    showToast("Đã đưa vào Backlog.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Chuyển đơn vị thực hiện ----

function openFrTransferDialog(r) {
  if (!r) return;
  document.getElementById("fr-transfer-id").value = r.id;
  // Danh sách chọn LOẠI TRỪ phòng đích hiện tại — không cho "chuyển" về
  // chính chỗ (server cũng chặn lại, xem transferFeatureRequestHandler).
  const deptSelect = document.getElementById("fr-transfer-dept");
  const options = state.departments.filter((d) => d.id !== r.target_department_id);
  deptSelect.innerHTML = options.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  if (options.length === 0) {
    showToast("Không còn phòng ban nào khác để chuyển — hãy khai báo thêm phòng ở Cấu hình > Phòng ban.");
    return;
  }
  document.getElementById("fr-transfer-dialog").showModal();
}

document.getElementById("fr-transfer-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("fr-transfer-dialog").close();
});
document.getElementById("fr-transfer-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("fr-transfer-id").value;
  const deptId = document.getElementById("fr-transfer-dept").value;
  if (!deptId) {
    showToast("Hãy chọn Đơn vị thực hiện mới.");
    return;
  }
  try {
    const updated = await api(`/api/feature-requests/${id}/transfer${deptParam("?")}`, {
      method: "POST",
      body: JSON.stringify({ department_id: Number(deptId) }),
    });
    document.getElementById("fr-transfer-dialog").close();
    await loadFeatureRequests();
    // Sau chuyển, phòng đang xem có thể KHÔNG còn thấy yêu cầu này (không
    // còn là đề xuất/đích) — báo rõ đơn vị đã chuyển thay vì để dòng biến
    // mất một cách khó hiểu.
    showToast(`Đã chuyển đơn vị thực hiện: ${updated?.target_department_name ?? "phòng mới"}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Đưa vào Roadmap năm ----

function openFrRoadmapDialog(id) {
  document.getElementById("fr-roadmap-id").value = id;
  document.getElementById("fr-roadmap-year").value = today().getFullYear();
  const teamSelect = document.getElementById("fr-roadmap-team");
  teamSelect.innerHTML = state.teams.map((t) => `<option value="${t.name}">${t.name}</option>`).join("");
  if (state.teams.length === 0) {
    showToast("Phòng ban đích chưa có team nào ở tháng backlog đang chọn — hãy khai báo team trước.");
    return;
  }
  document.getElementById("fr-roadmap-dialog").showModal();
}

document.getElementById("fr-roadmap-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("fr-roadmap-dialog").close();
});
document.getElementById("fr-roadmap-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("fr-roadmap-id").value;
  const year = document.getElementById("fr-roadmap-year").value;
  const team = document.getElementById("fr-roadmap-team").value;
  if (!year || !team) {
    showToast("Hãy chọn đủ Năm và Team.");
    return;
  }
  try {
    await api(`/api/feature-requests/${id}/to-roadmap${deptParam("?")}`, {
      method: "POST",
      body: JSON.stringify({ year: Number(year), team }),
    });
    document.getElementById("fr-roadmap-dialog").close();
    await loadFeatureRequests();
    showToast("Đã đưa vào Roadmap năm.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

function frResetPageAndRender() {
  frPagination.reset();
  renderFeatureRequestTable();
}
document.getElementById("fr-filter-search")?.addEventListener("input", frResetPageAndRender);
document.getElementById("fr-filter-status")?.addEventListener("change", frResetPageAndRender);
document.getElementById("fr-filter-he-thong")?.addEventListener("change", frResetPageAndRender);
document.getElementById("fr-filter-target-dept")?.addEventListener("change", frResetPageAndRender);

// ---- Import Excel biểu mẫu Quy trình số hóa ----

document.getElementById("download-fr-template-btn")?.addEventListener("click", () => {
  window.location.href = `/api/feature-requests/import-template${deptParam("?")}`;
});

document.getElementById("import-fr-btn")?.addEventListener("click", () => {
  if (state.currentDepartmentId == null) {
    showToast("Hãy chọn phòng ban ở sidebar trước khi nhập Excel.");
    return;
  }
  document.getElementById("fr-import-input").click();
});

document.getElementById("fr-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("fr-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    // Body là bytes thô .xlsx — fetch() thẳng thay vì api() vì Content-Type
    // là kiểu file (giống import Nhân sự ở 03-members.js).
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/feature-requests/import${deptParam("?")}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadFeatureRequests();

    // Phòng ban đích lấy theo cột "Phòng ban thực hiện" trong file (khớp
    // theo tên/mã phòng); dòng TRỐNG cột này thì về phòng đang xem — hộp
    // thư của phòng đó hiển thị theo phòng đề xuất HOẶC phòng đích nên
    // người import luôn thấy được các dòng mình vừa nhập.
    let msg = `Đã nhập ${result.imported} yêu cầu (Phòng ban đích lấy theo cột "Phòng ban thực hiện" trong file; trống thì về phòng đang xem).`;
    if (result.skipped?.length) {
      const detail = result.skipped
        .slice(0, 5)
        .map((s) => `dòng ${s.row}${s.label ? ` (${s.label})` : ""}: ${s.reason}`)
        .join("; ");
      const more = result.skipped.length > 5 ? `; +${result.skipped.length - 5} dòng khác` : "";
      showToast(`${msg} Bỏ qua ${result.skipped.length} dòng — ${detail}${more}`, "error");
    } else {
      showToast(msg, "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Thanh cuộn ngang phía trên bảng Yêu cầu tính năng ----
// Nhân bản setupTaskScrollTopSync() ở 04-tasks.js: bảng có tới 19 cột dữ
// liệu, thanh cuộn ngang mặc định của trình duyệt chỉ nằm ở CUỐI bảng
// (#fr-table-wrap) — phải cuộn dọc hết bảng mới thấy để kéo qua lại. Thêm
// 1 thanh giả (#fr-table-scroll-top) PHÍA TRÊN, đồng bộ 2 chiều với thanh
// thật bên dưới; bề rộng thanh giả (spacer) khớp đúng scrollWidth thật của
// bảng qua ResizeObserver — tự cập nhật mỗi khi bảng đổi kích thước (đổi
// trang, ẩn/hiện cột qua menu "Cột hiển thị", resize cửa sổ...).
function setupFrScrollTopSync() {
  const top = document.getElementById("fr-table-scroll-top");
  const spacer = document.getElementById("fr-table-scroll-top-spacer");
  const wrap = document.getElementById("fr-table-wrap");
  const table = document.getElementById("fr-table");
  if (!top || !spacer || !wrap || !table) return;

  function syncWidth() {
    spacer.style.width = `${table.scrollWidth}px`;
    // Bảng không cần cuộn ngang (màn hình đủ rộng) thì ẩn hẳn thanh giả,
    // đỡ chiếm chỗ vô ích.
    top.hidden = table.scrollWidth <= wrap.clientWidth;
  }

  // Cờ chặn vòng lặp vô hạn (2 bên cùng lắng nghe "scroll" của nhau, set
  // scrollLeft của bên kia lại kích hoạt sự kiện "scroll" của chính nó).
  let syncing = false;
  top.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    wrap.scrollLeft = top.scrollLeft;
    syncing = false;
  });
  wrap.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    top.scrollLeft = wrap.scrollLeft;
    syncing = false;
  });

  syncWidth();
  new ResizeObserver(syncWidth).observe(table);
  window.addEventListener("resize", syncWidth);
}
setupFrScrollTopSync();
