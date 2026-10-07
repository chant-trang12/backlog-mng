// ---- Kiểm tra file đính kèm (Whitelist + Magic bytes) ----
// Fix lỗ hổng ATTT "Upload tệp tin bất kỳ" ở file đính kèm Yêu cầu tính năng
// (POST /api/feature-requests/:id/attachment): trước đây server nhận MỌI file
// với mọi Content-Type client gửi lên (.php/.html/.svg/.exe...), lưu nguyên
// và trả lại đúng Content-Type đó khi tải xuống — kẻ tấn công có thể phát
// tán mã độc / thực thi XSS qua link file.
//
// Nguyên tắc khắc phục (theo báo cáo ATTT):
// 1. WHITELIST phần mở rộng (tuyệt đối không blacklist) — chỉ cho các định
//    dạng tài liệu/ảnh thực sự cần: spec, mockup, ảnh chụp màn hình.
// 2. Xác minh NỘI DUNG THỰ của file ở backend (File Signature / Magic
//    Bytes) — không tin extension lẫn header Content-Type client gửi lên;
//    nội dung phải khớp phần mở rộng (đổi tên virus.exe thành .png cũng bị
//    chặn). MIME lưu DB luôn do SERVER tự suy ra, không phải client.

// Các loại file được phép — tài liệu + ảnh. Không có .html/.svg/.js/.exe/
// .zip... (không dùng blacklist).
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp",
  "pdf", "txt", "csv",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
] as const;

// MIME chuẩn tương ứng — CHỈ dùng để lưu/trả khi magic bytes khớp, không
// bao giờ lấy từ header client.
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

// File văn bản thuần (txt/csv) không có signature — kiểm tra "phải là text":
// không chứa byte NUL và không chứa ký tự điều khiển nhị phân (ngoài \t \n
// \r). Đủ để chặn .exe/.php/.zip đổi tên thành .txt mà không loại chặn file
// text encoding_legacy (Windows-1258...) vẫn hợp lệ.
function looksLikeText(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) return false;
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) return false;
  }
  return true;
}

interface Signature {
  exts: string[];
  /** MIME dùng khi tải file về (nhóm không phân biệt được loại sẽ dùng MIME chung, an toàn). */
  mime: string;
  test: (b: Buffer) => boolean;
}

// Magic bytes của từng nhóm định dạng được phép. docx/xlsx/pptx là ZIP-based
// OOXML (PK\x03\x04) — không phân biệt được từng loại bằng 4 byte đầu nên
// chung 1 nhóm (tải về dùng octet-stream — an toàn); .zip/.jar "trùng
// signature" đã bị loại khỏi whitelist nên không lọt.
const SIGNATURES: Signature[] = [
  { exts: ["jpg", "jpeg"], mime: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { exts: ["png"], mime: "image/png", test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a },
  { exts: ["gif"], mime: "image/gif", test: (b) => b.length >= 6 && b.toString("latin1", 0, 4) === "GIF8" },
  { exts: ["webp"], mime: "image/webp", test: (b) => b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" },
  { exts: ["pdf"], mime: "application/pdf", test: (b) => b.length >= 5 && b.toString("latin1", 0, 5) === "%PDF-" },
  { exts: ["doc", "xls", "ppt"], mime: "application/msword", test: (b) => b.length >= 8 && b.toString("hex", 0, 8) === "d0cf11e0a1b11ae1" },
  { exts: ["docx", "xlsx", "pptx"], mime: "application/octet-stream", test: (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) },
];

// Suy MIME từ NỘI DUNG file (magic bytes) — dùng khi tải file về để không
// bao giờ trả lại Content-Type do client chỉ (dòng cũ trong DB cũng được
// "vá" tại thời điểm response). Không nhận diện được -> octet-stream (browsers
// sẽ tải về chứ không render, kết hợp Content-Disposition: attachment).
export function detectAttachmentMime(buffer: Buffer): string {
  const sig = SIGNATURES.find((s) => s.test(buffer));
  if (sig) return sig.mime;
  if (looksLikeText(buffer)) return "text/plain";
  return "application/octet-stream";
}

export interface AttachmentValidationResult {
  ok: boolean;
  /** MIME do server tự suy ra từ magic bytes — dùng để lưu DB. */
  mime: string;
  /** Lý do từ chối (tiếng Việt, hiện thẳng cho người dùng). */
  error?: string;
}

// Kiểm tra 1 file đính kèm sắp lưu: extension trong whitelist + nội dung
// khớp phần mở rộng. Trả về { ok: true, mime } hoặc { ok: false, error }.
export function validateAttachmentFile(filename: string, buffer: Buffer): AttachmentValidationResult {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, mime: "application/octet-stream", error: "Thiếu nội dung file" };
  }
  const ext = extensionOf(filename);
  if (!ext || !(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      mime: "application/octet-stream",
      error:
        `Định dạng ".${ext || "không rõ"}" không được phép đính kèm. Chỉ chấp nhận: ` +
        ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(", "),
    };
  }

  if (ext === "txt" || ext === "csv") {
    if (!looksLikeText(buffer)) {
      return { ok: false, mime: "application/octet-stream", error: `Nội dung file không phải văn bản — không khớp phần mở rộng .${ext}` };
    }
    return { ok: true, mime: MIME_BY_EXTENSION[ext] };
  }

  const sig = SIGNATURES.find((s) => s.test(buffer));
  if (!sig || !sig.exts.includes(ext)) {
    return {
      ok: false,
      mime: "application/octet-stream",
      error: `Nội dung file không khớp với phần mở rộng .${ext} — vui lòng tải lên đúng loại file`,
    };
  }
  return { ok: true, mime: MIME_BY_EXTENSION[ext] ?? "application/octet-stream" };
}
