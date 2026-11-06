// ---- Kế hoạch tổng hợp > tab "Tổng hợp làm thêm giờ" ----
// Mỗi dòng = 1 nhân sự trong 1 tháng + phòng ban đang xem (server lọc, không lẫn tháng/phòng khác). Chỉ NHẬP: Mã NV, Họ tên,
// Đơn vị, Bộ phận, Số giờ ban ngày/ban đêm (Số ngày = giờ/8), Tổng các tháng trước (tuỳ chọn), Ghi chú. Tổng tháng, Vượt quy
// định (40h/tháng), Đánh giá, Lũy kế, Tỷ lệ (200h/năm) do server tính — xem overtimeSummary.service.ts.

const otsPagination = createPagination("otsum", () => renderOvertimeSummary(), "bản ghi");
pinTableHead("otsum-table"); // ghim tiêu đề khi cuộn trang xuống

const otsNum = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 }));

async function loadOvertimeSummary() {
  if (!state.currentPeriodId) {
    state.otsRecords = [];
    renderOvertimeSummary();
    return;
  }
  state.otsRecords = (await api(`/api/overtime-summary?period_id=${state.currentPeriodId}${deptParam()}`)) ?? [];
  renderOvertimeSummary();
  await loadOtsUnit();
}

// ---- Bảng "Tổng hợp đơn vị" (dưới bảng dữ liệu): mục tiêu 6 tháng cuối năm SỬA ĐƯỢC; lũy kế + còn lại tự tính ----
async function loadOtsUnit() {
  const box = document.getElementById("otsum-unit");
  if (!state.currentPeriodId || state.currentDepartmentId == null) {
    box.hidden = true;
    return;
  }
  try {
    const u = await api(`/api/overtime-summary/unit?period_id=${state.currentPeriodId}${deptParam()}`);
    renderOtsUnit(u);
  } catch {
    box.hidden = true;
  }
}
const otsFx = (n) => (n == null ? "" : (Math.round(n * 100) / 100).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
function renderOtsUnit(u) {
  const box = document.getElementById("otsum-unit");
  if (!u) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  document.getElementById("otsum-unit-th-target").textContent = `Tổng số giờ làm thêm mục tiêu 6 tháng cuối năm ${u.year} của đơn vị`;
  document.getElementById("otsum-unit-th-luyke").textContent = `Tổng số giờ làm thêm lũy kế thực hiện đến tháng ${u.month}/${u.year}`;
  document.getElementById("otsum-unit-th-conlai").textContent = `Tổng số giờ làm thêm còn được thực hiện đến tháng 12/${u.year}`;
  document.getElementById("otsum-unit-name").textContent = u.department_name ?? "";
  const input = document.getElementById("otsum-unit-target");
  if (document.activeElement !== input) input.value = u.target_hours ?? "";
  document.getElementById("otsum-unit-luyke").textContent = otsFx(u.luy_ke);
  const conlai = document.getElementById("otsum-unit-conlai");
  conlai.textContent = u.con_lai == null ? "" : otsFx(u.con_lai);
  conlai.classList.toggle("ots-bad", u.con_lai != null && u.con_lai < 0);
}
async function saveOtsUnitTarget() {
  const input = document.getElementById("otsum-unit-target");
  try {
    const u = await api("/api/overtime-summary/unit", {
      method: "PUT",
      body: JSON.stringify({ period_id: state.currentPeriodId, department_id: state.currentDepartmentId, target_hours: input.value.trim() }),
    });
    renderOtsUnit(u);
    showToast("Đã lưu mục tiêu.", "success");
  } catch (err) {
    showToast(err.message);
    loadOtsUnit();
  }
}
document.getElementById("otsum-unit-target")?.addEventListener("change", saveOtsUnitTarget);
document.getElementById("otsum-unit-target")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.target.blur();
});

function filteredOvertimeSummary() {
  const term = (state.otsSearch ?? "").trim().toLowerCase();
  if (!term) return state.otsRecords;
  return state.otsRecords.filter((r) => [r.ma_nhan_vien, r.ho_va_ten, r.don_vi, r.bo_phan, r.ghi_chu].some((v) => (v ?? "").toLowerCase().includes(term)));
}

function otsRating(text) {
  if (!text) return "";
  // "Trong giới hạn số giờ…" hiện chữ thường (không tô màu); "Đạt" giữ nhãn xanh; còn lại (Quá số giờ / Vượt quy định) nhãn hồng.
  if (text.startsWith("Trong")) return otEsc(text);
  return `<span class="ots-pill ${text === "Đạt" ? "ok" : "bad"}">${otEsc(text)}</span>`;
}

