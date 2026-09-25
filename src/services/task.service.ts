import { db } from "../db/database.js";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/backlog.js";
import { createPeriod, getPeriod } from "./period.service.js";
import { assertDepartmentInScope, isDepartmentInScope, type DataScope } from "./scope.util.js";

// Quy tắc 5.1 phương án A — lọc 1 danh sách id task về đúng những id nằm
// trong phạm vi của người gọi (bản ghi ngoài phạm vi bị BỎ QUA lặng lẽ, vì
// người dùng vốn không thấy nó trong danh sách để mà chọn — không phải lỗi
// người dùng cần biết, chỉ có ý nghĩa khi ai đó gọi thẳng API).
async function filterTaskIdsInScope(ids: number[], scope: DataScope): Promise<number[]> {
  if (scope.all || ids.length === 0) return ids;
  const rows = await db("tasks").whereIn("id", ids).select("id", "department_id");
  return rows.filter((r: any) => isDepartmentInScope(scope, r.department_id)).map((r: any) => Number(r.id));
}

const TINH_CHAT_TON = "Nhiệm vụ tồn";
const KHONG_TINH_DIEM = "Không tính điểm";

// Giá trị Tính chất hệ thống tự gắn cho task được Roadmap năm tự động đưa
// vào backlog (xem roadmap.service.ts#syncRoadmapItemToBacklog) — cùng kiểu
// với "Nhiệm vụ tồn": không nằm trong danh mục Phân loại quản lý ở Cấu hình.
export const TINH_CHAT_NV_NAM = "NV năm";

async function nextStt(periodId: number): Promise<number> {
  const row = await db("tasks")
    .where({ period_id: periodId })
    .max({ max_stt: "stt" })
    .first();
  const max = Number(row?.max_stt ?? 0);
  return max + 1;
}

// 1.3 Nhập mới task cho một team trong một tháng (period) — STT tự tăng theo
// thứ tự nhập trong từng period, dùng làm cột STT khi xuất Excel.
export async function createTask(periodId: number, input: CreateTaskInput, scope: DataScope): Promise<Task> {
  assertDepartmentInScope(scope, input.department_id ?? null);
  const stt = await nextStt(periodId);
  const trangThai = input.trang_thai ?? "Chưa thực hiện";
  // Trạng thái Hủy mặc định đánh dấu Không tính điểm ở cột Tính chất.
  const khongTinhDiem = trangThai === "Hủy" ? KHONG_TINH_DIEM : null;

  const [created] = await db("tasks")
    .insert({
      period_id: periodId,
      department_id: input.department_id ?? null,
      stt,
      tinh_chat: input.tinh_chat ?? null,
      tag: input.tag ?? null,
      team: input.team,
      nhiem_vu: input.nhiem_vu,
      dod: input.dod ?? null,
      ngay_thuc_hien: input.ngay_thuc_hien ?? null,
      deadline: input.deadline ?? null,
      nvtt: input.nvtt ?? null,
      dau_moi_phoi_hop: input.dau_moi_phoi_hop ?? null,
      phan_tram_hoan_thanh: input.phan_tram_hoan_thanh ?? 0,
      trang_thai: trangThai,
      tien_do: input.tien_do ?? null,
      cpo_danh_gia: input.cpo_danh_gia ?? null,
      cpo_comment: input.cpo_comment ?? null,
      khong_tinh_diem: khongTinhDiem,
    })
    .returning("*");

  return created as Task;
}

export async function listTasks(filter: {
  period_id: number;
  team?: string;
  department_id?: number | null;
}): Promise<(Task & { member_count: number })[]> {
  const query = db("tasks").where({ period_id: filter.period_id });
  if (filter.team) {
    query.where({ team: filter.team });
  }
  if (filter.department_id != null) {
    query.where({ department_id: filter.department_id });
  }
  const rows = (await query.orderBy("stt", "asc")) as Task[];
  if (rows.length === 0) return [];

  // Đếm số nhân sự tham gia mỗi task (gộp theo task_id) — 1 query duy nhất
  // thay vì N+1, gắn vào từng dòng ở phía JS thay vì subquery tương quan để
  // an toàn cho cả 2 engine (SQLite/MSSQL) đang hỗ trợ.
  const counts = await db("task_members")
    .whereIn("task_id", rows.map((t) => t.id))
    .groupBy("task_id")
    .select("task_id")
    .count({ c: "*" });
  const countMap = new Map<number, number>(
    counts.map((r: any) => [Number(r.task_id), Number(r.c)]),
  );
  return rows.map((t) => ({ ...t, member_count: countMap.get(t.id) ?? 0 }));
}

