// ---- Kế hoạch tổng hợp > tab "KQ xếp loại CBNV" ----
// Lọc theo Tháng theo dõi (state.currentPeriodId, dùng CHUNG với Backlog/
// Team & Nhân sự — xem #cbnv-period-select wiring ở 02-departments-periods-
// teams.js) + phòng ban đang xem (bộ chuyển đổi phòng ban chung ở header,
// deptParam()) — mỗi phòng ban 1 danh sách riêng, KHÔNG hiển thị lẫn lộn.

const cbnvPagination = createPagination("cbnv", () => renderCbnvTable(), "bản ghi");

async function loadCbnvXepLoai() {
  if (!state.currentPeriodId) {
    state.cbnvRecords = [];
    renderCbnvTable();
    return;
  }
  state.cbnvRecords = await api(`/api/cbnv-xep-loai?period_id=${state.currentPeriodId}${deptParam()}`);
  renderCbnvTable();
}

function filteredCbnvRecords() {
  const term = (state.cbnvSearch ?? "").trim().toLowerCase();
  if (!term) return state.cbnvRecords;
  return state.cbnvRecords.filter((r) =>
    [r.ma_nhan_vien, r.ho_va_ten, r.chuc_danh, r.don_vi, r.department_name, r.to_nhom]
      .some((v) => (v ?? "").toLowerCase().includes(term)),
  );
}

// Tick "Nghỉ thai sản": các cột điểm/xếp loại (trừ cột "Xếp loại") hiện chữ "Nghỉ thai sản".
// Tick "Không KI": cột "Điểm đánh giá" hiện "Không KI" và cột "Xếp loại kết quả thực hiện mục tiêu nhiệm vụ/công
// việc" hiện "Đạt yêu cầu" (nghỉ thai sản được ưu tiên nếu tick cả hai). kiText: chữ hiện khi tick Không KI.
function cbnvShow(r, value, kiText = null) {
  if (r.nghi_thai_san) return '<span class="cbnv-flag cbnv-flag-thaisan">Nghỉ thai sản</span>';
  if (r.khong_ki && kiText) return kiText === "Không KI" ? '<span class="cbnv-flag cbnv-flag-khongki">Không KI</span>' : kiText;
  return value ?? "";
}

