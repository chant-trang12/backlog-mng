import ExcelJS from "exceljs";
import { cellToText, normalizeHeader } from "./workbook.util.js";
import { createOvertimeBlocks, normalizeOvertime, normalizePerson, OvertimeError } from "./overtime.service.js";
import type { DataScope } from "./scope.util.js";
import type { UpsertOvertimeInput } from "../types/summaryPlan.js";

// Import Excel "Làm thêm giờ" — đọc THEO VỊ TRÍ cột (file có tiêu đề 2 hàng,
// "Số giờ"/"Số ngày" lặp ở ban ngày và ban đêm nên không thể ghép theo tên
// cột). Dòng tiêu đề được dò bằng ô "Stt" (trong 10 dòng đầu) — nên đọc được
// cả File mẫu (tiêu đề ở dòng 1-2) lẫn file Xuất Excel (có dòng tiêu đề báo
// cáo ở trên, tiêu đề ở dòng 3-4). Dữ liệu bắt đầu sau 2 hàng tiêu đề.
export interface ImportOvertimeResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importOvertimeFromWorkbook(
  buffer: Buffer,
  periodId: number,
  departmentId: number | null,
  scope: DataScope,
): Promise<ImportOvertimeResult> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new OvertimeError("File không đọc được dữ liệu — kiểm tra lại định dạng .xlsx.");

  let headerRow = 0;
  for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
    if (normalizeHeader(cellToText(sheet.getRow(r).getCell(1))) === "stt") {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new OvertimeError('Không tìm thấy cột "Stt" — tải file mẫu để đúng định dạng.');

  const result: ImportOvertimeResult = { imported: 0, skipped: [] };
  const blocks: { head: UpsertOvertimeInput; children: UpsertOvertimeInput[] }[] = [];
  let lastSignature = "";
  let skipChildren = false; // dòng đầu của khối bị bỏ -> bỏ luôn các nhân sự con của nó
  for (let r = headerRow + 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const t = (c: number) => cellToText(row.getCell(c)).trim();
    const cols = Array.from({ length: 14 }, (_, i) => t(i + 2));
    if (cols.every((v) => v === "")) continue;
    const input: UpsertOvertimeInput = {
      ngay_tac_dong: cols[0],
      noi_dung: cols[1],
      so_ke_hoach: cols[2],
      dia_diem: cols[3],
      ma_nhan_vien: cols[4],
      ho_va_ten: cols[5],
      don_vi: cols[6],
      bo_phan: cols[7],
      khoang_thoi_gian: cols[8],
      ban_ngay_so_gio: cols[9] as unknown as number,
      ban_ngay_so_ngay: cols[10] as unknown as number,
      ban_dem_so_gio: cols[11] as unknown as number,
      ban_dem_so_ngay: cols[12] as unknown as number,
      ghi_chu: cols[13],
    };
    // File không có cột "Tác động ban ngày/ban đêm": suy từ số liệu — chỉ có ban ngày
    // -> ban ngày, chỉ có ban đêm -> ban đêm, còn lại để trống (giữ cả hai).
    const hasDay = Boolean(cols[9] || cols[10]);
    const hasNight = Boolean(cols[11] || cols[12]);
    if (hasDay !== hasNight) input.ca_tac_dong = hasDay ? "Tác động ban ngày" : "Tác động ban đêm";
    // Dòng "nhân sự tham gia thêm": 4 cột dùng chung (Ngày/Nội dung/Số kế
    // hoạch/Địa điểm) để TRỐNG, hoặc là phần tiếp theo của ô gộp dọc ở các
    // dòng trên (exceljs trả lại giá trị của ô gốc nên phải xét ô gộp).
    // Hoặc (file Xuất Excel: giá trị dùng chung được ghi lặp ở từng dòng) toàn bộ phần dùng
    // chung giống HỆT dòng đầu của lượt ngay trước đó.
    const signature = JSON.stringify(cols.filter((_, i) => ![4, 5, 6].includes(i)));
    const continuation =
      (blocks.length > 0 || skipChildren) &&
      (signature === lastSignature ||
        [2, 3, 4, 5].every((c) => !t(c)) ||
        [2, 3, 4, 5].some((c) => {
          const cell = row.getCell(c);
          return cell.isMerged && Number(cell.master.row) < r;
        }));
    try {
      if (continuation) {
        if (skipChildren) continue;
        normalizePerson(input);
        blocks[blocks.length - 1].children.push(input);
      } else {
        normalizeOvertime(input);
        blocks.push({ head: input, children: [] });
        skipChildren = false;
        lastSignature = signature;
      }
    } catch (e) {
      result.skipped.push({ row: r, label: cols[5], reason: e instanceof Error ? e.message : "Dòng không hợp lệ" });
      if (!continuation) skipChildren = true;
    }
  }
  if (blocks.length > 0) result.imported = await createOvertimeBlocks(periodId, departmentId, blocks, scope);
  return result;
}
