import { db } from "../db/database.js";
import type {
  CreateRoadmapDetailInput,
  CreateRoadmapItemInput,
  RoadmapDetail,
  RoadmapItem,
  UpdateRoadmapDetailInput,
  UpdateRoadmapItemInput,
} from "../types/backlog.js";
import { getPeriodByYearMonth } from "./period.service.js";
import { addTinhChatTag, createTask, TINH_CHAT_NV_NAM } from "./task.service.js";
import { assertDepartmentInScope, isDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere, softDeleteWhereIn } from "./softDelete.util.js";

const FIELDS = [
  "team",
  "he_thong",
  "muc_tieu",
  "nhiem_vu",
  "dod",
  "dieu_kien_dam_bao",
  "phan_loai",
  "thoi_gian_bat_dau",
  "thoi_gian_ket_thuc",
  "trang_thai",
  "ghi_chu",
] as const;

function normalize(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    const v = input[f];
    out[f] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out;
}

export async function listRoadmapItems(filter: {
  year: number;
  department_id?: number | null;
}): Promise<RoadmapItem[]> {
  const query = db("roadmap_items").where({ year: filter.year, is_deleted: false });
  if (filter.department_id != null) query.where({ department_id: filter.department_id });
  const rows = (await query.orderBy("thoi_gian_ket_thuc", "asc").orderBy("id", "asc")) as RoadmapItem[];

  // Gắn synced_months — danh sách tháng đã được TỰ ĐỘNG đưa vào backlog
  // (badge cột Trạng thái ở FE): từ các chi tiết đã sync (task còn sống) và
  // tháng bắt đầu nếu dòng được sync kiểu cũ. Tháng có task đã bị xóa mềm
  // thì không tính — badge phản ánh tình trạng THỰC TẾ.
  const ids = rows.map((r) => r.id);
  const synced = ids.length
    ? await db("roadmap_details as d")
        .join("tasks as t", "t.id", "d.synced_task_id")
        .whereIn("d.roadmap_item_id", ids)
        .where({ "d.is_deleted": false, "t.is_deleted": false })
        .whereNotNull("d.synced_task_id")
        .select("d.roadmap_item_id", "d.month")
    : [];
  const monthsByItem = new Map<number, number[]>();
  for (const s of synced) {
    const itemId = Number(s.roadmap_item_id);
    const months = monthsByItem.get(itemId) ?? [];
    months.push(Number(s.month));
    monthsByItem.set(itemId, months);
  }
  return rows.map((r) => {
    const months = monthsByItem.get(r.id) ?? [];
    if (months.length === 0 && r.synced_task_id && r.thoi_gian_bat_dau) {
      // Sync kiểu cũ (không có chi tiết) — task ở đúng tháng bắt đầu.
      const m = /^(\d{4})-(\d{2})/.exec(r.thoi_gian_bat_dau);
      if (m) months.push(Number(m[2]));
    }
    return { ...r, synced_months: months.sort((a, b) => a - b) };
  });
}

export async function getRoadmapItem(id: number): Promise<RoadmapItem | undefined> {
  const row = await db("roadmap_items").where({ id, is_deleted: false }).first();
  return row as RoadmapItem | undefined;
}

export async function createRoadmapItem(input: CreateRoadmapItemInput, scope: DataScope): Promise<RoadmapItem> {
  assertDepartmentInScope(scope, input.department_id ?? null);
  const [created] = await db("roadmap_items")
    .insert({
      department_id: input.department_id ?? null,
      year: input.year,
      nhiem_vu: input.nhiem_vu,
      trang_thai: input.trang_thai ?? "Chưa thực hiện",
      ...normalize(input as unknown as Record<string, unknown>),
    })
    .returning("*");
  // Logic mới: task được sinh từ CHI TIẾT công việc theo tháng (mỗi dòng
  // chi tiết = 1 task ở tháng đó) — lúc tạo/sửa dòng thường chưa có chi
  // tiết nên chưa đưa gì; khi thêm chi tiết sẽ tự đưa (createRoadmapDetail).
  return syncRoadmapItemDetailsToBacklog(created as RoadmapItem);
}

export async function updateRoadmapItem(
  id: number,
  input: UpdateRoadmapItemInput,
  scope: DataScope,
): Promise<RoadmapItem | undefined> {
  const existing = await getRoadmapItem(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, existing.department_id);
  const [updated] = await db("roadmap_items")
    .where({ id })
    .update({
      ...normalize(input as unknown as Record<string, unknown>),
      ...(input.year !== undefined ? { year: input.year } : {}),
      updated_at: db.fn.now(),
    })
    .returning("*");
  return syncRoadmapItemDetailsToBacklog(updated as RoadmapItem);
}

