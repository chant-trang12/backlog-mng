// ---- Trang "Quản lý tính năng số hoá" ----
// Danh sách các tính năng cần quản lý: bộ lọc (Module, Giai đoạn, TN/MH,
// Đơn vị chủ trì + tìm từ khóa), Thêm mới/Sửa (1 dialog chung), Xem chi tiết
// (dialog tạm để trống — chờ mô tả yêu cầu sau), Xóa; bảng 11 cột có scroll
// ngang + phân trang; Tải excel mẫu / Import Excel / Xuất Excel.

// Ô text dài trong bảng — cắt tối đa 3 dòng (giống frClamp ở
// 10-feature-requests.js); title giữ nguyên văn để rê chuột đọc đủ.
function dfClamp(text) {
  const value = text ?? "";
  if (!value) return `<span class="muted">—</span>`;
  return `<div class="fr-clamp" title="${value.replace(/"/g, "&quot;")}">${value.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
}

// Ô text hiển thị ĐẦY ĐỦ (không cắt "…") — dùng cho bảng màn hình trong
// trang chi tiết vì các dòng này không có màn xem chi tiết riêng.
function dfFull(text) {
  const value = text ?? "";
  if (!value) return `<span class="muted">—</span>`;
  return `<div>${value.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
}

// Ký hiệu quyền quy ước (một ô có thể gộp nhiều chữ cái, VD "CEA") — khớp
// bảng ký hiệu trong tài liệu mô tả (V xem, C tạo, E sửa, D hủy, A duyệt,
// X xuất, S cấu hình).
const DFS_PERM_LEGEND = {
  V: "View – Xem",
  C: "Create – Tạo mới",
  E: "Edit – Sửa",
  D: "Delete/Cancel – Hủy, xóa mềm",
  A: "Approve/Confirm – Phê duyệt, xác nhận, khóa",
  X: "Export – Xuất báo cáo/file",
  S: "Setup – Cấu hình (rule, danh mục, mẫu)",
};

// Phân rã chuỗi ký hiệu quyền ("VCEX") thành các badge riêng từng chữ cái
// (title = ý nghĩa); rỗng -> "—" (không có quyền). Chuỗi không theo ký hiệu
// quy ước thì giữ nguyên văn.
function dfPermBadges(value) {
  if (!value) return `<span class="muted">—</span>`;
  const symbols = String(value).toUpperCase().match(/[VCEDAXS]/g);
  if (!symbols) return dfFull(value);
  return symbols
    .map((s) => `<span class="perm-badge perm-${s.toLowerCase()}" title="${DFS_PERM_LEGEND[s] ?? s}">${s}</span>`)
    .join("");
}

// Bộ lọc hiện tại (select + tìm từ khóa) — áp trên state.digitalFeatures
// (server trả toàn bộ danh sách chưa xóa, lọc thêm ở FE giống bảng Yêu cầu
// tính năng).
function filteredDigitalFeatures() {
  const search = (document.getElementById("df-filter-search")?.value ?? "").trim().toLowerCase();
  const module = document.getElementById("df-filter-module")?.value ?? "";
  const giaiDoan = document.getElementById("df-filter-giai-doan")?.value ?? "";
  const donVi = document.getElementById("df-filter-don-vi")?.value ?? "";
  return state.digitalFeatures.filter((r) => {
    if (search) {
      const haystack = [
        r.ma,
        r.module,
        r.don_vi_chu_tri,
        r.don_vi_phoi_hop,
        r.giai_doan,
        r.tn_mh,
        r.muc_tieu_nghiep_vu,
        r.vai_tro_pbdkd,
        r.nhan_dau_vao_tu,
        r.chuyen_dau_ra_toi,
      ]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (module && (r.module ?? "") !== module) return false;
    if (giaiDoan && (r.giai_doan ?? "") !== giaiDoan) return false;
    if (donVi && (r.don_vi_chu_tri ?? "") !== donVi) return false;
    return true;
  });
}

// Đổ lại options cho các select lọc từ giá trị thực có trong dữ liệu (không
// tạo option rỗng/trùng) — giữ giá trị đang chọn nếu vẫn còn tồn tại.
function populateDfFilterOptions() {
  const configs = [
    { id: "df-filter-module", key: "module" },
    { id: "df-filter-giai-doan", key: "giai_doan" },
    { id: "df-filter-don-vi", key: "don_vi_chu_tri" },
  ];
  for (const cfg of configs) {
    const select = document.getElementById(cfg.id);
    if (!select) continue;
    const current = select.value;
    const values = [...new Set(state.digitalFeatures.map((r) => (r[cfg.key] ?? "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "vi"),
    );
    select.innerHTML =
      `<option value="">Tất cả</option>` +
      values.map((v) => `<option value="${v.replace(/"/g, "&quot;")}">${v.replace(/</g, "&lt;")}</option>`).join("");
    if (values.includes(current)) select.value = current;
  }
}

async function loadDigitalFeatures() {
  state.digitalFeatures = await api("/api/digital-features");
  // Dọn lựa chọn trỏ tới dòng đã bị xóa (bởi mình hoặc phiên khác).
  const dfIds = new Set(state.digitalFeatures.map((r) => r.id));
  state.selectedDigitalFeatureIds.forEach((id) => {
    if (!dfIds.has(id)) state.selectedDigitalFeatureIds.delete(id);
  });
  populateDfFilterOptions();
  dfPagination.reset();
  renderDigitalFeatures();
}

// ---- Menu "Cột hiển thị" — ẩn/hiện cột bảng, nhân bản initFrColumnMenu ở
// 10-feature-requests.js (nguồn gốc là bảng Nhiệm vụ). Cột Module KHÔNG cho
// ẩn (nhận diện dòng, giống cột "Tiêu đề"/"Nhiệm vụ" ở bảng khác); STT và
// Action cũng luôn hiển thị. Tuỳ chọn lưu localStorage theo máy.
const DF_TOGGLEABLE_COLUMNS = [
  { key: "ma", label: "Mã" },
  { key: "don_vi_chu_tri", label: "Đơn vị chủ trì (đề xuất)" },
  { key: "don_vi_phoi_hop", label: "Đơn vị phối hợp" },
  { key: "giai_doan", label: "Giai đoạn" },
  { key: "tn_mh", label: "TN / MH" },
  { key: "muc_tieu_nghiep_vu", label: "Mục tiêu nghiệp vụ" },
  { key: "vai_tro_pbdkd", label: "Vai trò P.BĐKD" },
  { key: "nhan_dau_vao_tu", label: "Nhận đầu vào từ" },
  { key: "chuyen_dau_ra_toi", label: "Chuyển đầu ra tới" },
];
const DF_COL_LS_KEY = "backlog.dfColumns.hiddenV1";

function loadHiddenDfColumns() {
  try {
    const raw = localStorage.getItem(DF_COL_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh, site data bị khoá) —
    // bỏ qua, chỉ mất tuỳ chọn ẩn cột đã lưu trước đó trên máy này.
    return new Set();
  }
}

function saveHiddenDfColumns() {
  try {
    localStorage.setItem(DF_COL_LS_KEY, JSON.stringify([...state.hiddenDfColumns]));
  } catch {
    // Không lưu được thì bỏ qua — tuỳ chọn vẫn áp dụng cho phiên hiện tại,
    // chỉ không nhớ lại cho lần sau.
  }
}

function isDfColHidden(key) {
  return state.hiddenDfColumns.has(key);
}

// Đồng bộ thuộc tính hidden của các <th> tiêu đề theo đúng tuỳ chọn đã lưu —
// header là markup tĩnh nên cần hàm riêng, gọi lúc khởi động trang và mỗi
// lần vẽ lại bảng (renderDigitalFeatures).
function applyDfColumnHeaderVisibility() {
  DF_TOGGLEABLE_COLUMNS.forEach(({ key }) => {
    const th = document.querySelector(`#df-table thead [data-col="${key}"]`);
    if (!th) return;
    th.hidden = isDfColHidden(key);
  });
}

function renderDfColMenu() {
  const list = document.getElementById("df-col-menu-list");
  list.innerHTML = DF_TOGGLEABLE_COLUMNS.map(
    ({ key, label }) => `
    <label class="col-menu-item">
      <input type="checkbox" class="df-col-checkbox" data-col-key="${key}" ${isDfColHidden(key) ? "" : "checked"} />
      ${label}
    </label>`,
  ).join("");
  list.querySelectorAll(".df-col-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      if (e.target.checked) state.hiddenDfColumns.delete(key);
      else state.hiddenDfColumns.add(key);
      saveHiddenDfColumns();
      renderDigitalFeatures();
    });
  });
}

function openDfColMenu() {
  renderDfColMenu();
  document.getElementById("df-col-menu").hidden = false;
  document.getElementById("df-col-menu-btn").setAttribute("aria-expanded", "true");
}

function closeDfColMenu() {
  document.getElementById("df-col-menu").hidden = true;
  document.getElementById("df-col-menu-btn").setAttribute("aria-expanded", "false");
}

function initDfColumnMenu() {
  state.hiddenDfColumns = loadHiddenDfColumns();
  applyDfColumnHeaderVisibility();

  const menuWrap = document.getElementById("df-col-menu-wrap");
  const menuBtn = document.getElementById("df-col-menu-btn");
  const menu = document.getElementById("df-col-menu");
  if (!menuWrap || !menuBtn || !menu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openDfColMenu();
    else closeDfColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menuWrap.contains(e.target)) closeDfColMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDfColMenu();
  });
  document.getElementById("df-col-menu-reset").addEventListener("click", () => {
    state.hiddenDfColumns.clear();
    saveHiddenDfColumns();
    applyDfColumnHeaderVisibility();
    renderDigitalFeatures();
  });
}
initDfColumnMenu();

