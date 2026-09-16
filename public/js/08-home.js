// ---- Home (dashboard) ----
// Ranking Team lấy đúng theo cột Tổng điểm ở tab Tổng hợp (homeComputeTeamScores);
// gọi lại renderHomeDashboard() mỗi khi state.teams/criteriaConfigs/members đổi
// (period đổi, tiêu chí đổi...).

// Màu team ở Home lấy theo vị trí trong state.homeTeams (team của đúng
// tháng/điều kiện đang xem ở Home) — độc lập với state.teams (tháng đang
// chọn ở Backlog), vì Home có thể đang xem 1 tháng khác.
function homeTeamColorClass(teamName) {
  const index = state.homeTeams.findIndex((t) => t.name === teamName);
  const safeIndex = index === -1 ? 0 : index;
  return `team-color-${safeIndex % TEAM_COLOR_COUNT}`;
}
function homeTeamBarColorClass(teamName) {
  const index = state.homeTeams.findIndex((t) => t.name === teamName);
  const safeIndex = index === -1 ? 0 : index;
  return `team-bar-${safeIndex % TEAM_COLOR_COUNT}`;
}

// Cùng thứ tự với .team-bar-N trong style.css — dùng cho SVG (không đọc được
// class CSS trực tiếp trong thuộc tính stroke/fill).
const TEAM_BAR_HEX = ["#7c9b5c", "#b3452f", "#c9a24c", "#546b41", "#4f8a7c", "#8a5a75"];
function homeTeamBarHex(teamName) {
  const index = state.homeTeams.findIndex((t) => t.name === teamName);
  const safeIndex = index === -1 ? 0 : index;
  return TEAM_BAR_HEX[safeIndex % TEAM_BAR_HEX.length];
}

// Áp bộ lọc Tháng/Team riêng của Home (state.homePeriodId/state.homeTeamFilter)
// lên toàn bộ dữ liệu trước khi vẽ — mọi biểu đồ/bảng bên dưới đều phải phản
// ánh đúng kết quả tìm kiếm.
function renderHomeDashboard() {
  if (!document.getElementById("home-vbar-chart")) return;

  const theoTask = homeApplyKpiModeUI();

  // Phòng theo_task: KPI không chia team -> bộ lọc Team (ẩn) không áp dụng,
  // luôn coi như "Tất cả team" cho các bảng còn tính theo team bên dưới.
  const allTeamNames = state.homeTeams.map((t) => t.name);
  const teamNames = !theoTask && state.homeTeamFilter ? allTeamNames.filter((n) => n === state.homeTeamFilter) : allTeamNames;

  const filteredTasks = state.homeTasks.filter((t) => teamNames.includes(t.team));
  const eligibleForRanking = homeEligibleTasks(filteredTasks);

  // Ranking Team lấy đúng theo cột Tổng điểm của bảng Tổng hợp (tab Tổng
  // hợp) — cùng công thức tính, không phải tổng Điểm chuẩn cấu hình nữa.
  const rankingData = teamNames
    .map((name) => ({ team: name, value: homeComputeTeamScores(name, eligibleForRanking).tongDiem }))
    .sort((a, b) => b.value - a.value);

  renderHomeTaskStatCard(filteredTasks);

  if (theoTask) {
    // Ranking nhân sự (không chia team) — lấy thẳng từ KPI theo Task, đã
    // sắp theo tong_diem giảm dần từ backend (listKpiTheoTask).
    const personRanking = state.homeKpiTheoTask.map((r) => ({ label: r.member_name, value: r.tong_diem }));
    renderHomeVBarChart(personRanking, {
      topLabel: "Nhân sự dẫn đầu",
      emptyText: "Chưa có nhân sự nào tham gia task ở tháng đang chọn.",
    });
  } else {
    renderHomeVBarChart(
      rankingData.map((d) => ({ label: d.team, value: d.value, team: d.team })),
      {
        colorHex: (d) => homeTeamBarHex(d.team),
        colorClass: (d) => homeTeamBarColorClass(d.team),
        topLabel: "Team dẫn đầu",
      },
    );
  }

  renderHomeTonghopTable(teamNames, filteredTasks);
  renderHomeCompletionRateTable(teamNames, filteredTasks);
  renderHomeCompletionTable(teamNames, filteredTasks);
  renderHomeRankingTab(rankingData, eligibleForRanking);
  renderHomeKpiTheoTaskTable();
}

// Bật/tắt các phần tử UI ở Home theo cách tính KPI của phòng ban đang chọn
// (departments.cach_tinh_kpi — xem homeCachTinhKpiTheoTask): phòng
// "theo_task" (KPI tính thẳng theo nhân sự, không chia team) ẩn 3 tab
// Ranking/Tổng hợp/Tỉ lệ hoàn thành nhiệm vụ (không còn ý nghĩa) + ẩn bộ lọc
// Team ở khung Tìm kiếm, chỉ còn tab "KPI theo Task"; phòng "theo_team" thì
// ngược lại. Trả về true/false theo đúng chế độ hiện tại để
// renderHomeDashboard() dùng tiếp (chọn nguồn dữ liệu vẽ biểu đồ Ranking).
function homeApplyKpiModeUI() {
  const theoTask = homeCachTinhKpiTheoTask();

  const vbarTitle = document.getElementById("home-vbar-title");
  if (vbarTitle) vbarTitle.textContent = theoTask ? "Ranking nhân sự" : "Ranking Team";

  const teamFilterWrap = document.getElementById("home-filter-team-wrap");
  if (teamFilterWrap) teamFilterWrap.hidden = theoTask;

  const teamBasedTabs = ["ranking", "tonghop", "tyle-hoanthanh"];
  const taskBasedTabs = ["kpi-theo-task"];
  const tabsToHide = theoTask ? teamBasedTabs : taskBasedTabs;
  const tabsToShow = theoTask ? taskBasedTabs : teamBasedTabs;

  tabsToHide.forEach((tab) => {
    const pill = document.querySelector(`#home-subnav .pill[data-tab="${tab}"]`);
    if (!pill) return;
    pill.hidden = true;
    if (pill.classList.contains("active")) {
      pill.classList.remove("active");
      document.getElementById(`home-tab-${tab}`).hidden = true;
      const fallbackPill = document.querySelector(`#home-subnav .pill[data-tab="${tabsToShow[0]}"]`);
      if (fallbackPill) {
        fallbackPill.classList.add("active");
        document.getElementById(`home-tab-${tabsToShow[0]}`).hidden = false;
      }
    }
  });
  tabsToShow.forEach((tab) => {
    const pill = document.querySelector(`#home-subnav .pill[data-tab="${tab}"]`);
    if (pill) pill.hidden = false;
  });

  return theoTask;
}

