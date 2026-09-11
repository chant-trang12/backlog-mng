import { db } from "../db/database.js";

// Trả về `desired` nếu chưa tồn tại trong `table.column`, ngược lại tự thêm
// hậu tố " 2", " 3"... tới khi tìm được tên trống — dùng cho các nút "+ Thêm
// X" gửi sẵn tên mặc định (VD: "Nhóm mới"), tránh lỗi UNIQUE constraint khi
// bấm nhiều lần liên tiếp.
export async function resolveUniqueName(
  table: string,
  column: string,
  desired: string,
): Promise<string> {
  const base = desired.trim();
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await db(table).where({ [column]: candidate }).first()) {
    candidate = `${base} ${n}`;
    n += 1;
  }
  return candidate;
}