// Chọn nhiều để xóa hàng loạt — CHỈ admin (nút "Xóa đã chọn" mang class
// "delete-action", tự ẩn với viewer/editor qua CSS role, khớp luật chặn
// thật ở server — requireAdmin gắn riêng cho path "delete-selected", xem
// app.ts). Checkbox từng dòng/chọn tất cả vẫn hiện với mọi quyền — chỉ nút
// Xóa mới ẩn, không phải cả cột (giống bảng Yêu cầu tính năng).
function updateDfSelectionUI() {
  const visible = filteredDigitalFeatures();
  const visibleSelectedCount = visible.filter((r) => state.selectedDigitalFeatureIds.has(r.id)).length;
  const btn = document.getElementById("delete-selected-df-btn");
  const countEl = document.getElementById("selected-df-count");
  const selectAll = document.getElementById("df-select-all");
  if (btn) btn.hidden = state.selectedDigitalFeatureIds.size === 0;
  if (countEl) countEl.textContent = String(state.selectedDigitalFeatureIds.size);
  if (selectAll) {
    selectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderDigitalFeatures() {
  const tbody = document.getElementById("df-tbody");
  const empty = document.getElementById("df-empty");
  if (!tbody) return;
  // Header là markup tĩnh — đồng bộ lại hidden mỗi lần vẽ (menu "Cột hiển
  // thị" đổi tuỳ chọn rồi gọi renderDigitalFeatures).
  applyDfColumnHeaderVisibility();
  const colHidden = (key) => (isDfColHidden(key) ? "hidden" : "");
  const rows = filteredDigitalFeatures();
  empty.hidden = rows.length > 0;
  const pageItems = dfPagination.slice(rows);
  const pageStart = (dfPagination.page - 1) * dfPagination.pageSize;

  tbody.innerHTML = pageItems
    .map((r, idx) => {
      return `
    <tr data-id="${r.id}">
      <td><input type="checkbox" class="df-row-checkbox" ${state.selectedDigitalFeatureIds.has(r.id) ? "checked" : ""} /></td>
      <td>${pageStart + idx + 1}</td>
      <td data-col="ma" ${colHidden("ma")}>${r.ma ? `<span class="pill" title="Mã tính năng">${r.ma.replace(/</g, "&lt;")}</span>` : `<span class="muted">—</span>`}</td>
      <td>${dfClamp(r.module)}</td>
      <td data-col="don_vi_chu_tri" ${colHidden("don_vi_chu_tri")}>${dfClamp(r.don_vi_chu_tri)}</td>
      <td data-col="don_vi_phoi_hop" ${colHidden("don_vi_phoi_hop")}>${dfClamp(r.don_vi_phoi_hop)}</td>
      <td data-col="giai_doan" ${colHidden("giai_doan")}>${dfClamp(r.giai_doan)}</td>
      <td data-col="tn_mh" ${colHidden("tn_mh")}>${dfClamp(r.tn_mh)}</td>
      <td data-col="muc_tieu_nghiep_vu" ${colHidden("muc_tieu_nghiep_vu")}>${dfClamp(r.muc_tieu_nghiep_vu)}</td>
      <td data-col="vai_tro_pbdkd" ${colHidden("vai_tro_pbdkd")}>${dfClamp(r.vai_tro_pbdkd)}</td>
      <td data-col="nhan_dau_vao_tu" ${colHidden("nhan_dau_vao_tu")}>${dfClamp(r.nhan_dau_vao_tu)}</td>
      <td data-col="chuyen_dau_ra_toi" ${colHidden("chuyen_dau_ra_toi")}>${dfClamp(r.chuyen_dau_ra_toi)}</td>
      <td>
        <div class="actions-cell" style="justify-content:flex-start;gap:2px">
          <button type="button" class="small btn-view icon-btn df-view-btn" data-id="${r.id}" title="Xem chi tiết"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-eye"/></svg></button>
          <button type="button" class="small btn-edit icon-btn df-edit-btn" data-id="${r.id}" title="Sửa"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-pen"/></svg></button>
          <button type="button" class="small btn-delete icon-btn df-del-btn" data-id="${r.id}" title="Xoá"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-trash"/></svg></button>
        </div>
      </td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".df-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => openDigitalFeatureDetail(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".df-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedDigitalFeatureIds.add(id);
      } else {
        state.selectedDigitalFeatureIds.delete(id);
      }
      updateDfSelectionUI();
    });
  });
  tbody.querySelectorAll(".df-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openDigitalFeatureDialog(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".df-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = state.digitalFeatures.find((r) => r.id === Number(btn.dataset.id));
      if (
        !(await confirmDialog(`Xoá tính năng số hoá${item?.module ? ` "${item.module}"` : ""}?`, { danger: true }))
      )
        return;
      try {
        await api(`/api/digital-features/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Đã xoá.", "success");
        await loadDigitalFeatures();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  updateDfSelectionUI();
}

document.getElementById("df-select-all")?.addEventListener("change", (e) => {
  const visible = filteredDigitalFeatures();
  if (e.target.checked) {
    visible.forEach((r) => state.selectedDigitalFeatureIds.add(r.id));
  } else {
    visible.forEach((r) => state.selectedDigitalFeatureIds.delete(r.id));
  }
  renderDigitalFeatures();
});

document.getElementById("delete-selected-df-btn")?.addEventListener("click", async () => {
  const ids = [...state.selectedDigitalFeatureIds];
  if (ids.length === 0) return;
  if (!(await confirmDialog(`Xóa ${ids.length} tính năng số hoá đã chọn?`))) return;
  try {
    const res = await api("/api/digital-features/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedDigitalFeatureIds.clear();
    await loadDigitalFeatures();
    showToast(`Đã xóa ${res?.deleted ?? 0} tính năng.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Dialog Thêm mới / Sửa ----

function openDigitalFeatureDialog(id) {
  const item = id != null ? state.digitalFeatures.find((r) => r.id === id) : null;
  document.getElementById("df-dialog-title").textContent = item ? "Sửa tính năng số hoá" : "Thêm tính năng số hoá";
  document.getElementById("df-id").value = item?.id ?? "";
  document.getElementById("df-ma").value = item?.ma ?? "";
  document.getElementById("df-ma").disabled = !!item; // mã không cho sửa sau khi tạo (mã là nhận diện)
  document.getElementById("df-module").value = item?.module ?? "";
  document.getElementById("df-don-vi-chu-tri").value = item?.don_vi_chu_tri ?? "";
  document.getElementById("df-don-vi-phoi-hop").value = item?.don_vi_phoi_hop ?? "";
  document.getElementById("df-giai-doan").value = item?.giai_doan ?? "";
  document.getElementById("df-tn-mh").value = item?.tn_mh ?? "";
  document.getElementById("df-muc-tieu").value = item?.muc_tieu_nghiep_vu ?? "";
  document.getElementById("df-vai-tro").value = item?.vai_tro_pbdkd ?? "";
  document.getElementById("df-nhan-dau-vao").value = item?.nhan_dau_vao_tu ?? "";
  document.getElementById("df-chuyen-dau-ra").value = item?.chuyen_dau_ra_toi ?? "";
  document.getElementById("digital-feature-dialog").showModal();
}

document.getElementById("add-digital-feature-btn")?.addEventListener("click", () => openDigitalFeatureDialog(null));

document.getElementById("digital-feature-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("df-id").value;
  const body = {
    module: document.getElementById("df-module").value.trim(),
    don_vi_chu_tri: document.getElementById("df-don-vi-chu-tri").value.trim() || undefined,
    don_vi_phoi_hop: document.getElementById("df-don-vi-phoi-hop").value.trim() || undefined,
    giai_doan: document.getElementById("df-giai-doan").value.trim() || undefined,
    tn_mh: document.getElementById("df-tn-mh").value.trim() || undefined,
    muc_tieu_nghiep_vu: document.getElementById("df-muc-tieu").value.trim() || undefined,
    vai_tro_pbdkd: document.getElementById("df-vai-tro").value.trim() || undefined,
    nhan_dau_vao_tu: document.getElementById("df-nhan-dau-vao").value.trim() || undefined,
    chuyen_dau_ra_toi: document.getElementById("df-chuyen-dau-ra").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/digital-features/${id}`, { method: "PUT", body: JSON.stringify(body) });
      showToast("Đã lưu thay đổi.", "success");
    } else {
      const ma = document.getElementById("df-ma").value.trim();
      if (ma) body.ma = ma;
      await api("/api/digital-features", { method: "POST", body: JSON.stringify(body) });
      showToast("Đã thêm tính năng số hoá.", "success");
    }
    document.getElementById("digital-feature-dialog").close();
    await loadDigitalFeatures();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Trang chi tiết (màn hình riêng) — mở bằng icon "Xem chi tiết" ở
// bảng, quay lại bằng nút "← Quay lại". Nội dung chia tab giống menu CSKH
// (chrome-tabs + pill), hiện đang để placeholder chờ mô tả từng tab. ----

const DF_DETAIL_TABS = ["module-info", "screens", "master-data", "data-lifecycle", "integration"];

// Chuyển tab — cùng cách CSKH làm ở 05-cskh.js (bấm pill -> đổi active +
// ẩn/hiện section theo id `df-detail-tab-<tab>`).
document.querySelectorAll("#df-detail-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#df-detail-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    DF_DETAIL_TABS.forEach((tab) => {
      document.getElementById(`df-detail-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

// Luôn mở ở tab đầu ("Thông tin Module") bất kể lần trước đang ở tab nào.
function resetDigitalFeatureDetailTabs() {
  document.querySelectorAll("#df-detail-subnav .pill").forEach((p) => p.classList.remove("active"));
  document.querySelector('#df-detail-subnav .pill[data-tab="module-info"]')?.classList.add("active");
  DF_DETAIL_TABS.forEach((tab) => {
    document.getElementById(`df-detail-tab-${tab}`).hidden = tab !== "module-info";
  });
}

// Điền 1 trường trong khối "Thông tin Module" — trống hiển thị "—" mờ.
function setDfInfoCell(id, value) {
  const cell = document.getElementById(id);
  cell.textContent = value || "—";
  cell.classList.toggle("muted", !value);
}

function renderDigitalFeatureInfo(item) {
  setDfInfoCell("df-info-don-vi-chu-tri", item.don_vi_chu_tri);
  setDfInfoCell("df-info-don-vi-phoi-hop", item.don_vi_phoi_hop);
  setDfInfoCell("df-info-vai-tro-pbdkd", item.vai_tro_pbdkd);
  setDfInfoCell("df-info-giai-doan", item.giai_doan);
  setDfInfoCell("df-info-muc-tieu", item.muc_tieu_nghiep_vu);
  setDfInfoCell("df-info-tn-mh", item.tn_mh);
  setDfInfoCell("df-info-nhan-dau-vao", item.nhan_dau_vao_tu);
  setDfInfoCell("df-info-chuyen-dau-ra", item.chuyen_dau_ra_toi);
}

function openDigitalFeatureDetail(id) {
  const item = state.digitalFeatures.find((r) => r.id === id);
  if (!item) return;
  state.currentDigitalFeatureId = id;
  document.getElementById("df-detail-page-title").textContent = item.module || "Chi tiết tính năng số hoá";
  const maBadge = document.getElementById("df-detail-page-ma");
  maBadge.textContent = item.ma ?? "";
  maBadge.hidden = !item.ma;
  renderDigitalFeatureInfo(item);
  resetDigitalFeatureDetailTabs();
  loadDigitalFeatureScreens(id).catch((err) => showToast(err.message));
  loadDigitalFeatureMasterData(id).catch((err) => showToast(err.message));
  loadDigitalFeatureDataObjects(id).catch((err) => showToast(err.message));
  // Ẩn trang danh sách, hiện trang chi tiết (trang này cũng nằm trong
  // `pages` ở 09-main.js nên user bấm sang mục menu khác thì tự ẩn).
  document.getElementById("page-digital-features").hidden = true;
  document.getElementById("page-digital-feature-detail").hidden = false;
  window.scrollTo(0, 0);
}

document.getElementById("df-detail-back-btn")?.addEventListener("click", () => {
  document.getElementById("page-digital-feature-detail").hidden = true;
  document.getElementById("page-digital-features").hidden = false;
});

// Nút Hủy (form) — đóng popup không lưu, cùng cách các dialog khác trong
// hệ thống gắn listener riêng theo id (xem feature-request-cancel-btn ở
// 10-feature-requests.js). Nút X góc trên và bấm ra backdrop đã có handler
// ủy quyền dùng chung (01-state.js).
document.getElementById("digital-feature-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("digital-feature-dialog").close();
});

// ---- Bộ lọc + tìm kiếm ----

for (const id of ["df-filter-module", "df-filter-giai-doan", "df-filter-don-vi"]) {
  document.getElementById(id)?.addEventListener("change", () => {
    dfPagination.reset();
    renderDigitalFeatures();
  });
}
document.getElementById("df-filter-search")?.addEventListener("input", () => {
  dfPagination.reset();
  renderDigitalFeatures();
});

// ---- Tải excel mẫu / Import Excel / Xuất Excel ----

document.getElementById("download-df-template-btn")?.addEventListener("click", () => {
  window.location.href = "/api/digital-features/import-template";
});

document.getElementById("export-df-btn")?.addEventListener("click", () => {
  // Xuất đúng dữ liệu đang lọc ở bảng (search + các select) — server lọc
  // lại theo cùng tham số.
  const params = new URLSearchParams();
  const search = (document.getElementById("df-filter-search")?.value ?? "").trim();
  if (search) params.set("search", search);
  const module = document.getElementById("df-filter-module")?.value ?? "";
  if (module) params.set("module", module);
  const giaiDoan = document.getElementById("df-filter-giai-doan")?.value ?? "";
  if (giaiDoan) params.set("giai_doan", giaiDoan);
  const donVi = document.getElementById("df-filter-don-vi")?.value ?? "";
  if (donVi) params.set("don_vi_chu_tri", donVi);
  const query = params.toString();
  window.location.href = `/api/digital-features/export${query ? `?${query}` : ""}`;
});

document.getElementById("import-df-btn")?.addEventListener("click", () => {
  document.getElementById("df-import-input").click();
});

document.getElementById("df-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("df-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    // Body là bytes thô .xlsx — fetch() thẳng thay vì api() vì Content-Type
    // là kiểu file (giống import Yêu cầu tính năng ở 10-feature-requests.js).
    const buffer = await file.arrayBuffer();
    const res = await fetch("/api/digital-features/import", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadDigitalFeatures();

    let msg = `Đã nhập ${result.imported} tính năng.`;
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

// ---- Thanh cuộn ngang phía trên bảng (nhân bản setupFrScrollTopSync ở
// 10-feature-requests.js) — bảng 11 cột, thanh cuộn mặc định nằm ở cuối bảng
// nên thêm 1 thanh giả phía trên, đồng bộ 2 chiều với .table-wrap thật. ----
(function setupDfScrollTopSync() {
  const fake = document.getElementById("df-table-scroll-top");
  const spacer = document.getElementById("df-table-scroll-top-spacer");
  const real = document.getElementById("df-table-wrap");
  if (!fake || !spacer || !real) return;
  const syncSpacer = () => {
    spacer.style.width = `${real.scrollWidth}px`;
  };
  fake.addEventListener("scroll", () => {
    real.scrollLeft = fake.scrollLeft;
  });
  real.addEventListener("scroll", () => {
    fake.scrollLeft = real.scrollLeft;
  });
  new ResizeObserver(syncSpacer).observe(real);
  syncSpacer();
})();

// ==================== Tab "Màn hình, Tính năng & Phân quyền" ====================
// Bảng màn hình/chức năng của từng tính năng số hoá — CRUD riêng
// (/api/digital-features/:id/screens + /api/digital-feature-screens/:id),
// nhân bản cấu trúc bảng Tính năng số hoá ở trên.

async function loadDigitalFeatureScreens(featureId) {
  state.digitalFeatureScreens = await api(`/api/digital-features/${featureId}/screens`);
  const ids = new Set(state.digitalFeatureScreens.map((r) => r.id));
  state.selectedDfScreenIds.forEach((id) => {
    if (!ids.has(id)) state.selectedDfScreenIds.delete(id);
  });
  dfsPagination.reset();
  renderDigitalFeatureScreens();
}

// ---- Menu "Cấu hình cột" — nhân bản initDfColumnMenu ở trên. Cột "Tên màn
// hình / chức năng" KHÔNG cho ẩn (nhận diện dòng); STT và Action luôn hiển thị.
const DFS_TOGGLEABLE_COLUMNS = [
  { key: "ma_mh", label: "Mã MH" },
  { key: "tn", label: "TN" },
  { key: "loai", label: "Loại" },
  { key: "thanh_phan_chinh", label: "Thành phần chính / trường dữ liệu" },
  { key: "hanh_dong", label: "Hành động (nút / thao tác)" },
  { key: "quy_tac_nghiep_vu", label: "Quy tắc nghiệp vụ & kiểm tra" },
  { key: "sales_am", label: "Sales / AM" },
  { key: "truong_dvkd", label: "Trưởng đơn vị KD" },
  { key: "presales_sp", label: "Presales / Sản phẩm" },
  { key: "nv_bdkd", label: "NV BĐKD (thực thi)" },
  { key: "ks_lanh_dao_bdkd", label: "Kiểm soát / Lãnh đạo BĐKD" },
  { key: "phap_che", label: "Pháp chế" },
  { key: "tckt", label: "TCKT" },
  { key: "ban_lanh_dao", label: "Ban lãnh đạo" },
  { key: "quan_tri_he_thong", label: "Quản trị hệ thống" },
];
const DFS_COL_LS_KEY = "backlog.dfScreenColumns.hiddenV1";

function loadHiddenDfScreenColumns() {
  try {
    const raw = localStorage.getItem(DFS_COL_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveHiddenDfScreenColumns() {
  try {
    localStorage.setItem(DFS_COL_LS_KEY, JSON.stringify([...state.hiddenDfScreenColumns]));
  } catch {
    // Không lưu được thì bỏ qua — tuỳ chọn vẫn áp dụng cho phiên hiện tại.
  }
}

function isDfScreenColHidden(key) {
  return state.hiddenDfScreenColumns.has(key);
}

function applyDfScreenColumnHeaderVisibility() {
  DFS_TOGGLEABLE_COLUMNS.forEach(({ key }) => {
    const th = document.querySelector(`#dfs-table thead [data-col="${key}"]`);
    if (!th) return;
    th.hidden = isDfScreenColHidden(key);
  });
}

function renderDfScreenColMenu() {
  const list = document.getElementById("dfs-col-menu-list");
  list.innerHTML = DFS_TOGGLEABLE_COLUMNS.map(
    ({ key, label }) => `
    <label class="col-menu-item">
      <input type="checkbox" class="dfs-col-checkbox" data-col-key="${key}" ${isDfScreenColHidden(key) ? "" : "checked"} />
      ${label}
    </label>`,
  ).join("");
  list.querySelectorAll(".dfs-col-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      if (e.target.checked) state.hiddenDfScreenColumns.delete(key);
      else state.hiddenDfScreenColumns.add(key);
      saveHiddenDfScreenColumns();
      renderDigitalFeatureScreens();
    });
  });
}

function openDfScreenColMenu() {
  renderDfScreenColMenu();
  document.getElementById("dfs-col-menu").hidden = false;
  document.getElementById("dfs-col-menu-btn").setAttribute("aria-expanded", "true");
}

function closeDfScreenColMenu() {
  document.getElementById("dfs-col-menu").hidden = true;
  document.getElementById("dfs-col-menu-btn").setAttribute("aria-expanded", "false");
}

function initDfScreenColumnMenu() {
  state.hiddenDfScreenColumns = loadHiddenDfScreenColumns();
  applyDfScreenColumnHeaderVisibility();

  const menuWrap = document.getElementById("dfs-col-menu-wrap");
  const menuBtn = document.getElementById("dfs-col-menu-btn");
  const menu = document.getElementById("dfs-col-menu");
  if (!menuWrap || !menuBtn || !menu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openDfScreenColMenu();
    else closeDfScreenColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menuWrap.contains(e.target)) closeDfScreenColMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDfScreenColMenu();
  });
  document.getElementById("dfs-col-menu-reset").addEventListener("click", () => {
    state.hiddenDfScreenColumns.clear();
    saveHiddenDfScreenColumns();
    applyDfScreenColumnHeaderVisibility();
    renderDigitalFeatureScreens();
  });
}
initDfScreenColumnMenu();

// Checkbox chọn nhiều + nút "Xóa đã chọn" — chỉ admin (class delete-action,
// xem chú thích bảng Tính năng số hoá).
function updateDfScreenSelectionUI() {
  const visible = state.digitalFeatureScreens;
  const visibleSelectedCount = visible.filter((r) => state.selectedDfScreenIds.has(r.id)).length;
  const btn = document.getElementById("delete-selected-dfs-btn");
  const countEl = document.getElementById("selected-dfs-count");
  const selectAll = document.getElementById("dfs-select-all");
  if (btn) btn.hidden = state.selectedDfScreenIds.size === 0;
  if (countEl) countEl.textContent = String(state.selectedDfScreenIds.size);
  if (selectAll) {
    selectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderDigitalFeatureScreens() {
  const tbody = document.getElementById("dfs-tbody");
  const empty = document.getElementById("dfs-empty");
  if (!tbody) return;
  applyDfScreenColumnHeaderVisibility();
  const colHidden = (key) => (isDfScreenColHidden(key) ? "hidden" : "");
  const rows = state.digitalFeatureScreens;
  empty.hidden = rows.length > 0;
  const pageItems = dfsPagination.slice(rows);
  const pageStart = (dfsPagination.page - 1) * dfsPagination.pageSize;

  tbody.innerHTML = pageItems
    .map((r, idx) => `
    <tr data-id="${r.id}">
      <td><input type="checkbox" class="dfs-row-checkbox" ${state.selectedDfScreenIds.has(r.id) ? "checked" : ""} /></td>
      <td>${pageStart + idx + 1}</td>
      <td data-col="ma_mh" ${colHidden("ma_mh")}>${r.ma_mh ? `<span class="pill" title="Mã màn hình">${r.ma_mh.replace(/</g, "&lt;")}</span>` : `<span class="muted">—</span>`}</td>
      <td data-col="tn" ${colHidden("tn")}>${dfFull(r.tn)}</td>
      <td>${dfFull(r.ten_man_hinh)}</td>
      <td data-col="loai" ${colHidden("loai")}>${dfFull(r.loai)}</td>
      <td data-col="thanh_phan_chinh" ${colHidden("thanh_phan_chinh")}>${dfFull(r.thanh_phan_chinh)}</td>
      <td data-col="hanh_dong" ${colHidden("hanh_dong")}>${dfFull(r.hanh_dong)}</td>
      <td data-col="quy_tac_nghiep_vu" ${colHidden("quy_tac_nghiep_vu")}>${dfFull(r.quy_tac_nghiep_vu)}</td>
      <td data-col="sales_am" ${colHidden("sales_am")}>${dfPermBadges(r.sales_am)}</td>
      <td data-col="truong_dvkd" ${colHidden("truong_dvkd")}>${dfPermBadges(r.truong_dvkd)}</td>
      <td data-col="presales_sp" ${colHidden("presales_sp")}>${dfPermBadges(r.presales_sp)}</td>
      <td data-col="nv_bdkd" ${colHidden("nv_bdkd")}>${dfPermBadges(r.nv_bdkd)}</td>
      <td data-col="ks_lanh_dao_bdkd" ${colHidden("ks_lanh_dao_bdkd")}>${dfPermBadges(r.ks_lanh_dao_bdkd)}</td>
      <td data-col="phap_che" ${colHidden("phap_che")}>${dfPermBadges(r.phap_che)}</td>
      <td data-col="tckt" ${colHidden("tckt")}>${dfPermBadges(r.tckt)}</td>
      <td data-col="ban_lanh_dao" ${colHidden("ban_lanh_dao")}>${dfPermBadges(r.ban_lanh_dao)}</td>
      <td data-col="quan_tri_he_thong" ${colHidden("quan_tri_he_thong")}>${dfPermBadges(r.quan_tri_he_thong)}</td>
      <td>
        <div class="actions-cell" style="justify-content:flex-start;gap:2px">
          <button type="button" class="small btn-edit icon-btn dfs-edit-btn" data-id="${r.id}" title="Sửa"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-pen"/></svg></button>
          <button type="button" class="small btn-delete icon-btn dfs-del-btn" data-id="${r.id}" title="Xoá"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-trash"/></svg></button>
        </div>
      </td>
    </tr>`)
    .join("");

  tbody.querySelectorAll(".dfs-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) state.selectedDfScreenIds.add(id);
      else state.selectedDfScreenIds.delete(id);
      updateDfScreenSelectionUI();
    });
  });
  tbody.querySelectorAll(".dfs-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openDigitalFeatureScreenDialog(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".dfs-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = state.digitalFeatureScreens.find((r) => r.id === Number(btn.dataset.id));
      if (!(await confirmDialog(`Xoá màn hình${item?.ten_man_hinh ? ` "${item.ten_man_hinh}"` : ""}?`, { danger: true }))) return;
      try {
        await api(`/api/digital-feature-screens/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Đã xoá.", "success");
        await loadDigitalFeatureScreens(state.currentDigitalFeatureId);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  updateDfScreenSelectionUI();
}

document.getElementById("dfs-select-all")?.addEventListener("change", (e) => {
  if (e.target.checked) {
    state.digitalFeatureScreens.forEach((r) => state.selectedDfScreenIds.add(r.id));
  } else {
    state.digitalFeatureScreens.forEach((r) => state.selectedDfScreenIds.delete(r.id));
  }
  renderDigitalFeatureScreens();
});

document.getElementById("delete-selected-dfs-btn")?.addEventListener("click", async () => {
  const ids = [...state.selectedDfScreenIds];
  if (ids.length === 0) return;
  if (!(await confirmDialog(`Xóa ${ids.length} màn hình đã chọn?`, { danger: true }))) return;
  try {
    const res = await api(`/api/digital-features/${state.currentDigitalFeatureId}/screens/delete-selected`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedDfScreenIds.clear();
    await loadDigitalFeatureScreens(state.currentDigitalFeatureId);
    showToast(`Đã xóa ${res?.deleted ?? 0} màn hình.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Dialog Thêm mới / Sửa màn hình ----

function openDigitalFeatureScreenDialog(id) {
  const item = id != null ? state.digitalFeatureScreens.find((r) => r.id === id) : null;
  document.getElementById("dfs-dialog-title").textContent = item ? "Sửa màn hình / chức năng" : "Thêm màn hình / chức năng";
  document.getElementById("dfs-id").value = item?.id ?? "";
  document.getElementById("dfs-ma-mh").value = item?.ma_mh ?? "";
  document.getElementById("dfs-tn").value = item?.tn ?? "";
  document.getElementById("dfs-ten-man-hinh").value = item?.ten_man_hinh ?? "";
  document.getElementById("dfs-loai").value = item?.loai ?? "";
  document.getElementById("dfs-thanh-phan").value = item?.thanh_phan_chinh ?? "";
  document.getElementById("dfs-hanh-dong").value = item?.hanh_dong ?? "";
  document.getElementById("dfs-quy-tac").value = item?.quy_tac_nghiep_vu ?? "";
  document.getElementById("dfs-sales-am").value = item?.sales_am ?? "";
  document.getElementById("dfs-truong-dvkd").value = item?.truong_dvkd ?? "";
  document.getElementById("dfs-presales-sp").value = item?.presales_sp ?? "";
  document.getElementById("dfs-nv-bdkd").value = item?.nv_bdkd ?? "";
  document.getElementById("dfs-ks-lanh-dao").value = item?.ks_lanh_dao_bdkd ?? "";
  document.getElementById("dfs-phap-che").value = item?.phap_che ?? "";
  document.getElementById("dfs-tckt").value = item?.tckt ?? "";
  document.getElementById("dfs-ban-lanh-dao").value = item?.ban_lanh_dao ?? "";
  document.getElementById("dfs-quan-tri-he-thong").value = item?.quan_tri_he_thong ?? "";
  document.getElementById("digital-feature-screen-dialog").showModal();
}

document.getElementById("add-df-screen-btn")?.addEventListener("click", () => openDigitalFeatureScreenDialog(null));

document.getElementById("digital-feature-screen-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("dfs-id").value;
  const body = {
    tn: document.getElementById("dfs-tn").value.trim() || undefined,
    ten_man_hinh: document.getElementById("dfs-ten-man-hinh").value.trim(),
    loai: document.getElementById("dfs-loai").value.trim() || undefined,
    thanh_phan_chinh: document.getElementById("dfs-thanh-phan").value.trim() || undefined,
    hanh_dong: document.getElementById("dfs-hanh-dong").value.trim() || undefined,
    quy_tac_nghiep_vu: document.getElementById("dfs-quy-tac").value.trim() || undefined,
    sales_am: document.getElementById("dfs-sales-am").value.trim() || undefined,
    truong_dvkd: document.getElementById("dfs-truong-dvkd").value.trim() || undefined,
    presales_sp: document.getElementById("dfs-presales-sp").value.trim() || undefined,
    nv_bdkd: document.getElementById("dfs-nv-bdkd").value.trim() || undefined,
    ks_lanh_dao_bdkd: document.getElementById("dfs-ks-lanh-dao").value.trim() || undefined,
    phap_che: document.getElementById("dfs-phap-che").value.trim() || undefined,
    tckt: document.getElementById("dfs-tckt").value.trim() || undefined,
    ban_lanh_dao: document.getElementById("dfs-ban-lanh-dao").value.trim() || undefined,
    quan_tri_he_thong: document.getElementById("dfs-quan-tri-he-thong").value.trim() || undefined,
  };
  try {
    if (id) {
      const maMh = document.getElementById("dfs-ma-mh").value.trim();
      if (maMh) body.ma_mh = maMh;
      await api(`/api/digital-feature-screens/${id}`, { method: "PUT", body: JSON.stringify(body) });
      showToast("Đã lưu thay đổi.", "success");
    } else {
      const maMh = document.getElementById("dfs-ma-mh").value.trim();
      if (maMh) body.ma_mh = maMh;
      await api(`/api/digital-features/${state.currentDigitalFeatureId}/screens`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast("Đã thêm màn hình.", "success");
    }
    document.getElementById("digital-feature-screen-dialog").close();
    await loadDigitalFeatureScreens(state.currentDigitalFeatureId);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById("digital-feature-screen-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("digital-feature-screen-dialog").close();
});

// ---- File mẫu / Import Excel / Export Excel của tab màn hình ----

document.getElementById("download-dfs-template-btn")?.addEventListener("click", () => {
  window.location.href = `/api/digital-features/${state.currentDigitalFeatureId}/screens/import-template`;
});

document.getElementById("export-dfs-btn")?.addEventListener("click", () => {
  window.location.href = `/api/digital-features/${state.currentDigitalFeatureId}/screens/export`;
});

document.getElementById("import-dfs-btn")?.addEventListener("click", () => {
  document.getElementById("dfs-import-input").click();
});

document.getElementById("dfs-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("dfs-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    // Body là bytes thô .xlsx — fetch() thẳng thay vì api() vì Content-Type
    // là kiểu file (giống import Tính năng số hoá ở trên).
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/digital-features/${state.currentDigitalFeatureId}/screens/import`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadDigitalFeatureScreens(state.currentDigitalFeatureId);

    let msg = `Đã nhập ${result.imported} màn hình.`;
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

// ---- Thanh cuộn ngang phía trên bảng màn hình (nhân bản setupDfScrollTopSync). ----
(function setupDfsScrollTopSync() {
  const fake = document.getElementById("dfs-table-scroll-top");
  const spacer = document.getElementById("dfs-table-scroll-top-spacer");
  const real = document.getElementById("dfs-table-wrap");
  if (!fake || !spacer || !real) return;
  const syncSpacer = () => {
    spacer.style.width = `${real.scrollWidth}px`;
  };
  fake.addEventListener("scroll", () => {
    real.scrollLeft = fake.scrollLeft;
  });
  real.addEventListener("scroll", () => {
    fake.scrollLeft = real.scrollLeft;
  });
  new ResizeObserver(syncSpacer).observe(real);
  syncSpacer();
})();

// ==================== Tab "Danh mục (Master Data) của Module" ====================
// Nhân bản cấu trúc tab Màn hình ở trên với bảng 4 trường: Mã danh mục,
// Tên danh mục, Nội dung/thuộc tính, Quản trị bởi.

async function loadDigitalFeatureMasterData(featureId) {
  state.digitalFeatureMasterData = await api(`/api/digital-features/${featureId}/master-data`);
  const ids = new Set(state.digitalFeatureMasterData.map((r) => r.id));
  state.selectedDfMdIds.forEach((id) => {
    if (!ids.has(id)) state.selectedDfMdIds.delete(id);
  });
  dfmdPagination.reset();
  renderDigitalFeatureMasterData();
}

// ---- Menu "Cấu hình cột" — cột "Tên danh mục" KHÔNG cho ẩn (nhận diện
// dòng); STT và Action luôn hiển thị. Tuỳ chọn lưu localStorage theo máy.
const DFMD_TOGGLEABLE_COLUMNS = [
  { key: "ma_danh_muc", label: "Mã danh mục" },
  { key: "noi_dung_thuoc_tinh", label: "Nội dung / thuộc tính" },
  { key: "quan_tri_boi", label: "Quản trị bởi" },
];
const DFMD_COL_LS_KEY = "backlog.dfMdColumns.hiddenV1";

function loadHiddenDfMdColumns() {
  try {
    const raw = localStorage.getItem(DFMD_COL_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveHiddenDfMdColumns() {
  try {
    localStorage.setItem(DFMD_COL_LS_KEY, JSON.stringify([...state.hiddenDfMdColumns]));
  } catch {
    // Không lưu được thì bỏ qua — tuỳ chọn vẫn áp dụng cho phiên hiện tại.
  }
}

function isDfMdColHidden(key) {
  return state.hiddenDfMdColumns.has(key);
}

function applyDfMdColumnHeaderVisibility() {
  DFMD_TOGGLEABLE_COLUMNS.forEach(({ key }) => {
    const th = document.querySelector(`#dfmd-table thead [data-col="${key}"]`);
    if (!th) return;
    th.hidden = isDfMdColHidden(key);
  });
}

function renderDfMdColMenu() {
  const list = document.getElementById("dfmd-col-menu-list");
  list.innerHTML = DFMD_TOGGLEABLE_COLUMNS.map(
    ({ key, label }) => `
    <label class="col-menu-item">
      <input type="checkbox" class="dfmd-col-checkbox" data-col-key="${key}" ${isDfMdColHidden(key) ? "" : "checked"} />
      ${label}
    </label>`,
  ).join("");
  list.querySelectorAll(".dfmd-col-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      if (e.target.checked) state.hiddenDfMdColumns.delete(key);
      else state.hiddenDfMdColumns.add(key);
      saveHiddenDfMdColumns();
      renderDigitalFeatureMasterData();
    });
  });
}

function openDfMdColMenu() {
  renderDfMdColMenu();
  document.getElementById("dfmd-col-menu").hidden = false;
  document.getElementById("dfmd-col-menu-btn").setAttribute("aria-expanded", "true");
}

function closeDfMdColMenu() {
  document.getElementById("dfmd-col-menu").hidden = true;
  document.getElementById("dfmd-col-menu-btn").setAttribute("aria-expanded", "false");
}

function initDfMdColumnMenu() {
  state.hiddenDfMdColumns = loadHiddenDfMdColumns();
  applyDfMdColumnHeaderVisibility();

  const menuWrap = document.getElementById("dfmd-col-menu-wrap");
  const menuBtn = document.getElementById("dfmd-col-menu-btn");
  const menu = document.getElementById("dfmd-col-menu");
  if (!menuWrap || !menuBtn || !menu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openDfMdColMenu();
    else closeDfMdColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menuWrap.contains(e.target)) closeDfMdColMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDfMdColMenu();
  });
  document.getElementById("dfmd-col-menu-reset").addEventListener("click", () => {
    state.hiddenDfMdColumns.clear();
    saveHiddenDfMdColumns();
    applyDfMdColumnHeaderVisibility();
    renderDigitalFeatureMasterData();
  });
}
initDfMdColumnMenu();

