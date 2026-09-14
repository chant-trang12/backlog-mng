import ExcelJS from "exceljs";

const HEADER_FILL = "FF632423"; // đỏ mận đậm — đồng bộ với export Backlog
const HEADER_FONT = "FFFFFFFF";

// Bỏ dấu tiếng Việt + hạ chữ thường + gộp khoảng trắng, để so khớp tên cột
// linh hoạt (người dùng gõ "Nhiem vu", "NHIỆM VỤ", "nhiem_vu"...).
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tìm tên cột thực trong file khớp với 1 trong các key (đã hoặc chưa chuẩn hoá).
export function pickColumn(headers: string[], keys: string[]): string | undefined {
  const norm = keys.map(normalizeHeader);
  return headers.find((h) => norm.includes(normalizeHeader(h)));
}

// Dựng file .xlsx mẫu: dòng 1 tiêu đề (nền đỏ mận, chữ trắng, đóng băng),
// kèm vài dòng ví dụ. `dropdowns` (tuỳ chọn): mỗi phần tử gắn 1 danh sách
// chọn (data validation) cho 1 cột — danh sách được ghi vào sheet ẩn
// "Danh mục" rồi tham chiếu theo range.
export async function buildTemplateWorkbook(
  sheetName: string,
  columns: { header: string; width: number }[],
  sampleRows: (string | number)[][],
  dropdowns: { column: number; options: string[] }[] = [],
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;

  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
  sheet.getRow(1).height = 24;
  sampleRows.forEach((r) => sheet.addRow(r));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const active = dropdowns.filter((d) => d.options.length > 0);
  if (active.length > 0) {
    const lookup = workbook.addWorksheet("Danh mục", { state: "hidden" });
    const VALID_ROWS = 500;
    active.forEach((d, idx) => {
      const colLetter = String.fromCharCode(65 + idx); // A, B, C...
      d.options.forEach((opt, r) => {
        lookup.getCell(`${colLetter}${r + 1}`).value = opt;
      });
      const ref = `'Danh mục'!$${colLetter}$1:$${colLetter}$${d.options.length}`;
      for (let r = 2; r <= VALID_ROWS + 1; r++) {
        sheet.getCell(r, d.column).dataValidation = {
          type: "list",
          allowBlank: true,
          showErrorMessage: false,
          formulae: [ref],
        };
      }
    });
  }

  return workbook.xlsx.writeBuffer();
}

// Chuyển 1 ô ngày (nhiều định dạng) về "YYYY-MM-DD"; rỗng nếu không parse được.
export function parseDateToIso(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

// Chuyển giá trị 1 ô Excel về chuỗi phẳng — xử lý Date, kết quả công thức,
// rich text (exceljs trả về object { result, text, richText, ... }) và Số
// định dạng Phần trăm: Excel lưu 100% dưới dạng số 1 (không phải 100) —
// nếu không quy đổi theo numFmt, "100%" trong file sẽ đọc thành 1.
export function cellToText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }
  if (typeof value === "number") {
    const fmt = cell.numFmt || "";
    if (fmt.includes("%")) {
      return String(Math.round(value * 10000) / 100);
    }
    return String(value);
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
    const text = cellToText(cell).trim();
    if (text) headers.push(text);
  });

  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0) continue;
    const isEmpty = headers.every((_, i) => cellToText(row.getCell(i + 1)).trim() === "");
    if (isEmpty) continue;

    // Excel gộp ô theo chiều dọc (VD: cột Team/Nhiệm vụ gộp 3 dòng cho 1
    // việc, nhưng cột "Điều kiện đảm bảo" liệt kê riêng từng dòng) khiến mỗi
    // dòng vật lý đọc ra tưởng là 1 bản ghi riêng — 1 việc thực tế bị tách
    // thành nhiều dòng import. Nhận diện: nếu cột có dữ liệu ĐẦU TIÊN của
    // dòng này là phần tiếp nối của ô gộp bắt đầu từ dòng trước (cell.master
    // ở dòng nhỏ hơn r), coi đây là dòng nối tiếp của bản ghi trước — các cột
    // KHÔNG gộp (có giá trị riêng ở dòng này) được nối thêm (xuống dòng) vào
    // giá trị đã có, thay vì tạo bản ghi mới. File không dùng merge thì hành
    // vi giữ nguyên như cũ (isMerged luôn false).
    let firstNonEmptyCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (cellToText(row.getCell(i + 1)).trim() !== "") {
        firstNonEmptyCol = i;
        break;
      }
    }
    const firstCell = firstNonEmptyCol >= 0 ? row.getCell(firstNonEmptyCol + 1) : null;
    // exceljs khai báo `Cell.row` là string (kiểu dùng chung với Address) dù
    // lúc chạy luôn trả về number — ép kiểu để so sánh đúng.
    const isContinuation =
      rows.length > 0 && !!firstCell?.isMerged && Number(firstCell.master.row) < r;

    if (isContinuation) {
      const target = rows[rows.length - 1];
      headers.forEach((header, i) => {
        const cell = row.getCell(i + 1);
        const isFreshHere = !(cell.isMerged && Number(cell.master.row) < r);
        if (!isFreshHere) return; // kế thừa từ ô gộp — đã có sẵn ở dòng gốc
        const val = cellToText(cell).trim();
        if (!val || target[header] === val) return;
        target[header] = target[header] ? `${target[header]}\n${val}` : val;
      });
      continue;
    }

    const rowData: Record<string, string> = {};
    headers.forEach((header, i) => {
      rowData[header] = cellToText(row.getCell(i + 1));
    });
    rows.push(rowData);
  }

  return { headers, rows };
}
