import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Lưu tệp tải lên trên Ổ ĐĨA (DB chỉ giữ thông tin mô tả + đường dẫn tương đối).
// Thư mục gốc: UPLOAD_DIR (mặc định ./data/uploads). Tên tệp trên đĩa do server sinh (UUID) — không dùng tên người dùng gửi,
// nên không thể chèn "../" để ghi/đọc ra ngoài thư mục gốc.
export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR || "./data/uploads");

// Đường dẫn tuyệt đối của 1 tệp đã lưu; chặn mọi đường dẫn thoát ra ngoài thư mục gốc.
export function resolveStored(rel: string): string {
  const root = uploadRoot();
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("Đường dẫn tệp không hợp lệ");
  return abs;
}

const safeExt = (filename: string) => {
  const e = path.extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return e.length <= 10 ? e : "";
};

// Ghi tệp vào <root>/<folder>/<uuid><ext>, trả đường dẫn tương đối (dấu "/") để lưu DB. Ghi ra tệp tạm rồi đổi tên -> không để lại tệp dở dang.
export async function saveFile(folder: string, filename: string, data: Buffer): Promise<string> {
  const rel = `${folder.replace(/[^a-zA-Z0-9/_-]/g, "")}/${randomUUID()}${safeExt(filename)}`;
  const abs = resolveStored(rel);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.part`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, abs);
  return rel;
}

export async function removeFile(rel: string | null | undefined): Promise<void> {
  if (!rel) return;
  try {
    await fs.promises.unlink(resolveStored(rel));
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
}

export async function fileSize(rel: string): Promise<number | null> {
  try {
    return (await fs.promises.stat(resolveStored(rel))).size;
  } catch {
    return null;
  }
}
