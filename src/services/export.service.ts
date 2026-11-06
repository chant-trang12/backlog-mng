import ExcelJS from "exceljs";
import type { Period, Task } from "../types/backlog.js";
import { EVAL_OVER_LIMIT } from "./overtimeSummary.service.js";
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
  "Đơn vị thực hiện số hoá", "Nhân sự đầu mối", "Ghi chú", "Trạng thái",
];
const FR_TOTAL_COLUMNS = FR_HEADERS.length;
const FR_COLUMN_WIDTHS = [
  6, 30, 16, 14, 14, 22, 16, 14, 16, 30, 24, 20, 24, 22, 16, 14, 20, 26, 12, 20, 20, 16, 20, 16,
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
      r.target_department_name ?? "",
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

// ---- Xuất Excel "KQ xếp loại CBNV" (Kế hoạch tổng hợp) ----
// Giữ ĐÚNG bố cục nhóm cột của mẫu HR user gửi: 1 header gộp "Kết quả hoàn
// thành nhiệm vụ/công việc tháng X/YYYY" trùm lên 6 cột con, kiểu màu dùng
// lại HEADER_FILL/TITLE_FILL/THIN_BORDER đã có sẵn ở trên (nhất quán màu
// đỏ mận toàn app, không bịa bảng màu riêng).
const CBNV_HEADERS_LEFT = ["TT", "Mã nhân viên", "Họ và Tên", "Chức danh", "Đơn vị", "Phòng ban", "Tổ nhóm"];
const CBNV_HEADERS_MID = [
  "Điểm đánh giá",
  "Xếp loại kết quả thực hiện mục tiêu nhiệm vụ/công việc",
  "Tuân thủ địa điểm làm việc",
  "Tuân thủ Nội quy lao động",
  "Xếp loại",
  "Xếp loại mức độ hoàn thành nhiệm vụ/công việc",
];
// Hai cột phải ĐỨNG RIÊNG từng cột (merge dọc hàng 3-4 như các cột trái),
// KHÔNG gộp thành nhóm nữa — trước đây "Ghi chú, đề xuất..." là ô nhóm
// nằm TRÊN ô "Chú ý" trong CÙNG 1 cột nên 2 nội dung bị chồng nhau trong
// file xuất ra (user phản hồi kèm ảnh chụp: đúng ra là 2 cột cạnh nhau).
const CBNV_HEADERS_RIGHT = ["Ghi chú, đề xuất của người quản lý trực tiếp với CBNV", "Chú ý"];
const CBNV_TOTAL_COLUMNS = CBNV_HEADERS_LEFT.length + CBNV_HEADERS_MID.length + CBNV_HEADERS_RIGHT.length;
// Màu tiêu đề khớp bảng web (#cbnv-table trong style.css).
const CBNV_TEAL = "FF179188";
const CBNV_GREEN_LIGHT = "FF2EC48F";
const CBNV_GREEN_DARK = "FF21A844";
const CBNV_COLUMN_WIDTHS = [6, 14, 22, 20, 16, 22, 16, 14, 26, 18, 18, 10, 22, 30, 24];

export async function exportCbnvXepLoaiToExcel(
  rows: import("../types/summaryPlan.js").CbnvXepLoaiRecordWithDept[],
  periodLabel: string,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("KQ xếp loại CBNV");
  sheet.columns = CBNV_COLUMN_WIDTHS.map((width) => ({ width }));

  sheet.mergeCells(1, 1, 1, CBNV_TOTAL_COLUMNS);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `KQ xếp loại CBNV — ${periodLabel}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  fillCell(titleCell, TITLE_FILL);
  sheet.getRow(1).height = 24;

  // Hàng 3: nhóm cột gộp (merge ngang) — hàng 4: tên từng cột con.
  const groupRow = 3;
  const headerRow = 4;
  let col = 1;
  CBNV_HEADERS_LEFT.forEach((label) => {
    sheet.mergeCells(groupRow, col, headerRow, col);
    const cell = sheet.getCell(groupRow, col);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, CBNV_TEAL);
    cell.border = THIN_BORDER;
    col++;
  });
  const midStart = col;
  sheet.mergeCells(groupRow, midStart, groupRow, midStart + CBNV_HEADERS_MID.length - 1);
  const midGroupCell = sheet.getCell(groupRow, midStart);
  midGroupCell.value = `Kết quả hoàn thành nhiệm vụ/công việc ${periodLabel}`;
  midGroupCell.font = { bold: true, color: { argb: HEADER_FONT } };
  midGroupCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  fillCell(midGroupCell, CBNV_TEAL);
  midGroupCell.border = THIN_BORDER;
  CBNV_HEADERS_MID.forEach((label, i) => {
    const cell = sheet.getCell(headerRow, col);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, i < 4 ? CBNV_GREEN_LIGHT : CBNV_GREEN_DARK);
    cell.border = THIN_BORDER;
    col++;
  });
  CBNV_HEADERS_RIGHT.forEach((label) => {
    sheet.mergeCells(groupRow, col, headerRow, col);
    const cell = sheet.getCell(groupRow, col);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, CBNV_TEAL);
    cell.border = THIN_BORDER;
    col++;
  });
  sheet.getRow(groupRow).height = 22;
  sheet.getRow(headerRow).height = 36;

  let rowIndex = headerRow + 1;
  rows.forEach((r, i) => {
    const values = [
      i + 1,
      r.ma_nhan_vien ?? "",
      r.ho_va_ten,
      r.chuc_danh ?? "",
      r.don_vi ?? "",
      r.department_name ?? "",
      r.to_nhom ?? "",
      // Tick "Nghỉ thai sản": 5 cột điểm/xếp loại ghi "Nghỉ thai sản"; tick "Không KI": cột Điểm ghi "Không KI", cột Xếp loại kết quả ghi "Đạt yêu cầu".
      r.nghi_thai_san ? "Nghỉ thai sản" : r.khong_ki ? "Không KI" : r.diem_danh_gia ?? "",
      r.nghi_thai_san ? "Nghỉ thai sản" : r.khong_ki ? "Đạt yêu cầu" : r.xep_loai_ket_qua ?? "",
      r.nghi_thai_san ? "Nghỉ thai sản" : r.tuan_thu_dia_diem ?? "",
      r.nghi_thai_san ? "Nghỉ thai sản" : r.tuan_thu_noi_quy ?? "",
      r.xep_loai ?? "",
      r.nghi_thai_san ? "Nghỉ thai sản" : r.xep_loai_muc_do ?? "",
      r.ghi_chu_de_xuat ?? "",
      r.chu_y ?? "",
    ];
    values.forEach((val, colIdx) => {
      const cell = sheet.getCell(rowIndex, colIdx + 1);
      cell.value = val;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = THIN_BORDER;
    });
    rowIndex += 1;
  });

  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: CBNV_TOTAL_COLUMNS } };
  sheet.views = [{ state: "frozen", ySplit: headerRow }];

  return workbook.xlsx.writeBuffer();
}

// ---- Xuất Excel tab "GNV" — bố cục như bảng mẫu: 2 hàng tiêu đề (nhóm cột
// "Các mức chỉ tiêu"/"Đánh giá kết quả..." gộp ngang, còn lại gộp dọc), mỗi
// NHÓM lớn là 1 hàng cam (số La Mã + tên nhóm + tổng tỷ trọng) rồi tới các
// dòng nhiệm vụ của nhóm.
const GNV_TEAL = "FF179188";
const GNV_ORANGE = "FFFFC000";
const GNV_WIDTHS = [6, 36, 22, 40, 14, 10, 12, 12, 12, 14, 14, 36, 12, 12];

function toRoman(n: number): string {
  const map: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
function gnvLevel(unit: string | null, v: string | null): string {
  if (!v) return "";
  if (unit === "Thời gian") return gnvDate(v);
  if (unit === "Tỷ lệ %") return `${v}%`;
  return v;
}
function gnvDate(v: string | null): string {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : v;
}

export async function exportGnvToExcel(
  groups: import("../types/summaryPlan.js").GnvGroupWithItems[],
  periodLabel: string,
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("GNV");
  sheet.columns = GNV_WIDTHS.map((width) => ({ width }));
  const total = GNV_WIDTHS.length;

  sheet.mergeCells(1, 1, 1, total);
  const title = sheet.getCell(1, 1);
  title.value = `GNV — ${periodLabel}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  fillCell(title, TITLE_FILL);
  sheet.getRow(1).height = 24;

  const g = 3;
  const h = 4;
  const head = (r: number, c: number, label: string) => {
    const cell = sheet.getCell(r, c);
    cell.value = label;
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, GNV_TEAL);
    cell.border = THIN_BORDER;
  };
  const tall = (c: number, label: string) => {
    sheet.mergeCells(g, c, h, c);
    head(g, c, label);
  };
  tall(1, "STT");
  tall(2, "Mục tiêu nhiệm vụ/công việc");
  tall(3, "Chỉ số đo lường KPI");
  tall(4, "Phương pháp đo");
  tall(5, "Đơn vị đo");
  tall(6, "Tỷ trọng (%)");
  sheet.mergeCells(g, 7, g, 9);
  head(g, 7, "Các mức chỉ tiêu");
  ["Tối thiểu (T - Threshold)", "Mong đợi (B- Base)", "Thách thức (S- Stretch)"].forEach((l, i) => head(h, 7 + i, l));
  tall(10, "Ngày bắt đầu");
  tall(11, "Ngày hoàn thành");
  sheet.mergeCells(g, 12, g, 14);
  head(g, 12, "Đánh giá kết quả thực hiện mục tiêu nhiệm vụ/công việc");
  ["Kết quả thực hiện chỉ tiêu", "CBNV tự đánh giá (Điểm 1-5)", "QLTT đánh giá (Điểm 1-5)"].forEach((l, i) => head(h, 12 + i, l));
  sheet.getRow(g).height = 22;
  sheet.getRow(h).height = 40;

  let r = h + 1;
  groups.forEach((grp, gi) => {
    const sum = grp.items.reduce((s, it) => s + (it.parent_item_id == null ? it.ty_trong ?? 0 : 0), 0);
    const groupVals: (string | number)[] = [toRoman(gi + 1), grp.ten_nhom, "", "", "", grp.items.some((i) => i.ty_trong != null) ? `${Math.round(sum * 100) / 100}%` : ""];
    for (let c = 1; c <= total; c++) {
      const cell = sheet.getCell(r, c);
      cell.value = groupVals[c - 1] ?? "";
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center", wrapText: true };
      fillCell(cell, GNV_ORANGE);
      cell.border = THIN_BORDER;
    }
    r++;
    // Mục tiêu (dòng cha) + các phương pháp đo con: Mục tiêu/Chỉ số KPI/Đơn
    // vị đo/Tỷ trọng gộp dọc theo số dòng của khối, giống bảng mẫu.
    const heads = grp.items.filter((x) => x.parent_item_id == null);
    heads.forEach((head, hi) => {
      const block = [head, ...grp.items.filter((x) => x.parent_item_id === head.id)];
      const startRow = r;
      block.forEach((it, bi) => {
        const isHead = bi === 0;
        const vals = [
          isHead ? hi + 1 : "", isHead ? head.muc_tieu ?? "" : "", isHead ? head.chi_so_kpi ?? "" : "",
          it.phuong_phap_do ?? "", isHead ? head.don_vi_do ?? "" : "",
          isHead && head.ty_trong != null ? `${head.ty_trong}%` : "",
          gnvLevel(head.don_vi_do, it.muc_toi_thieu), gnvLevel(head.don_vi_do, it.muc_mong_doi), gnvLevel(head.don_vi_do, it.muc_thach_thuc),
          gnvDate(it.ngay_bat_dau), gnvDate(it.ngay_hoan_thanh), it.ket_qua_thuc_hien ?? "",
          it.cbnv_tu_danh_gia ?? "", it.qltt_danh_gia ?? "",
        ];
        vals.forEach((v, ci) => {
          const cell = sheet.getCell(r, ci + 1);
          cell.value = v;
          const left = ci === 1 || ci === 2 || ci === 3 || ci === 11;
          cell.alignment = { wrapText: true, vertical: "middle", horizontal: left ? "left" : "center" };
          cell.border = THIN_BORDER;
        });
        r++;
      });
      if (block.length > 1) {
        [1, 2, 3, 5, 6].forEach((c) => sheet.mergeCells(startRow, c, r - 1, c));
      }
    });
  });

  // Dòng tổng Tỷ trọng cuối bảng (chỉ cộng dòng mục tiêu): dòng nền xanh nhạt
  // "N%" rồi dòng "Σ = N%".
  if (groups.length > 0) {
    const totalWeight =
      Math.round(
        groups.flatMap((x) => x.items).filter((i) => i.parent_item_id == null).reduce((s, i) => s + (i.ty_trong ?? 0), 0) * 100,
      ) / 100;
    // Tổng điểm = Σ (Tỷ trọng/100 × Điểm) trên các mục tiêu (nhiều phương pháp đo -> trung bình điểm đã nhập).
    const weighted = (field: "cbnv_tu_danh_gia" | "qltt_danh_gia"): number | null => {
      let sum = 0;
      let any = false;
      for (const grp of groups) {
        for (const hd of grp.items.filter((x) => x.parent_item_id == null)) {
          const scores = [hd, ...grp.items.filter((x) => x.parent_item_id === hd.id)].map((x) => x[field]).filter((v): v is number => v != null);
          if (!scores.length || hd.ty_trong == null) continue;
          any = true;
          sum += (hd.ty_trong / 100) * (scores.reduce((t, v) => t + Number(v), 0) / scores.length);
        }
      }
      return any ? Math.round(sum * 100) / 100 : null;
    };
    const cbnvScore = weighted("cbnv_tu_danh_gia");
    const qlttScore = weighted("qltt_danh_gia");
    const grade =
      qlttScore == null || qlttScore > 5 ? "" : qlttScore >= 4.5 ? "Vượt xa yêu cầu" : qlttScore >= 3.5 ? "Vượt yêu cầu" : qlttScore >= 2.5 ? "Đạt yêu cầu" : qlttScore >= 2 ? "Gần đạt yêu cầu" : "Không đạt yêu cầu";
    const rowsDef: { vals: Record<number, string | number>; fill: boolean }[] = [
      { vals: { 6: `${totalWeight}%`, 13: cbnvScore ?? "", 14: qlttScore ?? "" }, fill: true },
      { vals: { 6: `Σ = ${totalWeight}%`, 12: "Tổng điểm", 13: "(Σ Tỷ trọng * Điểm)", 14: qlttScore ?? "" }, fill: false },
      { vals: { 12: "Xếp loại kết quả thực hiện mục tiêu nhiệm vụ/công việc", 14: grade }, fill: false },
    ];
    rowsDef.forEach((def, k) => {
      for (let c = 1; c <= total; c++) {
        const cell = sheet.getCell(r, c);
        cell.value = def.vals[c] ?? "";
        cell.font = { bold: true, color: c === 6 && totalWeight > 100 ? { argb: "FFC00000" } : undefined };
        cell.alignment = { horizontal: c === 12 ? "left" : "center", vertical: "middle", wrapText: true };
        if (typeof cell.value === "number") cell.numFmt = "0.0#";
        if (def.fill || k === 1) fillCell(cell, "FFDBEEF3");
        cell.border = THIN_BORDER;
      }
      if (k === 1) {
        const q = sheet.getCell(r, 14);
        fillCell(q, "FFC00000");
        q.font = { bold: true, color: { argb: "FFFFFFFF" } };
      }
      if (k === 2 && grade) {
        const g = sheet.getCell(r, 14);
        fillCell(g, "FFC00000");
        g.font = { bold: true, color: { argb: "FFFFFFFF" } };
      }
      if (k === 2) {
        fillCell(sheet.getCell(r, 12), "FFDBEEF3");
        fillCell(sheet.getCell(r, 13), "FFDBEEF3");
      }
      r++;
    });
  }

  sheet.views = [{ state: "frozen", ySplit: h }];
  return workbook.xlsx.writeBuffer();
}

