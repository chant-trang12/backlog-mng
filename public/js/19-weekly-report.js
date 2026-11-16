// Tab "BC tuần" (Kế hoạch tổng hợp): Báo cáo giao ban tuần theo phòng ban — chọn Năm + Tuần (ISO), nhập 3 mục A/B/C,
// xem trước giống mẫu Word, xuất .docx. Dữ liệu theo (phòng ban, năm, tuần), KHÔNG phụ thuộc "Tháng theo dõi".

const WK_STATUSES = ["Hoàn thành", "Đang thực hiện", "Vướng mắc / cần gia hạn", "Chưa cập nhật"];
const WK_STATUS_CLASS = { "Hoàn thành": "wk-st-done", "Đang thực hiện": "wk-st-doing", "Vướng mắc / cần gia hạn": "wk-st-stuck", "Chưa cập nhật": "wk-st-none" };

// Trường nhập theo mục (key = cột weekly_report_rows). type: text | area | status.
const WK_FIELDS = {
  A: [
    { key: "mang_cong_viec", label: "Mảng công việc", type: "text", list: true },
    { key: "muc_tieu", label: "Mục tiêu", type: "area" },
    { key: "noi_dung", label: "Nội dung công việc", type: "area" },
    { key: "tien_do", label: "Kết quả thực hiện tuần", type: "area" },
    { key: "ke_hoach", label: "Kế hoạch tuần sau", type: "area" },
  ],
  B: [
    { key: "ten", label: "Nhiệm vụ", type: "area" },
    { key: "chu_tri", label: "Chủ trì", type: "text" },
    { key: "tien_do", label: "Tiến độ thực hiện tuần", type: "area" },
    { key: "noi_dung", label: "Nội dung", type: "area" },
    { key: "kho_khan", label: "Khó khăn", type: "area" },
    { key: "de_xuat", label: "Đề xuất", type: "area" },
    { key: "ke_hoach", label: "Kế hoạch tuần sau", type: "area" },
    { key: "trang_thai", label: "Trạng thái", type: "status" },
  ],
  C: [
    { key: "ten", label: "Văn bản", type: "area" },
    { key: "chu_tri", label: "Chủ trì", type: "text" },
    { key: "tien_do", label: "Tiến độ thực hiện tuần", type: "area" },
    { key: "kho_khan", label: "Khó khăn", type: "area" },
    { key: "de_xuat", label: "Đề xuất", type: "area" },
    { key: "ke_hoach", label: "Kế hoạch tuần sau", type: "area" },
    { key: "trang_thai", label: "Trạng thái", type: "status" },
  ],
};
const wkFieldsOf = (section) => WK_FIELDS[section === "A" ? "A" : section === "C" ? "C" : "B"];

const wkState = { year: null, week: null, data: null, editing: null /* { id? , section } */, scope: "mine" /* mine | shared */, shared: [], unseen: 0, viewing: false /* đang xem 1 BC tuần được chia sẻ (chỉ đọc) */ };

// ---- Tuần ISO ----
function wkMonday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  return new Date(Date.UTC(year, 0, 4 - (dow - 1) + (week - 1) * 7));
}
function wkIsoWeekOf(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - y0) / 86400000 + 1) / 7) };
}
const wkDmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const wkDm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
function wkRangeText(year, week) {
  const m = wkMonday(year, week);
  const s = new Date(m);
  s.setUTCDate(m.getUTCDate() + 6);
  const f = (d) => d.toISOString().slice(0, 10);
  return `${wkDm(f(m))} – ${wkDmy(f(s))}`;
}
function wkWeeksInYear(year) {
  return wkIsoWeekOf(new Date(year, 11, 28)).week; // 28/12 luôn thuộc tuần cuối của năm ISO
}

function wkEsc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
// Văn bản nhiều dòng -> HTML, dòng bắt đầu "- "/"• " thành gạch đầu dòng.
function wkText(v) {
  if (v == null || v === "") return "";
  return String(v)
    .split("\n")
    .map((l) => {
      const m = l.match(/^\s*[-•*]\s+(.*)$/);
      return m ? `<div class="wk-li">• ${wkEsc(m[1])}</div>` : `<div>${wkEsc(l)}</div>`;
    })
    .join("");
}

