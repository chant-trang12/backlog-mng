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
import { migrateDepartments, migrateSoftDeleteDepartments } from "./migrations/departments.js";
import {
  migrateCoreTables,
  migrateCskhTables,
  migrateTeamRecordTables,
  migrateSoftDeleteCore,
  migrateSoftDeleteCskh,
  migrateSoftDeleteTeamRecords,
} from "./migrations/core.js";
import { migrateRoadmapTables } from "./migrations/roadmap.js";
import { migrateScoringTables } from "./migrations/scoring.js";
import {
  migrateTaskDauMoiPhoiHop,
  migrateTaskGradingExtras,
  migrateTaskMembersTables,
  migrateTaskMovedToTaskId,
  migrateTaskTienDoHistory,
  migrateSoftDeleteTaskMembers,
} from "./migrations/tasks.js";
import {
  migrateMembersGhiChu,
  migrateMembersHaKi,
  migrateUsersDepartment,
  migrateUsersTable,
  migrateSoftDeleteUsers,
} from "./migrations/users.js";
import { migrateFeatureRequestTables } from "./migrations/featureRequests.js";
import { migrateActionLogsTable } from "./migrations/actionLogs.js";

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
    // tasks.dau_moi_phoi_hop (cột "Đầu mối phối hợp" ở Backlog).
    await migrateTaskDauMoiPhoiHop();
    // tasks.tien_do_history (lịch sử cột "Tiến độ" qua các tháng).
    await migrateTaskTienDoHistory();
    // tasks.moved_to_task_id (biết đúng bản sao "Chuyển sang tháng sau" còn
    // tồn tại hay không, để cho chuyển lại khi bản sao đã bị xóa).
    await migrateTaskMovedToTaskId();
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
    // users.department_id (Quy tắc 9.2) — cần bảng departments (migrateDepartments,
    // bước 23 ở trên) đã tồn tại sẵn.
    await migrateUsersDepartment();
    // members.ha_ki (nút "Hạ KI").
    await migrateMembersHaKi();
    // members.ghi_chu (Ghi chú tự do ở tab Nhân sự).
    await migrateMembersGhiChu();
    // feature_requests + loai_yeu_cau_options (module "Yêu cầu tính năng")
    // — cần bảng departments đã có ở migrateDepartments() (bước 23 ở trên).
    await migrateFeatureRequestTables();
    // action_logs (Nhật ký hoạt động) — cần bảng users (migrateUsersTable)
    // + departments (migrateDepartments, bước 23 ở trên) đã tồn tại sẵn.
    await migrateActionLogsTable();

    // Xóa mềm (is_deleted/deleted_at) cho dữ liệu nghiệp vụ chính — gắn cờ
    // thay vì DELETE thật để không mất dữ liệu khi có sự cố (vẫn backup/
    // khôi phục được). KHÔNG áp dụng cho bảng danh mục/cấu hình (tags,
    // phân loại, hệ thống, mục tiêu, tiêu chí, ranking...). Chạy sau cùng,
    // chỉ cần đúng các bảng liên quan đã tồn tại (đã tạo ở các bước trên).
    await migrateSoftDeleteCore(); // periods / teams / members / tasks
    await migrateSoftDeleteCskh(); // incidents / tickets / creation_rates
    await migrateSoftDeleteTeamRecords(); // compliance/training/attendance/noiquy/support/danh_gia
    await migrateSoftDeleteDepartments();
    await migrateSoftDeleteTaskMembers();
    await migrateSoftDeleteUsers();
    // roadmap_items/roadmap_details và feature_requests tự thêm is_deleted
    // ngay trong migrateRoadmapTables()/migrateFeatureRequestTables() ở
    // trên (không có UNIQUE riêng nên không cần tách hàm riêng).
  })();

  return initPromise;
}

// Khởi tạo schema khi module được import
await initDatabase();
