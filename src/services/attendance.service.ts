import ExcelJS from "exceljs";
import { db } from "../db/database.js";
import type { AttendanceRecord, ImportAttendanceResult } from "../types/cskh.js";
import { softDeleteWhere, softDeleteWhereIn } from "./softDelete.util.js";
import { stripHtmlChars } from "../utils/sanitize.util.js";
import { assertDepartmentInScope, isDepartmentInScope, type DataScope } from "./scope.util.js";

function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }
  if (typeof value === "object") {
    // Formula result / rich text — exceljs trả về { result, text, richText, ... }.
    const withResult = value as { result?: unknown; text?: unknown };
    // ATTT (Stored XSS): nội dung ô Excel do người dùng upload — strip ký tự
    // tạo thẻ HTML trước khi lưu xuống DB (đồng bộ cellToText ở workbook.util).
    if (withResult.result !== undefined) return stripHtmlChars(String(withResult.result));
    if (withResult.text !== undefined) return stripHtmlChars(String(withResult.text));
    return "";
  }
  return stripHtmlChars(String(value));
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
//
// ATTT (IDOR): chỉ thay dữ liệu của ĐÚNG phòng ban đích (departmentId) — không
// còn xóa dữ liệu Chấm công của phòng khác trong cùng tháng. departmentId=null
// chỉ hợp lệ với scope không giới hạn (admin/phòng full-access) và giữ hành
// vi cũ: thay toàn bộ tháng.
export async function replaceAttendanceRecords(
  periodId: number,
  rows: Record<string, string>[],
  departmentId: number | null,
  scope: DataScope,
): Promise<AttendanceRecord[]> {
  assertDepartmentInScope(scope, departmentId);
  return await db.transaction(async (trx) => {
    await softDeleteWhere(
      trx,
      "attendance_records",
      departmentId != null ? { period_id: periodId, department_id: departmentId } : { period_id: periodId },
    );
    const inserted: AttendanceRecord[] = [];
    for (let index = 0; index < rows.length; index++) {
      const rowData = rows[index];
      const [raw] = (await trx("attendance_records")
        .insert({
          period_id: periodId,
          row_index: index,
          row_data: JSON.stringify(rowData),
          excluded_from_late: 0,
          department_id: departmentId,
        })
        .returning("*")) as any[];
      inserted.push({
        id: raw.id,
        period_id: raw.period_id,
        row_index: raw.row_index,
        row_data: JSON.parse(raw.row_data),
        excluded_from_late: false,
        department_id: raw.department_id ?? null,
        created_at: raw.created_at,
      });
    }
    return inserted;
  });
}

export async function listAttendanceRecords(
  periodId: number,
  departmentId?: number | null,
): Promise<ImportAttendanceResult> {
  const query = db("attendance_records").where({ period_id: periodId, is_deleted: false });
  if (departmentId != null) query.where({ department_id: departmentId });
  const raws = await query.orderBy("row_index", "asc");

  const rows: AttendanceRecord[] = raws.map((raw: any) => ({
    id: raw.id,
    period_id: raw.period_id,
    row_index: raw.row_index,
    row_data: JSON.parse(raw.row_data),
    excluded_from_late: raw.excluded_from_late === 1,
    department_id: raw.department_id ?? null,
    created_at: raw.created_at,
  }));
  const headers = rows.length > 0 ? Object.keys(rows[0].row_data) : [];
  return { headers, rows };
}

// Lọc danh sách id về đúng các dòng nằm trong phạm vi phòng ban của người gọi
// — id ngoài phạm vi (hoặc không tồn tại) bị bỏ qua, không lộ ra là có hay
// không (chống dò id của phòng khác).
async function idsInScope(ids: number[], scope: DataScope): Promise<number[]> {
  if (ids.length === 0) return [];
  if (scope.all) return ids;
  const rows = await db("attendance_records").whereIn("id", ids).where({ is_deleted: false }).select("id", "department_id");
  return rows.filter((r: any) => isDepartmentInScope(scope, r.department_id ?? null)).map((r: any) => Number(r.id));
}

// "Không tính công" — không xóa dữ liệu, chỉ đánh dấu để tab Nội quy bỏ qua
// khi tính Lượt đi muộn.
export async function setAttendanceExcluded(ids: number[], excluded: boolean, scope: DataScope): Promise<number> {
  const allowed = await idsInScope(ids, scope);
  if (allowed.length === 0) return 0;
  return await db("attendance_records")
    .whereIn("id", allowed)
    .update({ excluded_from_late: excluded ? 1 : 0 });
}

export async function deleteAttendanceRecord(id: number, scope: DataScope): Promise<boolean> {
  const allowed = await idsInScope([id], scope);
  if (allowed.length === 0) return false;
  const count = await softDeleteWhere(db, "attendance_records", { id });
  return count > 0;
}

export async function deleteAttendanceRecords(ids: number[], scope: DataScope): Promise<number> {
  const allowed = await idsInScope(ids, scope);
  if (allowed.length === 0) return 0;
  return await softDeleteWhereIn(db, "attendance_records", "id", allowed);
}
