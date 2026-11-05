// ---- Kế hoạch tổng hợp > tab "Báo cáo PowerPoint" ----
// 2 màn hình: "Báo cáo" (chọn kỳ, nhập nội dung từng đầu mục, xem trước, xuất .pptx) và
// "Mẫu PowerPoint" (tải/thay file mẫu theo loại kỳ, cấu hình đầu mục). Dữ liệu theo PHÒNG BAN
// đang xem (bộ chuyển đổi phòng ban chung) — server lọc theo phạm vi người dùng.

const PPTX_TYPES = [
  { key: "month", label: "Tháng", full: "Báo cáo tháng" },
  { key: "quarter", label: "Quý", full: "Báo cáo quý" },
  { key: "half", label: "6 tháng", full: "Báo cáo 6 tháng" },
  { key: "year", label: "Năm", full: "Báo cáo năm" },
];
const PPTX_SOURCES = {
  manual: "Nhập tay",
  sum: "Cộng dồn chỉ tiêu",
  suggest: "Gợi ý từ kỳ con",
  last: "Lấy từ kỳ con cuối cùng",
  prior_year: "So sánh cùng kỳ năm trước",
  auto: "Tự động",
};
const PPTX_KINDS = { auto: "Tự điền kỳ", table: "Bảng chỉ tiêu", list: "Danh sách", paragraph: "Đoạn văn", image: "Hình ảnh" };
const PPTX_SOURCES_BY_KIND = {
  auto: ["auto"],
  table: ["manual", "sum", "last", "prior_year"],
  list: ["manual", "suggest", "last"],
  paragraph: ["manual", "last"],
  image: ["manual"],
};
const PPTX_MAX_LINES = 8; // số dòng vừa 1 slide (cảnh báo khi vượt)
const ROMAN = ["", "I", "II", "III", "IV"];

const pptx = {
  view: "report",
  type: "month",
  year: new Date().getFullYear(),
  overview: { reports: [], templates: [] },
  selectedIdx: null,
  report: null, // báo cáo đang mở
  activeCode: null,
  editing: null, // { code, id|null } — dòng danh sách đang sửa/thêm
  deleting: null, // { code, id } — đang hỏi xác nhận xoá
  savedAt: null,
  dirty: new Set(),
  saveTimers: {},
  tplList: [],
  tplType: "quarter",
  tpl: null,
  pendingUpload: null,
  search: "", // từ khoá tìm trong báo cáo đang mở
  slideFilter: "all", // "all" hoặc số slide đang hiển thị (nhập theo từng trang slide)
  collapsed: new Set(), // mã các đầu mục đang thu gọn
  onlyOpenComments: false, // chỉ hiện đầu mục có góp ý chưa xử lý
  scope: "mine", // "mine" = báo cáo của phòng tôi | "shared" = báo cáo được chia sẻ cho tôi
  sharedList: [],
  unseenShared: 0,
};

const px = (id) => document.getElementById(id);
const pxEsc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pxDept = () => (state.currentDepartmentId != null ? `department_id=${state.currentDepartmentId}` : "");
const pxLabel = (type, year, idx) =>
  type === "month" ? `Tháng ${idx}/${year}` : type === "quarter" ? `Quý ${ROMAN[idx]}/${year}` : type === "half" ? (idx === 1 ? `6 tháng đầu năm ${year}` : `6 tháng cuối năm ${year}`) : `Năm ${year}`;
// Đánh dấu **chữ đậm** -> <b> (khớp cách xuất ra PowerPoint).
const pxRich = (v) => pxEsc(v).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br/>");
// "2026-11-03 07:58:07" -> "03/11/2026 07:58"
const pxDateTime = (v) => { const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : pxEsc(v); };
const pxNum = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const pxRatio = (r) => (r.ke_hoach && r.thuc_hien != null ? (r.thuc_hien / r.ke_hoach) * 100 : null);
const pxNeedDept = () => state.currentDepartmentId == null;
const pxTitle = (rep) =>
  rep.period_type === "month" || rep.period_type === "quarter"
    ? `${PPTX_TYPES.find((x) => x.key === rep.period_type).full} ${rep.label.replace(/^(Tháng|Quý)\s/, "")}`
    : `Báo cáo ${rep.label.charAt(0).toLowerCase()}${rep.label.slice(1)}`;

// ---------------------------------------------------------------- tải dữ liệu
async function loadPptx() {
  refreshSpNavBadge();
  if (pptx.view === "report" && pptx.scope === "shared") return loadPptxShared();
  if (pxNeedDept()) {
    px("pptx-report-root").innerHTML = '<p class="muted" style="padding:16px">Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban để dùng Báo cáo PowerPoint.</p>';
    px("pptx-template-root").innerHTML = px("pptx-report-root").innerHTML;
    return;
  }
  if (pptx.view === "template") return loadPptxTemplates();
  await loadPptxOverview();
}

async function loadPptxOverview() {
  pptx.overview = (await api(`/api/reports/overview?year=${pptx.year}&${pxDept()}`)) ?? { reports: [], templates: [] };
  const cur = pptx.overview.reports.find((r) => r.period_type === pptx.type && r.idx === pptx.selectedIdx);
  if (cur) await openPptxReport(cur.id, false);
  else {
    pptx.report = null;
    renderPptxReportView();
  }
}

async function openPptxReport(id, rerenderPicker = true) {
  pptx.report = await api(`/api/reports/${id}`);
  refreshSpNavBadge();
  pptx.activeCode = pptx.report.fields[0]?.code ?? null;
  // Báo cáo nhiều đầu mục: mặc định chỉ hiện 1 slide (nhập theo từng trang); ít đầu mục thì hiện tất cả.
  const slides = pxSlideNumbers(pptx.report);
  pptx.slideFilter = pptx.report.fields.length > 6 && slides.length > 1 ? slides[0] : "all";
  pptx.collapsed = new Set();
  pptx.editing = null;
  pptx.deleting = null;
  pptx.savedAt = null;
  renderPptxReportView();
}

// ---------------------------------------------------------------- màn hình Báo cáo
function pptxReportOf(type, idx) {
  return pptx.overview.reports.find((r) => r.period_type === type && r.idx === idx);
}

// ---- Báo cáo được chia sẻ cho tôi (kể cả phòng ban khác): xem + góp ý + xuất PowerPoint, không sửa nội dung ----
function renderPptxScopeBar() {
  const btn = (key, label, badge) => `<button type="button" class="gnv-seg-btn${pptx.scope === key ? " active" : ""}" data-scope="${key}">${label}${badge ? `<em class="pptx-slide-cm pptx-seg-cm">${badge}</em>` : ""}</button>`;
  return `<div class="gnv-seg pptx-scope-bar" id="pptx-scope-bar">${btn("mine", "Báo cáo của phòng tôi", 0)}${btn("shared", "Được chia sẻ với tôi", pptx.unseenShared)}</div>`;
}
function bindPptxScopeBar() {
  px("pptx-scope-bar")?.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-scope]");
    if (!b || b.dataset.scope === pptx.scope) return;
    pptx.scope = b.dataset.scope;
    pptx.report = null;
    await loadPptx().catch((err) => showToast(err.message));
  });
}
async function loadPptxShared() {
  pptx.sharedList = (await api("/api/reports/shared-with-me")) ?? [];
  pptx.unseenShared = pptx.sharedList.filter((r) => r.is_new).length;
  if (pptx.report && pptx.report.access === "shared") return renderPptxReportView();
  pptx.report = null;
  renderPptxReportView();
}
function renderPptxSharedList() {
  const list = pptx.sharedList;
  return `<div class="pptx-card">
    <b style="font-size:1.05rem">Báo cáo được chia sẻ với tôi</b>
    <p class="muted" style="margin:4px 0 12px">Bạn xem được nội dung, góp ý và xuất PowerPoint; không sửa được nội dung báo cáo.</p>
    ${
      list.length
        ? list.map((r) => `<button type="button" class="pptx-shared-item" data-id="${r.report_id}">
            <span class="pptx-shared-title"><b>${pxEsc(r.label)}</b> · ${pxEsc(r.department_name ?? "")} ${r.is_new ? '<span class="pptx-pill warn">Mới</span>' : ""}</span>
            <span class="muted">Chia sẻ bởi ${pxEsc(r.shared_by ?? "—")} · ${pxDateTime(r.shared_at)}${r.open_comments ? ` · ${r.open_comments} góp ý chưa xử lý` : ""}</span></button>`).join("")
        : '<p class="muted">Chưa có báo cáo nào được chia sẻ với bạn.</p>'
    }</div>`;
}

function renderPptxReportView() {
  const root = px("pptx-report-root");
  const sharedMode = pptx.scope === "shared";
  root.classList.toggle("pptx-shared", pptx.report?.access === "shared");
  if (sharedMode) {
    root.innerHTML = `${renderPptxScopeBar()}${
      pptx.report
        ? `<div class="pptx-alert info" style="margin-bottom:12px">Báo cáo của <b>${pxEsc(pptx.report.department_name ?? "phòng ban khác")}</b>, được chia sẻ cho bạn: bạn xem, góp ý và xuất PowerPoint; không sửa được nội dung. <button type="button" class="small btn-view" id="pptx-back-shared">← Danh sách chia sẻ</button></div>${renderPptxReport()}`
        : renderPptxSharedList()
    }`;
    bindPptxScopeBar();
    root.querySelectorAll(".pptx-shared-item").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          pptx.report = await api(`/api/reports/${b.dataset.id}`);
          pptx.activeCode = pptx.report.fields[0]?.code ?? null;
          pptx.slideFilter = "all";
          pptx.collapsed = new Set();
          pptx.editing = null;
          pptx.deleting = null;
          await loadPptxShared();
          refreshSpNavBadge();
        } catch (e) {
          showToast(e.message);
        }
      }),
    );
    if (pptx.report) {
      px("pptx-back-shared")?.addEventListener("click", () => {
        pptx.report = null;
        loadPptxShared().catch((e) => showToast(e.message));
      });
      bindPptxReport();
    }
    return;
  }
  const hasTemplate = pptx.overview.templates.includes(pptx.type);
  root.innerHTML = `
    ${renderPptxScopeBar()}
    <div class="pptx-card" id="pptx-picker">${renderPptxPicker()}</div>
    ${
      pptx.report
        ? renderPptxReport()
        : `<div class="pptx-card pptx-empty">${
            pptx.selectedIdx == null
              ? "Chọn một kỳ ở trên để mở hoặc tạo báo cáo."
              : hasTemplate
                ? `<p>Chưa có báo cáo ${pxEsc(pxLabel(pptx.type, pptx.year, pptx.selectedIdx))}.</p><button class="primary" id="pptx-create-btn">+ Tạo báo cáo ${pxEsc(pxLabel(pptx.type, pptx.year, pptx.selectedIdx))}</button>`
                : `<p>Chưa có file mẫu cho loại kỳ này. Hãy tải mẫu lên ở tab <b>Mẫu PowerPoint</b>.</p><button class="btn-view" id="pptx-goto-template">Đến Mẫu PowerPoint</button>`
          }</div>`
    }`;
  bindPptxScopeBar();
  bindPptxReport();
}