function renderOvertimeSummary() {
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  const th = document.getElementById("otsum-th-tong");
  if (th) th.textContent = `Tổng số giờ làm thêm trong ${period ? "tháng " + period.month : "tháng"}`;
  const visible = filteredOvertimeSummary();
  document.getElementById("otsum-empty").hidden = visible.length > 0;
  const page = otsPagination.slice(visible);
  const start = (otsPagination.page - 1) * otsPagination.pageSize;
  // Dòng "Tổng cộng" (tô vàng) ngay dưới tiêu đề: cộng trên TOÀN BỘ dữ liệu đang lọc, không chỉ trang hiện tại.
  const sum = (f) => visible.reduce((s, r) => s + (r[f] ?? 0), 0);
  const fx = (n) => (Math.round(n * 100) / 100).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const totalRow = visible.length
    ? `<tr class="ots-total-row"><td></td><td></td><td>Tổng cộng</td><td></td><td></td>
        <td class="ot-center">${fx(sum("ban_ngay_so_gio"))}</td><td class="ot-center">${fx(sum("ban_ngay_so_ngay"))}</td><td class="ot-center">${fx(sum("ban_dem_so_gio"))}</td><td class="ot-center">${fx(sum("ban_dem_so_ngay"))}</td>
        <td class="ot-center">${fx(sum("tong_thang"))}</td><td class="ot-center">${fx(sum("vuot_quy_dinh"))}</td><td></td><td class="ot-center">${fx(sum("tong_cac_thang_truoc"))}</td><td class="ot-center">${fx(sum("luy_ke"))}</td><td></td><td></td><td></td><td></td></tr>`
    : "";
  document.getElementById("otsum-tbody").innerHTML = totalRow + page
    .map(
      (r, i) => `
    <tr data-id="${r.id}">
      <td class="ot-center">${start + i + 1}</td>
      <td class="ot-center">${otEsc(r.ma_nhan_vien)}</td>
      <td>${otEsc(r.ho_va_ten)}</td>
      <td>${otEsc(r.don_vi)}</td>
      <td>${otEsc(r.bo_phan)}</td>
      <td class="ot-center">${otsNum(r.ban_ngay_so_gio)}</td>
      <td class="ot-center">${otDay(r.ban_ngay_so_ngay)}</td>
      <td class="ot-center">${otsNum(r.ban_dem_so_gio)}</td>
      <td class="ot-center">${otDay(r.ban_dem_so_ngay)}</td>
      <td class="ot-center ots-strong">${otsNum(r.tong_thang)}</td>
      <td class="ot-center ${r.vuot_quy_dinh > 0 ? "ots-bad" : ""}">${otsNum(r.vuot_quy_dinh)}</td>
      <td class="ot-center">${otsRating(r.danh_gia_thang)}</td>
      <td class="ot-center">${otsNum(r.tong_cac_thang_truoc)}${r.tong_cac_thang_truoc_nhap != null ? ' <i class="ots-manual" title="Nhập tay">✎</i>' : ""}</td>
      <td class="ot-center ots-strong">${otsNum(r.luy_ke)}</td>
      <td class="ot-center ${r.ty_le > 100 ? "ots-bad" : ""}">${otsNum(r.ty_le)}%</td>
      <td class="ot-center">${otsRating(r.danh_gia_nam)}</td>
      <td>${otEsc(r.ghi_chu).replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action ots-edit-btn">Sửa</button>
        <button class="small btn-delete ots-delete-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");
}

document.getElementById("otsum-search")?.addEventListener("input", (e) => {
  state.otsSearch = e.target.value;
  otsPagination.reset();
  renderOvertimeSummary();
});

// ---- Thêm / Sửa ----
function renderOtsMemberList(members, currentName) {
  const sel = document.getElementById("otsum-f-ho-ten");
  let html = '<option value="">— Chọn nhân sự —</option>' + members.map((m) => `<option value="${otEsc(m.name)}">${otEsc(m.name)}</option>`).join("");
  if (currentName && !members.some((m) => m.name === currentName)) html += `<option value="${otEsc(currentName)}">${otEsc(currentName)}</option>`;
  sel.innerHTML = html;
}
// Chọn nhân sự -> tự điền Đơn vị (= phòng ban) nếu đang trống.
document.getElementById("otsum-f-ho-ten")?.addEventListener("change", async (e) => {
  const code = await lookupUserCode(e.target.value);
  if (code) document.getElementById("otsum-f-ma-nv").value = code;
  if (!(state.members ?? []).some((m) => m.name === e.target.value)) return;
  const donVi = document.getElementById("otsum-f-don-vi");
  const dept = (state.departments ?? []).find((d) => d.id === state.currentDepartmentId);
  if (!donVi.value.trim() && dept) donVi.value = dept.name;
});
// Số ngày = Số giờ / 8 (tự tính, chỉ đọc).
function syncOtsDays() {
  [["otsum-f-ngay-gio", "otsum-f-ngay-ngay"], ["otsum-f-dem-gio", "otsum-f-dem-ngay"]].forEach(([g, n]) => {
    const raw = document.getElementById(g).value.trim();
    const gio = Number(raw);
    document.getElementById(n).value = raw !== "" && Number.isFinite(gio) && gio >= 0 ? String(Math.round((gio / 8) * 100) / 100) : "";
  });
}
["otsum-f-ngay-gio", "otsum-f-dem-gio"].forEach((id) => document.getElementById(id)?.addEventListener("input", syncOtsDays));

const OTS_FIELDS = {
  ma_nhan_vien: "otsum-f-ma-nv",
  ho_va_ten: "otsum-f-ho-ten",
  don_vi: "otsum-f-don-vi",
  bo_phan: "otsum-f-bo-phan",
  ban_ngay_so_gio: "otsum-f-ngay-gio",
  ban_dem_so_gio: "otsum-f-dem-gio",
  tong_cac_thang_truoc_nhap: "otsum-f-truoc",
  ghi_chu: "otsum-f-ghi-chu",
};

async function openOtsDialog(record) {
  renderOtsMemberList(await ensureOtMembers(), record?.ho_va_ten ?? null);
  state.otsEditingId = record?.id ?? null;
  document.getElementById("otsum-dialog-title").textContent = record ? "Sửa tổng hợp làm thêm giờ" : "Thêm mới tổng hợp làm thêm giờ";
  for (const [key, id] of Object.entries(OTS_FIELDS)) document.getElementById(id).value = record?.[key] ?? "";
  syncOtsDays();
  document.getElementById("otsum-dialog").showModal();
}
document.getElementById("otsum-add-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  openOtsDialog(null);
});
document.getElementById("otsum-cancel-btn")?.addEventListener("click", () => document.getElementById("otsum-dialog").close());
document.getElementById("otsum-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {};
  for (const [key, id] of Object.entries(OTS_FIELDS)) body[key] = document.getElementById(id).value.trim();
  if (!body.ho_va_ten) return showToast("Hãy chọn Họ và Tên.");
  try {
    if (state.otsEditingId) await api(`/api/overtime-summary/${state.otsEditingId}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/overtime-summary", { method: "POST", body: JSON.stringify({ ...body, period_id: state.currentPeriodId, department_id: state.currentDepartmentId }) });
    document.getElementById("otsum-dialog").close();
    await loadOvertimeSummary();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});
