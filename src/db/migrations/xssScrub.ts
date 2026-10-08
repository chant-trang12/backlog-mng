import { db, isMssql } from "../connection.js";

// ATTT (Stored XSS): làm sạch dữ liệu CŨ trong DB — các payload dạng
// <iframe srcdoc=...> tạo thẻ HTML đã lưu trước khi có middleware strip ở
// request ghi vẫn còn nguy hiểm khi FE render bằng innerHTML. Quét TOÀN BỘ
// bảng + cột kiểu văn bản (varchar/text/clob, lấy động từ PRAGMA table_info
// để bảng tạo sau này cũng được phủ) và loại bỏ ký tự "<" và ">".
//
// Idempotent: sau lần chạy đầu không còn ký tự "<"/">" nào nên các lần boot
// sau WHERE không khớp dòng nào — vô hại, không cần bảng đánh dấu đã chạy.
// Chỉ đụng cột văn bản — bỏ qua số/ngày/blob (VD: feature_requests
// .attachment_data là BLOB nhị phân, tuyệt đối không được sửa).
export async function scrubLegacyHtmlChars(): Promise<void> {
  if (isMssql) return scrubMssql();

  const tablesResult = (await db.raw(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )) as unknown as { name: string }[];

  for (const { name } of tablesResult) {
    const infoResult = (await db.raw(`PRAGMA table_info("${name}")`)) as unknown as {
      name: string;
      type: string;
    }[];
    const textColumns = infoResult
      .filter((c) => /char|text|clob/i.test(c.type))
      .map((c) => c.name);

    for (const col of textColumns) {
      await db.raw(
        `UPDATE ?? SET ?? = replace(replace(??, '<', ''), '>', '')
         WHERE instr(??, '<') > 0 OR instr(??, '>') > 0`,
        [name, col, col, col, col],
      );
    }
  }
}

// Bản SQL Server: lấy cột văn bản từ INFORMATION_SCHEMA (không có sqlite_master/PRAGMA).
// REPLACE/CHARINDEX không nhận text/ntext nên ép sang NVARCHAR(MAX) riêng cho 2 kiểu đó
// (kiểu varchar/nvarchar giữ nguyên để không mất ký tự khi chuyển mã).
async function scrubMssql(): Promise<void> {
  const result = (await db.raw(
    `SELECT c.TABLE_NAME AS tbl, c.COLUMN_NAME AS col, c.DATA_TYPE AS type
       FROM INFORMATION_SCHEMA.COLUMNS c
       JOIN INFORMATION_SCHEMA.TABLES t
         ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
        AND c.TABLE_SCHEMA = SCHEMA_NAME()
        AND c.DATA_TYPE IN ('char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext')`,
  )) as unknown as { tbl: string; col: string; type: string }[];

  for (const { tbl, col, type } of result) {
    const src = /text$/i.test(type) ? "CAST(?? AS NVARCHAR(MAX))" : "??";
    await db.raw(
      `UPDATE ?? SET ?? = REPLACE(REPLACE(${src}, '<', ''), '>', '')
       WHERE CHARINDEX('<', ${src}) > 0 OR CHARINDEX('>', ${src}) > 0`,
      [tbl, col, col, col, col],
    );
  }
}
