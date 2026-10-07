// ATTT (Stored XSS): toàn bộ trang FE render dữ liệu bằng innerHTML, nên bất
// kỳ ký tự tạo thẻ HTML ("<", ">") nào nằm trong dữ liệu người dùng đều có
// thể thực thi mã khi hiển thị (payload điển hình: <iframe srcdoc=...>).
// Quyết định vá: KHÔNG cho phép ký tự "<" và ">" trong dữ liệu văn bản do
// người dùng gửi lên — nội dung thường của app không cần 2 ký tự này:
//  - Mọi request GHI trên /api (POST/PUT/PATCH/DELETE) đi qua
//    sanitizeWriteInput (middleware/sanitize.middleware.ts).
//  - Mọi ô import Excel đi qua cellToText (services/workbook.util.ts).
//  - Dữ liệu CŨ trong DB được làm sạch 1 lần khi khởi động qua
//    scrubLegacyHtmlChars (db/migrations/xssScrub.ts) — strip là phép toán
//    idempotent nên chạy lại mỗi lần boot đều vô hại.
// Lớp phòng thủ thứ 2: CSP script-src 'self' (app.ts) chặn mọi script inline
// kể cả khi còn sót nội dung đáng ngờ.

// Loại bỏ ký tự tạo/biết thẻ HTML khỏi 1 chuỗi.
export function stripHtmlChars(value: string): string {
  return value.replace(/[<>]/g, "");
}

// Chỉ đụng container thuần (plain object / array) — Buffer (body import
// Excel), Date, instance lớp khác giữ nguyên vì không phải dữ liệu văn bản
// người dùng hoặc phải giữ nguyên binary.
export function isPlainContainer(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Duyệt đệ quy TẠI CHỖ (mutate) object/array, strip mọi giá trị chuỗi.
// Mutate tại chỗ thay vì gán lại req.body/req.query để không phụ thuộc cách
// Express 5 định nghĩa getter cho 2 thuộc tính này.
export function sanitizeDeepInPlace(value: unknown): void {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v: unknown = value[i];
      if (typeof v === "string") value[i] = stripHtmlChars(v);
      else if (isPlainContainer(v)) sanitizeDeepInPlace(v);
    }
    return;
  }
  if (isPlainContainer(value)) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const v = record[key];
      if (typeof v === "string") record[key] = stripHtmlChars(v);
      else if (isPlainContainer(v)) sanitizeDeepInPlace(v);
    }
  }
}
