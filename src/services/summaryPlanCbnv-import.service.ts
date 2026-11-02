import type ExcelJS from "exceljs";
import { listDepartments } from "./department.service.js";
import { createCbnvXepLoaiRecords } from "./summaryPlan.service.js";
import { buildTemplateWorkbook, normalizeHeader, parseFirstSheet, pickColumn } from "./workbook.util.js";
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
  return buildTemplateWorkbook(
    "KQ xếp loại CBNV",
    CBNV_XEP_LOAI_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : header === "Họ và Tên" ? 24 : Math.min(42, Math.max(14, header.length + 4)),
    })),
    [
      [
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
      ],
    ],
    [
      { column: 6, options: departments },
      { column: 10, options: [...TUAN_THU_OPTIONS] },
      { column: 11, options: [...TUAN_THU_OPTIONS] },
      { column: 12, options: [...XEP_LOAI_OPTIONS] },
    ],
  );
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
