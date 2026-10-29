// ---- Báo cáo - Thống kê > Yêu cầu tính năng / Toàn công ty ----
// Báo cáo tổng hợp toàn bộ Yêu cầu tính năng — tải riêng (KHÔNG dùng chung
// state.featureRequests của trang Yêu cầu tính năng) để vào thẳng trang Báo
// cáo vẫn có đủ số liệu, không bắt buộc phải ghé trang Yêu cầu tính năng
// trước. 2 tab con dùng CHUNG các hàm render* bên dưới (tham số prefix
// "rpfr"/"rpfrc" chọn đúng bộ id phần tử trong index.html), chỉ khác nguồn
// dữ liệu nạp vào:
// - "Yêu cầu tính năng" (rpfrAllRows, loadReportsFr): theo PHÒNG ĐANG XEM —
//   gọi API kèm deptParam() (bộ chuyển đổi phòng ban ở header).
// - "Toàn công ty" (rpfrcAllRows, loadReportsCompany): KHÔNG kèm deptParam()
//   — luôn gộp toàn bộ phạm vi người xem (Admin/phòng "xem full" = cả công
//   ty; vai trò bị giới hạn phạm vi vẫn chỉ ra đúng phòng mình do server tự
//   ép, không phải lỗi).
//
// 3 trạng thái THẬT (Chờ duyệt/Đã duyệt/Từ chối) — bản mẫu thiết kế dùng 5
// trạng thái nhưng hệ thống chỉ lưu 3, không bịa thêm trạng thái không tồn
// tại trong dữ liệu.
//
// Màu sắc dùng lại ĐÚNG bảng màu đã chốt ở khung thống kê trên trang Yêu
// cầu tính năng (xem FR_REPORT_STATUS_META/FR_REPORT_PRIORITY_META,
// 10-feature-requests.js) để toàn bộ app nhất quán 1 tông — không bịa bảng
// màu riêng cho trang báo cáo này.
const RPFR_STATUS_META = [
  { key: "Chờ duyệt", color: "#fcd9db" }, // red-200
  { key: "Đã duyệt", color: "#f2666e" }, // red-400 — hồng san hô, bớt gắt hơn đỏ tươi
  { key: "Từ chối", color: "#620915" }, // red-900 / maroon
];
const RPFR_PRIORITY_META = [
  { key: "Khẩn cấp", color: "#620915" },
  { key: "Cao", color: "#ee0033" },
  { key: "Trung bình", color: "#f9b3b7" },
  // "Thấp" vẽ NÉT ĐỨT (user yêu cầu kèm ảnh chụp màu) — dashed:true áp cho
  // cả đường trong biểu đồ lẫn ô màu legend (repeating-linear-gradient giả
  // nét đứt) để 2 nơi khớp nhau. Màu: đào nhạt (#fbe0c5, user gửi ảnh mẫu
  // sau khi thử xanh da trời — quay lại họ màu ấm như cũ).
  { key: "Thấp", color: "#fbe0c5", dashed: true },
];

let rpfrAllRows = null; // null = chưa tải lần nào — tab "Yêu cầu tính năng" (theo phòng đang xem)
let rpfrcAllRows = null; // tab "Toàn công ty" — KHÔNG lọc theo phòng đang xem (xem loadReportsCompany)

async function loadReportsFr() {
  rpfrAllRows = await api(`/api/feature-requests${deptParam("?")}`);
  populateRpfrFilters("rpfr", rpfrAllRows);
  renderReportsFr();
}

// Tab "Toàn công ty" — gọi API KHÔNG kèm deptParam() (bỏ qua hẳn bộ chuyển
// đổi phòng ban đang chọn ở header) + "all=1" để luôn ra đúng số liệu CẢ
// CÔNG TY thay vì của riêng 1 phòng đang xem như tab "Yêu cầu tính năng"
// cạnh nó. "all=1" là bắt buộc — không có nó, server coi "không gửi
// department_id" là trạng thái "chưa chọn phòng" (an toàn mặc định) và trả
// rỗng, xem comment ở listFeatureRequests (featureRequest.service.ts).
// Vai trò bị giới hạn phạm vi (Quy tắc 9.2) vẫn chỉ thấy đúng phòng mình —
// scope ép ở server, "all=1" chỉ có tác dụng khi scope.all=true (Admin/
// phòng "xem full"), không mở thêm quyền gì cho vai trò khác.
async function loadReportsCompany() {
  rpfrcAllRows = await api(`/api/feature-requests?all=1`);
  populateRpfrFilters("rpfrc", rpfrcAllRows);
  renderReportsCompany();
}

function populateRpfrFilters(prefix, allRows) {
  const yearSelect = document.getElementById(`${prefix}-filter-year`);
  const currentYear = yearSelect.value;
  const years = new Set(
    allRows.map((r) => (r.created_at ? Number(String(r.created_at).slice(0, 4)) : null)).filter(Boolean),
  );
  if (years.size === 0) years.add(new Date().getFullYear());
  const sortedYears = [...years].sort((a, b) => b - a);
  yearSelect.innerHTML =
    `<option value="">Tất cả các năm</option>` + sortedYears.map((y) => `<option value="${y}">Năm ${y}</option>`).join("");
  yearSelect.value = sortedYears.some((y) => String(y) === currentYear) ? currentYear : String(sortedYears[0]);

  const linhVucSelect = document.getElementById(`${prefix}-filter-linhvuc`);
  const currentLinhVuc = linhVucSelect.value;
  const linhVucSet = new Set(allRows.map((r) => r.linh_vuc).filter(Boolean));
  linhVucSelect.innerHTML =
    `<option value="">Tất cả lĩnh vực</option>` +
    [...linhVucSet].sort((a, b) => a.localeCompare(b)).map((v) => `<option value="${v}">${v}</option>`).join("");
  linhVucSelect.value = linhVucSet.has(currentLinhVuc) ? currentLinhVuc : "";
}