// Checkbox chọn nhiều + nút "Xóa đã chọn" — chỉ admin (class delete-action).
function updateDfMdSelectionUI() {
  const visible = state.digitalFeatureMasterData;
  const visibleSelectedCount = visible.filter((r) => state.selectedDfMdIds.has(r.id)).length;
  const btn = document.getElementById("delete-selected-dfmd-btn");
  const countEl = document.getElementById("selected-dfmd-count");
  const selectAll = document.getElementById("dfmd-select-all");
  if (btn) btn.hidden = state.selectedDfMdIds.size === 0;
  if (countEl) countEl.textContent = String(state.selectedDfMdIds.size);
  if (selectAll) {
    selectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderDigitalFeatureMasterData() {
  const tbody = document.getElementById("dfmd-tbody");
  const empty = document.getElementById("dfmd-empty");
  if (!tbody) return;
  applyDfMdColumnHeaderVisibility();
  const colHidden = (key) => (isDfMdColHidden(key) ? "hidden" : "");
  const rows = state.digitalFeatureMasterData;
  empty.hidden = rows.length > 0;
  const pageItems = dfmdPagination.slice(rows);
  const pageStart = (dfmdPagination.page - 1) * dfmdPagination.pageSize;

  tbody.innerHTML = pageItems
    .map((r, idx) => `
    <tr data-id="${r.id}">
      <td><input type="checkbox" class="dfmd-row-checkbox" ${state.selectedDfMdIds.has(r.id) ? "checked" : ""} /></td>
      <td>${pageStart + idx + 1}</td>
      <td data-col="ma_danh_muc" ${colHidden("ma_danh_muc")}>${r.ma_danh_muc ? `<span class="pill" title="Mã danh mục">${r.ma_danh_muc.replace(/</g, "&lt;").replace(/-/g, "\u2011")}</span>` : `<span class="muted">—</span>`}</td>
      <td>${dfFull(r.ten_danh_muc)}</td>
      <td data-col="noi_dung_thuoc_tinh" ${colHidden("noi_dung_thuoc_tinh")}>${dfFull(r.noi_dung_thuoc_tinh)}</td>
      <td data-col="quan_tri_boi" ${colHidden("quan_tri_boi")}>${dfFull(r.quan_tri_boi)}</td>
      <td>
        <div class="actions-cell" style="justify-content:flex-start;gap:2px">
          <button type="button" class="small btn-edit icon-btn dfmd-edit-btn" data-id="${r.id}" title="Sửa"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-pen"/></svg></button>
          <button type="button" class="small btn-delete icon-btn dfmd-del-btn" data-id="${r.id}" title="Xoá"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-trash"/></svg></button>
        </div>
      </td>
    </tr>`)
    .join("");

  tbody.querySelectorAll(".dfmd-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) state.selectedDfMdIds.add(id);
      else state.selectedDfMdIds.delete(id);
      updateDfMdSelectionUI();
    });
  });
  tbody.querySelectorAll(".dfmd-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openDigitalFeatureMdDialog(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".dfmd-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = state.digitalFeatureMasterData.find((r) => r.id === Number(btn.dataset.id));
      if (!(await confirmDialog(`Xoá danh mục${item?.ten_danh_muc ? ` "${item.ten_danh_muc}"` : ""}?`, { danger: true }))) return;
      try {
        await api(`/api/digital-feature-master-data/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Đã xoá.", "success");
        await loadDigitalFeatureMasterData(state.currentDigitalFeatureId);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  updateDfMdSelectionUI();
}

document.getElementById("dfmd-select-all")?.addEventListener("change", (e) => {
  if (e.target.checked) {
    state.digitalFeatureMasterData.forEach((r) => state.selectedDfMdIds.add(r.id));
  } else {
    state.digitalFeatureMasterData.forEach((r) => state.selectedDfMdIds.delete(r.id));
  }
  renderDigitalFeatureMasterData();
});

document.getElementById("delete-selected-dfmd-btn")?.addEventListener("click", async () => {
  const ids = [...state.selectedDfMdIds];
  if (ids.length === 0) return;
  if (!(await confirmDialog(`Xóa ${ids.length} danh mục đã chọn?`, { danger: true }))) return;
  try {
    const res = await api(`/api/digital-features/${state.currentDigitalFeatureId}/master-data/delete-selected`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedDfMdIds.clear();
    await loadDigitalFeatureMasterData(state.currentDigitalFeatureId);
    showToast(`Đã xóa ${res?.deleted ?? 0} danh mục.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Dialog Thêm mới / Sửa danh mục ----

function openDigitalFeatureMdDialog(id) {
  const item = id != null ? state.digitalFeatureMasterData.find((r) => r.id === id) : null;
  document.getElementById("dfmd-dialog-title").textContent = item ? "Sửa danh mục" : "Thêm danh mục";
  document.getElementById("dfmd-id").value = item?.id ?? "";
  document.getElementById("dfmd-ma").value = item?.ma_danh_muc ?? "";
  document.getElementById("dfmd-ten").value = item?.ten_danh_muc ?? "";
  document.getElementById("dfmd-noi-dung").value = item?.noi_dung_thuoc_tinh ?? "";
  document.getElementById("dfmd-quan-tri").value = item?.quan_tri_boi ?? "";
  document.getElementById("digital-feature-md-dialog").showModal();
}

document.getElementById("add-df-md-btn")?.addEventListener("click", () => openDigitalFeatureMdDialog(null));

document.getElementById("digital-feature-md-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("dfmd-id").value;
  const body = {
    ten_danh_muc: document.getElementById("dfmd-ten").value.trim(),
    noi_dung_thuoc_tinh: document.getElementById("dfmd-noi-dung").value.trim() || undefined,
    quan_tri_boi: document.getElementById("dfmd-quan-tri").value.trim() || undefined,
  };
  const ma = document.getElementById("dfmd-ma").value.trim();
  if (ma) body.ma_danh_muc = ma;
  try {
    if (id) {
      await api(`/api/digital-feature-master-data/${id}`, { method: "PUT", body: JSON.stringify(body) });
      showToast("Đã lưu thay đổi.", "success");
    } else {
      await api(`/api/digital-features/${state.currentDigitalFeatureId}/master-data`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast("Đã thêm danh mục.", "success");
    }
    document.getElementById("digital-feature-md-dialog").close();
    await loadDigitalFeatureMasterData(state.currentDigitalFeatureId);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById("digital-feature-md-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("digital-feature-md-dialog").close();
});

// ---- File mẫu / Import Excel / Export Excel của tab danh mục ----

document.getElementById("download-dfmd-template-btn")?.addEventListener("click", () => {
  window.location.href = `/api/digital-features/${state.currentDigitalFeatureId}/master-data/import-template`;
});

document.getElementById("export-dfmd-btn")?.addEventListener("click", () => {
  window.location.href = `/api/digital-features/${state.currentDigitalFeatureId}/master-data/export`;
});

document.getElementById("import-dfmd-btn")?.addEventListener("click", () => {
  document.getElementById("dfmd-import-input").click();
});

document.getElementById("dfmd-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("dfmd-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    // Body là bytes thô .xlsx — fetch() thẳng thay vì api() vì Content-Type
    // là kiểu file (giống import tab Màn hình ở trên).
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/digital-features/${state.currentDigitalFeatureId}/master-data/import`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadDigitalFeatureMasterData(state.currentDigitalFeatureId);

    let msg = `Đã nhập ${result.imported} danh mục.`;
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

// ---- Thanh cuộn ngang phía trên bảng danh mục (nhân bản setupDfsScrollTopSync). ----
(function setupDfMdScrollTopSync() {
  const fake = document.getElementById("dfmd-table-scroll-top");
  const spacer = document.getElementById("dfmd-table-scroll-top-spacer");
  const real = document.getElementById("dfmd-table-wrap");
  if (!fake || !spacer || !real) return;
  const syncSpacer = () => {
    spacer.style.width = `${real.scrollWidth}px`;
  };
  fake.addEventListener("scroll", () => {
    real.scrollLeft = fake.scrollLeft;
  });
  real.addEventListener("scroll", () => {
    fake.scrollLeft = real.scrollLeft;
  });
  new ResizeObserver(syncSpacer).observe(real);
  syncSpacer();
})();

// ==================== Tab "Đối tượng dữ liệu & Vòng đời trạng thái" ====================
// Nhân bản cấu trúc tab Danh mục ở trên với bảng 3 trường: Đối tượng,
// Khóa & thuộc tính chính, Vòng đời trạng thái.

async function loadDigitalFeatureDataObjects(featureId) {
  state.digitalFeatureDataObjects = await api(`/api/digital-features/${featureId}/data-objects`);
  const ids = new Set(state.digitalFeatureDataObjects.map((r) => r.id));
  state.selectedDfDoIds.forEach((id) => {
    if (!ids.has(id)) state.selectedDfDoIds.delete(id);
  });
  dfdoPagination.reset();
  renderDigitalFeatureDataObjects();
}

// ---- Menu "Cấu hình cột" — cột "Đối tượng" KHÔNG cho ẩn (nhận diện dòng);
// STT và Action luôn hiển thị. Tuỳ chọn lưu localStorage theo máy.
const DFDO_TOGGLEABLE_COLUMNS = [
  { key: "khoa_thuoc_tinh", label: "Khóa & thuộc tính chính" },
  { key: "vong_doi_trang_thai", label: "Vòng đời trạng thái" },
];
const DFDO_COL_LS_KEY = "backlog.dfDoColumns.hiddenV1";

function loadHiddenDfDoColumns() {
  try {
    const raw = localStorage.getItem(DFDO_COL_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveHiddenDfDoColumns() {
  try {
    localStorage.setItem(DFDO_COL_LS_KEY, JSON.stringify([...state.hiddenDfDoColumns]));
  } catch {
    // Không lưu được thì bỏ qua — tuỳ chọn vẫn áp dụng cho phiên hiện tại.
  }
}

function isDfDoColHidden(key) {
  return state.hiddenDfDoColumns.has(key);
}

function applyDfDoColumnHeaderVisibility() {
  DFDO_TOGGLEABLE_COLUMNS.forEach(({ key }) => {
    const th = document.querySelector(`#dfdo-table thead [data-col="${key}"]`);
    if (!th) return;
    th.hidden = isDfDoColHidden(key);
  });
}

function renderDfDoColMenu() {
  const list = document.getElementById("dfdo-col-menu-list");
  list.innerHTML = DFDO_TOGGLEABLE_COLUMNS.map(
    ({ key, label }) => `
    <label class="col-menu-item">
      <input type="checkbox" class="dfdo-col-checkbox" data-col-key="${key}" ${isDfDoColHidden(key) ? "" : "checked"} />
      ${label}
    </label>`,
  ).join("");
  list.querySelectorAll(".dfdo-col-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      if (e.target.checked) state.hiddenDfDoColumns.delete(key);
      else state.hiddenDfDoColumns.add(key);
      saveHiddenDfDoColumns();
      renderDigitalFeatureDataObjects();
    });
  });
}

