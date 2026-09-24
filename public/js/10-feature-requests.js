// "Yêu cầu tính năng" — luồng Duyệt/Từ chối:
// - Tạo xong: bên đề xuất (A) thấy "Đã gửi yêu cầu", bên đích (B) thấy
//   "Chờ duyệt" kèm 2 nút Duyệt/Từ chối.
// - B bấm Duyệt: A thấy "Đã tiếp nhận yêu cầu"; B thấy "Đã duyệt" kèm 2 nút
//   "Đưa vào Backlog"/"Đưa vào Roadmap năm" (làm được cả 2, độc lập nhau,
//   mỗi cái chỉ 1 lần — xem linked_task_id/linked_roadmap_item_id).
// - B bấm Từ chối: CẢ 2 bên đều thấy "Từ chối yêu cầu".
// Trạng thái lưu 1 giá trị duy nhất (Chờ duyệt/Đã duyệt/Từ chối) — nhãn
// hiển thị khác nhau theo phòng đang xem, xem frStatusLabel() bên dưới.

const FR_STATUS_BADGE_CLASS = {
  "Chờ duyệt": "status-dang-thuc-hien",
  "Đã duyệt": "status-hoan-thanh",
  "Từ chối": "status-huy",
};
// Độ tăng dần theo yêu cầu: xám (Thấp) -> xanh (Trung bình) -> vàng (Cao)
// -> đỏ (Khẩn cấp).
const FR_PRIORITY_CLASS = {
  Thấp: "status-default",
  "Trung bình": "status-hoan-thanh",
  Cao: "status-dang-thuc-hien",
  "Khẩn cấp": "status-huy",
};

async function loadLoaiYeuCau() {
  state.loaiYeuCauOptions = await api("/api/loai-yeu-cau");
}

async function loadFeatureRequests() {
  // deptParam() -> chỉ trả yêu cầu mà phòng đang xem là bên đề xuất hoặc
  // bên đích (xem listFeatureRequestsHandler) — không dùng prefix mặc định
  // "&" vì đây là query đầu tiên của URL.
  state.featureRequests = await api(`/api/feature-requests${deptParam("?")}`);
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
      !`${r.tieu_de} ${r.mo_ta ?? ""} ${r.he_thong} ${r.nguoi_de_xuat ?? ""} ${r.department_name ?? ""} ${r.target_department_name ?? ""}`
        .toLowerCase()
        .includes(term)
    ) {
      return false;
    }
    return true;
  });
}

