import "dotenv/config";
import knex, { type Knex } from "knex";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");

const isMssql = process.env.DB_CLIENT === "mssql";

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

    // 19. tags
    const hasTags = await db.schema.hasTable("tags");
    if (!hasTags) {
      await db.schema.createTable("tags", (table) => {
        table.increments("id").primary();
        table.string("ten_tag", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 20. phan_loai_options
    const hasPhanLoai = await db.schema.hasTable("phan_loai_options");
    if (!hasPhanLoai) {
      await db.schema.createTable("phan_loai_options", (table) => {
        table.increments("id").primary();
        table.string("ten_phan_loai", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 21. nhom_options
    const hasNhom = await db.schema.hasTable("nhom_options");
    if (!hasNhom) {
      await db.schema.createTable("nhom_options", (table) => {
        table.increments("id").primary();
        table.string("ten_nhom", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 22. chuc_vu_options
    const hasChucVu = await db.schema.hasTable("chuc_vu_options");
    if (!hasChucVu) {
      await db.schema.createTable("chuc_vu_options", (table) => {
        table.increments("id").primary();
        table.string("ten_chuc_vu", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 23. departments — tầng "Phòng" trên team. Mỗi phòng có nhiều team; team
    // (và qua đó nhân sự, task, CSKH...) thuộc đúng 1 phòng. Period vẫn dùng
    // chung mọi phòng.
    const hasDepartments = await db.schema.hasTable("departments");
    if (!hasDepartments) {
      await db.schema.createTable("departments", (table) => {
        table.increments("id").primary();
        table.string("name", 255).notNullable().unique();
        table.string("code", 50);
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // Seed 1 phòng mặc định (dữ liệu cũ nếu có sẽ gán vào phòng này).
    const deptCountRes = await db("departments").count({ c: "*" }).first();
    if (Number((deptCountRes as any)?.c ?? 0) === 0) {
      await db("departments").insert([
        { name: "Phòng Công nghệ thông tin", code: "CNTT", thu_tu: 0 },
        { name: "Phòng Vận hành", code: "VH", thu_tu: 1 },
      ]);
    }

    const firstDept = await db("departments").orderBy("thu_tu", "asc").first();
    const firstDeptId = Number((firstDept as any)?.id ?? 1);

    // teams.department_id — thêm cột nếu chưa có, backfill dữ liệu cũ về phòng
    // đầu tiên.
    if (!(await db.schema.hasColumn("teams", "department_id"))) {
      await db.schema.alterTable("teams", (table) => {
        table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
      });
      await db("teams").whereNull("department_id").update({ department_id: firstDeptId });
    }

    // tasks.department_id — tương tự. Backfill: khớp tasks.team (chuỗi) với
    // team cùng period để lấy phòng; không khớp thì về phòng đầu tiên.
    if (!(await db.schema.hasColumn("tasks", "department_id"))) {
      await db.schema.alterTable("tasks", (table) => {
        table.integer("department_id").references("id").inTable("departments").onDelete("NO ACTION");
      });
      const staleTasks = await db("tasks").whereNull("department_id").select("id", "period_id", "team");
      for (const t of staleTasks) {
        const team = await db("teams")
          .where({ period_id: (t as any).period_id, name: (t as any).team })
          .first();
        await db("tasks")
          .where({ id: (t as any).id })
          .update({ department_id: Number((team as any)?.department_id ?? firstDeptId) });
      }
    }

    // 24. he_thong_options — danh mục Hệ thống (Website, Nội bộ...), dùng ở
    // Roadmap năm.
    if (!(await db.schema.hasTable("he_thong_options"))) {
      await db.schema.createTable("he_thong_options", (table) => {
        table.increments("id").primary();
        table.string("ten_he_thong", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }
    const heThongCountRes = await db("he_thong_options").count({ c: "*" }).first();
    if (Number((heThongCountRes as any)?.c ?? 0) === 0) {
      const seed = ["Website", "Nội bộ", "App Mobile"];
      for (let i = 0; i < seed.length; i++) {
        await db("he_thong_options").insert({ ten_he_thong: seed[i], thu_tu: i });
      }
    }

    // 25. muc_tieu_options — danh mục Mục tiêu (Tính năng mới, Nâng cấp...),
    // dùng ở Roadmap năm.
    if (!(await db.schema.hasTable("muc_tieu_options"))) {
      await db.schema.createTable("muc_tieu_options", (table) => {
        table.increments("id").primary();
        table.string("ten_muc_tieu", 255).notNullable().unique();
        table.integer("thu_tu").notNullable().defaultTo(0);
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      });
    }
    const mucTieuCountRes = await db("muc_tieu_options").count({ c: "*" }).first();
    if (Number((mucTieuCountRes as any)?.c ?? 0) === 0) {
      const seed = ["Tính năng mới", "Nâng cấp tính năng", "Tối ưu hệ thống"];
      for (let i = 0; i < seed.length; i++) {
        await db("muc_tieu_options").insert({ ten_muc_tieu: seed[i], thu_tu: i });
      }
    }

    // 26. roadmap_items — Roadmap năm, theo (department_id, year). "Quý kết
    // thúc" là giá trị suy ra từ thoi_gian_ket_thuc, không lưu.
    if (!(await db.schema.hasTable("roadmap_items"))) {
      await db.schema.createTable("roadmap_items", (table) => {
        table.increments("id").primary();
        table.integer("department_id").references("id").inTable("departments").onDelete("CASCADE");
        table.integer("year").notNullable();
        table.string("team", 255).notNullable();
        table.string("he_thong", 255);
        table.string("muc_tieu", 255);
        table.text("nhiem_vu").notNullable();
        table.text("dod");
        table.text("dieu_kien_dam_bao");
        table.string("phan_loai", 255);
        table.string("thoi_gian_bat_dau", 50);
        table.string("thoi_gian_ket_thuc", 50);
        table.string("trang_thai", 100).notNullable().defaultTo("Chưa thực hiện");
        table.text("ghi_chu");
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // 27. roadmap_details — chi tiết công việc theo tháng của 1 dòng roadmap.
    if (!(await db.schema.hasTable("roadmap_details"))) {
      await db.schema.createTable("roadmap_details", (table) => {
        table.increments("id").primary();
        table
          .integer("roadmap_item_id")
          .notNullable()
          .references("id")
          .inTable("roadmap_items")
          .onDelete("CASCADE");
        table.integer("month").notNullable(); // 1..12
        table.text("noi_dung").notNullable();
        table.string("trang_thai", 100).notNullable().defaultTo("Chưa thực hiện");
        table.text("ghi_chu");
        table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
        table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      });
    }

    // Seed danh mục Tag
    const tagCountRes = await db("tags").count({ c: "*" }).first();
    const tagCount = Number((tagCountRes as any)?.c ?? 0);
    if (tagCount === 0) {
      const seedTags = [
        "Số hoá",
        "Đầu tư",
        "Chất lượng dịch vụ",
        "Trải nghiệm khách hàng",
        "Quản lý chất lượng",
        "ISO",
        "Quy trình",
        "Nhiệm vụ kỹ thuật",
      ];
      for (let i = 0; i < seedTags.length; i++) {
        await db("tags").insert({ ten_tag: seedTags[i], thu_tu: i });
      }
    }

    // Seed danh mục Phân loại
    const phanLoaiCountRes = await db("phan_loai_options").count({ c: "*" }).first();
    const phanLoaiCount = Number((phanLoaiCountRes as any)?.c ?? 0);
    if (phanLoaiCount === 0) {
      const seedPhanLoai = ["NVKH", "NVPS", "NVTT", "NV được giao từ BGĐ"];
      for (let i = 0; i < seedPhanLoai.length; i++) {
        await db("phan_loai_options").insert({ ten_phan_loai: seedPhanLoai[i], thu_tu: i });
      }
    }

    // Seed danh mục Nhóm từ tieu_chi_configs
    const nhomCountRes = await db("nhom_options").count({ c: "*" }).first();
    const nhomCount = Number((nhomCountRes as any)?.c ?? 0);
    if (nhomCount === 0) {
      const existingNhom = await db("tieu_chi_configs")
        .select("nhom")
        .min({ min_id: "id" })
        .groupBy("nhom")
        .orderBy("min_id", "asc");
      for (let i = 0; i < existingNhom.length; i++) {
        await db("nhom_options").insert({ ten_nhom: (existingNhom[i] as any).nhom, thu_tu: i });
      }
    }

    // Seed danh mục Chức vụ
    const chucVuCountRes = await db("chuc_vu_options").count({ c: "*" }).first();
    const chucVuCount = Number((chucVuCountRes as any)?.c ?? 0);
    if (chucVuCount === 0) {
      const seedChucVu = [
        "Trưởng phòng",
        "Chuyên gia",
        "Trưởng nhóm",
        "Trưởng nhóm (Nội bộ)",
        "Trưởng nhóm (ATM + Billing)",
        "Nghiệp vụ sản phẩm (BA)",
        "Nhân viên Nghiệp vụ Kỹ thuật",
        "Chuyên gia Nghiên cứu Phát triển dịch vụ",
        "Kỹ sư Phần mềm",
        "Kỹ sư kiểm thử & Quản lý chất lượng",
        "Chuyên viên Quy trình - ISO",
        "Nhân viên quản lý phát triển bền vững",
        "Kỹ sư Phân tích Dữ liệu (DA)",
        "Nhân viên quản lý chất lượng",
        "Kỹ sư dữ liệu (DE)",
        "Nhân viên thiết kế, đồ họa (UI/UX Designer)",
        "Nhân viên quy trình - ISO",
        "Nhân viên Scrum Master",
        "Nhân viên phân tích nghiệp vụ",
        "Chuyên viên Trí tuệ nhân tạo",
      ];
      for (let i = 0; i < seedChucVu.length; i++) {
        await db("chuc_vu_options").insert({ ten_chuc_vu: seedChucVu[i], thu_tu: i });
      }
    }
  })();

  return initPromise;
}

// Khởi tạo schema khi module được import
await initDatabase();

