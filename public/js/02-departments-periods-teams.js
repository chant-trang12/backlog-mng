// ---- Phòng ban (department scoping) ----
const DEPT_LS_KEY = "backlog.currentDepartmentId";

// Trả về "&department_id=X" (hoặc "?..." tuỳ prefix) để nối vào URL API. Rỗng
// khi chưa chọn phòng.
function deptParam(prefix = "&") {
  return state.currentDepartmentId != null
    ? `${prefix}department_id=${state.currentDepartmentId}`
    : "";
}

// Bảng màu monogram cho phòng — cùng họ với --team-bar-N của theme.
const DEPT_COLORS = ["#7c9b5c", "#b3452f", "#c9a24c", "#546b41", "#4f8a7c", "#8a5a75"];

function deptColor(dept) {
  const i = Math.max(0, state.departments.findIndex((d) => d.id === dept.id));
  return DEPT_COLORS[i % DEPT_COLORS.length];
}

function deptMonogram(dept) {
  if (dept.code) return dept.code.trim().slice(0, 3).toUpperCase();
  const words = dept.name.replace(/^Phòng\s+/i, "").trim().split(/\s+/);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : dept.name.slice(0, 2);
  return letters.toUpperCase();
}

async function loadDepartments() {
  state.departments = await api("/api/departments");
  let saved = null;
  try {
    saved = Number(localStorage.getItem(DEPT_LS_KEY));
  } catch {}
  const exists = state.departments.some((d) => d.id === saved);
  state.currentDepartmentId = exists ? saved : state.departments[0]?.id ?? null;
  renderDeptSwitcher();
}

// Tên phòng (kèm mã) — hiện đầy đủ ở tooltip khi tên trong panel bị cắt "…".
function deptFullLabel(d) {
  return d.code ? `${d.name} (${d.code})` : d.name;
}

// Tooltip đọc đủ tên: hiện ngay khi rê chuột vào 1 dòng có tên bị cắt.
function showDeptTip(optionEl, text) {
  const nameEl = optionEl.querySelector(".dept-option-name");
  if (nameEl && nameEl.scrollWidth <= nameEl.clientWidth) return; // không bị cắt -> khỏi cần
  const s = el.deptSwitcher.getBoundingClientRect();
  const o = optionEl.getBoundingClientRect();
  el.deptTip.textContent = text;
  el.deptTip.style.top = `${o.top - s.top}px`;
  el.deptTip.hidden = false;
  requestAnimationFrame(() => el.deptTip.classList.add("show"));
}
function hideDeptTip() {
  el.deptTip.classList.remove("show");
  el.deptTip.hidden = true;
}

function renderDeptSwitcher() {
  const current = state.departments.find((d) => d.id === state.currentDepartmentId);
  if (current) {
    el.deptTriggerMono.textContent = deptMonogram(current);
    el.deptTriggerMono.style.background = deptColor(current);
    el.deptTriggerName.textContent = current.name;
    el.deptTrigger.title = deptFullLabel(current);
  } else {
    el.deptTriggerMono.textContent = "--";
    el.deptTriggerName.textContent = "—";
    el.deptTrigger.title = "";
  }

  el.deptPanel.innerHTML =
    `<div class="dept-panel-title">Chuyển phòng ban</div>` +
    state.departments
      .map(
        (d) => `
      <button type="button" class="dept-option${d.id === state.currentDepartmentId ? " active" : ""}" role="menuitem" data-dept-id="${d.id}">
        <span class="dept-mono" style="background:${deptColor(d)}">${deptMonogram(d)}</span>
        <span class="dept-option-name">${d.name}</span>
        <span class="dept-option-check">✓</span>
      </button>`,
      )
      .join("") +
    `<div class="dept-panel-sep"></div>` +
    `<button type="button" class="dept-option dept-option-manage" role="menuitem" data-dept-manage="1" title="Quản lý phòng ban">
      <span class="dept-mono" style="background:var(--border);color:var(--muted)">⚙</span>
      <span class="dept-option-name">Quản lý phòng ban…</span>
    </button>`;

  el.deptPanel.querySelectorAll("[data-dept-id]").forEach((btn) => {
    const dept = state.departments.find((d) => d.id === Number(btn.dataset.deptId));
    btn.addEventListener("click", () => selectDepartment(Number(btn.dataset.deptId)));
    btn.addEventListener("mouseenter", () => showDeptTip(btn, deptFullLabel(dept)));
    btn.addEventListener("mouseleave", hideDeptTip);
  });
  const manageBtn = el.deptPanel.querySelector("[data-dept-manage]");
  manageBtn.addEventListener("mouseenter", () => showDeptTip(manageBtn, "Quản lý phòng ban"));
  manageBtn.addEventListener("mouseleave", hideDeptTip);
  manageBtn.addEventListener("click", () => {
    closeDeptPanel();
    document.querySelector('.nav-item[data-page="config"]')?.click();
    document.querySelector('#config-subnav .pill[data-tab="phongban"]')?.click();
  });

  applyDeptModeSidebarNav();
}