function frFormatDate(value) {
  if (!value) return "";
  const [datePart] = String(value).split(" ");
  const [y, m, d] = (datePart ?? "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
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

function renderFeatureRequestTable() {
  const tbody = document.getElementById("fr-tbody");
  const empty = document.getElementById("fr-empty");
  if (!tbody) return;
  const rows = filteredFeatureRequests();
  empty.hidden = rows.length > 0;
  const pageItems = frPagination.slice(rows);
  const pageStart = (frPagination.page - 1) * frPagination.pageSize;

  tbody.innerHTML = pageItems
    .map((r, i) => {
      const side = frViewerSide(r);
      const statusLabel = frStatusLabel(r);
      let actions = "";
      // Duyệt/Từ chối/Đưa vào Backlog/Roadmap: CHỈ phòng đích được thao tác
      // (chặn thật ở server — requireTargetScope), và chỉ user có quyền
      // ghi (editor/admin — write-action ẩn với viewer, xem style.css) mới
      // thấy nút. Viewer thuộc phòng đích vẫn thấy trạng thái "Chờ duyệt"
      // bình thường, chỉ không thấy 2 nút này.
      if (side === "target" && r.trang_thai === "Chờ duyệt") {
        actions += `<button class="small btn-edit write-action approve-fr-btn">Duyệt</button>`;
        actions += `<button class="small btn-reject write-action reject-fr-btn">Từ chối</button>`;
      }
      if (side === "target" && r.trang_thai === "Đã duyệt") {
        // Chỉ hiện NÚT khi còn thao tác thật sự cần làm — đã đưa vào rồi
        // thì bỏ hẳn khỏi ô Thao tác (không để "trạng thái xong" giả dạng
        // nút gây nhầm bấm được), chuyển sang badge nhỏ ở cột Trạng thái
        // (xem linkedBadges bên dưới) — tách bạch rõ "nút để bấm" và
        // "trạng thái để đọc".
        if (!r.linked_task_id) {
          actions += `<button class="small btn-exclude write-action to-backlog-fr-btn">Đưa vào Backlog</button>`; // vàng (giống nút Backlog sẵn có)
        }
        if (!r.linked_roadmap_item_id) {
          actions += `<button class="small btn-progress write-action to-roadmap-fr-btn">Đưa vào Roadmap</button>`; // xanh dương — tách biệt màu với nút Backlog
        }
      }
      // 2 màu khác nhau (tím/xanh dương) để phân biệt Backlog/Roadmap với
      // nhau, đồng thời KHÔNG trùng bất kỳ màu nào đã dùng cho 3 trạng thái
      // chính (vàng "Chờ duyệt", xanh lá "Đã duyệt", đỏ "Từ chối") hay màu
      // Ưu tiên trong cùng bảng — tránh đọc nhầm badge nào là trạng thái gì.
      const linkedBadges =
        (r.linked_task_id ? `<span class="status-badge fr-linked-badge-backlog" title="Đã đưa vào Backlog">✓ Backlog</span>` : "") +
        (r.linked_roadmap_item_id
          ? `<span class="status-badge fr-linked-badge-roadmap" title="Đã đưa vào Roadmap năm">✓ Roadmap</span>`
          : "");
      // Sửa/Xóa: chỉ bên đề xuất, chỉ khi còn "Chờ duyệt" (đã Duyệt/Từ chối
      // thì khoá nội dung, tránh sửa sau khi bên kia đã hành động). Khác
      // với "Tạo mới" (mọi quyền kể cả viewer), Sửa vẫn là PUT nên cần
      // quyền ghi — write-action ẩn với viewer.
      if (side === "proposer" && r.trang_thai === "Chờ duyệt") {
        actions += `<button class="small btn-edit write-action edit-fr-btn">Sửa</button>`;
        actions += `<button class="small btn-delete delete-fr-btn">Xóa</button>`;
      }

      return `
    <tr data-id="${r.id}">
      <td>${pageStart + i + 1}</td>
      <td><span class="status-badge ${systemColorClass(r.he_thong)}">${r.he_thong}</span></td>
      <td>${r.loai_yeu_cau ?? ""}</td>
      <td>${r.tieu_de}</td>
      <td>${(r.mo_ta ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${r.department_name ?? `<span class="muted">—</span>`}</td>
      <td><strong>${r.target_department_name ?? `<span class="muted">—</span>`}</strong></td>
      <td>${r.nguoi_de_xuat ?? ""}</td>
      <td><span class="status-badge ${FR_PRIORITY_CLASS[r.do_uu_tien] ?? "status-default"}">${r.do_uu_tien}</span></td>
      <td>
        <div class="row" style="gap:5px;flex-wrap:wrap">
          <span class="status-badge ${FR_STATUS_BADGE_CLASS[r.trang_thai] ?? "status-default"}">${statusLabel}</span>
          ${linkedBadges}
        </div>
        ${r.ghi_chu_xu_ly && r.trang_thai === "Từ chối" ? `<div class="cell-graded-at" title="${r.ghi_chu_xu_ly}">Lý do: ${r.ghi_chu_xu_ly}</div>` : ""}
      </td>
      <td>${r.thoi_gian_mong_muon ? frFormatDate(r.thoi_gian_mong_muon) : `<span class="muted">—</span>`}</td>
      <td>${frFormatDate(r.created_at)}</td>
      <td><div class="actions-cell" title="">${actions}</div></td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".edit-fr-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openFeatureRequestDialog(state.featureRequests.find((r) => r.id === id));
    });
  });
  tbody.querySelectorAll(".delete-fr-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!(await confirmDialog("Xóa yêu cầu tính năng này?"))) return;
      try {
        await api(`/api/feature-requests/${id}${deptParam("?")}`, { method: "DELETE" });
        await loadFeatureRequests();
        showToast("Đã xóa yêu cầu.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  tbody.querySelectorAll(".approve-fr-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!(await confirmDialog("Duyệt yêu cầu tính năng này?", { danger: false }))) return;
      try {
        await api(`/api/feature-requests/${id}/approve${deptParam("?")}`, { method: "POST" });
        await loadFeatureRequests();
        showToast("Đã duyệt yêu cầu.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  tbody.querySelectorAll(".reject-fr-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      document.getElementById("fr-reject-id").value = id;
      document.getElementById("fr-reject-reason").value = "";
      document.getElementById("fr-reject-dialog").showModal();
    });
  });
  tbody.querySelectorAll(".to-backlog-fr-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openFrBacklogDialog(id);
    });
  });
  tbody.querySelectorAll(".to-roadmap-fr-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openFrRoadmapDialog(id);
    });
  });
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

  const loaiSelect = document.getElementById("fr-loai-yeu-cau");
  loaiSelect.innerHTML =
    `<option value="">-- Không chọn --</option>` +
    state.loaiYeuCauOptions.map((l) => `<option value="${l.ten_loai}">${l.ten_loai}</option>`).join("");
  loaiSelect.value = item?.loai_yeu_cau ?? "";

  const targetDeptSelect = document.getElementById("fr-target-department");
  targetDeptSelect.innerHTML =
    `<option value="">-- Chọn phòng ban --</option>` +
    state.departments.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  targetDeptSelect.value = item?.target_department_id ?? "";

  document.getElementById("fr-tieu-de").value = item?.tieu_de ?? "";
  document.getElementById("fr-mo-ta").value = item?.mo_ta ?? "";
  document.getElementById("fr-ket-qua-mong-muon").value = item?.ket_qua_mong_muon ?? "";
  document.getElementById("fr-nguoi-de-xuat").value = item?.nguoi_de_xuat ?? "";
  document.getElementById("fr-thoi-gian-mong-muon").value = item?.thoi_gian_mong_muon ?? "";
  document.getElementById("fr-do-uu-tien").value = item?.do_uu_tien ?? "Trung bình";

  document.getElementById("feature-request-dialog").showModal();
}

document.getElementById("add-feature-request-btn")?.addEventListener("click", () => {
  openFeatureRequestDialog(null);
});
document.getElementById("feature-request-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("feature-request-dialog").close();
});

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

  try {
    if (id) {
      await api(`/api/feature-requests/${id}${deptParam("?")}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Đã cập nhật yêu cầu.", "success");
    } else {
      await api("/api/feature-requests", { method: "POST", body: JSON.stringify(payload) });
      showToast("Đã gửi yêu cầu tính năng.", "success");
    }
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