// Chấm đỏ trên mũi tên năm: có góp ý chưa xử lý ở năm trước (dir=-1) / năm sau (dir=1).
function pxYearDot(dir) {
  const by = pptx.overview.open_by_year ?? {};
  const has = Object.entries(by).some(([y, n]) => n > 0 && (dir < 0 ? Number(y) < pptx.year : Number(y) > pptx.year));
  return has ? '<i class="pptx-year-dot" title="Có góp ý chưa xử lý ở năm khác"></i>' : "";
}

function renderPptxPicker() {
  const t = pptx.type;
  const count = { exported: 0, draft: 0 };
  pptx.overview.reports.filter((r) => r.period_type === t).forEach((r) => count[r.status === "exported" ? "exported" : "draft"]++);
  const total = { month: 12, quarter: 4, half: 2, year: 1 }[t];
  const chip = (idx, text) => {
    const r = pptxReportOf(t, idx);
    const st = r ? (r.status === "exported" ? "exported" : "draft") : "none";
    const cm = r?.open_comments ?? 0;
    return `<button type="button" class="pptx-chip is-${st}${pptx.selectedIdx === idx ? " is-selected" : ""}" data-idx="${idx}">${text}<i class="pptx-dot"></i>${cm ? `<em class="pptx-slide-cm pptx-chip-cm" title="Góp ý chưa xử lý">${cm}</em>` : ""}</button>`;
  };
  let grid = "";
  if (t === "month") {
    grid = [1, 2, 3, 4]
      .map((q) => {
        const qr = pptxReportOf("quarter", q);
        const note = qr ? (qr.status === "exported" ? "Báo cáo quý ✓" : "Quý đang nháp") : "Chưa tạo quý";
        return `<div class="pptx-qbox"><div class="pptx-qhead"><span>QUÝ ${ROMAN[q]}</span><span class="muted">${note}</span></div>
          <div class="pptx-chips">${[0, 1, 2].map((k) => chip((q - 1) * 3 + 1 + k, `T${(q - 1) * 3 + 1 + k}`)).join("")}</div></div>`;
      })
      .join("");
  } else {
    const n = total;
    grid = `<div class="pptx-chips pptx-chips-wide">${Array.from({ length: n }, (_, i) =>
      chip(i + 1, t === "quarter" ? `Quý ${ROMAN[i + 1]}` : t === "half" ? (i === 0 ? "6 tháng đầu năm" : "6 tháng cuối năm") : `Năm ${pptx.year}`),
    ).join("")}</div>`;
  }
  // Nút tạo: kỳ đang chọn nếu chưa có báo cáo; nếu đã có thì kỳ TRỐNG KẾ TIẾP sau kỳ đang chọn
  // (chưa chọn gì thì sau kỳ mới nhất đã tạo); không còn kỳ trống phía sau thì lấy kỳ trống đầu tiên.
  const free = Array.from({ length: total }, (_, i) => i + 1).filter((i) => !pptxReportOf(t, i));
  const existing = pptx.overview.reports.filter((r) => r.period_type === t).map((r) => r.idx);
  const base = pptx.selectedIdx ?? (existing.length ? Math.max(...existing) : 0);
  const next = pptx.selectedIdx && !pptxReportOf(t, pptx.selectedIdx) ? pptx.selectedIdx : (free.find((i) => i > base) ?? free[0] ?? null);
  return `
    <div class="pptx-picker-head">
      <b style="font-size:1.05rem">Kỳ báo cáo</b>
      <div class="gnv-seg" id="pptx-type-seg">${PPTX_TYPES.map((x) => {
        const cm = pptx.overview.reports.filter((r) => r.period_type === x.key).reduce((n, r) => n + (r.open_comments ?? 0), 0);
        return `<button type="button" class="gnv-seg-btn${x.key === t ? " active" : ""}" data-type="${x.key}">${x.label}${cm ? `<em class="pptx-slide-cm pptx-seg-cm" title="Góp ý chưa xử lý">${cm}</em>` : ""}</button>`;
      }).join("")}</div>
      <div class="pptx-year"><button type="button" class="small" id="pptx-year-prev">‹${pxYearDot(-1)}</button><b>${pptx.year}</b><button type="button" class="small" id="pptx-year-next">›${pxYearDot(1)}</button></div>
      <button class="primary write-action" id="pptx-create-top" ${next == null || pptxReportOf(t, next) ? "disabled" : ""} data-idx="${next ?? ""}">+ Tạo báo cáo ${next ? pxEsc((() => { const l = pxLabel(t, pptx.year, next); return l.charAt(0).toLowerCase() + l.slice(1); })()) : ""}</button>
    </div>
    <div class="pptx-grid pptx-grid-${t}">${grid}</div>
    <div class="pptx-legend"><span><i class="pptx-dot d-exported"></i>Đã xuất</span><span><i class="pptx-dot d-draft"></i>Nháp</span><span><i class="pptx-dot d-none"></i>Chưa tạo</span>
      <b style="margin-left:auto">${count.exported} đã xuất · ${count.draft} nháp · ${total - count.exported - count.draft} cần tạo</b></div>`;
}

function pptxProgress(rep) {
  const countable = rep.fields.filter((f) => f.kind !== "auto");
  const done = countable.filter((f) => f.filled).length;
  return { done, total: countable.length };
}

function renderPptxReport() {
  const rep = pptx.report;
  const { done, total } = pptxProgress(rep);
  const missing = rep.fields.filter((f) => f.required && f.kind !== "auto" && !f.filled);
  const statusPill = rep.status === "exported" ? '<span class="pptx-pill ok">● Đã xuất</span>' : '<span class="pptx-pill warn">● Nháp</span>';
  const prevBtn = rep.has_prev ? `<button class="btn-edit write-action" id="pptx-copy-prev">Sao chép từ ${pxEsc(rep.prev_label)}</button>` : "";
  const aggSources = rep.period_type !== "month";
  return `
    <div class="pptx-layout">
      <div class="pptx-main">
        <div class="pptx-card">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <h2 style="margin:0;display:flex;gap:10px;align-items:center">${pxEsc(pxTitle(rep))} <span id="pptx-status">${statusPill}</span></h2>
              <div class="muted" style="margin-top:4px">Mẫu: <b>${pxEsc(rep.file_name ?? "—")}</b> · ${rep.slide_count} slide · ${total} đầu mục · <span id="pptx-saved">${pptx.savedAt ? `Đã lưu lúc ${pptx.savedAt}` : "Tự động lưu nháp"}</span></div>
            </div>
            <div class="row" style="gap:8px">
              ${prevBtn}
              <button class="btn-view" id="pptx-share-btn">👥 Chia sẻ${rep.share_count ? ` (${rep.share_count})` : ""}</button>
              <button class="btn-view" id="pptx-versions-btn">Phiên bản</button>
              <button class="primary" id="pptx-export-btn"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-download"/></svg>Xuất PowerPoint</button>
              <button class="btn-delete write-action" id="pptx-delete-report" title="Xoá báo cáo">Xóa</button>
            </div>
          </div>
          <div class="pptx-progress"><div class="pptx-bar"><i id="pptx-bar-fill" style="width:${total ? (done / total) * 100 : 0}%"></i></div><b id="pptx-progress-text">${done}/${total} đầu mục đã nhập</b></div>
          <div class="pptx-search"><input type="search" id="pptx-search" placeholder="Tìm trong báo cáo: tên đầu mục, mã {{...}} hoặc nội dung…" value="${pxEsc(pptx.search)}" /><span class="muted" id="pptx-search-count"></span></div>
          <div id="pptx-warnings">${renderPptxWarnings(rep, missing, aggSources)}</div>
        </div>
        <div class="pptx-card pptx-slidebar" id="pptx-slidebar">${renderPptxSlideBar(rep)}</div>
        ${rep.fields.map((f, i) => `<div class="pptx-card pptx-section${pptx.collapsed.has(f.code) ? " is-collapsed" : ""}${f.kind === "auto" ? " is-auto" : f.filled ? " is-filled" : ""}" id="pptx-sec-${f.code}" data-code="${f.code}">${renderPptxSectionInner(f, i)}</div>`).join("")}
      </div>
      <aside class="pptx-side"><div id="pptx-preview">${renderPptxPreview()}</div></aside>
    </div>`;
}

function renderPptxWarnings(rep, missing, aggSources) {
  const out = [];
  if (rep.changed_children.length) {
    out.push(`<div class="pptx-alert warn">Dữ liệu ${rep.changed_children.map((c) => pxEsc(c.label)).join(", ")} đã thay đổi sau lần tổng hợp. <button class="small btn-view write-action" id="pptx-refresh">Cập nhật lại</button></div>`);
  }
  if (aggSources && rep.missing_children.length) {
    out.push(`<div class="pptx-alert info">Chưa có báo cáo: ${rep.missing_children.map((c) => pxEsc(c.label)).join(", ")} — số liệu tổng hợp chưa đủ.</div>`);
  }
  if (missing.length) {
    out.push(`<div class="pptx-alert warn">Các đầu mục gắn mã bắt buộc nhưng chưa có nội dung. Bạn vẫn xuất được, ô đó sẽ để trống.</div>`);
  }
  return out.join("");
}

function pptxFieldPill(f) {
  if (f.kind === "auto") return '<span class="pptx-pill muted-pill">● Tự động</span>';
  if (pptx.editing?.code === f.code) return '<span class="pptx-pill info">● Đang sửa</span>';
  return f.filled ? '<span class="pptx-pill ok">● Đã nhập</span>' : '<span class="pptx-pill warn">● Chưa nhập</span>';
}