// Phạm vi tháng của 1 dòng roadmap (tháng Bắt đầu -> tháng Kết thúc) —
// khớp cách tính của FE (07-roadmap.js#roadmapMonths): thiếu ngày nào thì
// lấy biên (bắt đầu = 1, kết thúc = 12), giới hạn trong năm roadmap.
function roadmapMonthRange(item: RoadmapItem): [number, number] {
  const monthOf = (d: string | null | undefined, fallback: number): number => {
    if (!d || d.length < 7) return fallback;
    if (Number(d.slice(0, 4)) < item.year) return 1;
    if (Number(d.slice(0, 4)) > item.year) return 12;
    return Number(d.slice(5, 7)) || fallback;
  };
  let a = monthOf(item.thoi_gian_bat_dau, 1);
  let b = monthOf(item.thoi_gian_ket_thuc, 12);
  if (a > b) [a, b] = [b, a];
  return [Math.max(1, a), Math.min(12, b)];
}

// Tạo task trong backlog từ 1 dòng roadmap — dùng chung cho cả 2 logic sync
// (theo chi tiết tháng và fallback theo tháng bắt đầu). Thông tin như cũ:
// Team, Nhiệm vụ, Phân loại (map vào cột Tính chất, gắn thêm "NV năm"),
// Deadline = ngày kết thúc roadmap; riêng DOD truyền vào theo từng trường
// hợp (Nội dung công việc của tháng hoặc DOD của dòng). Task kế thừa
// department_id của dòng roadmap (đã kiểm tra phạm vi lúc tạo/sửa) — không
// áp lại quy tắc 9.2 ở đây, tự động hoá hệ thống không bị chặn theo phạm vi
// của ai.
async function pushRoadmapTaskToPeriod(item: RoadmapItem, periodId: number, dod: string | null): Promise<number> {
  const task = await createTask(
    periodId,
    {
      department_id: item.department_id ?? undefined,
      team: item.team,
      nhiem_vu: item.nhiem_vu,
      dod: dod ?? undefined,
      tinh_chat: addTinhChatTag(item.phan_loai ?? null, TINH_CHAT_NV_NAM),
      deadline: item.thoi_gian_ket_thuc ?? undefined,
    },
    { all: true, departmentId: null },
  );
  return task.id;
}

// Đưa 1 dòng chi tiết theo tháng vào backlog (nếu đủ điều kiện): tháng nằm
// trong phạm vi Bắt đầu -> Kết thúc và tháng đó đã được quản lý trong
// Backlog. Riêng dòng roadmap đã được đưa kiểu cũ (1 task ở tháng bắt đầu —
// VD từ import): nếu chi tiết rơi đúng THÁNG của task cũ thì cập nhật DOD
// task theo Nội dung công việc và gắn liên kết thay vì tạo trùng.
async function syncOneRoadmapDetail(item: RoadmapItem, detail: RoadmapDetail): Promise<RoadmapDetail> {
  if (detail.synced_task_id) return detail;
  const [a, b] = roadmapMonthRange(item);
  if (detail.month < a || detail.month > b) return detail;
  const period = await getPeriodByYearMonth(item.year, detail.month);
  if (!period) return detail;

  if (item.synced_task_id) {
    const legacyTask = await db("tasks").where({ id: item.synced_task_id }).first("period_id");
    if (legacyTask && Number(legacyTask.period_id) === period.id) {
      await db("tasks").where({ id: item.synced_task_id }).update({ dod: detail.noi_dung });
      const [adopted] = await db("roadmap_details")
        .where({ id: detail.id })
        .update({ synced_task_id: item.synced_task_id })
        .returning("*");
      return adopted as RoadmapDetail;
    }
  }

  const taskId = await pushRoadmapTaskToPeriod(item, period.id, detail.noi_dung);
  const [updated] = await db("roadmap_details")
    .where({ id: detail.id })
    .update({ synced_task_id: taskId })
    .returning("*");
  return updated as RoadmapDetail;
}