// Bảng dữ liệu tab "KPI theo Task" — hiện pill/toggle tab do
// homeApplyKpiModeUI() phụ trách, hàm này chỉ đổ dữ liệu bảng.
function renderHomeKpiTheoTaskTable() {
  const tbody = document.getElementById("home-kpi-theo-task-tbody");
  const empty = document.getElementById("home-kpi-theo-task-empty");
  if (!tbody) return;
  const rows = state.homeKpiTheoTask;
  empty.hidden = rows.length > 0;
  tbody.innerHTML = rows
    .map(
      (r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.member_name}</td>
      <td>${r.member_chuc_vu ?? ""}</td>
      <td>${r.team_name ?? ""}</td>
      <td>${r.so_task}</td>
      <td>${r.tong_diem}</td>
    </tr>`,
    )
    .join("");
}

const HOME_STAT_STATUSES = ["Chưa thực hiện", "Đang thực hiện", "Hoàn thành", "Hủy"];
const HOME_STAT_STATUS_HEX = {
  "Chưa thực hiện": "#9aad79",
  "Đang thực hiện": "#c9a24c",
  "Hoàn thành": "#7c9b5c",
  Hủy: "#b3452f",
};

// Tổng số đầu việc + số lượng theo Trạng thái, đúng theo điều kiện tìm kiếm
// Tháng/Team đang chọn ở Home — vẽ dạng donut giống "Phân bổ nhân sự theo Team".
function renderHomeTaskStatCard(tasks) {
  const groupsEl = document.getElementById("home-stat-groups");

  if (tasks.length === 0) {
    groupsEl.innerHTML = `<p class="home-stat-list-empty">Chưa có nhiệm vụ nào khớp với điều kiện tìm kiếm.</p>`;
    return;
  }

  const statusCounts = new Map();
  tasks.forEach((t) => {
    const status = t.trang_thai || "Chưa thực hiện";
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  });
  const data = HOME_STAT_STATUSES.filter((status) => statusCounts.has(status)).map((status) => ({
    status,
    value: statusCounts.get(status),
  }));
  const total = tasks.length;

  // Donut (khoét lỗ, tâm hiển thị tổng), mỗi cung là 1 path riêng để có hiệu
  // ứng "phình ra" khi hover — giống mẫu ECharts pie-doughnut (emphasis).
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 98;
  const innerR = 58;
  const popDistance = 9;

  let angle = 0;
  let wedges = "";
  data.forEach((d) => {
    const frac = d.value / total;
    const a0 = angle;
    // frac === 1 (chỉ 1 trạng thái) khiến điểm đầu/cuối cung trùng nhau,
    // vẽ arc bị coi là rỗng — bớt 1 chút để cung luôn khép kín được.
    const a1 = angle + Math.min(frac * 2 * Math.PI, 2 * Math.PI - 0.001);
    const largeArc = a1 - a0 > Math.PI ? 1 : 0;
    const xo0 = cx + outerR * Math.sin(a0);
    const yo0 = cy - outerR * Math.cos(a0);
    const xo1 = cx + outerR * Math.sin(a1);
    const yo1 = cy - outerR * Math.cos(a1);
    const xi1 = cx + innerR * Math.sin(a1);
    const yi1 = cy - innerR * Math.cos(a1);
    const xi0 = cx + innerR * Math.sin(a0);
    const yi0 = cy - innerR * Math.cos(a0);
    const d0 = `M${xo0.toFixed(1)},${yo0.toFixed(1)} A${outerR},${outerR} 0 ${largeArc} 1 ${xo1.toFixed(1)},${yo1.toFixed(1)} L${xi1.toFixed(1)},${yi1.toFixed(1)} A${innerR},${innerR} 0 ${largeArc} 0 ${xi0.toFixed(1)},${yi0.toFixed(1)} Z`;

    const mid = (a0 + a1) / 2;
    const tx = (Math.sin(mid) * popDistance).toFixed(1);
    const ty = (-Math.cos(mid) * popDistance).toFixed(1);
    wedges += `<path class="home-donut-wedge" d="${d0}" fill="${HOME_STAT_STATUS_HEX[d.status]}" style="--tx:${tx}px;--ty:${ty}px" data-status="${d.status}" data-value="${d.value}" data-color="${HOME_STAT_STATUS_HEX[d.status]}" />`;
    angle = a1;
  });

  const legend = HOME_STAT_STATUSES.filter((status) => statusCounts.has(status))
    .map(
      (status) => `
    <div class="home-legend-item">
      <span class="home-legend-dot" style="background:${HOME_STAT_STATUS_HEX[status]}"></span>
      <span>${status}</span>
    </div>`,
    )
    .join("");

  groupsEl.innerHTML = `
    <div class="home-donut-wrap" style="width:${size}px;height:${size}px;margin:0 auto">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" overflow="visible">${wedges}</svg>
      <div class="home-donut-center"><div class="big">${total}</div><div class="small">Nhiệm vụ</div></div>
      <div class="home-donut-tooltip" id="home-donut-tooltip">
        <div class="home-donut-tooltip-row">
          <span class="home-donut-tooltip-dot"></span>
          <span class="home-donut-tooltip-label"></span>
          <span class="home-donut-tooltip-value"></span>
        </div>
      </div>
    </div>
    <div class="home-legend home-legend-grid" style="margin-top:12px">${legend}</div>`;

  const wrapEl = groupsEl.querySelector(".home-donut-wrap");
  const tooltipEl = document.getElementById("home-donut-tooltip");
  const dotEl = tooltipEl.querySelector(".home-donut-tooltip-dot");
  const labelEl = tooltipEl.querySelector(".home-donut-tooltip-label");
  const valueEl = tooltipEl.querySelector(".home-donut-tooltip-value");

  function positionTooltip(clientX, clientY) {
    const rect = wrapEl.getBoundingClientRect();
    tooltipEl.style.left = `${clientX - rect.left + 14}px`;
    tooltipEl.style.top = `${clientY - rect.top - 12}px`;
  }

  groupsEl.querySelectorAll(".home-donut-wedge").forEach((wedge) => {
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

// Làm tròn lên 1 mốc "đẹp" để chia trục (1/2/5/10 × 10^n).
function niceAxisMax(value) {
  const raw = Math.max(value, 1) * 1.15;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  let niceResidual;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

// Biểu đồ cột Điểm chuẩn theo team (mỗi team 1 màu) — cột thu gọn bề rộng,
// đặt gần nhau cho thanh thoát. (Biểu đồ đường "SL thành viên" tạm bỏ.)
// Biểu đồ cột dọc dùng chung cho "Ranking Team" (phòng theo_team) và
// "Ranking nhân sự" (phòng theo_task) — items: [{label, value}]. Không
// truyền colorHex/colorClass thì tô màu theo VỊ TRÍ trong mảng (đủ dùng khi
// không cần màu ổn định theo định danh qua các lần render, như ranking
// nhân sự); Ranking Team truyền riêng để giữ màu ổn định theo team (khớp
// màu ở các biểu đồ team khác trên trang), không nhảy màu theo thứ hạng.
function renderHomeVBarChart(items, opts = {}) {
  const chartEl = document.getElementById("home-vbar-chart");
  const legendEl = document.getElementById("home-vbar-legend");
  const calloutEl = document.getElementById("home-vbar-callout");
  const colorHex = opts.colorHex ?? ((d, i) => TEAM_BAR_HEX[i % TEAM_BAR_HEX.length]);
  const colorClass = opts.colorClass ?? ((d, i) => `team-bar-${i % TEAM_COLOR_COUNT}`);
  const axisLabel = opts.axisLabel ?? "Tổng điểm";
  const topLabel = opts.topLabel ?? "Dẫn đầu";
  const emptyText = opts.emptyText ?? "Chưa có team nào ở tháng đang chọn.";

  if (items.length === 0) {
    chartEl.innerHTML = `<p class="hbar-empty">${emptyText}</p>`;
    legendEl.innerHTML = "";
    calloutEl.innerHTML = "";
    return;
  }

  const labels = items.map((d) => d.label);
  const barValues = items.map((d) => d.value);

  const width = 420;
  const height = 210;
  const padLeft = 30;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const n = labels.length;

  // Cột trải đều sát 2 bên trục (không chừa lề thừa), nhưng bề rộng mỗi cột
  // vẫn cố định thon gọn — phần dư trong mỗi ô là khoảng cách giữa các cột.
  const step = plotW / n;
  const xCenters = labels.map((_, i) => padLeft + step * (i + 0.5));
  const barWidth = 34;

  // Trục mặc định hiển thị tối đa 120 — chỉ nới rộng hơn nếu có giá trị
  // thực cao hơn 120.
  const rawBarMax = Math.max(...barValues, 1);
  const barMax = rawBarMax <= 120 ? 120 : niceAxisMax(rawBarMax);
  const yBar = (v) => padTop + plotH - (v / barMax) * plotH;

  const gridSteps = 6;
  let gridLines = "";
  for (let i = 0; i <= gridSteps; i++) {
    const y = padTop + plotH - (i / gridSteps) * plotH;
    const leftVal = Math.round((barMax * i) / gridSteps);
    gridLines += `<line class="home-combo-grid" x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" />`;
    gridLines += `<text class="home-combo-tick" x="${padLeft - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${leftVal}</text>`;
  }

  let bars = "";
  let xLabels = "";
  labels.forEach((name, i) => {
    const x = xCenters[i] - barWidth / 2;
    const yTop = yBar(barValues[i]);
    const barH = Math.max(3, padTop + plotH - yTop);
    bars += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${colorHex(items[i], i)}" />`;
    bars += `<text class="home-combo-barvalue" x="${xCenters[i].toFixed(1)}" y="${(yTop + 12).toFixed(1)}" text-anchor="middle">${barValues[i].toFixed(0)}</text>`;
    xLabels += `<text class="home-combo-xlabel" x="${xCenters[i].toFixed(1)}" y="${height - 4}" text-anchor="middle">${name}</text>`;
  });

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}">
      ${gridLines}
      <text class="home-combo-axis-label" x="${padLeft}" y="12">${axisLabel}</text>
      ${bars}
      ${xLabels}
    </svg>`;

  legendEl.innerHTML = items
    .map(
      (d, i) => `
    <div class="home-legend-item">
      <span class="home-legend-dot ${colorClass(d, i)}"></span>
      <span>${d.label}</span>
    </div>`,
    )
    .join("");

  const top = items[0];
  calloutEl.innerHTML = `<div class="big">${top.value.toFixed(1)}</div><div class="small">${topLabel}: ${top.label}</div>`;
}

// Danh sách Tag (theo danh mục Tag ở Cấu hình → Tag & Phân loại) — dùng làm
// nhóm cột trong bảng tổng hợp "Tỉ lệ hoàn thành nhiệm vụ" ở Home. Đọc trực
// tiếp từ state.tags mỗi lần dùng để luôn khớp danh mục hiện tại (thêm/xóa/
// đổi tên tag ở Cấu hình phản ánh ngay ở Home). Chỉ giữ lại Tag nào có ít
// nhất 1 đầu việc khớp điều kiện (eligible, theo team đang xem) — ẩn cột Tag
// chưa có đầu việc nào để đỡ rối mắt (toàn "-").
function homeCompletionTagCategories(eligibleTasks, teamNames) {
  return state.tags
    .map((t) => t.ten_tag)
    .filter((tag) => eligibleTasks.some((t) => teamNames.includes(t.team) && t.tag === tag));
}

// Làm tròn 2 chữ số thập phân và bỏ số 0 thừa ở cuối (0.79 → "0.79", 1 → "1").
function formatHomeRatio(value) {
  return String(Math.round(value * 100) / 100);
}

// Hiển thị "-" thay vì "0" cho các ô rỗng trong bảng "Tỉ lệ hoàn thành nhiệm
// vụ" — đỡ rối mắt vì phần lớn ô sẽ bằng 0 (team không có nhiệm vụ ở tag đó).
function homeCompletionCell(numericValue, formatted = numericValue) {
  return numericValue === 0 ? "-" : formatted;
}

// Loại các task Hủy/Không tính điểm — dùng chung cho mọi tính toán tổng hợp
// từ Backlog ở trang Home (Tỉ lệ hoàn thành nhiệm vụ, Tổng hợp...).
function homeEligibleTasks(tasks) {
  return tasks.filter((t) => t.trang_thai !== "Hủy" && t.khong_tinh_diem !== "Không tính điểm");
}

// Tỉ lệ hoàn thành nhiệm vụ trung bình của 1 team (= cột "Tổng" trong bảng
// "Tổng hợp tỉ lệ hoàn thành nhiệm vụ") — trả về phân số 0-1, hoặc null nếu
// team chưa có nhiệm vụ nào khớp điều kiện.
function homeTeamCompletionRatio(team, eligibleTasks) {
  const tasks = eligibleTasks.filter((t) => t.team === team);
  if (tasks.length === 0) return null;
  const sumRatio = tasks.reduce((sum, t) => sum + (Number(t.cpo_danh_gia) || 0) / 100, 0);
  return sumRatio / tasks.length;
}

// Lấy Điểm chuẩn/Chỉ tiêu đã cấu hình cho 1 tiêu chí + 1 team tại menu
// Cấu hình → Tiêu chí. "chi_tieu" lưu dạng chuỗi có thể kèm "%" (VD "98%")
// nên chỉ lấy phần số. Trả về null nếu tiêu chí hoặc team chưa được cấu hình.
function homeCriteriaValue(tenCriteria, team) {
  const config = state.criteriaConfigs.find((c) => c.ten_tieu_chi === tenCriteria);
  const entry = config?.diem_chuan.find((d) => d.team_name === team);
  const diemChuan = entry?.diem_chuan !== null && entry?.diem_chuan !== undefined && entry.diem_chuan !== "" ? Number(entry.diem_chuan) : null;
  const chiTieu = entry?.chi_tieu ? parseFloat(entry.chi_tieu) : null;
  return {
    diemChuan: Number.isFinite(diemChuan) ? diemChuan : null,
    chiTieu: Number.isFinite(chiTieu) ? chiTieu : null,
  };
}

// SL "khai báo" của 1 team ở tab Tuân thủ (Team & Nhân sự) — mỗi dòng khai
// báo (bất kể giá trị Vi phạm là bao nhiêu) tính là 1 điểm trừ.
function homeComplianceCount(team) {
  return state.homeComplianceRecords.filter((c) => c.team_name === team).length;
}

// Bản sao computeWorkRuleRows() (tab Nội quy) nhưng dùng dữ liệu theo đúng
// tháng đang xem ở Home (state.homeAttendanceRecords/homeMembers/
// homeWorkRuleOverrideNames) thay vì tháng đang chọn ở Backlog/Team.
function computeHomeWorkRuleRows() {
  if (state.homeAttendanceRecords.length === 0) return [];

  const lateCountByName = new Map();
  state.homeAttendanceRecords.forEach((r) => {
    const name = String(r.row_data["Name"] ?? "").trim();
    if (!name) return;
    if (r.excluded_from_late) {
      if (!lateCountByName.has(name)) lateCountByName.set(name, 0);
      return;
    }
    const checkIn = String(r.row_data["Check In"] ?? "").trim();
    const checkOut = String(r.row_data["Check Out"] ?? "").trim();
    const isLateNote = (text) => text !== "" && !text.includes("không chấm công");
    if (isLateNote(checkIn) || isLateNote(checkOut)) {
      lateCountByName.set(name, (lateCountByName.get(name) ?? 0) + 1);
    } else if (!lateCountByName.has(name)) {
      lateCountByName.set(name, 0);
    }
  });

  return Array.from(lateCountByName.entries()).map(([name, late]) => {
    const member = state.homeMembers.find((m) => m.name === name);
    const excluded = state.homeWorkRuleOverrideNames.has(name);
    return {
      name,
      team: member?.team_name ?? "-",
      total: excluded ? 0 : Math.max(0, late - 3),
    };
  });
}

// Điểm trừ Nội quy của 1 team = tổng cột Total (Lượt đi muộn − 3, đã trừ
// người được "Không tính đi muộn") của tất cả nhân sự team đó, tab Nội quy.
function homeWorkRuleCount(team) {
  return computeHomeWorkRuleRows()
    .filter((r) => r.team === team)
    .reduce((sum, r) => sum + r.total, 0);
}

// Hiển thị dạng badge "-n/2" (n = số điểm trừ tổng hợp được, chia đôi theo
// yêu cầu); 0 thì hiện số 0 bình thường.
function homeDeductionCell(n) {
  const half = n / 2;
  if (half === 0) return `<td>0</td>`;
  return `<td><span class="status-badge" style="background:var(--delete-light);color:var(--delete)">-${formatHomeRatio(half)}</span></td>`;
}

// SL "khai báo" của 1 team ở tab Hỗ trợ (team thực hiện hỗ trợ) — mỗi dòng
// khai báo tính 1 điểm, cùng cách tính với Điểm trừ.
function homeSupportCount(team) {
  return state.homeSupportRecords.filter((s) => s.team_name === team).length;
}

// SL "khai báo" của 1 team ở tab Đào tạo — mỗi dòng khai báo (Đào tạo hoặc
// Chứng chỉ QT) tính 1 điểm, cùng cách tính với Điểm trừ.
function homeTrainingCount(team) {
  return state.homeTrainingRecords.filter((t) => t.team_name === team).length;
}

// Giống homeDeductionCell nhưng hiển thị "+n" (Điểm cộng) thay vì "-n".
function homeAdditionCell(n) {
  const half = n / 2;
  if (half === 0) return `<td>0</td>`;
  return `<td><span class="status-badge" style="background:#e3ecd7;color:#4a6234">+${formatHomeRatio(half)}</span></td>`;
}

// Tab "Tổng hợp" — khung theo mẫu Excel (Tổng điểm / Điểm tính theo chỉ tiêu
// / Điểm trừ / Điểm cộng). Nhóm "Điểm tính theo chỉ tiêu" map với 4 tiêu chí
// thuộc Nhóm "Khách hàng" ở Cấu hình → Tiêu chí:
// - Sprint Goal = Tỉ lệ hoàn thành nhiệm vụ (cột Tổng, tab Tỉ lệ hoàn thành
//   nhiệm vụ) × Điểm chuẩn ("Tiến độ hoàn thành Sprint goal").
// - Sự cố = Điểm chuẩn − (Điểm chuẩn × (SL sự cố × 10%)) ("Số lượng sự cố
//   mức độ ảnh hưởng nghiêm trọng đến khách hàng"); SL sự cố đếm từ CSKH →
//   Sự cố theo đúng team + tháng đang xem ở Home. Chưa có sự cố nào thì mặc
//   định lấy đúng Điểm chuẩn đã cấu hình.
// - Tỷ lệ xử lý ticket = Tỷ lệ thực tế (CSKH → Hỗ trợ ticket, cột Tỷ lệ) /
//   Chỉ tiêu × Điểm chuẩn ("Tỷ lệ xử lý yêu cầu hỗ trợ đúng hạn").
// - Tỷ lệ khởi tạo = Tỷ lệ thực tế (CSKH → Tỉ lệ khởi tạo, cột Grand Total) /
//   Chỉ tiêu × Điểm chuẩn ("Tỷ lệ khởi tạo dịch vụ thành công đúng hạn").
// Team/tiêu chí chưa được cấu hình Điểm chuẩn (hoặc Chỉ tiêu, với 2 tiêu chí
// cần Chỉ tiêu) thì để trống ô, tô nền xám.
// Nhóm "Điểm trừ":
// - Tuân thủ quy trình, KH chung = số dòng đã khai báo ở tab Tuân thủ (Team &
//   Nhân sự) của team đó trong tháng đang xem ở Home — mỗi dòng khai báo
//   tính 1 điểm trừ, hiển thị dạng badge "-n".
// - Tuân thủ nội quy = tổng cột Total (tab Nội quy) của tất cả nhân sự team
//   đó trong tháng đang xem ở Home, hiển thị dạng badge "-n".
// Nhóm "Điểm cộng" — cùng cách tính với Điểm trừ (số dòng khai báo ÷ 2) nhưng
// hiển thị dấu "+":
// - Hỗ trợ, phối hợp = số dòng khai báo ở tab Hỗ trợ (team thực hiện hỗ trợ).
// - Đào tạo = số dòng khai báo ở tab Đào tạo.
// Tổng điểm = Sprint Goal + Sự cố + Tỷ lệ xử lý ticket + Tỷ lệ khởi tạo −
// Tuân thủ quy trình,KH chung − Tuân thủ nội quy + Hỗ trợ,phối hợp + Đào tạo
// (2 cột Tuân thủ đã là số âm nên cộng thẳng vào, không trừ thêm lần nữa).
const HOME_TONGHOP_TRAILING_COLUMNS = 1 + 2 + 2; // Tổng điểm + 2 điểm trừ + 2 điểm cộng

// Trả về giá trị thô (tỷ lệ 0-1, % thực tế, hoặc số dòng đếm được) của 1
// nguồn dữ liệu — dùng bởi homeCriteriaContribution() để tính điểm theo đúng
// kieu_tinh đã cấu hình cho tiêu chí đó, thay vì hard-code theo tên tiêu chí.
function homeResolveDataSource(key, team, eligible) {
  switch (key) {
    case "ty_le_hoan_thanh_nhiem_vu":
      return homeTeamCompletionRatio(team, eligible); // 0-1 hoặc null
    case "so_luong_su_co":
      return state.incidents.filter((i) => i.period_id === state.homePeriodId && i.team_name === team).length;
    case "ty_le_xu_ly_ticket": {
      const t = state.tickets.find((x) => x.period_id === state.homePeriodId && x.team_name === team);
      return t ? t.ty_le * 100 : null; // %
    }
    case "ty_le_khoi_tao": {
      const r = state.creationRates.find((x) => x.period_id === state.homePeriodId && x.team_name === team);
      return r ? r.grand_total : null; // %
    }
    case "dem_tuan_thu":
      return homeComplianceCount(team);
    case "dem_noi_quy":
      return homeWorkRuleCount(team);
    case "dem_ho_tro":
      return homeSupportCount(team);
    case "dem_dao_tao":
      return homeTrainingCount(team);
    default:
      return null;
  }
}

// Tính điểm đóng góp vào Tổng điểm của 1 tiêu chí (cfg từ state.criteriaConfigs,
// đã có sẵn diem_chuan theo từng team) cho 1 team, theo đúng kieu_tinh đã cấu
// hình ở dialog Tiêu chí — nguồn duy nhất cho cả "Tổng điểm" (tổng hợp mọi
// tiêu chí có kieu_tinh khác "khong_tinh") lẫn phần hiển thị chi tiết.
function homeCriteriaContribution(cfg, team, eligible) {
  if (!cfg.kieu_tinh || cfg.kieu_tinh === "khong_tinh") return null;
  const entry = cfg.diem_chuan.find((d) => d.team_name === team);
  const diemChuan = entry?.diem_chuan !== null && entry?.diem_chuan !== undefined && entry.diem_chuan !== "" ? Number(entry.diem_chuan) : null;
  const chiTieu = entry?.chi_tieu ? parseFloat(entry.chi_tieu) : null;
  const factor = cfg.he_so !== null && cfg.he_so !== undefined ? Number(cfg.he_so) : null;
  const raw = homeResolveDataSource(cfg.nguon_du_lieu, team, eligible);

  switch (cfg.kieu_tinh) {
    case "ty_le_x_diem_chuan":
      return raw !== null && diemChuan !== null ? raw * diemChuan : null;
    case "ty_le_chia_chi_tieu_x_diem_chuan":
      return raw !== null && diemChuan !== null && chiTieu ? (raw / chiTieu) * diemChuan : null;
    case "tru_theo_loi": {
      if (diemChuan === null) return null;
      const rate = factor ?? 0.1;
      return raw === null || raw === 0 ? diemChuan : diemChuan - diemChuan * (raw * rate);
    }
    case "dem_dong_cong":
      return (raw ?? 0) / (factor ?? 2);
    case "dem_dong_tru":
      return -((raw ?? 0) / (factor ?? 2));
    default:
      return null;
  }
}

// Tính đủ các thành phần của bảng Tổng hợp cho 1 team (dùng chung cho bảng
// Tổng hợp điểm theo Team và cho biểu đồ Ranking Team, vì Ranking Team lấy
// dữ liệu trực tiếp từ đúng cột Tổng điểm này).
function homeComputeTeamScores(team, eligible) {
  const periodIncidents = state.incidents.filter((i) => i.period_id === state.homePeriodId && i.team_name === team);
  const periodTicket = state.tickets.find((t) => t.period_id === state.homePeriodId && t.team_name === team);
  const periodCreationRate = state.creationRates.find((r) => r.period_id === state.homePeriodId && r.team_name === team);

  const ratio = homeTeamCompletionRatio(team, eligible);
  const sprintGoalCfg = homeCriteriaValue("Tiến độ hoàn thành Sprint goal", team);
  const sprintGoal = ratio !== null && sprintGoalCfg.diemChuan !== null ? ratio * sprintGoalCfg.diemChuan : null;

  const suCoCfg = homeCriteriaValue("Số lượng sự cố mức độ ảnh hưởng nghiêm trọng đến khách hàng", team);
  const slSuCo = periodIncidents.length;
  // Chưa khai báo sự cố nào (CSKH → Sự cố) thì mặc định lấy đúng Điểm
  // chuẩn đã cấu hình; có sự cố mới áp công thức Điểm chuẩn − (Điểm
  // chuẩn × (SL sự cố × 10%)). Team chưa cấu hình Điểm chuẩn thì để
  // trống, không mặc định về 0.
  const suCo = suCoCfg.diemChuan === null ? null : slSuCo === 0 ? suCoCfg.diemChuan : suCoCfg.diemChuan - suCoCfg.diemChuan * (slSuCo * 0.1);

  const ticketCfg = homeCriteriaValue("Tỷ lệ xử lý yêu cầu hỗ trợ đúng hạn", team);
  const tyLeTicket =
    ticketCfg.diemChuan !== null && periodTicket && ticketCfg.chiTieu ? ((periodTicket.ty_le * 100) / ticketCfg.chiTieu) * ticketCfg.diemChuan : null;

  const khoiTaoCfg = homeCriteriaValue("Tỷ lệ khởi tạo dịch vụ thành công đúng hạn", team);
  const tyLeKhoiTao =
    khoiTaoCfg.diemChuan !== null && periodCreationRate && khoiTaoCfg.chiTieu
      ? ((periodCreationRate.grand_total * 100) / khoiTaoCfg.chiTieu) * khoiTaoCfg.diemChuan
      : null;

  // Tổng điểm = tổng đóng góp của MỌI tiêu chí "thấy được" của phòng đang
  // xem (state.criteriaConfigs, đã lọc theo phòng) có kieu_tinh khác
  // "khong_tinh" — cấu hình được trên giao diện (dialog Tiêu chí), không
  // còn hard-code cứng theo tên 4+4 tiêu chí cố định như trước. Deployment
  // nào đã cấu hình đúng kieu_tinh cho các tiêu chí quen thuộc (Sprint
  // Goal, Sự cố, Tuân thủ, Nội quy, Hỗ trợ, Đào tạo...) thì ra kết quả y hệt
  // công thức cũ; phòng ban dùng bộ tiêu chí khác thì Tổng điểm tự đúng
  // theo tiêu chí CỦA HỌ thay vì bị bỏ qua/tính sai.
  const tongDiem = state.criteriaConfigs.reduce(
    (sum, c) => sum + (homeCriteriaContribution(c, team, eligible) ?? 0),
    0,
  );

  return { sprintGoal, sprintGoalCfg, suCo, suCoCfg, tyLeTicket, ticketCfg, tyLeKhoiTao, khoiTaoCfg, tongDiem };
}

function renderHomeTonghopTable(teamNames, tasksInScope) {
  const tbody = document.getElementById("home-tonghop-tbody");
  if (!tbody) return;

  if (teamNames.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${HOME_TONGHOP_TRAILING_COLUMNS + 4 + 1}" class="hbar-empty">Chưa có team nào ở tháng đang chọn.</td></tr>`;
    return;
  }

  const eligible = homeEligibleTasks(tasksInScope);

  tbody.innerHTML = teamNames
    .map((team) => {
      const s = homeComputeTeamScores(team, eligible);

      // Team chưa cấu hình Điểm chuẩn cho tiêu chí đó → để trống ô, tô nền
      // xám nhạt; có cấu hình nhưng chưa tính được (thiếu dữ liệu nguồn) thì
      // hiện 0.
      const chiTieuCell = (value, configured) =>
        configured ? `<td>${value === null ? 0 : formatHomeRatio(value)}</td>` : `<td class="home-tonghop-blank"></td>`;

      return `
    <tr>
      <td><span class="status-badge ${homeTeamColorClass(team)}">${team}</span></td>
      <td>${formatHomeRatio(s.tongDiem)}</td>
      ${chiTieuCell(s.sprintGoal, s.sprintGoalCfg.diemChuan !== null)}
      ${chiTieuCell(s.suCo, s.suCoCfg.diemChuan !== null)}
      ${chiTieuCell(s.tyLeTicket, s.ticketCfg.diemChuan !== null)}
      ${chiTieuCell(s.tyLeKhoiTao, s.khoiTaoCfg.diemChuan !== null)}
      ${homeDeductionCell(homeComplianceCount(team))}
      ${homeDeductionCell(homeWorkRuleCount(team))}
      ${homeAdditionCell(homeSupportCount(team))}
      ${homeAdditionCell(homeTrainingCount(team))}
    </tr>`;
    })
    .join("");
}