function renderCbnvTable() {
  const visible = filteredCbnvRecords();
  const groupHeader = document.getElementById("cbnv-group-ketqua");
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  if (groupHeader) groupHeader.textContent = `Kết quả hoàn thành nhiệm vụ/công việc ${period?.label ?? ""}`;

  document.getElementById("cbnv-empty").hidden = visible.length > 0;
  const pageItems = cbnvPagination.slice(visible);
  const pageStart = (cbnvPagination.page - 1) * cbnvPagination.pageSize;
  document.getElementById("cbnv-tbody").innerHTML = pageItems
    .map(
      (r, i) => `
    <tr data-id="${r.id}">
      <td>${pageStart + i + 1}</td>
      <td>${r.ma_nhan_vien ?? ""}</td>
      <td>${r.ho_va_ten}</td>
      <td>${r.chuc_danh ?? ""}</td>
      <td>${r.don_vi ?? ""}</td>
      <td>${r.department_name ?? ""}</td>
      <td>${r.to_nhom ?? ""}</td>
      <td>${cbnvShow(r, r.diem_danh_gia, "Không KI")}</td>
      <td>${cbnvShow(r, r.xep_loai_ket_qua, "Đạt yêu cầu")}</td>
      <td>${cbnvShow(r, r.tuan_thu_dia_diem)}</td>
      <td>${cbnvShow(r, r.tuan_thu_noi_quy)}</td>
      <td>${r.xep_loai ?? ""}</td>
      <td>${cbnvShow(r, r.xep_loai_muc_do)}</td>
      <td>${(r.ghi_chu_de_xuat ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${(r.chu_y ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action cbnv-edit-btn">Sửa</button>
        <button class="small btn-delete cbnv-delete-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  syncCbnvStickyHeadOffset();

  document.getElementById("cbnv-tbody").querySelectorAll(".cbnv-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.closest("tr").dataset.id);
      openCbnvEditDialog(state.cbnvRecords.find((r) => r.id === id));
    });
  });
  document.getElementById("cbnv-tbody").querySelectorAll(".cbnv-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest("tr").dataset.id);
      if (!(await confirmDialog("Xóa dòng KQ xếp loại này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
      try {
        await api(`/api/cbnv-xep-loai/${id}`, { method: "DELETE" });
        await loadCbnvXepLoai();
        showToast("Đã xóa.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Ghim 2 hàng tiêu đề của #cbnv-table khi cuộn dọc: hàng 2 phải nằm NGAY
// DƯỚI hàng 1 (xem comment #cbnv-table thead tr:nth-child(2) th ở style.css)
// — đo chiều cao thật của hàng 1 (đổi theo độ dài nhãn tháng + độ rộng cột
// khi wrap) rồi ghi vào biến CSS. Dùng ResizeObserver để tự cập nhật khi
// hàng 1 co giãn theo bề rộng khung (cuộn ngang/đổi số cột/resize cửa sổ).
function syncCbnvStickyHeadOffset() {
  const table = document.getElementById("cbnv-table");
  const row1 = table?.querySelector("thead tr:first-child");
  if (!table || !row1) return;
  const update = () => table.style.setProperty("--cbnv-thead-row1-h", `${row1.offsetHeight}px`);
  update();
  if (!table._cbnvHeadResizeObserver) {
    table._cbnvHeadResizeObserver = new ResizeObserver(update);
    table._cbnvHeadResizeObserver.observe(row1);
  }
}

document.getElementById("cbnv-search")?.addEventListener("input", (e) => {
  state.cbnvSearch = e.target.value;
  cbnvPagination.reset();
  renderCbnvTable();
});

// ---- Sửa ----

function openCbnvEditDialog(record) {
  if (!record) return;
  state.cbnvEditingId = record.id;
  document.getElementById("cbnv-f-ma-nhan-vien").value = record.ma_nhan_vien ?? "";
  document.getElementById("cbnv-f-ho-va-ten").value = record.ho_va_ten ?? "";
  document.getElementById("cbnv-f-chuc-danh").value = record.chuc_danh ?? "";
  document.getElementById("cbnv-f-don-vi").value = record.don_vi ?? "";
  document.getElementById("cbnv-f-to-nhom").value = record.to_nhom ?? "";
  document.getElementById("cbnv-f-diem").value = record.diem_danh_gia ?? "";
  document.getElementById("cbnv-f-xep-loai-ket-qua").value = record.xep_loai_ket_qua ?? "";
  // Mặc định "Tuân thủ" khi chưa có giá trị (user yêu cầu) — thay vì để
  // trống "—".
  document.getElementById("cbnv-f-tuan-thu-dia-diem").value = record.tuan_thu_dia_diem ?? "Tuân thủ";
  document.getElementById("cbnv-f-tuan-thu-noi-quy").value = record.tuan_thu_noi_quy ?? "Tuân thủ";
  // Giá trị Xếp loại không có trong danh sách (VD "K" từ "Lấy thông tin xếp loại", dữ liệu import) -> thêm tạm
  // để mở popup rồi Lưu KHÔNG làm mất giá trị (select gán giá trị lạ sẽ về rỗng).
  const xepLoaiSel = document.getElementById("cbnv-f-xep-loai");
  xepLoaiSel.querySelectorAll("option[data-legacy]").forEach((o) => o.remove());
  if (record.xep_loai && ![...xepLoaiSel.options].some((o) => o.value === record.xep_loai)) {
    const opt = document.createElement("option");
    opt.value = record.xep_loai;
    opt.textContent = record.xep_loai;
    opt.dataset.legacy = "1";
    xepLoaiSel.appendChild(opt);
  }
  xepLoaiSel.value = record.xep_loai ?? "";
  // Mặc định "Hoàn thành" khi chưa có giá trị (user yêu cầu, giống Tuân thủ).
  document.getElementById("cbnv-f-xep-loai-muc-do").value = record.xep_loai_muc_do ?? "Hoàn thành";
  document.getElementById("cbnv-f-ghi-chu").value = record.ghi_chu_de_xuat ?? "";
  document.getElementById("cbnv-f-thai-san").checked = !!record.nghi_thai_san;
  document.getElementById("cbnv-f-khong-ki").checked = !!record.khong_ki;
  document.getElementById("cbnv-f-chu-y").value = record.chu_y ?? "";
  document.getElementById("cbnv-edit-dialog").showModal();
}

document.getElementById("cbnv-edit-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("cbnv-edit-dialog").close();
});

document.getElementById("cbnv-edit-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const diemRaw = document.getElementById("cbnv-f-diem").value;
  const body = {
    ma_nhan_vien: document.getElementById("cbnv-f-ma-nhan-vien").value.trim(),
    ho_va_ten: document.getElementById("cbnv-f-ho-va-ten").value.trim(),
    chuc_danh: document.getElementById("cbnv-f-chuc-danh").value.trim(),
    don_vi: document.getElementById("cbnv-f-don-vi").value.trim(),
    to_nhom: document.getElementById("cbnv-f-to-nhom").value.trim(),
    diem_danh_gia: diemRaw === "" ? null : Number(diemRaw),
    xep_loai_ket_qua: document.getElementById("cbnv-f-xep-loai-ket-qua").value.trim(),
    tuan_thu_dia_diem: document.getElementById("cbnv-f-tuan-thu-dia-diem").value,
    tuan_thu_noi_quy: document.getElementById("cbnv-f-tuan-thu-noi-quy").value,
    xep_loai: document.getElementById("cbnv-f-xep-loai").value,
    xep_loai_muc_do: document.getElementById("cbnv-f-xep-loai-muc-do").value.trim(),
    ghi_chu_de_xuat: document.getElementById("cbnv-f-ghi-chu").value.trim(),
    nghi_thai_san: document.getElementById("cbnv-f-thai-san").checked,
    khong_ki: document.getElementById("cbnv-f-khong-ki").checked,
    chu_y: document.getElementById("cbnv-f-chu-y").value.trim(),
  };
  if (!body.ho_va_ten) {
    showToast("Hãy nhập Họ và Tên.");
    return;
  }
  try {
    await api(`/api/cbnv-xep-loai/${state.cbnvEditingId}`, { method: "PUT", body: JSON.stringify(body) });
    document.getElementById("cbnv-edit-dialog").close();
    await loadCbnvXepLoai();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Tải file mẫu / Import Excel / Xuất Excel ----

document.getElementById("cbnv-download-template-btn")?.addEventListener("click", () => {
  window.location.href = "/api/cbnv-xep-loai/import-template";
});

document.getElementById("cbnv-export-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn Tháng theo dõi trước.");
    return;
  }
  window.location.href = `/api/cbnv-xep-loai/export?period_id=${state.currentPeriodId}${deptParam()}`;
});

document.getElementById("cbnv-import-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn Tháng theo dõi trước.");
    return;
  }
  document.getElementById("cbnv-import-input").click();
});

document.getElementById("cbnv-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("cbnv-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/cbnv-xep-loai/import?period_id=${state.currentPeriodId}${deptParam()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadCbnvXepLoai();

    let msg = `Đã nhập ${result.imported} dòng.`;
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

// ---- "Lấy thông tin xếp loại" ----
// Tính Rank/KI bằng ĐÚNG thuật toán Ranking team đã có sẵn ở Trang chủ
// (08-home.js: homeComputeTeamScores/homeKiColumnForMemberRank/homeKiValue/
// homeLowerKiOneLevel/homeRaiseKiOneLevel) — KHÔNG viết lại thuật toán tính
// điểm/rank ở đây (user đã chốt phạm vi "theo phòng đang xem", tái dùng
// nguyên hàm FE thay vì port sang backend). Hoạt động cho MỌI team của
// phòng đang xem (deptParam()) ở tháng đang chọn.

// Bảng quy đổi Xếp loại -> Điểm đánh giá (user chốt) — D/E CHƯA có giá trị
// (user sẽ bổ sung sau, để trống/null cho tới lúc đó); A+/K cũng chưa có
// quy ước nên để trống luôn, không đoán.
const CBNV_XEP_LOAI_DIEM = { A: 4.0, B: 3.4, C: 3.0 };
function cbnvDiemFromXepLoai(xepLoai) {
  return CBNV_XEP_LOAI_DIEM[xepLoai] ?? null;
}

// "Xếp loại kết quả thực hiện mục tiêu nhiệm vụ/công việc" — dropdown 6
// mức, user gửi ảnh bảng quy đổi theo Điểm đánh giá (Đquý/năm): suy TIẾP từ
// diem_danh_gia (đã quy đổi ở trên từ Xếp loại A/B/C) — không có điểm (D/E/
// K/A+ chưa quy đổi được ở bước trên) thì về "Không đánh giá".
const CBNV_XEP_LOAI_KET_QUA_OPTIONS = [
  "Vượt xa yêu cầu",
  "Vượt yêu cầu",
  "Đạt yêu cầu",
  "Gần đạt yêu cầu",
  "Không đạt yêu cầu",
  "Không đánh giá",
];
function cbnvXepLoaiKetQuaFromDiem(diem) {
  if (diem == null) return "Không đánh giá";
  if (diem >= 4.5) return "Vượt xa yêu cầu";
  if (diem >= 3.5) return "Vượt yêu cầu";
  if (diem >= 2.5) return "Đạt yêu cầu";
  if (diem >= 2) return "Gần đạt yêu cầu";
  return "Không đạt yêu cầu";
}
document.getElementById("cbnv-fetch-ki-btn")?.addEventListener("click", async () => {
  const dept = state.departments.find((d) => d.id === state.currentDepartmentId);
  if (!dept) {
    showToast('Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban trước (không dùng được khi đang xem "Tất cả").');
    return;
  }
  if (dept.cach_tinh_kpi !== "theo_team") {
    showToast(`Phòng "${dept.name}" không tính KPI theo team — không có dữ liệu Ranking team để lấy.`);
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn Tháng theo dõi trước.");
    return;
  }

  try {
    // Nạp dữ liệu Trang chủ cho ĐÚNG tháng/phòng đang xem — periodId trùng
    // state.currentPeriodId nên refreshHomeForPeriod() đi nhánh "alias" (xem
    // 02-departments-periods-teams.js), không gọi thêm API thừa ngoài KPI
    // theo task.
    await refreshHomeForPeriod(state.currentPeriodId);
    state.homePeriodId = state.currentPeriodId;

    const teamNames = state.homeTeams.map((t) => t.name);
    if (teamNames.length === 0) {
      showToast("Phòng ban này chưa có team nào ở tháng đang chọn.");
      return;
    }

    const eligible = homeEligibleTasks(state.homeTasks);
    const rankingData = teamNames
      .map((name) => ({ team: name, value: homeComputeTeamScores(name, eligible).tongDiem }))
      .sort((a, b) => b.value - a.value);

    const entries = [];
    rankingData.forEach((d, idx) => {
      const team = d.team;
      const teamRankPosition = idx + 1;
      const rankedMembers = state.homeEvaluationRecords
        .filter((r) => r.team_name === team)
        .sort((a, b) => a.so_thu_tu - b.so_thu_tu);
      rankedMembers.forEach((m, i) => {
        const kiColumn = homeKiColumnForMemberRank(i, rankedMembers.length);
        const rawKi = homeKiValue(kiColumn, teamRankPosition);
        const member = state.homeMembers.find((mem) => mem.id === m.member_id);
        let ki = rawKi;
        if (member?.ha_ki) {
          ki = homeLowerKiOneLevel(rawKi);
        } else if (member?.tang_ki) {
          const raised = homeRaiseKiOneLevel(rawKi);
          ki = raised.atCeiling ? rawKi : raised.value;
        }
        const diem = cbnvDiemFromXepLoai(ki);
        entries.push({
          member_id: m.member_id,
          ho_va_ten: m.member_name,
          to_nhom: team,
          xep_loai: ki,
          diem_danh_gia: diem,
          xep_loai_ket_qua: cbnvXepLoaiKetQuaFromDiem(diem),
        });
      });
      // Nhân sự thuộc team nhưng CHƯA nhập Ranking (tab Đánh giá) — khớp
      // đúng badge "Không tính KI" ở bảng Ranking thành viên team (Trang
      // chủ): ghi "K" vào Xếp loại thay vì bỏ qua hẳn (user yêu cầu).
      const rankedMemberIds = new Set(rankedMembers.map((r) => r.member_id));
      const unrankedMembers = state.homeMembers.filter((m) => m.team_name === team && !rankedMemberIds.has(m.id));
      unrankedMembers.forEach((m) => {
        entries.push({
          member_id: m.id,
          ho_va_ten: m.name,
          to_nhom: team,
          xep_loai: "K",
          diem_danh_gia: null,
          xep_loai_ket_qua: "Không đánh giá",
        });
      });
    });

    if (entries.length === 0) {
      showToast('Chưa có nhân sự nào nhập Ranking (tab "Đánh giá") ở các team của phòng này.');
      return;
    }

    const result = await api("/api/cbnv-xep-loai/fetch-ki", {
      method: "POST",
      body: JSON.stringify({ period_id: state.currentPeriodId, department_id: dept.id, entries }),
    });
    await loadCbnvXepLoai();
    showToast(`Đã lấy thông tin xếp loại: ${result.created} dòng mới, ${result.updated} dòng cập nhật.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});