// Số slide có đầu mục (tăng dần); đầu mục chưa rõ slide gom vào 0.
function pxSlideNumbers(rep) {
  return [...new Set(rep.fields.map((f) => f.slide_no ?? 0))].sort((a, b) => a - b);
}
function pxSummary(f) {
  const c = f.content ?? {};
  if (f.kind === "table") return `${(c.rows ?? []).filter((r) => r.ten).length} chỉ tiêu`;
  if (f.kind === "list") return `${(c.items ?? []).filter((i) => i.text && i.selected !== false).length} dòng`;
  if (f.kind === "image") return c.has_image ? (c.file_name || "đã có ảnh") : "chưa có ảnh";
  if (f.kind === "paragraph") { const t = (c.text ?? "").trim().replace(/\s+/g, " "); return t ? (t.length > 60 ? t.slice(0, 60) + "…" : t) : "chưa nhập"; }
  return "tự động";
}
// ---- Góp ý theo đầu mục ----
const pxCommentsOf = (code) => (pptx.report?.comments ?? []).filter((c) => c.field_code === code);
const pxOpenOf = (list) => list.filter((c) => c.status === "open").length;
function renderPptxComments(f) {
  const list = pxCommentsOf(f.code);
  const open = pxOpenOf(list);
  return `<div class="pptx-cm${open ? " has-open" : ""}">
    <div class="pptx-cm-head">💬 Góp ý${list.length ? ` · ${open} chưa xử lý / ${list.length}` : ""}</div>
    ${list
      .map(
        (c) => `<div class="pptx-cm-item${c.status === "resolved" ? " is-resolved" : ""}">
        <div class="pptx-cm-meta"><b>${pxEsc(c.author_name ?? "Ẩn danh")}</b><span class="muted">${pxDateTime(c.created_at)}</span>
          <span class="pptx-pill ${c.status === "resolved" ? "ok" : "warn"}">${c.status === "resolved" ? "✓ Đã xử lý" : "● Mới"}</span>
          <span style="flex:1"></span>
          ${c.status === "resolved" ? `<button type="button" class="small write-action" data-act="cm-open" data-id="${c.id}">Mở lại</button>` : `<button type="button" class="small btn-view write-action" data-act="cm-resolve" data-id="${c.id}">Xử lý</button>`}
          ${pptx.report.access === "shared" && c.author_id !== state.currentUserId ? "" : `<button type="button" class="pptx-icon write-action" data-act="cm-del" data-id="${c.id}" title="Xóa góp ý">🗑</button>`}</div>
        <div class="pptx-cm-text">${pxEsc(c.content).replace(/\n/g, "<br/>")}</div>
        ${c.status === "resolved" && c.resolved_by ? `<div class="muted" style="font-size:.75rem">Xử lý bởi ${pxEsc(c.resolved_by)}</div>` : ""}</div>`,
      )
      .join("")}
    <div class="pptx-cm-form write-action"><textarea class="pptx-cm-input" rows="2" placeholder="Viết góp ý cho đầu mục này…"></textarea><button type="button" class="small primary" data-act="cm-add">Gửi góp ý</button></div>
  </div>`;
}

// Chấm đỏ ở menu trái: số góp ý CHƯA XỬ LÝ của phòng đang xem (cùng kiểu chấm đỏ của Yêu cầu tính năng).
function updateSpNavBadge(count) {
  // Cùng 1 số ở menu trái và ở tab "Báo cáo PowerPoint" (để biết vào tab nào có góp ý mới).
  for (const id of ["sp-nav-badge", "sp-tab-badge"]) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.hidden = !(count > 0);
    badge.textContent = count > 99 ? "99+" : String(count);
  }
}
async function refreshSpNavBadge() {
  try {
    // Chấm đỏ = góp ý chưa xử lý của phòng đang xem + báo cáo MỚI được chia sẻ cho tôi (chưa mở lần nào).
    const [c, s] = await Promise.all([
      state.currentDepartmentId == null ? { count: 0 } : api(`/api/report-comments/open-count?department_id=${state.currentDepartmentId}`),
      api("/api/report-shares/unseen-count"),
    ]);
    pptx.unseenShared = s?.count ?? 0;
    updateSpNavBadge((c?.count ?? 0) + pptx.unseenShared);
    if (px("pptx-scope-bar")) {
      px("pptx-scope-bar").outerHTML = renderPptxScopeBar();
      bindPptxScopeBar();
    }
  } catch {
    // lỗi mạng tạm thời: giữ nguyên chấm cũ
  }
}

// Thanh chọn TRANG (slide) + thu gọn/mở rộng tất cả. Chấm cam = còn đầu mục bắt buộc chưa nhập.
function renderPptxSlideBar(rep) {
  const slides = pxSlideNumbers(rep);
  const chip = (key, label, fields) => {
    const need = fields.filter((f) => f.required && f.kind !== "auto" && !f.filled).length;
    const filled = fields.filter((f) => f.kind === "auto" || f.filled).length;
    const openCm = fields.reduce((n, f) => n + pxOpenOf(pxCommentsOf(f.code)), 0);
    return `<button type="button" aria-pressed="${String(pptx.slideFilter) === String(key)}" class="pptx-slide-chip${String(pptx.slideFilter) === String(key) ? " is-active" : ""}${filled === fields.length ? " is-done" : ""}" data-slide="${key}">${label}<i>${filled}/${fields.length}</i>${openCm ? `<em class="pptx-slide-cm" title="Góp ý chưa xử lý">${openCm}</em>` : ""}${need ? '<b class="pptx-slide-dot" title="Còn đầu mục bắt buộc chưa nhập"></b>' : ""}</button>`;
  };
  return `<div class="pptx-slide-chips">${chip("all", "Tất cả", rep.fields)}${slides.map((n) => chip(String(n), n ? `Slide ${n}` : "Khác", rep.fields.filter((f) => (f.slide_no ?? 0) === n))).join("")}</div>
    <div class="pptx-slide-tools"><button type="button" class="small pptx-btn-cm${pptx.onlyOpenComments ? " is-on" : ""}" data-act="only-open-cm" title="Chỉ hiện đầu mục có góp ý chưa xử lý">💬 Góp ý chưa xử lý (${rep.fields.reduce((n, f) => n + pxOpenOf(pxCommentsOf(f.code)), 0)})</button><button type="button" class="small btn-edit" data-act="collapse-all">Thu gọn tất cả</button><button type="button" class="small pptx-btn-expand" data-act="expand-all">Mở rộng tất cả</button></div>`;
}

function renderPptxSectionInner(f, i) {
  const rep = pptx.report;
  const collapsed = pptx.collapsed.has(f.code);
  const sourceTxt = rep.period_type === "month" && f.source === "manual" ? "" : ` · Nguồn: ${PPTX_SOURCES[f.source] ?? ""}`;
  return `
    <div class="pptx-sec-head">
      <span class="pptx-num">${i + 1}</span>
      <div style="flex:1"><b style="font-size:1.05rem">${pxEsc(f.label)}</b>
        <div class="muted" style="font-size:.78rem">Slide ${f.slide_no ?? "?"} · mã <code>{{${pxEsc(f.code)}}}</code> · ${PPTX_KINDS[f.kind]}${f.required ? " · bắt buộc" : ""}${sourceTxt}${collapsed ? ` · <b>${pxEsc(pxSummary(f))}</b>` : ""}</div></div>
      ${pxCommentsOf(f.code).length ? `<span class="pptx-cm-badge${pxOpenOf(pxCommentsOf(f.code)) ? " has-open" : ""}" title="Góp ý">💬 ${pxOpenOf(pxCommentsOf(f.code)) || pxCommentsOf(f.code).length}</span>` : ""}
      <span data-pill>${pptxFieldPill(f)}</span>
      <button type="button" class="pptx-chev" data-act="toggle" title="${collapsed ? "Mở rộng" : "Thu gọn"}">${collapsed ? "▸" : "▾"}</button>
    </div>
    ${collapsed ? "" : `<div class="pptx-sec-body">${renderPptxBody(f)}</div>${renderPptxComments(f)}`}`;
}

// ---- Đầu mục Hình ảnh: 1 ảnh (PNG/JPG, tối đa 5 MB) + chú thích 1 dòng ----
const PPTX_IMG_MAX = 5 * 1024 * 1024;
const pxSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
function renderPptxImageBody(f) {
  const c = f.content;
  const url = `/api/reports/${pptx.report.id}/images/${encodeURIComponent(f.code)}?v=${encodeURIComponent(c.updated_at ?? "")}`;
  return `<div class="pptx-img">
    ${
      c.has_image
        ? `<div class="pptx-img-preview"><img src="${url}" alt="${pxEsc(c.file_name ?? "")}" /></div>
           <div class="muted" style="font-size:.8rem;margin:6px 0">${pxEsc(c.file_name ?? "")} · ${pxSize(c.size_bytes)}</div>
           <input type="text" class="pptx-cap-input" maxlength="200" placeholder="Chú thích dưới ảnh (tuỳ chọn, 1 dòng)" value="${pxEsc(c.caption ?? "")}" />`
        : `<div class="pptx-img-drop" tabindex="0" data-act="img-pick">Chưa có ảnh. Bấm để chọn ảnh, kéo thả hoặc dán (Ctrl+V) vào đây.<br/><span class="muted">PNG hoặc JPG, tối đa 5 MB.</span></div>`
    }
    <div class="pptx-img-actions write-action"><button type="button" class="small btn-view" data-act="img-pick">${c.has_image ? "Thay ảnh" : "Chọn ảnh"}</button>${c.has_image ? '<button type="button" class="small btn-delete" data-act="img-del">Xóa ảnh</button>' : ""}</div>
  </div>`;
}

async function uploadPptxImage(code, file) {
  const f = pxField(code);
  if (!file) return;
  if (!/^image\/(png|jpe?g)$/.test(file.type)) return showToast("Chỉ nhận ảnh PNG hoặc JPG.");
  if (file.size > PPTX_IMG_MAX) return showToast("Ảnh vượt quá 5 MB — hãy chọn ảnh nhỏ hơn.");
  try {
    const res = await fetch(`/api/reports/${pptx.report.id}/images/${encodeURIComponent(code)}?file_name=${encodeURIComponent(file.name || "anh.png")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: await file.arrayBuffer(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Lỗi ${res.status}`);
    f.content = { ...body, caption: f.content.caption || body.caption || "" };
    f.filled = true;
    pptx.report.status = "draft";
    renderPptxSection(code);
    showToast("Đã tải ảnh lên.", "success");
  } catch (e) {
    showToast(e.message);
  }
}
// input chọn file dùng chung (tạo 1 lần)
function pptxImageInput() {
  let input = document.getElementById("pptx-img-input");
  if (!input) {
    input = document.createElement("input");
    input.type = "file";
    input.id = "pptx-img-input";
    input.accept = "image/png,image/jpeg";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files[0];
      input.value = "";
      if (file && pptx.imgTarget) await uploadPptxImage(pptx.imgTarget, file);
    });
    document.body.appendChild(input);
  }
  return input;
}
// Dán ảnh (Ctrl+V) vào đầu mục ảnh đang chọn; kéo thả ảnh vào thẻ đầu mục ảnh.
document.addEventListener("paste", (e) => {
  if (!pptx.report || px("pptx-report-root")?.offsetParent === null) return;
  if (e.target.closest?.("input, textarea")) return;
  const f = pptx.report.fields.find((x) => x.code === pptx.activeCode);
  if (!f || f.kind !== "image") return;
  const file = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
  if (file) {
    e.preventDefault();
    uploadPptxImage(f.code, file);
  }
});

