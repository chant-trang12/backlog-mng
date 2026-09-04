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
export function replaceAttendanceRecords(
  periodId: number,
  rows: Record<string, string>[],
): AttendanceRecord[] {
  const deleteExisting = db.prepare(`DELETE FROM attendance_records WHERE period_id = ?`);
  const insert = db.prepare(
    `INSERT INTO attendance_records (period_id, row_index, row_data) VALUES (?, ?, ?) RETURNING *`,
  );

  const tx = db.transaction((rowsToInsert: Record<string, string>[]) => {
    deleteExisting.run(periodId);
    const inserted: AttendanceRecord[] = [];
    rowsToInsert.forEach((rowData, index) => {
      const raw = insert.get(periodId, index, JSON.stringify(rowData)) as {
        id: number;
        period_id: number;
        row_index: number;
        row_data: string;
        excluded_from_late: number;
        created_at: string;
      };
      inserted.push({ ...raw, row_data: JSON.parse(raw.row_data), excluded_from_late: false });
    });
    return inserted;
  });

  return tx(rows);
}

export function listAttendanceRecords(periodId: number): ImportAttendanceResult {
  const raws = db
    .prepare(`SELECT * FROM attendance_records WHERE period_id = ? ORDER BY row_index ASC`)
    .all(periodId) as {
    id: number;
    period_id: number;
    row_index: number;
    row_data: string;
    excluded_from_late: number;
    created_at: string;
  }[];

  const rows: AttendanceRecord[] = raws.map((raw) => ({
    ...raw,
    row_data: JSON.parse(raw.row_data),
    excluded_from_late: raw.excluded_from_late === 1,
  }));
  const headers = rows.length > 0 ? Object.keys(rows[0].row_data) : [];
  return { headers, rows };
}

// "Không tính công" — không xóa dữ liệu, chỉ đánh dấu để tab Nội quy bỏ qua
// khi tính Lượt đi muộn.
export function setAttendanceExcluded(ids: number[], excluded: boolean): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(`UPDATE attendance_records SET excluded_from_late = ? WHERE id IN (${placeholders})`)
    .run(excluded ? 1 : 0, ...ids);
  return result.changes;
}

export function deleteAttendanceRecord(id: number): boolean {
  const result = db.prepare(`DELETE FROM attendance_records WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function deleteAttendanceRecords(ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  const result = db.prepare(`DELETE FROM attendance_records WHERE id IN (${placeholders})`).run(...ids);
  return result.changes;
}
