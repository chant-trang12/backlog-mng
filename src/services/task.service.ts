import { db } from "../db/database.js";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/backlog.js";
import { createPeriod, getPeriod } from "./period.service.js";
import { assertDepartmentInScope, isDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere, softDeleteWhereIn } from "./softDelete.util.js";

// Quy tắc 5.1 phương án A — lọc 1 danh sách id task về đúng những id nằm
// trong phạm vi của người gọi (bản ghi ngoài phạm vi bị BỎ QUA lặng lẽ, vì
// người dùng vốn không thấy nó trong danh sách để mà chọn — không phải lỗi
// người dùng cần biết, chỉ có ý nghĩa khi ai đó gọi thẳng API).
async function filterTaskIdsInScope(ids: number[], scope: DataScope): Promise<number[]> {
  if (scope.all || ids.length === 0) return ids;
  const rows = await db("tasks").whereIn("id", ids).where({ is_deleted: false }).select("id", "department_id");
  return rows.filter((r: any) => isDepartmentInScope(scope, r.department_id)).map((r: any) => Number(r.id));
}

const TINH_CHAT_TON = "Nhiệm vụ tồn";
const KHONG_TINH_DIEM = "Không tính điểm";

// ATTT Mass Assignment: giá trị Tính chất (Phân loại) là danh sách chọn từ
// danh mục (checkbox ở FE lấy từ bảng phan_loai_options), cộng thêm tag hệ
// thống "Nhiệm vụ tồn" do mark-ton gắn. Server phải từ chối giá trị ngoài
// danh mục (vd payload sửa tay "IDC_TEST" qua Burp) thay vì lưu liều.
export const TASK_TRANG_THAI = ["Chưa thực hiện", "Đang thực hiện", "Hoàn thành", "Hủy"] as const;

export async function validateTaskCatalogInput(input: {
  tinh_chat?: string | null;
  tag?: string | null;
  trang_thai?: string | null;
}): Promise<string | null> {
  if (input.trang_thai !== undefined && input.trang_thai !== null && input.trang_thai !== "") {
    if (!(TASK_TRANG_THAI as readonly string[]).includes(input.trang_thai)) {
      return `Trường 'trang_thai' phải là 1 trong: ${TASK_TRANG_THAI.join(", ")}`;
    }
  }
  if (typeof input.tag === "string" && input.tag.trim() !== "") {
    const tags = await db("tags").pluck("ten_tag");
    if (!tags.includes(input.tag.trim())) {
      return `Tag '${input.tag.trim()}' không có trong danh mục Tag`;
    }
  }
  if (typeof input.tinh_chat === "string" && input.tinh_chat.trim() !== "") {
    const items = input.tinh_chat
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (items.length > 0) {
      const allowed = new Set<string>([
        ...(await db("phan_loai_options").pluck("ten_phan_loai")),
        TINH_CHAT_TON,
      ]);
      const invalid = items.find((item) => !allowed.has(item));
      if (invalid) {
        return `Giá trị Phân loại '${invalid}' không có trong danh mục Phân loại`;
      }
    }
  }
  return null;
}

// Phạt điểm khi Hủy task theo % thời gian mục tiêu đã trôi qua (từ ngày 01
// của tháng backlog chứa task tới Deadline) — hủy càng sát hạn càng bị trừ
// nặng, để team không lạm dụng hủy task gần hết giờ. Trả về null nếu không
// đủ dữ liệu để tính (thiếu Deadline) — khi đó KHÔNG có cơ sở để phạt,
// giữ nguyên hành vi cũ (chỉ gắn "Không tính điểm").
function computeElapsedFraction(periodYear: number, periodMonth: number, deadline: string | null): number | null {
  if (!deadline) return null;
  const start = new Date(periodYear, periodMonth - 1, 1).getTime();
  const end = new Date(deadline).getTime();
  if (!Number.isFinite(end)) return null;
  const total = end - start;
  if (total <= 0) return Infinity; // Deadline <= đầu tháng -> coi như đã trôi hết, mức phạt nặng nhất
  return Math.max(0, (Date.now() - start) / total);
}

