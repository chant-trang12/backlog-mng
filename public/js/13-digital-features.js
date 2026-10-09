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

function renderDigitalFeatures() {
  const tbody = document.getElementById("df-tbody");
  const empty = document.getElementById("df-empty");
  if (!tbody) return;
  const rows = filteredDigitalFeatures();
  empty.hidden = rows.length > 0;
  const pageItems = dfPagination.slice(rows);
  const pageStart = (dfPagination.page - 1) * dfPagination.pageSize;

  tbody.innerHTML = pageItems
    .map((r, idx) => {
      return `
    <tr data-id="${r.id}">
      <td>${pageStart + idx + 1}</td>
      <td>${r.ma ? `<span class="pill" title="Mã tính năng">${r.ma.replace(/</g, "&lt;")}</span>` : `<span class="muted">—</span>`}</td>
      <td>${dfClamp(r.module)}</td>
      <td>${dfClamp(r.don_vi_chu_tri)}</td>
      <td>${dfClamp(r.don_vi_phoi_hop)}</td>
      <td>${dfClamp(r.giai_doan)}</td>
      <td>${dfClamp(r.tn_mh)}</td>
      <td>${dfClamp(r.muc_tieu_nghiep_vu)}</td>
      <td>${dfClamp(r.vai_tro_pbdkd)}</td>
      <td>${dfClamp(r.nhan_dau_vao_tu)}</td>
      <td>${dfClamp(r.chuyen_dau_ra_toi)}</td>
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

// ---- Dialog Xem chi tiết — tạm để trống (chờ mô tả sau), chỉ hiển thị
// Mã + Module để nhận diện dòng đang xem ----

function openDigitalFeatureDetail(id) {
  const item = state.digitalFeatures.find((r) => r.id === id);
  if (!item) return;
  document.getElementById("df-detail-title").textContent = item.module || "Chi tiết tính năng số hoá";
  document.getElementById("df-detail-subtitle").textContent = item.ma ? `Mã: ${item.ma}` : "";
  document.getElementById("digital-feature-detail-dialog").showModal();
}

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