// ---- Chọn tuần ----
function wkCurrentWeek() {
  return wkIsoWeekOf(new Date());
}
function wkFillPickers() {
  const yearSel = document.getElementById("wk-year");
  const weekSel = document.getElementById("wk-week");
  if (!yearSel || !weekSel) return;
  const now = wkCurrentWeek();
  const cur = new Date().getFullYear();
  yearSel.innerHTML = [cur - 2, cur - 1, cur, cur + 1].map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSel.value = String(wkState.year);
  const n = wkWeeksInYear(wkState.year);
  weekSel.innerHTML = Array.from({ length: n }, (_, i) => {
    const w = i + 1;
    const mark = now.year === wkState.year && now.week === w ? "  ● tuần này" : "";
    return `<option value="${w}">Tuần ${w} · ${wkRangeText(wkState.year, w)}${mark}</option>`;
  }).join("");
  weekSel.value = String(Math.min(wkState.week, n));
  // Dòng tóm tắt: tuần báo cáo + tuần kế hoạch + nhãn vị trí so với tuần hiện tại.
  const mon = wkMonday(wkState.year, wkState.week);
  const nxt = new Date(mon);
  nxt.setUTCDate(mon.getUTCDate() + 7);
  const nw = wkIsoWeekOf(new Date(nxt.getUTCFullYear(), nxt.getUTCMonth(), nxt.getUTCDate()));
  const diff = (wkState.year - now.year) * 53 + (wkState.week - now.week);
  const rel = wkState.year === now.year && wkState.week === now.week ? ["Tuần hiện tại", "wk-chip-now"] : wkState.year === now.year && wkState.week === now.week - 1 ? ["Tuần vừa qua", "wk-chip-prev"] : diff > 0 ? ["Tuần tương lai", "wk-chip-future"] : ["Tuần đã qua", "wk-chip-past"];
  document.getElementById("wk-range-info").innerHTML = `<span class="wk-chip ${rel[1]}">${rel[0]}</span> Báo cáo kết quả <b>tuần ${wkState.week}</b> (${wkRangeText(wkState.year, wkState.week)}) · Kế hoạch <b>tuần ${nw.week}</b> (${wkRangeText(nw.year, nw.week)})`;
}

async function loadWeekly() {
  wkRenderScopeBar();
  if (wkState.scope === "shared") return loadWkShared();
  wkSetShareMode(false);
  if (wkState.year == null) {
    // Mặc định: tuần hiện tại.
    const w = wkCurrentWeek();
    wkState.year = w.year;
    wkState.week = w.week;
  }
  wkFillPickers();
  const doc = document.getElementById("wk-doc");
  if (state.currentDepartmentId == null) {
    wkState.data = null;
    doc.innerHTML = '<p class="muted" style="padding:16px;text-align:center">Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban.</p>';
    return;
  }
  wkState.data = await api(`/api/weekly-reports?year=${wkState.year}&week=${wkState.week}${deptParam()}`);
  renderWeekly();
  wkRenderShareList(); // cập nhật số người đã chia sẻ trên nút "Chia sẻ"
}

function wkRowActions(r, first, last) {
  return `<td class="wk-actions"><div class="actions-cell">
    <button class="small btn-view write-action wk-move" data-dir="up" data-id="${r.id}" title="Lên" ${first ? "disabled" : ""}>↑</button>
    <button class="small btn-export write-action wk-move" data-dir="down" data-id="${r.id}" title="Xuống" ${last ? "disabled" : ""}>↓</button>
    <button class="small btn-edit write-action wk-edit" data-id="${r.id}">Sửa</button>
    <button class="small btn-delete wk-del" data-id="${r.id}">Xóa</button></div></td>`;
}
const wkStatusTd = (v) => `<td class="wk-center ${WK_STATUS_CLASS[v] ?? ""}">${wkEsc(v ?? "")}</td>`;
const wkAddBtn = (section, label = "+ Thêm dòng") => `<button type="button" class="small btn-view write-action wk-add" data-section="${section}">${label}</button>`;