// Cột "KI" ở bảng Ranking thành viên team tra theo Cấu hình → Ranking team:
// dựa vào vị trí của TỪNG THÀNH VIÊN trong chính team đó (không phải hạng
// của team) — nhân sự đứng đầu team dùng cột kịch bản đầu tiên, nhân sự đứng
// cuối team dùng cột cuối cùng, các nhân sự còn lại dùng cột giữa. Dòng
// (vi_tri) tra trong cột đó lại lấy theo HẠNG CỦA TEAM trên bảng Ranking Team
// (VD team hạng 1 → tra dòng 1 ở mọi cột, áp dụng cho mọi thành viên team đó).
function homeKiColumnForMemberRank(memberIndex, totalMembers) {
  const columns = [...state.rankingConfig.columns].sort((a, b) => a.thu_tu - b.thu_tu);
  if (columns.length === 0) return null;
  if (memberIndex === 0) return columns[0];
  if (memberIndex === totalMembers - 1) return columns[columns.length - 1];
  return columns[1] ?? columns[0];
}

function homeKiValue(column, viTri) {
  if (!column) return "-";
  const cell = state.rankingConfig.cells.find((c) => c.column_id === column.id && c.vi_tri === viTri);
  return cell?.gia_tri || "-";
}

// Thang KI từ cao xuống thấp — dùng cho nút "Hạ KI" (tab Nhân sự): hạ 1 bậc
// = lùi 1 vị trí trong thang này. Giá trị KI không khớp thang (VD ô Ranking
// team chưa cấu hình đúng ký hiệu A+/A/B/C/D/E) thì giữ nguyên, không đoán mò.
const HOME_KI_SCALE = ["A+", "A", "B", "C", "D", "E"];
function homeLowerKiOneLevel(value) {
  const idx = HOME_KI_SCALE.indexOf(value);
  if (idx === -1 || idx === HOME_KI_SCALE.length - 1) return value;
  return HOME_KI_SCALE[idx + 1];
}

