import fs from "node:fs";
import path from "node:path";

// Lưu tệp tải lên trên Ổ ĐĨA (DB chỉ giữ thông tin mô tả + đường dẫn tương đối).
// Thư mục gốc: UPLOAD_DIR (mặc định ./data/uploads). Thư mục con và tên tệp lấy theo tên người dùng nhìn thấy
// (tên hệ thống / tên tính năng / tên tệp gốc) nhưng luôn qua safeSegment() + resolveStored() -> không thể thoát khỏi thư mục gốc.
export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || "./data/uploads");

// Đường dẫn tuyệt đối của 1 tệp đã lưu; chặn mọi đường dẫn thoát ra ngoài thư mục gốc.
export function resolveStored(rel: string): string {
  const root = uploadRoot();
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("Đường dẫn tệp không hợp lệ");
  return abs;
}

export async function removeFile(rel: string | null | undefined): Promise<void> {
  if (!rel) return;
  const abs = resolveStored(rel);
  try {
    await fs.promises.unlink(abs);
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
  // Dọn thư mục chứa nếu đã trống (không bao giờ xoá thư mục gốc).
  const dir = path.dirname(abs);
  if (dir !== uploadRoot()) await fs.promises.rmdir(dir).catch(() => {});
}

export async function fileSize(rel: string): Promise<number | null> {
  try {
    return (await fs.promises.stat(resolveStored(rel))).size;
  } catch {
    return null;
  }
}

// Ký tự cấm trong tên tệp/thư mục (Windows + đường dẫn + ký tự HTML/điều khiển). Tên tệp người dùng gửi chứa các ký tự này -> từ chối.
export const UNSAFE_NAME_RE = /[<>:"/\\|?*\u0000-\u001f\u007f`]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

// Làm sạch 1 đoạn đường dẫn (tên thư mục/tệp): bỏ ký tự cấm, gộp khoảng trắng, bỏ dấu chấm/khoảng trắng ở cuối (Windows),
// tránh tên dành riêng (CON, PRN…), giới hạn độ dài; chuẩn hoá Unicode NFC (macOS/Windows hiển thị cùng một tên).
export function safeSegment(name: string, max = 100): string {
  let s = String(name ?? "").normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f`]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
  if (s.length > max) s = s.slice(0, max).trim();
  if (!s) s = "_";
  if (RESERVED.test(s)) s = `_${s}`;
  return s;
}

// Ghi tệp với ĐÚNG tên người dùng tải lên vào <root>/<folders...>/<tên tệp>; trùng tên thì thêm " (1)", " (2)"… (không ghi đè).
export async function saveNamedFile(folders: string[], filename: string, data: Buffer): Promise<string> {
  const dir = folders.map((f) => safeSegment(f)).join("/");
  const clean = safeSegment(filename, 180);
  const ext = path.extname(clean);
  const stem = ext ? clean.slice(0, -ext.length) : clean;
  await fs.promises.mkdir(resolveStored(dir), { recursive: true });
  for (let i = 0; i < 1000; i++) {
    const rel = `${dir}/${i ? `${stem} (${i})${ext}` : clean}`;
    try {
      await fs.promises.writeFile(resolveStored(rel), data, { flag: "wx" }); // wx: lỗi nếu đã tồn tại -> thử tên kế tiếp
      return rel;
    } catch (e: any) {
      if (e?.code !== "EEXIST") throw e;
    }
  }
  throw new Error("Không tìm được tên tệp trống");
}

// Di chuyển tệp đã lưu sang đường dẫn mới (cùng thư mục gốc), trả đường dẫn tương đối mới.
export async function moveStored(fromRel: string, folders: string[], filename: string): Promise<string> {
  const data = await fs.promises.readFile(resolveStored(fromRel));
  const rel = await saveNamedFile(folders, filename, data);
  await removeFile(fromRel);
  return rel;
}
