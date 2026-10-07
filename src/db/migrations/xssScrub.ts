import { db } from "../connection.js";

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