// ---- Kế hoạch tổng hợp > tab "GNV" ----
// Dữ liệu theo Tháng theo dõi (state.currentPeriodId) + phòng ban đang xem
// (deptParam()) — server lọc cả 2, nên tháng/phòng khác không lẫn sang đây.
// Cấu trúc: NHÓM lớn (hàng cam) > dòng nhiệm vụ (tạo tay hoặc lấy từ Backlog).

function gnvEsc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function gnvToRoman(n) {
  const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
function gnvPct(n) {
  return n == null ? "" : `${Math.round(n * 100) / 100}%`;
}

// Mức chỉ tiêu hiển thị theo Đơn vị đo: Thời gian -> dd/mm/yyyy; Tỷ lệ % -> thêm "%".
function gnvLevelText(unit, v) {
  if (v == null || v === "") return "";
  if (unit === "Thời gian") return formatDateDisplay(v);
  if (unit === "Tỷ lệ %") return `${v}%`;
  return v;
}

// Đổi kiểu 3 ô T/B/S theo Đơn vị đo đang chọn.
const GNV_LEVEL_IDS = ["gnv-f-toi-thieu", "gnv-f-mong-doi", "gnv-f-thach-thuc"];
function applyGnvLevelType(unit) {
  GNV_LEVEL_IDS.forEach((id) => {
    const el = document.getElementById(id);
    el.removeAttribute("min");
    el.removeAttribute("step");
    el.placeholder = "";
    if (unit === "Thời gian") el.type = "date";
    else if (unit === "Số lượng" || unit === "Điểm") {
      el.type = "number";
      el.min = "1";
      el.step = "1";
    } else if (unit === "Tỷ lệ %") {
      el.type = "number";
      el.min = "0";
      el.step = "any";
      el.placeholder = "%";
    } else el.type = "text";
  });
}
let gnvLevelUnit = "";
document.getElementById("gnv-f-don-vi-do")?.addEventListener("change", (e) => {
  // Đổi loại đơn vị -> giá trị cũ không còn hợp kiểu, xoá để nhập lại.
  if (e.target.value !== gnvLevelUnit) GNV_LEVEL_IDS.forEach((id) => (document.getElementById(id).value = ""));
  gnvLevelUnit = e.target.value;
  applyGnvLevelType(gnvLevelUnit);
});

async function loadGnv() {
  if (!state.currentPeriodId) {
    state.gnvGroups = [];
    renderGnvTable();
    return;
  }
  state.gnvGroups = await api(`/api/gnv?period_id=${state.currentPeriodId}${deptParam()}`);
  renderGnvTable();
}

// Ghim 2 hàng tiêu đề #gnv-table: hàng 2 nằm NGAY DƯỚI hàng 1 (cùng cơ chế
// với #cbnv-table, xem syncCbnvStickyHeadOffset) — đo chiều cao thật hàng 1.
function syncGnvStickyHeadOffset() {
  const table = document.getElementById("gnv-table");
  const row1 = table?.querySelector("thead tr:first-child");
  if (!table || !row1) return;
  const update = () => table.style.setProperty("--gnv-thead-row1-h", `${row1.offsetHeight}px`);
  update();
  if (!table._gnvHeadResizeObserver) {
    table._gnvHeadResizeObserver = new ResizeObserver(update);
    table._gnvHeadResizeObserver.observe(row1);
  }
}

function renderGnvTable() {
  syncGnvStickyHeadOffset();
  const groups = state.gnvGroups ?? [];
  document.getElementById("gnv-empty").hidden = groups.length > 0;
  document.getElementById("gnv-tbody").innerHTML = groups
    .map((g, gi) => {
      // Tỷ trọng nhóm chỉ cộng dòng MỤC TIÊU (dòng phương pháp đo con dùng chung tỷ trọng của cha).
      const heads = g.items.filter((it) => it.parent_item_id == null);
      const sum = heads.reduce((s, it) => s + (it.ty_trong ?? 0), 0);
      const hasWeight = heads.some((it) => it.ty_trong != null);
      const groupRow = `
        <tr class="gnv-group-row" data-group-id="${g.id}">
          <td class="gnv-center">${gnvToRoman(gi + 1)}</td>
          <td colspan="4">${gnvEsc(g.ten_nhom)}</td>
          <td class="gnv-center">${hasWeight ? gnvPct(sum) : ""}</td>
          <td colspan="8"></td>
          <td><div class="actions-cell">
            <button class="small btn-view write-action gnv-add-item-btn">+ Nhiệm vụ</button>
            <button class="small write-action gnv-pick-btn">Lấy từ Backlog</button>
            <button class="small btn-edit write-action gnv-edit-group-btn">Sửa</button>
            <button class="small btn-delete gnv-delete-group-btn">Xóa</button>
          </div></td>
        </tr>`;
      const itemRows = heads
        .map((head, i) => {
          const block = [head, ...g.items.filter((it) => it.parent_item_id === head.id)];
          const span = block.length;
          return block
            .map((it, bi) => {
              const isHead = bi === 0;
              // Cột dùng chung (STT/Mục tiêu/Chỉ số KPI/Đơn vị đo/Tỷ trọng): chỉ dòng đầu
              // của khối, gộp dọc theo số phương pháp đo.
              const shared = isHead
                ? `<td class="gnv-center" rowspan="${span}">${i + 1}</td>
          <td rowspan="${span}">${gnvEsc(head.muc_tieu)}</td>
          <td rowspan="${span}">${gnvEsc(head.chi_so_kpi)}</td>`
                : "";
              const shared2 = isHead
                ? `<td class="gnv-center" rowspan="${span}">${gnvEsc(head.don_vi_do)}</td>
          <td class="gnv-center" rowspan="${span}">${gnvPct(head.ty_trong)}</td>`
                : "";
              const btns = isHead
                ? `<button class="small btn-view write-action gnv-add-method-btn">+ PP đo</button>
            <button class="small btn-edit write-action gnv-edit-item-btn">Sửa</button>
            <button class="small btn-delete gnv-delete-item-btn">Xóa</button>`
                : `<button class="small btn-edit write-action gnv-edit-item-btn">Sửa</button>
            <button class="small btn-delete gnv-delete-item-btn">Xóa</button>`;
              return `
        <tr data-item-id="${it.id}" data-group-id="${g.id}" data-head="${isHead ? 1 : 0}">
          ${shared}
          <td>${gnvEsc(it.phuong_phap_do)}</td>
          ${shared2}
          <td class="gnv-center">${gnvEsc(gnvLevelText(head.don_vi_do, it.muc_toi_thieu))}</td>
          <td class="gnv-center">${gnvEsc(gnvLevelText(head.don_vi_do, it.muc_mong_doi))}</td>
          <td class="gnv-center">${gnvEsc(gnvLevelText(head.don_vi_do, it.muc_thach_thuc))}</td>
          <td class="gnv-center">${gnvEsc(formatDateDisplay(it.ngay_bat_dau))}</td>
          <td class="gnv-center">${gnvEsc(formatDateDisplay(it.ngay_hoan_thanh))}</td>
          <td>${gnvEsc(it.ket_qua_thuc_hien)}</td>
          <td class="gnv-center">${gnvEsc(it.cbnv_tu_danh_gia)}</td>
          <td class="gnv-center">${gnvEsc(it.qltt_danh_gia)}</td>
          <td><div class="actions-cell">
            ${btns}
          </div></td>
        </tr>`;
            })
            .join("");
        })
        .join("");
      return groupRow + itemRows;
    })
    .join("") + gnvTotalRowsHtml(groups);
}

// Tổng Tỷ trọng toàn bảng (chỉ cộng dòng MỤC TIÊU) — 2 dòng cuối bảng như mẫu:
// dòng nền xanh nhạt hiện "N%" và dòng "Σ = N%"; vượt 100% thì tô đỏ.
function gnvTotalWeight(groups) {
  const sum = groups.flatMap((g) => g.items).filter((i) => i.parent_item_id == null).reduce((s, i) => s + (i.ty_trong ?? 0), 0);
  return Math.round(sum * 100) / 100;
}
function gnvTotalRowsHtml(groups) {
  if (!groups.length) return "";
  const total = gnvTotalWeight(groups);
  const cls = total > 100 ? " gnv-total-over" : "";
  return `
        <tr class="gnv-total-row${cls}"><td colspan="5"></td><td class="gnv-center">${total}%</td><td colspan="9"></td></tr>
        <tr class="gnv-sigma-row${cls}"><td colspan="5"></td><td class="gnv-center">Σ = ${total}%</td><td colspan="9"></td></tr>`;
}

function gnvFindGroup(id) {
  return state.gnvGroups.find((g) => g.id === id);
}

// ---- Nhóm ----
let gnvEditingGroupId = null;

document.getElementById("gnv-add-group-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  gnvEditingGroupId = null;
  document.getElementById("gnv-group-title").textContent = "Thêm nhóm";
  document.getElementById("gnv-group-name").value = "";
  document.getElementById("gnv-group-dialog").showModal();
});
document.getElementById("gnv-group-cancel-btn")?.addEventListener("click", () => document.getElementById("gnv-group-dialog").close());
document.getElementById("gnv-group-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ten_nhom = document.getElementById("gnv-group-name").value.trim();
  if (!ten_nhom) return showToast("Hãy nhập tên nhóm.");
  try {
    if (gnvEditingGroupId) {
      await api(`/api/gnv/groups/${gnvEditingGroupId}`, { method: "PUT", body: JSON.stringify({ ten_nhom }) });
    } else {
      await api("/api/gnv/groups", {
        method: "POST",
        body: JSON.stringify({ period_id: state.currentPeriodId, department_id: state.currentDepartmentId, ten_nhom }),
      });
    }
    document.getElementById("gnv-group-dialog").close();
    await loadGnv();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Dòng nhiệm vụ ----
let gnvEditingItem = null; // { id } khi sửa, { groupId } khi thêm

// ctx: { groupId } thêm mục tiêu | { groupId, parentId } thêm phương pháp đo |
// { id, groupId, headUnit? } sửa (headUnit có khi sửa dòng phương pháp đo con).
// Dòng con ẩn các trường dùng chung (Mục tiêu/Chỉ số KPI/Đơn vị đo/Tỷ trọng).
function openGnvItemDialog(ctx, item) {
  gnvEditingItem = ctx;
  const isChild = !!ctx.parentId || ctx.isChild;
  document.querySelectorAll("#gnv-item-form .gnv-shared-field").forEach((el) => (el.hidden = isChild));
  document.getElementById("gnv-item-title").textContent = isChild
    ? ctx.id ? "Sửa phương pháp đo" : "Thêm phương pháp đo"
    : ctx.id ? "Sửa nhiệm vụ" : "Thêm nhiệm vụ";
  const set = (id, v) => (document.getElementById(id).value = v ?? "");
  set("gnv-f-muc-tieu", item?.muc_tieu);
  set("gnv-f-chi-so-kpi", item?.chi_so_kpi);
  set("gnv-f-phuong-phap-do", item?.phuong_phap_do);
  // Đơn vị đo cũ ngoài danh sách (dữ liệu trước đây) -> thêm tạm để không mất.
  const unitSel = document.getElementById("gnv-f-don-vi-do");
  unitSel.querySelectorAll("option[data-legacy]").forEach((o) => o.remove());
  if (item?.don_vi_do && ![...unitSel.options].some((o) => o.value === item.don_vi_do)) {
    unitSel.insertAdjacentHTML("beforeend", `<option value="${gnvEsc(item.don_vi_do)}" data-legacy="1">${gnvEsc(item.don_vi_do)}</option>`);
  }
  set("gnv-f-don-vi-do", item?.don_vi_do);
  gnvLevelUnit = isChild ? ctx.headUnit ?? "" : item?.don_vi_do ?? "";
  applyGnvLevelType(gnvLevelUnit);
  set("gnv-f-ty-trong", item?.ty_trong);
  set("gnv-f-toi-thieu", item?.muc_toi_thieu);
  set("gnv-f-mong-doi", item?.muc_mong_doi);
  set("gnv-f-thach-thuc", item?.muc_thach_thuc);
  set("gnv-f-bat-dau", (item?.ngay_bat_dau ?? "").slice(0, 10));
  set("gnv-f-hoan-thanh", (item?.ngay_hoan_thanh ?? "").slice(0, 10));
  set("gnv-f-ket-qua", item?.ket_qua_thuc_hien);
  set("gnv-f-cbnv", item?.cbnv_tu_danh_gia);
  set("gnv-f-qltt", item?.qltt_danh_gia);
  document.getElementById("gnv-item-dialog").showModal();
}
document.getElementById("gnv-item-cancel-btn")?.addEventListener("click", () => document.getElementById("gnv-item-dialog").close());
document.getElementById("gnv-item-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = (id) => document.getElementById(id).value.trim();
  const body = {
    muc_tieu: v("gnv-f-muc-tieu"),
    chi_so_kpi: v("gnv-f-chi-so-kpi"),
    phuong_phap_do: v("gnv-f-phuong-phap-do"),
    don_vi_do: v("gnv-f-don-vi-do"),
    ty_trong: v("gnv-f-ty-trong"),
    muc_toi_thieu: v("gnv-f-toi-thieu"),
    muc_mong_doi: v("gnv-f-mong-doi"),
    muc_thach_thuc: v("gnv-f-thach-thuc"),
    ngay_bat_dau: v("gnv-f-bat-dau"),
    ngay_hoan_thanh: v("gnv-f-hoan-thanh"),
    ket_qua_thuc_hien: v("gnv-f-ket-qua"),
    cbnv_tu_danh_gia: v("gnv-f-cbnv"),
    qltt_danh_gia: v("gnv-f-qltt"),
  };
  const isChild = !!gnvEditingItem.parentId || gnvEditingItem.isChild;
  if (!isChild && body.ty_trong !== "") {
    const w = Number(body.ty_trong);
    const others = state.gnvGroups
      .flatMap((g) => g.items)
      .filter((i) => i.parent_item_id == null && i.id !== gnvEditingItem.id)
      .reduce((s, i) => s + (i.ty_trong ?? 0), 0);
    if (!(w >= 0) || Math.round((others + w) * 100) / 100 > 100) {
      const left = Math.max(0, Math.round((100 - others) * 100) / 100);
      return showToast(`Tổng Tỷ trọng không được vượt quá 100% — còn tối đa ${left}%.`);
    }
  }
  if (isChild && !body.phuong_phap_do) return showToast("Hãy nhập Phương pháp đo.");
  if (!isChild && !body.muc_tieu) return showToast("Hãy nhập Mục tiêu nhiệm vụ/công việc.");
  const unitNow = isChild ? gnvLevelUnit : body.don_vi_do;
  if (unitNow === "Số lượng" || unitNow === "Điểm") {
    const bad = [body.muc_toi_thieu, body.muc_mong_doi, body.muc_thach_thuc].some((x) => x !== "" && !/^[1-9]\d*$/.test(x));
    if (bad) return showToast("Mức chỉ tiêu phải là số nguyên dương.");
  }
  try {
    if (gnvEditingItem.id) {
      await api(`/api/gnv/items/${gnvEditingItem.id}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await api("/api/gnv/items", { method: "POST", body: JSON.stringify({ ...body, group_id: gnvEditingItem.groupId, parent_item_id: gnvEditingItem.parentId ?? null }) });
    }
    document.getElementById("gnv-item-dialog").close();
    await loadGnv();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Lấy nhiệm vụ từ Backlog ----
let gnvPickGroupId = null;
let gnvPickTasks = [];
let gnvPickUsed = new Set();
let gnvPickSelected = new Set();
let gnvPickMode = "each"; // each | merge | parent

const GNV_PICK_HINTS = {
  each: "Mỗi nhiệm vụ tạo thành 1 dòng mục tiêu riêng; tên nhiệm vụ nằm ở cột Phương pháp đo.",
  merge: "Các nhiệm vụ đã chọn gộp chung 1 mục tiêu mới: nhiệm vụ đầu là dòng mục tiêu, các nhiệm vụ sau là phương pháp đo thêm.",
  parent: "Các nhiệm vụ đã chọn trở thành phương pháp đo thêm của mục tiêu bạn chọn bên dưới.",
};

function gnvPickVisibleTasks() {
  const term = document.getElementById("gnv-pick-search").value.trim().toLowerCase();
  return gnvPickTasks.filter((t) => !term || `${t.nhiem_vu} ${t.team}`.toLowerCase().includes(term));
}

function updateGnvPickFooter() {
  const n = gnvPickSelected.size;
  document.getElementById("gnv-pick-count").textContent = n ? `Đã chọn ${n} nhiệm vụ` : "Chưa chọn nhiệm vụ nào";
  const btn = document.getElementById("gnv-pick-submit");
  btn.disabled = n === 0;
  btn.textContent = n ? `Thêm ${n} nhiệm vụ` : "Thêm vào nhóm";
  const selectable = gnvPickVisibleTasks().filter((t) => !gnvPickUsed.has(t.id));
  const all = document.getElementById("gnv-pick-all");
  all.checked = selectable.length > 0 && selectable.every((t) => gnvPickSelected.has(t.id));
  all.disabled = selectable.length === 0;
}

function renderGnvPickList() {
  const visible = gnvPickVisibleTasks();
  document.getElementById("gnv-pick-list").innerHTML =
    visible
      .map((t) => {
        const used = gnvPickUsed.has(t.id);
        return `<label class="gnv-task${used ? " is-used" : ""}${gnvPickSelected.has(t.id) ? " is-selected" : ""}">
          <input type="checkbox" value="${t.id}" ${used ? "disabled" : ""} ${gnvPickSelected.has(t.id) ? "checked" : ""} />
          <span class="gnv-task-name">${gnvEsc(t.nhiem_vu)}</span>
          <span class="gnv-task-team">${gnvEsc(t.team)}</span>
          ${used ? '<span class="gnv-task-used">Đã có trong GNV</span>' : ""}
        </label>`;
      })
      .join("") || '<p class="gnv-pick-empty">Không có nhiệm vụ nào phù hợp.</p>';
  updateGnvPickFooter();
}

function setGnvPickMode(mode) {
  gnvPickMode = mode;
  document.querySelectorAll("#gnv-pick-seg .gnv-seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("gnv-pick-parent").hidden = mode !== "parent";
  document.getElementById("gnv-pick-hint").textContent = GNV_PICK_HINTS[mode];
}

async function openGnvPickDialog(groupId) {
  gnvPickGroupId = groupId;
  // Lấy đúng Backlog của THÁNG đang chọn + PHÒNG BAN của nhóm này (không phải
  // phòng đang xem ở header), rồi lọc lại phía client cho chắc — không để lọt
  // nhiệm vụ của tháng/phòng khác vào danh sách chọn.
  const group = gnvFindGroup(groupId);
  const periodId = state.currentPeriodId;
  const period = state.periods.find((p) => p.id === periodId);
  try {
    const dep = group?.department_id != null ? `&department_id=${group.department_id}` : "";
    const all = await api(`/api/periods/${periodId}/tasks?x=1${dep}`);
    gnvPickTasks = (all ?? []).filter(
      (t) => t.period_id === periodId && (group?.department_id == null || t.department_id === group.department_id),
    );
  } catch (err) {
    return showToast(err.message);
  }
  gnvPickUsed = new Set(state.gnvGroups.flatMap((g) => g.items.map((i) => i.task_id)).filter(Boolean));
  gnvPickSelected = new Set();
  const heads = (group?.items ?? []).filter((i) => i.parent_item_id == null);
  document.getElementById("gnv-pick-parent").innerHTML = heads
    .map((h) => `<option value="${h.id}">${gnvEsc((h.muc_tieu || h.phuong_phap_do || "(chưa có tên)").slice(0, 80))}</option>`)
    .join("");
  const parentBtn = document.querySelector('#gnv-pick-seg [data-mode="parent"]');
  parentBtn.disabled = heads.length === 0;
  parentBtn.title = heads.length === 0 ? "Nhóm này chưa có mục tiêu nào" : "";
  setGnvPickMode("each");
  document.getElementById("gnv-pick-period").textContent = `Backlog ${period?.label ?? ""}`;
  document.getElementById("gnv-pick-total").textContent = `${gnvPickTasks.length} nhiệm vụ`;
  document.getElementById("gnv-pick-search").value = "";
  renderGnvPickList();
  document.getElementById("gnv-pick-dialog").showModal();
}

document.getElementById("gnv-pick-search")?.addEventListener("input", renderGnvPickList);
document.getElementById("gnv-pick-seg")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".gnv-seg-btn");
  if (btn && !btn.disabled) setGnvPickMode(btn.dataset.mode);
});
document.getElementById("gnv-pick-list")?.addEventListener("change", (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  const id = Number(cb.value);
  if (cb.checked) gnvPickSelected.add(id);
  else gnvPickSelected.delete(id);
  cb.closest(".gnv-task")?.classList.toggle("is-selected", cb.checked);
  updateGnvPickFooter();
});
document.getElementById("gnv-pick-all")?.addEventListener("change", (e) => {
  gnvPickVisibleTasks()
    .filter((t) => !gnvPickUsed.has(t.id))
    .forEach((t) => (e.target.checked ? gnvPickSelected.add(t.id) : gnvPickSelected.delete(t.id)));
  renderGnvPickList();
});
document.getElementById("gnv-pick-cancel-btn")?.addEventListener("click", () => document.getElementById("gnv-pick-dialog").close());
document.getElementById("gnv-pick-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const task_ids = [...gnvPickSelected];
  if (task_ids.length === 0) return showToast("Hãy chọn ít nhất 1 nhiệm vụ.");
  try {
    const payload = { group_id: gnvPickGroupId, task_ids };
    if (gnvPickMode === "merge") payload.merge = true;
    else if (gnvPickMode === "parent") payload.parent_item_id = Number(document.getElementById("gnv-pick-parent").value);
    const r = await api("/api/gnv/items/from-tasks", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("gnv-pick-dialog").close();
    await loadGnv();
    showToast(`Đã thêm ${r.added} nhiệm vụ${r.skipped ? `, bỏ qua ${r.skipped}` : ""}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Sao chép nhóm + mục tiêu từ tháng khác ----
let gnvCopyGroups = []; // nhóm của tháng nguồn (kèm items)
let gnvCopySelected = new Set(); // id các dòng MỤC TIÊU được chọn

function gnvCopyHeads(g) {
  return g.items.filter((i) => i.parent_item_id == null);
}

function updateGnvCopyFooter() {
  const n = gnvCopySelected.size;
  document.getElementById("gnv-copy-count").textContent = n ? `Đã chọn ${n} mục tiêu` : "Chưa chọn mục tiêu nào";
  document.getElementById("gnv-copy-submit").disabled = n === 0;
  const allHeads = gnvCopyGroups.flatMap(gnvCopyHeads);
  const all = document.getElementById("gnv-copy-all");
  all.checked = allHeads.length > 0 && allHeads.every((h) => gnvCopySelected.has(h.id));
  all.disabled = allHeads.length === 0;
  document.querySelectorAll("#gnv-copy-list [data-group-cb]").forEach((cb) => {
    const g = gnvCopyGroups.find((x) => x.id === Number(cb.dataset.groupCb));
    const heads = g ? gnvCopyHeads(g) : [];
    cb.checked = heads.length > 0 && heads.every((h) => gnvCopySelected.has(h.id));
    cb.indeterminate = !cb.checked && heads.some((h) => gnvCopySelected.has(h.id));
  });
}

function renderGnvCopyList() {
  document.getElementById("gnv-copy-list").innerHTML =
    gnvCopyGroups
      .map((g, gi) => {
        const heads = gnvCopyHeads(g);
        return `<div class="gnv-copy-group">
          <label class="gnv-task gnv-copy-group-head"><input type="checkbox" data-group-cb="${g.id}" ${heads.length ? "" : "disabled"} />
            <span class="gnv-task-name"><b>${gnvToRoman(gi + 1)}. ${gnvEsc(g.ten_nhom)}</b></span>
            <span class="gnv-task-used">${heads.length} mục tiêu</span></label>
          ${heads
            .map(
              (h) => `<label class="gnv-task gnv-copy-item${gnvCopySelected.has(h.id) ? " is-selected" : ""}">
            <input type="checkbox" data-item-cb="${h.id}" ${gnvCopySelected.has(h.id) ? "checked" : ""} />
            <span class="gnv-task-name">${gnvEsc(h.muc_tieu || h.phuong_phap_do || "(chưa có tên)")}</span>
            ${h.ty_trong != null ? `<span class="gnv-task-team">${gnvPct(h.ty_trong)}</span>` : ""}</label>`,
            )
            .join("")}
        </div>`;
      })
      .join("") || '<p class="gnv-pick-empty">Tháng này chưa có nhóm/mục tiêu nào.</p>';
  updateGnvCopyFooter();
}

async function loadGnvCopySource() {
  const sourceId = Number(document.getElementById("gnv-copy-source").value);
  gnvCopySelected = new Set();
  gnvCopyGroups = [];
  if (sourceId) {
    try {
      gnvCopyGroups = (await api(`/api/gnv?period_id=${sourceId}${deptParam()}`)) ?? [];
    } catch (err) {
      showToast(err.message);
    }
  }
  renderGnvCopyList();
}

document.getElementById("gnv-copy-btn")?.addEventListener("click", async () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  if (state.currentDepartmentId == null) {
    return showToast('Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban trước (không dùng được khi đang xem "Tất cả").');
  }
  const others = state.periods.filter((p) => p.id !== state.currentPeriodId);
  if (others.length === 0) return showToast("Chưa có tháng nào khác để sao chép.");
  const current = state.periods.find((p) => p.id === state.currentPeriodId);
  document.getElementById("gnv-copy-target").textContent = `Sao chép vào ${current?.label ?? ""}`;
  document.getElementById("gnv-copy-source").innerHTML = others.map((p) => `<option value="${p.id}">${gnvEsc(p.label)}</option>`).join("");
  await loadGnvCopySource();
  document.getElementById("gnv-copy-dialog").showModal();
});
document.getElementById("gnv-copy-source")?.addEventListener("change", loadGnvCopySource);
document.getElementById("gnv-copy-cancel-btn")?.addEventListener("click", () => document.getElementById("gnv-copy-dialog").close());
document.getElementById("gnv-copy-list")?.addEventListener("change", (e) => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  if (cb.dataset.groupCb) {
    const g = gnvCopyGroups.find((x) => x.id === Number(cb.dataset.groupCb));
    gnvCopyHeads(g).forEach((h) => (cb.checked ? gnvCopySelected.add(h.id) : gnvCopySelected.delete(h.id)));
    renderGnvCopyList();
  } else {
    const id = Number(cb.dataset.itemCb);
    if (cb.checked) gnvCopySelected.add(id);
    else gnvCopySelected.delete(id);
    cb.closest(".gnv-task")?.classList.toggle("is-selected", cb.checked);
    updateGnvCopyFooter();
  }
});
document.getElementById("gnv-copy-all")?.addEventListener("change", (e) => {
  gnvCopyGroups.flatMap(gnvCopyHeads).forEach((h) => (e.target.checked ? gnvCopySelected.add(h.id) : gnvCopySelected.delete(h.id)));
  renderGnvCopyList();
});
document.getElementById("gnv-copy-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const selections = gnvCopyGroups
    .map((g) => ({ group_id: g.id, item_ids: gnvCopyHeads(g).filter((h) => gnvCopySelected.has(h.id)).map((h) => h.id) }))
    .filter((s) => s.item_ids.length);
  if (!selections.length) return showToast("Hãy chọn ít nhất 1 mục tiêu.");
  try {
    const r = await api("/api/gnv/copy", {
      method: "POST",
      body: JSON.stringify({
        source_period_id: Number(document.getElementById("gnv-copy-source").value),
        target_period_id: state.currentPeriodId,
        department_id: state.currentDepartmentId,
        with_methods: document.getElementById("gnv-copy-methods").checked,
        selections,
      }),
    });
    document.getElementById("gnv-copy-dialog").close();
    await loadGnv();
    showToast(
      `Đã sao chép ${r.items_added} mục tiêu${r.groups_created ? `, tạo ${r.groups_created} nhóm mới` : ""}${r.skipped ? `, bỏ qua ${r.skipped} mục tiêu đã có` : ""}.`,
      "success",
    );
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Nút trên bảng (event delegation) ----
document.getElementById("gnv-tbody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  const tr = e.target.closest("tr");
  if (!btn || !tr) return;
  const groupId = Number(tr.dataset.groupId);
  const group = gnvFindGroup(groupId);
  try {
    if (btn.classList.contains("gnv-add-item-btn")) openGnvItemDialog({ groupId }, null);
    else if (btn.classList.contains("gnv-pick-btn")) await openGnvPickDialog(groupId);
    else if (btn.classList.contains("gnv-add-method-btn")) {
      const head = group?.items.find((i) => i.id === Number(tr.dataset.itemId));
      openGnvItemDialog({ groupId, parentId: head.id, headUnit: head.don_vi_do ?? "" }, null);
    }
    else if (btn.classList.contains("gnv-edit-group-btn")) {
      gnvEditingGroupId = groupId;
      document.getElementById("gnv-group-title").textContent = "Sửa nhóm";
      document.getElementById("gnv-group-name").value = group?.ten_nhom ?? "";
      document.getElementById("gnv-group-dialog").showModal();
    } else if (btn.classList.contains("gnv-delete-group-btn")) {
      if (!(await confirmDialog(`Xóa nhóm "${group?.ten_nhom}" cùng toàn bộ nhiệm vụ trong nhóm?`, { title: "Xác nhận xóa", okText: "Xóa" }))) return;
      await api(`/api/gnv/groups/${groupId}`, { method: "DELETE" });
      await loadGnv();
    } else if (btn.classList.contains("gnv-edit-item-btn")) {
      const itemId = Number(tr.dataset.itemId);
      const item = group?.items.find((i) => i.id === itemId);
      const head = item?.parent_item_id != null ? group.items.find((i) => i.id === item.parent_item_id) : null;
      openGnvItemDialog({ id: itemId, groupId, isChild: !!head, headUnit: head?.don_vi_do ?? "" }, item);
    } else if (btn.classList.contains("gnv-delete-item-btn")) {
      const n = tr.dataset.head === "1" ? group.items.filter((i) => i.parent_item_id === Number(tr.dataset.itemId)).length : 0;
      if (!(await confirmDialog(n ? `Xóa nhiệm vụ này cùng ${n} phương pháp đo thêm?` : "Xóa dòng này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
      await api(`/api/gnv/items/${Number(tr.dataset.itemId)}`, { method: "DELETE" });
      await loadGnv();
    }
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById("gnv-export-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  window.location.href = `/api/gnv/export?period_id=${state.currentPeriodId}${deptParam()}`;
});
