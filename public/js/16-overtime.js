// ---- Kế hoạch tổng hợp > tab "Làm thêm giờ" ----
// Lọc theo Tháng theo dõi (state.currentPeriodId) + phòng ban đang xem
// (deptParam()) — server lọc cả 2, mỗi tháng/phòng 1 danh sách riêng.

const otPagination = createPagination("ot", () => renderOvertimeTable(), "bản ghi");
pinTableHead("ot-table"); // ghim tiêu đề khi cuộn trang xuống

function otEsc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

async function loadOvertime() {
  if (!state.currentPeriodId) {
    state.otRecords = [];
    renderOvertimeTable();
    return;
  }
  state.otRecords = (await api(`/api/overtime?period_id=${state.currentPeriodId}${deptParam()}`)) ?? [];
  renderOvertimeTable();
}

// Nhóm danh sách phẳng (đã sắp đầu->con ở server) thành các KHỐI: 1 lượt tác động
// (dòng đầu) + các nhân sự tham gia thêm của lượt đó.
function otBlocks(records) {
  const heads = records.filter((r) => r.parent_id == null);
  return heads.map((h) => ({ head: h, rows: [h, ...records.filter((r) => r.parent_id === h.id)] }));
}

// Lọc theo từ khoá: giữ NGUYÊN cả khối nếu có ít nhất 1 dòng khớp (không cắt
// lẻ nhân sự khỏi lượt tác động của họ).
function filteredOvertimeBlocks() {
  const blocks = otBlocks(state.otRecords);
  const term = (state.otSearch ?? "").trim().toLowerCase();
  if (!term) return blocks;
  return blocks.filter((b) =>
    b.rows.some((r) =>
      [r.ngay_tac_dong, r.noi_dung, r.so_ke_hoach, r.dia_diem, r.ma_nhan_vien, r.ho_va_ten, r.don_vi, r.bo_phan, r.khoang_thoi_gian, r.ghi_chu]
        .some((v) => (v ?? "").toLowerCase().includes(term)),
    ),
  );
}