function renderPptxBody(f) {
  const c = f.content;
  if (f.kind === "auto") return `<p class="muted" style="margin:6px 0">Tự điền: <b>${pxEsc(pptx.report.label)}</b></p>`;
  if (f.kind === "image") return renderPptxImageBody(f);
  if (f.kind === "paragraph") return `<textarea class="pptx-para" data-code="${f.code}" rows="4" placeholder="Nhập nội dung đoạn văn...">${pxEsc(c.text ?? "")}</textarea>`;
  if (f.kind === "table") {
    const rows = c.rows ?? [];
    return `<table class="pptx-table"><thead><tr><th>Chỉ tiêu</th><th>Đơn vị</th><th class="r">Kế hoạch</th><th class="r">Thực hiện</th><th class="r">% kế hoạch (tự tính)</th><th></th></tr></thead><tbody>
      ${rows
        .map((r) => {
          const p = pxRatio(r);
          const cls = p == null ? "" : p >= 100 ? "pos" : "neg";
          return `<tr data-row="${r.id}">
          <td><input data-f="ten" value="${pxEsc(r.ten)}" placeholder="Tên chỉ tiêu" /></td>
          <td><input data-f="don_vi" value="${pxEsc(r.don_vi)}" /></td>
          <td class="r"><input data-f="ke_hoach" inputmode="decimal" value="${pxEsc(r.ke_hoach ?? "")}" />${r.edited?.ke_hoach ? '<i class="pptx-edited" title="Đã sửa tay">✎</i>' : ""}</td>
          <td class="r"><input data-f="thuc_hien" inputmode="decimal" value="${pxEsc(r.thuc_hien ?? "")}" />${r.edited?.thuc_hien ? '<i class="pptx-edited" title="Đã sửa tay">✎</i>' : ""}</td>
          <td class="r pptx-pct ${cls}">${p == null ? "—" : p.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%"}</td>
          <td class="r"><button type="button" class="pptx-icon" data-act="del-row" title="Xoá">🗑</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="6" class="muted" style="padding:12px">Chưa có chỉ tiêu.</td></tr>'}
      </tbody></table>
      <div class="pptx-sec-foot"><button type="button" class="pptx-link write-action" data-act="add-row">+ Thêm chỉ tiêu</button><span class="muted">${rows.length} chỉ tiêu</span></div>`;
  }
  // list
  const items = c.items ?? [];
  const isSuggest = items.some((i) => i.src);
  const shown = items.filter((i) => i.selected !== false).length;
  const rowsHtml = items
    .map((it, k) => {
      if (pptx.deleting?.code === f.code && pptx.deleting.id === it.id) {
        return `<div class="pptx-item is-deleting"><span class="pptx-ord">${k + 1}.</span><s style="flex:1">${pxEsc(it.text)}</s><b>Xóa dòng này?</b><button type="button" class="small primary" data-act="del-yes" data-id="${it.id}">Xóa</button><button type="button" class="small" data-act="del-no">Giữ lại</button></div>`;
      }
      if (pptx.editing?.code === f.code && pptx.editing.id === it.id) {
        return `<div class="pptx-item is-editing"><span class="pptx-ord">${k + 1}.</span><div style="flex:1"><textarea class="pptx-edit-input" rows="2">${pxEsc(it.text)}</textarea><div class="pptx-edit-actions"><button type="button" class="small primary" data-act="save-edit">Lưu</button><button type="button" class="small" data-act="cancel-edit">Hủy</button><span class="muted">Enter để lưu · Shift+Enter xuống dòng · Esc để hủy</span></div></div></div>`;
      }
      return `<div class="pptx-item" draggable="true" data-id="${it.id}">
        <span class="pptx-ord">${k + 1}.</span>
        ${it.src ? `<label class="pptx-pick"><input type="checkbox" data-act="pick" data-id="${it.id}" ${it.selected ? "checked" : ""} /></label>` : ""}
        <span style="flex:1">${pxRich(it.text)}${it.src ? ` <span class="pptx-src">${pxEsc(it.src)}</span>` : ""}</span>
        <button type="button" class="pptx-icon" data-act="edit" data-id="${it.id}" title="Sửa">✎</button>
        <button type="button" class="pptx-icon" data-act="del" data-id="${it.id}" title="Xoá">🗑</button>
        <span class="pptx-grip" title="Kéo để đổi thứ tự">⠿</span></div>`;
    })
    .join("");
  const adding =
    pptx.editing?.code === f.code && pptx.editing.id === null
      ? `<div class="pptx-item is-editing"><span class="pptx-ord">${items.length + 1}.</span><div style="flex:1"><textarea class="pptx-edit-input" rows="2" placeholder="Nội dung dòng mới"></textarea><div class="pptx-edit-actions"><button type="button" class="small primary" data-act="save-edit">Lưu</button><button type="button" class="small" data-act="cancel-edit">Hủy</button><span class="muted">Enter để lưu · Shift+Enter xuống dòng · Esc để hủy</span></div></div></div>`
      : "";
  const empty =
    items.length === 0 && !adding
      ? `<div class="pptx-hint"><span>Chưa có nội dung cho kỳ này. Thêm dòng mới${f.carry_count ? ` hoặc lấy lại các dòng của ${pxEsc(pptx.report.prev_label)} còn tồn đọng` : ""}.</span>${f.carry_count ? `<button type="button" class="small btn-view write-action" data-act="pull-prev">Lấy từ ${pxEsc(pptx.report.prev_label)} (${f.carry_count} dòng)</button>` : ""}</div>`
      : "";
  return `${rowsHtml}${adding}${empty}
    <div class="pptx-sec-foot"><button type="button" class="pptx-link write-action" data-act="add">+ Thêm dòng</button>
      <span class="muted" title="Dùng **chữ đậm** để in đậm một phần dòng khi xuất PowerPoint">Mẹo: **chữ đậm**</span>
      <span class="${shown > PPTX_MAX_LINES ? "pptx-over" : "muted"}">${isSuggest ? `${shown} dòng được chọn · ` : ""}${shown}/${PPTX_MAX_LINES} dòng vừa một slide${shown > PPTX_MAX_LINES ? " — slide có thể bị tràn" : ""}</span></div>`;
}

function renderPptxPreview() {
  const rep = pptx.report;
  if (!rep) return "";
  const idx = Math.max(0, rep.fields.findIndex((f) => f.code === pptx.activeCode));
  const f = rep.fields[idx];
  if (!f) return "";
  let body = "";
  if (f.kind === "auto") body = `<p>${pxEsc(rep.label)}</p>`;
  else if (f.kind === "image") body = f.content.has_image ? `<img class="pptx-prev-img" src="/api/reports/${rep.id}/images/${encodeURIComponent(f.code)}?v=${encodeURIComponent(f.content.updated_at ?? "")}" alt="" />${f.content.caption ? `<div class="muted" style="text-align:center;font-size:.72rem">${pxEsc(f.content.caption)}</div>` : ""}` : '<i class="muted">Chưa có ảnh</i>';
  else if (f.kind === "paragraph") body = `<p>${pxEsc(f.content.text ?? "").replace(/\n/g, "<br/>") || '<i class="muted">Chưa có nội dung</i>'}</p>`;
  else if (f.kind === "list") {
    const items = (f.content.items ?? []).filter((i) => i.text && i.selected !== false);
    body = items.length ? `<ul>${items.map((i) => `<li>${pxRich(i.text)}</li>`).join("")}</ul>` : '<i class="muted">Chưa có nội dung</i>';
  } else {
    const rows = (f.content.rows ?? []).filter((r) => r.ten);
    body = rows.length
      ? `<table class="pptx-mini"><tr><th>Chỉ tiêu</th><th>KH</th><th>TH</th><th>%</th></tr>${rows.map((r) => { const p = pxRatio(r); return `<tr><td>${pxEsc(r.ten)}</td><td>${pxNum(r.ke_hoach)}</td><td>${pxNum(r.thuc_hien)}</td><td>${p == null ? "" : p.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%"}</td></tr>`; }).join("")}</table>`
      : '<i class="muted">Chưa có nội dung</i>';
  }
  return `
    <div class="row" style="justify-content:space-between"><b>Xem trước</b><span class="muted">Slide ${f.slide_no ?? idx + 1} / ${rep.slide_count}</span></div>
    <div class="pptx-slide"><div class="pptx-slide-bar"><span>BÁO CÁO ${pxEsc(rep.label.toUpperCase())}</span><span>${f.slide_no ?? ""}</span></div>
      <div class="pptx-slide-body"><div style="font-weight:700;margin-bottom:6px">${idx + 1}. ${pxEsc(f.label)}</div>${body}</div></div>
    <div class="pptx-thumbs">${pxSlideNumbers(rep).map((n) => {
      const fs = rep.fields.filter((x) => (x.slide_no ?? 0) === n);
      const done = fs.every((x) => x.kind === "auto" || x.filled);
      return `<button type="button" class="pptx-thumb${done ? " is-filled" : ""}${(f.slide_no ?? 0) === n ? " is-active" : ""}" data-slide="${n}">${n ? `Slide ${n}` : "Khác"} · ${fs.length} mục</button>`;
    }).join("")}</div>
    <p class="muted" style="font-size:.8rem">Bấm một đầu mục để xem nội dung tương ứng. Bản xem trước chỉ minh hoạ nội dung; font, màu, logo được lấy nguyên từ file mẫu khi xuất.</p>`;
}

// ---------------------------------------------------------------- lưu / cập nhật từng phần
function pxField(code) {
  return pptx.report.fields.find((f) => f.code === code);
}
function refreshPptxHeader() {
  const rep = pptx.report;
  const { done, total } = pptxProgress(rep);
  const fill = px("pptx-bar-fill");
  if (fill) fill.style.width = `${total ? (done / total) * 100 : 0}%`;
  if (px("pptx-progress-text")) px("pptx-progress-text").textContent = `${done}/${total} đầu mục đã nhập`;
  if (px("pptx-slidebar")) px("pptx-slidebar").innerHTML = renderPptxSlideBar(rep);
  const missing = rep.fields.filter((f) => f.required && f.kind !== "auto" && !f.filled);
  if (px("pptx-warnings")) px("pptx-warnings").innerHTML = renderPptxWarnings(rep, missing, rep.period_type !== "month");
  if (px("pptx-status")) px("pptx-status").innerHTML = rep.status === "exported" ? '<span class="pptx-pill ok">● Đã xuất</span>' : '<span class="pptx-pill warn">● Nháp</span>';
  if (px("pptx-saved")) px("pptx-saved").textContent = pptx.savedAt ? `Đã lưu lúc ${pptx.savedAt}` : "Tự động lưu nháp";
  if (px("pptx-preview")) px("pptx-preview").innerHTML = renderPptxPreview();
}
function recomputeFilled(f) {
  const c = f.content;
  if (f.kind === "image") { f.filled = !!c.has_image; return; }
  f.filled = f.kind === "table" ? (c.rows ?? []).some((r) => r.ten) : f.kind === "list" ? (c.items ?? []).some((i) => i.text && i.selected !== false) : f.kind === "paragraph" ? !!(c.text ?? "").trim() : true;
}
function renderPptxSection(code) {
  const i = pptx.report.fields.findIndex((f) => f.code === code);
  const el = px(`pptx-sec-${code}`);
  if (el && i >= 0) {
    const fld = pptx.report.fields[i];
    el.classList.toggle("is-collapsed", pptx.collapsed.has(code));
    el.classList.toggle("is-auto", fld.kind === "auto");
    el.classList.toggle("is-filled", fld.kind !== "auto" && !!fld.filled);
    el.innerHTML = renderPptxSectionInner(fld, i);
  }
  refreshPptxHeader();
}
function schedulePptxSave(code, delay = 700) {
  pptx.dirty.add(code);
  clearTimeout(pptx.saveTimers[code]);
  pptx.saveTimers[code] = setTimeout(() => flushPptxSave(code), delay);
}
async function flushPptxSave(code) {
  if (!pptx.dirty.has(code) || !pptx.report) return;
  pptx.dirty.delete(code);
  const f = pxField(code);
  try {
    await api(`/api/reports/${pptx.report.id}/sections/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify({ content: f.content }) });
    pptx.report.status = "draft";
    pptx.savedAt = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const cur = pptx.overview.reports.find((r) => r.id === pptx.report.id);
    if (cur) cur.status = "draft";
    refreshPptxHeader();
  } catch (err) {
    showToast(err.message);
  }
}
async function reloadPptxReport() {
  const id = pptx.report.id;
  pptx.report = await api(`/api/reports/${id}`);
  pptx.editing = null;
  pptx.deleting = null;
  renderPptxReportView();
}
const pxNewId = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- sự kiện màn hình Báo cáo
// Gắn sự kiện cho thẻ "Kỳ báo cáo" (đổi loại kỳ, năm, chọn kỳ, tạo báo cáo) — tách riêng để vẽ lại riêng thẻ này khi số góp ý đổi.
function bindPptxPicker() {
  const root = px("pptx-picker");
  if (!root) return; // chế độ báo cáo được chia sẻ không có thẻ chọn kỳ
  root.querySelectorAll("#pptx-type-seg .gnv-seg-btn").forEach((b) =>
    b.addEventListener("click", async () => {
      pptx.type = b.dataset.type;
      pptx.selectedIdx = null;
      pptx.report = null;
      await loadPptxOverview().catch((e) => showToast(e.message));
    }),
  );
  px("pptx-year-prev")?.addEventListener("click", () => changePptxYear(-1));
  px("pptx-year-next")?.addEventListener("click", () => changePptxYear(1));
  root.querySelectorAll(".pptx-chip").forEach((c) =>
    c.addEventListener("click", async () => {
      pptx.selectedIdx = Number(c.dataset.idx);
      const r = pptxReportOf(pptx.type, pptx.selectedIdx);
      if (r) await openPptxReport(r.id).catch((e) => showToast(e.message));
      else {
        pptx.report = null;
        renderPptxReportView();
      }
    }),
  );
  px("pptx-create-top")?.addEventListener("click", (e) => createPptxReport(Number(e.currentTarget.dataset.idx)));
}
// Cập nhật số góp ý chưa xử lý của báo cáo đang mở vào tổng quan rồi vẽ lại thẻ chọn kỳ (chấm đỏ tháng/quý/năm).
function refreshPptxPickerBadges() {
  const r = pptx.report && pptx.overview.reports.find((x) => x.id === pptx.report.id);
  if (r) {
    const delta = pxOpenOf(pptx.report.comments ?? []) - (r.open_comments ?? 0);
    r.open_comments = pxOpenOf(pptx.report.comments ?? []);
    pptx.overview.open_by_year = { ...(pptx.overview.open_by_year ?? {}), [pptx.year]: Math.max(0, (pptx.overview.open_by_year?.[pptx.year] ?? 0) + delta) };
  }
  if (px("pptx-picker")) {
    px("pptx-picker").innerHTML = renderPptxPicker();
    bindPptxPicker();
  }
}

