// ---- Báo cáo - Thống kê > Yêu cầu tính năng ----
// Báo cáo tổng hợp toàn bộ Yêu cầu tính năng gửi tới phòng đang xem — tải
// riêng (KHÔNG dùng chung state.featureRequests của trang Yêu cầu tính
// năng) để vào thẳng trang Báo cáo vẫn có đủ số liệu, không bắt buộc phải
// ghé trang Yêu cầu tính năng trước.
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

let rpfrAllRows = null; // null = chưa tải lần nào

async function loadReportsFr() {
  rpfrAllRows = await api(`/api/feature-requests${deptParam("?")}`);
  populateRpfrFilters();
  renderReportsFr();
}

function populateRpfrFilters() {
  const yearSelect = document.getElementById("rpfr-filter-year");
  const currentYear = yearSelect.value;
  const years = new Set(
    rpfrAllRows.map((r) => (r.created_at ? Number(String(r.created_at).slice(0, 4)) : null)).filter(Boolean),
  );
  if (years.size === 0) years.add(new Date().getFullYear());
  const sortedYears = [...years].sort((a, b) => b - a);
  yearSelect.innerHTML =
    `<option value="">Tất cả các năm</option>` + sortedYears.map((y) => `<option value="${y}">Năm ${y}</option>`).join("");
  yearSelect.value = sortedYears.some((y) => String(y) === currentYear) ? currentYear : String(sortedYears[0]);

  const linhVucSelect = document.getElementById("rpfr-filter-linhvuc");
  const currentLinhVuc = linhVucSelect.value;
  const linhVucSet = new Set(rpfrAllRows.map((r) => r.linh_vuc).filter(Boolean));
  linhVucSelect.innerHTML =
    `<option value="">Tất cả lĩnh vực</option>` +
    [...linhVucSet].sort((a, b) => a.localeCompare(b)).map((v) => `<option value="${v}">${v}</option>`).join("");
  linhVucSelect.value = linhVucSet.has(currentLinhVuc) ? currentLinhVuc : "";
}

function rpfrFilteredRows() {
  if (!rpfrAllRows) return [];
  const year = document.getElementById("rpfr-filter-year")?.value ?? "";
  const linhVuc = document.getElementById("rpfr-filter-linhvuc")?.value ?? "";
  return rpfrAllRows.filter((r) => {
    if (year && String(r.created_at ?? "").slice(0, 4) !== year) return false;
    if (linhVuc && r.linh_vuc !== linhVuc) return false;
    return true;
  });
}

function renderReportsFr() {
  if (!rpfrAllRows) return;
  const rows = rpfrFilteredRows();
  renderRpfrStatCards(rows);
  renderRpfrStatusDonut(rows);
  renderRpfrTrendChart(rows);
  renderRpfrQuyChart(rows);
  renderRpfrHeatmap(rows);
  renderRpfrTargetDeptList(rows);
  renderRpfrHeThongList(rows);
  renderRpfrExchangeChart(rows);
}

