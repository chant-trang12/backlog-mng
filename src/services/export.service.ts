import ExcelJS from "exceljs";
import type { Period, Task } from "../types/backlog.js";
import { getPeriod } from "./period.service.js";
import { listTasks } from "./task.service.js";

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
}): Promise<ExcelJS.Buffer> {
  const period = getPeriod(filter.period_id);
  if (!period) throw new Error("Không tìm thấy tháng backlog");

  const tasks = listTasks(filter);

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