export async function getTask(id: number): Promise<Task | undefined> {
  const row = await db("tasks").where({ id }).first();
  return row as Task | undefined;
}

// 1.4 Cập nhật task — dùng chung cho sửa nội dung lẫn cập nhật tiến độ định kỳ
// (chỉ gửi các trường thay đổi, các trường còn lại giữ nguyên). graderName:
// tên người đang đăng nhập (SNAPSHOT tại thời điểm chấm — không JOIN sang
// users, xem migrations/tasks.ts) — null khi SSO tắt (không có khái niệm
// "người đăng nhập") hoặc request này không phải 1 lần chấm điểm.
export async function updateTask(
  id: number,
  input: UpdateTaskInput,
  scope: DataScope,
  graderName: string | null = null,
): Promise<Task | undefined> {
  const existing = await getTask(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, existing.department_id);

  const merged = { ...existing, ...input };
  // Trạng thái Hủy mặc định đánh dấu Không tính điểm ở cột Tính chất; các
  // trạng thái khác giữ nguyên giá trị Không tính điểm đã có (nếu có).
  const khongTinhDiem = merged.trang_thai === "Hủy" ? KHONG_TINH_DIEM : existing.khong_tinh_diem;

  // Có chấm điểm trong lần cập nhật này -> đóng dấu thời điểm + người chấm.
  const isGrading = input.cpo_danh_gia !== undefined || input.cpo_comment !== undefined;
  const cpoGradedAt = isGrading ? localTimestamp() : existing.cpo_graded_at;
  const cpoGradedBy = isGrading ? graderName : existing.cpo_graded_by;

  const [updated] = await db("tasks")
    .where({ id })
    .update({
      tinh_chat: merged.tinh_chat,
      tag: merged.tag,
      team: merged.team,
      nhiem_vu: merged.nhiem_vu,
      dod: merged.dod,
      ngay_thuc_hien: merged.ngay_thuc_hien,
      deadline: merged.deadline,
      nvtt: merged.nvtt,
      dau_moi_phoi_hop: merged.dau_moi_phoi_hop,
      phan_tram_hoan_thanh: merged.phan_tram_hoan_thanh,
      trang_thai: merged.trang_thai,
      tien_do: merged.tien_do,
      cpo_danh_gia: merged.cpo_danh_gia,
      cpo_comment: merged.cpo_comment,
      cpo_graded_at: cpoGradedAt,
      cpo_graded_by: cpoGradedBy,
      khong_tinh_diem: khongTinhDiem,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as Task;
}

// Chuỗi thời gian local "YYYY-MM-DD HH:MM:SS" — dùng cho cpo_graded_at, FE
// hiển thị lại dạng dd/mm/yyyy HH:MM:SS.
function localTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function deleteTask(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getTask(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, existing.department_id);
  // Gỡ liên kết thủ công (FK feature_requests.linked_task_id dùng NO ACTION
  // để tương thích MSSQL — xem migrations/featureRequests.ts).
  await db("feature_requests").where({ linked_task_id: id }).update({ linked_task_id: null });
  const count = await db("tasks").where({ id }).delete();
  return count > 0;
}

// Xóa nhiều task theo danh sách id đã chọn (checkbox trên bảng Danh sách nhiệm vụ).
export async function deleteTasks(ids: number[], scope: DataScope): Promise<number> {
  const scopedIds = await filterTaskIdsInScope(ids, scope);
  if (scopedIds.length === 0) return 0;
  await db("feature_requests").whereIn("linked_task_id", scopedIds).update({ linked_task_id: null });
  const count = await db("tasks").whereIn("id", scopedIds).delete();
  return Number(count);
}

// Thêm 1 giá trị (tag hệ thống như "Nhiệm vụ tồn", hoặc giá trị danh mục
// Phân loại) vào cột Tính chất — giữ nguyên các giá trị đã có, không thêm
// trùng. Tính chất là danh sách các giá trị nối bằng ", " (xem
// renderTinhChatBadges ở app.js).
export function addTinhChatTag(tinhChat: string | null | undefined, tag: string): string {
  const items = (tinhChat ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!items.includes(tag)) items.push(tag);
  return items.join(", ");
}

function addTinhChatTon(tinhChat: string | null): string {
  return addTinhChatTag(tinhChat, TINH_CHAT_TON);
}

// Bỏ 1 giá trị khỏi cột Tính chất (ngược lại addTinhChatTag) — giữ nguyên
// thứ tự/các giá trị còn lại, trả về null nếu không còn giá trị nào (thay
// vì chuỗi rỗng, khớp kiểu tasks.tinh_chat là text nullable).
function removeTinhChatTag(tinhChat: string | null | undefined, tag: string): string | null {
  const items = (tinhChat ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v && v !== tag);
  return items.length > 0 ? items.join(", ") : null;
}

function removeTinhChatTon(tinhChat: string | null): string | null {
  return removeTinhChatTag(tinhChat, TINH_CHAT_TON);
}

function isDeadlineBeforeTarget(deadline: string | null, targetYear: number, targetMonth: number): boolean {
  if (!deadline || deadline.length < 7) return true;
  const year = Number(deadline.slice(0, 4));
  const month = Number(deadline.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return true;
  return year < targetYear || (year === targetYear && month < targetMonth);
}

export async function moveTasksToNextMonth(
  fromPeriodId: number,
  taskIds: number[],
  scope: DataScope,
): Promise<{ targetPeriod: Awaited<ReturnType<typeof createPeriod>>; moved: Task[]; skippedAlreadyMoved: Task[] } | undefined> {
  const fromPeriod = await getPeriod(fromPeriodId);
  if (!fromPeriod) return undefined;
  taskIds = await filterTaskIdsInScope(taskIds, scope);

  let nextYear = fromPeriod.year;
  let nextMonth = fromPeriod.month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const targetPeriod = await createPeriod({ year: nextYear, month: nextMonth });

  const moved: Task[] = [];
  const skippedAlreadyMoved: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(id);
    if (!task || task.period_id !== fromPeriodId) continue;
    if (task.da_chuyen_thang) {
      skippedAlreadyMoved.push(task);
      continue;
    }
    const stt = await nextStt(targetPeriod.id);
    const isTon = isDeadlineBeforeTarget(task.deadline, targetPeriod.year, targetPeriod.month);
    const tinhChat = isTon ? addTinhChatTon(task.tinh_chat) : task.tinh_chat;
    const khongTinhDiem = isTon ? KHONG_TINH_DIEM : task.khong_tinh_diem;

    // Lịch sử đánh giá: nối tiếp lịch sử tháng nguồn + (nếu tháng nguồn có
    // chấm) 1 entry cho tháng nguồn.
    const history: unknown[] = task.grading_history ? JSON.parse(task.grading_history) : [];
    if (task.cpo_danh_gia !== null || (task.cpo_comment && task.cpo_comment.trim())) {
      history.push({
        period_label: fromPeriod.label,
        cpo_danh_gia: task.cpo_danh_gia,
        cpo_comment: task.cpo_comment,
        graded_at: task.cpo_graded_at,
        graded_by: task.cpo_graded_by,
      });
    }

    const [clone] = await db("tasks")
      .insert({
        period_id: targetPeriod.id,
        department_id: task.department_id ?? null,
        stt,
        tinh_chat: tinhChat,
        tag: task.tag,
        team: task.team,
        nhiem_vu: task.nhiem_vu,
        dod: task.dod,
        ngay_thuc_hien: task.ngay_thuc_hien,
        deadline: task.deadline,
        nvtt: task.nvtt,
        dau_moi_phoi_hop: task.dau_moi_phoi_hop,
        phan_tram_hoan_thanh: task.phan_tram_hoan_thanh,
        trang_thai: task.trang_thai,
        tien_do: task.tien_do,
        // Reset đánh giá cho tháng mới; giữ snapshot LẦN ĐÁNH GIÁ GẦN NHẤT —
        // nếu tháng nguồn chưa chấm lại (kéo qua nhiều tháng) thì lấy tiếp
        // snapshot mà tháng nguồn đang mang.
        cpo_danh_gia: null,
        cpo_comment: null,
        cpo_graded_at: null,
        cpo_graded_by: null,
        prev_cpo_danh_gia: task.cpo_danh_gia ?? task.prev_cpo_danh_gia,
        prev_cpo_comment: task.cpo_comment ?? task.prev_cpo_comment,
        prev_cpo_graded_at: task.cpo_graded_at ?? task.prev_cpo_graded_at,
        prev_cpo_graded_by: task.cpo_graded_by ?? task.prev_cpo_graded_by,
        grading_history: history.length ? JSON.stringify(history) : null,
        khong_tinh_diem: khongTinhDiem,
      })
      .returning("*");

    await db("tasks").where({ id: task.id }).update({ da_chuyen_thang: 1, updated_at: db.fn.now() });
    moved.push(clone as Task);
  }

  return { targetPeriod, moved, skippedAlreadyMoved };
}

export async function markTasksNoScore(taskIds: number[], scope: DataScope): Promise<Task[]> {
  taskIds = await filterTaskIdsInScope(taskIds, scope);
  if (taskIds.length === 0) return [];
  const updated = await db("tasks")
    .whereIn("id", taskIds)
    .update({ khong_tinh_diem: KHONG_TINH_DIEM, updated_at: db.fn.now() })
    .returning("*");
  return updated as Task[];
}

// Bỏ đánh dấu "Không tính điểm" cho các task đã chọn — xóa giá trị ở cột
// Tính chất, không đụng tới "Nhiệm vụ tồn" hay trạng thái. Lưu ý: nếu task
// đang ở trạng thái Hủy, lần cập nhật task sau đó sẽ tự gắn lại.
export async function unmarkTasksNoScore(taskIds: number[], scope: DataScope): Promise<Task[]> {
  taskIds = await filterTaskIdsInScope(taskIds, scope);
  if (taskIds.length === 0) return [];
  const updated = await db("tasks")
    .whereIn("id", taskIds)
    .update({ khong_tinh_diem: null, updated_at: db.fn.now() })
    .returning("*");
  return updated as Task[];
}

// Đánh dấu "Nhiệm vụ tồn" cho các task đã chọn (không chuyển tháng): thêm
// "Nhiệm vụ tồn" vào cột Tính chất và đồng thời đánh dấu Không tính điểm.
export async function markTasksTon(taskIds: number[], scope: DataScope): Promise<Task[]> {
  taskIds = await filterTaskIdsInScope(taskIds, scope);
  if (taskIds.length === 0) return [];
  const updated: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(id);
    if (!task) continue;
    const [row] = await db("tasks")
      .where({ id })
      .update({
        tinh_chat: addTinhChatTon(task.tinh_chat),
        khong_tinh_diem: KHONG_TINH_DIEM,
        updated_at: db.fn.now(),
      })
      .returning("*");
    updated.push(row as Task);
  }
  return updated;
}

// Bỏ đánh dấu "Nhiệm vụ tồn" cho các task đã chọn — ngược lại markTasksTon:
// bỏ "Nhiệm vụ tồn" khỏi cột Tính chất và bỏ luôn Không tính điểm (đúng 2
// việc mà markTasksTon đã làm, không đụng gì khác — task Hủy tự set lại
// Không tính điểm ở lần cập nhật trạng thái sau, xem updateTask()).
export async function unmarkTasksTon(taskIds: number[]): Promise<Task[]> {
  if (taskIds.length === 0) return [];
  const updated: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(id);
    if (!task) continue;
    const [row] = await db("tasks")
      .where({ id })
      .update({
        tinh_chat: removeTinhChatTon(task.tinh_chat),
        khong_tinh_diem: null,
        updated_at: db.fn.now(),
      })
      .returning("*");
    updated.push(row as Task);
  }
  return updated;
}
