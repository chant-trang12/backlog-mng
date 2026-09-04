import "dotenv/config";
import knex, { type Knex } from "knex";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");

const isMssql = process.env.DB_CLIENT === "mssql";

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

let initPromise: Promise<void> | null = null;

export async function initDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 1. periods
    const hasPeriods = await db.schema.hasTable("periods");
    if (!hasPeriods) {
      await db.schema.createTable("periods", (table) => {
        table.increments("id").primary();
        table.integer("year").notNullable();
        table.integer("month").notNullable();
        table.string("label", 255).notNullable();
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
        table.unique(["year", "month"]);
      });
    }

    // 2. teams
    const hasTeams = await db.schema.hasTable("teams");
    if (!hasTeams) {
      await db.schema.createTable("teams", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.string("name", 255).notNullable();
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.unique(["period_id", "name"]);
      });
    }

    // 3. members
    const hasMembers = await db.schema.hasTable("members");
    if (!hasMembers) {
      await db.schema.createTable("members", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
        table.string("name", 255).notNullable();
        table.string("chuc_vu", 255);
        table.string("tuan_thu", 255);
        table.string("noi_quy", 255);
        table.string("dao_tao", 255);
        table.string("ho_tro", 255);
        table.string("danh_gia", 255);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.unique(["period_id", "team_id", "name"]);
      });
    }

    // 4. tasks
    const hasTasks = await db.schema.hasTable("tasks");
    if (!hasTasks) {
      await db.schema.createTable("tasks", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("stt").notNullable();
        table.text("tinh_chat");
        table.text("khong_tinh_diem");
        table.text("tag");
        table.string("team", 255).notNullable();
        table.text("nhiem_vu").notNullable();
        table.text("dod");
        table.string("ngay_thuc_hien", 50);
        table.string("deadline", 50);
        table.string("nvtt", 255);
        table.integer("phan_tram_hoan_thanh").notNullable().defaultTo(0);
        table.string("trang_thai", 50).notNullable().defaultTo("Chưa thực hiện");
        table.text("tien_do");
        table.integer("cpo_danh_gia");
        table.text("cpo_comment");
        table.integer("da_chuyen_thang").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
        table.index(["period_id"]);
        table.index(["team"]);
      });
    }

    // 5. incidents
    const hasIncidents = await db.schema.hasTable("incidents");
    if (!hasIncidents) {
      await db.schema.createTable("incidents", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
        table.text("su_co").notNullable();
        table.string("tinh_chat", 255);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 6. tickets
    const hasTickets = await db.schema.hasTable("tickets");
    if (!hasTickets) {
      await db.schema.createTable("tickets", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
        table.integer("tong_ticket").notNullable().defaultTo(0);
        table.integer("ticket_vuot").notNullable().defaultTo(0);
        table.integer("dung_han").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 7. creation_rates
    const hasCreationRates = await db.schema.hasTable("creation_rates");
    if (!hasCreationRates) {
      await db.schema.createTable("creation_rates", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("team_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
        table.integer("so_luong_thanh_cong").notNullable().defaultTo(0);
        table.integer("so_luong_that_bai").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 8. compliance_records
    const hasCompliance = await db.schema.hasTable("compliance_records");
    if (!hasCompliance) {
      await db.schema.createTable("compliance_records", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
        table.integer("vi_pham").notNullable().defaultTo(0);
        table.text("noi_dung");
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 9. training_records
    const hasTraining = await db.schema.hasTable("training_records");
    if (!hasTraining) {
      await db.schema.createTable("training_records", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
        table.string("loai", 255);
        table.string("ngay_thuc_hien", 50);
        table.string("nguoi_xac_nhan", 255);
        table.text("noi_dung");
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 10. attendance_records
    const hasAttendance = await db.schema.hasTable("attendance_records");
    if (!hasAttendance) {
      await db.schema.createTable("attendance_records", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("row_index").notNullable();
        table.text("row_data").notNullable();
        table.integer("excluded_from_late").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 11. noiquy_overrides
    const hasNoiQuy = await db.schema.hasTable("noiquy_overrides");
    if (!hasNoiQuy) {
      await db.schema.createTable("noiquy_overrides", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.string("member_name", 255).notNullable();
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.unique(["period_id", "member_name"]);
      });
    }

    // 12. support_records
    const hasSupport = await db.schema.hasTable("support_records");
    if (!hasSupport) {
      await db.schema.createTable("support_records", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
        table.integer("team_nhan_ho_tro_id").notNullable().references("id").inTable("teams").onDelete("NO ACTION");
        table.text("noi_dung");
        table.string("ngay_ho_tro", 50);
        table.string("nguoi_xac_nhan", 255);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 13. danh_gia_records
    const hasDanhGia = await db.schema.hasTable("danh_gia_records");
    if (!hasDanhGia) {
      await db.schema.createTable("danh_gia_records", (table) => {
        table.increments("id").primary();
        table.integer("period_id").notNullable().references("id").inTable("periods").onDelete("CASCADE");
        table.integer("member_id").notNullable().references("id").inTable("members").onDelete("NO ACTION");
        table.integer("so_thu_tu");
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
        table.unique(["period_id", "member_id"]);
      });
    }

    // 14. tieu_chi_configs
    const hasTieuChi = await db.schema.hasTable("tieu_chi_configs");
    if (!hasTieuChi) {
      await db.schema.createTable("tieu_chi_configs", (table) => {
        table.increments("id").primary();
        table.string("nhom", 255).notNullable();
        table.string("ten_tieu_chi", 255).notNullable();
        table.text("cach_tinh_diem");
        table.integer("co_chi_tieu").notNullable().defaultTo(0);
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 15. tieu_chi_diem_chuan
    const hasTieuChiDiemChuan = await db.schema.hasTable("tieu_chi_diem_chuan");
    if (!hasTieuChiDiemChuan) {
      await db.schema.createTable("tieu_chi_diem_chuan", (table) => {
        table.increments("id").primary();
        table.integer("tieu_chi_id").notNullable().references("id").inTable("tieu_chi_configs").onDelete("CASCADE");
        table.string("team_name", 255).notNullable();
        table.string("diem_chuan", 255);
        table.string("chi_tieu", 255);
        table.unique(["tieu_chi_id", "team_name"]);
      });
    }

    // 16. ranking_rows
    const hasRankingRows = await db.schema.hasTable("ranking_rows");
    if (!hasRankingRows) {
      await db.schema.createTable("ranking_rows", (table) => {
        table.integer("vi_tri").primary();
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 17. ranking_columns
    const hasRankingColumns = await db.schema.hasTable("ranking_columns");
    if (!hasRankingColumns) {
      await db.schema.createTable("ranking_columns", (table) => {
        table.increments("id").primary();
        table.string("ten_cot", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
      });
    }

    // 18. ranking_cells
    const hasRankingCells = await db.schema.hasTable("ranking_cells");
    if (!hasRankingCells) {
      await db.schema.createTable("ranking_cells", (table) => {
        table.increments("id").primary();
        table.integer("vi_tri").notNullable().references("vi_tri").inTable("ranking_rows").onDelete("CASCADE");
        table.integer("column_id").notNullable().references("id").inTable("ranking_columns").onDelete("CASCADE");
        table.string("gia_tri", 255);
        table.unique(["vi_tri", "column_id"]);
      });
    }
  })();

  return initPromise;
}

// Khởi tạo schema khi module được import
await initDatabase();
