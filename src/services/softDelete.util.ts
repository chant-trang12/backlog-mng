import type { Knex } from "knex";

// Xóa mềm — dùng chung cho mọi bảng dữ liệu nghiệp vụ chính (periods,
// departments, teams, members, tasks, task_members, feature_requests,
// roadmap_items, roadmap_details, incidents, tickets, compliance_records,
// training_records, attendance_records, noiquy_overrides, support_records,
// danh_gia_records, users) — xem kế hoạch gắn cờ is_deleted thay cho DELETE
// thật, để dữ liệu không mất hẳn khỏi file DB khi có sự cố (vẫn backup/
// khôi phục được), chỉ biến mất khỏi mọi màn hình như xóa thật.
//
// KHÔNG áp dụng cho các bảng danh mục/cấu hình (tags, phân loại, nhóm,
// chức vụ, hệ thống, mục tiêu, phân loại nhân sự, loại yêu cầu, tiêu chí,
// ranking) — nhóm này vẫn xóa cứng như cũ (ít rủi ro, dữ liệu tham chiếu
// gọn, không cần giữ lại).
//
// Dùng thay cho `.delete()` ở các bảng trong phạm vi — giữ nguyên cách gọi
// (.where/.whereIn) như code cũ, chỉ đổi hành động cuối. `db` nhận cả
// instance gốc lẫn transaction (trx) — cùng kiểu Knex.QueryInterface.
export function softDeleteWhere(
  db: Knex,
  table: string,
  where: Record<string, unknown>,
): Knex.QueryBuilder {
  return db(table).where(where).update({ is_deleted: true, deleted_at: db.fn.now() });
}

export function softDeleteWhereIn(
  db: Knex,
  table: string,
  column: string,
  values: readonly (string | number)[],
): Knex.QueryBuilder {
  return db(table).whereIn(column, values as (string | number)[]).update({ is_deleted: true, deleted_at: db.fn.now() });
}

// Điều kiện lọc dùng chung ở mọi query đọc (list/get/join) trên các bảng
// trong phạm vi — để bản ghi đã xóa mềm biến mất khỏi mọi màn hình đúng
// như xóa thật trước đây.
export const NOT_DELETED = { is_deleted: false } as const;