function renderWeekly() {
  const d = wkState.data;
  const doc = document.getElementById("wk-doc");
  if (!d) return;
  const wk = d.week;
  const phong = (d.department_name ?? "").toUpperCase();
  const N = wk.week;
  const N1 = wk.next_week;
  const by = (s) => d.rows.filter((r) => r.section === s);

  // ---- A: gộp STT + Mảng công việc cho các dòng liên tiếp cùng mảng ----
  const aRows = by("A");
  let aHtml = "";
  let stt = 0;
  for (let i = 0; i < aRows.length; i++) {
    const r = aRows[i];
    const first = i === 0 || aRows[i - 1].mang_cong_viec !== r.mang_cong_viec;
    let span = 1;
    if (first) {
      stt++;
      while (i + span < aRows.length && aRows[i + span].mang_cong_viec === r.mang_cong_viec) span++;
    }
    aHtml += `<tr data-id="${r.id}">${
      first ? `<td class="wk-center" rowspan="${span}"><b>${stt}</b></td><td class="wk-mang" rowspan="${span}"><b>${wkEsc(r.mang_cong_viec)}</b></td>` : ""
    }<td>${wkText(r.muc_tieu)}</td><td>${wkText(r.noi_dung)}</td><td>${wkText(r.tien_do)}</td><td>${wkText(r.ke_hoach)}</td>${wkRowActions(r, i === 0, i === aRows.length - 1)}</tr>`;
  }
  if (!aRows.length) aHtml = '<tr><td colspan="7" class="muted wk-empty">Chưa có dòng nào.</td></tr>';

  const bcRows = (rows, withNoiDung) =>
    rows
      .map(
        (r, i) => `<tr data-id="${r.id}"><td class="wk-center">${i + 1}</td><td><b>${wkText(r.ten)}</b></td><td class="wk-center">${wkEsc(r.chu_tri)}</td><td>${wkText(r.tien_do)}</td>${
          withNoiDung ? `<td>${wkText(r.noi_dung)}</td>` : ""
        }<td>${wkText(r.kho_khan)}</td><td>${wkText(r.de_xuat)}</td><td>${wkText(r.ke_hoach)}</td>${wkStatusTd(r.trang_thai)}${wkRowActions(r, i === 0, i === rows.length - 1)}</tr>`,
      )
      .join("");
  const b1 = by("B1");
  const b2 = by("B2");
  const cRows = by("C");
  const groupRow = (label, section) =>
    `<tr class="wk-group"><td></td><td colspan="9"><div style="display:flex;justify-content:space-between;align-items:center"><b>${label}</b>${wkAddBtn(section)}</div></td></tr>`;

  doc.innerHTML = `
    <div class="wk-paper">
      <div class="wk-head">
        <div class="wk-head-col"><b>${wkEsc(d.ten_cong_ty.toUpperCase())}</b><br/><b>${wkEsc(phong)}</b></div>
        <div class="wk-head-col"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br/><b>Độc lập - Tự do - Hạnh phúc</b></div>
      </div>
      <h3 class="wk-title">BÁO CÁO GIAO BAN TUẦN ${wkEsc(phong)}</h3>
      <p class="wk-sub"><i>Tuần ${N} (từ ngày ${wkDm(wk.start)} đến ngày ${wkDmy(wk.end)}) – Kế hoạch tuần ${N1} (từ ngày ${wkDm(wk.next_start)} đến ngày ${wkDmy(wk.next_end)})</i></p>

      <div class="wk-sec-head"><h4>A. NHIỆM VỤ CỦA ${wkEsc(phong.replace(/^PHÒNG\s+/, "P."))} THEO MẢNG CÔNG VIỆC (KẾT QUẢ TUẦN ${N} VÀ KẾ HOẠCH TUẦN ${N1})</h4>${wkAddBtn("A")}</div>
      <div class="table-wrap wk-wrap"><table class="wk-table wk-a"><colgroup><col style="width:5%"><col style="width:11%"><col style="width:14%"><col style="width:19%"><col style="width:19%"><col style="width:19%"><col class="wk-col-actions" style="width:108px"></colgroup><thead><tr><th>STT</th><th>Mảng công việc</th><th>Mục tiêu</th><th>Nội dung công việc</th><th>Kết quả thực hiện tuần ${N}</th><th>Kế hoạch tuần ${N1}</th><th class="wk-actions-h">Thao tác</th></tr></thead><tbody>${aHtml}</tbody></table></div>

      <div class="wk-sec-head"><h4>B. NHIỆM VỤ ĐƯỢC GIAO VOFFICE THEO KẾT LUẬN</h4></div>
      <div class="table-wrap wk-wrap"><table class="wk-table wk-fixed wk-b" style="min-width:1900px"><colgroup><col style="width:3%"><col style="width:18%"><col style="width:6.5%"><col style="width:17%"><col style="width:9%"><col style="width:14%"><col style="width:13.5%"><col style="width:13.5%"><col style="width:5.5%"><col class="wk-col-actions" style="width:108px"></colgroup><thead><tr><th>STT</th><th>Nhiệm vụ</th><th>Chủ trì</th><th>Tiến độ thực hiện tuần ${N}</th><th>Nội dung</th><th>Khó khăn</th><th>Đề xuất</th><th>Kế hoạch tuần ${N1}</th><th>Trạng thái</th><th class="wk-actions-h">Thao tác</th></tr></thead><tbody>
        ${groupRow("I. NHIỆM VỤ PHỐI HỢP", "B1")}${bcRows(b1, true)}
        ${groupRow("II. NHIỆM VỤ TRỰC TIẾP", "B2")}${bcRows(b2, true)}
      </tbody></table></div>

      <div class="wk-sec-head"><h4>C. VĂN BẢN VOFFICE ĐƯỢC GIAO THỰC HIỆN</h4>${wkAddBtn("C")}</div>
      <div class="table-wrap wk-wrap"><table class="wk-table wk-fixed wk-c" style="min-width:1800px"><colgroup><col style="width:3%"><col style="width:24%"><col style="width:6%"><col style="width:17%"><col style="width:18%"><col style="width:13.5%"><col style="width:13.5%"><col style="width:5%"><col class="wk-col-actions" style="width:108px"></colgroup><thead><tr><th>STT</th><th>Văn bản</th><th>Chủ trì</th><th>Tiến độ thực hiện tuần ${N}</th><th>Khó khăn</th><th>Đề xuất</th><th>Kế hoạch tuần ${N1}</th><th>Trạng thái</th><th class="wk-actions-h">Thao tác</th></tr></thead><tbody>${
        cRows.length ? bcRows(cRows, false) : '<tr><td colspan="9" class="muted wk-empty">Chưa có dòng nào.</td></tr>'
      }</tbody></table></div>
      <p class="wk-note"><b>Ghi chú trạng thái:</b> <i>Hoàn thành (xanh) · Đang thực hiện (vàng) · Vướng mắc / cần gia hạn (cam) · Chưa cập nhật (xám)</i></p>
      <p class="wk-sign"><b>TRƯỞNG ${wkEsc(phong)}</b></p>
    </div>`;
}