// Menu "CSKH" (Sự cố/Hỗ trợ ticket/Tỉ lệ khởi tạo — đều tính theo team) ẩn
// đi với phòng ban tính KPI theo Task (không chia team, xem
// homeCachTinhKpiTheoTask). Đang đứng ở trang CSKH mà đổi sang phòng loại
// này thì tự chuyển về Home.
function applyDeptModeSidebarNav() {
  const cskhNav = document.querySelector('.nav-item[data-page="cskh"]');
  if (!cskhNav) return;
  const theoTask = homeCachTinhKpiTheoTask();
  cskhNav.hidden = theoTask;
  if (theoTask && cskhNav.classList.contains("active")) {
    document.querySelector('.nav-item[data-page="home"]')?.click();
  }
}

function openDeptPanel() {
  el.deptPanel.hidden = false;
  el.deptTrigger.setAttribute("aria-expanded", "true");
}
function closeDeptPanel() {
  el.deptPanel.hidden = true;
  el.deptTrigger.setAttribute("aria-expanded", "false");
  hideDeptTip();
}

el.deptTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  if (el.deptPanel.hidden) openDeptPanel();
  else closeDeptPanel();
});
document.addEventListener("click", (e) => {
  if (!el.deptSwitcher.contains(e.target)) closeDeptPanel();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDeptPanel();
});

// Bấm ra ngoài -> đóng mọi popover Lịch sử đánh giá đang mở.
document.addEventListener("click", (e) => {
  if (e.target.closest(".grade-hist-toggle") || e.target.closest(".grade-history-list")) return;
  document.querySelectorAll(".grade-history-list:not([hidden])").forEach((l) => (l.hidden = true));
  document.querySelectorAll(".grade-hist-toggle.open").forEach((b) => b.classList.remove("open"));
});

async function selectDepartment(id) {
  closeDeptPanel();
  if (id === state.currentDepartmentId) return;
  state.currentDepartmentId = id;
  try {
    localStorage.setItem(DEPT_LS_KEY, String(id));
  } catch {}
  state.currentTeam = "";
  state.currentTeamId = null;
  state.memberFilterTeam = "";
  renderDeptSwitcher();
  try {
    await loadTeams(); // kéo theo loadTasks()
    await loadMembers();
    await loadRoadmap();
    await loadTieuChi(); // tiêu chí "thấy được" khác nhau theo từng phòng
    syncHomeFromCurrentIfNeeded();
  } catch (err) {
    showToast(err.message);
  }
}

function formatDateInput(value) {
  return value ? value.slice(0, 10) : "";
}