document.getElementById("otsum-tbody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  const tr = e.target.closest("tr");
  if (!btn || !tr) return;
  const id = Number(tr.dataset.id);
  try {
    if (btn.classList.contains("ots-edit-btn")) openOtsDialog(state.otsRecords.find((r) => r.id === id));
    else if (btn.classList.contains("ots-delete-btn")) {
      if (!(await confirmDialog("Xóa dòng tổng hợp làm thêm giờ này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
      await api(`/api/overtime-summary/${id}`, { method: "DELETE" });
      await loadOvertimeSummary();
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Lấy từ Chi tiết / File mẫu / Import / Xuất Excel ----
document.getElementById("otsum-from-detail-btn")?.addEventListener("click", async () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  const call = (dry) => api("/api/overtime-summary/from-detail", { method: "POST", body: JSON.stringify({ period_id: state.currentPeriodId, department_id: state.currentDepartmentId, dry_run: dry }) });
  try {
    // Xem trước: dòng nào sẽ thêm/cập nhật/xoá (nhân sự đã xoá ở tab Chi tiết thì xoá khỏi Tổng hợp) rồi mới hỏi xác nhận.
    const p = await call(true);
    const names = p.removed_names.length ? `\n\nSẽ XÓA ${p.removed} dòng không còn trong Chi tiết: ${p.removed_names.slice(0, 8).join(", ")}${p.removed_names.length > 8 ? "…" : ""}.` : "";
    if (!p.created && !p.updated && !p.removed) return showToast("Chi tiết làm thêm giờ của tháng này chưa có dữ liệu để lấy.");
    const msg = `Đồng bộ với tab Chi tiết làm thêm giờ: thêm ${p.created} dòng mới, cập nhật ${p.updated} dòng.${names}`;
    if (!(await confirmDialog(msg, { title: "Lấy từ Chi tiết", okText: "Đồng bộ", danger: p.removed > 0 }))) return;
    const r = await call(false);
    await loadOvertimeSummary();
    showToast(`Đã đồng bộ: ${r.created} dòng mới, ${r.updated} cập nhật${r.removed ? `, xóa ${r.removed}` : ""}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});
document.getElementById("otsum-download-template-btn")?.addEventListener("click", () => {
  window.location.href = "/api/overtime-summary/import-template";
});
document.getElementById("otsum-export-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  window.location.href = `/api/overtime-summary/export?period_id=${state.currentPeriodId}${deptParam()}`;
});
document.getElementById("otsum-import-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  document.getElementById("otsum-import-input").click();
});
document.getElementById("otsum-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("otsum-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const res = await fetch(`/api/overtime-summary/import?period_id=${state.currentPeriodId}${deptParam()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: await file.arrayBuffer(),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Lỗi ${res.status}`);
    const result = await res.json();
    await loadOvertimeSummary();
    const msg = `Đã nhập ${result.imported} dòng.`;
    if (result.skipped?.length) {
      const detail = result.skipped.slice(0, 5).map((s) => `dòng ${s.row}${s.label ? ` (${s.label})` : ""}: ${s.reason}`).join("; ");
      showToast(`${msg} Bỏ qua ${result.skipped.length} dòng — ${detail}${result.skipped.length > 5 ? `; +${result.skipped.length - 5} dòng khác` : ""}`, "error");
    } else showToast(msg, "success");
  } catch (err) {
    showToast(err.message);
  }
});