function rpfrFilteredRowsFor(prefix, allRows) {
  if (!allRows) return [];
  const year = document.getElementById(`${prefix}-filter-year`)?.value ?? "";
  const linhVuc = document.getElementById(`${prefix}-filter-linhvuc`)?.value ?? "";
  return allRows.filter((r) => {
    if (year && String(r.created_at ?? "").slice(0, 4) !== year) return false;
    if (linhVuc && r.linh_vuc !== linhVuc) return false;
    return true;
  });
}

// Giữ nguyên tên hàm cũ (dùng ở nút Xuất báo cáo của tab "Yêu cầu tính
// năng" bên dưới) — tương đương rpfrFilteredRowsFor("rpfr", rpfrAllRows).
function rpfrFilteredRows() {
  return rpfrFilteredRowsFor("rpfr", rpfrAllRows);
}

function renderReportsFr() {
  if (!rpfrAllRows) return;
  const rows = rpfrFilteredRowsFor("rpfr", rpfrAllRows);
  renderRpfrStatCards(rows, "rpfr");
  renderRpfrStatusDonut(rows, "rpfr");
  renderRpfrTrendChart(rows, "rpfr");
  renderRpfrQuyChart(rows, "rpfr");
  renderRpfrHeatmap(rows, "rpfr");
  renderRpfrHeThongList(rows, "rpfr-hethong-list");
  renderRpfrExchangeChart(rows);
}

// Tab "Toàn công ty" — cùng các khung số liệu CƠ BẢN với tab "Yêu cầu tính
// năng" (KPI/donut/xu hướng/theo quý/heatmap phòng ban) + thêm 2 khung xếp
// hạng theo phòng ban (Đơn vị đề xuất/Đơn vị thực hiện số hoá) chỉ thực sự
// có ý nghĩa ở góc nhìn toàn công ty — không có "Trao đổi yêu cầu với phòng
// ban khác" (biểu đồ đó so sánh 1 phòng với các phòng khác, không áp dụng
// khi xem gộp cả công ty).
function renderReportsCompany() {
  if (!rpfrcAllRows) return;
  const rows = rpfrFilteredRowsFor("rpfrc", rpfrcAllRows);
  renderRpfrStatCards(rows, "rpfrc");
  renderRpfrStatusDonut(rows, "rpfrc");
  renderRpfrTrendChart(rows, "rpfrc");
  renderRpfrQuyChart(rows, "rpfrc");
  renderRpfrSendRecvChart(rows, "rpfrc-sendrecv-wrap");
  renderRpfrHeThongList(rows, "rpfrc-hethong-list");
  renderRpfrDeptLollipop(rows, "rpfrc-donvi-dexuat-list", (r) => r.department_name);
  renderRpfrDeptRankList(rows, "rpfrc-donvi-thuchien-list", (r) => r.target_department_name);
}

