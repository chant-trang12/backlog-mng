const state = {
  periods: [],
  currentPeriodId: null,
  teams: [],
  currentTeam: "",
  currentTeamId: null,
  members: [], // toàn bộ nhân sự (mọi team), mỗi item kèm team_name
  memberFilterTeam: "", // "" = tất cả
  memberSearch: "",
  selectedMemberIds: new Set(),
  tasksAll: [], // toàn bộ task của tháng đang chọn (chưa lọc)
  tasks: [], // task sau khi áp bộ lọc (Tính chất / Team / Trạng thái)
  taskFilters: { tinhChat: "", khongTinhDiem: "", team: "", trangThai: "", tag: "" },
  taskSearch: "",
  taskWarningFilter: "", // "" | "no-score" | "overdue" | "upcoming" — bấm vào 1 cảnh báo để lọc nhanh
  selectedTaskIds: new Set(),
  incidents: [],
  tickets: [],
  creationRates: [],
  complianceRecords: [],
  trainingRecords: [],
  supportRecords: [],
  danhGiaRecords: [],
  tieuChiConfigs: [],
  rankingConfig: { rows: [], columns: [], cells: [] },
  tags: [],
  phanLoaiOptions: [],
  nhomOptions: [],
  chucVuOptions: [],
  homePeriodId: null, // Tháng đang xem ở trang Home — độc lập với period đang chọn ở Backlog/Team
  homeTeamFilter: "", // "" = tất cả team
  homeTeams: [],
  homeMembers: [],
  homeTasks: [],
  homeComplianceRecords: [],
  homeAttendanceRecords: [],
  homeNoiQuyOverrideNames: new Set(),
  homeSupportRecords: [],
  homeTrainingRecords: [],
  homeDanhGiaRecords: [],
  homeRankingSelectedTeam: null, // Team đang xem chi tiết ở tab Ranking (Home)
  attendanceHeaders: [], // cột động lấy từ dòng tiêu đề file Excel đã import
  attendanceRecords: [],
  selectedAttendanceIds: new Set(),
  attendanceSearch: "", // tìm theo từ khoá trên mọi cột (bộ lọc Team không áp dụng cho tab này)
  noiQuyOverrideNames: new Set(), // nhân sự đã "Không tính đi muộn" trong tháng đang chọn
  selectedNoiQuyNames: new Set(),
  noiQuySearch: "",
};

const el = {
  periodSelect: document.getElementById("period-select"),
  teamPeriodSelect: document.getElementById("team-period-select"),
  homeFilterPeriod: document.getElementById("home-filter-period"),
  homeFilterTeam: document.getElementById("home-filter-team"),
  teamFilterTeam: document.getElementById("team-filter-team"),
  newYear: document.getElementById("new-year"),
  newMonth: document.getElementById("new-month"),
  createPeriodBtn: document.getElementById("create-period-btn"),
  deletePeriodBtn: document.getElementById("delete-period-btn"),
  exportBtn: document.getElementById("export-btn"),
  teamForm: document.getElementById("team-form"),
  newTeamName: document.getElementById("new-team-name"),
  teamList: document.getElementById("team-list"),
  teamEmpty: document.getElementById("team-empty"),
  teamFilterEmpty: document.getElementById("team-filter-empty"),
  filterTinhChat: document.getElementById("filter-tinh-chat"),
  filterKhongTinhDiem: document.getElementById("filter-khong-tinh-diem"),
  filterTeam: document.getElementById("filter-team"),
  filterTrangThai: document.getElementById("filter-trang-thai"),
  filterTag: document.getElementById("filter-tag"),
  addMemberBtn: document.getElementById("add-member-btn"),
  downloadMemberTemplateBtn: document.getElementById("download-member-template-btn"),
  importMembersBtn: document.getElementById("import-members-btn"),
  memberFileInput: document.getElementById("member-file-input"),
  memberTbody: document.getElementById("member-tbody"),
  memberSearch: document.getElementById("member-search"),
  memberEmpty: document.getElementById("member-empty"),
  memberSelectAll: document.getElementById("member-select-all"),
  deleteSelectedMembersBtn: document.getElementById("delete-selected-members-btn"),
  selectedMemberCount: document.getElementById("selected-member-count"),
  memberDialog: document.getElementById("member-dialog"),
  memberDialogTitle: document.getElementById("member-dialog-title"),
  memberForm: document.getElementById("member-form"),
  memberCancelBtn: document.getElementById("member-cancel-btn"),
  addTaskBtn: document.getElementById("add-task-btn"),
  taskSearch: document.getElementById("task-search"),
  taskWarningsCard: document.getElementById("task-warnings-card"),
  warningChipNoScore: document.getElementById("warning-chip-no-score"),
  warningCountNoScore: document.getElementById("warning-count-no-score"),
  warningChipOverdue: document.getElementById("warning-chip-overdue"),
  warningCountOverdue: document.getElementById("warning-count-overdue"),
  warningChipUpcoming: document.getElementById("warning-chip-upcoming"),
  warningCountUpcoming: document.getElementById("warning-count-upcoming"),
  taskSelectAll: document.getElementById("task-select-all"),
  moveNextMonthBtn: document.getElementById("move-next-month-btn"),
  selectedTaskCount: document.getElementById("selected-task-count"),
  markNoScoreBtn: document.getElementById("mark-no-score-btn"),
  selectedTaskCount2: document.getElementById("selected-task-count-2"),
  taskTbody: document.getElementById("task-tbody"),
  emptyState: document.getElementById("empty-state"),
  taskDialog: document.getElementById("task-dialog"),
  taskDialogTitle: document.getElementById("task-dialog-title"),
  taskForm: document.getElementById("task-form"),
  cancelBtn: document.getElementById("cancel-btn"),
  gradeDialog: document.getElementById("grade-dialog"),
  gradeForm: document.getElementById("grade-form"),
  gradeCancelBtn: document.getElementById("grade-cancel-btn"),
  addIncidentBtn: document.getElementById("add-incident-btn"),
  incidentTbody: document.getElementById("incident-tbody"),
  incidentEmpty: document.getElementById("incident-empty"),
  incidentDialog: document.getElementById("incident-dialog"),
  incidentDialogTitle: document.getElementById("incident-dialog-title"),
  incidentForm: document.getElementById("incident-form"),
  incidentCancelBtn: document.getElementById("incident-cancel-btn"),
  addComplianceBtn: document.getElementById("add-compliance-btn"),
  complianceTbody: document.getElementById("compliance-tbody"),
  complianceEmpty: document.getElementById("compliance-empty"),
  complianceDialog: document.getElementById("compliance-dialog"),
  complianceDialogTitle: document.getElementById("compliance-dialog-title"),
  complianceForm: document.getElementById("compliance-form"),
  complianceCancelBtn: document.getElementById("compliance-cancel-btn"),
  addTrainingBtn: document.getElementById("add-training-btn"),
  trainingTbody: document.getElementById("training-tbody"),
  trainingEmpty: document.getElementById("training-empty"),
  trainingDialog: document.getElementById("training-dialog"),
  trainingDialogTitle: document.getElementById("training-dialog-title"),
  trainingForm: document.getElementById("training-form"),
  trainingCancelBtn: document.getElementById("training-cancel-btn"),
  addSupportBtn: document.getElementById("add-support-btn"),
  supportTbody: document.getElementById("support-tbody"),
  supportEmpty: document.getElementById("support-empty"),
  supportDialog: document.getElementById("support-dialog"),
  supportDialogTitle: document.getElementById("support-dialog-title"),
  supportForm: document.getElementById("support-form"),
  supportCancelBtn: document.getElementById("support-cancel-btn"),
  addDanhGiaBtn: document.getElementById("add-danhgia-btn"),
  danhGiaTbody: document.getElementById("danhgia-tbody"),
  danhGiaEmpty: document.getElementById("danhgia-empty"),
  danhGiaDialog: document.getElementById("danhgia-dialog"),
  danhGiaDialogTitle: document.getElementById("danhgia-dialog-title"),
  danhGiaForm: document.getElementById("danhgia-form"),
  danhGiaCancelBtn: document.getElementById("danhgia-cancel-btn"),
  addTieuChiBtn: document.getElementById("add-tieuchi-btn"),
  tieuChiTbody: document.getElementById("tieuchi-tbody"),
  tieuChiEmpty: document.getElementById("tieuchi-empty"),
  tieuChiTheadRow: document.getElementById("tieuchi-thead-row"),
  tieuChiTongDiemRow: document.getElementById("tieuchi-tongdiem-row"),
  tieuChiDialog: document.getElementById("tieuchi-dialog"),
  tieuChiDialogTitle: document.getElementById("tieuchi-dialog-title"),
  tieuChiForm: document.getElementById("tieuchi-form"),
  tieuChiCancelBtn: document.getElementById("tieuchi-cancel-btn"),
  addRankingColumnBtn: document.getElementById("add-ranking-column-btn"),
  addRankingRowBtn: document.getElementById("add-ranking-row-btn"),
  rankingTheadRow: document.getElementById("ranking-thead-row"),
  rankingTbody: document.getElementById("ranking-tbody"),
  rankingEmpty: document.getElementById("ranking-empty"),
  addTagBtn: document.getElementById("add-tag-btn"),
  tagConfigTbody: document.getElementById("tag-config-tbody"),
  tagConfigEmpty: document.getElementById("tag-config-empty"),
  addPhanLoaiBtn: document.getElementById("add-phanloai-btn"),
  phanLoaiConfigTbody: document.getElementById("phanloai-config-tbody"),
  phanLoaiConfigEmpty: document.getElementById("phanloai-config-empty"),
  addNhomBtn: document.getElementById("add-nhom-btn"),
  nhomConfigTbody: document.getElementById("nhom-config-tbody"),
  nhomConfigEmpty: document.getElementById("nhom-config-empty"),
  addChucVuBtn: document.getElementById("add-chucvu-btn"),
  chucVuConfigTbody: document.getElementById("chucvu-config-tbody"),
  chucVuConfigEmpty: document.getElementById("chucvu-config-empty"),
  importAttendanceBtn: document.getElementById("import-attendance-btn"),
  attendanceFileInput: document.getElementById("attendance-file-input"),
  attendanceSearch: document.getElementById("attendance-search"),
  attendanceThead: document.getElementById("attendance-thead"),
  attendanceTbody: document.getElementById("attendance-tbody"),
  attendanceEmpty: document.getElementById("attendance-empty"),
  noiQuyTbody: document.getElementById("noiquy-tbody"),
  noiQuyEmpty: document.getElementById("noiquy-empty"),
  noiQuySearch: document.getElementById("noiquy-search"),
  markExcludedNoiQuyBtn: document.getElementById("mark-excluded-noiquy-btn"),
  unmarkExcludedNoiQuyBtn: document.getElementById("unmark-excluded-noiquy-btn"),
  markExcludedAttendanceBtn: document.getElementById("mark-excluded-attendance-btn"),
  unmarkExcludedAttendanceBtn: document.getElementById("unmark-excluded-attendance-btn"),
  deleteSelectedAttendanceBtn: document.getElementById("delete-selected-attendance-btn"),
  selectedAttendanceCount: document.getElementById("selected-attendance-count"),
  addTicketBtn: document.getElementById("add-ticket-btn"),
  ticketTbody: document.getElementById("ticket-tbody"),
  ticketEmpty: document.getElementById("ticket-empty"),
  ticketDialog: document.getElementById("ticket-dialog"),
  ticketDialogTitle: document.getElementById("ticket-dialog-title"),
  ticketForm: document.getElementById("ticket-form"),
  ticketCancelBtn: document.getElementById("ticket-cancel-btn"),
  addCreationRateBtn: document.getElementById("add-creation-rate-btn"),
  creationRateTbody: document.getElementById("creation-rate-tbody"),
  creationRateEmpty: document.getElementById("creation-rate-empty"),
  creationRateDialog: document.getElementById("creation-rate-dialog"),
  creationRateDialogTitle: document.getElementById("creation-rate-dialog-title"),
  creationRateForm: document.getElementById("creation-rate-form"),
  creationRateCancelBtn: document.getElementById("creation-rate-cancel-btn"),
};

const STATUS_CLASS = {
  "Chưa thực hiện": "status-default",
  "Đang thực hiện": "status-dang-thuc-hien",
  "Hoàn thành": "status-hoan-thanh",
  "Hủy": "status-huy",
};

// Màu badge Tag/Phân loại gán tự động theo VỊ TRÍ trong danh mục (state.tags /
// state.phanLoaiOptions, quản lý ở Cấu hình → Tag & Phân loại) — không lưu
// màu trong DB. 4/8 màu đầu giữ đúng như bảng màu cố định trước đây để không
// đổi giao diện của các giá trị gốc; các màu sau dùng khi thêm tag/phân loại
// mới, lặp lại theo chu kỳ nếu vượt quá độ dài palette.
const TAG_PALETTE = [
  { bg: "#d7f0ee", text: "#0e6e64" },
  { bg: "#f6e6bd", text: "#8a5a12" },
  { bg: "#dbe4f5", text: "#2c4a8a" },
  { bg: "#f8dbe6", text: "#93265a" },
  { bg: "#e6dcf5", text: "#5c3494" },
  { bg: "#d6ebf5", text: "#1f5f80" },
  { bg: "#dfe8cf", text: "#4a5f2e" },
  { bg: "#ecdccb", text: "#7a4a28" },
  { bg: "#fde2d0", text: "#9a4a12" },
  { bg: "#d9f0d3", text: "#2f6e3a" },
  { bg: "#e0e0f5", text: "#3d3d8a" },
  { bg: "#fbe3ec", text: "#8a2f5c" },
];

const PHAN_LOAI_PALETTE = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#ffedd5", text: "#9a3412" },
  { bg: "#d7f0ee", text: "#0e6e64" },
  { bg: "#dfe8cf", text: "#4a5f2e" },
  { bg: "#f6e6bd", text: "#8a5a12" },
  { bg: "#e6dcf5", text: "#5c3494" },
];

