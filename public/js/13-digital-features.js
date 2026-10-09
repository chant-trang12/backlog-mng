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

// Bộ lọc hiện tại (select + tìm từ khóa) — áp trên state.digitalFeatures
// (server trả toàn bộ danh sách chưa xóa, lọc thêm ở FE giống bảng Yêu cầu
// tính năng).
function filteredDigitalFeatures() {
  const search = (document.getElementById("df-filter-search")?.value ?? "").trim().toLowerCase();
  const module = document.getElementById("df-filter-module")?.value ?? "";
  const giaiDoan = document.getElementById("df-filter-giai-doan")?.value ?? "";
  const tnMh = document.getElementById("df-filter-tn-mh")?.value ?? "";
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
    if (tnMh && (r.tn_mh ?? "") !== tnMh) return false;
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
    { id: "df-filter-tn-mh", key: "tn_mh" },
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
}

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
// bảng, quay lại bằng nút "← Quay lại". Nội dung tạm để trống (chờ mô tả
// sau), hiện tại hiển thị tên tính năng + Mã để nhận diện dòng đang xem. ----

function openDigitalFeatureDetail(id) {
  const item = state.digitalFeatures.find((r) => r.id === id);
  if (!item) return;
  document.getElementById("df-detail-page-title").textContent = item.module || "Chi tiết tính năng số hoá";
  const maBadge = document.getElementById("df-detail-page-ma");
  maBadge.textContent = item.ma ?? "";
  maBadge.hidden = !item.ma;
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

for (const id of ["df-filter-module", "df-filter-giai-doan", "df-filter-tn-mh", "df-filter-don-vi"]) {
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
  const tnMh = document.getElementById("df-filter-tn-mh")?.value ?? "";
  if (tnMh) params.set("tn_mh", tnMh);
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
