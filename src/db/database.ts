// Khởi tạo schema DB — mỗi lần khởi động app (không dùng hệ migration file
// riêng của Knex, để không cần thêm bước deploy tách biệt: git push xong,
// restart server là schema tự đồng bộ). Idempotent theo hasTable/hasColumn
// — bảng/cột đã có thì bỏ qua, chỉ tạo mới/thêm cột còn thiếu.
//
// File này chỉ còn là orchestrator gọi các hàm migrate theo ĐÚNG THỨ TỰ phụ
// thuộc (VD: departments phải tạo trước khi thêm cột teams.department_id).
// Từng nhóm bảng đã tách sang src/db/migrations/*.ts theo domain, xem ở đó
// để biết chi tiết từng bảng — file này chỉ còn phần "gọi theo thứ tự".
export { db } from "./connection.js";
import { migrateCatalogTables, seedCatalogData } from "./migrations/catalogs.js";
import { migrateDepartments } from "./migrations/departments.js";
import { migrateCoreTables, migrateCskhTables, migrateTeamRecordTables } from "./migrations/core.js";
import { migrateRoadmapTables } from "./migrations/roadmap.js";
import { migrateScoringTables } from "./migrations/scoring.js";
import { migrateTaskGradingExtras, migrateTaskMembersTables } from "./migrations/tasks.js";
import { migrateMembersHaKi, migrateUsersTable } from "./migrations/users.js";

let initPromise: Promise<void> | null = null;

export async function initDatabase(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 1-4: periods / teams / members / tasks.
    await migrateCoreTables();
    // 5-7: incidents / tickets / creation_rates (CSKH).
    await migrateCskhTables();
    // 8-13: compliance / training / attendance / noiquy / support / danh_gia.
    await migrateTeamRecordTables();
    // 14-18: tieu_chi_configs / tieu_chi_diem_chuan / ranking_rows-columns-cells.
    await migrateScoringTables();
    // 19-22: tags / phan_loai_options / nhom_options / chuc_vu_options (schema).
    await migrateCatalogTables();
    // 23: departments + mọi cột/backfill phụ thuộc ở teams/tasks/tieu_chi_configs
    // — phải chạy sau migrateCoreTables + migrateScoringTables ở trên.
    await migrateDepartments();
    // tasks.cpo_graded_at / prev_* / grading_history.
    await migrateTaskGradingExtras();
    // 24-28: he_thong_options / muc_tieu_options / roadmap_items / roadmap_details
    // / roadmap_items.synced_task_id — cần bảng departments + tasks đã có ở trên.
    await migrateRoadmapTables();
    // 29-30: task_members + phan_loai_nhan_su_options.
    await migrateTaskMembersTables();
    // Seed dữ liệu cho catalogs (19-22) — chạy sau vì nhom_options backfill
    // từ dữ liệu tieu_chi_configs sẵn có.
    await seedCatalogData();
    // Quản lý User + Phân quyền.
    await migrateUsersTable();
    // members.ha_ki (nút "Hạ KI").
    await migrateMembersHaKi();
  })();

  return initPromise;
}

// Khởi tạo schema khi module được import
await initDatabase();
