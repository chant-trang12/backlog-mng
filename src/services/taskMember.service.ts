import { db } from "../db/database.js";
import type {
  CreateTaskMemberInput,
  KpiTheoTaskRow,
  TaskMemberWithName,
  UpdateTaskMemberInput,
} from "../types/backlog.js";
import { assertDepartmentInScope, departmentIdFromTaskId, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";

const SELECT_COLUMNS = [
  "task_members.id",
  "task_members.task_id",
  "task_members.member_id",
  "task_members.ty_le_dong_gop",
  "task_members.diem_ca_nhan",
  "task_members.phan_loai",
  "task_members.noi_dung_cong_viec",
  "task_members.ghi_chu",
  "task_members.created_at",
  "task_members.updated_at",
  "members.name as member_name",
  "members.chuc_vu as member_chuc_vu",
];

// Danh sách nhân sự tham gia 1 task, kèm tên + chức vụ (join members) để FE
// hiển thị trực tiếp — sắp theo thời điểm gán (id tăng dần). "Vai trò" hiển
// thị ở FE chính là member_chuc_vu — không có danh mục riêng, lấy thẳng
// theo Chức vụ đã khai báo sẵn cho nhân sự đó ở Team & Nhân sự.
export async function listTaskMembers(taskId: number): Promise<TaskMemberWithName[]> {
  const rows = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ task_id: taskId, "task_members.is_deleted": false })
    .select(SELECT_COLUMNS)
    .orderBy("task_members.id", "asc");

  // Tổng Giờ công/MD = SUM(gio_cong) của người đó trên TẤT CẢ Việc (task_items)
  // của CHÍNH task này — cộng dồn qua các Việc khác nhau, MD = Hours/8 (cố
  // định, giống tasks.service.ts/taskItem.service.ts). Hiển thị ở bảng
  // "Nhân sự tham gia" để thấy ngay khối lượng thật, không cần mở từng Việc.
  const hoursByMember = await db("task_item_members as tim")
    .join("task_items as ti", "tim.task_item_id", "ti.id")
    .where("ti.task_id", taskId)
    .where("ti.is_deleted", false)
    .where("tim.is_deleted", false)
    .groupBy("tim.member_id")
    .select("tim.member_id")
    .sum({ tong_gio_cong: "tim.gio_cong" });
  const hoursMap = new Map<number, number>(
    hoursByMember.map((r: any) => [Number(r.member_id), Number(r.tong_gio_cong) || 0]),
  );

  return rows.map((r: any) => {
    const tongGioCong = hoursMap.get(r.member_id) ?? 0;
    return {
      ...r,
      tong_gio_cong: Math.round(tongGioCong * 100) / 100,
      tong_md: Math.round((tongGioCong / 8) * 100) / 100,
    };
  }) as TaskMemberWithName[];
}

export async function getTaskMember(id: number): Promise<TaskMemberWithName | undefined> {
  const row = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ "task_members.id": id, "task_members.is_deleted": false })
    .select(SELECT_COLUMNS)
    .first();
  return row as TaskMemberWithName | undefined;
}

// undefined -> giữ nguyên giá trị cũ, null -> xóa (về "— Không —"), chuỗi
// -> trim rồi lưu (rỗng cũng thành null).
function normalizeNullableText(
  value: string | null | undefined,
  existing: string | null,
): string | null {
  if (value === undefined) return existing;
  if (value === null) return null;
  return value.trim() || null;
}

// Tổng % đã phân bổ cho task (trừ chính dòng đang sửa, nếu có) không được
// vượt 100 — dung sai nhỏ (0.01) để tránh lỗi làm tròn số thực.
async function assertContributionWithinLimit(
  taskId: number,
  excludeId: number | null,
  newValue: number,
): Promise<void> {
  if (!Number.isFinite(newValue) || newValue < 0 || newValue > 100) {
    throw new Error("Tỷ lệ đóng góp phải là số trong khoảng 0-100%");
  }
  const query = db("task_members")
    .where({ task_id: taskId, is_deleted: false })
    .whereNotNull("ty_le_dong_gop");
  if (excludeId != null) query.whereNot({ id: excludeId });
  const rows = await query.select("ty_le_dong_gop");
  const othersSum = rows.reduce((s, r: any) => s + Number(r.ty_le_dong_gop), 0);
  const total = othersSum + newValue;
  if (total > 100.01) {
    const remaining = Math.max(0, Math.round((100 - othersSum) * 100) / 100);
    throw new Error(
      `Tổng tỷ lệ đóng góp của task này sẽ vượt quá 100% (đã phân bổ ${othersSum}%, chỉ còn ${remaining}% để chia).`,
    );
  }
}

