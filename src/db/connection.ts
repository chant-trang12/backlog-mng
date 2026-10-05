import "dotenv/config";
import knex, { type Knex } from "knex";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");

export const isMssql = process.env.DB_CLIENT === "mssql";

// Fail fast on startup if MSSQL credentials are missing
if (isMssql && !process.env.MSSQL_PASSWORD) {
  console.error("FATAL: MSSQL_PASSWORD is required when DB_CLIENT=mssql");
  process.exit(1);
}

let dbInstance: Knex;

if (isMssql) {
  dbInstance = knex({
    client: "mssql",
    connection: {
      server: process.env.MSSQL_SERVER || "localhost",
      port: Number(process.env.MSSQL_PORT || 1433),
      user: process.env.MSSQL_USER || "sa",
      password: process.env.MSSQL_PASSWORD || "",
      database: process.env.MSSQL_DATABASE || "backlog_mng",
      requestTimeout: Number(process.env.MSSQL_REQUEST_TIMEOUT || 30000),
      options: {
        encrypt: process.env.MSSQL_ENCRYPT === "true",
        trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE !== "false",
        // Cột created_at/updated_at mặc định GETDATE() = giờ ĐỊA PHƯƠNG của
        // SQL Server. tedious mặc định (useUTC=true) lại hiểu giá trị đó là
        // UTC -> giờ hiển thị lệch đúng bằng múi giờ (VD +7h ở VN). Tắt đi để
        // đọc theo giờ địa phương của process Node (giả định Node và SQL
        // Server cùng múi giờ); đặt MSSQL_USE_UTC=true nếu server chạy UTC.
        useUTC: process.env.MSSQL_USE_UTC === "true",
      },
    },
    pool: {
      min: Number(process.env.MSSQL_POOL_MIN || 2),
      max: Number(process.env.MSSQL_POOL_MAX || 10),
    },
  });
} else {
  fs.mkdirSync(dataDir, { recursive: true });
  const sqliteFile = path.resolve(process.env.SQLITE_FILENAME || path.join(dataDir, "backlog.db"));

  dbInstance = knex({
    client: "better-sqlite3",
    connection: {
      filename: sqliteFile,
    },
    useNullAsDefault: true,
    pool: {
      // better-sqlite3 là driver ĐỒNG BỘ (mọi lệnh chặn luồng, không có
      // I/O bất đồng bộ thật) — nhiều connection trong pool không mang lại
      // lợi ích song song nào cho 1 file SQLite duy nhất, chỉ thêm rủi ro:
      // PRAGMA (VD foreign_keys) là thiết lập RIÊNG TỪNG CONNECTION trong
      // SQLite — bật/tắt ở 1 connection rồi 1 câu lệnh sau đó rơi vào
      // connection KHÁC trong pool (vẫn còn pragma mặc định từ afterCreate)
      // sẽ không có tác dụng như mong đợi (gặp thực tế ở bước rebuild bảng
      // khi chuyển sang xóa mềm — xem migrations/core.ts). Ép đúng 1
      // connection cho cả vòng đời app để mọi PRAGMA/transaction luôn nhất
      // quán.
      min: 1,
      max: 1,
      afterCreate: (conn: any, done: any) => {
        try {
          conn.pragma("journal_mode = WAL");
          conn.pragma("foreign_keys = ON");
          done(null, conn);
        } catch (err) {
          done(err, conn);
        }
      },
    },
  });
}

export const db = dbInstance;
