import ExcelJS from "exceljs";
import { listDepartments } from "./department.service.js";
import { createCbnvXepLoaiRecords } from "./summaryPlan.service.js";
import { normalizeHeader, parseFirstSheet, pickColumn } from "./workbook.util.js";
import type { DataScope } from "./scope.util.js";
import type { UpsertCbnvXepLoaiInput } from "../types/summaryPlan.js";

// Import Excel "KQ xếp loại CBNV" (trang Kế hoạch tổng hợp) — 14 cột, theo
// ĐÚNG biểu mẫu HR user gửi (ảnh chụp màn hình), rút gọn phần nhóm cột
// "Kết quả hoàn thành nhiệm vụ/công việc tháng X/YYYY" xuống còn tên cột
// (không lặp lại "tháng X/YYYY" trong header — tháng đã có sẵn ở bộ lọc
// "Tháng theo dõi" của trang, khớp các bảng khác trong app).
export const CBNV_XEP_LOAI_IMPORT_HEADERS = [
  "STT",
  "Mã nhân viên",
  "Họ và Tên",
  "Chức danh",
  "Đơn vị",
  "Phòng ban",
  "Tổ nhóm",
  "Điểm đánh giá",
  "Xếp loại kết quả thực hiện mục tiêu nhiệm vụ/công việc",
  "Tuân thủ địa điểm làm việc",
  "Tuân thủ Nội quy lao động",
  "Xếp loại",
  "Xếp loại mức độ hoàn thành nhiệm vụ/công việc",
  "Chú ý",
] as const;

export const XEP_LOAI_OPTIONS = ["A+", "A", "B", "C", "D", "E"];
export const TUAN_THU_OPTIONS = ["Tuân thủ", "Không tuân thủ"];

const KEYS = {
  ma_nhan_vien: ["ma nhan vien"],
  ho_va_ten: ["ho va ten", "ho ten"],
  chuc_danh: ["chuc danh"],
  don_vi: ["don vi"],
  phong_ban: ["phong ban"],
  to_nhom: ["to nhom"],
  diem_danh_gia: ["diem danh gia"],
  xep_loai_ket_qua: [
    "xep loai ket qua thuc hien muc tieu nhiem vu/cong viec",
    "xep loai ket qua thuc hien muc tieu nhiem vu cong viec",
    "xep loai ket qua thuc hien muc tieu",
  ],
  tuan_thu_dia_diem: ["tuan thu dia diem lam viec"],
  tuan_thu_noi_quy: ["tuan thu noi quy lao dong"],
  xep_loai: ["xep loai"],
  xep_loai_muc_do: [
    "xep loai muc do hoan thanh nhiem vu/cong viec",
    "xep loai muc do hoan thanh nhiem vu cong viec",
    "xep loai muc do hoan thanh",
  ],
  chu_y: ["chu y"],
};

export function buildCbnvXepLoaiImportTemplate(opts?: { departments?: string[] }): Promise<ExcelJS.Buffer> {
  const departments = opts?.departments ?? [];
  return buildCbnvTemplateWorkbook(departments);
}

