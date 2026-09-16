const state = {
  currentUserId: null, // id cục bộ (bảng users) của người đang đăng nhập — xem checkAuth()
  departments: [],
  currentDepartmentId: null,
  periods: [],
  currentPeriodId: null,
  teams: [],
  currentTeam: "",
  currentTeamId: null,
  members: [], // toàn bộ nhân sự (mọi team), mỗi item kèm team_name
  memberFilterTeam: "", // "" = tất cả
  memberSearch: "",
  selectedMemberIds: new Set(),
  memberKpiTheoTask: [], // dữ liệu task đã tham gia của từng nhân sự (GET /api/kpi-theo-task) — dùng cho cột "Điểm cá nhân (Tính theo task)" + popup chi tiết ở tab Nhân sự
  tasksAll: [], // toàn bộ task của tháng đang chọn (chưa lọc)
  tasks: [], // task sau khi áp bộ lọc (Tính chất / Team / Trạng thái)
  taskFilters: { nature: "", excludedFromScore: "", team: "", status: "", tag: "" },
  taskSearch: "",
  taskWarningFilter: "", // "" | "no-score" | "overdue" | "upcoming" — bấm vào 1 cảnh báo để lọc nhanh
  selectedTaskIds: new Set(),
  incidents: [],
  tickets: [],
  creationRates: [],
  complianceRecords: [],
  trainingRecords: [],
  supportRecords: [],
  evaluationRecords: [],
  criteriaConfigs: [],
  rankingConfig: { rows: [], columns: [], cells: [] },
  tags: [],
  categoryOptions: [],
  groupOptions: [],
  positionOptions: [],
  systemOptions: [],
  objectiveOptions: [],
  memberParticipationOptions: [],
  taskMemberTaskId: null, // task đang mở dialog "Nhân sự tham gia"
  taskMemberTaskScore: null, // % Đánh giá của task đó (null nếu chưa chấm điểm)
  taskMembers: [], // danh sách nhân sự của task đang mở dialog
  taskMemberAvailable: [], // nhân sự chưa gán, để gõ tìm/gợi ý
  taskMemberSelectedId: null, // member_id đã chọn từ gợi ý (bấm "+ Thêm" cần có)
  taskMemberScoreUnit: "percent", // đơn vị hiển thị/nhập cột Điểm cá nhân: "percent" | "scale5"
  roadmapItems: [],
  roadmapYear: new Date().getFullYear(),
  roadmapSearch: "",
  roadmapSelectedId: null, // dòng đang mở panel "Chi tiết công việc theo tháng"
  roadmapDetails: [],
  roadmapSelectedIds: new Set(), // các dòng đang tick chọn (checkbox) để xóa hàng loạt
  homePeriodId: null, // Tháng đang xem ở trang Home — độc lập với period đang chọn ở Backlog/Team
  homeTeamFilter: "", // "" = tất cả team
  homeTeams: [],
  homeMembers: [],
  homeTasks: [],
  homeComplianceRecords: [],
  homeAttendanceRecords: [],
  homeWorkRuleOverrideNames: new Set(),
  homeSupportRecords: [],
  homeTrainingRecords: [],
  homeEvaluationRecords: [],
  homeKpiTheoTask: [], // KPI nhân sự theo task (phòng ban cach_tinh_kpi="theo_task") — xem GET /api/kpi-theo-task
  homeRankingSelectedTeam: null, // Team đang xem chi tiết ở tab Ranking (Home)
  attendanceHeaders: [], // cột động lấy từ dòng tiêu đề file Excel đã import
  attendanceRecords: [],
  selectedAttendanceIds: new Set(),
  attendanceSearch: "", // tìm theo từ khoá trên mọi cột (bộ lọc Team không áp dụng cho tab này)
  workRuleOverrideNames: new Set(), // nhân sự đã "Không tính đi muộn" trong tháng đang chọn
  selectedWorkRuleNames: new Set(),
  workRuleSearch: "",
};