// Sync theo CHI TIẾT công việc theo tháng (logic mới): mỗi dòng chi tiết
// (trong phạm vi tháng Bắt đầu -> Kết thúc) = 1 task ở tháng tương ứng,
// cột DOD lấy từ Nội dung công việc của chính tháng đó. Từng dòng chi tiết
// chỉ đưa đúng 1 lần (đánh dấu qua roadmap_details.synced_task_id).
// Dùng khi tạo/sửa dòng roadmap và khi thêm/sửa 1 dòng chi tiết.
async function syncRoadmapItemDetailsToBacklog(item: RoadmapItem): Promise<RoadmapItem> {
  if (!item.thoi_gian_bat_dau) return item;
  const details = await db("roadmap_details")
    .where({ roadmap_item_id: item.id, is_deleted: false })
    .whereNull("synced_task_id")
    .orderBy("month", "asc")
    .orderBy("id", "asc");
  for (const detail of details as RoadmapDetail[]) {
    await syncOneRoadmapDetail(item, detail);
  }
  return item;
}

// Sync đầy đủ — dùng khi 1 THÁNG mới được thêm vào Backlog
// (syncRoadmapItemsForPeriod) và khi import roadmap:// - Có chi tiết (chưa sync) -> đưa theo từng chi tiết (logic mới).
// - Không có chi tiết nào -> fallback logic cũ: đưa 1 task vào đúng tháng
//   của ngày bắt đầu (DOD = cột DOD của dòng), đánh dấu qua
//   roadmap_items.synced_task_id — dòng import không bao giờ có chi tiết
//   nên vẫn được đưa vào backlog như trước.
export async function syncRoadmapItemToBacklog(item: RoadmapItem): Promise<RoadmapItem> {
  if (!item.thoi_gian_bat_dau) return item;
  const details = await db("roadmap_details")
    .where({ roadmap_item_id: item.id, is_deleted: false })
    .whereNull("synced_task_id")
    .orderBy("month", "asc")
    .orderBy("id", "asc");
  if (details.length > 0) {
    for (const detail of details as RoadmapDetail[]) {
      await syncOneRoadmapDetail(item, detail);
    }
    return item;
  }
  // Có chi tiết (hết sync) hay chưa — miễn là CÓ chi tiết thì chi tiết là
  // nguồn sự thật, không fallback legacy nữa (tránh tạo task "nhiệm vụ to"
  // trùng lặp).
  const anyDetail = await db("roadmap_details")
    .where({ roadmap_item_id: item.id, is_deleted: false })
    .first("id");
  if (anyDetail || item.synced_task_id) return item;

  // Logic cũ (fallback cho dòng không có chi tiết theo tháng — VD nhập từ
  // Excel): task vào đúng tháng của ngày bắt đầu.
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(item.thoi_gian_bat_dau);
  if (!m) return item;
  const period = await getPeriodByYearMonth(Number(m[1]), Number(m[2]));
  if (!period) return item;

  // Task tự đưa vào luôn được gắn thêm "NV năm" ở Tính chất (giữ nguyên giá
  // trị Phân loại gốc của roadmap nếu có) để phân biệt với task nhập tay.
  const taskId = await pushRoadmapTaskToPeriod(item, period.id, item.dod);
  const [updated] = await db("roadmap_items")
    .where({ id: item.id })
    .update({ synced_task_id: taskId })
    .returning("*");
  return updated as RoadmapItem;
}

// Quét các dòng roadmap chưa đưa vào backlog sau khi 1 tháng được thêm vào
// Backlog: (1) dòng không chi tiết có ngày bắt đầu rơi vào tháng này
// (logic cũ), (2) dòng có chi tiết chưa sync ở tháng này (logic mới).
export async function syncRoadmapItemsForPeriod(year: number, month: number): Promise<void> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const items = await db("roadmap_items")
    .whereNull("synced_task_id")
    .where({ is_deleted: false })
    .where((query) =>
      query
        // LIKE 'YYYY-MM%' thay vì substr(...) — SQL Server không có hàm
        // substr (chỉ SUBSTRING), LIKE chạy được trên cả SQLite lẫn MSSQL.
        .where("thoi_gian_bat_dau", "like", `${prefix}%`)
        .orWhereIn(
          "id",
          db("roadmap_details")
            .where({ month, is_deleted: false })
            .whereNull("synced_task_id")
            .select("roadmap_item_id"),
        ),
    );
  for (const item of items as RoadmapItem[]) {
    await syncRoadmapItemToBacklog(item);
  }
}