function bindPptxReport() {
  const root = px("pptx-report-root");
  bindPptxPicker();
  px("pptx-create-btn")?.addEventListener("click", () => createPptxReport(pptx.selectedIdx));
  px("pptx-goto-template")?.addEventListener("click", () => setPptxView("template", pptx.type));
  if (!pptx.report) return;

  px("pptx-copy-prev")?.addEventListener("click", async () => {
    if (!(await confirmDialog(`Sao chép toàn bộ nội dung từ ${pptx.report.prev_label}? Nội dung hiện tại sẽ bị thay thế.`, { title: "Sao chép từ kỳ trước", okText: "Sao chép", danger: false }))) return;
    try {
      await api(`/api/reports/${pptx.report.id}/copy-previous`, { method: "POST" });
      await reloadPptxReport();
      showToast("Đã sao chép.", "success");
    } catch (e) {
      showToast(e.message);
    }
  });
  px("pptx-refresh")?.addEventListener("click", refreshPptxFromChildren);
  px("pptx-export-btn").addEventListener("click", exportPptxReport);
  px("pptx-versions-btn").addEventListener("click", showPptxVersions);
  px("pptx-share-btn")?.addEventListener("click", openPptxShareDialog);
  px("pptx-delete-report").addEventListener("click", async () => {
    if (!(await confirmDialog(`Xóa báo cáo ${pptx.report.label}?`, { title: "Xác nhận xóa", okText: "Xóa" }))) return;
    try {
      await api(`/api/reports/${pptx.report.id}`, { method: "DELETE" });
      pptx.report = null;
      await loadPptxOverview();
    } catch (e) {
      showToast(e.message);
    }
  });
  root.querySelector(".pptx-main").addEventListener("click", onPptxMainClick);
  root.querySelector(".pptx-main").addEventListener("input", onPptxMainInput);
  root.querySelector(".pptx-main").addEventListener("keydown", onPptxMainKey);
  root.querySelector(".pptx-main").addEventListener("change", onPptxMainChange);
  bindPptxDrag(root.querySelector(".pptx-main"));
  const mainEl = root.querySelector(".pptx-main");
  mainEl.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types?.includes("Files") && e.target.closest(".pptx-section")) e.preventDefault();
  });
  mainEl.addEventListener("drop", (e) => {
    const sec = e.target.closest(".pptx-section");
    const file = e.dataTransfer?.files?.[0];
    if (!sec || !file || pxField(sec.dataset.code).kind !== "image") return;
    e.preventDefault();
    uploadPptxImage(sec.dataset.code, file);
  });
  px("pptx-slidebar").addEventListener("click", (e) => {
    const chip = e.target.closest(".pptx-slide-chip");
    const tool = e.target.closest("[data-act]");
    if (chip) {
      setPptxSlideFilter(chip.dataset.slide);
      const first = pptx.report.fields.find((f) => chip.dataset.slide === "all" || String(f.slide_no ?? 0) === chip.dataset.slide);
      if (first) {
        pptx.activeCode = first.code;
        px("pptx-preview").innerHTML = renderPptxPreview();
      }
    } else if (tool) {
      if (tool.dataset.act === "only-open-cm") {
        pptx.onlyOpenComments = !pptx.onlyOpenComments;
        px("pptx-slidebar").innerHTML = renderPptxSlideBar(pptx.report);
        applyPptxSearch();
        return;
      }
      if (tool.dataset.act === "collapse-all") pptx.report.fields.forEach((f) => pptx.collapsed.add(f.code));
      else pptx.collapsed.clear();
      pptx.report.fields.forEach((f, i) => {
        const el = px(`pptx-sec-${f.code}`);
        el.classList.toggle("is-collapsed", pptx.collapsed.has(f.code));
        el.innerHTML = renderPptxSectionInner(f, i);
      });
    }
  });
  px("pptx-search").addEventListener("input", (e) => {
    pptx.search = e.target.value;
    applyPptxSearch();
  });
  applyPptxSearch();
  px("pptx-preview").addEventListener("click", (e) => {
    const t = e.target.closest(".pptx-thumb");
    if (!t) return;
    // Bấm 1 slide -> chuyển tới trang slide đó (nếu đang xem từng slide) và xem trước đầu mục đầu tiên của nó.
    const first = pptx.report.fields.find((x) => String(x.slide_no ?? 0) === t.dataset.slide);
    if (!first) return;
    if (pptx.slideFilter !== "all" || pxFold(pptx.search)) {
      pptx.search = "";
      if (px("pptx-search")) px("pptx-search").value = "";
      setPptxSlideFilter(t.dataset.slide);
    }
    pptx.activeCode = first.code;
    px("pptx-preview").innerHTML = renderPptxPreview();
    px(`pptx-sec-${first.code}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// Chuỗi để tìm của 1 đầu mục: tên + mã + toàn bộ nội dung đã nhập (không phân biệt hoa/thường, bỏ dấu).
const pxFold = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
function pxSearchText(f) {
  const c = f.content ?? {};
  const body = f.kind === "table" ? (c.rows ?? []).map((r) => `${r.ten} ${r.don_vi} ${r.ke_hoach ?? ""} ${r.thuc_hien ?? ""}`).join(" ") : f.kind === "list" ? (c.items ?? []).map((i) => i.text).join(" ") : f.kind === "paragraph" ? c.text ?? "" : f.kind === "image" ? `${c.file_name ?? ""} ${c.caption ?? ""}` : pptx.report.label;
  return pxFold(`${f.label} ${f.code} ${body}`);
}
// Hiện/ẩn đầu mục: đang TÌM KIẾM thì lọc theo từ khoá trên mọi slide; không thì chỉ hiện slide đang chọn (hoặc tất cả).
function applyPptxSearch() {
  const rep = pptx.report;
  if (!rep) return;
  const words = pxFold(pptx.search).split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const f of rep.fields) {
    const el = px(`pptx-sec-${f.code}`);
    if (!el) continue;
    const base = words.length
      ? words.every((w) => pxSearchText(f).includes(w))
      : pptx.onlyOpenComments || pptx.slideFilter === "all" || String(f.slide_no ?? 0) === String(pptx.slideFilter);
    const match = base && (!pptx.onlyOpenComments || pxOpenOf(pxCommentsOf(f.code)) > 0);
    el.hidden = !match;
    if (match) shown++;
  }
  const count = px("pptx-search-count");
  if (count) count.textContent = words.length ? `Hiện ${shown}/${rep.fields.length} đầu mục` : "";
}
function setPptxSlideFilter(key) {
  pptx.slideFilter = key === "all" ? "all" : Number(key);
  px("pptx-slidebar").innerHTML = renderPptxSlideBar(pptx.report);
  applyPptxSearch();
}

async function changePptxYear(d) {
  pptx.year += d;
  pptx.selectedIdx = null;
  pptx.report = null;
  await loadPptxOverview().catch((e) => showToast(e.message));
}

async function createPptxReport(idx) {
  if (!idx) return;
  try {
    const r = await api("/api/reports", { method: "POST", body: JSON.stringify({ period_type: pptx.type, year: pptx.year, idx, department_id: state.currentDepartmentId }) });
    pptx.selectedIdx = idx;
    await loadPptxOverview();
    if (r.missing_children?.length) showToast(`Đã tạo. Lưu ý: chưa có báo cáo ${r.missing_children.map((m) => m.label).join(", ")}.`, "error");
    else showToast("Đã tạo báo cáo.", "success");
  } catch (e) {
    showToast(e.message);
  }
}

async function refreshPptxFromChildren() {
  if (!(await confirmDialog("Tổng hợp lại từ các kỳ con? Ô đã sửa tay và dòng đã tick vẫn được giữ.", { title: "Cập nhật lại", okText: "Cập nhật", danger: false }))) return;
  try {
    await api(`/api/reports/${pptx.report.id}/refresh`, { method: "POST" });
    await reloadPptxReport();
    showToast("Đã cập nhật lại.", "success");
  } catch (e) {
    showToast(e.message);
  }
}

async function exportPptxReport() {
  const rep = pptx.report;
  // lưu nốt các thay đổi đang chờ
  await Promise.all([...pptx.dirty].map((c) => { clearTimeout(pptx.saveTimers[c]); return flushPptxSave(c); }));
  try {
    const res = await fetch(`/api/reports/${rep.id}/export`, { method: "POST", headers: { "Content-Type": "application/json" } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Lỗi ${res.status}`);
    const missing = JSON.parse(decodeURIComponent(res.headers.get("X-Missing-Required") || "[]"));
    const blob = await res.blob();
    const name = decodeURIComponent((res.headers.get("Content-Disposition") || "").split("''")[1] || "BaoCao.pptx");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    rep.status = "exported";
    const cur = pptx.overview.reports.find((r) => r.id === rep.id);
    if (cur) cur.status = "exported";
    renderPptxReportView();
    showToast(missing.length ? `Đã xuất ${name}. Đầu mục trống: ${missing.join(", ")}.` : `Đã xuất ${name}.`, missing.length ? "error" : "success");
  } catch (e) {
    showToast(e.message);
  }
}

