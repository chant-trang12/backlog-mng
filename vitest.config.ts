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
      // Force SSO off in tests even if .env has SSO_ENABLED=true.
      // dotenv won't override existing process.env values, so this sticks.
      SSO_ENABLED: "false",
    },
    globalSetup: "./tests/globalSetup.ts",
  },
});
