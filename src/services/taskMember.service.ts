import { db } from "../db/database.js";
import type {
  CreateTaskMemberInput,
  KpiTheoTaskRow,
  TaskMemberWithName,
  UpdateTaskMemberInput,
} from "../types/backlog.js";

const SELECT_COLUMNS = [
  "task_members.id",
  "task_members.task_id",
  "task_members.member_id",
  "task_members.ty_le_dong_gop",
  "task_members.diem_ca_nhan",
  "task_members.phan_loai",
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
    .where({ task_id: taskId })
    .select(SELECT_COLUMNS)
    .orderBy("task_members.id", "asc");
  return rows as TaskMemberWithName[];
}

export async function getTaskMember(id: number): Promise<TaskMemberWithName | undefined> {
  const row = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ "task_members.id": id })
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
  const query = db("task_members").where({ task_id: taskId }).whereNotNull("ty_le_dong_gop");
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
): Promise<TaskMemberWithName> {
  if (input.ty_le_dong_gop != null) {
    await assertContributionWithinLimit(taskId, null, input.ty_le_dong_gop);
  }

  const existing = await db("task_members")
    .where({ task_id: taskId, member_id: input.member_id })
    .first();
  if (existing) {
    const update: Record<string, unknown> = { updated_at: db.fn.now() };
    if (input.ghi_chu !== undefined) update.ghi_chu = input.ghi_chu.trim() || null;
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
      ty_le_dong_gop: input.ty_le_dong_gop ?? null,
      diem_ca_nhan: input.diem_ca_nhan ?? null,
      phan_loai: normalizeNullableText(input.phan_loai, null),
      ghi_chu: input.ghi_chu?.trim() || null,
    })
    .returning("*");
  return (await getTaskMember(created.id)) as TaskMemberWithName;
}

export async function updateTaskMember(
  id: number,
  input: UpdateTaskMemberInput,
): Promise<TaskMemberWithName | undefined> {
  const existing = await getTaskMember(id);
  if (!existing) return undefined;

  if (input.ty_le_dong_gop !== undefined && input.ty_le_dong_gop !== null) {
    await assertContributionWithinLimit(existing.task_id, id, input.ty_le_dong_gop);
  }

  await db("task_members")
    .where({ id })
    .update({
      ty_le_dong_gop: input.ty_le_dong_gop !== undefined ? input.ty_le_dong_gop : existing.ty_le_dong_gop,
      diem_ca_nhan: input.diem_ca_nhan !== undefined ? input.diem_ca_nhan : existing.diem_ca_nhan,
      phan_loai: normalizeNullableText(input.phan_loai, existing.phan_loai),
      ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
      updated_at: db.fn.now(),
    });
  return getTaskMember(id);
}

export async function deleteTaskMember(id: number): Promise<boolean> {
  const count = await db("task_members").where({ id }).delete();
  return count > 0;
}

// KPI nhân sự tính trực tiếp theo task (dùng cho phòng ban có
// departments.cach_tinh_kpi = "theo_task", không chia theo team) — cộng dồn
// Điểm cá nhân của mỗi nhân sự từ mọi task họ tham gia trong 1 tháng
// backlog. Điểm từng task lấy ĐÚNG cách tính đã dùng ở dialog "Nhân sự tham
// gia": diem_ca_nhan nếu đã ghi đè tay, không thì tự tính = % Đánh giá của
// task (cpo_danh_gia) × Tỷ lệ đóng góp; task chưa chấm điểm hoặc chưa có tỷ
// lệ đóng góp thì task đó không cộng điểm (không phải 0 — vẫn tính vào
// "số task tham gia" để biết họ có tham gia, chỉ không có điểm).
export async function listKpiTheoTask(
  periodId: number,
  departmentId: number | null,
): Promise<KpiTheoTaskRow[]> {
  const query = db("task_members")
    .join("tasks", "task_members.task_id", "tasks.id")
    .join("members", "task_members.member_id", "members.id")
    .leftJoin("teams", "members.team_id", "teams.id")
    .where("tasks.period_id", periodId);
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
    const diem =
      diemCaNhan !== null
        ? diemCaNhan
        : cpoDanhGia !== null && tyLeDongGop !== null
          ? Math.round(((cpoDanhGia * tyLeDongGop) / 100) * 100) / 100
          : null;
    // "Điểm gốc" — diem_ca_nhan ghi đè (nếu có, đã là điểm riêng cho người
    // đó rồi) hoặc thẳng % Đánh giá của task, KHÔNG nhân tỷ lệ đóng góp.
    // Dùng riêng cho "Điểm cá nhân (Tính theo task)" ở bảng Nhân sự — tránh
    // vấn đề: task nhiều người chia tỷ lệ thấp thì "diem" (đã nhân tỷ lệ)
    // luôn thấp hơn hẳn task 1 người làm 100%, khiến ai tham gia nhiều task
    // chung với người khác bị kéo điểm trung bình xuống dù chất lượng công
    // việc (% Đánh giá) không hề thấp hơn. Trường "diem" ở trên giữ nguyên
    // (không đổi ý nghĩa) vì vẫn dùng cho tong_diem (KPI theo Task) ở nơi khác.
    const diemGoc = diemCaNhan !== null ? diemCaNhan : cpoDanhGia;

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
      diem_goc: diemGoc,
    });
  }

  return Array.from(byMember.values()).sort((a, b) => b.tong_diem - a.tong_diem);
}
