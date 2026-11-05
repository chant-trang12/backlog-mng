import ExcelJS from "exceljs";
import { cellToText, normalizeHeader } from "./workbook.util.js";
import { createSummaryRecords, normalizeSummary, OvertimeSummaryError, type SummaryInput } from "./overtimeSummary.service.js";
import type { DataScope } from "./scope.util.js";

// Import Excel "Tổng hợp làm thêm giờ" — đọc THEO VỊ TRÍ cột (tiêu đề 2 hàng, "Số giờ"/"Số ngày" lặp ở ban ngày và ban đêm).
// Dòng tiêu đề được dò bằng ô "Stt" (10 dòng đầu), dữ liệu bắt đầu sau 2 hàng tiêu đề — nên đọc được cả File mẫu lẫn file Xuất Excel.
// Chỉ lấy các cột NHẬP: Mã NV(2), Họ tên(3), Đơn vị(4), Bộ phận(5), Số giờ ban ngày(6), Số giờ ban đêm(8), Tổng các tháng trước(13,
// nếu có số thì coi là nhập tay), Ghi chú(17); Số ngày và các cột tổng/vượt/đánh giá/lũy kế/tỷ lệ hệ thống tự tính.
export interface ImportSummaryResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importOvertimeSummaryFromWorkbook(buffer: Buffer, periodId: number, departmentId: number | null, scope: DataScope): Promise<ImportSummaryResult> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new OvertimeSummaryError("File không đọc được dữ liệu — kiểm tra lại định dạng .xlsx.");
  let headerRow = 0;
  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    if (normalizeHeader(cellToText(sheet.getRow(r).getCell(1))) === "stt") {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new OvertimeSummaryError('Không tìm thấy cột "Stt" — tải file mẫu để đúng định dạng.');

  const result: ImportSummaryResult = { imported: 0, skipped: [] };
  const valid: SummaryInput[] = [];
  for (let r = headerRow + 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const t = (c: number) => cellToText(row.getCell(c)).trim();
    if (Array.from({ length: 16 }, (_, i) => t(i + 2)).every((v) => v === "")) continue;
    const input: SummaryInput = {
      ma_nhan_vien: t(2),
      ho_va_ten: t(3),
      don_vi: t(4),
      bo_phan: t(5),
      ban_ngay_so_gio: t(6),
      ban_dem_so_gio: t(8),
      tong_cac_thang_truoc_nhap: t(13),
      ghi_chu: t(17),
    };
    try {
      normalizeSummary(input);
      valid.push(input);
    } catch (e) {
      result.skipped.push({ row: r, label: t(3), reason: e instanceof Error ? e.message : "Dòng không hợp lệ" });
    }
  }
  if (valid.length) result.imported = await createSummaryRecords(periodId, departmentId, valid, scope);
  return result;
}
