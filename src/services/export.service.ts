import ExcelJS from "exceljs";
import type { Period, Task } from "../types/backlog.js";
import { getPeriod } from "./period.service.js";
import { listTasks } from "./task.service.js";
import { listRoadmapItems } from "./roadmap.service.js";

// 1.5 Xuất Excel theo mẫu "Backlog theo team" (xem ảnh mẫu đính kèm yêu cầu):
// hàng tiêu đề nền đỏ mận (maroon) chữ trắng, cột Trạng thái/% Hoàn thành tô
// màu theo giá trị.
const TOTAL_COLUMNS = 9; // A..I
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
  "STT", "Tính chất", "Team", "Nhiệm vụ", "DoD", "Deadline",
  "% Hoàn thành", "Trạng thái", "Tiến độ",
];

const COLUMN_WIDTHS = [6, 12, 10, 26, 30, 12, 12, 14, 40];

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
      task.tinh_chat ?? "",
      task.team,
      task.nhiem_vu,
      task.dod ?? "",
      formatDate(task.deadline),
      task.phan_tram_hoan_thanh / 100,
      task.trang_thai,
      task.tien_do ?? "",
    ];

    values.forEach((val, i) => {
      const cell = sheet.getCell(rowIndex, i + 1);
      cell.value = val;
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = THIN_BORDER;
      if (i === 6) cell.numFmt = "0%";
    });

    const statusCell = sheet.getCell(rowIndex, 8);
    const statusFill = STATUS_FILL[task.trang_thai];
    if (statusFill) fillCell(statusCell, statusFill);

    if (task.phan_tram_hoan_thanh >= 100) {
      fillCell(sheet.getCell(rowIndex, 7), "FFC6E0B4");
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