function openDfDoColMenu() {
  renderDfDoColMenu();
  document.getElementById("dfdo-col-menu").hidden = false;
  document.getElementById("dfdo-col-menu-btn").setAttribute("aria-expanded", "true");
}

function closeDfDoColMenu() {
  document.getElementById("dfdo-col-menu").hidden = true;
  document.getElementById("dfdo-col-menu-btn").setAttribute("aria-expanded", "false");
}

function initDfDoColumnMenu() {
  state.hiddenDfDoColumns = loadHiddenDfDoColumns();
  applyDfDoColumnHeaderVisibility();

  const menuWrap = document.getElementById("dfdo-col-menu-wrap");
  const menuBtn = document.getElementById("dfdo-col-menu-btn");
  const menu = document.getElementById("dfdo-col-menu");
  if (!menuWrap || !menuBtn || !menu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openDfDoColMenu();
    else closeDfDoColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menuWrap.contains(e.target)) closeDfDoColMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDfDoColMenu();
  });
  document.getElementById("dfdo-col-menu-reset").addEventListener("click", () => {
    state.hiddenDfDoColumns.clear();
    saveHiddenDfDoColumns();
    applyDfDoColumnHeaderVisibility();
    renderDigitalFeatureDataObjects();
  });
}
initDfDoColumnMenu();

