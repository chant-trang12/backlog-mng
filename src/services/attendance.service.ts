import ExcelJS from "exceljs";
import { db } from "../db/database.js";
import type { AttendanceRecord, ImportAttendanceResult } from "../types/cskh.js";

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }
  if (typeof value === "object") {
    // Formula result / rich text — exceljs trả về { result, text, richText, ... }.
    const withResult = value as { result?: unknown; text?: unknown };
    if (withResult.result !== undefined) return String(withResult.result);
    if (withResult.text !== undefined) return String(withResult.text);
    return "";
  }
  return String(value);
}

// Đọc worksheet đầu tiên của file Excel tải lên — dòng 1 là tiêu đề cột
// (headers), các dòng sau là dữ liệu. Cột động hoàn toàn theo file, không cố
// định trước.
export async function parseAttendanceWorkbook(
  buffer: Buffer,
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const workbook = new ExcelJS.Workbook();
  // exceljs khai báo tham số Buffer không khớp kiểu Buffer<ArrayBufferLike>
  // của @types/node hiện tại — tương thích lúc chạy, chỉ lệch kiểu tĩnh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const text = cellToText(cell.value).trim();
    if (text) headers.push(text);
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const isEmpty = headers.every((_, i) => cellToText(row.getCell(i + 1).value).trim() === "");
    if (isEmpty) continue;

    const rowData: Record<string, string> = {};
    headers.forEach((header, i) => {
      rowData[header] = cellToText(row.getCell(i + 1).value);
    });
    rows.push(rowData);
  }

  return { headers, rows };
}

// Import thay thế toàn bộ dữ liệu Chấm công của 1 tháng theo dõi (period_id)
// — xóa dữ liệu cũ của tháng đó rồi ghi lại theo file mới tải lên.
export async function replaceAttendanceRecords(
  periodId: number,
  rows: Record<string, string>[],
): Promise<AttendanceRecord[]> {
  return await db.transaction(async (trx) => {
    await trx("attendance_records").where({ period_id: periodId }).delete();
    const inserted: AttendanceRecord[] = [];
    for (let index = 0; index < rows.length; index++) {
      const rowData = rows[index];
      const [raw] = (await trx("attendance_records")
        .insert({
          period_id: periodId,
          row_index: index,
          row_data: JSON.stringify(rowData),
          excluded_from_late: 0,
        })
        .returning("*")) as any[];
      inserted.push({
        id: raw.id,
        period_id: raw.period_id,
        row_index: raw.row_index,
        row_data: JSON.parse(raw.row_data),
        excluded_from_late: false,
        created_at: raw.created_at,
      });
    }
    return inserted;
  });
}

export async function listAttendanceRecords(periodId: number): Promise<ImportAttendanceResult> {
  const raws = await db("attendance_records")
    .where({ period_id: periodId })
    .orderBy("row_index", "asc");

  const rows: AttendanceRecord[] = raws.map((raw: any) => ({
    id: raw.id,
    period_id: raw.period_id,
    row_index: raw.row_index,
    row_data: JSON.parse(raw.row_data),
    excluded_from_late: raw.excluded_from_late === 1,
    created_at: raw.created_at,
  }));
  const headers = rows.length > 0 ? Object.keys(rows[0].row_data) : [];
  return { headers, rows };
}

// "Không tính công" — không xóa dữ liệu, chỉ đánh dấu để tab Nội quy bỏ qua
// khi tính Lượt đi muộn.
export async function setAttendanceExcluded(ids: number[], excluded: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  return await db("attendance_records")
    .whereIn("id", ids)
    .update({ excluded_from_late: excluded ? 1 : 0 });
}

export async function deleteAttendanceRecord(id: number): Promise<boolean> {
  const count = await db("attendance_records").where({ id }).delete();
  return count > 0;
}

export async function deleteAttendanceRecords(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return await db("attendance_records").whereIn("id", ids).delete();
}