export async function deleteRoadmapItem(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getRoadmapItem(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, existing.department_id);
  // Gỡ liên kết thủ công (FK feature_requests.linked_roadmap_item_id dùng
  // NO ACTION để tương thích MSSQL — xem migrations/featureRequests.ts).
  await db("feature_requests").where({ linked_roadmap_item_id: id }).update({ linked_roadmap_item_id: null });
  // Cascade xuống roadmap_details — TRƯỚC ĐÂY dựa hẳn vào DB CASCADE
  // (roadmap_details.roadmap_item_id ON DELETE CASCADE), không còn tự chạy
  // khi đổi sang xóa mềm (không phải lệnh DELETE thật nữa).
  await softDeleteWhere(db, "roadmap_details", { roadmap_item_id: id });
  const count = await softDeleteWhere(db, "roadmap_items", { id });
  return count > 0;
}

// Xóa nhiều dòng roadmap theo checkbox đã chọn trên bảng (chi tiết công
// việc theo tháng của từng dòng cũng bị xóa mềm theo).
export async function deleteRoadmapItems(ids: number[], scope: DataScope): Promise<number> {
  if (ids.length === 0) return 0;
  let scopedIds = ids;
  if (!scope.all) {
    const rows = await db("roadmap_items").whereIn("id", ids).select("id", "department_id");
    scopedIds = rows.filter((r: any) => isDepartmentInScope(scope, r.department_id)).map((r: any) => Number(r.id));
  }
  if (scopedIds.length === 0) return 0;
  await db("feature_requests")
    .whereIn("linked_roadmap_item_id", scopedIds)
    .update({ linked_roadmap_item_id: null });
  await softDeleteWhereIn(db, "roadmap_details", "roadmap_item_id", scopedIds);
  const count = await softDeleteWhereIn(db, "roadmap_items", "id", scopedIds);
  return Number(count);
}

// ---- Chi tiết công việc theo tháng ----

export async function listRoadmapDetails(itemId: number): Promise<RoadmapDetail[]> {
  const rows = await db("roadmap_details as d")
    .leftJoin("tasks as t", "t.id", "d.synced_task_id")
    .where({ "d.roadmap_item_id": itemId, "d.is_deleted": false })
    .orderBy("d.month", "asc")
    .orderBy("d.id", "asc")
    .select("d.*", "t.is_deleted as __task_deleted");
  // task_deleted: task được trỏ tới đã bị xóa (xóa mềm) — FE hiển thị
  // "Chưa vào Backlog" thay vì "Đã vào Backlog" cho dòng đó.
  return (rows as (RoadmapDetail & { __task_deleted: boolean | number | null })[]).map((r) => {
    const { __task_deleted, ...rest } = r;
    return { ...rest, task_deleted: Boolean(__task_deleted) };
  });
}

export async function createRoadmapDetail(
  itemId: number,
  input: CreateRoadmapDetailInput,
): Promise<RoadmapDetail> {
  const [created] = await db("roadmap_details")
    .insert({
      roadmap_item_id: itemId,
      month: input.month,
      noi_dung: input.noi_dung.trim(),
      trang_thai: input.trang_thai ?? "Chưa thực hiện",
      ghi_chu: input.ghi_chu?.trim() || null,
    })
    .returning("*");
  // Logic mới: mỗi dòng chi tiết theo tháng = 1 task ở tháng đó — thử đưa
  // ngay nếu tháng đã được quản lý trong Backlog (đánh dấu synced_task_id).
  const item = await getRoadmapItem(itemId);
  if (!item) return created as RoadmapDetail;
  return syncOneRoadmapDetail(item, created as RoadmapDetail);
}

export async function updateRoadmapDetail(
  id: number,
  input: UpdateRoadmapDetailInput,
): Promise<RoadmapDetail | undefined> {
  const existing = await db("roadmap_details").where({ id, is_deleted: false }).first();
  if (!existing) return undefined;
  const [updated] = await db("roadmap_details")
    .where({ id })
    .update({
      month: input.month ?? existing.month,
      noi_dung: input.noi_dung?.trim() ?? existing.noi_dung,
      trang_thai: input.trang_thai ?? existing.trang_thai,
      ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
      updated_at: db.fn.now(),
    })
    .returning("*");
  // Chưa sync mà tháng vừa đổi vào phạm vi Bắt đầu -> Kết thúc thì thử đưa.
  // Đã sync thì giữ nguyên task cũ (sửa Nội dung sau đó không cập nhật ngược
  // vào task — người dùng tự sửa task bên Backlog nếu cần).
  const item = await getRoadmapItem((updated as RoadmapDetail).roadmap_item_id);
  if (!item) return updated as RoadmapDetail;
  return syncOneRoadmapDetail(item, updated as RoadmapDetail);
}

export async function deleteRoadmapDetail(id: number): Promise<boolean> {
  const count = await softDeleteWhere(db, "roadmap_details", { id });
  return count > 0;
}