// Gán 1 nhân sự vào task — idempotent theo (task_id, member_id): gán lại
// nhân sự đã có sẽ trả về dòng cũ (chỉ cập nhật ghi chú nếu có gửi kèm),
// tránh trùng lặp khi bấm nhiều lần. Không còn khái niệm "vai trò" riêng
// theo dòng — 1 nhân sự chỉ tham gia 1 lần / task. Tỷ lệ đóng góp/điểm cá
// nhân thường được chỉnh sau (sửa trực tiếp trên bảng), không bắt buộc khi
// gán mới, nhưng vẫn cho gửi kèm nếu có.
export async function createTaskMember(
  taskId: number,
  input: CreateTaskMemberInput,
  scope: DataScope,
): Promise<TaskMemberWithName> {
  const departmentId = await departmentIdFromTaskId(taskId);
  assertDepartmentInScope(scope, departmentId);
  if (input.ty_le_dong_gop != null) {
    await assertContributionWithinLimit(taskId, null, input.ty_le_dong_gop);
  }

  // is_deleted=false — nhân sự đã gỡ khỏi task (xóa mềm) trước đó không
  // tính "đã có", gán lại tạo dòng mới (khớp filtered unique index).
  const existing = await db("task_members")
    .where({ task_id: taskId, member_id: input.member_id, is_deleted: false })
    .first();
  if (existing) {
    const update: Record<string, unknown> = { updated_at: db.fn.now() };
    if (input.ghi_chu !== undefined) update.ghi_chu = normalizeNullableText(input.ghi_chu, null);
    if (input.noi_dung_cong_viec !== undefined)
      update.noi_dung_cong_viec = normalizeNullableText(input.noi_dung_cong_viec, null);
    if (input.ty_le_dong_gop !== undefined) update.ty_le_dong_gop = input.ty_le_dong_gop;
    if (input.diem_ca_nhan !== undefined) update.diem_ca_nhan = input.diem_ca_nhan;
    if (input.phan_loai !== undefined) update.phan_loai = normalizeNullableText(input.phan_loai, null);
    await db("task_members").where({ id: existing.id }).update(update);
    return (await getTaskMember(existing.id)) as TaskMemberWithName;
  }

  const [created] = await db("task_members")
    .insert({
      task_id: taskId,
      member_id: input.member_id,
      department_id: departmentId,
      ty_le_dong_gop: input.ty_le_dong_gop ?? null,
      diem_ca_nhan: input.diem_ca_nhan ?? null,
      phan_loai: normalizeNullableText(input.phan_loai, null),
      noi_dung_cong_viec: normalizeNullableText(input.noi_dung_cong_viec, null),
      ghi_chu: normalizeNullableText(input.ghi_chu, null),
    })
    .returning("*");
  return (await getTaskMember(created.id)) as TaskMemberWithName;
}

export async function updateTaskMember(
  id: number,
  input: UpdateTaskMemberInput,
  scope: DataScope,
): Promise<TaskMemberWithName | undefined> {
  const existing = await getTaskMember(id);
  if (!existing) return undefined;
  const existingRow = await db("task_members").where({ id, is_deleted: false }).select("department_id").first();
  assertDepartmentInScope(scope, (existingRow as any)?.department_id ?? null);

  if (input.ty_le_dong_gop !== undefined && input.ty_le_dong_gop !== null) {
    await assertContributionWithinLimit(existing.task_id, id, input.ty_le_dong_gop);
  }

  await db("task_members")
    .where({ id })
    .update({
      ty_le_dong_gop: input.ty_le_dong_gop !== undefined ? input.ty_le_dong_gop : existing.ty_le_dong_gop,
      diem_ca_nhan: input.diem_ca_nhan !== undefined ? input.diem_ca_nhan : existing.diem_ca_nhan,
      phan_loai: normalizeNullableText(input.phan_loai, existing.phan_loai),
      noi_dung_cong_viec: normalizeNullableText(input.noi_dung_cong_viec, existing.noi_dung_cong_viec),
      ghi_chu: normalizeNullableText(input.ghi_chu, existing.ghi_chu),
      updated_at: db.fn.now(),
    });
  return getTaskMember(id);
}

export async function deleteTaskMember(id: number, scope: DataScope): Promise<boolean> {
  const existingRow = await db("task_members").where({ id, is_deleted: false }).select("department_id").first();
  if (!existingRow) return false;
  assertDepartmentInScope(scope, (existingRow as any).department_id ?? null);
  const count = await softDeleteWhere(db, "task_members", { id });
  return count > 0;
}

// Nhãn "Hỗ trợ" trong danh mục phan_loai_nhan_su_options — khớp với
// HO_TRO_LABEL ở public/app.js (2 nơi định nghĩa độc lập, không có module
// dùng chung giữa FE/BE trong repo này).
const HO_TRO_LABEL = "Hỗ trợ";