const el = {
  deptSwitcher: document.getElementById("dept-switcher"),
  deptTrigger: document.getElementById("dept-trigger"),
  deptTriggerMono: document.getElementById("dept-trigger-mono"),
  deptTriggerName: document.getElementById("dept-trigger-name"),
  deptPanel: document.getElementById("dept-panel"),
  deptTip: document.getElementById("dept-tip"),
  periodSelect: document.getElementById("period-select"),
  teamPeriodSelect: document.getElementById("team-period-select"),
  configTeamPeriod: document.getElementById("config-team-period"),
  configTeamDept: document.getElementById("config-team-dept"),
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
  filterNature: document.getElementById("filter-tinh-chat"),
  filterExcludedFromScore: document.getElementById("filter-khong-tinh-diem"),
  filterTeam: document.getElementById("filter-team"),
  filterStatus: document.getElementById("filter-trang-thai"),
  filterTag: document.getElementById("filter-tag"),
  addMemberBtn: document.getElementById("add-member-btn"),
  downloadMemberTemplateBtn: document.getElementById("download-member-template-btn"),
  importMembersBtn: document.getElementById("import-members-btn"),
  memberFileInput: document.getElementById("member-file-input"),
  downloadTaskTemplateBtn: document.getElementById("download-task-template-btn"),
  importTasksBtn: document.getElementById("import-tasks-btn"),
  taskFileInput: document.getElementById("task-file-input"),
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
  bulkActions: document.getElementById("bulk-actions"),
  bulkActionsBtn: document.getElementById("bulk-actions-btn"),
  bulkActionsMenu: document.getElementById("bulk-actions-menu"),
  selectedTaskCount: document.getElementById("selected-task-count"),
  taskTbody: document.getElementById("task-tbody"),
  emptyState: document.getElementById("empty-state"),
  taskDialog: document.getElementById("task-dialog"),
  taskDialogTitle: document.getElementById("task-dialog-title"),
  taskForm: document.getElementById("task-form"),
  cancelBtn: document.getElementById("cancel-btn"),
  gradeDialog: document.getElementById("grade-dialog"),
  gradeForm: document.getElementById("grade-form"),
  gradeCancelBtn: document.getElementById("grade-cancel-btn"),
  progressDialog: document.getElementById("progress-dialog"),
  progressForm: document.getElementById("progress-form"),
  progressCancelBtn: document.getElementById("progress-cancel-btn"),
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
  addEvaluationBtn: document.getElementById("add-danhgia-btn"),
  evaluationTbody: document.getElementById("danhgia-tbody"),
  evaluationEmpty: document.getElementById("danhgia-empty"),
  evaluationDialog: document.getElementById("danhgia-dialog"),
  evaluationDialogTitle: document.getElementById("danhgia-dialog-title"),
  evaluationForm: document.getElementById("danhgia-form"),
  evaluationCancelBtn: document.getElementById("danhgia-cancel-btn"),
  addCriteriaBtn: document.getElementById("add-tieuchi-btn"),
  criteriaTbody: document.getElementById("tieuchi-tbody"),
  criteriaEmpty: document.getElementById("tieuchi-empty"),
  criteriaTheadRow: document.getElementById("tieuchi-thead-row"),
  criteriaTongDiemRow: document.getElementById("tieuchi-tongdiem-row"),
  criteriaDialog: document.getElementById("tieuchi-dialog"),
  criteriaDialogTitle: document.getElementById("tieuchi-dialog-title"),
  criteriaForm: document.getElementById("tieuchi-form"),
  criteriaCancelBtn: document.getElementById("tieuchi-cancel-btn"),
  cloneCriteriaBtn: document.getElementById("clone-tieuchi-btn"),
  cloneCriteriaDialog: document.getElementById("clone-tieuchi-dialog"),
  cloneCriteriaForm: document.getElementById("clone-tieuchi-form"),
  cloneCriteriaCancelBtn: document.getElementById("clone-tieuchi-cancel-btn"),
  tcCalcType: document.getElementById("tc-kieu-tinh"),
  tcSourceRow: document.getElementById("tc-nguon-row"),
  tcSource: document.getElementById("tc-nguon"),
  tcFactorWrap: document.getElementById("tc-he-so-wrap"),
  tcFactor: document.getElementById("tc-he-so"),
  tcCalcTypeHint: document.getElementById("tc-kieu-tinh-hint"),
  addRankingColumnBtn: document.getElementById("add-ranking-column-btn"),
  addRankingRowBtn: document.getElementById("add-ranking-row-btn"),
  rankingTheadRow: document.getElementById("ranking-thead-row"),
  rankingTbody: document.getElementById("ranking-tbody"),
  rankingEmpty: document.getElementById("ranking-empty"),
  addTagBtn: document.getElementById("add-tag-btn"),
  tagConfigTbody: document.getElementById("tag-config-tbody"),
  tagConfigEmpty: document.getElementById("tag-config-empty"),
  addCategoryBtn: document.getElementById("add-phanloai-btn"),
  categoryConfigTbody: document.getElementById("phanloai-config-tbody"),
  categoryConfigEmpty: document.getElementById("phanloai-config-empty"),
  addGroupBtn: document.getElementById("add-nhom-btn"),
  groupConfigTbody: document.getElementById("nhom-config-tbody"),
  groupConfigEmpty: document.getElementById("nhom-config-empty"),
  addPositionBtn: document.getElementById("add-chucvu-btn"),
  positionConfigTbody: document.getElementById("chucvu-config-tbody"),
  addDepartmentBtn: document.getElementById("add-department-btn"),
  departmentConfigTbody: document.getElementById("department-config-tbody"),
  departmentConfigEmpty: document.getElementById("department-config-empty"),
  addSystemBtn: document.getElementById("add-hethong-btn"),
  systemConfigTbody: document.getElementById("hethong-config-tbody"),
  systemConfigEmpty: document.getElementById("hethong-config-empty"),
  addObjectiveBtn: document.getElementById("add-muctieu-btn"),
  objectiveConfigTbody: document.getElementById("muctieu-config-tbody"),
  objectiveConfigEmpty: document.getElementById("muctieu-config-empty"),
  addMemberParticipationBtn: document.getElementById("add-phanloainhansu-btn"),
  memberParticipationConfigTbody: document.getElementById("phanloainhansu-config-tbody"),
  memberParticipationConfigEmpty: document.getElementById("phanloainhansu-config-empty"),
  taskMemberDialog: document.getElementById("task-member-dialog"),
  taskMemberDialogTitle: document.getElementById("task-member-dialog-title"),
  taskMemberDialogTeam: document.getElementById("task-member-dialog-team"),
  taskMemberScoreRow: document.getElementById("task-member-score-row"),
  taskMemberScoreBadge: document.getElementById("task-member-score-badge"),
  taskMemberUnitRow: document.getElementById("task-member-unit-row"),
  taskMemberTotalRow: document.getElementById("task-member-total-row"),
  taskMemberTotalBadge: document.getElementById("task-member-total-badge"),
  tmScoreUnit: document.getElementById("tm-score-unit"),
  tmSplitEvenBtn: document.getElementById("tm-split-even-btn"),
  taskMemberThead: document.getElementById("task-member-thead"),
  taskMemberTbody: document.getElementById("task-member-tbody"),
  taskMemberEmpty: document.getElementById("task-member-empty"),
  taskMemberCloseBtn: document.getElementById("task-member-close-btn"),
  tmMember: document.getElementById("tm-member"),
  tmMemberSuggestions: document.getElementById("tm-member-suggestions"),
  tmCategory: document.getElementById("tm-phan-loai"),
  tmNote: document.getElementById("tm-ghi-chu"),
  tmAddBtn: document.getElementById("tm-add-btn"),
  roadmapSearch: document.getElementById("roadmap-search"),
  roadmapYearValue: document.getElementById("roadmap-year-value"),
  roadmapYearPrev: document.getElementById("roadmap-year-prev"),
  roadmapYearNext: document.getElementById("roadmap-year-next"),
  addRoadmapBtn: document.getElementById("add-roadmap-btn"),
  downloadRoadmapTemplateBtn: document.getElementById("download-roadmap-template-btn"),
  importRoadmapBtn: document.getElementById("import-roadmap-btn"),
  roadmapFileInput: document.getElementById("roadmap-file-input"),
  roadmapSelectAll: document.getElementById("roadmap-select-all"),
  deleteSelectedRoadmapBtn: document.getElementById("delete-selected-roadmap-btn"),
  selectedRoadmapCount: document.getElementById("selected-roadmap-count"),
  roadmapTbody: document.getElementById("roadmap-tbody"),
  roadmapEmpty: document.getElementById("roadmap-empty"),
  roadmapDialog: document.getElementById("roadmap-dialog"),
  roadmapForm: document.getElementById("roadmap-form"),
  roadmapDialogTitle: document.getElementById("roadmap-dialog-title"),
  roadmapCancelBtn: document.getElementById("roadmap-cancel-btn"),
  roadmapDetailCard: document.getElementById("roadmap-detail-card"),
  roadmapDetailTitle: document.getElementById("roadmap-detail-title"),
  roadmapDetailSub: document.getElementById("roadmap-detail-sub"),
  roadmapDetailMonths: document.getElementById("roadmap-detail-months"),
  roadmapDetailClose: document.getElementById("roadmap-detail-close"),
  roadmapDetailDialog: document.getElementById("roadmap-detail-dialog"),
  roadmapDetailForm: document.getElementById("roadmap-detail-form"),
  roadmapDetailDialogTitle: document.getElementById("roadmap-detail-dialog-title"),
  roadmapDetailCancelBtn: document.getElementById("roadmap-detail-cancel-btn"),
  confirmDialogEl: document.getElementById("confirm-dialog"),
  confirmDialogIcon: document.getElementById("confirm-dialog-icon"),
  confirmDialogTitle: document.getElementById("confirm-dialog-title"),
  confirmDialogMessage: document.getElementById("confirm-dialog-message"),
  confirmOkBtn: document.getElementById("confirm-ok-btn"),
  confirmCancelBtn: document.getElementById("confirm-cancel-btn"),
  positionConfigEmpty: document.getElementById("chucvu-config-empty"),
  importAttendanceBtn: document.getElementById("import-attendance-btn"),
  attendanceFileInput: document.getElementById("attendance-file-input"),
  attendanceSearch: document.getElementById("attendance-search"),
  attendanceThead: document.getElementById("attendance-thead"),
  attendanceTbody: document.getElementById("attendance-tbody"),
  attendanceEmpty: document.getElementById("attendance-empty"),
  workRuleTbody: document.getElementById("noiquy-tbody"),
  workRuleEmpty: document.getElementById("noiquy-empty"),
  workRuleSearch: document.getElementById("noiquy-search"),
  markExcludedWorkRuleBtn: document.getElementById("mark-excluded-noiquy-btn"),
  unmarkExcludedWorkRuleBtn: document.getElementById("unmark-excluded-noiquy-btn"),
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

// Công thức tính điểm cho 1 tiêu chí, dùng ở dialog Tiêu chí (Cấu hình) và
// khi tính Tổng điểm ở tab Tổng hợp (homeCriteriaContribution) — thay cho
// việc hard-code theo tên tiêu chí trong code như trước. needsSource/needsFactor
// quyết định 2 trường "Nguồn dữ liệu"/"Hệ số" có hiện trong dialog không.
const CRITERIA_CALC_TYPES = [
  { value: "khong_tinh", label: "Không tính vào Tổng điểm", needsSource: false, needsFactor: false, hint: "Tiêu chí thuần thông tin — không cộng/trừ vào Tổng điểm ở tab Tổng hợp." },
  { value: "ty_le_x_diem_chuan", label: "Tỷ lệ (nguồn dữ liệu) × Điểm chuẩn", needsSource: true, needsFactor: false, hint: "VD: Tỷ lệ hoàn thành nhiệm vụ × Điểm chuẩn đã cấu hình cho team đó." },
  { value: "ty_le_chia_chi_tieu_x_diem_chuan", label: "(Thực tế ÷ Chỉ tiêu) × Điểm chuẩn", needsSource: true, needsFactor: false, hint: "Cần bật \"Có dòng Chỉ tiêu riêng\" ở trên và nhập Chỉ tiêu cho từng team." },
  { value: "tru_theo_loi", label: "Điểm chuẩn − Điểm chuẩn × (SL lỗi × Hệ số)", needsSource: true, needsFactor: true, hint: "Hệ số = % trừ cho mỗi lỗi (VD 0.1 = trừ 10%/lỗi). Chưa có lỗi nào thì lấy đúng Điểm chuẩn." },
  { value: "dem_dong_cong", label: "Đếm số dòng khai báo ÷ Hệ số (cộng +)", needsSource: true, needsFactor: true, hint: "Hệ số = số dòng cần để được +1 điểm (VD 2 = cứ 2 dòng +1 điểm)." },
  { value: "dem_dong_tru", label: "Đếm số dòng khai báo ÷ Hệ số (trừ −)", needsSource: true, needsFactor: true, hint: "Hệ số = số dòng cần để bị -1 điểm (VD 2 = cứ 2 dòng -1 điểm)." },
];

const CRITERIA_DATA_SOURCES = [
  { value: "ty_le_hoan_thanh_nhiem_vu", label: "Tỷ lệ hoàn thành nhiệm vụ (Backlog)" },
  { value: "so_luong_su_co", label: "SL sự cố (CSKH → Sự cố)" },
  { value: "ty_le_xu_ly_ticket", label: "Tỷ lệ xử lý ticket (CSKH → Hỗ trợ ticket)" },
  { value: "ty_le_khoi_tao", label: "Tỷ lệ khởi tạo (CSKH → Tỉ lệ khởi tạo)" },
  { value: "dem_tuan_thu", label: "Số dòng khai báo (Team & Nhân sự → Tuân thủ)" },
  { value: "dem_noi_quy", label: "Tổng Lượt đi muộn (Nội quy)" },
  { value: "dem_ho_tro", label: "Số dòng khai báo (CSKH → Hỗ trợ)" },
  { value: "dem_dao_tao", label: "Số dòng khai báo (Đào tạo)" },
];

const STATUS_CLASS = {
  "Chưa thực hiện": "status-default",
  "Đang thực hiện": "status-dang-thuc-hien",
  "Hoàn thành": "status-hoan-thanh",
  "Hủy": "status-huy",
};

// Màu badge Tag/Phân loại gán tự động theo VỊ TRÍ trong danh mục (state.tags /
// state.categoryOptions, quản lý ở Cấu hình → Tag & Phân loại) — không lưu
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

const CATEGORY_PALETTE = [
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

function categoryBadgeAttrs(value) {
  if (value === "Nhiệm vụ tồn") return `class="status-badge tinh-chat-ton"`;
  if (value === "NV năm") return `class="status-badge tinh-chat-nv-nam"`;
  const idx = state.categoryOptions.findIndex((p) => p.ten_phan_loai === value);
  if (idx === -1) return `class="status-badge status-default"`;
  const c = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
  return `class="status-badge" style="background:${c.bg};color:${c.text}"`;
}

// Hiển thị Tính chất dạng badge giống cột Trạng thái — mỗi giá trị đã chọn là
// 1 badge, mỗi loại 1 màu riêng để dễ phân biệt.
function renderNatureBadges(value) {
  const items = (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const badges = items.map((item) => `<span ${categoryBadgeAttrs(item)}>${item}</span>`).join("");
  return badges ? `<div class="badge-group">${badges}</div>` : "";
}

// Loại (tab Đào tạo) — "Đào tạo" / "Chứng chỉ QT", mỗi loại 1 màu riêng.
const TRAINING_TYPE_CLASS = {
  "Đào tạo": "loai-dao-tao",
  "Chứng chỉ QT": "loai-chung-chi",
};

function typeColorClass(value) {
  return TRAINING_TYPE_CLASS[value] || "status-default";
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
// trí trong danh mục state.groupOptions — cùng bảng màu với team-color-N.
function groupColorClass(group) {
  const index = state.groupOptions.findIndex((n) => n.ten_nhom === group);
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
const evaluationPagination = createPagination("danhgia", () => renderEvaluationRecords());
const attendancePagination = createPagination("attendance", () => renderAttendanceTable());
const roadmapPagination = createPagination("roadmap", () => renderRoadmap());
const workRulePagination = createPagination("noiquy", () => renderWorkRuleTable());

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

// Popup xác nhận dùng chung toàn hệ thống, thay cho window.confirm() mặc
// định của trình duyệt (không theo được giao diện/theme của trang). Trả về
// Promise<boolean> — resolve(true) khi bấm OK, resolve(false) khi Hủy/Esc.
// `opts.danger` (mặc định true) quyết định màu nút OK: đỏ cho hành động phá
// hủy (xóa...), xanh olive (primary) cho hành động có thể đảo ngược.
function confirmDialog(message, opts = {}) {
  const { title = "Xác nhận", okText = "OK", cancelText = "Hủy", danger = true } = opts;
  return new Promise((resolve) => {
    el.confirmDialogIcon.textContent = danger ? "!" : "✓";
    el.confirmDialogIcon.className = danger ? "confirm-icon" : "confirm-icon confirm-icon-primary";
    el.confirmDialogTitle.textContent = title;
    el.confirmDialogMessage.textContent = message;
    el.confirmOkBtn.textContent = okText;
    el.confirmOkBtn.className = danger ? "danger" : "primary";
    el.confirmCancelBtn.textContent = cancelText;

    // Chỉ cần bắt sự kiện "close" của dialog (luôn nổ ra dù đóng bằng cách
    // nào: bấm OK, Hủy, nút X ở góc, hay phím Esc) — không cần bắt riêng
    // từng đường đóng. okClicked đánh dấu đường đóng duy nhất trả về true.
    let okClicked = false;
    const onOk = () => {
      okClicked = true;
      el.confirmDialogEl.close();
    };
    const onCancelClick = () => el.confirmDialogEl.close();
    const onClose = () => {
      el.confirmOkBtn.removeEventListener("click", onOk);
      el.confirmCancelBtn.removeEventListener("click", onCancelClick);
      el.confirmDialogEl.removeEventListener("close", onClose);
      resolve(okClicked);
    };

    el.confirmOkBtn.addEventListener("click", onOk);
    el.confirmCancelBtn.addEventListener("click", onCancelClick);
    el.confirmDialogEl.addEventListener("close", onClose);
    el.confirmDialogEl.showModal();
  });
}

// Nút X đóng popup — dùng chung 1 handler ủy quyền cho mọi dialog trong hệ
// thống (xem .dialog-close-x trong style.css) thay vì gắn listener riêng
// cho từng dialog. Đóng "cứng" (không lưu), giống bấm nút Hủy.
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".dialog-close-x");
  if (!btn) return;
  const dialog = btn.closest("dialog");
  if (dialog?.open) dialog.close();
});

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