function rpfrPct(n, total) {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

function renderRpfrStatCards(rows, prefix) {
  const total = rows.length;
  const deptSet = new Set(rows.map((r) => r.department_id).filter((id) => id != null));
  document.getElementById(`${prefix}-stat-total`).textContent = total;
  document.getElementById(`${prefix}-stat-total-sub`).textContent = `Từ ${deptSet.size} phòng ban`;

  const choDuyet = rows.filter((r) => r.trang_thai === "Chờ duyệt").length;
  const daDuyet = rows.filter((r) => r.trang_thai === "Đã duyệt").length;
  const uuTienCao = rows.filter((r) => r.do_uu_tien === "Cao" || r.do_uu_tien === "Khẩn cấp").length;

  document.getElementById(`${prefix}-stat-cho-duyet`).textContent = choDuyet;
  document.getElementById(`${prefix}-stat-cho-duyet-sub`).textContent = `${rpfrPct(choDuyet, total)} tổng số`;
  document.getElementById(`${prefix}-stat-da-duyet`).textContent = daDuyet;
  document.getElementById(`${prefix}-stat-da-duyet-sub`).textContent = `${rpfrPct(daDuyet, total)} tổng số`;
  document.getElementById(`${prefix}-stat-uu-tien-cao`).textContent = uuTienCao;
  document.getElementById(`${prefix}-stat-uu-tien-cao-sub`).textContent = `${rpfrPct(uuTienCao, total)} tổng số`;
}

// Donut trạng thái — tương tự renderHomeTaskStatCard (08-home.js) nhưng
// tách riêng (khác bộ dữ liệu/màu, không dùng chung hàm được).
// Donut — dùng lại NGUYÊN style + hiệu ứng hover "phình ra" + tooltip bám
// chuột của donut Trang chủ (renderHomeTaskStatCard, 08-home.js): cùng
// class .home-donut-* (CSS đã có sẵn, không viết lại), cùng cách tính toạ
// độ --tx/--ty để cung phình ra đúng hướng tâm khi hover.
function renderRpfrStatusDonut(rows, prefix) {
  const wrap = document.getElementById(`${prefix}-donut-wrap`);
  const total = rows.length;
  if (total === 0) {
    wrap.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const size = 160, cx = size / 2, cy = size / 2, outerR = 71, innerR = 42, popDistance = 7;
  const data = RPFR_STATUS_META.map((m) => ({ ...m, count: rows.filter((r) => r.trang_thai === m.key).length })).filter(
    (d) => d.count > 0,
  );

  let angle = 0;
  let wedges = "";
  data.forEach((d) => {
    const frac = d.count / total;
    const a0 = angle;
    const a1 = angle + Math.min(frac * 2 * Math.PI, 2 * Math.PI - 0.001);
    const largeArc = a1 - a0 > Math.PI ? 1 : 0;
    const xo0 = cx + outerR * Math.sin(a0), yo0 = cy - outerR * Math.cos(a0);
    const xo1 = cx + outerR * Math.sin(a1), yo1 = cy - outerR * Math.cos(a1);
    const xi1 = cx + innerR * Math.sin(a1), yi1 = cy - innerR * Math.cos(a1);
    const xi0 = cx + innerR * Math.sin(a0), yi0 = cy - innerR * Math.cos(a0);
    const d0 = `M${xo0.toFixed(1)},${yo0.toFixed(1)} A${outerR},${outerR} 0 ${largeArc} 1 ${xo1.toFixed(1)},${yo1.toFixed(1)} L${xi1.toFixed(1)},${yi1.toFixed(1)} A${innerR},${innerR} 0 ${largeArc} 0 ${xi0.toFixed(1)},${yi0.toFixed(1)} Z`;

    const mid = (a0 + a1) / 2;
    const tx = (Math.sin(mid) * popDistance).toFixed(1);
    const ty = (-Math.cos(mid) * popDistance).toFixed(1);
    wedges += `<path class="home-donut-wedge" d="${d0}" fill="${d.color}" style="--tx:${tx}px;--ty:${ty}px" data-status="${d.key}" data-value="${d.count}" data-color="${d.color}" />`;
    angle = a1;
  });

  const legend = RPFR_STATUS_META.map((m) => {
    const count = rows.filter((r) => r.trang_thai === m.key).length;
    return `
    <div class="fr-stat-list-row">
      <span class="fr-stat-list-label"><span class="fr-stat-dot" style="background:${m.color}"></span>${m.key}</span>
      <span class="fr-stat-list-count" style="min-width:auto">${count}</span>
    </div>`;
  }).join("");

  wrap.innerHTML = `
    <div class="rpfr-donut-row">
      <div class="home-donut-wrap" style="width:${size}px;height:${size}px;margin:0">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" overflow="visible">${wedges}</svg>
        <div class="home-donut-center"><div class="big">${total}</div><div class="small">Yêu cầu</div></div>
        <div class="home-donut-tooltip" id="${prefix}-donut-tooltip">
          <div class="home-donut-tooltip-row">
            <span class="home-donut-tooltip-dot"></span>
            <span class="home-donut-tooltip-label"></span>
            <span class="home-donut-tooltip-value"></span>
          </div>
        </div>
      </div>
      <div class="rpfr-donut-legend">${legend}</div>
    </div>`;

  const donutWrapEl = wrap.querySelector(".home-donut-wrap");
  const tooltipEl = document.getElementById(`${prefix}-donut-tooltip`);
  const dotEl = tooltipEl.querySelector(".home-donut-tooltip-dot");
  const labelEl = tooltipEl.querySelector(".home-donut-tooltip-label");
  const valueEl = tooltipEl.querySelector(".home-donut-tooltip-value");

  function positionTooltip(clientX, clientY) {
    const rect = donutWrapEl.getBoundingClientRect();
    tooltipEl.style.left = `${clientX - rect.left + 14}px`;
    tooltipEl.style.top = `${clientY - rect.top - 12}px`;
  }

  wrap.querySelectorAll(".home-donut-wedge").forEach((wedge) => {
    wedge.addEventListener("mouseenter", (e) => {
      dotEl.style.background = wedge.dataset.color;
      labelEl.textContent = wedge.dataset.status;
      valueEl.textContent = wedge.dataset.value;
      tooltipEl.style.borderColor = wedge.dataset.color;
      tooltipEl.classList.add("visible");
      positionTooltip(e.clientX, e.clientY);
    });
    wedge.addEventListener("mousemove", (e) => positionTooltip(e.clientX, e.clientY));
    wedge.addEventListener("mouseleave", () => tooltipEl.classList.remove("visible"));
  });
}

// Xu hướng tiếp nhận và độ ưu tiên — 12 tháng của năm đang lọc (hoặc năm
// gần nhất có dữ liệu nếu đang "Tất cả các năm"), MỖI MỨC ƯU TIÊN 1 đường
// riêng (đếm theo created_at + do_uu_tien) — khớp đúng ý nghĩa "tiếp nhận"
// (không phải "hoàn thành" suy diễn qua updated_at như trước, do_uu_tien
// là trường thật lưu sẵn). Dùng lại ĐÚNG màu RPFR_PRIORITY_META.
function renderRpfrTrendChart(rows, prefix) {
  const yearFilter = document.getElementById(`${prefix}-filter-year`)?.value;
  const year = yearFilter || (rows[0] ? Number(String(rows[0].created_at).slice(0, 4)) : new Date().getFullYear());
  document.getElementById(`${prefix}-trend-sub`).textContent = `Số yêu cầu theo tháng, năm ${year}`;

  document.getElementById(`${prefix}-trend-legend`).innerHTML = RPFR_PRIORITY_META.map(
    (m) =>
      `<span class="rpfr-trend-legend-item"><span class="rpfr-trend-swatch" style="${
        m.dashed
          ? `background:repeating-linear-gradient(90deg,${m.color} 0 4px,transparent 4px 7px)`
          : `background:${m.color}`
      }"></span>${m.key}</span>`,
  ).join("");

  const seriesByPriority = new Map(RPFR_PRIORITY_META.map((m) => [m.key, new Array(12).fill(0)]));
  rows.forEach((r) => {
    if (!r.created_at || String(r.created_at).slice(0, 4) !== String(year)) return;
    const m = Number(String(r.created_at).slice(5, 7)) - 1;
    if (m < 0 || m > 11) return;
    const series = seriesByPriority.get(r.do_uu_tien);
    if (series) series[m] += 1;
  });

  const w = 640, h = 220, padL = 26, padB = 22, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const allValues = [...seriesByPriority.values()].flat();
  const maxVal = Math.max(1, ...allValues);
  const yMax = Math.max(2, Math.ceil(maxVal / 2) * 2);
  const xStep = plotW / 11;
  const xAt = (i) => padL + xStep * i;
  const yAt = (v) => padT + plotH - (v / yMax) * plotH;

  let gridSvg = "", yLabels = "";
  for (let s = 0; s <= 4; s++) {
    const v = (yMax / 4) * s;
    const y = yAt(v);
    gridSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
    yLabels += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" font-size="11" fill="var(--muted)" text-anchor="end">${Math.round(v)}</text>`;
  }

  const linesSvg = RPFR_PRIORITY_META.map((m) => {
    const pts = seriesByPriority.get(m.key).map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" L ");
    return `<path d="M ${pts}" fill="none" stroke="${m.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${
      m.dashed ? ' stroke-dasharray="7 5"' : ""
    }/>`;
  }).join("");

  let xLabels = "";
  for (let i = 0; i < 12; i++) {
    xLabels += `<text x="${xAt(i).toFixed(1)}" y="${h - 4}" font-size="11" fill="var(--muted)" text-anchor="middle">T${i + 1}</text>`;
  }

  document.getElementById(`${prefix}-trend-chart`).innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" preserveAspectRatio="xMidYMid meet">
      ${gridSvg}${yLabels}
      ${linesSvg}
      ${xLabels}
    </svg>`;
}

// Theo quý thực hiện — cột dọc, mỗi cột dồn theo mức ưu tiên (giống cách
// gom dữ liệu renderFeatureRequestStats() ở 10-feature-requests.js, viết
// lại riêng vì khác kiểu hiển thị — cột dọc thay vì danh sách thanh ngang).
function renderRpfrQuyChart(rows, prefix) {
  document.getElementById(`${prefix}-quy-legend`).innerHTML = RPFR_PRIORITY_META.map(
    (m) => `<span class="fr-legend-item"><span class="fr-stat-dot" style="background:${m.color}"></span>${m.key}</span>`,
  ).join("");

  const quyMap = new Map();
  rows.forEach((r) => {
    const quy = frQuarterOf(r.thoi_gian_mong_muon) || "Chưa xếp";
    if (!quyMap.has(quy)) quyMap.set(quy, {});
    const bucket = quyMap.get(quy);
    bucket[r.do_uu_tien] = (bucket[r.do_uu_tien] ?? 0) + 1;
  });
  const entries = [...quyMap.entries()].sort((a, b) => {
    if (a[0] === "Chưa xếp") return 1;
    if (b[0] === "Chưa xếp") return -1;
    const [qa, ya] = a[0].split("/");
    const [qb, yb] = b[0].split("/");
    if (ya !== yb) return Number(ya) - Number(yb);
    return FR_QUARTER_LABELS.indexOf(qa) - FR_QUARTER_LABELS.indexOf(qb);
  });
  const el = document.getElementById(`${prefix}-quy-chart`);
  if (entries.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const totals = entries.map(([, b]) => Object.values(b).reduce((a, c) => a + c, 0));
  const maxTotal = Math.max(...totals);
  el.innerHTML = `<div class="rpfr-vbar-row"><div class="rpfr-vbar-inner"><div class="rpfr-vbar-axis"></div>${entries
    .map(([quy, bucket]) => {
      const total = Object.values(bucket).reduce((a, c) => a + c, 0);
      const stackHeight = maxTotal ? Math.max(6, (total / maxTotal) * 160) : 0;
      const segments = RPFR_PRIORITY_META.filter((m) => bucket[m.key])
        .map((m) => `<span style="flex:${bucket[m.key]};background:${m.color}" title="${m.key}: ${bucket[m.key]}"></span>`)
        .join("");
      return `
      <div class="rpfr-vbar-col">
        <div class="rpfr-vbar-value">${total}</div>
        <div class="rpfr-vbar-stack" style="height:${stackHeight}px">${segments}</div>
        <div class="rpfr-vbar-label">${quy}</div>
      </div>`;
    })
    .join("")}</div></div>`;
}

// Phòng ban × trạng thái — bảng nhiệt, màu đậm dần theo giá trị (5 bậc,
// khớp chú giải "Ít -> Nhiều" trong tiêu đề khung).
const RPFR_HEAT_TIERS = ["#faf5f2", "#fcd9db", "#f9b3b7", "#ee0033", "#620915"];
function rpfrHeatTier(value, max) {
  if (value === 0 || max === 0) return 0;
  return Math.min(4, Math.ceil((value / max) * 4));
}
function renderRpfrHeatmap(rows, prefix) {
  const wrap = document.getElementById(`${prefix}-heatmap-wrap`);
  if (rows.length === 0) {
    wrap.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const deptMap = new Map();
  rows.forEach((r) => {
    const name = r.department_name || "—";
    if (!deptMap.has(name)) deptMap.set(name, { "Chờ duyệt": 0, "Đã duyệt": 0, "Từ chối": 0 });
    deptMap.get(name)[r.trang_thai] = (deptMap.get(name)[r.trang_thai] ?? 0) + 1;
  });
  const deptEntries = [...deptMap.entries()]
    .map(([name, counts]) => [name, counts, Object.values(counts).reduce((a, c) => a + c, 0)])
    .sort((a, b) => b[2] - a[2]);
  const maxCell = Math.max(1, ...deptEntries.flatMap(([, counts]) => Object.values(counts)));

  wrap.innerHTML = `
    <table class="rpfr-heat-table">
      <thead>
        <tr><th>Phòng ban</th>${RPFR_STATUS_META.map((m) => `<th>${m.key}</th>`).join("")}<th>Tổng</th></tr>
      </thead>
      <tbody>
        ${deptEntries
          .map(
            ([name, counts, total]) => `
        <tr>
          <td class="rpfr-heat-rowlabel">${name}</td>
          ${RPFR_STATUS_META.map((m) => {
            const v = counts[m.key] ?? 0;
            const tier = rpfrHeatTier(v, maxCell);
            return `<td class="${tier >= 3 ? "rpfr-heat-dark" : ""}" style="background:${RPFR_HEAT_TIERS[tier]}">${v}</td>`;
          }).join("")}
          <td class="rpfr-heat-total">${total}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

// Gửi / nhận yêu cầu theo phòng ban — tab "Yêu cầu tính năng CT" (user yêu
// cầu đổi từ heatmap "Phòng ban × trạng thái" sang chart này, chỉ ở tab
// công ty — tab "Yêu cầu tính năng PB" vẫn giữ nguyên heatmap). "Đã gửi"
// = đếm theo department_id (phòng đề xuất), "Tiếp nhận" = đếm theo
// target_department_id (phòng đích) — mỗi phòng ban 1 nhóm 2 thanh, dùng
// CHUNG 1 thang đo (max chung) để so sánh trực quan giữa các phòng. Màu
// hồng san hô/xanh da trời theo ảnh mẫu user gửi — giữ HẰNG SỐ RIÊNG (không
// gộp chung với RPFR_EXCHANGE_SENT_COLOR/RECV_COLOR của "Trao đổi yêu cầu
// với phòng ban khác", dù hiện trùng giá trị) vì 2 chart độc lập nhau — user
// từng chỉ đổi màu đúng 1 trong 2 chart ở các yêu cầu trước, tách hằng số
// để lần sau chỉ cần sửa đúng 1 chỗ không ảnh hưởng chart còn lại.
const RPFR_SENDRECV_SENT_COLOR = "#f2666e"; // hồng san hô
const RPFR_SENDRECV_RECV_COLOR = "#7dd3fc"; // xanh da trời (--sky-300)

function renderRpfrSendRecvChart(rows, elId) {
  const el = document.getElementById(elId);
  const sentMap = new Map();
  const recvMap = new Map();
  rows.forEach((r) => {
    if (r.department_id != null) {
      const name = r.department_name || "—";
      sentMap.set(name, (sentMap.get(name) ?? 0) + 1);
    }
    if (r.target_department_id != null) {
      const name = r.target_department_name || "—";
      recvMap.set(name, (recvMap.get(name) ?? 0) + 1);
    }
  });

  const deptNames = [...new Set([...sentMap.keys(), ...recvMap.keys()])].sort((a, b) => {
    const totalA = (sentMap.get(a) ?? 0) + (recvMap.get(a) ?? 0);
    const totalB = (sentMap.get(b) ?? 0) + (recvMap.get(b) ?? 0);
    return totalB - totalA;
  });
  if (deptNames.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }

  const max = Math.max(1, ...deptNames.map((n) => Math.max(sentMap.get(n) ?? 0, recvMap.get(n) ?? 0)));
  function barRow(label, value, color) {
    const remain = max - value;
    return `
      <div class="fr-bar-row">
        <span class="fr-bar-label">${label}</span>
        <span class="fr-bar-track">
          <span class="fr-bar-fill" style="flex:${value};background:${color}"></span>
          ${remain > 0 ? `<span class="fr-bar-remain" style="flex:${remain}"></span>` : ""}
        </span>
        <span class="fr-bar-value">${value}</span>
      </div>`;
  }

  el.innerHTML = deptNames
    .map(
      (name) => `
    <div class="rpfr-sendrecv-group">
      <div class="rpfr-sendrecv-dept">${name}</div>
      ${barRow("Đã gửi", sentMap.get(name) ?? 0, RPFR_SENDRECV_SENT_COLOR)}
      ${barRow("Tiếp nhận", recvMap.get(name) ?? 0, RPFR_SENDRECV_RECV_COLOR)}
    </div>`,
    )
    .join("");
}

// Nội suy tuyến tính giữa 2 màu hex theo t (0 = colorA, 1 = colorB).
function rpfrLerpColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

// Biểu đồ cột ngang dùng cho "Hệ thống cần cải tiến" — tái dùng NGUYÊN class
// .fr-bar-* (đã có sẵn ở khung thống kê trên trang Yêu cầu tính năng,
// 10-feature-requests.js: label + track 2 khối fill/remain có khoảng cách +
// value) để nhất quán kiểu "danh sách xếp hạng dạng thanh ngang" trong toàn
// app. Mỗi thanh 1 màu RIÊNG, nội suy từ colorDark (giá trị lớn nhất) ->
// colorLight (giá trị nhỏ nhất) theo đúng yêu cầu user (đậm -> nhạt theo thứ
// hạng), không phải 1 màu cố định cho mọi thanh.
function rpfrHBarChartHtml(entries, colorDark, colorLight) {
  if (entries.length === 0) return `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
  const max = entries[0][1];
  return entries
    .map(([name, count]) => {
      const remain = max - count;
      const t = max ? 1 - count / max : 0;
      const color = rpfrLerpColor(colorDark, colorLight, t);
      return `
    <div class="fr-bar-row">
      <span class="fr-bar-label" title="${name}">${name}</span>
      <span class="fr-bar-track">
        <span class="fr-bar-fill" style="flex:${count};background:${color}"></span>
        ${remain > 0 ? `<span class="fr-bar-remain" style="flex:${remain}"></span>` : ""}
      </span>
      <span class="fr-bar-value">${count}</span>
    </div>`;
    })
    .join("");
}

// Hệ thống cần cải tiến — sắp giảm dần theo số lượng.
function renderRpfrHeThongList(rows, elId) {
  const el = document.getElementById(elId);
  const counts = new Map();
  rows.forEach((r) => {
    const key = r.he_thong?.trim() || "Chưa có hệ thống";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.innerHTML = rpfrHBarChartHtml(entries, "#0284c7", "#7dd3fc"); // xanh đậm nhất theo ảnh mẫu -> xanh da trời (--sky-600/300)
}

// Xếp hạng theo phòng ban (dùng ở tab "Toàn công ty"): "Đơn vị đề xuất"
// (keyOf = department_name, phòng nào gửi nhiều yêu cầu nhất) và "Đơn vị
// thực hiện số hoá" (keyOf = target_department_name, phòng nào tiếp nhận
// nhiều nhất) — cùng kiểu thanh ngang đậm->nhạt như "Hệ thống cần cải
// tiến" ở trên, chỉ khác nguồn gộp dữ liệu.
function renderRpfrDeptRankList(rows, elId, keyOf) {
  const el = document.getElementById(elId);
  const counts = new Map();
  rows.forEach((r) => {
    const key = keyOf(r)?.trim() || "Chưa xác định";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.innerHTML = rpfrHBarChartHtml(entries, "#ee0033", "#fcd9db"); // đỏ đậm -> đỏ nhạt
}

// Xếp hạng theo phòng ban — chấm tròn hồng san hô tại mỗi giá trị, nối bằng
// 1 đường cong XANH DA TRỜI mềm mại đi qua các chấm (user yêu cầu; KHÔNG
// còn que/thân thẳng xuống trục như bản lollipop ban đầu — user yêu cầu bỏ,
// chỉ còn đường cong + chấm). Dựng bằng SVG (toạ độ xAt/yAt cố định theo
// index, giống cách làm renderRpfrTrendChart/renderRpfrExchangeChart ở
// trên) thay vì layout flex/div: đường nối cần toạ độ tâm chấm CHÍNH XÁC
// theo pixel, mà bề ngang mỗi cột flex/div lại co giãn theo độ dài nhãn
// (không đều nhau) — không thể vẽ 1 đường chính xác nối các tâm chấm nếu
// không đo DOM bằng JS; dựng bằng SVG với khoảng cách cột CỐ ĐỊNH giải
// quyết gọn vấn đề này. Đường cong qua rpfrSmoothPath() (Catmull-Rom ->
// Bézier, xem hàm bên dưới).
// Chuyển 1 dãy điểm [x,y] thành path SVG cong MỀM MẠI đi qua đúng từng điểm
// (không chỉ nối thẳng "L") — thuật toán Catmull-Rom chuyển sang Bézier bậc
// 3 chuẩn (mỗi đoạn dùng 2 điểm kế cận làm tiếp tuyến), dùng cho đường nối
// ở "Theo đơn vị đề xuất" (user yêu cầu, có gửi ảnh mẫu dạng sóng mượt).
function rpfrSmoothPath(points) {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function renderRpfrDeptLollipop(rows, elId, keyOf) {
  const el = document.getElementById(elId);
  const counts = new Map();
  rows.forEach((r) => {
    const key = keyOf(r)?.trim() || "Chưa xác định";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }

  const DOT_COLOR = "#f2666e"; // hồng san hô (--red-400) — theo ảnh mẫu
  const LINE_COLOR = "#7dd3fc"; // xanh da trời (--sky-300) — theo ảnh mẫu
  const DOT_R = 2.5; // giảm 1 nửa theo yêu cầu (trước: 5)

  const n = entries.length;
  const colWidth = 110; // nới rộng khoảng cách giữa các điểm (user yêu cầu)
  const w = Math.max(320, 60 + colWidth * n), h = 220, padL = 30, padR = 30, padT = 24, padB = 34;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = Math.max(1, ...entries.map(([, c]) => c));
  const yMax = Math.max(2, Math.ceil(maxVal / 2) * 2);
  const xAt = (i) => (n === 1 ? padL + plotW / 2 : padL + (plotW / (n - 1)) * i);
  const yAt = (v) => padT + plotH - (v / yMax) * plotH;
  const baseY = yAt(0);

  let dots = "", xLabels = "", valueLabels = "";
  const pathPts = entries.map(([name, count], i) => {
    const x = xAt(i), y = yAt(count);
    valueLabels += `<text x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--text)" text-anchor="middle">${count}</text>`;
    const label = name.length > 10 ? `${name.slice(0, 9)}…` : name;
    // "…title" title mặc định của trình duyệt xấu/thô — bỏ, thay bằng
    // tooltip tự dựng bám chuột (dùng lại NGUYÊN class .home-donut-tooltip*
    // đã có sẵn ở donut "Theo trạng thái", xem phần wire event bên dưới).
    xLabels += `<text x="${x.toFixed(1)}" y="${h - padB + 18}" font-size="11" fill="var(--muted)" text-anchor="middle">${label}<title>${name}</title></text>`;
    // Chấm nhỏ (DOT_R=2.5) chỉ để NHÌN — thêm 1 vòng tròn trong suốt lớn hơn
    // hẳn (r=10) phủ lên trên để dễ hover/chạm đúng (target 2.5px quá nhỏ
    // để bắt sự kiện chuột chính xác), đây mới là phần tử gắn tooltip.
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${DOT_R}" fill="${DOT_COLOR}" pointer-events="none"/><circle class="rpfr-dept-dot" data-name="${name}" data-value="${count}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="transparent"/>`;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const smoothD = rpfrSmoothPath(pathPts);
  const linePath = `<path d="${smoothD}" fill="none" stroke="${LINE_COLOR}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  // Tô gradient khoảng trắng giữa đường line và trục X (user gửi ảnh mẫu
  // dạng area chart mờ dần) — khép path cong lại thành 1 vùng kín (xuống
  // trục ở điểm cuối, về điểm đầu ở trục, đóng path) rồi tô bằng gradient
  // nhạt dần từ màu line ở trên xuống trong suốt ở đáy (chạm trục X).
  const firstX = pathPts[0][0], lastX = pathPts[pathPts.length - 1][0];
  const areaPath = `${smoothD} L${lastX},${baseY.toFixed(1)} L${firstX},${baseY.toFixed(1)} Z`;
  const gradId = `rpfr-dept-line-grad-${elId}`;
  const tooltipId = `rpfr-dept-line-tooltip-${elId}`;

  el.innerHTML = `
    <div style="position:relative">
      <div style="overflow-x:auto">
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" preserveAspectRatio="xMidYMid meet" style="min-width:${w}px">
          <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${LINE_COLOR}" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="${LINE_COLOR}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${w - padR}" y2="${baseY.toFixed(1)}" stroke="var(--stone-400)" stroke-width="2"/>
          <path d="${areaPath}" fill="url(#${gradId})" stroke="none"/>
          ${linePath}
          ${dots}
          ${valueLabels}
          ${xLabels}
        </svg>
      </div>
      <div class="home-donut-tooltip" id="${tooltipId}">
        <div class="home-donut-tooltip-row">
          <span class="home-donut-tooltip-dot" style="background:${DOT_COLOR}"></span>
          <span class="home-donut-tooltip-label"></span>
          <span class="home-donut-tooltip-value"></span>
        </div>
      </div>
    </div>`;

  // Tooltip bám chuột — cùng cơ chế positionTooltip đã dùng ở donut "Theo
  // trạng thái" (renderRpfrStatusDonut): toạ độ TÍNH LẠI theo bounding rect
  // của wrap (position:relative) mỗi lần di chuột, nên vẫn đúng dù panel
  // đang cuộn ngang (overflow-x:auto) hay chưa.
  const wrapEl = el.querySelector("div");
  const tooltipEl = document.getElementById(tooltipId);
  const labelEl = tooltipEl.querySelector(".home-donut-tooltip-label");
  const valueEl = tooltipEl.querySelector(".home-donut-tooltip-value");
  function positionTooltip(clientX, clientY) {
    const rect = wrapEl.getBoundingClientRect();
    tooltipEl.style.left = `${clientX - rect.left + 14}px`;
    tooltipEl.style.top = `${clientY - rect.top - 12}px`;
  }
  el.querySelectorAll(".rpfr-dept-dot").forEach((dot) => {
    dot.addEventListener("mouseenter", (e) => {
      labelEl.textContent = dot.dataset.name;
      valueEl.textContent = dot.dataset.value;
      tooltipEl.classList.add("visible");
      positionTooltip(e.clientX, e.clientY);
    });
    dot.addEventListener("mousemove", (e) => positionTooltip(e.clientX, e.clientY));
    dot.addEventListener("mouseleave", () => tooltipEl.classList.remove("visible"));
  });
}

// Trao đổi yêu cầu với phòng ban khác — biểu đồ XU HƯỚNG (2 đường: Đã
// gửi/Nhận về, mỗi mốc trên trục X là 1 phòng ban khác, sắp giảm dần theo
// tổng trao đổi) thay cho cột nhóm trước đây (user yêu cầu đổi dạng) — dựng
// theo đúng kiểu đường + chấm tròn tại mỗi điểm đã dùng ở "Xu hướng tiếp
// nhận và độ ưu tiên" (renderRpfrTrendChart) phía trên, chỉ khác trục X là
// danh mục phòng ban (rời rạc) thay vì tháng (liên tục theo thời gian).
// Màu: hồng sen (Đã gửi) / xanh dương (Nhận về) theo yêu cầu user — xem
// RPFR_EXCHANGE_SENT_COLOR/RECV_COLOR, khớp đúng 2 màu swatch legend cố
// định ở index.html.
//
// "Đã gửi" = rows có department_id = phòng đang xem, target khác phòng
// đang xem, gộp theo target_department_name.
// "Nhận về" = rows có target_department_id = phòng đang xem, department
// khác phòng đang xem, gộp theo department_name.
// rows (tham số) đã quét sẵn đúng 2 chiều này (listFeatureRequests lọc
// department_id=X OR target_department_id=X), chỉ cần phân loại lại.
const RPFR_EXCHANGE_SENT_COLOR = "#f2666e"; // hồng san hô (--red-400) — theo ảnh mẫu
const RPFR_EXCHANGE_RECV_COLOR = "#7dd3fc"; // xanh da trời (--sky-300) — theo ảnh mẫu

function renderRpfrExchangeChart(rows) {
  const el = document.getElementById("rpfr-exchange-chart");
  const currentDeptId = state.currentDepartmentId;
  const currentDept = state.departments.find((d) => d.id === currentDeptId);
  document.getElementById("rpfr-exchange-title").textContent = currentDept
    ? `Trao đổi yêu cầu giữa ${currentDept.name} và các phòng ban khác`
    : "Trao đổi yêu cầu với phòng ban khác";

  const sentMap = new Map();
  const receivedMap = new Map();
  rows.forEach((r) => {
    if (r.department_id === currentDeptId && r.target_department_id && r.target_department_id !== currentDeptId) {
      const name = r.target_department_name || "—";
      sentMap.set(name, (sentMap.get(name) ?? 0) + 1);
    }
    if (r.target_department_id === currentDeptId && r.department_id && r.department_id !== currentDeptId) {
      const name = r.department_name || "—";
      receivedMap.set(name, (receivedMap.get(name) ?? 0) + 1);
    }
  });

  const deptNames = [...new Set([...sentMap.keys(), ...receivedMap.keys()])].sort((a, b) => {
    const totalA = (sentMap.get(a) ?? 0) + (receivedMap.get(a) ?? 0);
    const totalB = (sentMap.get(b) ?? 0) + (receivedMap.get(b) ?? 0);
    return totalB - totalA;
  });

  if (deptNames.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có trao đổi yêu cầu với phòng ban khác.</p>`;
    return;
  }

  // Bề ngang CỐ ĐỊNH (680px) trước đây khiến nhãn phòng ban chồng lên nhau
  // khi có nhiều phòng (VD 9-10 phòng, user phản hồi "text tên các phòng
  // ban bị đè lên nhau") — đổi sang bề ngang CO GIÃN theo số phòng (giống
  // cách đã sửa ở "Theo đơn vị đề xuất"), bọc trong khung cuộn ngang khi
  // vượt quá bề rộng panel.
  const deptCount = deptNames.length;
  const colWidth = 90;
  const w = Math.max(360, 60 + colWidth * deptCount), h = 240, padL = 30, padB = 34, padT = 16, padR = 20;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = Math.max(1, ...deptNames.map((name) => Math.max(sentMap.get(name) ?? 0, receivedMap.get(name) ?? 0)));
  const yMax = Math.max(2, Math.ceil(maxVal / 2) * 2);
  // Chỉ 1 điểm thì không chia được bước trục X — ép tối thiểu 2 "khoang" để
  // điểm duy nhất không rơi đúng mép trái biểu đồ.
  const xStep = plotW / Math.max(1, deptNames.length - 1 || 1);
  const xAt = (i) => (deptNames.length === 1 ? padL + plotW / 2 : padL + xStep * i);
  const yAt = (v) => padT + plotH - (v / yMax) * plotH;

  // Số mốc trục Y không vượt quá yMax — yMax nhỏ (VD 2) mà vẫn chia 4 mốc
  // sẽ ra bước 0.5, làm tròn hiển thị trùng nhãn (VD "1","1" hoặc "2","2").
  const ySteps = Math.min(4, yMax);
  let gridSvg = "", yLabels = "";
  for (let s = 0; s <= ySteps; s++) {
    const v = (yMax / ySteps) * s;
    const y = yAt(v);
    gridSvg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
    yLabels += `<text x="${padL - 6}" y="${(y + 4).toFixed(1)}" font-size="11" fill="var(--muted)" text-anchor="end">${Math.round(v)}</text>`;
  }

  // Đường line MỀM MẠI (Catmull-Rom -> Bézier, rpfrSmoothPath()) thay vì nối
  // thẳng "L" (user yêu cầu) — giống cách đã làm ở "Theo đơn vị đề xuất".
  function lineAndDots(valueOf, color, kind) {
    const pts = deptNames.map((name, i) => [Number(xAt(i).toFixed(1)), Number(yAt(valueOf(name)).toFixed(1))]);
    const line = `<path d="${rpfrSmoothPath(pts)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const dots = deptNames
      .map((name, i) => {
        const v = valueOf(name);
        return `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="4" fill="${color}"><title>${name} — ${kind}: ${v}</title></circle>`;
      })
      .join("");
    return line + dots;
  }
  const sentSvg = lineAndDots((n) => sentMap.get(n) ?? 0, RPFR_EXCHANGE_SENT_COLOR, "Đã gửi");
  const recvSvg = lineAndDots((n) => receivedMap.get(n) ?? 0, RPFR_EXCHANGE_RECV_COLOR, "Nhận về");

  // Nhãn rút ngắn hơn trước (16 -> 10 ký tự) — khớp bề ngang mỗi cột hẹp
  // hơn khi nhiều phòng ban, tránh chữ tràn chồng lên cột cạnh bên.
  let xLabels = "";
  deptNames.forEach((name, i) => {
    const x = xAt(i);
    const label = name.length > 10 ? `${name.slice(0, 9)}…` : name;
    xLabels += `<text x="${x.toFixed(1)}" y="${h - padB + 16}" font-size="11" fill="var(--muted)" text-anchor="middle">${label}<title>${name}</title></text>`;
  });

  el.innerHTML = `
    <div style="overflow-x:auto">
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="240" preserveAspectRatio="xMidYMid meet" style="min-width:${w}px">
        ${gridSvg}${yLabels}
        ${sentSvg}${recvSvg}
        ${xLabels}
      </svg>
    </div>`;
}

document.getElementById("rpfr-filter-year")?.addEventListener("change", renderReportsFr);
document.getElementById("rpfr-filter-linhvuc")?.addEventListener("change", renderReportsFr);

// Xuất báo cáo — xuất ĐÚNG danh sách đang được lọc trên trang báo cáo này
// (năm + lĩnh vực), dùng lại route export sẵn có của Yêu cầu tính năng
// (featureRequest.controller.ts) — không cần route riêng.
document.getElementById("rpfr-export-btn")?.addEventListener("click", () => {
  const ids = rpfrFilteredRows().map((r) => r.id);
  if (ids.length === 0) {
    showToast("Không có dữ liệu để xuất.");
    return;
  }
  window.location.href = `/api/feature-requests/export?ids=${ids.join(",")}${deptParam()}`;
});

document.getElementById("rpfrc-filter-year")?.addEventListener("change", renderReportsCompany);
document.getElementById("rpfrc-filter-linhvuc")?.addEventListener("change", renderReportsCompany);

// Xuất báo cáo (tab "Toàn công ty") — KHÔNG kèm deptParam(), kèm "all=1"
// (giống loadReportsCompany) để server không ép lọc về đúng 1 phòng đang
// xem, xuất ĐÚNG danh sách toàn công ty đang lọc trên tab này.
document.getElementById("rpfrc-export-btn")?.addEventListener("click", () => {
  const ids = rpfrFilteredRowsFor("rpfrc", rpfrcAllRows).map((r) => r.id);
  if (ids.length === 0) {
    showToast("Không có dữ liệu để xuất.");
    return;
  }
  window.location.href = `/api/feature-requests/export?ids=${ids.join(",")}&all=1`;
});
