import { defineConfig } from "vitest/config";

// Cấu hình Vitest:
// - Chạy tuần tự (fileParallelism: false) để tránh xung đột dữ liệu.
// - Fix flake ("list.body.map is not a function", "expected 404 to be 200",
//   401/JSON lạ ngẫu nhiên): supertest mở server listen(0) cho từng request;
//   trên macOS, VS Code / CoDev CLI / Chrome giữ nhiều port trong dãy
//   ephemeral (49152-65535) nên thỉnh thoảng request test đi lạc vào server
//   ngoại lai. tests/setup.ts ép mọi server test vào dãy riêng tư
//   41000-48799 (ngoài ephemeral range) -> không còn trùng port.
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
    setupFiles: ["./tests/setup.ts"],
  },
});