// Mức % Đánh giá tự chấm khi Hủy — CHỈ gọi khi fraction đã biết >= 0.25
// (nơi gọi tự lo nhánh < 0.25, không phạt điểm mà bắt task thay thế).
function cancelPenaltyTier(fraction: number): number {
  if (fraction >= 0.75) return 5;
  if (fraction >= 2 / 3) return 10;
  return 50;
}

// Giá trị Tính chất hệ thống tự gắn cho task được Roadmap năm tự động đưa
// vào backlog (xem roadmap.service.ts#syncRoadmapItemToBacklog) — cùng kiểu
// với "Nhiệm vụ tồn": không nằm trong danh mục Phân loại quản lý ở Cấu hình.
export const TINH_CHAT_NV_NAM = "NV năm";

async function nextStt(periodId: number): Promise<number> {
  const row = await db("tasks")
    .where({ period_id: periodId, is_deleted: false })
    .max({ max_stt: "stt" })
    .first();
  const max = Number(row?.max_stt ?? 0);
  return max + 1;
}

// Đánh lại STT liền mạch (1, 2, 3...) cho các task CHƯA XÓA của 1 tháng,
// giữ nguyên thứ tự tương đối hiện có — gọi sau khi xóa task (xóa mềm để
// lại "lỗ hổng" STT giữa các dòng còn lại, menu Nhiệm vụ cần STT luôn liên
// tục không hở để không gây nhầm lẫn khi xem/xuất Excel).
async function renumberTaskStt(periodId: number): Promise<void> {
  const remaining = await db("tasks")
    .where({ period_id: periodId, is_deleted: false })
    .orderBy("stt", "asc")
    .orderBy("id", "asc")
    .select("id", "stt");
  for (let i = 0; i < remaining.length; i++) {
    const newStt = i + 1;
    if (remaining[i].stt !== newStt) {
      await db("tasks").where({ id: remaining[i].id }).update({ stt: newStt });
    }
  }
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
}): Promise<(Task & { member_count: number; co_viec_xu_ly_gap: boolean })[]> {
  const query = db("tasks").where({ period_id: filter.period_id, is_deleted: false });
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
    .where({ is_deleted: false })
    .groupBy("task_id")
    .select("task_id")
    .count({ c: "*" });
  const countMap = new Map<number, number>(
    counts.map((r: any) => [Number(r.task_id), Number(r.c)]),
  );

  // Task có ít nhất 1 nhân sự đang bị đánh dấu "Việc cần xử lý gấp"
  // (task_members.can_xu_ly_gap) -> hiển thị nổi bật ở Danh sách nhiệm vụ
  // (tô nền hàng + chip cảnh báo riêng, xem renderTaskWarnings()/renderTasks()
  // ở FE) để không bị lướt qua, cùng tinh thần 3 cảnh báo có sẵn (chưa chấm
  // điểm/quá hạn/sắp đến hạn). Cùng 1 query count-theo-task_id, tránh N+1.
  const urgentTaskIdsRows = await db("task_members")
    .whereIn("task_id", rows.map((t) => t.id))
    .where({ is_deleted: false, can_xu_ly_gap: true })
    .groupBy("task_id")
    .select("task_id");
  const urgentTaskIds = new Set<number>(urgentTaskIdsRows.map((r: any) => Number(r.task_id)));

  return rows.map((t) => ({
    ...t,
    member_count: countMap.get(t.id) ?? 0,
    co_viec_xu_ly_gap: urgentTaskIds.has(t.id),
  }));
}

