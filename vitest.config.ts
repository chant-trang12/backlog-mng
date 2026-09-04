import { defineConfig } from "vitest/config";

// Cấu hình Vitest:
// - Chạy tuần tự (fileParallelism: false) để tránh xung đột dữ liệu.
// - Dùng file DB test riêng biệt (test-backlog.db) để bảo vệ dữ liệu dev thật.
// - globalSetup tự dọn dẹp file DB test trước và sau mỗi đợt chạy test.
export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      SQLITE_FILENAME: "./data/test-backlog.db",
      DB_CLIENT: "sqlite",
    },
    globalSetup: "./tests/globalSetup.ts",
  },
});
