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
  const query = db("roadmap_items").where({ year: filter.year });
  if (filter.department_id != null) query.where({ department_id: filter.department_id });
  const rows = await query.orderBy("thoi_gian_ket_thuc", "asc").orderBy("id", "asc");
  return rows as RoadmapItem[];
}

export async function getRoadmapItem(id: number): Promise<RoadmapItem | undefined> {
  const row = await db("roadmap_items").where({ id }).first();
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
  return syncRoadmapItemToBacklog(created as RoadmapItem);
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
  return syncRoadmapItemToBacklog(updated as RoadmapItem);
}

// Đưa 1 dòng roadmap vào backlog đúng tháng bắt đầu (nếu tháng đó đã được
// quản lý trong Backlog) — chỉ đưa Team, Nhiệm vụ, DOD, Phân loại (map vào
// cột Tính chất của task, cùng danh mục Phân loại) và Deadline (= ngày kết
// thúc roadmap). Không đưa chi tiết theo tháng. Chỉ đưa đúng 1 lần (đánh dấu
// qua synced_task_id) — nếu chưa xong thì đã có sẵn tính năng "Chuyển sang
// tháng sau" của Backlog để tự đẩy tiếp, roadmap không lặp lại việc đưa vào.
// Task tự đưa vào luôn được gắn thêm "NV năm" ở Tính chất (giữ nguyên giá
// trị Phân loại gốc của roadmap nếu có) để phân biệt với task nhập tay.
async function syncRoadmapItemToBacklog(item: RoadmapItem): Promise<RoadmapItem> {
  if (item.synced_task_id || !item.thoi_gian_bat_dau) return item;
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(item.thoi_gian_bat_dau);
  if (!m) return item;
  const period = await getPeriodByYearMonth(Number(m[1]), Number(m[2]));
  if (!period) return item;

  // Task tự sinh ra từ Roadmap kế thừa department_id của chính dòng roadmap
  // (đã được kiểm tra phạm vi lúc tạo/sửa roadmap item) — không áp lại quy
  // tắc 9.2 ở đây, tự động hoá hệ thống không bị chặn theo phạm vi của ai.
  const task = await createTask(
    period.id,
    {
      department_id: item.department_id ?? undefined,
      team: item.team,
      nhiem_vu: item.nhiem_vu,
      dod: item.dod ?? undefined,
      tinh_chat: addTinhChatTag(item.phan_loai ?? null, TINH_CHAT_NV_NAM),
      deadline: item.thoi_gian_ket_thuc ?? undefined,
    },
    { all: true, departmentId: null },
  );
  const [updated] = await db("roadmap_items")
    .where({ id: item.id })
    .update({ synced_task_id: task.id })
    .returning("*");
  return updated as RoadmapItem;
}

// Quét các dòng roadmap chưa đưa vào backlog, khớp đúng (năm, tháng) với
// tháng vừa được thêm vào Backlog — gọi sau khi tạo period mới.
export async function syncRoadmapItemsForPeriod(year: number, month: number): Promise<void> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const items = await db("roadmap_items")
    .whereNull("synced_task_id")
    .whereRaw("substr(thoi_gian_bat_dau, 1, 7) = ?", [prefix]);
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
  const count = await db("roadmap_items").where({ id }).delete();
  return count > 0;
}

// Xóa nhiều dòng roadmap theo checkbox đã chọn trên bảng (chi tiết công
// việc theo tháng của từng dòng cũng bị xóa theo, CASCADE).
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
  const count = await db("roadmap_items").whereIn("id", scopedIds).delete();
  return Number(count);
}

// ---- Chi tiết công việc theo tháng ----

export async function listRoadmapDetails(itemId: number): Promise<RoadmapDetail[]> {
  const rows = await db("roadmap_details")
    .where({ roadmap_item_id: itemId })
    .orderBy("month", "asc")
    .orderBy("id", "asc");
  return rows as RoadmapDetail[];
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
  return created as RoadmapDetail;
}

export async function updateRoadmapDetail(
  id: number,
  input: UpdateRoadmapDetailInput,
): Promise<RoadmapDetail | undefined> {
  const existing = await db("roadmap_details").where({ id }).first();
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
  return updated as RoadmapDetail;
}

export async function deleteRoadmapDetail(id: number): Promise<boolean> {
  const count = await db("roadmap_details").where({ id }).delete();
  return count > 0;
}