export async function getTask(id: number): Promise<Task | undefined> {
  const row = await db("tasks").where({ id, is_deleted: false }).first();
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
  let khongTinhDiem = merged.trang_thai === "Hủy" ? KHONG_TINH_DIEM : existing.khong_tinh_diem;
  let thayTheTaskId = existing.thay_the_task_id;
  let autoPenaltyGraded = false;

  // Phạt điểm khi Hủy — chỉ xử lý ở LẦN ĐẦU chuyển vào trạng thái Hủy, để
  // không ghi đè điểm đã tự chấm/CPO đã sửa khi lưu lại tiến độ về sau lúc
  // vẫn đang "Hủy" (xem computeElapsedFraction/cancelPenaltyTier ở trên).
  if (existing.trang_thai !== "Hủy" && merged.trang_thai === "Hủy") {
    const period = await getPeriod(existing.period_id);
    const fraction = period ? computeElapsedFraction(period.year, period.month, merged.deadline) : null;
    if (fraction !== null) {
      if (fraction < 0.25) {
        const replacement = input.replacement_task;
        if (!replacement || !replacement.nhiem_vu?.trim()) {
          throw new Error(
            "Hủy task khi chưa trôi qua 1/4 thời gian mục tiêu cần khai báo ngay 1 Nhiệm vụ thay thế.",
          );
        }
        // KHÔNG còn nhét ghi chú vào DoD (DoD của task thay thế phải là nội
        // dung THẬT, sửa/xóa tự do bình thường) — liên kết ngược lưu riêng
        // ở cột thay_cho_task_id, FE tự tra task gốc (cùng period) để hiển
        // thị TÁCH BIỆT khỏi DoD, kiểu "lịch sử"/badge thông tin, không lẫn
        // vào nội dung tự nhập.
        const createdReplacement = await createTask(existing.period_id, replacement, scope);
        await db("tasks").where({ id: createdReplacement.id }).update({ thay_cho_task_id: existing.id });
        thayTheTaskId = createdReplacement.id;
        // khongTinhDiem giữ nguyên "Không tính điểm" (đã gán ở trên) — hủy
        // sớm không bị phạt điểm, đổi lại là bắt buộc task thay thế.
      } else {
        // Hủy từ 1/4 thời gian trở đi PHẢI tính vào điểm (đó là hình phạt)
        // — không gắn "Không tính điểm" nữa.
        khongTinhDiem = existing.khong_tinh_diem;
        if (input.cpo_danh_gia === undefined) {
          merged.cpo_danh_gia = cancelPenaltyTier(fraction);
          // KHÔNG còn tự ghi vào Nội dung đánh giá — CPO phải gõ tự do,
          // không bị khóa/chiếm chỗ bởi ghi chú hệ thống. "Ngày hủy/ai hủy"
          // đã có sẵn qua cpo_graded_at/cpo_graded_by (đóng dấu bên dưới,
          // isGrading=true vì autoPenaltyGraded), FE tự suy lại % đã trôi
          // qua từ cpo_graded_at để hiển thị TÁCH BIỆT (xem 04-tasks.js).
          autoPenaltyGraded = true;
        }
      }
    }
    // fraction === null (thiếu Deadline/period) -> giữ nguyên hành vi cũ,
    // không phạt, không chặn (không đủ dữ liệu để có cơ sở phạt).
  }

  // Có chấm điểm trong lần cập nhật này -> đóng dấu thời điểm + người chấm.
  // autoPenaltyGraded: tự chấm điểm phạt khi Hủy (xem ở trên) cũng tính là
  // 1 lần chấm, dù input không trực tiếp gửi cpo_danh_gia.
  const isGrading = input.cpo_danh_gia !== undefined || input.cpo_comment !== undefined || autoPenaltyGraded;
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
      thay_the_task_id: thayTheTaskId,
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
  // Cascade xuống task_members — TRƯỚC ĐÂY dựa hẳn vào DB CASCADE
  // (task_members.task_id ON DELETE CASCADE), không còn tự chạy khi đổi
  // sang xóa mềm (không phải lệnh DELETE thật nữa) nên phải tự gỡ ở đây.
  await softDeleteWhere(db, "task_members", { task_id: id });
  const count = await softDeleteWhere(db, "tasks", { id });
  if (count > 0) await renumberTaskStt(existing.period_id);
  return count > 0;
}