// Bố cục file mẫu KHỚP bảng dữ liệu trên trang (user yêu cầu kèm ảnh chụp):
// 2 hàng tiêu đề — hàng 1: nhãn cột trái/phải (gộp dọc 2 hàng) + ô nhóm
// "Kết quả hoàn thành nhiệm vụ/công việc" gộp ngang 6 cột con; hàng 2: tên
// 6 cột con. Màu khớp web: xanh ngọc #179188 (trái/nhóm/phải), 4 cột con
// đầu #2ec48f, 2 cột "Xếp loại" cuối #21a844; chữ trắng đậm, có AutoFilter
// ở hàng tiêu đề thật (hàng 2). Vài dòng ví dụ + dropdown (Phòng ban/
// Tuân thủ/Xếp loại) như template cũ. Import đọc lại được nhờ bộ nhận diện
// tiêu đề 2 hàng trong parseFirstSheet (workbook.util.ts).
async function buildCbnvTemplateWorkbook(departments: string[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const LEFT_HEADERS = CBNV_XEP_LOAI_IMPORT_HEADERS.slice(0, 7);
  const MID_HEADERS = CBNV_XEP_LOAI_IMPORT_HEADERS.slice(7, 13);
  const RIGHT_HEADERS = ["Ghi chú, đề xuất của người quản lý trực tiếp với CBNV", "Chú ý"];
  const TOTAL_COLUMNS = LEFT_HEADERS.length + MID_HEADERS.length + RIGHT_HEADERS.length;

  const TEAL = "FF179188";
  const GREEN_LIGHT = "FF2EC48F";
  const GREEN_DARK = "FF21A844";
  const fillCell = (cell: ExcelJS.Cell, argb: string) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  };
  const styleHeaderCell = (cell: ExcelJS.Cell, argb: string) => {
    cell.value = "";
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    fillCell(cell, argb);
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  };

  const sheet = workbook.addWorksheet("KQ xếp loại CBNV");
  sheet.columns = [6, 14, 22, 20, 16, 22, 16, 14, 26, 18, 18, 10, 22, 30, 24].map((width) => ({ width }));

  const groupRow = 1;
  const headerRow = 2;
  let col = 1;
  // Cột trái: gộp dọc 2 hàng, nền xanh ngọc.
  LEFT_HEADERS.forEach((label) => {
    sheet.mergeCells(groupRow, col, headerRow, col);
    const cell = sheet.getCell(groupRow, col);
    cell.value = label;
    styleHeaderCell(cell, TEAL);
    col++;
  });
  // Ô nhóm giữa (hàng 1, gộp ngang 6 cột) + 6 tên cột con (hàng 2).
  const midStart = col;
  sheet.mergeCells(groupRow, midStart, groupRow, midStart + MID_HEADERS.length - 1);
  const midGroupCell = sheet.getCell(groupRow, midStart);
  midGroupCell.value = "Kết quả hoàn thành nhiệm vụ/công việc";
  styleHeaderCell(midGroupCell, TEAL);
  MID_HEADERS.forEach((label, i) => {
    const cell = sheet.getCell(headerRow, col);
    cell.value = label;
    styleHeaderCell(cell, i < 4 ? GREEN_LIGHT : GREEN_DARK);
    col++;
  });
  RIGHT_HEADERS.forEach((label) => {
    sheet.mergeCells(groupRow, col, headerRow, col);
    const cell = sheet.getCell(groupRow, col);
    cell.value = label;
    styleHeaderCell(cell, TEAL);
    col++;
  });
  // Ô gộp dọc cần set giá trị ở master (hàng 1) — ô hàng 2 kế thừa nền viền
  // qua merge nhưng exceljs vẫn cần style riêng cho vùng slave của MERGE
  // NGANG; với merge DỌC exceljs tự áp style master. Bù lại độ cao 2 hàng.
  sheet.getRow(groupRow).height = 22;
  sheet.getRow(headerRow).height = 36;

  // Dòng ví dụ (dòng 3) — 15 cột, cột 14 "Ghi chú, đề xuất..." để trống.
  const sampleRow = [
    1,
    "115141",
    "Vũ Anh Dũng",
    "Trưởng phòng",
    "",
    departments[0] ?? "Phòng Công nghệ thông tin",
    "BSS",
    3.4,
    "Đạt yêu cầu",
    "Tuân thủ",
    "Tuân thủ",
    "B",
    "Hoàn thành",
    "",
    "",
  ];
  const sampleCells = sheet.getRow(headerRow + 1);
  sampleRow.forEach((val, i) => {
    sampleCells.getCell(i + 1).value = val;
    sampleCells.getCell(i + 1).alignment = { wrapText: true, vertical: "top" };
  });

  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: TOTAL_COLUMNS } };
  sheet.views = [{ state: "frozen", ySplit: headerRow }];

  // Dropdown: Phòng ban (cột 6), Tuân thủ (10, 11), Xếp loại (12) — ghi danh
  // mục vào sheet ẩn rồi tham chiếu, áp cho 500 dòng dữ liệu kế tiếp.
  const dropdowns: { column: number; options: string[] }[] = [
    { column: 6, options: departments },
    { column: 10, options: [...TUAN_THU_OPTIONS] },
    { column: 11, options: [...TUAN_THU_OPTIONS] },
    { column: 12, options: [...XEP_LOAI_OPTIONS] },
  ];
  const lookup = workbook.addWorksheet("Danh mục", { state: "hidden" });
  const VALID_ROWS = 500;
  dropdowns.forEach((d, idx) => {
    if (d.options.length === 0) return;
    const colLetter = String.fromCharCode(65 + idx);
    d.options.forEach((opt, r) => {
      lookup.getCell(`${colLetter}${r + 1}`).value = opt;
    });
    const ref = `'Danh mục'!$${colLetter}$1:$${colLetter}$${d.options.length}`;
    for (let r = headerRow + 1; r <= headerRow + VALID_ROWS; r++) {
      sheet.getCell(r, d.column).dataValidation = {
        type: "list",
        allowBlank: true,
        showErrorMessage: false,
        formulae: [ref],
      };
    }
  });

  return workbook.xlsx.writeBuffer();
}

export interface ImportCbnvXepLoaiResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importCbnvXepLoaiFromWorkbook(
  buffer: Buffer,
  periodId: number,
  fallbackDepartmentId: number | null,
  scope: DataScope,
): Promise<ImportCbnvXepLoaiResult> {
  const { headers, rows } = await parseFirstSheet(buffer);
  const result: ImportCbnvXepLoaiResult = { imported: 0, skipped: [] };
  if (headers.length === 0) {
    throw new Error("File không đọc được dữ liệu — kiểm tra lại định dạng .xlsx.");
  }
  const col = (k: keyof typeof KEYS) => pickColumn(headers, KEYS[k]);
  if (!col("ho_va_ten")) {
    throw new Error('Không tìm thấy cột "Họ và Tên" trong file — tải file mẫu để đúng định dạng.');
  }

  const departments = await listDepartments();
  const deptByKey = new Map(departments.map((d) => [normalizeHeader(d.name), d.id]));

  const byDepartment = new Map<number, UpsertCbnvXepLoaiInput[]>();
  const val = (row: Record<string, string>, header?: string) => (header ? (row[header] ?? "").trim() : "");

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;
    const hoVaTen = val(row, col("ho_va_ten"));
    if (!hoVaTen) {
      result.skipped.push({ row: rowNo, label: "", reason: 'Trống "Họ và Tên" — bỏ qua dòng này' });
      return;
    }

    const phongBan = val(row, col("phong_ban"));
    let departmentId = fallbackDepartmentId;
    if (phongBan) {
      const matched = deptByKey.get(normalizeHeader(phongBan));
      if (!matched) {
        result.skipped.push({ row: rowNo, label: hoVaTen, reason: `Không tìm thấy "Phòng ban: ${phongBan}" trong danh mục phòng ban` });
        return;
      }
      departmentId = matched;
    }
    if (departmentId == null) {
      result.skipped.push({ row: rowNo, label: hoVaTen, reason: 'Thiếu cột "Phòng ban" và chưa chọn phòng đang xem để mặc định theo' });
      return;
    }
    if (!scope.all && scope.departmentId !== departmentId) {
      result.skipped.push({ row: rowNo, label: hoVaTen, reason: "Phòng ban trong dòng này nằm ngoài phạm vi của bạn" });
      return;
    }

    const diemRaw = val(row, col("diem_danh_gia")).replace(",", ".");
    const diem = diemRaw === "" ? null : Number(diemRaw);

    const entry: UpsertCbnvXepLoaiInput = {
      ma_nhan_vien: val(row, col("ma_nhan_vien")) || null,
      ho_va_ten: hoVaTen,
      chuc_danh: val(row, col("chuc_danh")) || null,
      don_vi: val(row, col("don_vi")) || null,
      to_nhom: val(row, col("to_nhom")) || null,
      diem_danh_gia: diem != null && Number.isFinite(diem) ? diem : null,
      xep_loai_ket_qua: val(row, col("xep_loai_ket_qua")) || null,
      tuan_thu_dia_diem: val(row, col("tuan_thu_dia_diem")) || null,
      tuan_thu_noi_quy: val(row, col("tuan_thu_noi_quy")) || null,
      xep_loai: val(row, col("xep_loai")) || null,
      xep_loai_muc_do: val(row, col("xep_loai_muc_do")) || null,
      chu_y: val(row, col("chu_y")) || null,
    };
    if (!byDepartment.has(departmentId)) byDepartment.set(departmentId, []);
    byDepartment.get(departmentId)!.push(entry);
  });

  for (const [departmentId, entries] of byDepartment) {
    const count = await createCbnvXepLoaiRecords(periodId, departmentId, entries, scope);
    result.imported += count;
  }

  return result;
}