// Tổng Số giờ/Số ngày ban ngày + ban đêm: cộng theo TỪNG DÒNG nhân sự hiển thị (giá trị dùng chung của lượt × số nhân sự của lượt).
function otTotals(blocks) {
  const t = { dg: 0, dn: 0, eg: 0, en: 0 };
  for (const b of blocks) {
    const n = b.rows.length;
    t.dg += (b.head.ban_ngay_so_gio ?? 0) * n;
    t.dn += (b.head.ban_ngay_so_ngay ?? 0) * n;
    t.eg += (b.head.ban_dem_so_gio ?? 0) * n;
    t.en += (b.head.ban_dem_so_ngay ?? 0) * n;
  }
  return t;
}
// Số ngày hiển thị dạng "0,0" / "0,5" (dấu phẩy thập phân, tối thiểu 1 chữ số lẻ).
const otDay = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 2 }));
const otFmt = (n) => (Math.round(n * 100) / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

// Chia các khối (lượt tác động) thành trang theo số DÒNG: mỗi trang chứa tối đa pageSize dòng, trừ khi 1 lượt tự nó dài hơn.
// Cập nhật thanh phân trang ("Hiển thị a–b trong N bản ghi" tính theo dòng, không theo lượt).
function otPageBlocks(blocks) {
  const size = otPagination.pageSize;
  const pages = [];
  let cur = [];
  let n = 0;
  for (const b of blocks) {
    if (cur.length && n + b.rows.length > size) {
      pages.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(b);
    n += b.rows.length;
  }
  if (cur.length) pages.push(cur);
  const totalPages = Math.max(1, pages.length);
  otPagination.page = Math.min(Math.max(1, otPagination.page), totalPages);
  const pageBlocks = pages[otPagination.page - 1] ?? [];
  const count = (list) => list.reduce((k, b) => k + b.rows.length, 0);
  const totalRows = count(blocks);
  const startRow = count(pages.slice(0, otPagination.page - 1).flat());
  const endRow = startRow + count(pageBlocks);
  const $ = (id) => document.getElementById(id);
  $("ot-page-info").textContent = totalRows === 0 ? "0 / 0" : `Trang ${otPagination.page} / ${totalPages}`;
  $("ot-page-prev").disabled = otPagination.page <= 1;
  $("ot-page-next").disabled = otPagination.page >= totalPages;
  $("ot-page-size").value = String(size);
  const range = document.querySelector("#ot-pagination .pagination-range-info");
  if (range) range.textContent = totalRows === 0 ? "Không có bản ghi nào" : `Hiển thị ${startRow + 1}–${endRow} trong ${totalRows} bản ghi`;
  return { pageBlocks, startRow };
}

function renderOvertimeTable() {
  const visible = filteredOvertimeBlocks();
  document.getElementById("ot-empty").hidden = visible.length > 0;
  // Phân trang theo SỐ DÒNG nhân sự hiển thị (không cắt đôi 1 lượt tác động giữa 2 trang).
  const { pageBlocks, startRow } = otPageBlocks(visible);
  // Stt chạy theo TỪNG DÒNG nhân sự (không theo lượt): dòng đầu trang = số dòng ở các trang trước + 1.
  let rowNo = startRow;
  const multi = (v) => otEsc(v).replace(/\n/g, "<br/>");
  document.getElementById("ot-tbody").innerHTML = pageBlocks
    .map((blk) =>
      blk.rows
        .map((r, ri) => {
          const isHead = ri === 0;
          // Ngày/Nội dung/Số kế hoạch/Địa điểm là giá trị dùng chung cả lượt (lấy từ dòng đầu)
          // nhưng HIỂN THỊ ở từng dòng riêng, không gộp ô.
          rowNo += 1;
          const h1 = blk.head;
          const shared1 = `<td class="ot-center">${rowNo}</td>
      <td class="ot-center">${otEsc(formatDateDisplay(h1.ngay_tac_dong))}</td>
      <td>${multi(h1.noi_dung)}</td>
      <td>${otEsc(h1.so_ke_hoach)}</td>
      <td>${otEsc(h1.dia_diem)}</td>`;
          // Bộ phận/Khoảng thời gian/ban ngày-đêm/Ghi chú: GIÁ TRỊ dùng chung cả lượt (lấy từ
          // dòng đầu) nhưng HIỂN THỊ ở từng dòng riêng, không gộp ô.
          const h0 = blk.head;
          const shared2 = `<td>${otEsc(h0.bo_phan)}</td>
      <td>${otEsc(h0.khoang_thoi_gian)}</td>
      <td class="ot-center">${otEsc(h0.ban_ngay_so_gio)}</td>
      <td class="ot-center">${otDay(h0.ban_ngay_so_ngay)}</td>
      <td class="ot-center">${otEsc(h0.ban_dem_so_gio)}</td>
      <td class="ot-center">${otDay(h0.ban_dem_so_ngay)}</td>
      <td>${multi(h0.ghi_chu)}</td>`;
          const btns = isHead
            ? `<button class="small btn-view write-action ot-add-person-btn">+ Nhân sự</button>
        <button class="small btn-edit write-action ot-edit-btn">Sửa</button>
        <button class="small btn-delete ot-delete-btn">Xóa</button>`
            : `<button class="small btn-edit write-action ot-edit-btn">Sửa</button>
        <button class="small btn-delete ot-delete-btn">Xóa</button>`;
          return `
    <tr data-id="${r.id}" data-head="${isHead ? 1 : 0}">
      ${shared1}
      <td class="ot-center">${otEsc(r.ma_nhan_vien)}</td>
      <td>${otEsc(r.ho_va_ten)}</td>
      <td>${otEsc(r.don_vi)}</td>
      ${shared2}
      <td><div class="actions-cell">
        ${btns}
      </div></td>
    </tr>`;
        })
        .join(""),
    )
    .join("");
  // Dòng "Tổng:" cuối bảng (tính trên toàn bộ dữ liệu đang lọc, không chỉ trang hiện tại).
  const tot = otTotals(visible);
  document.getElementById("ot-tfoot").innerHTML = visible.length
    ? `<tr class="ot-total-row"><td colspan="9"></td><td class="ot-center">Tổng:</td>
        <td class="ot-center">${otFmt(tot.dg)}</td><td class="ot-center">${otDay(tot.dn)}</td><td class="ot-center">${otFmt(tot.eg)}</td><td class="ot-center">${otDay(tot.en)}</td><td colspan="2"></td></tr>`
    : "";
  syncOtStickyHeadOffset();
}

// Ghim 2 hàng tiêu đề (cùng cơ chế #cbnv-table/#gnv-table).
function syncOtStickyHeadOffset() {
  const table = document.getElementById("ot-table");
  const row1 = table?.querySelector("thead tr:first-child");
  if (!table || !row1) return;
  const update = () => table.style.setProperty("--ot-thead-row1-h", `${row1.offsetHeight}px`);
  update();
  if (!table._otHeadResizeObserver) {
    table._otHeadResizeObserver = new ResizeObserver(update);
    table._otHeadResizeObserver.observe(row1);
  }
}

document.getElementById("ot-search")?.addEventListener("input", (e) => {
  state.otSearch = e.target.value;
  otPagination.reset();
  renderOvertimeTable();
});

// ---- Thêm / Sửa ----
const OT_FIELDS = {
  ngay_tac_dong: "ot-f-ngay",
  noi_dung: "ot-f-noi-dung",
  so_ke_hoach: "ot-f-so-ke-hoach",
  dia_diem: "ot-f-dia-diem",
  ma_nhan_vien: "ot-f-ma-nv",
  ho_va_ten: "ot-f-ho-ten",
  don_vi: "ot-f-don-vi",
  bo_phan: "ot-f-bo-phan",
  khoang_thoi_gian: "ot-f-khoang",
  ca_tac_dong: "ot-f-ca",
  ban_ngay_so_gio: "ot-f-ngay-gio",
  ban_ngay_so_ngay: "ot-f-ngay-ngay",
  ban_dem_so_gio: "ot-f-dem-gio",
  ban_dem_so_ngay: "ot-f-dem-ngay",
  ghi_chu: "ot-f-ghi-chu",
};

// ctx: { } thêm lượt tác động mới | { parentId } thêm nhân sự tham gia thêm |
// record = dòng đang sửa (dòng con ẩn các trường dùng chung).
// Tác động ban ngày -> chỉ hiện Số giờ/Số ngày ban ngày; ban đêm -> chỉ hiện ban đêm;
// chưa chọn -> chỉ hiện phần nào ĐANG có số liệu (dòng cũ/import không rõ ca, để không
// mất dữ liệu). Phần bị ẩn do đã chọn ca được đặt = 0.
function applyOtPeriodFields() {
  const ca = document.getElementById("ot-f-ca").value;
  const val = (id) => document.getElementById(id).value.trim() !== "";
  const showDay = ca === "Tác động ban ngày" || (ca === "" && (val("ot-f-ngay-gio") || val("ot-f-ngay-ngay")));
  const showNight = ca === "Tác động ban đêm" || (ca === "" && (val("ot-f-dem-gio") || val("ot-f-dem-ngay")));
  document.querySelectorAll("#ot-form .ot-day-field").forEach((el) => (el.hidden = !showDay));
  document.querySelectorAll("#ot-form .ot-night-field").forEach((el) => (el.hidden = !showNight));
  // Chọn ca nào thì số giờ/số ngày của ca còn lại = 0 (server cũng ép như vậy khi lưu).
  if (ca && !showDay) ["ot-f-ngay-gio", "ot-f-ngay-ngay"].forEach((id) => (document.getElementById(id).value = "0"));
  if (ca && !showNight) ["ot-f-dem-gio", "ot-f-dem-ngay"].forEach((id) => (document.getElementById(id).value = "0"));
}
document.getElementById("ot-f-ca")?.addEventListener("change", applyOtPeriodFields);

// Số ngày = Số giờ / 8 (tự tính, chỉ đọc) — cập nhật ngay khi nhập Số giờ.
function syncOtDays() {
  [["ot-f-ngay-gio", "ot-f-ngay-ngay"], ["ot-f-dem-gio", "ot-f-dem-ngay"]].forEach(([gioId, ngayId]) => {
    const raw = document.getElementById(gioId).value.trim();
    const gio = Number(raw);
    document.getElementById(ngayId).value = raw !== "" && Number.isFinite(gio) && gio >= 0 ? String(Math.round((gio / 8) * 100) / 100) : "";
  });
}
["ot-f-ngay-gio", "ot-f-dem-gio"].forEach((id) => document.getElementById(id)?.addEventListener("input", syncOtDays));

const OT_DEFAULT_NOTE = "Không nghỉ sáng";

async function openOvertimeDialog(record, ctx = {}) {
  renderOtMemberList(await ensureOtMembers(), record?.ho_va_ten ?? null);
  state.otEditingId = record?.id ?? null;
  state.otParentId = ctx.parentId ?? null;
  const isChild = !!ctx.parentId || (record && record.parent_id != null);
  // Dòng nhân sự thêm chỉ nhập Mã NV/Họ tên/Đơn vị — các trường còn lại dùng chung của lượt tác động.
  document.getElementById("ot-form").classList.toggle("is-child", isChild);
  document.getElementById("ot-dialog-title").textContent = isChild
    ? record ? "Sửa nhân sự tham gia" : "Thêm nhân sự tham gia"
    : record ? "Sửa làm thêm giờ" : "Thêm mới làm thêm giờ";
  // Địa điểm cũ nằm ngoài danh sách (dữ liệu trước đây) -> thêm tạm để không mất.
  const locSel = document.getElementById("ot-f-dia-diem");
  locSel.querySelectorAll("option[data-legacy]").forEach((o) => o.remove());
  if (record?.dia_diem && ![...locSel.options].some((o) => o.value === record.dia_diem)) {
    locSel.insertAdjacentHTML("beforeend", `<option value="${otEsc(record.dia_diem)}" data-legacy="1">${otEsc(record.dia_diem)}</option>`);
  }
  for (const [key, id] of Object.entries(OT_FIELDS)) {
    const v = record?.[key];
    document.getElementById(id).value = key === "ngay_tac_dong" ? (v ?? "").slice(0, 10) : (v ?? "");
  }
  // Mã NV chỉ đọc: luôn lấy theo Họ và Tên từ bảng User (không có thì giữ giá trị đã lưu).
  state.userCodes = null;
  if (record?.ho_va_ten) {
    const code = await lookupUserCode(record.ho_va_ten);
    if (code) document.getElementById("ot-f-ma-nv").value = code;
  }
  // Thêm MỚI lượt tác động: Ghi chú mặc định "Không nghỉ sáng" (sửa/xoá được).
  if (!record && !ctx.parentId) document.getElementById("ot-f-ghi-chu").value = OT_DEFAULT_NOTE;
  // Thêm/sửa nhân sự tham gia: Ghi chú dùng chung của lượt (lấy từ dòng đầu) — hiện để người nhập biết, nhân sự mới hiển thị đúng ghi chú này.
  const note = document.getElementById("ot-child-note");
  const head = isChild ? state.otRecords.find((r) => r.id === (ctx.parentId ?? record?.parent_id)) : null;
  note.hidden = !(head && head.ghi_chu);
  note.innerHTML = head?.ghi_chu ? `<b>Ghi chú của lượt tác động:</b> ${otEsc(head.ghi_chu)}` : "";
  syncOtDays();
  applyOtPeriodFields();
  document.getElementById("ot-dialog").showModal();
}

// Họ và Tên: danh sách chọn nhân sự của tháng + phòng ban đang xem (tab "Team &
// Nhân sự" — state.members, nạp bởi loadMembers). Chọn 1 nhân sự -> tự điền Đơn
// vị (= phòng ban) NẾU ô đó đang trống; Bộ phận để trống tự nhập.
async function ensureOtMembers() {
  if (!state.currentPeriodId) return [];
  if (!state.members?.length) {
    try {
      state.members = (await api(`/api/members?period_id=${state.currentPeriodId}${deptParam()}`)) ?? [];
    } catch {
      state.members = [];
    }
  }
  return state.members;
}
function renderOtMemberList(members, currentName) {
  const sel = document.getElementById("ot-f-ho-ten");
  let html = '<option value="">— Chọn nhân sự —</option>' +
    members.map((m) => `<option value="${otEsc(m.name)}">${otEsc(m.name)}</option>`).join("");
  // Tên cũ không có trong danh sách (VD nhập từ file Import) -> thêm tạm để không mất.
  if (currentName && !members.some((m) => m.name === currentName)) {
    html += `<option value="${otEsc(currentName)}">${otEsc(currentName)}</option>`;
  }
  sel.innerHTML = html;
}
document.getElementById("ot-f-ho-ten")?.addEventListener("change", async (e) => {
  const code = await lookupUserCode(e.target.value);
  document.getElementById("ot-f-ma-nv").value = code ?? "";
  const member = (state.members ?? []).find((m) => m.name === e.target.value);
  if (!member) return;
  const donVi = document.getElementById("ot-f-don-vi");
  const dept = (state.departments ?? []).find((d) => d.id === state.currentDepartmentId);
  if (!donVi.value.trim() && dept) donVi.value = dept.name;
});

document.getElementById("ot-add-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  openOvertimeDialog(null);
});
document.getElementById("ot-cancel-btn")?.addEventListener("click", () => document.getElementById("ot-dialog").close());

document.getElementById("ot-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {};
  for (const [key, id] of Object.entries(OT_FIELDS)) body[key] = document.getElementById(id).value.trim();
  if (!body.ho_va_ten) return showToast("Hãy nhập Họ và Tên.");
  try {
    if (state.otEditingId) {
      await api(`/api/overtime/${state.otEditingId}`, { method: "PUT", body: JSON.stringify(body) });
    } else {
      await api("/api/overtime", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          period_id: state.currentPeriodId,
          department_id: state.currentDepartmentId,
          parent_id: state.otParentId ?? null,
        }),
      });
    }
    document.getElementById("ot-dialog").close();
    await loadOvertime();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById("ot-tbody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  const tr = e.target.closest("tr");
  if (!btn || !tr) return;
  const id = Number(tr.dataset.id);
  try {
    if (btn.classList.contains("ot-add-person-btn")) {
      openOvertimeDialog(null, { parentId: id });
    } else if (btn.classList.contains("ot-edit-btn")) {
      openOvertimeDialog(state.otRecords.find((r) => r.id === id));
    } else if (btn.classList.contains("ot-delete-btn")) {
      const n = tr.dataset.head === "1" ? state.otRecords.filter((r) => r.parent_id === id).length : 0;
      if (!(await confirmDialog(n ? `Xóa lượt tác động này cùng ${n} nhân sự tham gia thêm?` : "Xóa dòng này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
      await api(`/api/overtime/${id}`, { method: "DELETE" });
      await loadOvertime();
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Tải file mẫu / Import / Xuất Excel ----
document.getElementById("ot-download-template-btn")?.addEventListener("click", () => {
  window.location.href = "/api/overtime/import-template";
});
document.getElementById("ot-export-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  window.location.href = `/api/overtime/export?period_id=${state.currentPeriodId}${deptParam()}`;
});
document.getElementById("ot-import-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) return showToast("Hãy chọn Tháng theo dõi trước.");
  document.getElementById("ot-import-input").click();
});
document.getElementById("ot-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("ot-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/overtime/import?period_id=${state.currentPeriodId}${deptParam()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadOvertime();
    const msg = `Đã nhập ${result.imported} dòng.`;
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