async function showPptxVersions() {
  try {
    const list = await api(`/api/reports/${pptx.report.id}/versions`);
    if (!list.length) return showToast("Báo cáo này chưa được xuất lần nào.");
    const body = list
      .map((v) => `<div class="pptx-item"><b>Phiên bản ${v.version_no}</b><span class="muted" style="flex:1">${pxEsc(v.created_at)}${v.created_by ? " · " + pxEsc(v.created_by) : ""}</span><button type="button" class="small btn-view" data-href="/api/report-versions/${v.id}/download">Tải về</button></div>`)
      .join("");
    px("pptx-diff-intro").textContent = "Mỗi lần xuất tạo 1 phiên bản mới, các bản cũ được giữ lại.";
    px("pptx-diff-body").innerHTML = body;
    px("pptx-diff-dialog").dataset.mode = "versions";
    px("pptx-diff-dialog").querySelector("h2").textContent = "Các phiên bản đã xuất";
    px("pptx-diff-dialog").querySelector('button[type="submit"]').hidden = true;
    px("pptx-diff-dialog").showModal();
  } catch (e) {
    showToast(e.message);
  }
}

function pptxContentOf(code) {
  return pxField(code).content;
}

function onPptxMainInput(e) {
  const sec = e.target.closest(".pptx-section");
  if (!sec) return;
  const code = sec.dataset.code;
  const f = pxField(code);
  if (e.target.matches(".pptx-cap-input")) {
    f.content.caption = e.target.value;
    clearTimeout(pptx.saveTimers[`cap-${code}`]);
    pptx.saveTimers[`cap-${code}`] = setTimeout(async () => {
      try {
        await api(`/api/reports/${pptx.report.id}/images/${encodeURIComponent(code)}/caption`, { method: "PUT", body: JSON.stringify({ caption: f.content.caption }) });
        pptx.savedAt = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        refreshPptxHeader();
      } catch (err) {
        showToast(err.message);
      }
    }, 600);
    return;
  }
  if (e.target.matches(".pptx-para")) {
    f.content.text = e.target.value;
    recomputeFilled(f);
    schedulePptxSave(code);
    refreshPptxHeader();
    px(`pptx-sec-${code}`).querySelector("[data-pill]").innerHTML = pptxFieldPill(f);
  } else if (e.target.closest(".pptx-table")) {
    const tr = e.target.closest("tr[data-row]");
    const row = f.content.rows.find((r) => r.id === tr.dataset.row);
    const k = e.target.dataset.f;
    if (k === "ten" || k === "don_vi") row[k] = e.target.value;
    else {
      const raw = e.target.value.replace(",", ".").trim();
      row[k] = raw === "" ? null : Number(raw);
      if (Number.isNaN(row[k])) row[k] = null;
      // ô sửa tay (chỉ có ý nghĩa khi số liệu đang được tổng hợp tự động)
      if (f.source === "sum" || f.source === "prior_year") row.edited = { ...(row.edited ?? {}), [k]: true };
    }
    const p = pxRatio(row);
    const cell = tr.querySelector(".pptx-pct");
    cell.textContent = p == null ? "—" : p.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%";
    cell.className = `r pptx-pct ${p == null ? "" : p >= 100 ? "pos" : "neg"}`;
    recomputeFilled(f);
    schedulePptxSave(code);
    refreshPptxHeader();
  }
}

function onPptxMainChange(e) {
  const sec = e.target.closest(".pptx-section");
  if (!sec || e.target.dataset.act !== "pick") return;
  const f = pxField(sec.dataset.code);
  const it = f.content.items.find((i) => i.id === e.target.dataset.id);
  it.selected = e.target.checked;
  recomputeFilled(f);
  schedulePptxSave(sec.dataset.code, 200);
  renderPptxSection(sec.dataset.code);
}

function savePptxListEdit(code) {
  const sec = px(`pptx-sec-${code}`);
  const input = sec.querySelector(".pptx-edit-input");
  const text = (input?.value ?? "").trim();
  const f = pxField(code);
  const ed = pptx.editing;
  // Dòng trống không lưu được: báo rõ và giữ nguyên ô nhập (muốn bỏ dòng thì bấm Hủy hoặc dùng nút xóa).
  if (!text) {
    showToast("Hãy nhập nội dung dòng trước khi lưu (hoặc bấm Hủy).");
    input?.focus();
    return;
  }
  if (ed.id === null) f.content.items.push({ id: pxNewId(), text });
  else f.content.items.find((i) => i.id === ed.id).text = text;
  recomputeFilled(f);
  schedulePptxSave(code, 100);
  pptx.editing = null;
  renderPptxSection(code);
}

function onPptxMainKey(e) {
  if (!e.target.matches(".pptx-edit-input")) return;
  const code = e.target.closest(".pptx-section").dataset.code;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    savePptxListEdit(code);
  } else if (e.key === "Escape") {
    pptx.editing = null;
    renderPptxSection(code);
  }
}