// ---- Chọn tuần ----
document.getElementById("wk-year")?.addEventListener("change", (e) => {
  wkState.year = Number(e.target.value);
  wkState.week = Math.min(wkState.week, wkWeeksInYear(wkState.year));
  loadWeekly().catch((err) => showToast(err.message));
});
document.getElementById("wk-week")?.addEventListener("change", (e) => {
  wkState.week = Number(e.target.value);
  loadWeekly().catch((err) => showToast(err.message));
});
function wkStep(delta) {
  const m = wkMonday(wkState.year, wkState.week);
  m.setUTCDate(m.getUTCDate() + 7 * delta);
  const w = wkIsoWeekOf(new Date(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()));
  wkState.year = w.year;
  wkState.week = w.week;
  loadWeekly().catch((err) => showToast(err.message));
}
document.getElementById("wk-prev")?.addEventListener("click", () => wkStep(-1));
document.getElementById("wk-today")?.addEventListener("click", () => {
  const w = wkCurrentWeek();
  wkState.year = w.year;
  wkState.week = w.week;
  loadWeekly().catch((err) => showToast(err.message));
});
document.getElementById("wk-next")?.addEventListener("click", () => wkStep(1));

// ---- Thêm / sửa dòng ----
function openWkRowDialog(section, row) {
  wkState.editing = { section, id: row?.id ?? null };
  const names = { A: "mảng công việc", B1: "nhiệm vụ phối hợp", B2: "nhiệm vụ trực tiếp", C: "văn bản VOffice" };
  document.getElementById("wk-row-title").textContent = `${row ? "Sửa" : "Thêm"} ${names[section]}`;
  const mangs = [...new Set((wkState.data?.rows ?? []).filter((r) => r.section === "A").map((r) => r.mang_cong_viec).filter(Boolean))];
  document.getElementById("wk-row-fields").innerHTML =
    wkFieldsOf(section)
      .map((f) => {
        const id = `wk-f-${f.key}`;
        const v = row?.[f.key] ?? "";
        let input;
        if (f.type === "area") input = `<textarea id="${id}" rows="3">${wkEsc(v)}</textarea>`;
        else if (f.type === "status")
          input = `<select id="${id}"><option value="">—</option>${WK_STATUSES.map((s) => `<option value="${wkEsc(s)}"${s === v ? " selected" : ""}>${wkEsc(s)}</option>`).join("")}</select>`;
        else if (f.key === "chu_tri" && (section === "B2" || section === "C")) {
          // Nhiệm vụ trực tiếp / Văn bản VOffice: Chủ trì mặc định là phòng ban đang lập báo cáo, không sửa được.
          input = `<input type="text" id="${id}" value="${wkEsc(wkState.data?.department_name ?? "")}" readonly tabindex="-1" />`;
        } else if (f.key === "chu_tri" && section === "B1") {
          // Nhiệm vụ phối hợp: Chủ trì chọn trong danh sách phòng ban của hệ thống (giá trị cũ ngoài danh sách vẫn giữ để không mất).
          const names = (state.departments ?? []).map((d) => d.name);
          const cur = String(v ?? "");
          const opts = cur && !names.includes(cur) ? [cur, ...names] : names;
          input = `<select id="${id}"><option value="">—</option>${opts.map((n) => `<option value="${wkEsc(n)}"${n === cur ? " selected" : ""}>${wkEsc(n)}</option>`).join("")}</select>`;
        } else if (f.list) {
          // Mảng công việc: chọn từ danh sách mảng đã có (dropdown chung của hệ thống) hoặc "+ Mảng mới…" rồi gõ tên.
          // Thêm dòng mới: mặc định chọn mảng cuối cùng đang có (thường là thêm dòng cho cùng mảng); chưa có mảng nào -> nhập mảng mới.
          const cur = row ? String(v ?? "") : mangs[mangs.length - 1] ?? "";
          const known = !!cur && mangs.includes(cur);
          input = `<div class="wk-mang-pick"><select id="${id}">${mangs.map((m) => `<option value="${wkEsc(m)}"${known && m === cur ? " selected" : ""}>${wkEsc(m)}</option>`).join("")}<option value="__new__"${!known ? " selected" : ""}>+ Mảng mới…</option></select>
            <input type="text" id="${id}-new" placeholder="Nhập tên mảng công việc mới" value="${known ? "" : wkEsc(cur)}"${known ? " hidden" : ""} /></div>`;
        } else input = `<input type="text" id="${id}" value="${wkEsc(v)}" />`;
        return `<div class="field-row"><label for="${id}">${f.label}</label>${input}</div>`;
      })
      .join("") +
    '<p class="wk-hint">Mỗi dòng 1 ý; dòng bắt đầu bằng "- " sẽ hiện thành gạch đầu dòng.</p>';
  const mangSel = document.getElementById("wk-f-mang_cong_viec");
  mangSel?.addEventListener("change", () => {
    const isNew = mangSel.value === "__new__";
    const inp = document.getElementById("wk-f-mang_cong_viec-new");
    inp.hidden = !isNew;
    if (isNew) inp.focus();
  });
  document.getElementById("wk-row-dialog").showModal();
}
document.getElementById("wk-doc")?.addEventListener("click", async (e) => {
  const add = e.target.closest(".wk-add");
  if (add) return openWkRowDialog(add.dataset.section, null);
  const id = Number(e.target.closest("button[data-id]")?.dataset.id);
  if (!id) return;
  const row = (wkState.data?.rows ?? []).find((r) => r.id === id);
  if (e.target.closest(".wk-edit")) return openWkRowDialog(row.section, row);
  const mv = e.target.closest(".wk-move");
  if (mv) {
    try {
      await api(`/api/weekly-reports/rows/${id}/move`, { method: "POST", body: JSON.stringify({ direction: mv.dataset.dir }) });
      await loadWeekly();
    } catch (err) {
      showToast(err.message);
    }
    return;
  }
  if (e.target.closest(".wk-del")) {
    if (!(await confirmDialog("Xóa dòng này khỏi báo cáo tuần?", { title: "Xóa dòng", okText: "Xóa" }))) return;
    try {
      await api(`/api/weekly-reports/rows/${id}`, { method: "DELETE" });
      await loadWeekly();
      showToast("Đã xóa.", "success");
    } catch (err) {
      showToast(err.message);
    }
  }
});
document.getElementById("wk-row-cancel-btn")?.addEventListener("click", () => document.getElementById("wk-row-dialog").close());
document.getElementById("wk-row-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const { section, id } = wkState.editing;
  const body = {};
  for (const f of wkFieldsOf(section)) {
    const el = document.getElementById(`wk-f-${f.key}`);
    body[f.key] = f.list && el.value === "__new__" ? document.getElementById(`wk-f-${f.key}-new`).value.trim() : el.value.trim();
  }
  try {
    if (id) await api(`/api/weekly-reports/rows/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/weekly-reports/rows", { method: "POST", body: JSON.stringify({ ...body, section, year: wkState.year, week: wkState.week, department_id: state.currentDepartmentId }) });
    document.getElementById("wk-row-dialog").close();
    await loadWeekly();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Tiêu đề / sao chép / xuất ----
document.getElementById("wk-company-btn")?.addEventListener("click", () => {
  if (!wkState.data) return showToast("Hãy chọn 1 phòng ban cụ thể trước.");
  document.getElementById("wk-company-name").value = wkState.data.ten_cong_ty ?? "";
  document.getElementById("wk-company-dialog").showModal();
});
document.getElementById("wk-company-cancel-btn")?.addEventListener("click", () => document.getElementById("wk-company-dialog").close());
document.getElementById("wk-company-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/weekly-reports/company", {
      method: "PUT",
      body: JSON.stringify({ year: wkState.year, week: wkState.week, department_id: state.currentDepartmentId, ten_cong_ty: document.getElementById("wk-company-name").value.trim() }),
    });
    document.getElementById("wk-company-dialog").close();
    await loadWeekly();
  } catch (err) {
    showToast(err.message);
  }
});
document.getElementById("wk-copy-btn")?.addEventListener("click", async () => {
  if (state.currentDepartmentId == null) return showToast("Hãy chọn 1 phòng ban cụ thể trước.");
  try {
    const r = await api("/api/weekly-reports/copy-previous", { method: "POST", body: JSON.stringify({ year: wkState.year, week: wkState.week, department_id: state.currentDepartmentId }) });
    await loadWeekly();
    showToast(`Đã sao chép ${r.copied} dòng từ tuần trước${r.skipped ? ` (bỏ qua ${r.skipped} dòng đã hoàn thành)` : ""}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});
// Xuất PDF: dựng bản in (A4 ngang, bỏ cột thao tác/nút) trong iframe ẩn rồi mở hộp thoại in — chọn "Lưu dưới dạng PDF".
const WK_PRINT_CSS = `
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; margin: 0; }
.wk-head { display: flex; justify-content: space-between; text-align: center; margin-bottom: 22px; line-height: 1.6; }
.wk-head-col { flex: 1; }
.wk-title { text-align: center; color: #c00032; margin: 22px 0 8px; font-size: 16pt; line-height: 1.4; }
.wk-sub { text-align: center; margin: 0 0 22px; line-height: 1.5; }
.wk-sec-head { margin: 16px 0 6px; }
.wk-sec-head h4 { margin: 0; color: #000; font-size: 12.5pt; }
.wk-table { width: 100%; border-collapse: collapse; table-layout: auto; }
.wk-table.wk-a, .wk-table.wk-fixed { table-layout: fixed; }
.wk-table th { background: #ee0033; color: #fff; text-align: center; border: 1px solid #7f7f7f; padding: 3px 5px; }
.wk-table td { border: 1px solid #7f7f7f; vertical-align: middle; padding: 3px 5px; }
.wk-table tr { page-break-inside: avoid; }
.wk-table td.wk-center { text-align: center; vertical-align: middle; }
.wk-table td.wk-mang { background: #f2f2f2; vertical-align: middle; }
.wk-table tr.wk-group td { background: #f2dcdb; color: #7b1f2a; }
.wk-li { padding-left: 10px; text-indent: -10px; }
.wk-st-done { background: #c6e0b4; font-weight: 700; }
.wk-st-doing { background: #ebefa9; font-weight: 700; }
.wk-st-stuck { background: #f8cbad; }
.wk-st-none { background: #e7e6e6; }
.wk-note { margin: 12px 0 0; }
.wk-sign { text-align: right; margin: 22px 0 0; }
`;
// Bỏ cột thao tác + nút thêm/sửa/xóa (dùng cho bản in PDF và khi xem BC tuần được chia sẻ — chỉ đọc); chỉnh lại colspan cho khớp.
function wkStripEditUi(root) {
  if (root.dataset.wkStripped) return; // đã bỏ rồi (vd. đang xem bản chia sẻ chỉ đọc rồi bấm Xuất PDF)
  root.dataset.wkStripped = "1";
  root.querySelectorAll(".wk-actions, .wk-actions-h, .wk-add, .wk-sec-head button, .wk-col-actions").forEach((n) => n.remove());
  root.querySelectorAll("tr.wk-group td[colspan]").forEach((td) => (td.colSpan = 8));
  root.querySelectorAll("td.wk-empty").forEach((td) => (td.colSpan = Math.max(1, td.colSpan - 1)));
  root.querySelectorAll("tr.wk-group td div").forEach((d) => (d.style.display = "block"));
}

function wkPrintHtml() {
  const paper = document.querySelector("#wk-doc .wk-paper")?.cloneNode(true);
  if (!paper) return null;
  wkStripEditUi(paper);
  // Bản in: bảng B/C đang đặt độ rộng theo px (có thể rộng hơn trang) -> quy về % theo đúng tỉ lệ các cột còn lại, vừa khổ A4.
  paper.querySelectorAll("table.wk-fixed").forEach((t) => {
    const cols = [...t.querySelectorAll("colgroup col")];
    const total = cols.reduce((s, c) => s + parseFloat(c.style.width), 0);
    let pct = cols.map((c) => (parseFloat(c.style.width) / total) * 100);
    // Cột hẹp (Chủ trì, Trạng thái) tối thiểu 8,5% để chữ không bị xuống dòng từng chữ trên khổ giấy; các cột còn lại co lại tương ứng.
    const minOf = (i) => (i === 0 ? 4.5 : MIN); // cột STT tối thiểu 4,5%
    const MIN = 8.5;
    const fixedIdx = pct.map((p, i) => (p < minOf(i) ? i : -1)).filter((i) => i >= 0);
    if (fixedIdx.length) {
      const extra = fixedIdx.reduce((s, i) => s + (minOf(i) - pct[i]), 0);
      const flexTotal = pct.reduce((s, p, i) => (fixedIdx.includes(i) ? s : s + p), 0);
      pct = pct.map((p, i) => (fixedIdx.includes(i) ? minOf(i) : p * (1 - extra / flexTotal)));
    }
    cols.forEach((c, i) => (c.style.width = `${pct[i].toFixed(2)}%`));
    t.style.width = "100%";
    t.style.minWidth = "0"; // bỏ min-width của màn hình (bảng B/C rộng hơn khổ giấy sẽ bị cắt cột)
  });
  const title = `BC tuan ${wkState.data.week.week}-${wkState.data.week.year}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title><style>${WK_PRINT_CSS}</style></head><body>${paper.outerHTML}</body></html>`;
}
function wkExportPdf() {
  if (!wkState.data) return showToast("Hãy chọn 1 phòng ban cụ thể trước.");
  const html = wkPrintHtml();
  if (!html) return showToast("Chưa có nội dung để xuất.");
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = html;
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    }, 200);
  };
  document.body.appendChild(frame);
}
document.getElementById("wk-export-btn")?.addEventListener("click", wkExportPdf);

