import ExcelJS from "exceljs";

// Chuyển giá trị 1 ô Excel về chuỗi phẳng — xử lý Date, kết quả công thức và
// rich text (exceljs trả về object { result, text, richText, ... }).
export function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }
  if (typeof value === "object") {
    const withResult = value as { result?: unknown; text?: unknown };
    if (withResult.result !== undefined) return String(withResult.result);
    if (withResult.text !== undefined) return String(withResult.text);
    return "";
  }
  return String(value);
}

// Đọc worksheet đầu tiên: dòng 1 là tiêu đề cột, các dòng sau là dữ liệu.
// Trả về mảng bản ghi keyed theo tiêu đề cột (đã trim). Dòng trống bị bỏ qua.
export async function parseFirstSheet(
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
