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

  // File mẫu mới không có cột "Mã nhân viên" (mã lấy từ bảng User); file Xuất Excel/mẫu cũ vẫn có -> dò theo tiêu đề.
  let hasMa = false;
  for (let r = headerRow; r <= headerRow + 1; r++) {
    for (let c = 1; c <= 4; c++) if (normalizeHeader(cellToText(sheet.getRow(r).getCell(c))).replace(/\s+/g, "") === "manhanvien") hasMa = true;
  }
  const result: ImportSummaryResult = { imported: 0, skipped: [] };
  const valid: SummaryInput[] = [];
  for (let r = headerRow + 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    // Bố cục có Mã NV (cột 2): cột c giữ nguyên; không có: từ cột 2 trở đi dịch trái 1 cột -> quy về bố cục có Mã NV.
    const raw = (c: number) => cellToText(row.getCell(c)).trim();
    const t = (c: number) => (hasMa || c < 2 ? raw(c) : c === 2 ? "" : raw(c - 1));
    // Hết bảng dữ liệu: dòng "Lưu ý…" hoặc bảng "Tổng hợp đơn vị" (file xuất ra) -> dừng, không đọc tiếp.
    if (normalizeHeader(t(1)).startsWith("luu y") || normalizeHeader(t(3)).startsWith("tong hop don vi")) break;
    if (Array.from({ length: 16 }, (_, i) => t(i + 2)).every((v) => v === "")) continue;
    // Dòng "Tổng cộng" (file xuất ra) không phải dữ liệu — bỏ qua im lặng.
    if (normalizeHeader(t(3)) === "tong cong") continue;
    const input: SummaryInput = {
      ma_nhan_vien: "", // Mã NV không nhập qua file — lấy từ bảng User khi hiển thị
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