// ---- Chia sẻ BC tuần (giống Báo cáo PowerPoint): chia sẻ cho từng người / cả phòng; người nhận chỉ xem + xuất PDF ----
const wkQ = () => (state.currentDepartmentId != null ? `?department_id=${state.currentDepartmentId}` : "");
const wkDt = (v) => {
  const d = new Date(String(v).replace(" ", "T") + (String(v).includes("T") || String(v).includes("Z") ? "" : "Z"));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function wkRenderScopeBar() {
  const bar = document.getElementById("wk-scope-bar");
  if (!bar) return;
  const btn = (scope, label, n) =>
    `<button type="button" class="gnv-seg-btn${wkState.scope === scope ? " active" : ""}" data-scope="${scope}">${label}${n ? ` <span class="pptx-pill pink-pill">${n}</span>` : ""}</button>`;
  bar.innerHTML = `<div class="gnv-seg pptx-scope-bar">${btn("mine", "BC tuần của phòng tôi", 0)}${btn("shared", "Được chia sẻ với tôi", wkState.unseen)}</div>`;
  bar.querySelectorAll("[data-scope]").forEach((b) =>
    b.addEventListener("click", () => {
      if (wkState.scope === b.dataset.scope && !wkState.viewing) return;
      wkState.scope = b.dataset.scope;
      wkState.viewing = false;
      loadWeekly().catch((err) => showToast(err.message));
    }),
  );
}

// Chế độ hiển thị: shared-list = danh sách được chia sẻ; shared-view = đang xem 1 báo cáo chỉ đọc; mine = của phòng tôi.
function wkSetShareMode(mode /* false | "list" | "view" */) {
  const mine = mode === false;
  document.getElementById("wk-picker-card").hidden = !mine;
  document.getElementById("wk-shared-list").hidden = mode !== "list";
  document.getElementById("wk-doc-card").hidden = mode === "list";
  for (const id of ["wk-share-btn", "wk-copy-btn", "wk-company-btn"]) {
    const b = document.getElementById(id);
    if (b) b.hidden = !mine;
  }
  document.getElementById("wk-shared-banner").hidden = mode !== "view";
}

async function refreshWkBadge() {
  try {
    const s = await api(`/api/weekly-reports/shared-unseen-count${wkQ()}`);
    wkState.unseen = s?.count ?? 0;
    window.__wkUnseen = wkState.unseen;
    const badge = document.getElementById("wk-tab-badge");
    if (badge) {
      badge.hidden = !(wkState.unseen > 0);
      badge.textContent = String(wkState.unseen);
    }
    if (typeof updateSpNavBadge === "function") updateSpNavBadge(window.__spBase ?? 0);
    wkRenderScopeBar();
  } catch {
    // lỗi mạng tạm thời: giữ nguyên chấm cũ
  }
}

async function loadWkShared() {
  wkSetShareMode("list");
  wkState.viewing = false;
  const box = document.getElementById("wk-shared-list");
  wkState.shared = (await api(`/api/weekly-reports/shared-with-me${wkQ()}`)) ?? [];
  wkState.unseen = wkState.shared.filter((r) => r.is_new || r.update_count > 0).length;
  window.__wkUnseen = wkState.unseen;
  wkRenderScopeBar();
  const list = wkState.shared;
  box.innerHTML = `<h2 style="margin:0 0 12px">BC tuần được chia sẻ với tôi</h2>${
    list.length
      ? list
          .map(
            (r) => `<button type="button" class="pptx-shared-item" data-id="${r.report_id}">
        <span class="pptx-shared-title"><b>Tuần ${r.week}/${r.year}</b> (${wkRangeText(r.year, r.week)}) · ${wkEsc(r.department_name ?? "")} ${r.is_new ? '<span class="pptx-pill warn">Mới</span>' : r.update_count ? '<span class="pptx-pill pink-pill">● có cập nhật mới</span>' : ""}</span>
        <span class="muted">Chia sẻ bởi ${wkEsc(r.shared_by ?? "—")} · ${wkDt(r.shared_at)}</span></button>`,
          )
          .join("")
      : '<p class="muted" style="padding:12px 0">Chưa có BC tuần nào được chia sẻ cho bạn.</p>'
  }`;
  box.querySelectorAll(".pptx-shared-item").forEach((b) => b.addEventListener("click", () => wkOpenShared(Number(b.dataset.id)).catch((err) => showToast(err.message))));
  if (typeof updateSpNavBadge === "function") updateSpNavBadge(window.__spBase ?? 0);
  const badge = document.getElementById("wk-tab-badge");
  if (badge) {
    badge.hidden = !(wkState.unseen > 0);
    badge.textContent = String(wkState.unseen);
  }
}

async function wkOpenShared(id) {
  const data = await api(`/api/weekly-reports/shared/${id}${wkQ()}`);
  wkState.data = data;
  wkState.viewing = true;
  wkSetShareMode("view");
  renderWeekly();
  wkStripEditUi(document.querySelector("#wk-doc .wk-paper"));
  document.getElementById("wk-shared-banner").innerHTML = `<div class="pptx-alert info pptx-shared-banner"><span>BC tuần ${data.week.week}/${data.week.year} của <b>${wkEsc(data.department_name ?? "phòng ban khác")}</b>, được chia sẻ cho bạn: bạn xem và xuất PDF; không sửa được nội dung.</span><button type="button" class="small btn-edit" id="wk-back-shared">← Danh sách chia sẻ</button></div>`;
  document.getElementById("wk-back-shared").addEventListener("click", () => loadWkShared().catch((err) => showToast(err.message)));
  refreshWkBadge();
}

// ---- Hộp thoại Chia sẻ ----
async function wkOpenShareDialog() {
  if (state.currentDepartmentId == null) return showToast("Hãy chọn 1 phòng ban cụ thể trước.");
  document.getElementById("wk-share-title").textContent = `Chia sẻ BC tuần ${wkState.week}/${wkState.year}`;
  document.getElementById("wk-share-search").value = "";
  document.getElementById("wk-share-results").innerHTML = '<span class="muted">Gõ tên hoặc tài khoản để tìm người cần chia sẻ.</span>';
  const depts = (state.departments ?? []).filter((d) => d.id !== state.currentDepartmentId);
  document.getElementById("wk-share-dept").innerHTML = '<option value="">— Chọn phòng ban —</option>' + depts.map((d) => `<option value="${d.id}">${wkEsc(d.name)}</option>`).join("");
  document.getElementById("wk-share-dialog").showModal();
  await wkRenderShareList();
}
async function wkRenderShareList() {
  try {
    const shares = await api(`/api/weekly-reports/shares?year=${wkState.year}&week=${wkState.week}${deptParam()}`);
    const btn = document.getElementById("wk-share-btn");
    if (btn) btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="icons.svg#i-users"/></svg>Chia sẻ${shares.length ? ` (${shares.length})` : ""}`;
    document.getElementById("wk-share-count").textContent = shares.length ? `(${shares.length})` : "";
    document.getElementById("wk-share-list").innerHTML = shares.length
      ? shares
          .map((s) => {
            const isDept = s.type === "department";
            const name = isDept ? s.department_name ?? "" : s.user_name ?? "";
            return `<div class="pptx-share-row">
              <span class="pptx-share-avatar${isDept ? " is-dept" : ""}">${isDept ? '<svg class="icon" aria-hidden="true"><use href="icons.svg#i-users"/></svg>' : wkEsc((name.trim()[0] ?? "?").toUpperCase())}</span>
              <span class="pptx-share-info"><b>${wkEsc(name)}</b><span class="pptx-pill ${isDept ? "info" : "muted-pill"}">${isDept ? "Cả phòng" : "Cá nhân"}</span><br/>
                <span class="muted">${s.user_department ? wkEsc(s.user_department) + " · " : ""}${s.shared_by ? "Chia sẻ bởi " + wkEsc(s.shared_by) + " · " : ""}${wkDt(s.created_at)}</span></span>
              <button type="button" class="small btn-revoke write-action" data-share-del="${s.id}">Thu hồi</button></div>`;
          })
          .join("")
      : '<p class="muted" style="margin:4px 0">Chưa chia sẻ cho ai.</p>';
  } catch (e) {
    showToast(e.message);
  }
}
document.getElementById("wk-share-btn")?.addEventListener("click", wkOpenShareDialog);
let wkShareTimer = null;
document.getElementById("wk-share-search")?.addEventListener("input", (e) => {
  clearTimeout(wkShareTimer);
  wkShareTimer = setTimeout(async () => {
    try {
      const users = await api(`/api/report-share-users?q=${encodeURIComponent(e.target.value.trim())}`);
      document.getElementById("wk-share-results").innerHTML = users.length
        ? users.map((u) => `<button type="button" class="pptx-share-user" data-uid="${u.id}"><span class="pptx-share-avatar">${wkEsc(((u.name || u.username || "?").trim()[0] ?? "?").toUpperCase())}</span><span class="pptx-share-info"><b>${wkEsc(u.name || u.username)}</b><br/><span class="muted">${wkEsc(u.department_name ?? "Chưa gán phòng ban")}</span></span><span class="pptx-share-add">+ Chia sẻ</span></button>`).join("")
        : '<span class="muted">Không tìm thấy người phù hợp.</span>';
    } catch (err) {
      showToast(err.message);
    }
  }, 300);
});
document.getElementById("wk-share-dialog")?.addEventListener("click", async (e) => {
  const add = e.target.closest("[data-uid]");
  const del = e.target.closest("[data-share-del]");
  const base = { year: wkState.year, week: wkState.week, department_id: state.currentDepartmentId };
  try {
    if (add) {
      await api("/api/weekly-reports/shares", { method: "POST", body: JSON.stringify({ ...base, user_id: Number(add.dataset.uid) }) });
      showToast("Đã chia sẻ.", "success");
      await wkRenderShareList();
    } else if (del) {
      if (!(await confirmDialog("Thu hồi chia sẻ? Người này sẽ không xem được báo cáo nữa.", { title: "Thu hồi chia sẻ", okText: "Thu hồi" }))) return;
      await api(`/api/weekly-reports/shares/${del.dataset.shareDel}`, { method: "DELETE" });
      await wkRenderShareList();
    } else if (e.target.id === "wk-share-dept-btn") {
      const did = Number(document.getElementById("wk-share-dept").value);
      if (!did) return showToast("Hãy chọn phòng ban.");
      await api("/api/weekly-reports/shares", { method: "POST", body: JSON.stringify({ ...base, target_department_id: did }) });
      showToast("Đã chia sẻ cho cả phòng.", "success");
      await wkRenderShareList();
    }
  } catch (err) {
    showToast(err.message);
  }
});
