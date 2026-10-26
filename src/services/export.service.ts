import ExcelJS from "exceljs";
import type { Period, Task } from "../types/backlog.js";
import { getPeriod } from "./period.service.js";
import { listTasks } from "./task.service.js";
import { listRoadmapItems } from "./roadmap.service.js";
import type { FeatureRequestWithDept } from "../types/featureRequest.js";

// 1.5 Xuất Excel theo mẫu "Backlog theo team" (xem ảnh mẫu đính kèm yêu cầu):
// hàng tiêu đề nền đỏ mận (maroon) chữ trắng, cột Trạng thái/% Hoàn thành tô
// màu theo giá trị. Đủ 14 cột — khớp CHÍNH XÁC các cột đang hiển thị ở bảng
// Danh sách nhiệm vụ trên màn hình (xem #task-table, index.html), theo đúng
// thứ tự trái sang phải.
const TOTAL_COLUMNS = 14; // A..N
const HEADER_FILL = "FF632423"; // đỏ mận đậm
const HEADER_FONT = "FFFFFFFF";
const TITLE_FILL = "FF9DC3E6";

const STATUS_FILL: Record<string, string> = {
  "Hoàn thành": "FFC6E0B4",
  "Đang thực hiện": "FFFFE699",
  "Hủy": "FFF4CCCC",
  "Chưa thực hiện": "FFD9D9D9",
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

function fillCell(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const HEADERS = [
  "STT", "Tag", "Phân loại", "Team", "Nhiệm vụ", "DoD", "Deadline",
  "% Hoàn thành", "Trạng thái", "Đầu mối phối hợp", "Tiến độ", "Tính chất",
  "% Đánh giá", "Nội dung đánh giá",
];

const COLUMN_WIDTHS = [6, 12, 16, 10, 26, 30, 12, 12, 14, 18, 36, 16, 12, 30];

// "Tính chất" trên màn hình (cột cuối, KHÁC với cột "Phân loại" ở trên vốn
// lấy từ tasks.tinh_chat) thật ra hiển thị 2 cờ trạng thái riêng —
// khong_tinh_diem / da_chuyen_thang — xem renderTasks() ở 04-tasks.js. Gộp
// lại thành 1 ô text cho Excel, cách nhau bằng ", " nếu có cả 2.
function tinhChatSummary(task: Task): string {
  const parts: string[] = [];
  if (task.khong_tinh_diem) parts.push(task.khong_tinh_diem);
  if (task.da_chuyen_thang) parts.push("Đã chuyển");
  return parts.join(", ");
}

export async function exportBacklogToExcel(filter: {
  period_id: number;
  team?: string;
  department_id?: number | null;
}): Promise<ExcelJS.Buffer> {
  const period = await getPeriod(filter.period_id);
  if (!period) throw new Error("Không tìm thấy tháng backlog");

  const tasks = await listTasks(filter);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(period.label.replace(/[\\/*?:[\]]/g, "-"));
  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const titleText = filter.team
    ? `Backlog ${period.label} — Team ${filter.team}`
    : `Backlog ${period.label}`;

  sheet.mergeCells(1, 1, 1, TOTAL_COLUMNS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = titleText;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  fillCell(titleCell, TITLE_FILL);
  sheet.getRow(1).height = 24;

  const headerRow = 3;
  HEADERS.forEach((label, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, HEADER_FILL);
    cell.border = THIN_BORDER;
  });
  sheet.getRow(headerRow).height = 22;

  let rowIndex = headerRow + 1;
  for (const task of tasks) {
    const values: (string | number)[] = [
      task.stt,
      task.tag ?? "",
      task.tinh_chat ?? "",
      task.team,
      task.nhiem_vu,
      task.dod ?? "",
      formatDate(task.deadline),
      task.phan_tram_hoan_thanh / 100,
      task.trang_thai,
      task.dau_moi_phoi_hop ?? "",
      task.tien_do ?? "",
      tinhChatSummary(task),
      task.cpo_danh_gia !== null ? task.cpo_danh_gia / 100 : "",
      task.cpo_comment ?? "",
    ];

    values.forEach((val, i) => {
      const cell = sheet.getCell(rowIndex, i + 1);
      cell.value = val;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = THIN_BORDER;
      if (i === 7) cell.numFmt = "0%"; // % Hoàn thành
      if (i === 12 && task.cpo_danh_gia !== null) cell.numFmt = "0%"; // % Đánh giá
    });

    const statusCell = sheet.getCell(rowIndex, 9);
    const statusFill = STATUS_FILL[task.trang_thai];
    if (statusFill) fillCell(statusCell, statusFill);

    if (task.phan_tram_hoan_thanh >= 100) {
      fillCell(sheet.getCell(rowIndex, 8), "FFC6E0B4");
    }

    rowIndex += 1;
  }

  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: TOTAL_COLUMNS },
  };
  sheet.views = [{ state: "frozen", ySplit: headerRow }];

  return workbook.xlsx.writeBuffer();
}

// ---- Xuất Excel Roadmap năm — dùng chung style (màu tiêu đề, màu trạng
// thái) với exportBacklogToExcel ở trên cho đồng bộ nhìn 2 file. ----
const ROADMAP_HEADERS = [
  "STT", "Team", "Hệ thống", "Mục tiêu", "Nhiệm vụ", "DOD",
  "Điều kiện đảm bảo", "Phân loại", "Bắt đầu", "Kết thúc", "Quý kết thúc",
  "Trạng thái", "Ghi chú",
];
const ROADMAP_TOTAL_COLUMNS = ROADMAP_HEADERS.length;
const ROADMAP_STATUS_COLUMN = 12;
const ROADMAP_COLUMN_WIDTHS = [6, 12, 16, 16, 28, 26, 26, 14, 12, 12, 12, 14, 26];

// 3 tháng = 1 quý, suy ra từ Thời gian kết thúc — khớp quyFromDate() ở
// 07-roadmap.js (cột "Quý kết thúc" chỉ tính ở FE, không lưu DB).
function quarterFromDate(value: string | null): string {
  if (!value || value.length < 7) return "";
  const month = Number(value.slice(5, 7));
  if (!month) return "";
  return `Quý ${Math.ceil(month / 3)}/${value.slice(0, 4)}`;
}

export async function exportRoadmapToExcel(filter: {
  year: number;
  department_id?: number | null;
}): Promise<ExcelJS.Buffer> {
  const items = await listRoadmapItems(filter);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`Roadmap ${filter.year}`);
  sheet.columns = ROADMAP_COLUMN_WIDTHS.map((width) => ({ width }));

  sheet.mergeCells(1, 1, 1, ROADMAP_TOTAL_COLUMNS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Roadmap năm ${filter.year}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  fillCell(titleCell, TITLE_FILL);
  sheet.getRow(1).height = 24;

  const headerRow = 3;
  ROADMAP_HEADERS.forEach((label, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, HEADER_FILL);
    cell.border = THIN_BORDER;
  });
  sheet.getRow(headerRow).height = 22;

  let rowIndex = headerRow + 1;
  for (const [i, item] of items.entries()) {
    const values: (string | number)[] = [
      i + 1,
      item.team,
      item.he_thong ?? "",
      item.muc_tieu ?? "",
      item.nhiem_vu,
      item.dod ?? "",
      item.dieu_kien_dam_bao ?? "",
      item.phan_loai ?? "",
      formatDate(item.thoi_gian_bat_dau),
      formatDate(item.thoi_gian_ket_thuc),
      quarterFromDate(item.thoi_gian_ket_thuc),
      item.trang_thai,
      item.ghi_chu ?? "",
    ];

    values.forEach((val, colIdx) => {
      const cell = sheet.getCell(rowIndex, colIdx + 1);
      cell.value = val;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = THIN_BORDER;
    });

    const statusFill = STATUS_FILL[item.trang_thai];
    if (statusFill) fillCell(sheet.getCell(rowIndex, ROADMAP_STATUS_COLUMN), statusFill);

    rowIndex += 1;
  }

  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: ROADMAP_TOTAL_COLUMNS },
  };
  sheet.views = [{ state: "frozen", ySplit: headerRow }];

  return workbook.xlsx.writeBuffer();
}

// ---- Xuất Excel "Yêu cầu tính năng" — dùng chung style (màu tiêu đề) với
// 2 export trên. Đủ ĐÚNG các cột đang hiển thị ở #fr-table (index.html),
// theo đúng thứ tự trái sang phải, + cột "Loại yêu cầu" (ngay sau Tiêu đề —
// xem yêu cầu thêm cột này ở bảng). Danh sách dòng do controller truyền
// vào ĐÃ được lọc đúng theo bộ lọc + từ khoá đang áp dụng trên màn hình
// (xem exportFeatureRequestsHandler — nhận ids từ FE, FE tự tính từ
// filteredFeatureRequests() y hệt dữ liệu đang hiển thị, không phân trang).
const FR_HEADERS = [
  "STT", "Tiêu đề", "Loại yêu cầu", "Lĩnh vực", "Mảng", "Hoạt động/nghiệp vụ",
  "Quy trình số hóa", "Mã quy trình", "Bước số hóa",
  "Mô tả từng bước đang thực hiện", "Vấn đề tồn tại",
  "Hệ thống cần cải tiến (nếu có)", "Đề xuất quy trình/nghiệp vụ",
  "Hiệu quả khi thực hiện", "Thời gian mong muốn thực hiện", "Quý thực hiện",
  "Kế hoạch software", "Kết quả mong muốn", "Ưu tiên", "Đơn vị đề xuất",
  "Nhân sự đầu mối", "Ghi chú", "Trạng thái",
];
const FR_TOTAL_COLUMNS = FR_HEADERS.length;
const FR_COLUMN_WIDTHS = [
  6, 30, 16, 14, 14, 22, 16, 14, 16, 30, 24, 20, 24, 22, 16, 14, 20, 26, 12, 20, 16, 20, 16,
];

// Quý thực hiện — khớp CHÍNH XÁC frQuarterOf() ở 10-feature-requests.js
// (không lưu DB, chỉ suy từ "Thời gian mong muốn thực hiện").
const FR_QUARTER_LABELS = ["Quý I", "Quý II", "Quý III", "Quý IV"];
function frQuarterOf(value: string | null): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{1,2})/.exec(value);
  if (!m) return "";
  const month = Number(m[2]);
  if (month < 1 || month > 12) return "";
  return `${FR_QUARTER_LABELS[Math.floor((month - 1) / 3)]}/${m[1]}`;
}

// Nhãn trạng thái phụ thuộc phòng đang xem (bên đề xuất/đích thấy nhãn khác
// nhau) — khớp CHÍNH XÁC frStatusLabel()/frViewerSide() ở
// 10-feature-requests.js, để cột "Trạng thái" trong file export giống hệt
// badge trạng thái đang hiển thị trên màn hình của đúng phòng đang xem.
function frStatusLabelForExport(r: FeatureRequestWithDept, viewerDepartmentId: number | null): string {
  const side =
    r.target_department_id === viewerDepartmentId
      ? "target"
      : r.department_id === viewerDepartmentId
        ? "proposer"
        : null;
  if (r.trang_thai === "Từ chối") return "Từ chối yêu cầu";
  if (r.trang_thai === "Đã duyệt") return side === "target" ? "Đã duyệt" : "Đã tiếp nhận yêu cầu";
  return side === "target" ? "Chờ duyệt" : "Đã gửi yêu cầu";
}

export async function exportFeatureRequestsToExcel(
  rows: FeatureRequestWithDept[],
  viewerDepartmentId: number | null,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Yêu cầu tính năng");
  sheet.columns = FR_COLUMN_WIDTHS.map((width) => ({ width }));

  sheet.mergeCells(1, 1, 1, FR_TOTAL_COLUMNS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "Yêu cầu tính năng";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  fillCell(titleCell, TITLE_FILL);
  sheet.getRow(1).height = 24;

  const headerRow = 3;
  FR_HEADERS.forEach((label, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, HEADER_FILL);
    cell.border = THIN_BORDER;
  });
  sheet.getRow(headerRow).height = 22;

  let rowIndex = headerRow + 1;
  rows.forEach((r, i) => {
    const values: (string | number)[] = [
      i + 1,
      r.tieu_de,
      r.loai_yeu_cau ?? "",
      r.linh_vuc ?? "",
      r.mang ?? "",
      r.hoat_dong_nghiep_vu ?? "",
      r.quy_trinh_so_hoa ?? "",
      r.ma_quy_trinh ?? "",
      r.buoc_so_hoa ?? "",
      r.mo_ta ?? "",
      r.van_de_ton_tai ?? "",
      r.he_thong ?? "",
      r.de_xuat_quy_trinh ?? "",
      r.hieu_qua_khi_thuc_hien ?? "",
      formatDate(r.thoi_gian_mong_muon),
      frQuarterOf(r.thoi_gian_mong_muon),
      r.ke_hoach_software ?? "",
      r.ket_qua_mong_muon ?? "",
      r.do_uu_tien,
      r.department_name ?? "",
      r.nguoi_de_xuat ?? "",
      r.ghi_chu_xu_ly ?? "",
      frStatusLabelForExport(r, viewerDepartmentId),
    ];

    values.forEach((val, colIdx) => {
      const cell = sheet.getCell(rowIndex, colIdx + 1);
      cell.value = val;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = THIN_BORDER;
    });

    rowIndex += 1;
  });

  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: FR_TOTAL_COLUMNS },
  };
  sheet.views = [{ state: "frozen", ySplit: headerRow }];

  return workbook.xlsx.writeBuffer();
}