// ---- Tab "Làm thêm giờ": bố cục 2 hàng tiêu đề như bảng mẫu (nhóm "Người thực
// hiện", "Làm thêm vào ban ngày/ban đêm" gộp ngang, còn lại gộp dọc), tiêu
// đề nền xanh lá nhạt chữ đậm. Dùng chung cho File mẫu (không có dòng tiêu đề
// báo cáo) và Xuất Excel (có dòng 1 tiêu đề báo cáo).
const OT_HEADER_FILL = "FFE2EFDA";
const OT_WIDTHS = [6, 16, 40, 16, 22, 14, 22, 18, 18, 22, 10, 10, 10, 10, 26];

export function buildOvertimeWorkbook(
  rows: import("../types/summaryPlan.js").OvertimeRecord[],
  opts: { title?: string; sample?: boolean } = {},
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Làm thêm giờ");
  // File mẫu KHÔNG có cột Mã Nhân viên (mã lấy tự động từ bảng User); Xuất Excel vẫn có.
  const sk = opts.sample ? 1 : 0;
  const widths = sk ? OT_WIDTHS.filter((_, i) => i !== 5) : OT_WIDTHS;
  sheet.columns = widths.map((width) => ({ width }));
  const total = widths.length;

  let top = 1;
  if (opts.title) {
    sheet.mergeCells(1, 1, 1, total);
    const t = sheet.getCell(1, 1);
    t.value = opts.title;
    t.font = { bold: true, size: 14 };
    t.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 24;
    top = 3;
  }
  const g = top;
  const h = top + 1;
  const head = (r: number, c: number, label: string) => {
    const cell = sheet.getCell(r, c);
    cell.value = label;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, OT_HEADER_FILL);
    cell.border = THIN_BORDER;
  };
  const tall = (c: number, label: string) => {
    sheet.mergeCells(g, c, h, c);
    head(g, c, label);
  };
  tall(1, "Stt");
  tall(2, "Ngày tác động/làm thêm giờ");
  tall(3, "Nội dung tác động");
  tall(4, "Số kế hoạch tác động");
  tall(5, "Địa điểm tác động");
  if (sk) {
    tall(6, "Họ và Tên");
  } else {
    sheet.mergeCells(g, 6, g, 7);
    head(g, 6, "Người thực hiện");
    head(h, 6, "Mã Nhân viên");
    head(h, 7, "Họ và Tên");
  }
  tall(8 - sk, "Đơn vị");
  tall(9 - sk, "Bộ phận");
  tall(10 - sk, "Khoảng thời gian tác động");
  sheet.mergeCells(g, 11 - sk, g, 12 - sk);
  head(g, 11 - sk, "Làm thêm vào ban ngày");
  head(h, 11 - sk, "Số giờ");
  head(h, 12 - sk, "Số ngày");
  sheet.mergeCells(g, 13 - sk, g, 14 - sk);
  head(g, 13 - sk, "Làm thêm vào ban đêm");
  head(h, 13 - sk, "Số giờ");
  head(h, 14 - sk, "Số ngày");
  tall(15 - sk, "Ghi chú");
  sheet.getRow(g).height = 22;
  sheet.getRow(h).height = 30;

  const dateText = (v: string | null) => {
    if (!v) return "";
    const [y, m, d] = v.slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y}` : v;
  };
  const styleCell = (r: number, ci: number, v: string | number) => {
    const cell = sheet.getCell(r, ci + 1);
    cell.value = v;
    const left = ci === 2 || ci === 4 || ci === 14 - sk;
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: left ? "left" : "center" };
    cell.border = THIN_BORDER;
  };
  // Giá trị dùng chung cả lượt tác động (Ngày, Nội dung, Số kế hoạch, Địa điểm, Bộ phận, Khoảng
  // thời gian, ban ngày/đêm, Ghi chú) ghi lặp ở TỪNG dòng nhân sự — không gộp ô. Stt chạy theo dòng.
  let rowNo = h + 1;
  if (opts.sample) {
    const shared = ["01/11/2026", "Nâng cấp hệ thống X", "KH-001", "TT DL Hòa Lạc"];
    const tail = ["BSS", "22:00 - 02:00", 0, 0, 4, 0.5, "Ví dụ — xoá các dòng ví dụ khi nhập thật"];
    [
      { stt: 1, person: ["Vũ Anh Dũng", "Phòng Công nghệ thông tin"] },
      { stt: 2, person: ["Nguyễn Văn A", "Phòng Công nghệ thông tin"] },
    ].forEach((row) => {
      [row.stt, ...shared, ...row.person, ...tail].forEach((v, ci) => styleCell(rowNo, ci, v));
      rowNo++;
    });
  } else {
    let stt = 0;
    const sums = [0, 0, 0, 0];
    rows
      .filter((r) => r.parent_id == null)
      .forEach((head) => {
        [head, ...rows.filter((r) => r.parent_id === head.id)].forEach((p) => {
          stt++;
          sums[0] += head.ban_ngay_so_gio ?? 0;
          sums[1] += head.ban_ngay_so_ngay ?? 0;
          sums[2] += head.ban_dem_so_gio ?? 0;
          sums[3] += head.ban_dem_so_ngay ?? 0;
          [
            stt, dateText(head.ngay_tac_dong), head.noi_dung ?? "", head.so_ke_hoach ?? "", head.dia_diem ?? "",
            p.ma_nhan_vien ?? "", p.ho_va_ten, p.don_vi ?? "",
            head.bo_phan ?? "", head.khoang_thoi_gian ?? "", head.ban_ngay_so_gio ?? "", head.ban_ngay_so_ngay ?? "",
            head.ban_dem_so_gio ?? "", head.ban_dem_so_ngay ?? "", head.ghi_chu ?? "",
          ].forEach((v, ci) => styleCell(rowNo, ci, v));
          rowNo++;
        });
      });
    // Dòng "Tổng:" cuối bảng: cộng Số giờ/Số ngày ban ngày + ban đêm của mọi dòng nhân sự.
    for (let c = 0; c < 15; c++) styleCell(rowNo, c, "");
    styleCell(rowNo, 9, "Tổng:");
    sums.forEach((v, k) => styleCell(rowNo, 10 + k, Math.round(v * 100) / 100));
    for (let c = 1; c <= 15; c++) {
      const cell = sheet.getCell(rowNo, c);
      cell.font = { bold: true };
      fillCell(cell, "FFF1F7EA");
    }
    rowNo++;
  }
  // Cột Số ngày (12, 14): hiển thị "0,0" / "0,5" (1-2 chữ số lẻ; dấu thập phân theo ngôn ngữ của Excel).
  for (let r = h + 1; r < rowNo; r++) {
    for (const c of [12 - sk, 14 - sk]) {
      const cell = sheet.getCell(r, c);
      if (typeof cell.value === "number") cell.numFmt = "0.0#";
    }
  }

  // Địa điểm tác động (cột 5): chọn từ danh sách, áp cho 500 dòng kế tiếp.
  const locList = `"${["TT DL Hòa Lạc", "TT DL Pháp Vân", "TT DL Hoàng Hoa Thám", "TT DL Bình Dương"].join(",")}"`;
  for (let r = h + 1; r <= h + 500; r++) {
    sheet.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, showErrorMessage: false, formulae: [locList] };
  }

  sheet.views = [{ state: "frozen", ySplit: h }];
  return workbook.xlsx.writeBuffer();
}


// ---- Xuất Excel / File mẫu "Tổng hợp làm thêm giờ": 17 cột, tiêu đề 2 hàng (nhóm "Làm thêm vào ban ngày/ban đêm" gộp ngang,
// còn lại gộp dọc), nền xanh lá nhạt như bảng mẫu. File mẫu: tiêu đề ở hàng 1-2 + 1 dòng ví dụ; Xuất: có dòng tiêu đề báo cáo.
const OTS_WIDTHS = [6, 14, 24, 24, 18, 11, 11, 11, 11, 16, 20, 22, 20, 20, 20, 24, 24];

export function buildOvertimeSummaryWorkbook(
  rows: import("./overtimeSummary.service.js").SummaryRow[],
  opts: { title?: string; month?: number; sample?: boolean; unit?: import("./overtimeSummary.service.js").UnitSummary | null } = {},
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Tổng hợp làm thêm giờ");
  const otsWidths = opts.sample ? OTS_WIDTHS.filter((_, i) => i !== 1) : OTS_WIDTHS;
  sheet.columns = otsWidths.map((width) => ({ width }));
  const total = otsWidths.length;
  let top = 1;
  if (opts.title) {
    sheet.mergeCells(1, 1, 1, total);
    const t = sheet.getCell(1, 1);
    t.value = opts.title;
    t.font = { bold: true, size: 14 };
    t.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 24;
    top = 3;
  }
  const g = top;
  const h = top + 1;
  const head = (r: number, c: number, label: string) => {
    const cell = sheet.getCell(r, c);
    cell.value = label;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, OT_HEADER_FILL);
    cell.border = THIN_BORDER;
  };
  const tall = (c: number, label: string) => {
    sheet.mergeCells(g, c, h, c);
    head(g, c, label);
  };
  // File mẫu KHÔNG có cột Mã nhân viên (mã lấy tự động từ bảng User); Xuất Excel vẫn có.
  const sk = opts.sample ? 1 : 0;
  const month = opts.month ? `tháng ${opts.month}` : "tháng";
  tall(1, "Stt");
  if (!sk) tall(2, "Mã nhân viên");
  tall(3 - sk, "Họ và Tên");
  tall(4 - sk, "Đơn vị");
  tall(5 - sk, "Bộ phận");
  sheet.mergeCells(g, 6 - sk, g, 7 - sk);
  head(g, 6 - sk, "Làm thêm vào ban ngày\n(Không gồm ngày nghỉ cuối tuần)");
  head(h, 6 - sk, "Số giờ");
  head(h, 7 - sk, "Số ngày");
  sheet.mergeCells(g, 8 - sk, g, 9 - sk);
  head(g, 8 - sk, "Làm thêm vào ban đêm (22h00-6h00) hoặc Ngày nghỉ cuối tuần");
  head(h, 8 - sk, "Số giờ");
  head(h, 9 - sk, "Số ngày");
  tall(10 - sk, `Tổng số giờ làm thêm trong ${month}`);
  tall(11 - sk, "Số giờ làm thêm vượt so với quy định của luật (tối đa 40h/tháng)");
  tall(12 - sk, "Đánh giá\n(So với quy định của luật lao động tối đa không quá 40 giờ/tháng)");
  tall(13 - sk, "Tổng số giờ làm thêm các tháng trước trong năm");
  tall(14 - sk, "Tổng số giờ làm thêm lũy kế đến tháng hiện tại");
  tall(15 - sk, "Tỷ lệ thực hiện trong năm so với quy định của luật (200 h/năm)");
  tall(16 - sk, "Đánh giá\n(So với quy định của luật lao động, tối đa không quá 200 giờ/năm)");
  tall(17 - sk, "Ghi chú");
  sheet.getRow(g).height = 40;
  sheet.getRow(h).height = 70;

  const pct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
  const body: (string | number)[][] = opts.sample
    ? [[1, "Vũ Anh Dũng", "Phòng Công nghệ thông tin", "BU CĐS", 0, 0, 4, 0.5, 4, 0, "Trong giới hạn số giờ theo quy định của luật lao động", 12, 16, "8%", "Trong giới hạn số giờ theo quy định của luật lao động", "Ví dụ — các cột tính toán (tổng, vượt, đánh giá, lũy kế, tỷ lệ) hệ thống tự tính khi nhập"]]
    : rows.map((r, i) => [
        i + 1, r.ma_nhan_vien ?? "", r.ho_va_ten, r.don_vi ?? "", r.bo_phan ?? "",
        r.ban_ngay_so_gio ?? "", r.ban_ngay_so_ngay ?? "", r.ban_dem_so_gio ?? "", r.ban_dem_so_ngay ?? "",
        r.tong_thang, r.vuot_quy_dinh, r.danh_gia_thang, r.tong_cac_thang_truoc, r.luy_ke, pct(r.ty_le), r.danh_gia_nam, r.ghi_chu ?? "",
      ]);
  // Dòng "Tổng cộng" tô vàng NGAY DƯỚI tiêu đề (xuất Excel): cộng các cột số của mọi nhân sự.
  let dataStart = h + 1;
  if (!opts.sample && rows.length) {
    const sum = (f: (r: import("./overtimeSummary.service.js").SummaryRow) => number | null) => Math.round(rows.reduce((s, r) => s + (f(r) ?? 0), 0) * 100) / 100;
    const totals: Record<number, number> = {
      6: sum((r) => r.ban_ngay_so_gio), 7: sum((r) => r.ban_ngay_so_ngay), 8: sum((r) => r.ban_dem_so_gio), 9: sum((r) => r.ban_dem_so_ngay),
      10: sum((r) => r.tong_thang), 11: sum((r) => r.vuot_quy_dinh), 13: sum((r) => r.tong_cac_thang_truoc), 14: sum((r) => r.luy_ke),
    };
    for (let c = 1; c <= total; c++) {
      const cell = sheet.getCell(dataStart, c);
      cell.value = c === 3 ? "Tổng cộng" : totals[c] ?? "";
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: c === 3 ? "left" : "center" };
      cell.border = THIN_BORDER;
      if (typeof cell.value === "number") cell.numFmt = "0.0#";
      fillCell(cell, "FFFFFF00");
    }
    dataStart += 1;
  }
  body.forEach((vals, i) => {
    vals.forEach((v, ci) => {
      const cell = sheet.getCell(dataStart + i, ci + 1);
      cell.value = v;
      const left = [2, 3, 4, 16].includes(ci + sk);
      cell.alignment = { wrapText: true, vertical: "middle", horizontal: left ? "left" : "center" };
      cell.border = THIN_BORDER;
    });
    // Đánh giá tháng (cột 12) / năm (cột 16) = "Quá số giờ theo quy định của luật lao động" -> tô hồng ô đó.
    if (!opts.sample && vals[11] === EVAL_OVER_LIMIT) fillCell(sheet.getCell(dataStart + i, 12), "FFFBD9DC");
    if (!opts.sample && vals[15] === EVAL_OVER_LIMIT) fillCell(sheet.getCell(dataStart + i, 16), "FFFBD9DC");
  });
  // Lưu ý cuối bảng.
  if (!opts.sample) {
    const note = sheet.getCell(dataStart + body.length, 1);
    note.value = "Lưu ý: Mỗi nhân viên chỉ 1 dòng, gồm cả nhân sự trực NOC và các nhân sự khác";
    note.font = { italic: true };
  }
  // Bảng "Tổng hợp đơn vị" dưới bảng dữ liệu (sau 1 dòng trống): nhãn vàng + bảng 4 cột như mẫu.
  if (!opts.sample && opts.unit) {
    const u = opts.unit;
    let ur = dataStart + body.length + 2;
    const label = sheet.getCell(ur, 3);
    label.value = "Tổng hợp đơn vị:";
    label.font = { bold: true };
    fillCell(label, "FFFFFF00");
    ur += 2;
    const hdr = (c: number, text: string) => {
      const cell = sheet.getCell(ur, c);
      cell.value = text;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
    };
    hdr(3, "Đánh giá theo đơn vị");
    hdr(4, `Tổng số giờ làm thêm mục tiêu 6 tháng cuối năm ${u.year} của đơn vị`);
    hdr(5, `Tổng số giờ làm thêm lũy kế thực hiện đến tháng ${u.month}/${u.year}`);
    sheet.mergeCells(ur, 6, ur, 8);
    hdr(6, `Tổng số giờ làm thêm còn được thực hiện đến tháng 12/${u.year}`);
    sheet.getRow(ur).height = 95;
    ur += 1;
    const val = (c: number, v: string | number, bold = false) => {
      const cell = sheet.getCell(ur, c);
      cell.value = v;
      cell.font = { bold };
      cell.alignment = { horizontal: c === 3 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = THIN_BORDER;
      if (typeof v === "number") cell.numFmt = "0.0#";
    };
    val(3, u.department_name ?? "");
    val(4, u.target_hours ?? "");
    val(5, u.luy_ke);
    sheet.mergeCells(ur, 6, ur, 8);
    val(6, u.con_lai ?? "", true);
    sheet.getRow(ur).height = 36;
  }
  // Cột Số ngày (7, 9): "0,0" / "0,5"; (số thập phân theo ngôn ngữ Excel).
  for (let r = dataStart; r < dataStart + body.length; r++) {
    for (const c of [7, 9]) {
      const cell = sheet.getCell(r, c);
      if (typeof cell.value === "number") cell.numFmt = "0.0#";
    }
  }
  sheet.views = [{ state: "frozen", ySplit: h }];
  return workbook.xlsx.writeBuffer();
}