// Xóa nhiều task theo danh sách id đã chọn (checkbox trên bảng Danh sách nhiệm vụ).
export async function deleteTasks(ids: number[], scope: DataScope): Promise<number> {
  const scopedIds = await filterTaskIdsInScope(ids, scope);
  if (scopedIds.length === 0) return 0;
  // Ghi lại các tháng bị ảnh hưởng TRƯỚC khi xóa — ids có thể thuộc nhiều
  // tháng khác nhau (chọn qua nhiều trang/bộ lọc), mỗi tháng cần đánh lại
  // STT riêng.
  const affectedPeriods = await db("tasks")
    .whereIn("id", scopedIds)
    .distinct("period_id")
    .pluck("period_id");
  await db("feature_requests").whereIn("linked_task_id", scopedIds).update({ linked_task_id: null });
  await softDeleteWhereIn(db, "task_members", "task_id", scopedIds);
  const count = await softDeleteWhereIn(db, "tasks", "id", scopedIds);
  for (const periodId of affectedPeriods) {
    await renumberTaskStt(periodId);
  }
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

// Task CHƯA CÓ Deadline (hoặc Deadline không đọc được) thì KHÔNG có căn cứ
// gì để nói nó "đã quá hạn" — trả về false (không đánh dấu Nhiệm vụ tồn).
// BUG đã gặp thực tế: bản cũ trả về true cho cả 2 trường hợp này, khiến MỌI
// task chưa nhập Deadline đều tự động bị gắn "Nhiệm vụ tồn" khi chuyển
// tháng dù chưa hề quá hạn gì.
function isDeadlineBeforeTarget(deadline: string | null, targetYear: number, targetMonth: number): boolean {
  if (!deadline || deadline.length < 7) return false;
  const year = Number(deadline.slice(0, 4));
  const month = Number(deadline.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return false;
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
      // Chỉ thật sự chặn khi bản sao đã tạo ra lần trước VẪN CÒN (chưa bị
      // xóa) — nếu bản sao đó đã bị xóa (kể cả xóa mềm — getTask() đã lọc
      // is_deleted=false), hoặc dữ liệu cũ từ trước khi có cột
      // moved_to_task_id (null), thì KHÔNG còn nguy cơ tạo trùng nữa, cho
      // chuyển lại bình thường thay vì kẹt cứng mãi mãi.
      const existingClone = task.moved_to_task_id ? await getTask(task.moved_to_task_id) : undefined;
      if (existingClone) {
        skippedAlreadyMoved.push(task);
        continue;
      }
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

    // Lịch sử Tiến độ — cùng cơ chế với lịch sử đánh giá ở trên: nếu tháng
    // nguồn có ghi Tiến độ thì snapshot vào lịch sử rồi reset về rỗng cho
    // tháng mới (ô Tiến độ luôn là ghi chú của THÁNG ĐANG XEM).
    const tienDoHistory: unknown[] = task.tien_do_history ? JSON.parse(task.tien_do_history) : [];
    if (task.tien_do && task.tien_do.trim()) {
      tienDoHistory.push({ period_label: fromPeriod.label, tien_do: task.tien_do });
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
        // Reset Tiến độ cho tháng mới (nội dung cũ đã snapshot vào
        // tien_do_history ở trên) — giống cách cpo_comment reset bên dưới.
        tien_do: null,
        tien_do_history: tienDoHistory.length ? JSON.stringify(tienDoHistory) : null,
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

    await db("tasks")
      .where({ id: task.id })
      .update({ da_chuyen_thang: 1, moved_to_task_id: clone.id, updated_at: db.fn.now() });
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
