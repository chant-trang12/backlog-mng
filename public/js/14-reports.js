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
  { key: "Đã duyệt", color: "#ee0033" }, // red-600
  { key: "Từ chối", color: "#620915" }, // red-900 / maroon
];
const RPFR_PRIORITY_META = [
  { key: "Khẩn cấp", color: "#620915" },
  { key: "Cao", color: "#ee0033" },
  { key: "Trung bình", color: "#f9b3b7" },
  { key: "Thấp", color: "#fef3c7" },
];
// Bảng màu cho ô vuông "Theo loại yêu cầu" — loai_yeu_cau là danh mục cấu
// hình được (Cấu hình > Loại yêu cầu), số lượng giá trị không cố định nên
// không gán cứng 2 màu như ảnh mẫu (chỉ có "Cải tiến"/"Mới") — lặp vòng
// qua bảng màu này theo đúng SỐ GIÁ TRỊ THỰC TẾ đang có trong dữ liệu.
const RPFR_WAFFLE_PALETTE = ["#ee0033", "#fef3c7", "#f9b3b7", "#620915", "#7dd3fc", "#fcd9db", "#f2666e"];

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
  const dept = state.departments.find((d) => d.id === state.currentDepartmentId);
  document.getElementById("rpfr-subtitle").textContent =
    `Số liệu chung của tất cả phòng ban gửi đề xuất tới ${dept ? dept.name : "phòng đang xem"}`;

  const rows = rpfrFilteredRows();
  renderRpfrStatCards(rows);
  renderRpfrStatusDonut(rows);
  renderRpfrTrendChart(rows);
  renderRpfrQuyChart(rows);
  renderRpfrHeatmap(rows);
  renderRpfrWaffle(rows);
  renderRpfrHeThongList(rows);
  renderRpfrDeptCompletion(rows);
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
function renderRpfrStatusDonut(rows) {
  const wrap = document.getElementById("rpfr-donut-wrap");
  const total = rows.length;
  if (total === 0) {
    wrap.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const size = 160, cx = size / 2, cy = size / 2, outerR = 72, innerR = 44;
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
    wedges += `<path d="M${xo0.toFixed(1)},${yo0.toFixed(1)} A${outerR},${outerR} 0 ${largeArc} 1 ${xo1.toFixed(1)},${yo1.toFixed(1)} L${xi1.toFixed(1)},${yi1.toFixed(1)} A${innerR},${innerR} 0 ${largeArc} 0 ${xi0.toFixed(1)},${yi0.toFixed(1)} Z" fill="${d.color}"><title>${d.key}: ${d.count}</title></path>`;
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
      <div class="rpfr-donut-svg-wrap">
        <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${wedges}</svg>
        <div class="rpfr-donut-center"><div class="rpfr-donut-center-big">${total}</div><div class="rpfr-donut-center-small">YÊU CẦU</div></div>
      </div>
      <div class="rpfr-donut-legend">${legend}</div>
    </div>`;
}

// Xu hướng tiếp nhận và hoàn thành — 12 tháng của năm đang lọc (hoặc năm
// gần nhất có dữ liệu nếu đang "Tất cả các năm"). "Tiếp nhận" đếm theo
// created_at; "Hoàn thành" đếm theo updated_at của các yêu cầu ĐÃ duyệt
// (không có cột ngày duyệt riêng — updated_at là xấp xỉ gần nhất hiện có).
function renderRpfrTrendChart(rows) {
  const yearFilter = document.getElementById("rpfr-filter-year")?.value;
  const year = yearFilter || (rows[0] ? Number(String(rows[0].created_at).slice(0, 4)) : new Date().getFullYear());
  document.getElementById("rpfr-trend-sub").textContent = `Số yêu cầu theo tháng, năm ${year}`;

  const tiepNhan = new Array(12).fill(0);
  const hoanThanh = new Array(12).fill(0);
  rows.forEach((r) => {
    if (r.created_at && String(r.created_at).slice(0, 4) === String(year)) {
      const m = Number(String(r.created_at).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) tiepNhan[m] += 1;
    }
    if (r.trang_thai === "Đã duyệt" && r.updated_at && String(r.updated_at).slice(0, 4) === String(year)) {
      const m = Number(String(r.updated_at).slice(5, 7)) - 1;
      if (m >= 0 && m < 12) hoanThanh[m] += 1;
    }
  });

  const w = 640, h = 220, padL = 26, padB = 22, padT = 10, padR = 10;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const maxVal = Math.max(1, ...tiepNhan, ...hoanThanh);
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

  const tnPts = tiepNhan.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" L ");
  const htPts = hoanThanh.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" L ");
  const areaPath = `M ${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} L ${tnPts} L ${xAt(11).toFixed(1)},${yAt(0).toFixed(1)} Z`;

  let xLabels = "";
  for (let i = 0; i < 12; i++) {
    xLabels += `<text x="${xAt(i).toFixed(1)}" y="${h - 4}" font-size="11" fill="var(--muted)" text-anchor="middle">T${i + 1}</text>`;
  }

  document.getElementById("rpfr-trend-chart").innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="220" preserveAspectRatio="xMidYMid meet">
      ${gridSvg}${yLabels}
      <path d="${areaPath}" fill="#fcd9db" opacity="0.7"/>
      <path d="M ${tnPts}" fill="none" stroke="#ee0033" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M ${htPts}" fill="none" stroke="#7dd3fc" stroke-width="2.5" stroke-dasharray="6 5" stroke-linejoin="round" stroke-linecap="round"/>
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
  el.innerHTML = `<div class="rpfr-vbar-row">${entries
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

// Theo loại yêu cầu — ô vuông dạng waffle, mỗi ô = 1 yêu cầu.
function renderRpfrWaffle(rows) {
  const waffleEl = document.getElementById("rpfr-waffle");
  const legendEl = document.getElementById("rpfr-waffle-legend");
  if (rows.length === 0) {
    waffleEl.innerHTML = "";
    legendEl.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const counts = new Map();
  rows.forEach((r) => {
    const key = r.loai_yeu_cau?.trim() || "Chưa phân loại";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const colorByKey = new Map(entries.map(([key], i) => [key, RPFR_WAFFLE_PALETTE[i % RPFR_WAFFLE_PALETTE.length]]));

  const squares = [];
  entries.forEach(([key, count]) => {
    for (let i = 0; i < count; i++) squares.push(`<span style="background:${colorByKey.get(key)}" title="${key}"></span>`);
  });
  waffleEl.innerHTML = squares.join("");

  const total = rows.length;
  legendEl.innerHTML = `<div class="rpfr-waffle-legend">${entries
    .map(
      ([key, count]) => `
    <div class="rpfr-waffle-legend-item">
      <span class="fr-stat-dot" style="background:${colorByKey.get(key)}"></span>${key}
      <strong>${count} · ${rpfrPct(count, total)}</strong>
    </div>`,
    )
    .join("")}</div>`;
}

// Hệ thống cần cải tiến — thanh ngang kiểu "slider" (vạch + chấm tròn ở
// cuối phần tô màu), sắp giảm dần theo số lượng.
function renderRpfrHeThongList(rows) {
  const el = document.getElementById("rpfr-hethong-list");
  const counts = new Map();
  rows.forEach((r) => {
    const key = r.he_thong?.trim() || "Chưa có hệ thống";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const max = entries[0][1];
  el.innerHTML = entries
    .map(
      ([name, count]) => `
    <div class="rpfr-dot-row">
      <span class="rpfr-dot-label" title="${name}">${name}</span>
      <span class="rpfr-dot-track"><span class="rpfr-dot-fill" style="width:${max ? (count / max) * 100 : 0}%"></span></span>
      <span class="rpfr-dot-value">${count}</span>
    </div>`,
    )
    .join("");
}

// Tỉ lệ hoàn thành theo phòng ban — cột dọc màu xanh, đậm nhạt theo tỉ lệ
// (đậm nhất = cao nhất), sắp giảm dần.
function renderRpfrDeptCompletion(rows) {
  const el = document.getElementById("rpfr-dept-completion-chart");
  const deptMap = new Map();
  rows.forEach((r) => {
    const name = r.department_name || "—";
    if (!deptMap.has(name)) deptMap.set(name, { total: 0, done: 0 });
    const d = deptMap.get(name);
    d.total += 1;
    if (r.trang_thai === "Đã duyệt") d.done += 1;
  });
  const entries = [...deptMap.entries()]
    .map(([name, d]) => [name, d.total === 0 ? 0 : Math.round((d.done / d.total) * 100)])
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    el.innerHTML = `<p class="muted" style="margin:0">Chưa có dữ liệu.</p>`;
    return;
  }
  const maxPct = Math.max(1, ...entries.map(([, p]) => p));
  el.innerHTML = `<div class="rpfr-vbar-row">${entries
    .map(([name, pct]) => {
      const height = Math.max(4, (pct / 100) * 160);
      const opacity = 0.35 + 0.65 * (pct / maxPct);
      return `
      <div class="rpfr-vbar-col">
        <div class="rpfr-vbar-value">${pct}%</div>
        <div class="rpfr-vbar-single" style="height:${height}px;background:#0284c7;opacity:${opacity.toFixed(2)}"></div>
        <div class="rpfr-vbar-label">${name}</div>
      </div>`;
    })
    .join("")}</div>`;
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
