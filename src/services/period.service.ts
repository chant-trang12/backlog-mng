import { db } from "../db/database.js";
import { cloneMembersFromPeriod } from "./member.service.js";
import { cloneTeamsFromPeriod } from "./team.service.js";
import { softDeleteWhere, softDeleteWhereIn } from "./softDelete.util.js";
import type { CreatePeriodInput, Period } from "../types/backlog.js";

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function defaultLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]}/${year}`;
}

// 1.2 Tạo mới một backlog theo tháng — mỗi (năm, tháng) chỉ có một period, tạo
// lại nếu đã tồn tại thì trả về period cũ (idempotent) để tránh trùng lặp khi
// người dùng bấm "Tạo tháng mới" nhiều lần cho cùng một tháng.
export async function createPeriod(input: CreatePeriodInput): Promise<Period> {
  const existing = await getPeriodByYearMonth(input.year, input.month);
  if (existing) return existing;

  const label = input.label?.trim() || defaultLabel(input.year, input.month);
  const [created] = await db("periods")
    .insert({ year: input.year, month: input.month, label })
    .returning("*");

  // Tháng mới kế thừa danh sách team + nhân sự từ tháng gần nhất đã có (nếu
  // có), để không phải khai báo lại từ đầu — nhưng từ đây là các danh sách
  // độc lập. Phải nhân bản team TRƯỚC nhân sự vì nhân sự cần map team_id
  // đúng theo team (mới) của tháng vừa tạo.
  const latestOther = await db("periods")
    .where("id", "!=", created.id)
    .orderBy("year", "desc")
    .orderBy("month", "desc")
    .select("id")
    .first();

  if (latestOther) {
    await cloneTeamsFromPeriod(latestOther.id, created.id);
    await cloneMembersFromPeriod(latestOther.id, created.id);
  }

  return created as Period;
}

// is_deleted=false ở đây để sau khi xóa mềm 1 tháng, tạo lại ĐÚNG năm/tháng
// đó qua createPeriod() (gọi hàm này để kiểm tra "đã có chưa") sẽ KHÔNG
// thấy bản ghi cũ đã xóa — tạo mới bình thường, đúng ý nghĩa filtered
// unique index ở migration (xem migrateSoftDeleteCore, core.ts).
export async function getPeriodByYearMonth(year: number, month: number): Promise<Period | undefined> {
  const row = await db("periods").where({ year, month, is_deleted: false }).first();
  return row as Period | undefined;
}

export async function getPeriod(id: number): Promise<Period | undefined> {
  const row = await db("periods").where({ id, is_deleted: false }).first();
  return row as Period | undefined;
}

export async function listPeriods(): Promise<Period[]> {
  const rows = await db("periods").where({ is_deleted: false }).orderBy("year", "desc").orderBy("month", "desc");
  return rows as Period[];
}

// Xóa mềm — gắn cờ is_deleted thay vì DELETE thật (không mất dữ liệu khi có
// sự cố, vẫn backup/khôi phục được — xem softDelete.util.ts). Cascade thủ
// công xuống toàn bộ bảng con y hệt trước đây (chỉ đổi hành động cuối từ
// .delete() sang softDeleteWhere()), giữ nguyên thứ tự/transaction.
export async function deletePeriod(id: number): Promise<boolean> {
  return await db.transaction(async (trx) => {
    await softDeleteWhere(trx, "tasks", { period_id: id });
    await softDeleteWhere(trx, "attendance_records", { period_id: id });
    await softDeleteWhere(trx, "compliance_records", { period_id: id });
    await softDeleteWhere(trx, "training_records", { period_id: id });
    await softDeleteWhere(trx, "support_records", { period_id: id });
    await softDeleteWhere(trx, "danh_gia_records", { period_id: id });
    await softDeleteWhere(trx, "noiquy_overrides", { period_id: id });
    await softDeleteWhere(trx, "incidents", { period_id: id });
    await softDeleteWhere(trx, "tickets", { period_id: id });
    await softDeleteWhere(trx, "creation_rates", { period_id: id });
    // task_members không có period_id trực tiếp — cascade qua tasks ở trên
    // KHÔNG tự lan xuống (task_members.task_id không có is_deleted check
    // theo task cha) nên gỡ riêng theo danh sách task vừa xóa mềm.
    const taskIds = await trx("tasks").where({ period_id: id }).select("id");
    if (taskIds.length > 0) {
      await softDeleteWhereIn(
        trx,
        "task_members",
        "task_id",
        taskIds.map((t: { id: number }) => t.id),
      );
    }
    await softDeleteWhere(trx, "members", { period_id: id });
    await softDeleteWhere(trx, "teams", { period_id: id });
    const count = await softDeleteWhere(trx, "periods", { id });
    return count > 0;
  });
}