function formatDateDisplay(value) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Toàn bộ lịch sử đánh giá của 1 task (kể cả các tháng trước khi nó là NV
// tồn) — nút "Lịch sử (N)" bung ra danh sách từng tháng.
function gradingEntries(t) {
  let past = [];
  try {
    past = t.grading_history ? JSON.parse(t.grading_history) : [];
  } catch {
    past = [];
  }
  const curLabel = state.periods.find((p) => p.id === t.period_id)?.label ?? "Tháng này";
  const entries = past.slice();
  if (t.cpo_danh_gia !== null || (t.cpo_comment && t.cpo_comment.trim())) {
    entries.push({
      period_label: curLabel,
      cpo_danh_gia: t.cpo_danh_gia,
      cpo_comment: t.cpo_comment,
      graded_at: t.cpo_graded_at,
    });
  }
  return { past, entries };
}

// mode: "percent" (cột % Đánh giá) hoặc "content" (cột Nội dung đánh giá).
function renderGradingHistory(t, mode) {
  const { past, entries } = gradingEntries(t);
  // Hiện nút Lịch sử khi có đánh giá của THÁNG TRƯỚC (không hiện ở ô chính),
  // hoặc khi có từ 2 lần đánh giá trở lên.
  if (past.length === 0 && entries.length <= 1) return "";

  const pct = (e) =>
    e.cpo_danh_gia !== null && e.cpo_danh_gia !== undefined ? e.cpo_danh_gia + "%" : "—";
  const rows = entries
    .map((e) =>
      mode === "percent"
        ? `<div><span class="gh-period">${e.period_label}</span> <b>${pct(e)}</b></div>`
        : `<div><span class="gh-period">${e.period_label}</span> <b>${pct(e)}</b>${
            e.cpo_comment ? " · " + String(e.cpo_comment).replace(/\n/g, " ") : ""
          }${e.graded_at ? ` <span class="muted">🕒 ${fmtGradedAt(e.graded_at)}</span>` : ""}</div>`,
    )
    .join("");
  const hid = `hist-${t.id}-${mode}`;
  // % Đánh giá: nút gọn ở góc trên TRÁI (góc phải đã có badge ↩). Nội dung
  // đánh giá: nút ở góc trên PHẢI.
  const btn =
    mode === "percent"
      ? `<button type="button" class="grade-hist-toggle mini left" data-hist-target="${hid}" title="Lịch sử đánh giá qua các tháng">🕘 ${entries.length}</button>`
      : `<button type="button" class="grade-hist-toggle right" data-hist-target="${hid}" title="Lịch sử đánh giá qua các tháng">Lịch sử ${entries.length} ▾</button>`;
  return `${btn}<div class="grade-history-list" id="${hid}" hidden>${rows}</div>`;
}

// "YYYY-MM-DD HH:MM:SS" -> "dd/mm/yyyy HH:MM:SS" (thời điểm chấm điểm).
function fmtGradedAt(value) {
  if (!value) return "";
  const s = String(value).replace("T", " ");
  const [datePart, timePart = ""] = s.split(" ");
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y} ${timePart.slice(0, 8)}`.trim();
}

// ---- Cảnh báo task (Backlog): chưa chấm điểm / quá deadline / sắp đến hạn ----

function todayDateOnly() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseTaskDeadline(deadline) {
  if (!deadline) return null;
  const [y, m, d] = deadline.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isTaskNotGraded(t) {
  return t.trang_thai !== "Hủy" && t.khong_tinh_diem !== "Không tính điểm" && t.cpo_danh_gia === null;
}

function isTaskOverdue(t) {
  if (t.trang_thai === "Hủy" || t.trang_thai === "Hoàn thành") return false;
  const deadline = parseTaskDeadline(t.deadline);
  if (!deadline) return false;
  return deadline < todayDateOnly();
}

function isTaskUpcomingDeadline(t) {
  if (t.trang_thai === "Hủy" || t.trang_thai === "Hoàn thành") return false;
  const deadline = parseTaskDeadline(t.deadline);
  if (!deadline) return false;
  const today = todayDateOnly();
  const in5Days = new Date(today);
  in5Days.setDate(in5Days.getDate() + 5);
  return deadline >= today && deadline <= in5Days;
}

function renderTaskWarnings() {
  const tasks = state.tasksAll;
  const noScoreCount = tasks.filter(isTaskNotGraded).length;
  const overdueCount = tasks.filter(isTaskOverdue).length;
  const upcomingCount = tasks.filter(isTaskUpcomingDeadline).length;

  el.warningCountNoScore.textContent = String(noScoreCount);
  el.warningCountOverdue.textContent = String(overdueCount);
  el.warningCountUpcoming.textContent = String(upcomingCount);

  el.warningChipNoScore.hidden = noScoreCount === 0;
  el.warningChipOverdue.hidden = overdueCount === 0;
  el.warningChipUpcoming.hidden = upcomingCount === 0;

  el.taskWarningsCard.hidden = noScoreCount === 0 && overdueCount === 0 && upcomingCount === 0;

  el.warningChipNoScore.classList.toggle("active", state.taskWarningFilter === "no-score");
  el.warningChipOverdue.classList.toggle("active", state.taskWarningFilter === "overdue");
  el.warningChipUpcoming.classList.toggle("active", state.taskWarningFilter === "upcoming");
}

function toggleTaskWarningFilter(key) {
  state.taskWarningFilter = state.taskWarningFilter === key ? "" : key;
  applyTaskFilters();
  renderTasks();
  renderTaskWarnings();
}

el.warningChipNoScore.addEventListener("click", () => toggleTaskWarningFilter("no-score"));
el.warningChipOverdue.addEventListener("click", () => toggleTaskWarningFilter("overdue"));
el.warningChipUpcoming.addEventListener("click", () => toggleTaskWarningFilter("upcoming"));

// ---- Periods ----

async function loadPeriods() {
  state.periods = await api("/api/periods");
  const optionsHtml = state.periods.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
  el.periodSelect.innerHTML = optionsHtml;
  el.teamPeriodSelect.innerHTML = optionsHtml;
  el.configTeamPeriod.innerHTML = optionsHtml;

  if (state.periods.length === 0) {
    state.currentPeriodId = null;
    renderEmpty();
    await loadTeams();
    await loadMembers();
    await loadComplianceRecords();
    await loadTrainingRecords();
    await loadSupportRecords();
    await loadDanhGiaRecords();
    await loadAttendanceRecords();
    await refreshHomeFilters();
    return;
  }

  if (!state.currentPeriodId || !state.periods.some((p) => p.id === state.currentPeriodId)) {
    state.currentPeriodId = state.periods[0].id;
  }
  el.periodSelect.value = String(state.currentPeriodId);
  el.teamPeriodSelect.value = String(state.currentPeriodId);
  el.configTeamPeriod.value = String(state.currentPeriodId);
  await loadTeams();
  await loadMembers();
  await loadComplianceRecords();
  await loadTrainingRecords();
  await loadSupportRecords();
  await loadDanhGiaRecords();
  await loadAttendanceRecords();
  await refreshHomeFilters();
}

// Bộ lọc "Tháng"/"Team" riêng ở trang Home — mặc định theo tháng đang chọn ở
// Backlog nhưng độc lập: đổi ở đây không ảnh hưởng phần còn lại của app.
async function refreshHomeFilters() {
  if (state.homePeriodId === null || !state.periods.some((p) => p.id === state.homePeriodId)) {
    state.homePeriodId = state.currentPeriodId;
    state.homeTeamFilter = "";
  }
  const optionsHtml = state.periods.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
  el.homeFilterPeriod.innerHTML = optionsHtml;
  if (state.homePeriodId) el.homeFilterPeriod.value = String(state.homePeriodId);
  await refreshHomeForPeriod(state.homePeriodId);
}

// Phòng ban hiện tại tính KPI trực tiếp theo task (không chia team)?
function homeCachTinhKpiTheoTask() {
  const dept = state.departments.find((d) => d.id === state.currentDepartmentId);
  return dept?.cach_tinh_kpi === "theo_task";
}

async function loadHomeKpiTheoTask(periodId) {
  if (!periodId || !homeCachTinhKpiTheoTask()) {
    state.homeKpiTheoTask = [];
    return;
  }
  state.homeKpiTheoTask = await api(`/api/kpi-theo-task?period_id=${periodId}${deptParam()}`);
}

async function refreshHomeForPeriod(periodId) {
  if (!periodId) {
    state.homeTeams = [];
    state.homeMembers = [];
    state.homeTasks = [];
    state.homeComplianceRecords = [];
    state.homeAttendanceRecords = [];
    state.homeNoiQuyOverrideNames = new Set();
    state.homeSupportRecords = [];
    state.homeTrainingRecords = [];
    state.homeDanhGiaRecords = [];
    state.homeKpiTheoTask = [];
  } else if (periodId === state.currentPeriodId) {
    state.homeTeams = state.teams;
    state.homeMembers = state.members;
    state.homeTasks = state.tasksAll;
    state.homeComplianceRecords = state.complianceRecords;
    state.homeAttendanceRecords = state.attendanceRecords;
    state.homeNoiQuyOverrideNames = state.noiQuyOverrideNames;
    state.homeSupportRecords = state.supportRecords;
    state.homeTrainingRecords = state.trainingRecords;
    state.homeDanhGiaRecords = state.danhGiaRecords;
    await loadHomeKpiTheoTask(periodId);
  } else {
    const [teams, members, tasks, compliance, attendance, noiQuyOverrides, support, training, danhGia] = await Promise.all([
      api(`/api/teams?period_id=${periodId}${deptParam()}`),
      api(`/api/members?period_id=${periodId}${deptParam()}`),
      api(`/api/periods/${periodId}/tasks`),
      api(`/api/compliance-records?period_id=${periodId}`),
      api(`/api/attendance-records?period_id=${periodId}`),
      api(`/api/noiquy-overrides?period_id=${periodId}`),
      api(`/api/support-records?period_id=${periodId}`),
      api(`/api/training-records?period_id=${periodId}`),
      api(`/api/danh-gia-records?period_id=${periodId}`),
    ]);
    state.homeTeams = teams;
    state.homeMembers = members;
    state.homeTasks = tasks;
    state.homeComplianceRecords = compliance;
    state.homeAttendanceRecords = attendance.rows;
    state.homeNoiQuyOverrideNames = new Set(noiQuyOverrides.map((o) => o.member_name));
    state.homeSupportRecords = support;
    state.homeTrainingRecords = training;
    state.homeDanhGiaRecords = danhGia;
    await loadHomeKpiTheoTask(periodId);
  }
  populateHomeTeamFilterOptions();
  renderHomeDashboard();
}

function populateHomeTeamFilterOptions() {
  if (!el.homeFilterTeam) return;
  if (state.homeTeamFilter && !state.homeTeams.some((t) => t.name === state.homeTeamFilter)) {
    state.homeTeamFilter = "";
  }
  el.homeFilterTeam.innerHTML = [`<option value="">Tất cả team</option>`]
    .concat(state.homeTeams.map((t) => `<option value="${t.name}">${t.name}</option>`))
    .join("");
  el.homeFilterTeam.value = state.homeTeamFilter;
}

// Khi tháng/team/nhân sự/task của tháng ĐANG XEM Ở HOME đổi (CRUD ở các
// trang khác cho cùng tháng đó), đồng bộ lại dữ liệu Home mà không cần gọi
// lại API (đã có sẵn state.teams/state.members/state.tasksAll mới nhất).
function syncHomeFromCurrentIfNeeded() {
  if (state.homePeriodId && state.homePeriodId === state.currentPeriodId) {
    state.homeTeams = state.teams;
    state.homeMembers = state.members;
    state.homeTasks = state.tasksAll;
    state.homeComplianceRecords = state.complianceRecords;
    state.homeAttendanceRecords = state.attendanceRecords;
    state.homeNoiQuyOverrideNames = state.noiQuyOverrideNames;
    state.homeSupportRecords = state.supportRecords;
    state.homeTrainingRecords = state.trainingRecords;
    state.homeDanhGiaRecords = state.danhGiaRecords;
    populateHomeTeamFilterOptions();
    renderHomeDashboard();
    loadHomeKpiTheoTask(state.homePeriodId).then(renderHomeDashboard);
  }
}

el.homeFilterPeriod?.addEventListener("change", async () => {
  state.homePeriodId = Number(el.homeFilterPeriod.value);
  state.homeTeamFilter = "";
  await refreshHomeForPeriod(state.homePeriodId);
});

el.homeFilterTeam?.addEventListener("change", () => {
  state.homeTeamFilter = el.homeFilterTeam.value;
  renderHomeDashboard();
});

el.createPeriodBtn.addEventListener("click", async () => {
  const year = Number(el.newYear.value) || today().getFullYear();
  const month = Number(el.newMonth.value) || today().getMonth() + 1;
  try {
    const period = await api("/api/periods", {
      method: "POST",
      body: JSON.stringify({ year, month }),
    });
    state.currentPeriodId = period.id;
    await loadPeriods();
    showToast(`Đã tạo ${period.label}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// Đổi tháng đang chọn — dùng chung cho 3 ô: "Chọn tháng" (Backlog), "Tháng"
// (Team & Nhân sự) và "Đang khai báo cho tháng" (Cấu hình → Team). Đổi ở đâu
// cũng đồng bộ cả ba và nạp lại toàn bộ dữ liệu theo tháng.
async function switchPeriod(newId) {
  state.currentPeriodId = Number(newId);
  const v = String(state.currentPeriodId);
  el.periodSelect.value = v;
  el.teamPeriodSelect.value = v;
  el.configTeamPeriod.value = v;
  await loadTeams();
  await loadMembers();
  await loadComplianceRecords();
  await loadTrainingRecords();
  await loadSupportRecords();
  await loadDanhGiaRecords();
  await loadAttendanceRecords();
}

el.periodSelect.addEventListener("change", () => switchPeriod(el.periodSelect.value));
el.teamPeriodSelect.addEventListener("change", () => switchPeriod(el.teamPeriodSelect.value));
el.configTeamPeriod.addEventListener("change", () => switchPeriod(el.configTeamPeriod.value));

el.deletePeriodBtn.addEventListener("click", async () => {
  if (!state.currentPeriodId) {
    showToast("Chưa có tháng nào để xóa.");
    return;
  }
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  const label = period?.label ?? "tháng này";
  if (!await confirmDialog(`Xóa ${label}? Toàn bộ task và dữ liệu CSKH (Sự cố, Hỗ trợ ticket, Tỉ lệ khởi tạo) của tháng này sẽ bị xóa vĩnh viễn.`)) {
    return;
  }
  try {
    await api(`/api/periods/${state.currentPeriodId}`, { method: "DELETE" });
    state.currentPeriodId = null;
    await Promise.all([loadPeriods(), loadIncidents(), loadTickets(), loadCreationRates()]);
    showToast(`Đã xóa ${label}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Teams ----
// `state.teams` là danh sách team của đúng tháng backlog đang chọn
// (state.currentPeriodId) — gắn theo period giống nhân sự, tải lại mỗi khi
// đổi tháng. Task chọn team từ danh sách này (dropdown) thay vì gõ tự do.

async function loadTeams() {
  if (!state.currentPeriodId) {
    state.teams = [];
    state.currentTeam = "";
    state.currentTeamId = null;
    renderTeamList();
    renderFilterTeamOptions();
    renderMemberTeamFilter();
    renderTieuChi();
    syncHomeFromCurrentIfNeeded();
    await loadTasks();
    return;
  }
  state.teams = await api(`/api/teams?period_id=${state.currentPeriodId}${deptParam()}`);

  const stillExists = state.teams.find((t) => t.name === state.currentTeam);
  if (stillExists) {
    state.currentTeamId = stillExists.id;
  } else {
    state.currentTeam = state.teams[0]?.name ?? "";
    state.currentTeamId = state.teams[0]?.id ?? null;
  }

  if (state.memberFilterTeam && !state.teams.some((t) => t.name === state.memberFilterTeam)) {
    state.memberFilterTeam = "";
  }

  renderTeamList();
  renderFilterTeamOptions();
  renderMemberTeamFilter();
  renderTieuChi();
  syncHomeFromCurrentIfNeeded();
  await loadTasks();
}

el.teamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.newTeamName.value.trim();
  if (!name) {
    showToast("Vui lòng nhập tên team.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  try {
    await api("/api/teams", {
      method: "POST",
      body: JSON.stringify({ name, period_id: state.currentPeriodId, department_id: state.currentDepartmentId ?? undefined }),
    });
    el.newTeamName.value = "";
    await loadTeams();
    showToast(`Đã thêm team ${name}.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// Danh sách team đã khai báo (trang Team & Nhân sự) — click vào tên team để
// chọn làm team mặc định khi tạo nhân sự/sự cố/ticket/tỉ lệ khởi tạo mới;
// click "×" để xóa team.
function renderTeamList() {
  el.teamEmpty.hidden = state.teams.length > 0;
  if (state.currentPeriodId != null) el.configTeamPeriod.value = String(state.currentPeriodId);
  const dept = state.departments.find((d) => d.id === state.currentDepartmentId);
  el.configTeamDept.textContent = dept ? dept.name : "—";
  el.teamList.innerHTML = state.teams
    .map(
      (t) =>
        `<span class="pill${state.currentTeam === t.name ? " active" : ""}" data-id="${t.id}" data-team="${t.name}">${t.name}<span class="pill-x" data-id="${t.id}" title="Xóa team">×</span></span>`,
    )
    .join("");
  el.teamList.querySelectorAll(".pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      state.currentTeam = pill.dataset.team;
      state.currentTeamId = Number(pill.dataset.id);
      renderTeamList();
    });
  });
  el.teamList.querySelectorAll(".pill-x").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!await confirmDialog("Xóa team này? (task đã nhập với team này sẽ được giữ nguyên, nhân sự của team sẽ bị xóa)")) return;
      try {
        await api(`/api/teams/${btn.dataset.id}`, { method: "DELETE" });
        await loadTeams();
        await loadMembers();
        showToast("Đã xóa team.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Dropdown "Team" trong bộ lọc Danh sách task (trang Backlog).
function renderFilterTeamOptions() {
  const options = [`<option value="">Tất cả</option>`]
    .concat(state.teams.map((t) => `<option value="${t.name}">${t.name}</option>`))
    .join("");
  el.filterTeam.innerHTML = options;
  if (!state.teams.some((t) => t.name === state.taskFilters.team)) {
    state.taskFilters.team = "";
  }
  el.filterTeam.value = state.taskFilters.team;
}

// Dropdown "Phân loại" trong bộ lọc Danh sách task (trang Backlog) — lấy
// theo danh mục Phân loại ở Cấu hình, cộng thêm "Nhiệm vụ tồn" (giá trị hệ
// thống tự gắn, không nằm trong danh mục) để vẫn lọc được.
function renderFilterTinhChatOptions() {
  const options = [`<option value="">Tất cả</option>`]
    .concat(state.phanLoaiOptions.map((p) => `<option value="${p.ten_phan_loai}">${p.ten_phan_loai}</option>`))
    .concat([`<option value="Nhiệm vụ tồn">Nhiệm vụ tồn</option>`])
    .join("");
  el.filterTinhChat.innerHTML = options;
  el.filterTinhChat.value = state.taskFilters.tinhChat;
}

// Dropdown "Tag" trong bộ lọc Danh sách task (trang Backlog) — lấy theo danh
// mục Tag ở Cấu hình.
function renderFilterTagOptions() {
  const options = [`<option value="">Tất cả</option>`]
    .concat(state.tags.map((t) => `<option value="${t.ten_tag}">${t.ten_tag}</option>`))
    .join("");
  el.filterTag.innerHTML = options;
  el.filterTag.value = state.taskFilters.tag;
}

el.filterTinhChat.addEventListener("change", () => {
  state.taskFilters.tinhChat = el.filterTinhChat.value;
  applyTaskFilters();
  renderTasks();
});
el.filterKhongTinhDiem.addEventListener("change", () => {
  state.taskFilters.khongTinhDiem = el.filterKhongTinhDiem.value;
  applyTaskFilters();
  renderTasks();
});
el.filterTeam.addEventListener("change", () => {
  state.taskFilters.team = el.filterTeam.value;
  applyTaskFilters();
  renderTasks();
});
el.filterTrangThai.addEventListener("change", () => {
  state.taskFilters.trangThai = el.filterTrangThai.value;
  applyTaskFilters();
  renderTasks();
});
el.filterTag.addEventListener("change", () => {
  state.taskFilters.tag = el.filterTag.value;
  applyTaskFilters();
  renderTasks();
});
el.taskSearch.addEventListener("input", () => {
  state.taskSearch = el.taskSearch.value;
  applyTaskFilters();
  renderTasks();
});

// Bấm vào 1 dòng (ngoài checkbox/nút/ô nhập) -> tô nổi bật dòng đó, giúp dễ
// theo dõi khi bảng nhiều cột phải cuộn ngang. Đăng ký 1 lần trên tbody
// (không mất khi renderTasks() vẽ lại nội dung bên trong).
el.taskTbody.addEventListener("click", (e) => {
  if (e.target.closest("button, a, input, select, textarea, label")) return;
  const tr = e.target.closest("tr");
  if (!tr || !tr.parentElement) return;
  const wasOn = tr.classList.contains("row-highlighted");
  el.taskTbody.querySelectorAll("tr.row-highlighted").forEach((r) => r.classList.remove("row-highlighted"));
  if (!wasOn) tr.classList.add("row-highlighted");
});

function applyTaskFilters() {
  const { tinhChat, khongTinhDiem, team, trangThai, tag } = state.taskFilters;
  const term = state.taskSearch.trim().toLowerCase();
  state.tasks = state.tasksAll.filter((t) => {
    if (team && t.team !== team) return false;
    if (trangThai && t.trang_thai !== trangThai) return false;
    if (tag && t.tag !== tag) return false;
    if (khongTinhDiem === "Đã chuyển" && !t.da_chuyen_thang) return false;
    if (khongTinhDiem === "Không tính điểm" && t.khong_tinh_diem !== "Không tính điểm") return false;
    if (tinhChat) {
      const items = (t.tinh_chat ?? "").split(",").map((v) => v.trim());
      if (!items.includes(tinhChat)) return false;
    }
    if (state.taskWarningFilter === "no-score" && !isTaskNotGraded(t)) return false;
    if (state.taskWarningFilter === "overdue" && !isTaskOverdue(t)) return false;
    if (state.taskWarningFilter === "upcoming" && !isTaskUpcomingDeadline(t)) return false;
    if (term) {
      const haystack = [t.nhiem_vu, t.dod, t.team, t.tag, t.tinh_chat, t.nvtt, t.tien_do, t.cpo_comment]
        .filter(Boolean)
        .join(" \n ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
  taskPagination.reset();
}

