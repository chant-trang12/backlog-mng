import { defineConfig } from "vitest/config";

// Toàn bộ test dùng chung 1 file SQLite thật (src/db/database.ts) thay vì DB
// riêng cho mỗi test — chạy các test file song song sẽ ghi đè/đụng dữ liệu
// lẫn nhau (ví dụ: logic "nhân bản nhân sự từ tháng gần nhất" chọn theo năm
// lớn nhất trên toàn bộ DB). Tắt fileParallelism để các file test chạy tuần
// tự, tránh nhiễu chéo.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