// Tab "Ranking" — bảng xếp hạng team (theo đúng Tổng điểm ở tab Tổng hợp),
// bấm vào 1 team để xem "Điểm chi tiết theo team" (nhóm theo Nhóm tiêu chí,
// dùng lại homeComputeTeamScores) và "Ranking thành viên team" (Rank từ tab
// Đánh giá, KI tra theo Cấu hình → Ranking team dựa trên thứ hạng của team).
function renderHomeRankingTab(rankingData, eligible) {
  const teamTbody = document.getElementById("home-ranking-team-tbody");
  if (!teamTbody) return;

  const teamNames = rankingData.map((d) => d.team);
  if (state.homeRankingSelectedTeam && !teamNames.includes(state.homeRankingSelectedTeam)) {
    state.homeRankingSelectedTeam = null;
  }

  if (rankingData.length === 0) {
    teamTbody.innerHTML = `<tr><td colspan="3" class="hbar-empty">Chưa có team nào ở tháng đang chọn.</td></tr>`;
  } else {
    teamTbody.innerHTML = rankingData
      .map(
        (d, i) => `
      <tr data-team="${d.team}" class="${d.team === state.homeRankingSelectedTeam ? "active" : ""}">
        <td>${i + 1}</td>
        <td><span class="status-badge ${homeTeamColorClass(d.team)}">${d.team}</span></td>
        <td>${formatHomeRatio(d.value)}</td>
      </tr>`,
      )
      .join("");
    teamTbody.querySelectorAll("tr[data-team]").forEach((row) => {
      row.addEventListener("click", () => {
        const team = row.dataset.team;
        state.homeRankingSelectedTeam = state.homeRankingSelectedTeam === team ? null : team;
        renderHomeRankingTab(rankingData, eligible);
      });
    });
  }

  const detailCard = document.getElementById("home-ranking-detail-card");
  const memberCard = document.getElementById("home-ranking-member-card");
  const team = state.homeRankingSelectedTeam;

  if (!team) {
    detailCard.hidden = true;
    memberCard.hidden = true;
    return;
  }

  detailCard.hidden = false;
  memberCard.hidden = false;
  document.getElementById("home-ranking-detail-team-name").textContent = team;
  document.getElementById("home-ranking-member-team-name").textContent = team;

  const s = homeComputeTeamScores(team, eligible);
  const groups = [
    {
      nhom: "Khách hàng",
      rows: [
        ["Sprint Goal", s.sprintGoalCfg.diemChuan, s.sprintGoal],
        ["Sự cố", s.suCoCfg.diemChuan, s.suCo],
        ["Tỷ lệ xử lý ticket", s.ticketCfg.diemChuan, s.tyLeTicket],
        ["Tỷ lệ khởi tạo", s.khoiTaoCfg.diemChuan, s.tyLeKhoiTao],
      ],
    },
    {
      nhom: "Vận hành",
      rows: [
        ["Tuân thủ quy trình, KH chung", null, -(homeComplianceCount(team) / 2)],
        ["Tuân thủ nội quy", null, -(homeWorkRuleCount(team) / 2)],
        ["Hỗ trợ, phối hợp", null, homeSupportCount(team) / 2],
      ],
    },
    {
      nhom: "Phát triển tổ chức",
      rows: [["Đào tạo", null, homeTrainingCount(team) / 2]],
    },
  ];

  const detailRows = groups
    .map((g) => {
      const header = `<tr class="home-nhom-row"><td colspan="3">${g.nhom}</td></tr>`;
      const rows = g.rows
        .map(
          ([label, diemChuan, thucTe]) => `
      <tr>
        <td>${label}</td>
        <td>${diemChuan ?? ""}</td>
        <td>${formatHomeRatio(thucTe ?? 0)}</td>
      </tr>`,
        )
        .join("");
      return header + rows;
    })
    .join("");
  const tongDiemRow = `
    <tr class="home-tongdiem-row">
      <td>Tổng điểm</td>
      <td>100</td>
      <td>${formatHomeRatio(s.tongDiem)}</td>
    </tr>`;
  document.getElementById("home-ranking-detail-tbody").innerHTML = detailRows + tongDiemRow;

  // vi_tri tra KI = hạng của TEAM trên bảng Ranking Team (dùng chung cho mọi
  // thành viên của team đó); cột tra KI thì đổi theo vị trí của TỪNG thành
  // viên trong chính team này — chỉ tính trên các nhân sự ĐÃ có dữ liệu Đánh
  // giá (so_thu_tu), nhân sự chưa nhập Ranking không có vị trí để tra cột.
  const teamRankPosition = teamNames.indexOf(team) + 1;
  const rankedMembers = state.homeEvaluationRecords
    .filter((r) => r.team_name === team)
    .sort((a, b) => a.so_thu_tu - b.so_thu_tu);
  // Nhân sự thuộc team nhưng CHƯA nhập Ranking (tab Đánh giá) — vẫn hiển thị
  // ở đây, gán badge "Không tính KI" thay vì tra KI, để không bị "mất tích"
  // khỏi bảng chỉ vì chưa kịp nhập đánh giá.
  const rankedMemberIds = new Set(rankedMembers.map((r) => r.member_id));
  const unrankedMembers = state.homeMembers
    .filter((m) => m.team_name === team && !rankedMemberIds.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const haKiBadge = (memberId) => {
    const member = state.homeMembers.find((m) => m.id === memberId);
    return member?.ha_ki
      ? `<span class="status-badge status-huy ha-ki-badge" title="Đã hạ 1 KI">Hạ KI</span>`
      : "";
  };
  const nameWithHaKi = (name, memberId) => `<div class="name-with-ha-ki">${name}${haKiBadge(memberId)}</div>`;

  const rankedRows = rankedMembers
    .map((m, i) => {
      const kiColumn = homeKiColumnForMemberRank(i, rankedMembers.length);
      const rawKi = homeKiValue(kiColumn, teamRankPosition);
      const member = state.homeMembers.find((mem) => mem.id === m.member_id);
      const ki = member?.ha_ki ? homeLowerKiOneLevel(rawKi) : rawKi;
      return `
      <tr>
        <td style="text-align:left">${nameWithHaKi(m.member_name, m.member_id)}</td>
        <td>${m.so_thu_tu}</td>
        <td>${ki}</td>
      </tr>`;
    })
    .join("");
  const unrankedRows = unrankedMembers
    .map(
      (m) => `
      <tr>
        <td style="text-align:left">${nameWithHaKi(m.name, m.id)}</td>
        <td>-</td>
        <td><span class="status-badge status-default">Không tính KI</span></td>
      </tr>`,
    )
    .join("");

  const memberTbody = document.getElementById("home-ranking-member-tbody");
  memberTbody.innerHTML =
    rankedRows + unrankedRows ||
    `<tr><td colspan="3" class="hbar-empty">Chưa có nhân sự nào ở team này.</td></tr>`;
}

// Khung "Tổng hợp tỉ lệ hoàn thành nhiệm vụ" — mỗi dòng 1 team, mỗi cột 1 Tag,
// giá trị = Tổng tỉ lệ đã được đánh giá / Tổng đầu việc (cùng điều kiện lọc
// Hủy/Không tính điểm như bảng chi tiết bên dưới).
function renderHomeCompletionRateThead(tagCategories) {
  const thead = document.getElementById("home-completion-rate-thead");
  if (!thead) return;
  const tagHeadCells = tagCategories
    .map((tag) => `<th class="home-tag-head"><span ${tagBadgeAttrs(tag)}>${tag}</span></th>`)
    .join("");
  thead.innerHTML = `<tr><th>Team</th>${tagHeadCells}<th>Tổng</th></tr>`;
}

function renderHomeCompletionRateTable(teamNames, tasksInScope) {
  const tbody = document.getElementById("home-completion-rate-tbody");
  if (!tbody) return;

  const eligible = homeEligibleTasks(tasksInScope);
  const tagCategories = homeCompletionTagCategories(eligible, teamNames);
  renderHomeCompletionRateThead(tagCategories);
  const colCount = 1 + tagCategories.length + 1;

  if (teamNames.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="hbar-empty">Chưa có team nào ở tháng đang chọn.</td></tr>`;
    return;
  }

  const rateCell = (tasks) => {
    const sumRatio = tasks.reduce((sum, t) => sum + (Number(t.cpo_danh_gia) || 0) / 100, 0);
    if (tasks.length === 0) return "-";
    return `${Math.round((sumRatio / tasks.length) * 100)}%`;
  };

  const teamRows = teamNames
    .map((team) => {
      const cells = tagCategories.map((tag) => {
        const tasks = eligible.filter((t) => t.team === team && t.tag === tag);
        return `<td>${rateCell(tasks)}</td>`;
      }).join("");
      const teamTotal = rateCell(eligible.filter((t) => t.team === team));
      return `
      <tr>
        <td><span class="status-badge ${homeTeamColorClass(team)}">${team}</span></td>
        ${cells}
        <td>${teamTotal}</td>
      </tr>`;
    })
    .join("");

  const totalCells = tagCategories.map((tag) => {
    const tasks = eligible.filter((t) => teamNames.includes(t.team) && t.tag === tag);
    return `<td>${rateCell(tasks)}</td>`;
  }).join("");
  const grandTotal = rateCell(eligible.filter((t) => teamNames.includes(t.team)));
  const totalRow = `
      <tr class="home-tongdiem-row">
        <td>Tổng</td>
        ${totalCells}
        <td>${grandTotal}</td>
      </tr>`;

  tbody.innerHTML = teamRows + totalRow;
}

// Tab "Tỉ lệ hoàn thành nhiệm vụ" — tổng hợp từ Backlog: mỗi dòng 1 team, mỗi
// nhóm cột là 1 Tag (đúng tên tag trong Backlog), 2 cột con "Tổng tỉ lệ đã
// được đánh giá" / "Tổng đầu việc". Không tính các task
// đánh dấu Hủy (trang_thai) hoặc Không tính điểm (khong_tinh_diem), tương
// ứng điều kiện SUMIFS trong file Excel gốc (loại "*Hủy*" và "*Không tính
// điểm*"). "Tổng tỉ lệ đã được đánh giá" là TỔNG (không phải trung bình) của
// % hoàn thành/100 (VD: 79% → 0.79) của các task khớp điều kiện, giống công
// thức SUMIFS theo cột % Đánh giá.
function homeCompletionPairCells(tasks) {
  const sumRatio = tasks.reduce((sum, t) => sum + (Number(t.cpo_danh_gia) || 0) / 100, 0);
  return `<td>${homeCompletionCell(sumRatio, formatHomeRatio(sumRatio))}</td><td>${homeCompletionCell(tasks.length)}</td>`;
}

function renderHomeCompletionThead(tagCategories) {
  const thead = document.getElementById("home-completion-thead");
  if (!thead) return;
  const tagHeadCells = tagCategories
    .map((tag) => `<th colspan="2" class="home-tag-head"><span ${tagBadgeAttrs(tag)}>${tag}</span></th>`)
    .join("");
  const subHeadCells = tagCategories
    .map(() => `<th>Tổng tỉ lệ đã được đánh giá</th><th>Tổng đầu việc</th>`)
    .join("");
  thead.innerHTML = `
    <tr>
      <th rowspan="2">Team</th>
      ${tagHeadCells}
      <th colspan="2">Tổng</th>
    </tr>
    <tr>
      ${subHeadCells}
      <th>Tổng tỉ lệ đã được đánh giá</th><th>Tổng đầu việc</th>
    </tr>`;
}

function renderHomeCompletionTable(teamNames, tasksInScope) {
  const tbody = document.getElementById("home-completion-tbody");
  if (!tbody) return;

  const eligible = homeEligibleTasks(tasksInScope);
  const tagCategories = homeCompletionTagCategories(eligible, teamNames);
  renderHomeCompletionThead(tagCategories);
  const colCount = 1 + (tagCategories.length + 1) * 2;

  if (teamNames.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="hbar-empty">Chưa có team nào ở tháng đang chọn.</td></tr>`;
    return;
  }

  const teamRows = teamNames
    .map((team) => {
      const cells = tagCategories.map((tag) => homeCompletionPairCells(eligible.filter((t) => t.team === team && t.tag === tag))).join("");
      const teamTotalCells = homeCompletionPairCells(eligible.filter((t) => t.team === team));
      return `
      <tr>
        <td><span class="status-badge ${homeTeamColorClass(team)}">${team}</span></td>
        ${cells}
        ${teamTotalCells}
      </tr>`;
    })
    .join("");

  const totalCells = tagCategories.map((tag) =>
    homeCompletionPairCells(eligible.filter((t) => teamNames.includes(t.team) && t.tag === tag)),
  ).join("");
  const grandTotalCells = homeCompletionPairCells(eligible.filter((t) => teamNames.includes(t.team)));
  const totalRow = `
      <tr class="home-tongdiem-row">
        <td>Tổng</td>
        ${totalCells}
        ${grandTotalCells}
      </tr>`;

  tbody.innerHTML = teamRows + totalRow;
}