async function onPptxMainClick(e) {
  const sec = e.target.closest(".pptx-section");
  if (!sec) return;
  const code = sec.dataset.code;
  // chọn đầu mục để xem trước
  if (pptx.activeCode !== code) {
    pptx.activeCode = code;
    px("pptx-preview").innerHTML = renderPptxPreview();
  }
  // Bấm vào dòng tiêu đề đầu mục (hoặc nút ▾/▸) -> thu gọn/mở rộng.
  if (e.target.closest(".pptx-sec-head")) {
    if (pptx.collapsed.has(code)) pptx.collapsed.delete(code);
    else pptx.collapsed.add(code);
    renderPptxSection(code);
    return;
  }
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.dataset.act === "pick") return;
  const f = pxField(code);
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  // Báo cáo được chia sẻ: chỉ được góp ý (thêm/xóa góp ý của mình), không sửa nội dung.
  if (pptx.report.access === "shared" && act !== "cm-add" && act !== "cm-del") return;
  if (act.startsWith("cm-")) return onPptxCommentAction(code, act, id, sec);
  if (act === "img-pick") {
    pptx.imgTarget = code;
    pptxImageInput().click();
    return;
  }
  if (act === "img-del") {
    if (!(await confirmDialog("Xóa ảnh của đầu mục này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
    try {
      await api(`/api/reports/${pptx.report.id}/images/${encodeURIComponent(code)}`, { method: "DELETE" });
      f.content = { has_image: false, caption: "" };
      f.filled = false;
      renderPptxSection(code);
    } catch (e) {
      showToast(e.message);
    }
    return;
  }
  if (act === "add") {
    pptx.editing = { code, id: null };
    renderPptxSection(code);
    sec.querySelector(".pptx-edit-input")?.focus();
  } else if (act === "edit") {
    pptx.editing = { code, id };
    renderPptxSection(code);
    const input = sec.querySelector(".pptx-edit-input");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  } else if (act === "save-edit") savePptxListEdit(code);
  else if (act === "cancel-edit") {
    pptx.editing = null;
    renderPptxSection(code);
  } else if (act === "del") {
    pptx.deleting = { code, id };
    renderPptxSection(code);
  } else if (act === "del-no") {
    pptx.deleting = null;
    renderPptxSection(code);
  } else if (act === "del-yes") {
    f.content.items = f.content.items.filter((i) => i.id !== id);
    pptx.deleting = null;
    recomputeFilled(f);
    schedulePptxSave(code, 100);
    renderPptxSection(code);
  } else if (act === "add-row") {
    f.content.rows.push({ id: pxNewId(), ten: "", don_vi: "", ke_hoach: null, thuc_hien: null, ...(f.source === "sum" ? { manual: true } : {}) });
    renderPptxSection(code);
    const inputs = sec.querySelectorAll('tr[data-row] input[data-f="ten"]');
    inputs[inputs.length - 1]?.focus();
  } else if (act === "del-row") {
    const rid = e.target.closest("tr").dataset.row;
    f.content.rows = f.content.rows.filter((r) => r.id !== rid);
    recomputeFilled(f);
    schedulePptxSave(code, 100);
    renderPptxSection(code);
  } else if (act === "pull-prev") {
    try {
      await api(`/api/reports/${pptx.report.id}/sections/${encodeURIComponent(code)}/pull-previous`, { method: "POST" });
      await reloadPptxReport();
    } catch (err) {
      showToast(err.message);
    }
  }
}

async function onPptxCommentAction(code, act, id, sec) {
  const rep = pptx.report;
  try {
    if (act === "cm-add") {
      const input = sec.querySelector(".pptx-cm-input");
      const content = (input?.value ?? "").trim();
      if (!content) return showToast("Hãy nhập nội dung góp ý.");
      const c = await api(`/api/reports/${rep.id}/comments`, { method: "POST", body: JSON.stringify({ field_code: code, content }) });
      rep.comments.push(c);
    } else if (act === "cm-resolve" || act === "cm-open") {
      if (act === "cm-resolve" && !(await confirmDialog("Xác nhận góp ý này đã được ghi nhận/ chỉnh sửa?", { title: "Xác nhận xử lý", okText: "Xác nhận", danger: false }))) return;
      const c = await api(`/api/report-comments/${id}`, { method: "PUT", body: JSON.stringify({ status: act === "cm-resolve" ? "resolved" : "open" }) });
      rep.comments = rep.comments.map((x) => (x.id === Number(id) ? c : x));
    } else if (act === "cm-del") {
      if (!(await confirmDialog("Xóa góp ý này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
      await api(`/api/report-comments/${id}`, { method: "DELETE" });
      rep.comments = rep.comments.filter((x) => x.id !== Number(id));
    }
    renderPptxSection(code);
    applyPptxSearch();
    refreshSpNavBadge();
    refreshPptxPickerBadges();
  } catch (e) {
    showToast(e.message);
  }
}

// Kéo thả đổi thứ tự dòng danh sách.
function bindPptxDrag(main) {
  let dragId = null;
  main.addEventListener("dragstart", (e) => {
    const it = e.target.closest(".pptx-item[draggable]");
    if (!it) return;
    dragId = it.dataset.id;
    e.dataTransfer.effectAllowed = "move";
  });
  main.addEventListener("dragover", (e) => {
    if (dragId && e.target.closest(".pptx-item[draggable]")) e.preventDefault();
  });
  main.addEventListener("drop", (e) => {
    const target = e.target.closest(".pptx-item[draggable]");
    const sec = e.target.closest(".pptx-section");
    if (!dragId || !target || !sec) return;
    e.preventDefault();
    const code = sec.dataset.code;
    const items = pxField(code).content.items;
    const from = items.findIndex((i) => i.id === dragId);
    const to = items.findIndex((i) => i.id === target.dataset.id);
    dragId = null;
    if (from < 0 || to < 0 || from === to) return;
    items.splice(to, 0, items.splice(from, 1)[0]);
    schedulePptxSave(code, 100);
    renderPptxSection(code);
  });
  main.addEventListener("dragend", () => (dragId = null));
}

// ---------------------------------------------------------------- màn hình Mẫu PowerPoint
function setPptxView(view, type) {
  pptx.view = view;
  if (type) pptx.tplType = type;
  px("pptx-report-root").hidden = view !== "report";
  px("pptx-template-root").hidden = view !== "template";
  document.querySelectorAll("#pptx-view-seg .gnv-seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  loadPptx().catch((e) => showToast(e.message));
}
document.getElementById("pptx-view-seg")?.addEventListener("click", (e) => {
  const b = e.target.closest(".gnv-seg-btn");
  if (b) setPptxView(b.dataset.view);
});

async function loadPptxTemplates() {
  pptx.tplList = (await api(`/api/report-templates?${pxDept()}`)) ?? [];
  pptx.tpl = pptx.tplList.find((t) => t.period_type === pptx.tplType)?.exists ? await api(`/api/report-templates/${pptx.tplType}?${pxDept()}`) : null;
  renderPptxTemplates();
}

function renderPptxTemplates() {
  const t = pptx.tpl;
  const cur = pptx.tplList.find((x) => x.period_type === pptx.tplType);
  const typeInfo = PPTX_TYPES.find((x) => x.key === pptx.tplType);
  px("pptx-template-root").innerHTML = `
    <p class="muted" style="margin-top:0">Mỗi loại kỳ có một file mẫu riêng. Hệ thống đọc file, tìm các mã giữ chỗ dạng <code>{{ten_ma}}</code> và biến mỗi mã thành một đầu mục nhập liệu. Báo cáo quý, 6 tháng, năm có thể tự tổng hợp từ các kỳ con.</p>
    <div class="pptx-tpl-cards">${pptx.tplList
      .map((x) => {
        const ty = PPTX_TYPES.find((p) => p.key === x.period_type);
        return `<button type="button" class="pptx-tpl-card${x.period_type === pptx.tplType ? " is-selected" : ""}" data-type="${x.period_type}">
          <span class="pptx-tpl-head"><span class="pptx-tpl-title">${ty.full}</span><span class="pptx-pill ${x.exists ? "ok" : "warn"}">● ${x.exists ? "Đã có mẫu" : "Chưa có"}</span></span>
          <span class="pptx-tpl-file">${x.exists ? pxEsc(x.file_name) : "Chưa tải mẫu lên"}</span>
          <span class="pptx-tpl-meta">${x.exists ? `${x.slide_count} slide · ${x.field_count} mã · dùng cho ${x.used_count} kỳ` : "Tải file .pptx lên để bắt đầu"}</span></button>`;
      })
      .join("")}</div>
    <h3 style="margin:18px 0 8px">Mẫu ${typeInfo.full.toLowerCase()}</h3>
    <div class="pptx-card pptx-file">
      <div class="pptx-file-info">
        <div class="pptx-file-title"><b>${t ? pxEsc(t.file_name) : "Chưa có file mẫu"}</b>${t ? '<span class="pptx-pill ok">● Đang dùng</span>' : ""}</div>
        <div class="pptx-file-meta">${
          t
            ? [
                `${t.slide_count} slide`,
                t.size_bytes >= 1048576 ? (t.size_bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(t.size_bytes / 1024)) + " KB",
                `tìm thấy ${t.fields.filter((f) => !f.is_hidden).length} mã giữ chỗ`,
                `tải lên ${pxDateTime(t.uploaded_at)}${t.uploaded_by ? " bởi " + pxEsc(t.uploaded_by) : ""}`,
                `phiên bản mẫu ${t.version}`,
              ].map((x) => `<span>${x}</span>`).join("")
            : "<span>Tải file .pptx lên — hệ thống sẽ đọc các mã {{...}} trong file.</span>"
        }</div></div>
      ${t ? `<button type="button" class="btn-view" data-href="/api/report-templates/${pptx.tplType}/file?${pxDept()}">Tải file mẫu về</button>` : ""}
      <button type="button" class="btn-edit" data-href="/api/report-templates/${pptx.tplType}/sample">Tải file mẫu ví dụ</button>
      <button class="primary write-action" id="pptx-upload-btn"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-upload"/></svg>${t ? "Thay file mẫu" : "Tải file mẫu lên"}</button>
    </div>
    ${t ? renderPptxFieldTable(t) : ""}
    <div class="pptx-tpl-help">
      <div class="pptx-card"><h3 style="margin-top:0">Cách chuẩn bị file mẫu</h3><ol>
        <li>Mở một báo cáo cũ cùng loại kỳ trong PowerPoint.</li>
        <li>Giữ nguyên tiêu đề, logo, màu. Thay phần nội dung đổi theo kỳ bằng mã, ví dụ <code>{{cv_noi_bat}}</code>.</li>
        <li>Tên kỳ (Tháng 10/2026, Quý III/2026…) dùng mã có sẵn <code>{{ky_bao_cao}}</code>, hệ thống tự điền.</li>
        <li>Bảng chỉ tiêu: đặt trong <b>một hàng</b> của bảng PowerPoint các mã <code>{{ma.ten}}</code> <code>{{ma.don_vi}}</code> <code>{{ma.ke_hoach}}</code> <code>{{ma.thuc_hien}}</code> <code>{{ma.ty_le}}</code> — hàng đó được nhân theo số chỉ tiêu.</li>
        <li><b>Ảnh thay đổi theo kỳ:</b> vẽ một khung chữ ở đúng chỗ, đúng cỡ muốn đặt ảnh rồi gõ mã bắt đầu bằng <code>anh_</code>, ví dụ <code>{{anh_dashboard}}</code> (chọn kiểu Hình ảnh). Khi xuất, khung được thay bằng ảnh đã tải lên (co vừa khung, giữ tỉ lệ) kèm chú thích.</li>
        <li><b>Ghi chú thuyết trình (Notes):</b> gõ mã vào khung Notes dưới slide, ví dụ <code>{{ghi_chu_iso}}</code> (chọn kiểu Đoạn văn) — hệ thống điền cả phần ghi chú khi xuất.</li>
        <li>Lưu file .pptx và tải lên ở đây.</li></ol></div>
      <div class="pptx-card"><h3 style="margin-top:0">Khi thay file mẫu</h3><p>Hệ thống so sánh mã giữ chỗ cũ và mới, báo lại trước khi áp dụng:</p><ul>
        <li><b>Mã giữ nguyên:</b> dữ liệu các kỳ giữ nguyên.</li><li><b>Mã mới:</b> thêm đầu mục mới, các kỳ cũ để trống.</li><li><b>Mã bị bỏ:</b> ẩn đầu mục, không xóa dữ liệu cũ.</li></ul>
        <p class="muted">Báo cáo đã xuất của các kỳ trước không bị ảnh hưởng.</p></div></div>`;
  bindPptxTemplates();
}

function renderPptxFieldTable(t) {
  const isMonth = pptx.tplType === "month";
  const fields = t.fields;
  return `<div class="pptx-card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Đầu mục báo cáo</h3><span class="muted">Kéo để đổi thứ tự hiển thị trên màn hình nhập</span></div>
    <div class="table-wrap"><table class="pptx-fields"><thead><tr><th></th><th>Slide</th><th>Tên đầu mục</th><th>Mã giữ chỗ trong file</th><th>Kiểu nội dung</th><th>Bắt buộc</th><th>Mang sang</th><th>Nguồn dữ liệu</th></tr></thead><tbody>
    ${fields
      .map((f) => {
        const sources = PPTX_SOURCES_BY_KIND[f.kind].filter((s) => !isMonth || ["manual", "prior_year", "auto"].includes(s));
        return `<tr data-id="${f.id}" draggable="true" class="${f.is_hidden ? "is-hidden" : ""}">
          <td class="pptx-grip">⠿</td><td>Slide ${f.slide_no ?? "—"}</td>
          <td><input data-k="label" value="${pxEsc(f.label)}" ${f.is_hidden ? "disabled" : ""} /></td>
          <td><code>{{${pxEsc(f.code)}}}</code>${f.is_hidden ? ' <span class="pptx-pill warn">đã bỏ khỏi file</span>' : ""}</td>
          <td><select data-k="kind" ${f.is_hidden ? "disabled" : ""}>${Object.entries(PPTX_KINDS).map(([k, v]) => `<option value="${k}" ${f.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td>${f.kind === "auto" ? '<span class="pptx-pill muted-pill">● Tự động</span>' : `<label><input type="checkbox" data-k="required" ${f.required ? "checked" : ""} ${f.is_hidden ? "disabled" : ""} /> Bắt buộc</label>`}</td>
          <td>${f.kind === "auto" ? "" : `<input type="checkbox" data-k="carry_over" ${f.carry_over ? "checked" : ""} ${f.is_hidden ? "disabled" : ""} />`}</td>
          <td><select data-k="source" ${f.is_hidden ? "disabled" : ""}>${sources.map((s) => `<option value="${s}" ${f.source === s ? "selected" : ""}>${PPTX_SOURCES[s]}</option>`).join("")}</select></td></tr>`;
      })
      .join("")}</tbody></table></div></div>`;
}

let pptxFieldTimer = null;
function bindPptxTemplates() {
  const root = px("pptx-template-root");
  root.querySelectorAll(".pptx-tpl-card").forEach((c) =>
    c.addEventListener("click", () => {
      pptx.tplType = c.dataset.type;
      loadPptxTemplates().catch((e) => showToast(e.message));
    }),
  );
  px("pptx-upload-btn")?.addEventListener("click", () => px("pptx-template-input").click());
  const table = root.querySelector(".pptx-fields");
  if (!table) return;
  const collect = () =>
    [...table.querySelectorAll("tbody tr")].map((tr, i) => ({
      id: Number(tr.dataset.id),
      thu_tu: i,
      label: tr.querySelector('[data-k="label"]').value,
      kind: tr.querySelector('[data-k="kind"]').value,
      required: tr.querySelector('[data-k="required"]')?.checked ?? false,
      carry_over: tr.querySelector('[data-k="carry_over"]')?.checked ?? false,
      source: tr.querySelector('[data-k="source"]').value,
    }));
  const save = async (rerender) => {
    try {
      pptx.tpl = await api(`/api/report-templates/${pptx.tplType}/fields?${pxDept()}`, { method: "PUT", body: JSON.stringify({ fields: collect() }) });
      if (rerender) renderPptxTemplates();
    } catch (e) {
      showToast(e.message);
    }
  };
  table.addEventListener("change", (e) => save(e.target.dataset.k === "kind"));
  table.addEventListener("input", (e) => {
    if (e.target.dataset.k !== "label") return;
    clearTimeout(pptxFieldTimer);
    pptxFieldTimer = setTimeout(() => save(false), 600);
  });
  let drag = null;
  table.addEventListener("dragstart", (e) => (drag = e.target.closest("tr")));
  table.addEventListener("dragover", (e) => e.preventDefault());
  table.addEventListener("drop", (e) => {
    const to = e.target.closest("tr");
    if (!drag || !to || to === drag) return;
    e.preventDefault();
    to.parentNode.insertBefore(drag, to);
    drag = null;
    save(false);
  });
}

px("pptx-template-input")?.addEventListener("change", async () => {
  const input = px("pptx-template-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const url = `/api/report-templates/${pptx.tplType}/upload?${pxDept()}&file_name=${encodeURIComponent(file.name)}`;
    const dry = await uploadPptxRaw(`${url}&dry_run=1`, buf);
    pptx.pendingUpload = { url, buf, file };
    if (!dry.summary.replacing) return applyPptxUpload();
    const li = (arr) => (arr.length ? arr.map((c) => `<code>{{${pxEsc(c)}}}</code>`).join(" ") : '<span class="muted">không có</span>');
    px("pptx-diff-dialog").dataset.mode = "diff";
    px("pptx-diff-dialog").querySelector("h2").textContent = "Thay file mẫu";
    px("pptx-diff-dialog").querySelector('button[type="submit"]').hidden = false;
    px("pptx-diff-intro").textContent = `File mới: ${file.name} · ${dry.summary.slide_count} slide · ${dry.summary.code_count} mã. Báo lại trước khi áp dụng:`;
    px("pptx-diff-body").innerHTML = `<p><b>Mã giữ nguyên (${dry.diff.kept.length}):</b> dữ liệu các kỳ giữ nguyên.<br/>${li(dry.diff.kept)}</p>
      <p><b>Mã mới (${dry.diff.added.length}):</b> thêm đầu mục mới, các kỳ cũ để trống.<br/>${li(dry.diff.added)}</p>
      <p><b>Mã bị bỏ (${dry.diff.removed.length}):</b> ẩn đầu mục, không xóa dữ liệu.<br/>${li(dry.diff.removed)}</p>
      <p class="muted">Báo cáo đã xuất của các kỳ trước không bị ảnh hưởng.</p>`;
    px("pptx-diff-dialog").showModal();
  } catch (e) {
    showToast(e.message);
  }
});
async function uploadPptxRaw(url, buf) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: buf });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Lỗi ${res.status}`);
  return body;
}
async function applyPptxUpload() {
  const p = pptx.pendingUpload;
  if (!p) return;
  try {
    const r = await uploadPptxRaw(p.url, p.buf);
    pptx.pendingUpload = null;
    await loadPptxTemplates();
    showToast(`Đã tải mẫu: ${r.summary.slide_count} slide, ${r.summary.code_count} mã.`, "success");
  } catch (e) {
    showToast(e.message);
  }
}
px("pptx-diff-cancel")?.addEventListener("click", () => px("pptx-diff-dialog").close());
px("pptx-diff-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (px("pptx-diff-dialog").dataset.mode === "diff") {
    px("pptx-diff-dialog").close();
    await applyPptxUpload();
  } else px("pptx-diff-dialog").close();
});

// Nút tải file (mẫu/phiên bản đã xuất): điều hướng tới URL tải về.
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-href]");
  if (b && b.closest("#summary-plan-tab-pptx, #pptx-diff-dialog")) window.location.href = b.dataset.href;
});