// Checkbox chọn nhiều + nút "Xóa đã chọn" — chỉ admin (class delete-action).
function updateDfDoSelectionUI() {
  const visible = state.digitalFeatureDataObjects;
  const visibleSelectedCount = visible.filter((r) => state.selectedDfDoIds.has(r.id)).length;
  const btn = document.getElementById("delete-selected-dfdo-btn");
  const countEl = document.getElementById("selected-dfdo-count");
  const selectAll = document.getElementById("dfdo-select-all");
  if (btn) btn.hidden = state.selectedDfDoIds.size === 0;
  if (countEl) countEl.textContent = String(state.selectedDfDoIds.size);
  if (selectAll) {
    selectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderDigitalFeatureDataObjects() {
  const tbody = document.getElementById("dfdo-tbody");
  const empty = document.getElementById("dfdo-empty");
  if (!tbody) return;
  applyDfDoColumnHeaderVisibility();
  const colHidden = (key) => (isDfDoColHidden(key) ? "hidden" : "");
  const rows = state.digitalFeatureDataObjects;
  empty.hidden = rows.length > 0;
  const pageItems = dfdoPagination.slice(rows);
  const pageStart = (dfdoPagination.page - 1) * dfdoPagination.pageSize;

  tbody.innerHTML = pageItems
    .map((r, idx) => `
    <tr data-id="${r.id}">
      <td><input type="checkbox" class="dfdo-row-checkbox" ${state.selectedDfDoIds.has(r.id) ? "checked" : ""} /></td>
      <td>${pageStart + idx + 1}</td>
      <td>${dfFull(r.ten_doi_tuong)}</td>
      <td data-col="khoa_thuoc_tinh" ${colHidden("khoa_thuoc_tinh")}>${dfFull(r.khoa_thuoc_tinh)}</td>
      <td data-col="vong_doi_trang_thai" ${colHidden("vong_doi_trang_thai")}>${dfFull(r.vong_doi_trang_thai)}</td>
      <td>
        <div class="actions-cell" style="justify-content:flex-start;gap:2px">
          <button type="button" class="small btn-edit icon-btn dfdo-edit-btn" data-id="${r.id}" title="Sửa"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-pen"/></svg></button>
          <button type="button" class="small btn-delete icon-btn dfdo-del-btn" data-id="${r.id}" title="Xoá"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-trash"/></svg></button>
        </div>
      </td>
    </tr>`)
    .join("");

  tbody.querySelectorAll(".dfdo-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) state.selectedDfDoIds.add(id);
      else state.selectedDfDoIds.delete(id);
      updateDfDoSelectionUI();
    });
  });
  tbody.querySelectorAll(".dfdo-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openDigitalFeatureDoDialog(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".dfdo-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const item = state.digitalFeatureDataObjects.find((r) => r.id === Number(btn.dataset.id));
      if (!(await confirmDialog(`Xoá đối tượng dữ liệu${item?.ten_doi_tuong ? ` "${item.ten_doi_tuong}"` : ""}?`, { danger: true }))) return;
      try {
        await api(`/api/digital-feature-data-objects/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Đã xoá.", "success");
        await loadDigitalFeatureDataObjects(state.currentDigitalFeatureId);
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  updateDfDoSelectionUI();
}

document.getElementById("dfdo-select-all")?.addEventListener("change", (e) => {
  if (e.target.checked) {
    state.digitalFeatureDataObjects.forEach((r) => state.selectedDfDoIds.add(r.id));
  } else {
    state.digitalFeatureDataObjects.forEach((r) => state.selectedDfDoIds.delete(r.id));
  }
  renderDigitalFeatureDataObjects();
});

document.getElementById("delete-selected-dfdo-btn")?.addEventListener("click", async () => {
  const ids = [...state.selectedDfDoIds];
  if (ids.length === 0) return;
  if (!(await confirmDialog(`Xóa ${ids.length} đối tượng dữ liệu đã chọn?`, { danger: true }))) return;
  try {
    const res = await api(`/api/digital-features/${state.currentDigitalFeatureId}/data-objects/delete-selected`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedDfDoIds.clear();
    await loadDigitalFeatureDataObjects(state.currentDigitalFeatureId);
    showToast(`Đã xóa ${res?.deleted ?? 0} đối tượng.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Dialog Thêm mới / Sửa đối tượng dữ liệu ----

function openDigitalFeatureDoDialog(id) {
  const item = id != null ? state.digitalFeatureDataObjects.find((r) => r.id === id) : null;
  document.getElementById("dfdo-dialog-title").textContent = item ? "Sửa đối tượng dữ liệu" : "Thêm đối tượng dữ liệu";
  document.getElementById("dfdo-id").value = item?.id ?? "";
  document.getElementById("dfdo-doi-tuong").value = item?.ten_doi_tuong ?? "";
  document.getElementById("dfdo-khoa").value = item?.khoa_thuoc_tinh ?? "";
  document.getElementById("dfdo-vong-doi").value = item?.vong_doi_trang_thai ?? "";
  document.getElementById("digital-feature-do-dialog").showModal();
}

document.getElementById("add-df-do-btn")?.addEventListener("click", () => openDigitalFeatureDoDialog(null));

document.getElementById("digital-feature-do-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("dfdo-id").value;
  const body = {
    ten_doi_tuong: document.getElementById("dfdo-doi-tuong").value.trim(),
    khoa_thuoc_tinh: document.getElementById("dfdo-khoa").value.trim() || undefined,
    vong_doi_trang_thai: document.getElementById("dfdo-vong-doi").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/digital-feature-data-objects/${id}`, { method: "PUT", body: JSON.stringify(body) });
      showToast("Đã lưu thay đổi.", "success");
    } else {
      await api(`/api/digital-features/${state.currentDigitalFeatureId}/data-objects`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast("Đã thêm đối tượng dữ liệu.", "success");
    }
    document.getElementById("digital-feature-do-dialog").close();
    await loadDigitalFeatureDataObjects(state.currentDigitalFeatureId);
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById("digital-feature-do-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("digital-feature-do-dialog").close();
});

// ---- File mẫu / Import Excel / Export Excel của tab đối tượng dữ liệu ----

document.getElementById("download-dfdo-template-btn")?.addEventListener("click", () => {
  window.location.href = `/api/digital-features/${state.currentDigitalFeatureId}/data-objects/import-template`;
});

document.getElementById("export-dfdo-btn")?.addEventListener("click", () => {
  window.location.href = `/api/digital-features/${state.currentDigitalFeatureId}/data-objects/export`;
});

document.getElementById("import-dfdo-btn")?.addEventListener("click", () => {
  document.getElementById("dfdo-import-input").click();
});

document.getElementById("dfdo-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("dfdo-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    // Body là bytes thô .xlsx — fetch() thẳng thay vì api() vì Content-Type
    // là kiểu file (giống import tab Danh mục ở trên).
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/digital-features/${state.currentDigitalFeatureId}/data-objects/import`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadDigitalFeatureDataObjects(state.currentDigitalFeatureId);

    let msg = `Đã nhập ${result.imported} đối tượng.`;
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

// ---- Thanh cuộn ngang phía trên bảng đối tượng (nhân bản setupDfMdScrollTopSync). ----
(function setupDfDoScrollTopSync() {
  const fake = document.getElementById("dfdo-table-scroll-top");
  const spacer = document.getElementById("dfdo-table-scroll-top-spacer");
  const real = document.getElementById("dfdo-table-wrap");
  if (!fake || !spacer || !real) return;
  const syncSpacer = () => {
    spacer.style.width = `${real.scrollWidth}px`;
  };
  fake.addEventListener("scroll", () => {
    real.scrollLeft = fake.scrollLeft;
  });
  real.addEventListener("scroll", () => {
    fake.scrollLeft = real.scrollLeft;
  });
  new ResizeObserver(syncSpacer).observe(real);
  syncSpacer();
})();