function rpfrPct(n, total) {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

function renderRpfrStatCards(rows) {
  const total = rows.length;
  const deptSet = new Set(rows.map((r) => r.department_id).filter((id) => id != null));
  document.getElementById("rpfr-stat-total").textContent = total;
  document.getElementById("rpfr-stat-total-sub").textContent = `Từ ${deptSet.size} phòng ban`;

  const choDuyet = rows.filter((r) => r.trang_thai === "Chờ duyệt").length;
  const daDuyet = rows.filter((r) => r.trang_thai === "Đã duyệt").length;
  const uuTienCao = rows.filter((r) => r.do_uu_tien === "Cao" || r.do_uu_tien === "Khẩn cấp").length;

  document.getElementById("rpfr-stat-cho-duyet").textContent = choDuyet;
  document.getElementById("rpfr-stat-cho-duyet-sub").textContent = `${rpfrPct(choDuyet, total)} tổng số`;
  document.getElementById("rpfr-stat-da-duyet").textContent = daDuyet;
  document.getElementById("rpfr-stat-da-duyet-sub").textContent = `${rpfrPct(daDuyet, total)} tổng số`;
  document.getElementById("rpfr-stat-uu-tien-cao").textContent = uuTienCao;
  document.getElementById("rpfr-stat-uu-tien-cao-sub").textContent = `${rpfrPct(uuTienCao, total)} tổng số`;
}

// Donut trạng thái — tương tự renderHomeTaskStatCard (08-home.js) nhưng
// tách riêng (khác bộ dữ liệu/màu, không dùng chung hàm được).
// Donut — dùng lại NGUYÊN style + hiệu ứng hover "phình ra" + tooltip bám
// chuột của donut Trang chủ (renderHomeTaskStatCard, 08-home.js): cùng
// class .home-donut-* (CSS đã có sẵn, không viết lại), cùng cách tính toạ
// độ --tx/--ty để cung phình ra đúng hướng tâm khi hover.
function renderRpfrStatusDonut(rows) {
  const wrap = document.getElementById("rpfr-donut-wrap");
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
        <div class="home-donut-tooltip" id="rpfr-donut-tooltip">
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
  const tooltipEl = document.getElementById("rpfr-donut-tooltip");
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
function renderRpfrTrendChart(rows) {
  const yearFilter = document.getElementById("rpfr-filter-year")?.value;
  const year = yearFilter || (rows[0] ? Number(String(rows[0].created_at).slice(0, 4)) : new Date().getFullYear());
  document.getElementById("rpfr-trend-sub").textContent = `Số yêu cầu theo tháng, năm ${year}`;

  document.getElementById("rpfr-trend-legend").innerHTML = RPFR_PRIORITY_META.map(
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

  document.getElementById("rpfr-trend-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" preserveAspectRatio="xMidYMid meet">
      ${gridSvg}${yLabels}
      ${linesSvg}
      ${xLabels}
    </svg>`;
}

// Theo quý thực hiện — cột dọc, mỗi cột dồn theo mức ưu tiên (giống cách
// gom dữ liệu renderFeatureRequestStats() ở 10-feature-requests.js, viết
// lại riêng vì khác kiểu hiển thị — cột dọc thay vì danh sách thanh ngang).
function renderRpfrQuyChart(rows) {
  document.getElementById("rpfr-quy-legend").innerHTML = RPFR_PRIORITY_META.map(
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
  const el = document.getElementById("rpfr-quy-chart");
  if (entries.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const totals = entries.map(([, b]) => Object.values(b).reduce((a, c) => a + c, 0));
  const maxTotal = Math.max(...totals);
  el.innerHTML = `<div class="rpfr-vbar-row"><div class="rpfr-vbar-axis"></div>${entries
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
    .join("")}</div>`;
}

// Phòng ban × trạng thái — bảng nhiệt, màu đậm dần theo giá trị (5 bậc,
// khớp chú giải "Ít -> Nhiều" trong tiêu đề khung).
const RPFR_HEAT_TIERS = ["#faf5f2", "#fcd9db", "#f9b3b7", "#ee0033", "#620915"];
function rpfrHeatTier(value, max) {
  if (value === 0 || max === 0) return 0;
  return Math.min(4, Math.ceil((value / max) * 4));
}
function renderRpfrHeatmap(rows) {
  const wrap = document.getElementById("rpfr-heatmap-wrap");
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

// Theo đơn vị thực hiện số hoá — thanh ngang kiểu "slider" (giống Hệ thống
// cần cải tiến ngay cạnh, để nhìn thống nhất) — số yêu cầu MỖI PHÒNG BAN đã
// TIẾP NHẬN (target_department_name, khớp đúng cột "Đơn vị thực hiện số
// hoá" mới thêm ở bảng), sắp giảm dần. Trực quan hơn hẳn waffle ô vuông cũ
// (user phản hồi) — xem rõ ngay phòng nào tiếp nhận nhiều/ít mà không cần
// đếm từng ô.
// Cột dọc đơn sắc dùng chung cho "Theo đơn vị thực hiện số hoá" + "Hệ thống
// cần cải tiến" — đổi từ kiểu "thanh ngang + chấm" sang cột dọc chuẩn (trục
// X + trục Y, giống mẫu ECharts "dataset-encode0" user gửi: bar chart có
// trục rõ ràng thay vì slider tối giản) — tái dùng NGUYÊN khung
// .rpfr-vbar-* đã có sẵn (Theo quý thực hiện cũng dùng), chỉ 1 màu/cột vì
// mỗi panel chỉ có 1 chỉ số (không cần nhóm nhiều cột/danh mục như mẫu).
function rpfrVBarChartHtml(entries, color) {
  if (entries.length === 0) return `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
  const max = entries[0][1];
  return `<div class="rpfr-vbar-row"><div class="rpfr-vbar-axis"></div>${entries
    .map(([name, count]) => {
      const height = max ? Math.max(4, (count / max) * 160) : 0;
      return `
    <div class="rpfr-vbar-col">
      <div class="rpfr-vbar-value">${count}</div>
      <div class="rpfr-vbar-single" style="height:${height}px;background:${color}" title="${name}: ${count}"></div>
      <div class="rpfr-vbar-label" title="${name}">${name}</div>
    </div>`;
    })
    .join("")}</div>`;
}

function renderRpfrTargetDeptList(rows) {
  const el = document.getElementById("rpfr-target-dept-list");
  const counts = new Map();
  rows.forEach((r) => {
    const key = r.target_department_name?.trim() || "Chưa xác định";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.innerHTML = rpfrVBarChartHtml(entries, "#ee0033");
}

// Hệ thống cần cải tiến — sắp giảm dần theo số lượng.
function renderRpfrHeThongList(rows) {
  const el = document.getElementById("rpfr-hethong-list");
  const counts = new Map();
  rows.forEach((r) => {
    const key = r.he_thong?.trim() || "Chưa có hệ thống";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  el.innerHTML = rpfrVBarChartHtml(entries, "#620915");
}

// Trao đổi yêu cầu với phòng ban khác — biểu đồ cột NHÓM (2 cột/phòng ban:
// Đã gửi/Nhận về), kiểu dáng tham khảo mẫu ECharts "dynamic-data" (cột
// dựng theo category, có animation mọc lên khi vẽ — xem .rpfr-exchange-bar
// style.css) — KHÔNG dùng thư viện ECharts (app này tự vẽ SVG/CSS cho mọi
// biểu đồ, không thêm dependency ngoài), chỉ theo đúng Ý TƯỞNG trực quan.
//
// "Đã gửi" = rows có department_id = phòng đang xem, target khác phòng
// đang xem, gộp theo target_department_name.
// "Nhận về" = rows có target_department_id = phòng đang xem, department
// khác phòng đang xem, gộp theo department_name.
// rows (tham số) đã quét sẵn đúng 2 chiều này (listFeatureRequests lọc
// department_id=X OR target_department_id=X), chỉ cần phân loại lại.
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

  const w = 680, h = 240, padL = 30, padB = 34, padT = 16, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = Math.max(1, ...deptNames.map((n) => Math.max(sentMap.get(n) ?? 0, receivedMap.get(n) ?? 0)));
  const yMax = Math.max(2, Math.ceil(maxVal / 2) * 2);
  const groupWidth = plotW / deptNames.length;
  const barWidth = Math.min(28, groupWidth * 0.3);
  const yAt = (v) => padT + plotH - (v / yMax) * plotH;
  const baseY = yAt(0);

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

  let bars = "", xLabels = "";
  deptNames.forEach((name, i) => {
    const groupCenterX = padL + groupWidth * (i + 0.5);
    const sentVal = sentMap.get(name) ?? 0;
    const recvVal = receivedMap.get(name) ?? 0;
    const sentX = groupCenterX - barWidth - 2;
    const recvX = groupCenterX + 2;
    const sentY = yAt(sentVal);
    const recvY = yAt(recvVal);
    bars += `<rect class="rpfr-exchange-bar" x="${sentX.toFixed(1)}" y="${sentY.toFixed(1)}" width="${barWidth}" height="${(baseY - sentY).toFixed(1)}" rx="3" fill="#890d1e"><title>${name} — Đã gửi: ${sentVal}</title></rect>`;
    bars += `<rect class="rpfr-exchange-bar" x="${recvX.toFixed(1)}" y="${recvY.toFixed(1)}" width="${barWidth}" height="${(baseY - recvY).toFixed(1)}" rx="3" fill="#cc4f55"><title>${name} — Nhận về: ${recvVal}</title></rect>`;
    const label = name.length > 16 ? `${name.slice(0, 15)}…` : name;
    xLabels += `<text x="${groupCenterX.toFixed(1)}" y="${h - padB + 16}" font-size="11" fill="var(--muted)" text-anchor="middle">${label}<title>${name}</title></text>`;
  });

  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="240" preserveAspectRatio="xMidYMid meet">
      ${gridSvg}${yLabels}
      ${bars}
      ${xLabels}
    </svg>`;
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