// ---- Hộp thoại Chia sẻ báo cáo (theo từng người hoặc cả phòng) ----
async function openPptxShareDialog() {
  const rep = pptx.report;
  px("pptx-share-title").textContent = `Chia sẻ ${rep.label}`;
  px("pptx-share-search").value = "";
  px("pptx-share-results").innerHTML = '<span class="muted">Gõ tên hoặc tài khoản để tìm người.</span>';
  const depts = (state.departments ?? []).filter((d) => d.id !== rep.department_id);
  px("pptx-share-dept").innerHTML = '<option value="">— Chọn phòng ban —</option>' + depts.map((d) => `<option value="${d.id}">${pxEsc(d.name)}</option>`).join("");
  px("pptx-share-dialog").showModal();
  await renderPptxShareList();
}
async function renderPptxShareList() {
  try {
    const shares = await api(`/api/reports/${pptx.report.id}/shares`);
    pptx.report.share_count = shares.length;
    const btn = px("pptx-share-btn");
    if (btn) btn.textContent = `👥 Chia sẻ${shares.length ? ` (${shares.length})` : ""}`;
    px("pptx-share-list").innerHTML = shares.length
      ? shares
          .map((s) => `<div class="pptx-item"><span style="flex:1"><b>${pxEsc(s.type === "department" ? "Cả phòng: " + (s.department_name ?? "") : s.user_name ?? "")}</b>${s.type === "user" && s.user_department ? ` <span class="muted">· ${pxEsc(s.user_department)}</span>` : ""}<br/><span class="muted" style="font-size:.78rem">Chia sẻ bởi ${pxEsc(s.shared_by ?? "—")} · ${pxDateTime(s.created_at)}</span></span><button type="button" class="small btn-delete" data-share-del="${s.id}">Thu hồi</button></div>`)
          .join("")
      : '<p class="muted">Chưa chia sẻ cho ai.</p>';
  } catch (e) {
    showToast(e.message);
  }
}
let pxShareTimer = null;
px("pptx-share-search")?.addEventListener("input", (e) => {
  clearTimeout(pxShareTimer);
  pxShareTimer = setTimeout(async () => {
    try {
      const users = await api(`/api/report-share-users?q=${encodeURIComponent(e.target.value.trim())}`);
      px("pptx-share-results").innerHTML = users.length
        ? users.map((u) => `<button type="button" class="pptx-share-user" data-uid="${u.id}"><b>${pxEsc(u.name || u.username)}</b><span class="muted"> · ${pxEsc(u.department_name ?? "Chưa gán phòng ban")}</span><span class="pptx-share-add">+ Chia sẻ</span></button>`).join("")
        : '<span class="muted">Không tìm thấy người phù hợp.</span>';
    } catch (err) {
      showToast(err.message);
    }
  }, 300);
});
px("pptx-share-dialog")?.addEventListener("click", async (e) => {
  const rep = pptx.report;
  const add = e.target.closest("[data-uid]");
  const del = e.target.closest("[data-share-del]");
  try {
    if (add) {
      await api(`/api/reports/${rep.id}/shares`, { method: "POST", body: JSON.stringify({ user_id: Number(add.dataset.uid) }) });
      showToast("Đã chia sẻ.", "success");
      await renderPptxShareList();
    } else if (del) {
      if (!(await confirmDialog("Thu hồi chia sẻ? Người này sẽ không xem được báo cáo nữa.", { title: "Thu hồi chia sẻ", okText: "Thu hồi" }))) return;
      await api(`/api/report-shares/${del.dataset.shareDel}`, { method: "DELETE" });
      await renderPptxShareList();
    } else if (e.target.id === "pptx-share-dept-btn") {
      const did = Number(px("pptx-share-dept").value);
      if (!did) return showToast("Hãy chọn phòng ban.");
      await api(`/api/reports/${rep.id}/shares`, { method: "POST", body: JSON.stringify({ department_id: did }) });
      showToast("Đã chia sẻ cho cả phòng.", "success");
      await renderPptxShareList();
    }
  } catch (err) {
    showToast(err.message);
  }
});
