import { db } from "../db/database.js";

// Chuẩn hoá 1 chuỗi tiếng Việt có dấu về đúng 1 dạng Unicode (NFC) trước khi
// so sánh/lưu — Bug đã gặp thực tế: cùng 1 chữ có dấu ("Tối ưu hệ thống") có
// thể được máy tính lưu dưới 2 dạng byte KHÁC NHAU tuỳ nguồn nhập (gõ trực
// tiếp thường ra NFC, nhưng copy-paste từ 1 số ứng dụng/hệ điều hành — đặc
// biệt macOS ở một số ngữ cảnh — lại ra NFD: chữ cái gốc + dấu là ký tự
// combining riêng). Cả 2 dạng hiển thị GIỐNG HỆT NHAU trên màn hình nhưng là
// 2 CHUỖI BYTE KHÁC NHAU — UNIQUE constraint của DB (so khớp byte-for-byte)
// không phát hiện được đây là trùng tên, nên tạo/sửa vẫn lưu được, sinh ra
// 2 dòng nhìn y hệt nhau (đây chính là nguyên nhân bug badge trùng lặp ở
// Cấu hình > Mục tiêu). Luôn ép về NFC (dạng chuẩn phổ biến nhất, cũng là
// dạng bàn phím tiếng Việt thông thường tự sinh ra) ở CẢ 2 chỗ: lúc kiểm
// tra trùng VÀ lúc lưu — đảm bảo mọi dữ liệu mới trong DB nhất quán 1 dạng,
// để UNIQUE constraint hoạt động đúng như kỳ vọng.
export function normalizeVietnameseText(value: string): string {
  return value.normalize("NFC");
}

// Trả về `desired` nếu chưa tồn tại trong `table.column`, ngược lại tự thêm
// hậu tố " 2", " 3"... tới khi tìm được tên trống — dùng cho các nút "+ Thêm
// X" gửi sẵn tên mặc định (VD: "Nhóm mới"), tránh lỗi UNIQUE constraint khi
// bấm nhiều lần liên tiếp.
export async function resolveUniqueName(
  table: string,
  column: string,
  desired: string,
): Promise<string> {
  const base = normalizeVietnameseText(desired.trim());
  let candidate = base;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await db(table).where({ [column]: candidate }).first()) {
    candidate = `${base} ${n}`;
    n += 1;
  }
  return candidate;
}