// "Nhiệm vụ tồn" là giá trị hệ thống tự gắn khi chuyển task sang tháng sau
// (task.service.ts::addTinhChatTon) — không nằm trong danh mục Phân loại có
// thể sửa/xóa ở Cấu hình, luôn giữ màu cố định riêng (.tinh-chat-ton).
function tagBadgeAttrs(value) {
  const idx = state.tags.findIndex((t) => t.ten_tag === value);
  if (idx === -1) return `class="status-badge status-default"`;
  const c = TAG_PALETTE[idx % TAG_PALETTE.length];
  return `class="status-badge" style="background:${c.bg};color:${c.text}"`;
}

function phanLoaiBadgeAttrs(value) {
  if (value === "Nhiệm vụ tồn") return `class="status-badge tinh-chat-ton"`;
  const idx = state.phanLoaiOptions.findIndex((p) => p.ten_phan_loai === value);
  if (idx === -1) return `class="status-badge status-default"`;
  const c = PHAN_LOAI_PALETTE[idx % PHAN_LOAI_PALETTE.length];
  return `class="status-badge" style="background:${c.bg};color:${c.text}"`;
}

// Hiển thị Tính chất dạng badge giống cột Trạng thái — mỗi giá trị đã chọn là
// 1 badge, mỗi loại 1 màu riêng để dễ phân biệt.
function renderTinhChatBadges(value) {
  const items = (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const badges = items.map((item) => `<span ${phanLoaiBadgeAttrs(item)}>${item}</span>`).join("");
  return badges ? `<div class="badge-group">${badges}</div>` : "";
}

// Loại (tab Đào tạo) — "Đào tạo" / "Chứng chỉ QT", mỗi loại 1 màu riêng.
const LOAI_CLASS = {
  "Đào tạo": "loai-dao-tao",
  "Chứng chỉ QT": "loai-chung-chi",
};

function loaiColorClass(value) {
  return LOAI_CLASS[value] || "status-default";
}

const TEAM_COLOR_COUNT = 6;

// Mỗi team 1 màu riêng — lấy theo vị trí của team trong state.teams (danh
// sách team đã khai báo) để các team hiện có không bị trùng màu nhau; nếu
// nhiều hơn TEAM_COLOR_COUNT team thì các team sau sẽ quay vòng lại màu đầu.
function teamColorClass(teamName) {
  const index = state.teams.findIndex((t) => t.name === teamName);
  const safeIndex = index === -1 ? 0 : index;
  return `team-color-${safeIndex % TEAM_COLOR_COUNT}`;
}

// Mỗi Nhóm tiêu chí (trang Cấu hình → Cấu hình → Nhóm) 1 màu riêng, theo vị
// trí trong danh mục state.nhomOptions — cùng bảng màu với team-color-N.
function nhomColorClass(nhom) {
  const index = state.nhomOptions.findIndex((n) => n.ten_nhom === nhom);
  const safeIndex = index === -1 ? 0 : index;
  return `team-color-${safeIndex % TEAM_COLOR_COUNT}`;
}

// Phân trang dùng chung cho mọi bảng dữ liệu (Nhân sự, Sự cố, Hỗ trợ ticket,
// Tỉ lệ khởi tạo) — cùng hành vi với bảng Danh sách nhiệm vụ: 20 dòng/trang
// mặc định, chọn được 20/50/100, chỉ ảnh hưởng phần hiển thị (chọn/sửa/xóa
// vẫn thao tác trên toàn bộ danh sách).
function createPagination(prefix, onChange) {
  const pageSizeEl = document.getElementById(`${prefix}-page-size`);
  const prevEl = document.getElementById(`${prefix}-page-prev`);
  const nextEl = document.getElementById(`${prefix}-page-next`);
  const infoEl = document.getElementById(`${prefix}-page-info`);
  const controller = { page: 1, pageSize: 20 };

  pageSizeEl.addEventListener("change", () => {
    controller.pageSize = Number(pageSizeEl.value) || 20;
    controller.page = 1;
    onChange();
  });
  prevEl.addEventListener("click", () => {
    controller.page -= 1;
    onChange();
  });
  nextEl.addEventListener("click", () => {
    controller.page += 1;
    onChange();
  });

  controller.reset = () => {
    controller.page = 1;
  };

  controller.slice = (items) => {
    const totalPages = Math.max(1, Math.ceil(items.length / controller.pageSize));
    if (controller.page > totalPages) controller.page = totalPages;
    if (controller.page < 1) controller.page = 1;

    infoEl.textContent = items.length === 0 ? "0 / 0" : `Trang ${controller.page} / ${totalPages}`;
    prevEl.disabled = controller.page <= 1;
    nextEl.disabled = controller.page >= totalPages;
    pageSizeEl.value = String(controller.pageSize);

    const start = (controller.page - 1) * controller.pageSize;
    return items.slice(start, start + controller.pageSize);
  };

  return controller;
}

const taskPagination = createPagination("task", () => renderTasks());
const memberPagination = createPagination("member", () => renderMemberTable());
const incidentPagination = createPagination("incident", () => renderIncidents());
const ticketPagination = createPagination("ticket", () => renderTickets());
const creationRatePagination = createPagination("creation-rate", () => renderCreationRates());
const compliancePagination = createPagination("compliance", () => renderComplianceRecords());
const trainingPagination = createPagination("training", () => renderTrainingRecords());
const supportPagination = createPagination("support", () => renderSupportRecords());
const danhGiaPagination = createPagination("danhgia", () => renderDanhGiaRecords());
const attendancePagination = createPagination("attendance", () => renderAttendanceTable());
const noiQuyPagination = createPagination("noiquy", () => renderNoiQuyTable());

function today() {
  return new Date();
}

const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-hide");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, 3000);
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    if (body.loginUrl) {
      window.location.href = body.loginUrl;
      return null;
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Lỗi ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function formatDateInput(value) {
  return value ? value.slice(0, 10) : "";
}

function formatDateDisplay(value) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
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
  } else {
    const [teams, members, tasks, compliance, attendance, noiQuyOverrides, support, training, danhGia] = await Promise.all([
      api(`/api/teams?period_id=${periodId}`),
      api(`/api/members?period_id=${periodId}`),
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

el.periodSelect.addEventListener("change", async () => {
  state.currentPeriodId = Number(el.periodSelect.value);
  el.teamPeriodSelect.value = el.periodSelect.value;
  await loadTeams();
  await loadMembers();
  await loadComplianceRecords();
  await loadTrainingRecords();
  await loadSupportRecords();
  await loadDanhGiaRecords();
  await loadAttendanceRecords();
});

// Bộ lọc "Tháng" ở trang Team & Nhân sự — dùng chung state.currentPeriodId
// với "Chọn tháng" ở trang Backlog, đổi ở đâu cũng đồng bộ hai nơi.
el.teamPeriodSelect.addEventListener("change", async () => {
  state.currentPeriodId = Number(el.teamPeriodSelect.value);
  el.periodSelect.value = el.teamPeriodSelect.value;
  await loadTeams();
  await loadMembers();
  await loadComplianceRecords();
  await loadTrainingRecords();
  await loadSupportRecords();
  await loadDanhGiaRecords();
  await loadAttendanceRecords();
});

el.deletePeriodBtn.addEventListener("click", async () => {
  if (!state.currentPeriodId) {
    showToast("Chưa có tháng nào để xóa.");
    return;
  }
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  const label = period?.label ?? "tháng này";
  if (!confirm(`Xóa ${label}? Toàn bộ task và dữ liệu CSKH (Sự cố, Hỗ trợ ticket, Tỉ lệ khởi tạo) của tháng này sẽ bị xóa vĩnh viễn.`)) {
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
  state.teams = await api(`/api/teams?period_id=${state.currentPeriodId}`);

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
      body: JSON.stringify({ name, period_id: state.currentPeriodId }),
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
      if (!confirm("Xóa team này? (task đã nhập với team này sẽ được giữ nguyên, nhân sự của team sẽ bị xóa)")) return;
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

// ---- Members (bảng CRUD: STT / Họ và Tên / Chức vụ / Team) ----

async function loadMembers() {
  if (!state.currentPeriodId) {
    state.members = [];
    renderMemberTeamFilter();
    renderMemberTable();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.members = await api(`/api/members?period_id=${state.currentPeriodId}`);
  const memberIds = new Set(state.members.map((m) => m.id));
  state.selectedMemberIds.forEach((id) => {
    if (!memberIds.has(id)) state.selectedMemberIds.delete(id);
  });
  renderMemberTeamFilter();
  renderMemberTable();
  syncHomeFromCurrentIfNeeded();
}

// Lọc bảng Nhân sự theo team — dùng dropdown "Team" trong khung Bộ lọc.
function renderMemberTeamFilter() {
  el.teamFilterTeam.innerHTML = [`<option value="">Tất cả</option>`]
    .concat(state.teams.map((t) => `<option value="${t.name}">${t.name}</option>`))
    .join("");
  el.teamFilterTeam.value = state.memberFilterTeam;
}

el.teamFilterTeam.addEventListener("change", () => {
  state.memberFilterTeam = el.teamFilterTeam.value;
  memberPagination.reset();
  compliancePagination.reset();
  trainingPagination.reset();
  supportPagination.reset();
  danhGiaPagination.reset();
  renderMemberTeamFilter();
  renderMemberTable();
  renderComplianceRecords();
  renderTrainingRecords();
  renderSupportRecords();
  renderDanhGiaRecords();
});

function filteredMembers() {
  let list = state.memberFilterTeam ? state.members.filter((m) => m.team_name === state.memberFilterTeam) : state.members;
  const term = state.memberSearch.trim().toLowerCase();
  if (term) {
    list = list.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(term) ||
        (m.chuc_vu ?? "").toLowerCase().includes(term) ||
        (m.team_name ?? "").toLowerCase().includes(term),
    );
  }
  return list;
}

// Dùng chung dropdown "Team" trong khung Bộ lọc để lọc luôn bảng Tuân thủ và
// Đào tạo (không chỉ bảng Nhân sự), vì cả 2 bảng này đều có sẵn team_name.
function filteredComplianceRecords() {
  if (!state.memberFilterTeam) return state.complianceRecords;
  return state.complianceRecords.filter((c) => c.team_name === state.memberFilterTeam);
}

function filteredTrainingRecords() {
  if (!state.memberFilterTeam) return state.trainingRecords;
  return state.trainingRecords.filter((t) => t.team_name === state.memberFilterTeam);
}

function updateMemberSelectionUI() {
  const visible = filteredMembers();
  const visibleSelectedCount = visible.filter((m) => state.selectedMemberIds.has(m.id)).length;
  el.deleteSelectedMembersBtn.hidden = state.selectedMemberIds.size === 0;
  el.selectedMemberCount.textContent = String(state.selectedMemberIds.size);
  el.memberSelectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
  el.memberSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
}

function renderMemberTable() {
  const visible = filteredMembers();
  el.memberEmpty.hidden = visible.length > 0;
  const pageItems = memberPagination.slice(visible);
  const pageStart = (memberPagination.page - 1) * memberPagination.pageSize;
  // Cột "Nội quy" tổng hợp từ cột Total của tab Nội quy (map theo tên nhân
  // sự), không còn nhập tay — hiển thị "-N" khi Total > 0, ngược lại để trống.
  const noiQuyByName = new Map(computeNoiQuyRows().map((r) => [r.name, r.total]));
  el.memberTbody.innerHTML = pageItems
    .map((m, i) => {
      const noiQuyTotal = noiQuyByName.get(m.name) ?? 0;
      return `
    <tr data-id="${m.id}">
      <td><input type="checkbox" class="member-row-checkbox" ${state.selectedMemberIds.has(m.id) ? "checked" : ""} /></td>
      <td>${pageStart + i + 1}</td>
      <td>${m.name}</td>
      <td>${m.chuc_vu ?? ""}</td>
      <td><span class="status-badge ${teamColorClass(m.team_name)}">${m.team_name}</span></td>
      <td>${m.tuan_thu ?? ""}</td>
      <td>${noiQuyTotal > 0 ? `-${noiQuyTotal}` : ""}</td>
      <td>${m.dao_tao ?? ""}</td>
      <td>${m.ho_tro ?? ""}</td>
      <td>${m.danh_gia ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-member-btn">Sửa</button>
        <button class="small btn-delete delete-member-btn">Xóa</button>
      </div></td>
    </tr>`;
    })
    .join("");

  el.memberTbody.querySelectorAll(".member-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedMemberIds.add(id);
      } else {
        state.selectedMemberIds.delete(id);
      }
      updateMemberSelectionUI();
    });
  });
  el.memberTbody.querySelectorAll(".edit-member-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openMemberDialog(state.members.find((m) => m.id === id));
    });
  });
  el.memberTbody.querySelectorAll(".delete-member-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa nhân sự này?")) return;
      try {
        await api(`/api/members/${id}`, { method: "DELETE" });
        state.selectedMemberIds.delete(id);
        await loadMembers();
        showToast("Đã xóa nhân sự.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateMemberSelectionUI();
}

el.memberSearch.addEventListener("input", () => {
  state.memberSearch = el.memberSearch.value;
  memberPagination.reset();
  renderMemberTable();
});

el.memberSelectAll.addEventListener("change", (e) => {
  const visible = filteredMembers();
  if (e.target.checked) {
    visible.forEach((m) => state.selectedMemberIds.add(m.id));
  } else {
    visible.forEach((m) => state.selectedMemberIds.delete(m.id));
  }
  renderMemberTable();
});

el.deleteSelectedMembersBtn.addEventListener("click", async () => {
  const ids = [...state.selectedMemberIds];
  if (ids.length === 0) return;
  if (!confirm(`Xóa ${ids.length} nhân sự đã chọn?`)) return;
  try {
    await api("/api/members/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedMemberIds.clear();
    await loadMembers();
    showToast(`Đã xóa ${ids.length} nhân sự.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

function openMemberDialog(member) {
  el.memberForm.reset();
  document.getElementById("m-id").value = member?.id ?? "";
  el.memberDialogTitle.textContent = member ? "Sửa nhân sự" : "Thêm nhân sự";

  const teamSelectEl = document.getElementById("m-team");
  teamSelectEl.innerHTML = state.teams
    .map((t) => `<option value="${t.id}">${t.name}</option>`)
    .join("");
  teamSelectEl.value = String(member?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");

  document.getElementById("m-name").value = member?.name ?? "";
  const chucVuSelect = document.getElementById("m-chuc-vu");
  chucVuSelect.innerHTML =
    `<option value="">-- Chọn chức vụ --</option>` +
    state.chucVuOptions.map((c) => `<option value="${c.ten_chuc_vu}">${c.ten_chuc_vu}</option>`).join("");
  chucVuSelect.value = member?.chuc_vu ?? "";
  el.memberDialog.showModal();
}

el.addMemberBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước khi thêm nhân sự.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy tạo ít nhất một tháng backlog trước khi thêm nhân sự.");
    return;
  }
  openMemberDialog(null);
});

el.memberCancelBtn.addEventListener("click", () => el.memberDialog.close());

el.downloadMemberTemplateBtn.addEventListener("click", () => {
  window.location.href = "/api/members/import-template";
});

el.importMembersBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  el.memberFileInput.click();
});

el.memberFileInput.addEventListener("change", async () => {
  const file = el.memberFileInput.files[0];
  el.memberFileInput.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/members/import?period_id=${state.currentPeriodId}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadTeams();
    await loadMembers();

    let msg = `Đã nhập ${result.imported} nhân sự.`;
    if (result.teamsCreated?.length) {
      msg += ` Tạo mới ${result.teamsCreated.length} team: ${result.teamsCreated.join(", ")}.`;
    }
    if (result.skipped?.length) {
      const detail = result.skipped
        .slice(0, 5)
        .map((s) => `dòng ${s.row}${s.name ? ` (${s.name})` : ""}: ${s.reason}`)
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

el.memberForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("m-id").value;
  const payload = {
    name: document.getElementById("m-name").value.trim(),
    chuc_vu: document.getElementById("m-chuc-vu").value.trim() || undefined,
    team_id: Number(document.getElementById("m-team").value),
    period_id: state.currentPeriodId,
  };

  try {
    if (id) {
      await api(`/api/members/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.memberDialog.close();
      await loadMembers();
      showToast("Đã cập nhật nhân sự.", "success");
    } else {
      await api("/api/members", { method: "POST", body: JSON.stringify(payload) });
      el.memberDialog.close();
      await loadMembers();
      showToast("Đã thêm nhân sự.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Tasks ----

async function loadTasks() {
  if (!state.currentPeriodId) {
    state.tasksAll = [];
    state.tasks = [];
    renderTasks();
    renderTaskWarnings();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.tasksAll = await api(`/api/periods/${state.currentPeriodId}/tasks`);
  const taskIds = new Set(state.tasksAll.map((t) => t.id));
  state.selectedTaskIds.forEach((id) => {
    if (!taskIds.has(id)) state.selectedTaskIds.delete(id);
  });
  applyTaskFilters();
  renderTasks();
  renderTaskWarnings();
  syncHomeFromCurrentIfNeeded();
}

function renderEmpty() {
  el.taskTbody.innerHTML = "";
  el.emptyState.hidden = false;
}

function renderTasks() {
  el.emptyState.hidden = state.periods.length !== 0;
  if (state.tasksAll.length === 0) {
    el.taskTbody.innerHTML = `<tr><td colspan="15" class="muted" style="text-align:center;padding:16px">Chưa có task nào trong tháng này.</td></tr>`;
    updateTaskSelectionUI();
    taskPagination.slice(state.tasks);
    return;
  }
  if (state.tasks.length === 0) {
    el.taskTbody.innerHTML = `<tr><td colspan="15" class="muted" style="text-align:center;padding:16px">Không có task nào khớp bộ lọc.</td></tr>`;
    updateTaskSelectionUI();
    taskPagination.slice(state.tasks);
    return;
  }

  const pageItems = taskPagination.slice(state.tasks);

  el.taskTbody.innerHTML = pageItems
    .map((t) => {
      const statusClass = STATUS_CLASS[t.trang_thai] || "status-default";
      return `
    <tr data-id="${t.id}">
      <td><input type="checkbox" class="task-row-checkbox" ${state.selectedTaskIds.has(t.id) ? "checked" : ""} /></td>
      <td>${t.stt}</td>
      <td>${t.tag ? `<span ${tagBadgeAttrs(t.tag)}>${t.tag}</span>` : ""}</td>
      <td>${renderTinhChatBadges(t.tinh_chat)}</td>
      <td><span class="status-badge ${teamColorClass(t.team)}">${t.team}</span></td>
      <td>${t.nhiem_vu}</td>
      <td>${(t.dod ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${formatDateDisplay(t.deadline)}</td>
      <td>
        <span class="progress-bar"><span style="width:${Math.min(100, Math.max(0, t.phan_tram_hoan_thanh))}%"></span></span>${t.phan_tram_hoan_thanh}%
      </td>
      <td><span class="status-badge ${statusClass}">${t.trang_thai}</span></td>
      <td>${(t.tien_do ?? "").replace(/\n/g, "<br/>")}</td>
      <td>
        <div class="badge-group">
          ${t.khong_tinh_diem ? `<span class="status-badge tinh-chat-khong-tinh-diem">${t.khong_tinh_diem}</span>` : ""}
          ${t.da_chuyen_thang ? `<span class="status-badge tinh-chat-da-chuyen" title="Đã chuyển sang tháng sau, không thể chuyển tiếp">Đã chuyển</span>` : ""}
        </div>
      </td>
      <td>${t.cpo_danh_gia !== null ? t.cpo_danh_gia + "%" : ""}</td>
      <td>${(t.cpo_comment ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-btn">Sửa</button>
        <button class="small btn-delete delete-btn">Xóa</button>
        <button class="small btn-grade grade-btn">Chấm điểm</button>
      </div></td>
    </tr>`;
    })
    .join("");

  el.taskTbody.querySelectorAll(".task-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedTaskIds.add(id);
      } else {
        state.selectedTaskIds.delete(id);
      }
      updateTaskSelectionUI();
    });
  });
  el.taskTbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTaskDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openGradeDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa task này?")) return;
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        state.selectedTaskIds.delete(id);
        await loadTasks();
        showToast("Đã xóa task.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateTaskSelectionUI();
}

function updateTaskSelectionUI() {
  const visible = state.tasks;
  const visibleSelectedCount = visible.filter((t) => state.selectedTaskIds.has(t.id)).length;
  const hasAlreadyMovedSelected = state.tasksAll.some(
    (t) => state.selectedTaskIds.has(t.id) && t.da_chuyen_thang,
  );
  el.moveNextMonthBtn.hidden = state.selectedTaskIds.size === 0;
  el.moveNextMonthBtn.disabled = hasAlreadyMovedSelected;
  el.moveNextMonthBtn.title = hasAlreadyMovedSelected
    ? "Trong lựa chọn có task đã được chuyển sang tháng sau — bỏ chọn task đó để tiếp tục."
    : "";
  el.selectedTaskCount.textContent = String(state.selectedTaskIds.size);
  el.markNoScoreBtn.hidden = state.selectedTaskIds.size === 0;
  el.selectedTaskCount2.textContent = String(state.selectedTaskIds.size);
  el.taskSelectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
  el.taskSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
}

el.taskSelectAll.addEventListener("change", (e) => {
  if (e.target.checked) {
    state.tasks.forEach((t) => state.selectedTaskIds.add(t.id));
  } else {
    state.tasks.forEach((t) => state.selectedTaskIds.delete(t.id));
  }
  renderTasks();
});

el.moveNextMonthBtn.addEventListener("click", async () => {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !confirm(
      `Chuyển ${ids.length} task đã chọn sang tháng sau? Task sẽ được đánh dấu "Nhiệm vụ tồn".`,
    )
  ) {
    return;
  }
  try {
    const result = await api(`/api/periods/${state.currentPeriodId}/tasks/move-to-next-month`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadPeriods();
    const skippedCount = result.skippedAlreadyMoved?.length ?? 0;
    const skippedNote = skippedCount > 0 ? ` (bỏ qua ${skippedCount} task đã chuyển trước đó)` : "";
    showToast(`Đã chuyển ${result.moved.length} task sang ${result.targetPeriod.label}.${skippedNote}`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.markNoScoreBtn.addEventListener("click", async () => {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!confirm(`Đánh dấu "Không tính điểm" cho ${ids.length} task đã chọn?`)) return;
  try {
    await api("/api/tasks/mark-no-score", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã đánh dấu "Không tính điểm" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Task dialog (create / update — dùng chung cho nhập mới và cập nhật tiến độ) ----

const teamSelect = document.getElementById("f-team");

function setTinhChatValue(value) {
  const selected = new Set(
    (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  document.querySelectorAll('#f-tinh-chat-group input[type="checkbox"]').forEach((cb) => {
    cb.checked = selected.has(cb.value);
  });
}

function getTinhChatValue() {
  return [...document.querySelectorAll('#f-tinh-chat-group input[type="checkbox"]:checked')]
    .map((cb) => cb.value)
    .join(", ");
}

function openTaskDialog(task) {
  el.taskForm.reset();
  document.getElementById("task-id").value = task?.id ?? "";
  el.taskDialogTitle.textContent = task ? `Cập nhật task #${task.stt}` : "Nhập task mới";

  teamSelect.innerHTML = state.teams
    .map((t) => `<option value="${t.name}">${t.name}</option>`)
    .join("");
  const chosenTeam = task?.team || state.taskFilters.team || state.currentTeam || state.teams[0]?.name || "";
  teamSelect.value = chosenTeam;

  const tagSelect = document.getElementById("f-tag");
  tagSelect.innerHTML =
    `<option value="">-- Không chọn --</option>` +
    state.tags.map((t) => `<option value="${t.ten_tag}">${t.ten_tag}</option>`).join("");
  tagSelect.value = task?.tag ?? "";

  document.getElementById("f-tinh-chat-group").innerHTML = state.phanLoaiOptions
    .map((p) => `<label class="checkbox-option"><input type="checkbox" value="${p.ten_phan_loai}" /> ${p.ten_phan_loai}</label>`)
    .join("");
  setTinhChatValue(task?.tinh_chat ?? "");
  document.getElementById("f-nhiem-vu").value = task?.nhiem_vu ?? "";
  document.getElementById("f-dod").value = task?.dod ?? "";
  document.getElementById("f-deadline").value = formatDateInput(task?.deadline);
  document.getElementById("f-phan-tram").value = task?.phan_tram_hoan_thanh ?? 0;
  document.getElementById("f-trang-thai").value = task?.trang_thai ?? "Chưa thực hiện";
  document.getElementById("f-tien-do").value = task?.tien_do ?? "";
  el.taskDialog.showModal();
}

el.addTaskBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy tạo một tháng backlog trước.");
    return;
  }
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước khi nhập task.");
    return;
  }
  openTaskDialog(null);
});

el.cancelBtn.addEventListener("click", () => el.taskDialog.close());

el.taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("task-id").value;
  const payload = {
    team: document.getElementById("f-team").value.trim(),
    tinh_chat: getTinhChatValue() || undefined,
    tag: document.getElementById("f-tag").value || undefined,
    nhiem_vu: document.getElementById("f-nhiem-vu").value.trim(),
    dod: document.getElementById("f-dod").value.trim() || undefined,
    deadline: document.getElementById("f-deadline").value || undefined,
    phan_tram_hoan_thanh: Number(document.getElementById("f-phan-tram").value) || 0,
    trang_thai: document.getElementById("f-trang-thai").value,
    tien_do: document.getElementById("f-tien-do").value.trim() || undefined,
  };

  try {
    if (id) {
      await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.taskDialog.close();
      await loadTasks();
      showToast("Đã cập nhật task.", "success");
    } else {
      await api(`/api/periods/${state.currentPeriodId}/tasks`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      el.taskDialog.close();
      await loadTasks();
      showToast("Đã thêm task mới.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Chấm điểm (% Đánh giá, Nội dung đánh giá) ----

function openGradeDialog(task) {
  el.gradeForm.reset();
  document.getElementById("grade-task-id").value = task?.id ?? "";
  document.getElementById("grade-percent").value = task?.cpo_danh_gia ?? "";
  document.getElementById("grade-comment").value = task?.cpo_comment ?? "";
  el.gradeDialog.showModal();
}

el.gradeCancelBtn.addEventListener("click", () => el.gradeDialog.close());

el.gradeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("grade-task-id").value;
  const percentValue = document.getElementById("grade-percent").value;
  const payload = {
    cpo_danh_gia: percentValue ? Number(percentValue) : undefined,
    cpo_comment: document.getElementById("grade-comment").value.trim() || undefined,
  };

  try {
    await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    el.gradeDialog.close();
    await loadTasks();
    showToast("Đã lưu chấm điểm.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Export ----

el.exportBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  const query = state.taskFilters.team
    ? `?team=${encodeURIComponent(state.taskFilters.team)}`
    : "";
  window.location.href = `/api/periods/${state.currentPeriodId}/tasks/export${query}`;
});

// ---- CSKH: Sự cố / Hỗ trợ ticket / Tỉ lệ khởi tạo (CRUD theo team) ----

function teamOptionsHtml() {
  return state.teams.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
}

function periodOptionsHtml() {
  return state.periods.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

document.querySelectorAll("#cskh-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#cskh-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["incidents", "tickets", "creation-rates"].forEach((tab) => {
      document.getElementById(`cskh-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

document.querySelectorAll("#config-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#config-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["tieuchi", "ranking", "tagphanloai"].forEach((tab) => {
      document.getElementById(`config-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

document.querySelectorAll("#team-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#team-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["nhansu", "tuanthu", "noiquy", "daotao", "hotro", "danhgia", "chamcong"].forEach((tab) => {
      document.getElementById(`team-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

document.querySelectorAll("#home-subnav .pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll("#home-subnav .pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    ["ranking", "tonghop", "tyle-hoanthanh"].forEach((tab) => {
      document.getElementById(`home-tab-${tab}`).hidden = tab !== pill.dataset.tab;
    });
  });
});

// -- Sự cố --

async function loadIncidents() {
  state.incidents = await api("/api/incidents");
  renderIncidents();
}

function renderIncidents() {
  el.incidentEmpty.hidden = state.incidents.length > 0;
  const pageItems = incidentPagination.slice(state.incidents);
  el.incidentTbody.innerHTML = pageItems
    .map(
      (i) => `
    <tr data-id="${i.id}">
      <td>${i.period_label}</td>
      <td>${i.team_name}</td>
      <td>${(i.su_co ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${i.tinh_chat ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-incident-btn">Sửa</button>
        <button class="small btn-delete delete-incident-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.incidentTbody.querySelectorAll(".edit-incident-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openIncidentDialog(state.incidents.find((i) => i.id === id));
    });
  });
  el.incidentTbody.querySelectorAll(".delete-incident-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa sự cố này?")) return;
      try {
        await api(`/api/incidents/${id}`, { method: "DELETE" });
        await loadIncidents();
        showToast("Đã xóa sự cố.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openIncidentDialog(incident) {
  el.incidentForm.reset();
  document.getElementById("inc-id").value = incident?.id ?? "";
  el.incidentDialogTitle.textContent = incident ? "Sửa sự cố" : "Thêm sự cố";
  const periodSelectEl = document.getElementById("inc-period");
  periodSelectEl.innerHTML = periodOptionsHtml();
  periodSelectEl.value = String(incident?.period_id ?? state.currentPeriodId ?? state.periods[0]?.id ?? "");
  const teamSelectEl = document.getElementById("inc-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(incident?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  document.getElementById("inc-su-co").value = incident?.su_co ?? "";
  document.getElementById("inc-tinh-chat").value = incident?.tinh_chat ?? "";
  el.incidentDialog.showModal();
}

el.addIncidentBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (state.periods.length === 0) {
    showToast("Hãy tạo ít nhất một tháng backlog trước.");
    return;
  }
  openIncidentDialog(null);
});
el.incidentCancelBtn.addEventListener("click", () => el.incidentDialog.close());
el.incidentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("inc-id").value;
  const payload = {
    period_id: Number(document.getElementById("inc-period").value),
    team_id: Number(document.getElementById("inc-team").value),
    su_co: document.getElementById("inc-su-co").value.trim(),
    tinh_chat: document.getElementById("inc-tinh-chat").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/incidents/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.incidentDialog.close();
      await loadIncidents();
      showToast("Đã cập nhật sự cố.", "success");
    } else {
      await api("/api/incidents", { method: "POST", body: JSON.stringify(payload) });
      el.incidentDialog.close();
      await loadIncidents();
      showToast("Đã thêm sự cố.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Tuân thủ (trang Team & Nhân sự) --

async function loadComplianceRecords() {
  if (!state.currentPeriodId) {
    state.complianceRecords = [];
    renderComplianceRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.complianceRecords = await api(`/api/compliance-records?period_id=${state.currentPeriodId}`);
  renderComplianceRecords();
  syncHomeFromCurrentIfNeeded();
}

function renderComplianceRecords() {
  const visible = filteredComplianceRecords();
  el.complianceEmpty.hidden = visible.length > 0;
  const pageItems = compliancePagination.slice(visible);
  el.complianceTbody.innerHTML = pageItems
    .map(
      (c) => `
    <tr data-id="${c.id}">
      <td>${c.period_label}</td>
      <td><span class="status-badge ${teamColorClass(c.team_name)}">${c.team_name}</span></td>
      <td>${c.member_name}</td>
      <td>${c.vi_pham}</td>
      <td>${(c.noi_dung ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-compliance-btn">Sửa</button>
        <button class="small btn-delete delete-compliance-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.complianceTbody.querySelectorAll(".edit-compliance-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openComplianceDialog(state.complianceRecords.find((c) => c.id === id));
    });
  });
  el.complianceTbody.querySelectorAll(".delete-compliance-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dữ liệu tuân thủ này?")) return;
      try {
        await api(`/api/compliance-records/${id}`, { method: "DELETE" });
        await loadComplianceRecords();
        await loadMembers();
        showToast("Đã xóa dữ liệu tuân thủ.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team nào thì lọc dropdown Nhân sự theo team đó. Khi sửa, dùng đúng
// danh sách nhân sự của Tháng theo dõi bản ghi (có thể khác tháng đang lọc ở
// Bộ lọc phía trên).
async function openComplianceDialog(record) {
  el.complianceForm.reset();
  document.getElementById("cp-id").value = record?.id ?? "";
  el.complianceDialogTitle.textContent = record ? "Sửa dữ liệu tuân thủ" : "Thêm mới";

  const teamSelectEl = document.getElementById("cp-team");
  const memberSelectEl = document.getElementById("cp-member");
  teamSelectEl.innerHTML = teamOptionsHtml();

  const membersForDialog = record
    ? await api(`/api/members?period_id=${record.period_id}`)
    : state.members;

  function refreshMemberOptions() {
    const teamId = Number(teamSelectEl.value);
    memberSelectEl.innerHTML = membersForDialog
      .filter((m) => m.team_id === teamId)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }

  teamSelectEl.value = String(record?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  refreshMemberOptions();
  if (record) memberSelectEl.value = String(record.member_id);
  teamSelectEl.onchange = refreshMemberOptions;

  document.getElementById("cp-vi-pham").value = record?.vi_pham ?? 0;
  document.getElementById("cp-noi-dung").value = record?.noi_dung ?? "";
  el.complianceDialog.showModal();
}

el.addComplianceBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openComplianceDialog(null);
});
el.complianceCancelBtn.addEventListener("click", () => el.complianceDialog.close());
el.complianceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("cp-id").value;
  const payload = {
    member_id: Number(document.getElementById("cp-member").value),
    vi_pham: Number(document.getElementById("cp-vi-pham").value) || 0,
    noi_dung: document.getElementById("cp-noi-dung").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/compliance-records/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.complianceDialog.close();
      await loadComplianceRecords();
      await loadMembers();
      showToast("Đã cập nhật dữ liệu tuân thủ.", "success");
    } else {
      payload.period_id = state.currentPeriodId;
      await api("/api/compliance-records", { method: "POST", body: JSON.stringify(payload) });
      el.complianceDialog.close();
      await loadComplianceRecords();
      await loadMembers();
      showToast("Đã thêm dữ liệu tuân thủ.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Đào tạo nội bộ và Chứng chỉ quốc tế (trang Team & Nhân sự) --

async function loadTrainingRecords() {
  if (!state.currentPeriodId) {
    state.trainingRecords = [];
    renderTrainingRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.trainingRecords = await api(`/api/training-records?period_id=${state.currentPeriodId}`);
  renderTrainingRecords();
  syncHomeFromCurrentIfNeeded();
}

function renderTrainingRecords() {
  const visible = filteredTrainingRecords();
  el.trainingEmpty.hidden = visible.length > 0;
  const pageItems = trainingPagination.slice(visible);
  el.trainingTbody.innerHTML = pageItems
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td>${t.period_label}</td>
      <td><span class="status-badge ${teamColorClass(t.team_name)}">${t.team_name}</span></td>
      <td>${t.member_name}</td>
      <td>${t.loai ? `<span class="status-badge ${loaiColorClass(t.loai)}">${t.loai}</span>` : ""}</td>
      <td>${formatDateDisplay(t.ngay_thuc_hien)}</td>
      <td>${t.nguoi_xac_nhan ?? ""}</td>
      <td>${(t.noi_dung ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-training-btn">Sửa</button>
        <button class="small btn-delete delete-training-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.trainingTbody.querySelectorAll(".edit-training-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTrainingDialog(state.trainingRecords.find((t) => t.id === id));
    });
  });
  el.trainingTbody.querySelectorAll(".delete-training-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dữ liệu đào tạo này?")) return;
      try {
        await api(`/api/training-records/${id}`, { method: "DELETE" });
        await loadTrainingRecords();
        await loadMembers();
        showToast("Đã xóa dữ liệu đào tạo.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team nào thì lọc dropdown Nhân sự theo team đó. Khi sửa, dùng đúng
// danh sách nhân sự của Tháng theo dõi bản ghi (có thể khác tháng đang lọc ở
// Bộ lọc phía trên).
async function openTrainingDialog(record) {
  el.trainingForm.reset();
  document.getElementById("tr-id").value = record?.id ?? "";
  el.trainingDialogTitle.textContent = record ? "Sửa dữ liệu đào tạo" : "Thêm mới";

  const teamSelectEl = document.getElementById("tr-team");
  const memberSelectEl = document.getElementById("tr-member");
  teamSelectEl.innerHTML = teamOptionsHtml();

  const membersForDialog = record
    ? await api(`/api/members?period_id=${record.period_id}`)
    : state.members;

  function refreshMemberOptions() {
    const teamId = Number(teamSelectEl.value);
    memberSelectEl.innerHTML = membersForDialog
      .filter((m) => m.team_id === teamId)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }

  teamSelectEl.value = String(record?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  refreshMemberOptions();
  if (record) memberSelectEl.value = String(record.member_id);
  teamSelectEl.onchange = refreshMemberOptions;

  document.getElementById("tr-loai").value = record?.loai ?? "";
  document.getElementById("tr-ngay-thuc-hien").value = formatDateInput(record?.ngay_thuc_hien);
  document.getElementById("tr-nguoi-xac-nhan").value = record?.nguoi_xac_nhan ?? "";
  document.getElementById("tr-noi-dung").value = record?.noi_dung ?? "";
  el.trainingDialog.showModal();
}

el.addTrainingBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openTrainingDialog(null);
});
el.trainingCancelBtn.addEventListener("click", () => el.trainingDialog.close());
el.trainingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tr-id").value;
  const payload = {
    member_id: Number(document.getElementById("tr-member").value),
    loai: document.getElementById("tr-loai").value,
    ngay_thuc_hien: document.getElementById("tr-ngay-thuc-hien").value || undefined,
    nguoi_xac_nhan: document.getElementById("tr-nguoi-xac-nhan").value.trim() || undefined,
    noi_dung: document.getElementById("tr-noi-dung").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/training-records/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.trainingDialog.close();
      await loadTrainingRecords();
      await loadMembers();
      showToast("Đã cập nhật dữ liệu đào tạo.", "success");
    } else {
      payload.period_id = state.currentPeriodId;
      await api("/api/training-records", { method: "POST", body: JSON.stringify(payload) });
      el.trainingDialog.close();
      await loadTrainingRecords();
      await loadMembers();
      showToast("Đã thêm dữ liệu đào tạo.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Hỗ trợ (trang Team & Nhân sự) — nhân sự (kèm team của nhân sự = "Team
// thực hiện hỗ trợ") hỗ trợ cho 1 team khác ("Team nhận hỗ trợ"). --

async function loadSupportRecords() {
  if (!state.currentPeriodId) {
    state.supportRecords = [];
    renderSupportRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.supportRecords = await api(`/api/support-records?period_id=${state.currentPeriodId}`);
  renderSupportRecords();
  syncHomeFromCurrentIfNeeded();
}

// Dùng chung dropdown "Team" trong khung Bộ lọc — lọc theo Team thực hiện
// hỗ trợ (team_name), giống Tuân thủ/Đào tạo.
function filteredSupportRecords() {
  if (!state.memberFilterTeam) return state.supportRecords;
  return state.supportRecords.filter((s) => s.team_name === state.memberFilterTeam);
}

function renderSupportRecords() {
  const visible = filteredSupportRecords();
  el.supportEmpty.hidden = visible.length > 0;
  const pageItems = supportPagination.slice(visible);
  el.supportTbody.innerHTML = pageItems
    .map(
      (s) => `
    <tr data-id="${s.id}">
      <td>${s.period_label}</td>
      <td><span class="status-badge ${teamColorClass(s.team_name)}">${s.team_name}</span></td>
      <td>${s.member_name}</td>
      <td><span class="status-badge ${teamColorClass(s.team_nhan_ho_tro_name)}">${s.team_nhan_ho_tro_name}</span></td>
      <td>${(s.noi_dung ?? "").replace(/\n/g, "<br/>")}</td>
      <td>${formatDateDisplay(s.ngay_ho_tro)}</td>
      <td>${s.nguoi_xac_nhan ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-support-btn">Sửa</button>
        <button class="small btn-delete delete-support-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.supportTbody.querySelectorAll(".edit-support-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openSupportDialog(state.supportRecords.find((s) => s.id === id));
    });
  });
  el.supportTbody.querySelectorAll(".delete-support-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dữ liệu hỗ trợ này?")) return;
      try {
        await api(`/api/support-records/${id}`, { method: "DELETE" });
        await loadSupportRecords();
        showToast("Đã xóa dữ liệu hỗ trợ.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team (thực hiện hỗ trợ) nào thì lọc dropdown Nhân sự theo team đó,
// giống Đào tạo/Tuân thủ. Team nhận hỗ trợ là dropdown độc lập, chọn bất kỳ
// team nào (kể cả trùng Team thực hiện hỗ trợ).
async function openSupportDialog(record) {
  el.supportForm.reset();
  document.getElementById("sp-id").value = record?.id ?? "";
  el.supportDialogTitle.textContent = record ? "Sửa dữ liệu hỗ trợ" : "Thêm mới";

  const teamSelectEl = document.getElementById("sp-team");
  const memberSelectEl = document.getElementById("sp-member");
  const teamNhanSelectEl = document.getElementById("sp-team-nhan");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamNhanSelectEl.innerHTML = teamOptionsHtml();

  const membersForDialog = record
    ? await api(`/api/members?period_id=${record.period_id}`)
    : state.members;

  function refreshMemberOptions() {
    const teamId = Number(teamSelectEl.value);
    memberSelectEl.innerHTML = membersForDialog
      .filter((m) => m.team_id === teamId)
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
  }

  teamSelectEl.value = String(record?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  refreshMemberOptions();
  if (record) memberSelectEl.value = String(record.member_id);
  teamSelectEl.onchange = refreshMemberOptions;

  teamNhanSelectEl.value = String(record?.team_nhan_ho_tro_id ?? state.teams[0]?.id ?? "");
  document.getElementById("sp-ngay-ho-tro").value = formatDateInput(record?.ngay_ho_tro);
  document.getElementById("sp-nguoi-xac-nhan").value = record?.nguoi_xac_nhan ?? "";
  document.getElementById("sp-noi-dung").value = record?.noi_dung ?? "";
  el.supportDialog.showModal();
}

el.addSupportBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openSupportDialog(null);
});
el.supportCancelBtn.addEventListener("click", () => el.supportDialog.close());
el.supportForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("sp-id").value;
  const payload = {
    member_id: Number(document.getElementById("sp-member").value),
    team_nhan_ho_tro_id: Number(document.getElementById("sp-team-nhan").value),
    ngay_ho_tro: document.getElementById("sp-ngay-ho-tro").value || undefined,
    nguoi_xac_nhan: document.getElementById("sp-nguoi-xac-nhan").value.trim() || undefined,
    noi_dung: document.getElementById("sp-noi-dung").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/support-records/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.supportDialog.close();
      await loadSupportRecords();
      showToast("Đã cập nhật dữ liệu hỗ trợ.", "success");
    } else {
      payload.period_id = state.currentPeriodId;
      await api("/api/support-records", { method: "POST", body: JSON.stringify(payload) });
      el.supportDialog.close();
      await loadSupportRecords();
      showToast("Đã thêm dữ liệu hỗ trợ.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Đánh giá (trang Team & Nhân sự) — "+ Thêm Đánh giá" chọn 1 team, nhập
// Số thứ tự cho tất cả nhân sự trong team đó cùng lúc (upsert theo
// period_id + member_id, 1 nhân sự chỉ có đúng 1 dòng/tháng theo dõi).
// Sửa/Xóa từng dòng thực hiện ngoài bảng. --

async function loadDanhGiaRecords() {
  if (!state.currentPeriodId) {
    state.danhGiaRecords = [];
    renderDanhGiaRecords();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.danhGiaRecords = await api(`/api/danh-gia-records?period_id=${state.currentPeriodId}`);
  renderDanhGiaRecords();
  syncHomeFromCurrentIfNeeded();
}

function filteredDanhGiaRecords() {
  if (!state.memberFilterTeam) return state.danhGiaRecords;
  return state.danhGiaRecords.filter((d) => d.team_name === state.memberFilterTeam);
}

function renderDanhGiaRecords() {
  const visible = filteredDanhGiaRecords();
  el.danhGiaEmpty.hidden = visible.length > 0;
  const pageItems = danhGiaPagination.slice(visible);
  el.danhGiaTbody.innerHTML = pageItems
    .map(
      (d) => `
    <tr data-id="${d.id}">
      <td>${d.period_label}</td>
      <td><span class="status-badge ${teamColorClass(d.team_name)}">${d.team_name}</span></td>
      <td>${d.member_name}</td>
      <td>${d.so_thu_tu ?? ""}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-danhgia-btn">Sửa</button>
        <button class="small btn-delete delete-danhgia-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.danhGiaTbody.querySelectorAll(".edit-danhgia-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      const record = state.danhGiaRecords.find((d) => d.id === id);
      openDanhGiaDialog(record.team_id, "Sửa dữ liệu đánh giá");
    });
  });
  el.danhGiaTbody.querySelectorAll(".delete-danhgia-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dữ liệu đánh giá này?")) return;
      try {
        await api(`/api/danh-gia-records/${id}`, { method: "DELETE" });
        await loadDanhGiaRecords();
        showToast("Đã xóa dữ liệu đánh giá.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Chọn Team đánh giá thì hiển thị TẤT CẢ nhân sự của team đó kèm ô nhập Số
// thứ tự (pre-fill giá trị đã có, nếu có), cho phép nhập/sửa nhiều nhân sự
// cùng lúc rồi lưu 1 lần (upsert).
async function openDanhGiaDialog(initialTeamId, title = "Thêm Đánh giá") {
  el.danhGiaForm.reset();
  el.danhGiaDialogTitle.textContent = title;

  const teamSelectEl = document.getElementById("dg-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(initialTeamId ?? state.currentTeamId ?? state.teams[0]?.id ?? "");

  function refreshMemberInputs() {
    const teamId = Number(teamSelectEl.value);
    const membersOfTeam = state.members.filter((m) => m.team_id === teamId);
    const inputTbody = document.getElementById("danhgia-member-input-tbody");
    const emptyEl = document.getElementById("danhgia-member-input-empty");
    emptyEl.hidden = membersOfTeam.length > 0;
    inputTbody.innerHTML = membersOfTeam
      .map((m) => {
        const existing = state.danhGiaRecords.find((d) => d.member_id === m.id);
        return `
      <tr data-member-id="${m.id}">
        <td>${m.name}</td>
        <td><input type="number" step="1" class="dg-so-thu-tu-input" value="${existing?.so_thu_tu ?? ""}" /></td>
      </tr>`;
      })
      .join("");
  }

  teamSelectEl.onchange = refreshMemberInputs;
  refreshMemberInputs();
  el.danhGiaDialog.showModal();
}

el.addDanhGiaBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  if (state.members.length === 0) {
    showToast("Chưa có nhân sự nào trong tháng đang chọn — hãy thêm nhân sự trước.");
    return;
  }
  openDanhGiaDialog(null);
});
el.danhGiaCancelBtn.addEventListener("click", () => el.danhGiaDialog.close());
el.danhGiaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const teamId = Number(document.getElementById("dg-team").value);
  const entries = Array.from(document.querySelectorAll("#danhgia-member-input-tbody tr"))
    .map((tr) => ({
      member_id: Number(tr.dataset.memberId),
      so_thu_tu: tr.querySelector(".dg-so-thu-tu-input").value,
    }))
    .filter((entry) => entry.so_thu_tu !== "")
    .map((entry) => ({ member_id: entry.member_id, so_thu_tu: Number(entry.so_thu_tu) }));

  if (entries.length === 0) {
    showToast("Hãy nhập ít nhất 1 Ranking.");
    return;
  }

  try {
    await api("/api/danh-gia-records/bulk", {
      method: "POST",
      body: JSON.stringify({ period_id: state.currentPeriodId, team_id: teamId, entries }),
    });
    el.danhGiaDialog.close();
    await loadDanhGiaRecords();
    showToast("Đã lưu dữ liệu đánh giá.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// -- Chấm công (trang Team & Nhân sự) — import file Excel, cột động theo
// đúng các trường có trong file, không cố định trước. --

async function loadAttendanceRecords() {
  if (!state.currentPeriodId) {
    state.attendanceHeaders = [];
    state.attendanceRecords = [];
    state.noiQuyOverrideNames = new Set();
    renderAttendanceThead();
    renderAttendanceTable();
    renderNoiQuyTable();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  const [data] = await Promise.all([
    api(`/api/attendance-records?period_id=${state.currentPeriodId}`),
    loadNoiQuyOverrides(),
  ]);
  state.attendanceHeaders = data.headers;
  state.attendanceRecords = data.rows;
  const recordIds = new Set(state.attendanceRecords.map((r) => r.id));
  state.selectedAttendanceIds.forEach((id) => {
    if (!recordIds.has(id)) state.selectedAttendanceIds.delete(id);
  });
  renderAttendanceThead();
  renderAttendanceTable();
  renderNoiQuyTable();
  syncHomeFromCurrentIfNeeded();
}

async function loadNoiQuyOverrides() {
  if (!state.currentPeriodId) {
    state.noiQuyOverrideNames = new Set();
    return;
  }
  const overrides = await api(`/api/noiquy-overrides?period_id=${state.currentPeriodId}`);
  state.noiQuyOverrideNames = new Set(overrides.map((o) => o.member_name));
}

// Tổng hợp Nội quy từ dữ liệu Chấm công đã nhập của tháng đang chọn — không
// lưu riêng, tính lại mỗi khi dữ liệu Chấm công thay đổi. Dòng Chấm công đã
// "Không tính đi muộn" (excluded_from_late) bị bỏ qua khi đếm; nhân sự đã
// "Không tính đi muộn" ở chính tab Nội quy (noiQuyOverrideNames) bị ép về 0.
function computeNoiQuyRows() {
  if (state.attendanceRecords.length === 0) return [];

  const lateCountByName = new Map();
  state.attendanceRecords.forEach((r) => {
    const name = String(r.row_data["Name"] ?? "").trim();
    if (!name) return;
    if (r.excluded_from_late) {
      if (!lateCountByName.has(name)) lateCountByName.set(name, 0);
      return;
    }
    // "không chấm công sáng/chiều" là ghi chú vắng chấm công, không phải đi
    // muộn/về sớm — không tính vào Lượt đi muộn.
    const checkIn = String(r.row_data["Check In"] ?? "").trim();
    const checkOut = String(r.row_data["Check Out"] ?? "").trim();
    const isLateNote = (text) => text !== "" && !text.includes("không chấm công");
    if (isLateNote(checkIn) || isLateNote(checkOut)) {
      lateCountByName.set(name, (lateCountByName.get(name) ?? 0) + 1);
    } else if (!lateCountByName.has(name)) {
      lateCountByName.set(name, 0);
    }
  });

  return Array.from(lateCountByName.entries())
    .map(([name, late]) => {
      const member = state.members.find((m) => m.name === name);
      const excluded = state.noiQuyOverrideNames.has(name);
      return {
        name,
        team: member?.team_name ?? "-",
        late: excluded ? 0 : late,
        total: excluded ? 0 : Math.max(0, late - 3),
        excluded,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filteredNoiQuyRows() {
  const term = state.noiQuySearch.trim().toLowerCase();
  const rows = computeNoiQuyRows();
  if (!term) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(term) || r.team.toLowerCase().includes(term));
}

function updateNoiQuySelectionUI() {
  const visible = filteredNoiQuyRows();
  const visibleSelectedCount = visible.filter((r) => state.selectedNoiQuyNames.has(r.name)).length;
  el.markExcludedNoiQuyBtn.hidden = state.selectedNoiQuyNames.size === 0;
  el.unmarkExcludedNoiQuyBtn.hidden = state.selectedNoiQuyNames.size === 0;
  const selectAllEl = document.getElementById("noiquy-select-all");
  if (selectAllEl) {
    selectAllEl.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAllEl.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderNoiQuyTable() {
  const rows = filteredNoiQuyRows();
  el.noiQuyEmpty.hidden = rows.length > 0;
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  const periodLabel = period?.label ?? "";
  const pageItems = noiQuyPagination.slice(rows);
  el.noiQuyTbody.innerHTML = pageItems
    .map(
      (r) => `
    <tr>
      <td><input type="checkbox" class="noiquy-row-checkbox" data-name="${r.name}" ${state.selectedNoiQuyNames.has(r.name) ? "checked" : ""} /></td>
      <td>${periodLabel}</td>
      <td>${r.team === "-" ? "-" : `<span class="status-badge ${teamColorClass(r.team)}">${r.team}</span>`}</td>
      <td>${r.name}${r.excluded ? ' <span class="muted" style="font-size:0.8em">(Không tính đi muộn)</span>' : ""}</td>
      <td>${r.late}</td>
      <td${r.total > 0 ? ' class="noiquy-total-highlight"' : ""}>${r.total}</td>
    </tr>`,
    )
    .join("");

  el.noiQuyTbody.querySelectorAll(".noiquy-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const name = e.target.dataset.name;
      if (e.target.checked) {
        state.selectedNoiQuyNames.add(name);
      } else {
        state.selectedNoiQuyNames.delete(name);
      }
      updateNoiQuySelectionUI();
    });
  });

  updateNoiQuySelectionUI();
  // Cột "Nội quy" ở bảng Nhân sự tổng hợp từ chính dữ liệu này (cột Total) —
  // render lại mỗi khi Nội quy thay đổi để luôn đồng bộ.
  renderMemberTable();
}

document.getElementById("noiquy-select-all").addEventListener("change", (e) => {
  const visible = filteredNoiQuyRows();
  if (e.target.checked) {
    visible.forEach((r) => state.selectedNoiQuyNames.add(r.name));
  } else {
    visible.forEach((r) => state.selectedNoiQuyNames.delete(r.name));
  }
  renderNoiQuyTable();
});

el.noiQuySearch.addEventListener("input", () => {
  state.noiQuySearch = el.noiQuySearch.value;
  noiQuyPagination.reset();
  renderNoiQuyTable();
});

el.markExcludedNoiQuyBtn.addEventListener("click", async () => {
  const names = [...state.selectedNoiQuyNames];
  if (names.length === 0) return;
  if (!confirm(`Đánh dấu "Không tính đi muộn" cho ${names.length} nhân sự đã chọn? Lượt đi muộn và Total sẽ về 0.`)) return;
  try {
    await api("/api/noiquy-overrides", {
      method: "POST",
      body: JSON.stringify({ period_id: state.currentPeriodId, names }),
    });
    state.selectedNoiQuyNames.clear();
    await loadNoiQuyOverrides();
    renderNoiQuyTable();
    showToast("Đã đánh dấu Không tính đi muộn.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.unmarkExcludedNoiQuyBtn.addEventListener("click", async () => {
  const names = [...state.selectedNoiQuyNames];
  if (names.length === 0) return;
  if (!confirm(`Bỏ "Không tính đi muộn" cho ${names.length} nhân sự đã chọn? Lượt đi muộn và Total sẽ tính lại như bình thường.`)) return;
  try {
    await api("/api/noiquy-overrides", {
      method: "DELETE",
      body: JSON.stringify({ period_id: state.currentPeriodId, names }),
    });
    state.selectedNoiQuyNames.clear();
    await loadNoiQuyOverrides();
    renderNoiQuyTable();
    showToast("Đã bỏ Không tính đi muộn.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

function renderAttendanceThead() {
  const headerCells = state.attendanceHeaders
    .map((h) => (h.trim() === "Team" ? `<th style="width:120px">${h}</th>` : `<th>${h}</th>`))
    .join("");
  el.attendanceThead.innerHTML = `
    <tr>
      <th style="width:36px"><input type="checkbox" id="attendance-select-all" /></th>
      ${headerCells}
      <th style="min-width:100px"></th>
    </tr>`;
  document.getElementById("attendance-select-all").addEventListener("change", (e) => {
    const visible = filteredAttendanceRecords();
    if (e.target.checked) {
      visible.forEach((r) => state.selectedAttendanceIds.add(r.id));
    } else {
      visible.forEach((r) => state.selectedAttendanceIds.delete(r.id));
    }
    renderAttendanceTable();
  });
}

function filteredAttendanceRecords() {
  const term = state.attendanceSearch.trim().toLowerCase();
  if (!term) return state.attendanceRecords;
  return state.attendanceRecords.filter((r) =>
    Object.values(r.row_data).some((v) => String(v ?? "").toLowerCase().includes(term)),
  );
}

function updateAttendanceSelectionUI() {
  const visible = filteredAttendanceRecords();
  const visibleSelectedCount = visible.filter((r) => state.selectedAttendanceIds.has(r.id)).length;
  el.deleteSelectedAttendanceBtn.hidden = state.selectedAttendanceIds.size === 0;
  el.markExcludedAttendanceBtn.hidden = state.selectedAttendanceIds.size === 0;
  el.unmarkExcludedAttendanceBtn.hidden = state.selectedAttendanceIds.size === 0;
  el.selectedAttendanceCount.textContent = String(state.selectedAttendanceIds.size);
  const selectAllEl = document.getElementById("attendance-select-all");
  if (selectAllEl) {
    selectAllEl.checked = visible.length > 0 && visibleSelectedCount === visible.length;
    selectAllEl.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
  }
}

function renderAttendanceTable() {
  const visible = filteredAttendanceRecords();
  el.attendanceEmpty.hidden = visible.length > 0;
  const pageItems = attendancePagination.slice(visible);
  el.attendanceTbody.innerHTML = pageItems
    .map((r) => {
      const dataCells = state.attendanceHeaders.map((h) => `<td>${r.row_data[h] ?? ""}</td>`).join("");
      return `
    <tr data-id="${r.id}"${r.excluded_from_late ? ' class="attendance-row-excluded"' : ""}>
      <td><input type="checkbox" class="attendance-row-checkbox" ${state.selectedAttendanceIds.has(r.id) ? "checked" : ""} /></td>
      ${dataCells}
      <td><div class="actions-cell">
        <button class="small btn-delete delete-attendance-btn">Xóa</button>
      </div></td>
    </tr>`;
    })
    .join("");

  el.attendanceTbody.querySelectorAll(".attendance-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedAttendanceIds.add(id);
      } else {
        state.selectedAttendanceIds.delete(id);
      }
      updateAttendanceSelectionUI();
    });
  });
  el.attendanceTbody.querySelectorAll(".delete-attendance-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dòng dữ liệu Chấm công này?")) return;
      try {
        await api(`/api/attendance-records/${id}`, { method: "DELETE" });
        state.selectedAttendanceIds.delete(id);
        await loadAttendanceRecords();
        showToast("Đã xóa dữ liệu Chấm công.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateAttendanceSelectionUI();
}

el.attendanceSearch.addEventListener("input", () => {
  state.attendanceSearch = el.attendanceSearch.value;
  attendancePagination.reset();
  renderAttendanceTable();
});

el.importAttendanceBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  el.attendanceFileInput.click();
});

el.attendanceFileInput.addEventListener("change", async () => {
  const file = el.attendanceFileInput.files[0];
  el.attendanceFileInput.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/attendance-records/import?period_id=${state.currentPeriodId}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const data = await res.json();
    state.attendanceHeaders = data.headers;
    state.attendanceRecords = data.rows;
    state.selectedAttendanceIds.clear();
    attendancePagination.reset();
    renderAttendanceThead();
    renderAttendanceTable();
    renderNoiQuyTable();
    showToast(`Đã nhập ${data.rows.length} dòng dữ liệu Chấm công.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.deleteSelectedAttendanceBtn.addEventListener("click", async () => {
  const ids = [...state.selectedAttendanceIds];
  if (ids.length === 0) return;
  if (!confirm(`Xóa ${ids.length} dòng dữ liệu Chấm công đã chọn?`)) return;
  try {
    await api("/api/attendance-records/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedAttendanceIds.clear();
    await loadAttendanceRecords();
    showToast(`Đã xóa ${ids.length} dòng dữ liệu Chấm công.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.markExcludedAttendanceBtn.addEventListener("click", async () => {
  const ids = [...state.selectedAttendanceIds];
  if (ids.length === 0) return;
  if (!confirm(`Đánh dấu "Không tính đi muộn" cho ${ids.length} dòng đã chọn? Các dòng này sẽ không được tính vào Lượt đi muộn ở tab Nội quy.`)) return;
  try {
    await api("/api/attendance-records/mark-excluded", {
      method: "POST",
      body: JSON.stringify({ ids, excluded: true }),
    });
    state.selectedAttendanceIds.clear();
    await loadAttendanceRecords();
    showToast(`Đã đánh dấu Không tính đi muộn cho ${ids.length} dòng.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.unmarkExcludedAttendanceBtn.addEventListener("click", async () => {
  const ids = [...state.selectedAttendanceIds];
  if (ids.length === 0) return;
  if (!confirm(`Bỏ "Không tính đi muộn" cho ${ids.length} dòng đã chọn? Các dòng này sẽ tính lại vào Lượt đi muộn ở tab Nội quy.`)) return;
  try {
    await api("/api/attendance-records/mark-excluded", {
      method: "POST",
      body: JSON.stringify({ ids, excluded: false }),
    });
    state.selectedAttendanceIds.clear();
    await loadAttendanceRecords();
    showToast(`Đã bỏ Không tính đi muộn cho ${ids.length} dòng.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// -- Hỗ trợ ticket --

async function loadTickets() {
  state.tickets = await api("/api/tickets");
  renderTickets();
}

function renderTickets() {
  el.ticketEmpty.hidden = state.tickets.length > 0;
  const pageItems = ticketPagination.slice(state.tickets);
  el.ticketTbody.innerHTML = pageItems
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td>${t.period_label}</td>
      <td>${t.team_name}</td>
      <td>${t.tong_ticket}</td>
      <td>${t.ticket_vuot}</td>
      <td>${t.dung_han}</td>
      <td>${formatPercent(t.ty_le)}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-ticket-btn">Sửa</button>
        <button class="small btn-delete delete-ticket-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.ticketTbody.querySelectorAll(".edit-ticket-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTicketDialog(state.tickets.find((t) => t.id === id));
    });
  });
  el.ticketTbody.querySelectorAll(".delete-ticket-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dữ liệu ticket này?")) return;
      try {
        await api(`/api/tickets/${id}`, { method: "DELETE" });
        await loadTickets();
        showToast("Đã xóa dữ liệu ticket.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openTicketDialog(ticket) {
  el.ticketForm.reset();
  document.getElementById("tk-id").value = ticket?.id ?? "";
  el.ticketDialogTitle.textContent = ticket ? "Sửa dữ liệu ticket" : "Thêm dữ liệu ticket";
  const periodSelectEl = document.getElementById("tk-period");
  periodSelectEl.innerHTML = periodOptionsHtml();
  periodSelectEl.value = String(ticket?.period_id ?? state.currentPeriodId ?? state.periods[0]?.id ?? "");
  const teamSelectEl = document.getElementById("tk-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(ticket?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  document.getElementById("tk-tong").value = ticket?.tong_ticket ?? 0;
  document.getElementById("tk-vuot").value = ticket?.ticket_vuot ?? 0;
  document.getElementById("tk-dung-han").value = ticket?.dung_han ?? 0;
  el.ticketDialog.showModal();
}

el.addTicketBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (state.periods.length === 0) {
    showToast("Hãy tạo ít nhất một tháng backlog trước.");
    return;
  }
  openTicketDialog(null);
});
el.ticketCancelBtn.addEventListener("click", () => el.ticketDialog.close());
el.ticketForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tk-id").value;
  const payload = {
    period_id: Number(document.getElementById("tk-period").value),
    team_id: Number(document.getElementById("tk-team").value),
    tong_ticket: Number(document.getElementById("tk-tong").value) || 0,
    ticket_vuot: Number(document.getElementById("tk-vuot").value) || 0,
    dung_han: Number(document.getElementById("tk-dung-han").value) || 0,
  };
  try {
    if (id) {
      await api(`/api/tickets/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.ticketDialog.close();
      await loadTickets();
      showToast("Đã cập nhật dữ liệu ticket.", "success");
    } else {
      await api("/api/tickets", { method: "POST", body: JSON.stringify(payload) });
      el.ticketDialog.close();
      await loadTickets();
      showToast("Đã thêm dữ liệu ticket.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// -- Tỉ lệ khởi tạo --

async function loadCreationRates() {
  state.creationRates = await api("/api/creation-rates");
  renderCreationRates();
}

function renderCreationRates() {
  el.creationRateEmpty.hidden = state.creationRates.length > 0;
  const pageItems = creationRatePagination.slice(state.creationRates);
  el.creationRateTbody.innerHTML = pageItems
    .map(
      (r) => `
    <tr data-id="${r.id}">
      <td>${r.period_label}</td>
      <td>${r.team_name}</td>
      <td>${r.so_luong_thanh_cong}</td>
      <td>${r.so_luong_that_bai}</td>
      <td>${r.total}</td>
      <td>${formatPercent(r.grand_total)}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit edit-creation-rate-btn">Sửa</button>
        <button class="small btn-delete delete-creation-rate-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  el.creationRateTbody.querySelectorAll(".edit-creation-rate-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openCreationRateDialog(state.creationRates.find((r) => r.id === id));
    });
  });
  el.creationRateTbody.querySelectorAll(".delete-creation-rate-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa dữ liệu này?")) return;
      try {
        await api(`/api/creation-rates/${id}`, { method: "DELETE" });
        await loadCreationRates();
        showToast("Đã xóa dữ liệu tỉ lệ khởi tạo.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openCreationRateDialog(rate) {
  el.creationRateForm.reset();
  document.getElementById("cr-id").value = rate?.id ?? "";
  el.creationRateDialogTitle.textContent = rate ? "Sửa tỉ lệ khởi tạo" : "Thêm tỉ lệ khởi tạo";
  const periodSelectEl = document.getElementById("cr-period");
  periodSelectEl.innerHTML = periodOptionsHtml();
  periodSelectEl.value = String(rate?.period_id ?? state.currentPeriodId ?? state.periods[0]?.id ?? "");
  const teamSelectEl = document.getElementById("cr-team");
  teamSelectEl.innerHTML = teamOptionsHtml();
  teamSelectEl.value = String(rate?.team_id ?? state.currentTeamId ?? state.teams[0]?.id ?? "");
  document.getElementById("cr-thanh-cong").value = rate?.so_luong_thanh_cong ?? 0;
  document.getElementById("cr-that-bai").value = rate?.so_luong_that_bai ?? 0;
  el.creationRateDialog.showModal();
}

el.addCreationRateBtn.addEventListener("click", () => {
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước.");
    return;
  }
  if (state.periods.length === 0) {
    showToast("Hãy tạo ít nhất một tháng backlog trước.");
    return;
  }
  openCreationRateDialog(null);
});
el.creationRateCancelBtn.addEventListener("click", () => el.creationRateDialog.close());
el.creationRateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("cr-id").value;
  const payload = {
    period_id: Number(document.getElementById("cr-period").value),
    team_id: Number(document.getElementById("cr-team").value),
    so_luong_thanh_cong: Number(document.getElementById("cr-thanh-cong").value) || 0,
    so_luong_that_bai: Number(document.getElementById("cr-that-bai").value) || 0,
  };
  try {
    if (id) {
      await api(`/api/creation-rates/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.creationRateDialog.close();
      await loadCreationRates();
      showToast("Đã cập nhật dữ liệu tỉ lệ khởi tạo.", "success");
    } else {
      await api("/api/creation-rates", { method: "POST", body: JSON.stringify(payload) });
      el.creationRateDialog.close();
      await loadCreationRates();
      showToast("Đã thêm dữ liệu tỉ lệ khởi tạo.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình: Tiêu chí (dùng chung mọi tháng backlog) ----
// Cột điểm chuẩn theo team lấy theo state.teams của tháng đang chọn (map
// theo team_name) — đổi tháng thì render lại (renderTieuChi gọi từ
// loadTeams), không cần tải lại dữ liệu tiêu chí.

async function loadTieuChi() {
  state.tieuChiConfigs = await api("/api/tieu-chi");
  renderTieuChi();
  renderHomeDashboard();
}

function renderTieuChi() {
  if (!el.tieuChiTbody) return;
  const teamNames = state.teams.map((t) => t.name);

  // Dựng lại header (cột team) theo đúng team của tháng đang chọn.
  const teamHeaderCells = teamNames.map((name) => `<th style="min-width:100px">${name}</th>`).join("");
  el.tieuChiTheadRow.innerHTML = `
    <th style="min-width:140px">Nhóm</th>
    <th style="min-width:180px">Tiêu chí</th>
    <th style="min-width:280px">Cách tính điểm</th>
    ${teamHeaderCells}
    <th style="min-width:170px"></th>`;

  el.tieuChiEmpty.hidden = state.tieuChiConfigs.length > 0;

  el.tieuChiTbody.innerHTML = state.tieuChiConfigs
    .map((c) => {
      const diemChuanByTeam = new Map(c.diem_chuan.map((d) => [d.team_name, d]));
      const mainCells = teamNames
        .map((name) => {
          const value = diemChuanByTeam.get(name)?.diem_chuan ?? "";
          return `<td><input class="inline-cell-input tieuchi-diem-chuan-input" data-tieu-chi-id="${c.id}" data-team="${name}" value="${value}" /></td>`;
        })
        .join("");
      const mainRow = `
    <tr data-id="${c.id}">
      <td><span class="status-badge ${nhomColorClass(c.nhom)}">${c.nhom}</span></td>
      <td>${c.ten_tieu_chi}</td>
      <td style="white-space:pre-wrap">${c.cach_tinh_diem ?? ""}</td>
      ${mainCells}
      <td><div class="actions-cell">
        <button class="small btn-edit edit-tieuchi-btn">Sửa</button>
        <button class="small btn-delete delete-tieuchi-btn">Xóa</button>
      </div></td>
    </tr>`;

      if (!c.co_chi_tieu) return mainRow;

      const chiTieuCells = teamNames
        .map((name) => {
          const value = diemChuanByTeam.get(name)?.chi_tieu ?? "";
          return `<td><input class="inline-cell-input tieuchi-chi-tieu-input" data-tieu-chi-id="${c.id}" data-team="${name}" value="${value}" /></td>`;
        })
        .join("");
      const chiTieuRow = `
    <tr class="tieuchi-chitieu-row" data-id="${c.id}">
      <td colspan="3"><em>Chỉ tiêu</em></td>
      ${chiTieuCells}
      <td></td>
    </tr>`;
      return mainRow + chiTieuRow;
    })
    .join("");

  // Hàng Tổng điểm — tự động cộng tổng cột Điểm chuẩn (không tính dòng Chỉ
  // tiêu) của tất cả tiêu chí theo từng team, không cho nhập tay.
  const tongDiemCells = teamNames
    .map((name) => {
      const total = state.tieuChiConfigs.reduce((sum, c) => {
        const raw = c.diem_chuan.find((d) => d.team_name === name)?.diem_chuan;
        const n = Number(raw);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      return `<td style="font-weight:600">${total}</td>`;
    })
    .join("");
  el.tieuChiTongDiemRow.innerHTML = `
    <td colspan="3" style="font-weight:600">Tổng điểm</td>
    ${tongDiemCells}
    <td></td>`;

  el.tieuChiTbody.querySelectorAll(".tieuchi-diem-chuan-input, .tieuchi-chi-tieu-input").forEach((input) => {
    input.addEventListener("change", () => saveTieuChiDiemChuan(input.dataset.tieuChiId, input.dataset.team));
  });

  el.tieuChiTbody.querySelectorAll(".edit-tieuchi-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTieuChiDialog(state.tieuChiConfigs.find((c) => c.id === id));
    });
  });
  el.tieuChiTbody.querySelectorAll(".delete-tieuchi-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!confirm("Xóa tiêu chí này? Toàn bộ điểm chuẩn đã cấu hình cho tiêu chí này cũng sẽ bị xóa.")) return;
      try {
        await api(`/api/tieu-chi/${id}`, { method: "DELETE" });
        await loadTieuChi();
        showToast("Đã xóa tiêu chí.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Đọc giá trị hiện tại của cả 2 ô (Điểm chuẩn + Chỉ tiêu nếu có) cho đúng 1
// cặp (tiêu chí, team) rồi lưu cùng lúc — API upsert theo cặp giá trị.
async function saveTieuChiDiemChuan(tieuChiId, teamName) {
  const diemChuanInput = el.tieuChiTbody.querySelector(
    `.tieuchi-diem-chuan-input[data-tieu-chi-id="${tieuChiId}"][data-team="${teamName}"]`,
  );
  const chiTieuInput = el.tieuChiTbody.querySelector(
    `.tieuchi-chi-tieu-input[data-tieu-chi-id="${tieuChiId}"][data-team="${teamName}"]`,
  );
  try {
    const updated = await api(`/api/tieu-chi/${tieuChiId}/diem-chuan`, {
      method: "PUT",
      body: JSON.stringify({
        team_name: teamName,
        diem_chuan: diemChuanInput?.value.trim() || undefined,
        chi_tieu: chiTieuInput?.value.trim() || undefined,
      }),
    });
    // Cập nhật lại state cục bộ để hàng Tổng điểm tính lại ngay, không cần
    // tải lại toàn bộ danh sách tiêu chí.
    const index = state.tieuChiConfigs.findIndex((c) => c.id === Number(tieuChiId));
    if (index !== -1) state.tieuChiConfigs[index] = updated;
    renderTieuChi();
    renderHomeDashboard();
  } catch (err) {
    showToast(err.message);
  }
}

function openTieuChiDialog(config) {
  el.tieuChiForm.reset();
  document.getElementById("tc-id").value = config?.id ?? "";
  el.tieuChiDialogTitle.textContent = config ? "Sửa tiêu chí" : "Thêm tiêu chí";

  const nhomSelect = document.getElementById("tc-nhom");
  nhomSelect.innerHTML = state.nhomOptions.map((n) => `<option value="${n.ten_nhom}">${n.ten_nhom}</option>`).join("");
  nhomSelect.value = config?.nhom ?? state.nhomOptions[0]?.ten_nhom ?? "";
  document.getElementById("tc-ten").value = config?.ten_tieu_chi ?? "";
  document.getElementById("tc-cach-tinh").value = config?.cach_tinh_diem ?? "";
  document.getElementById("tc-co-chi-tieu").checked = Boolean(config?.co_chi_tieu);
  el.tieuChiDialog.showModal();
}

el.addTieuChiBtn.addEventListener("click", () => openTieuChiDialog(null));
el.tieuChiCancelBtn.addEventListener("click", () => el.tieuChiDialog.close());
el.tieuChiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tc-id").value;
  const payload = {
    nhom: document.getElementById("tc-nhom").value.trim(),
    ten_tieu_chi: document.getElementById("tc-ten").value.trim(),
    cach_tinh_diem: document.getElementById("tc-cach-tinh").value.trim() || undefined,
    co_chi_tieu: document.getElementById("tc-co-chi-tieu").checked,
  };
  try {
    if (id) {
      await api(`/api/tieu-chi/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.tieuChiDialog.close();
      await loadTieuChi();
      showToast("Đã cập nhật tiêu chí.", "success");
    } else {
      await api("/api/tieu-chi", { method: "POST", body: JSON.stringify(payload) });
      el.tieuChiDialog.close();
      await loadTieuChi();
      showToast("Đã thêm tiêu chí.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình: Ranking team ----
// Bảng tự do: hàng = vị trí xếp hạng, cột = kịch bản xếp hạng (VD "Rank",
// "Rank gần cuối", "Rank cuối") — cho phép thêm/xóa cả hàng và cột.

async function loadRanking() {
  state.rankingConfig = await api("/api/ranking-config");
  renderRanking();
}

function renderRanking() {
  if (!el.rankingTbody) return;
  const { rows, columns, cells } = state.rankingConfig;
  const cellByKey = new Map(cells.map((c) => [`${c.vi_tri}:${c.column_id}`, c.gia_tri]));

  const columnHeaderCells = columns
    .map(
      (col) => `
    <th data-column-id="${col.id}">
      <div class="ranking-column-header">
        <input class="ranking-column-name-input" data-column-id="${col.id}" value="${col.ten_cot}" />
        <span class="pill-x delete-ranking-column-btn" data-column-id="${col.id}" title="Xóa cột">×</span>
      </div>
    </th>`,
    )
    .join("");
  el.rankingTheadRow.innerHTML = `<th style="width:140px;text-align:center">Ranking Team</th>${columnHeaderCells}`;

  el.rankingEmpty.hidden = rows.length > 0;

  el.rankingTbody.innerHTML = rows
    .map((viTri) => {
      const rowCells = columns
        .map((col) => {
          const value = cellByKey.get(`${viTri}:${col.id}`) ?? "";
          return `<td><input class="inline-cell-input ranking-cell-input" data-vi-tri="${viTri}" data-column-id="${col.id}" value="${value}" /></td>`;
        })
        .join("");
      return `
    <tr data-vi-tri="${viTri}">
      <td>
        <div class="row" style="justify-content:center;flex-wrap:nowrap;gap:6px">
          <span>${viTri}</span>
          <span class="pill-x delete-ranking-row-btn" data-vi-tri="${viTri}" title="Xóa dòng">×</span>
        </div>
      </td>
      ${rowCells}
    </tr>`;
    })
    .join("");

  el.rankingTheadRow.querySelectorAll(".ranking-column-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await api(`/api/ranking-config/columns/${input.dataset.columnId}`, {
          method: "PUT",
          body: JSON.stringify({ ten_cot: input.value.trim() }),
        });
        const col = state.rankingConfig.columns.find((c) => c.id === Number(input.dataset.columnId));
        if (col) col.ten_cot = input.value.trim();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.rankingTheadRow.querySelectorAll(".delete-ranking-column-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa cột này? Toàn bộ giá trị đã nhập trong cột sẽ bị xóa.")) return;
      try {
        await api(`/api/ranking-config/columns/${btn.dataset.columnId}`, { method: "DELETE" });
        await loadRanking();
        showToast("Đã xóa cột.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  el.rankingTbody.querySelectorAll(".delete-ranking-row-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa dòng xếp hạng này?")) return;
      try {
        await api(`/api/ranking-config/rows/${btn.dataset.viTri}`, { method: "DELETE" });
        await loadRanking();
        showToast("Đã xóa dòng.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.rankingTbody.querySelectorAll(".ranking-cell-input").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await api("/api/ranking-config/cells", {
          method: "PUT",
          body: JSON.stringify({
            vi_tri: Number(input.dataset.viTri),
            column_id: Number(input.dataset.columnId),
            gia_tri: input.value.trim() || undefined,
          }),
        });
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addRankingRowBtn.addEventListener("click", async () => {
  try {
    await api("/api/ranking-config/rows", { method: "POST" });
    await loadRanking();
  } catch (err) {
    showToast(err.message);
  }
});
el.addRankingColumnBtn.addEventListener("click", async () => {
  try {
    await api("/api/ranking-config/columns", {
      method: "POST",
      body: JSON.stringify({ ten_cot: "Cột mới" }),
    });
    await loadRanking();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình: Tag & Phân loại ----
// Danh mục dùng ở form nhập task Backlog (select Tag, checkbox Phân loại) và
// bộ lọc — thay cho danh sách cố định cứng trước đây. Đổi ở đây ảnh hưởng
// ngay lập tức tới màu badge, dropdown/checkbox nhập task, bộ lọc Backlog, và
// các cột theo Tag ở Home (renderHomeCompletionRateTable/renderHomeCompletionTable).

async function loadTags() {
  state.tags = await api("/api/tags");
  renderTagConfig();
  renderFilterTagOptions();
  renderTasks();
  renderFilterTagDependents();
}

async function loadPhanLoai() {
  state.phanLoaiOptions = await api("/api/phan-loai");
  renderPhanLoaiConfig();
  renderTasks();
  renderFilterTinhChatOptions();
}

// Các phần phụ thuộc vào state.tags ngoài chính bảng cấu hình: bộ lọc Backlog
// hiện chưa có lọc theo Tag, nhưng Home (bảng Tỉ lệ hoàn thành nhiệm vụ) dùng
// state.tags để dựng cột — render lại khi danh mục Tag đổi.
function renderFilterTagDependents() {
  renderHomeDashboard();
}

function renderTagConfig() {
  if (!el.tagConfigTbody) return;
  el.tagConfigEmpty.hidden = state.tags.length > 0;
  el.tagConfigTbody.innerHTML = state.tags
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          <span ${tagBadgeAttrs(t.ten_tag)}>&nbsp;</span>
          <input class="inline-cell-input tag-name-input" data-id="${t.id}" value="${t.ten_tag}" style="flex:1" />
        </div>
      </td>
      <td><span class="pill-x delete-tag-btn" data-id="${t.id}" title="Xóa tag">×</span></td>
    </tr>`,
    )
    .join("");

  el.tagConfigTbody.querySelectorAll(".tag-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên tag không được để trống.");
        input.value = state.tags.find((t) => t.id === Number(input.dataset.id))?.ten_tag ?? "";
        return;
      }
      try {
        await api(`/api/tags/${input.dataset.id}`, { method: "PUT", body: JSON.stringify({ ten_tag: value }) });
        await loadTags();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.tagConfigTbody.querySelectorAll(".delete-tag-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa tag này? Các task đang gắn tag này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/tags/${btn.dataset.id}`, { method: "DELETE" });
        await loadTags();
        showToast("Đã xóa tag.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function renderPhanLoaiConfig() {
  if (!el.phanLoaiConfigTbody) return;
  el.phanLoaiConfigEmpty.hidden = state.phanLoaiOptions.length > 0;
  el.phanLoaiConfigTbody.innerHTML = state.phanLoaiOptions
    .map(
      (p) => `
    <tr data-id="${p.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          <span ${phanLoaiBadgeAttrs(p.ten_phan_loai)}>&nbsp;</span>
          <input class="inline-cell-input phanloai-name-input" data-id="${p.id}" value="${p.ten_phan_loai}" style="flex:1" />
        </div>
      </td>
      <td><span class="pill-x delete-phanloai-btn" data-id="${p.id}" title="Xóa phân loại">×</span></td>
    </tr>`,
    )
    .join("");

  el.phanLoaiConfigTbody.querySelectorAll(".phanloai-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên phân loại không được để trống.");
        input.value = state.phanLoaiOptions.find((p) => p.id === Number(input.dataset.id))?.ten_phan_loai ?? "";
        return;
      }
      try {
        await api(`/api/phan-loai/${input.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ ten_phan_loai: value }),
        });
        await loadPhanLoai();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.phanLoaiConfigTbody.querySelectorAll(".delete-phanloai-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa phân loại này? Các task đang gắn phân loại này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/phan-loai/${btn.dataset.id}`, { method: "DELETE" });
        await loadPhanLoai();
        showToast("Đã xóa phân loại.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addTagBtn.addEventListener("click", async () => {
  try {
    await api("/api/tags", { method: "POST", body: JSON.stringify({ ten_tag: "Tag mới" }) });
    await loadTags();
  } catch (err) {
    showToast(err.message);
  }
});
el.addPhanLoaiBtn.addEventListener("click", async () => {
  try {
    await api("/api/phan-loai", { method: "POST", body: JSON.stringify({ ten_phan_loai: "Phân loại mới" }) });
    await loadPhanLoai();
  } catch (err) {
    showToast(err.message);
  }
});

// Danh mục Nhóm hiển thị ở cột "Nhóm" của tab Tiêu chí — đổi ở đây ảnh hưởng
// ngay tới màu badge (nhomColorClass) và dropdown "Nhóm" ở dialog Thêm/Sửa
// tiêu chí.
async function loadNhom() {
  state.nhomOptions = await api("/api/nhom");
  renderNhomConfig();
  renderTieuChi();
}

function renderNhomConfig() {
  if (!el.nhomConfigTbody) return;
  el.nhomConfigEmpty.hidden = state.nhomOptions.length > 0;
  el.nhomConfigTbody.innerHTML = state.nhomOptions
    .map(
      (n) => `
    <tr data-id="${n.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          <span class="status-badge ${nhomColorClass(n.ten_nhom)}">&nbsp;</span>
          <input class="inline-cell-input nhom-name-input" data-id="${n.id}" value="${n.ten_nhom}" style="flex:1" />
        </div>
      </td>
      <td><span class="pill-x delete-nhom-btn" data-id="${n.id}" title="Xóa nhóm">×</span></td>
    </tr>`,
    )
    .join("");

  el.nhomConfigTbody.querySelectorAll(".nhom-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên nhóm không được để trống.");
        input.value = state.nhomOptions.find((n) => n.id === Number(input.dataset.id))?.ten_nhom ?? "";
        return;
      }
      try {
        await api(`/api/nhom/${input.dataset.id}`, { method: "PUT", body: JSON.stringify({ ten_nhom: value }) });
        await loadNhom();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.nhomConfigTbody.querySelectorAll(".delete-nhom-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa nhóm này? Các tiêu chí đang gắn nhóm này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/nhom/${btn.dataset.id}`, { method: "DELETE" });
        await loadNhom();
        showToast("Đã xóa nhóm.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addNhomBtn.addEventListener("click", async () => {
  try {
    await api("/api/nhom", { method: "POST", body: JSON.stringify({ ten_nhom: "Nhóm mới" }) });
    await loadNhom();
  } catch (err) {
    showToast(err.message);
  }
});

// Danh mục Chức vụ ở dropdown "Chức vụ" khi thêm/sửa nhân sự (Team & Nhân sự).
async function loadChucVu() {
  state.chucVuOptions = await api("/api/chuc-vu");
  renderChucVuConfig();
}

function renderChucVuConfig() {
  if (!el.chucVuConfigTbody) return;
  el.chucVuConfigEmpty.hidden = state.chucVuOptions.length > 0;
  el.chucVuConfigTbody.innerHTML = state.chucVuOptions
    .map(
      (c) => `
    <tr data-id="${c.id}">
      <td><input class="inline-cell-input chucvu-name-input" data-id="${c.id}" value="${c.ten_chuc_vu}" style="width:100%" /></td>
      <td><span class="pill-x delete-chucvu-btn" data-id="${c.id}" title="Xóa chức vụ">×</span></td>
    </tr>`,
    )
    .join("");

  el.chucVuConfigTbody.querySelectorAll(".chucvu-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên chức vụ không được để trống.");
        input.value = state.chucVuOptions.find((c) => c.id === Number(input.dataset.id))?.ten_chuc_vu ?? "";
        return;
      }
      try {
        await api(`/api/chuc-vu/${input.dataset.id}`, { method: "PUT", body: JSON.stringify({ ten_chuc_vu: value }) });
        await loadChucVu();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.chucVuConfigTbody.querySelectorAll(".delete-chucvu-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Xóa chức vụ này? Các nhân sự đang gắn chức vụ này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/chuc-vu/${btn.dataset.id}`, { method: "DELETE" });
        await loadChucVu();
        showToast("Đã xóa chức vụ.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addChucVuBtn.addEventListener("click", async () => {
  try {
    await api("/api/chuc-vu", { method: "POST", body: JSON.stringify({ ten_chuc_vu: "Chức vụ mới" }) });
    await loadChucVu();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Home (dashboard) ----
// Ranking Team lấy đúng theo cột Tổng điểm ở tab Tổng hợp (homeComputeTeamScores);
// gọi lại renderHomeDashboard() mỗi khi state.teams/tieuChiConfigs/members đổi
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

  const allTeamNames = state.homeTeams.map((t) => t.name);
  const teamNames = state.homeTeamFilter ? allTeamNames.filter((n) => n === state.homeTeamFilter) : allTeamNames;

  const filteredTasks = state.homeTasks.filter((t) => teamNames.includes(t.team));
  const eligibleForRanking = homeEligibleTasks(filteredTasks);

  // Ranking Team lấy đúng theo cột Tổng điểm của bảng Tổng hợp (tab Tổng
  // hợp) — cùng công thức tính, không phải tổng Điểm chuẩn cấu hình nữa.
  const rankingData = teamNames
    .map((name) => ({ team: name, value: homeComputeTeamScores(name, eligibleForRanking).tongDiem }))
    .sort((a, b) => b.value - a.value);

  renderHomeTaskStatCard(filteredTasks);
  renderHomeVBarChart(rankingData);
  renderHomeTonghopTable(teamNames, filteredTasks);
  renderHomeCompletionRateTable(teamNames, filteredTasks);
  renderHomeCompletionTable(teamNames, filteredTasks);
  renderHomeRankingTab(rankingData, eligibleForRanking);
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
function renderHomeVBarChart(rankingData) {
  const chartEl = document.getElementById("home-vbar-chart");
  const legendEl = document.getElementById("home-vbar-legend");
  const calloutEl = document.getElementById("home-vbar-callout");

  if (rankingData.length === 0) {
    chartEl.innerHTML = `<p class="hbar-empty">Chưa có team nào ở tháng đang chọn.</p>`;
    legendEl.innerHTML = "";
    calloutEl.innerHTML = "";
    return;
  }

  const teams = rankingData.map((d) => d.team);
  const barValues = rankingData.map((d) => d.value);

  const width = 420;
  const height = 210;
  const padLeft = 30;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const n = teams.length;

  // Cột trải đều sát 2 bên trục (không chừa lề thừa), nhưng bề rộng mỗi cột
  // vẫn cố định thon gọn — phần dư trong mỗi ô là khoảng cách giữa các cột.
  const step = plotW / n;
  const xCenters = teams.map((_, i) => padLeft + step * (i + 0.5));
  const barWidth = 34;

  // Trục Tổng điểm mặc định hiển thị tối đa 120 — chỉ nới rộng hơn nếu có
  // team thực đạt điểm cao hơn 120.
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
  teams.forEach((name, i) => {
    const x = xCenters[i] - barWidth / 2;
    const yTop = yBar(barValues[i]);
    const barH = Math.max(3, padTop + plotH - yTop);
    bars += `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barH.toFixed(1)}" rx="3" fill="${homeTeamBarHex(name)}" />`;
    bars += `<text class="home-combo-barvalue" x="${xCenters[i].toFixed(1)}" y="${(yTop + 12).toFixed(1)}" text-anchor="middle">${barValues[i].toFixed(0)}</text>`;
    xLabels += `<text class="home-combo-xlabel" x="${xCenters[i].toFixed(1)}" y="${height - 4}" text-anchor="middle">${name}</text>`;
  });

  chartEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}">
      ${gridLines}
      <text class="home-combo-axis-label" x="${padLeft}" y="12">Tổng điểm</text>
      ${bars}
      ${xLabels}
    </svg>`;

  legendEl.innerHTML = rankingData
    .map(
      (d) => `
    <div class="home-legend-item">
      <span class="home-legend-dot ${homeTeamBarColorClass(d.team)}"></span>
      <span>${d.team}</span>
    </div>`,
    )
    .join("");

  const top = rankingData[0];
  calloutEl.innerHTML = `<div class="big">${top.value.toFixed(1)}</div><div class="small">Team dẫn đầu: ${top.team}</div>`;
}

// Danh sách Tag (theo danh mục Tag ở Cấu hình → Tag & Phân loại) — dùng làm
// nhóm cột trong bảng tổng hợp "Tỉ lệ hoàn thành nhiệm vụ" ở Home. Đọc trực
// tiếp từ state.tags mỗi lần dùng để luôn khớp danh mục hiện tại (thêm/xóa/
// đổi tên tag ở Cấu hình phản ánh ngay ở Home).
function homeCompletionTagCategories() {
  return state.tags.map((t) => t.ten_tag);
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
function homeTieuChiValue(tenTieuChi, team) {
  const config = state.tieuChiConfigs.find((c) => c.ten_tieu_chi === tenTieuChi);
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

// Bản sao computeNoiQuyRows() (tab Nội quy) nhưng dùng dữ liệu theo đúng
// tháng đang xem ở Home (state.homeAttendanceRecords/homeMembers/
// homeNoiQuyOverrideNames) thay vì tháng đang chọn ở Backlog/Team.
function computeHomeNoiQuyRows() {
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
    const excluded = state.homeNoiQuyOverrideNames.has(name);
    return {
      name,
      team: member?.team_name ?? "-",
      total: excluded ? 0 : Math.max(0, late - 3),
    };
  });
}

// Điểm trừ Nội quy của 1 team = tổng cột Total (Lượt đi muộn − 3, đã trừ
// người được "Không tính đi muộn") của tất cả nhân sự team đó, tab Nội quy.
function homeNoiQuyCount(team) {
  return computeHomeNoiQuyRows()
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
// Tính đủ các thành phần của bảng Tổng hợp cho 1 team (dùng chung cho bảng
// Tổng hợp điểm theo Team và cho biểu đồ Ranking Team, vì Ranking Team lấy
// dữ liệu trực tiếp từ đúng cột Tổng điểm này).
function homeComputeTeamScores(team, eligible) {
  const periodIncidents = state.incidents.filter((i) => i.period_id === state.homePeriodId && i.team_name === team);
  const periodTicket = state.tickets.find((t) => t.period_id === state.homePeriodId && t.team_name === team);
  const periodCreationRate = state.creationRates.find((r) => r.period_id === state.homePeriodId && r.team_name === team);

  const ratio = homeTeamCompletionRatio(team, eligible);
  const sprintGoalCfg = homeTieuChiValue("Tiến độ hoàn thành Sprint goal", team);
  const sprintGoal = ratio !== null && sprintGoalCfg.diemChuan !== null ? ratio * sprintGoalCfg.diemChuan : null;

  const suCoCfg = homeTieuChiValue("Số lượng sự cố mức độ ảnh hưởng nghiêm trọng đến khách hàng", team);
  const slSuCo = periodIncidents.length;
  // Chưa khai báo sự cố nào (CSKH → Sự cố) thì mặc định lấy đúng Điểm
  // chuẩn đã cấu hình; có sự cố mới áp công thức Điểm chuẩn − (Điểm
  // chuẩn × (SL sự cố × 10%)). Team chưa cấu hình Điểm chuẩn thì để
  // trống, không mặc định về 0.
  const suCo = suCoCfg.diemChuan === null ? null : slSuCo === 0 ? suCoCfg.diemChuan : suCoCfg.diemChuan - suCoCfg.diemChuan * (slSuCo * 0.1);

  const ticketCfg = homeTieuChiValue("Tỷ lệ xử lý yêu cầu hỗ trợ đúng hạn", team);
  const tyLeTicket =
    ticketCfg.diemChuan !== null && periodTicket && ticketCfg.chiTieu ? ((periodTicket.ty_le * 100) / ticketCfg.chiTieu) * ticketCfg.diemChuan : null;

  const khoiTaoCfg = homeTieuChiValue("Tỷ lệ khởi tạo dịch vụ thành công đúng hạn", team);
  const tyLeKhoiTao =
    khoiTaoCfg.diemChuan !== null && periodCreationRate && khoiTaoCfg.chiTieu
      ? ((periodCreationRate.grand_total * 100) / khoiTaoCfg.chiTieu) * khoiTaoCfg.diemChuan
      : null;

  // Tổng điểm = Sprint Goal + Sự cố + Tỷ lệ xử lý ticket + Tỷ lệ khởi tạo
  // − Tuân thủ quy trình,KH chung − Tuân thủ nội quy + Hỗ trợ,phối hợp +
  // Đào tạo. 2 cột Tuân thủ đã hiển thị dạng số âm (VD -1) nên cộng thẳng
  // giá trị đó vào (không trừ thêm lần nữa).
  const tuanThuSigned = -(homeComplianceCount(team) / 2);
  const noiQuySigned = -(homeNoiQuyCount(team) / 2);
  const hoTroSigned = homeSupportCount(team) / 2;
  const daoTaoSigned = homeTrainingCount(team) / 2;
  const tongDiem = (sprintGoal ?? 0) + (suCo ?? 0) + (tyLeTicket ?? 0) + (tyLeKhoiTao ?? 0) + tuanThuSigned + noiQuySigned + hoTroSigned + daoTaoSigned;

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
      ${homeDeductionCell(homeNoiQuyCount(team))}
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
        ["Tuân thủ nội quy", null, -(homeNoiQuyCount(team) / 2)],
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
  // viên trong chính team này.
  const teamRankPosition = teamNames.indexOf(team) + 1;
  const members = state.homeDanhGiaRecords
    .filter((r) => r.team_name === team)
    .sort((a, b) => a.so_thu_tu - b.so_thu_tu);
  const memberTbody = document.getElementById("home-ranking-member-tbody");
  memberTbody.innerHTML = members.length
    ? members
        .map((m, i) => {
          const kiColumn = homeKiColumnForMemberRank(i, members.length);
          return `
      <tr>
        <td style="text-align:left">${m.member_name}</td>
        <td>${m.so_thu_tu}</td>
        <td>${homeKiValue(kiColumn, teamRankPosition)}</td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="hbar-empty">Chưa có dữ liệu Đánh giá cho team này.</td></tr>`;
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

  const tagCategories = homeCompletionTagCategories();
  renderHomeCompletionRateThead(tagCategories);
  const colCount = 1 + tagCategories.length + 1;
  const eligible = homeEligibleTasks(tasksInScope);

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

  const tagCategories = homeCompletionTagCategories();
  renderHomeCompletionThead(tagCategories);
  const colCount = 1 + (tagCategories.length + 1) * 2;
  const eligible = homeEligibleTasks(tasksInScope);

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

// ---- Sidebar navigation ----

const pages = {
  home: document.getElementById("page-home"),
  backlog: document.getElementById("page-backlog"),
  team: document.getElementById("page-team"),
  cskh: document.getElementById("page-cskh"),
  config: document.getElementById("page-config"),
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(pages).forEach(([key, section]) => {
      section.hidden = key !== btn.dataset.page;
    });
  });
});

// ---- Init & Auth ----

async function checkAuth() {
  try {
    const res = await fetch("/auth/me");
    if (!res.ok) return;
    const data = await res.json();
    if (data.ssoEnabled) {
      if (!data.authenticated) {
        window.location.href = "/auth/login";
        return;
      }
      const sidebarUser = document.getElementById("sidebar-user");
      const userName = document.getElementById("user-name");
      const userEmail = document.getElementById("user-email");
      if (sidebarUser && data.user) {
        sidebarUser.style.display = "flex";
        if (userName) userName.textContent = data.user.name || data.user.username;
        if (userEmail) userEmail.textContent = data.user.email || data.user.username;
      }
    }
  } catch (err) {
    console.warn("Auth check error:", err);
  }
}

(function init() {
  checkAuth();
  const now = today();
  el.newYear.value = now.getFullYear();
  el.newMonth.value = now.getMonth() + 1;
  Promise.all([
    loadPeriods(),
    loadIncidents(),
    loadTickets(),
    loadCreationRates(),
    loadTieuChi(),
    loadRanking(),
    loadTags(),
    loadPhanLoai(),
    loadNhom(),
    loadChucVu(),
  ]).catch((err) => showToast(err.message));
})();