// KPI nhân sự tính trực tiếp theo task (dùng cho phòng ban có
// departments.cach_tinh_kpi = "theo_task", không chia theo team) — cộng dồn
// Điểm cá nhân của mỗi nhân sự từ mọi task họ tham gia trong 1 tháng
// backlog. Điểm từng task:
// - diem_ca_nhan ghi đè tay -> luôn ưu tiên dùng giá trị đó, bất kể phân loại.
// - Task phân loại "Hỗ trợ" -> Điểm = Tỷ lệ đóng góp (%) × % Đánh giá / 100
//   (vẫn nhân tỷ lệ — hỗ trợ càng nhiều mới được cộng càng nhiều).
// - Task "Thực hiện chính" (hoặc chưa phân loại) -> thẳng % Đánh giá của
//   task, KHÔNG nhân tỷ lệ đóng góp — tránh việc task nhiều người chia sẻ
//   tỷ lệ thấp bị kéo điểm xuống so với task 1 người làm trọn dù % Đánh giá
//   như nhau, không phản ánh đúng nỗ lực.
// Áp dụng thống nhất cho cả tong_diem (KPI theo Task/Ranking nhân sự ở
// Home) lẫn diem từng task (Điểm cá nhân (Tính theo task)/popup chi tiết ở
// bảng Nhân sự). Task chưa chấm điểm thì không cộng điểm (không phải 0 —
// vẫn tính vào "số task tham gia" để biết họ có tham gia, chỉ không có điểm).
export async function listKpiTheoTask(
  periodId: number,
  departmentId: number | null,
): Promise<KpiTheoTaskRow[]> {
  const query = db("task_members")
    .join("tasks", "task_members.task_id", "tasks.id")
    .join("members", "task_members.member_id", "members.id")
    .leftJoin("teams", "members.team_id", "teams.id")
    .where("tasks.period_id", periodId)
    .where("task_members.is_deleted", false)
    .where("tasks.is_deleted", false)
    .where("members.is_deleted", false);
  if (departmentId != null) query.where("tasks.department_id", departmentId);

  const rows = await query.select(
    "members.id as member_id",
    "members.name as member_name",
    "members.chuc_vu as member_chuc_vu",
    "teams.name as team_name",
    "tasks.id as task_id",
    "tasks.nhiem_vu as nhiem_vu",
    "tasks.team as task_team",
    "tasks.cpo_danh_gia as cpo_danh_gia",
    "task_members.phan_loai as phan_loai",
    "task_members.ty_le_dong_gop as ty_le_dong_gop",
    "task_members.diem_ca_nhan as diem_ca_nhan",
  );

  const byMember = new Map<number, KpiTheoTaskRow>();
  for (const r of rows as any[]) {
    const diemCaNhan = r.diem_ca_nhan !== null && r.diem_ca_nhan !== undefined ? Number(r.diem_ca_nhan) : null;
    const tyLeDongGop = r.ty_le_dong_gop !== null && r.ty_le_dong_gop !== undefined ? Number(r.ty_le_dong_gop) : null;
    const cpoDanhGia = r.cpo_danh_gia !== null && r.cpo_danh_gia !== undefined ? Number(r.cpo_danh_gia) : null;
    // diem_ca_nhan ghi đè luôn ưu tiên; không thì tùy phân loại — "Hỗ trợ"
    // nhân tỷ lệ đóng góp, "Thực hiện chính"/chưa phân loại thì không.
    const diem =
      diemCaNhan !== null
        ? diemCaNhan
        : r.phan_loai === HO_TRO_LABEL
          ? cpoDanhGia !== null && tyLeDongGop !== null
            ? Math.round(((cpoDanhGia * tyLeDongGop) / 100) * 100) / 100
            : null
          : cpoDanhGia;

    if (!byMember.has(r.member_id)) {
      byMember.set(r.member_id, {
        member_id: r.member_id,
        member_name: r.member_name,
        member_chuc_vu: r.member_chuc_vu,
        team_name: r.team_name,
        so_task: 0,
        tong_diem: 0,
        tasks: [],
      });
    }
    const entry = byMember.get(r.member_id)!;
    entry.so_task += 1;
    entry.tong_diem = Math.round((entry.tong_diem + (diem ?? 0)) * 100) / 100;
    entry.tasks.push({
      task_id: r.task_id,
      nhiem_vu: r.nhiem_vu,
      team: r.task_team,
      phan_loai: r.phan_loai,
      ty_le_dong_gop: tyLeDongGop,
      cpo_danh_gia: cpoDanhGia,
      diem,
    });
  }

  return Array.from(byMember.values()).sort((a, b) => b.tong_diem - a.tong_diem);
}
