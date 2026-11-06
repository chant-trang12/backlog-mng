import { db } from "../db/database.js";
import type { GnvGroup, GnvGroupWithItems, GnvItem, GnvItemInput } from "../types/summaryPlan.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";

export class GnvError extends Error {}

const txt = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Mức chỉ tiêu (T/B/S) phụ thuộc Đơn vị đo: Thời gian = ngày YYYY-MM-DD;
// Số lượng/Điểm = số nguyên dương; Tỷ lệ % = số (không âm).
function validateLevels(input: GnvItemInput, unitOverride?: string | null): void {
  const unit = unitOverride !== undefined ? unitOverride : txt(input.don_vi_do);
  for (const v of [txt(input.muc_toi_thieu), txt(input.muc_mong_doi), txt(input.muc_thach_thuc)]) {
    if (v == null) continue;
    if (unit === "Thời gian" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new GnvError("Mức chỉ tiêu phải là ngày khi Đơn vị đo là Thời gian.");
    if ((unit === "Số lượng" || unit === "Điểm") && !/^[1-9]\d*$/.test(v)) throw new GnvError("Mức chỉ tiêu phải là số nguyên dương khi Đơn vị đo là Số lượng/Điểm.");
    if (unit === "Tỷ lệ %" && !(Number.isFinite(Number(v)) && Number(v) >= 0)) throw new GnvError("Mức chỉ tiêu phải là số tỷ lệ % hợp lệ.");
  }
}

// Phần RIÊNG của từng phương pháp đo (dòng con chỉ lưu phần này).
function methodFields(input: GnvItemInput) {
  return {
    phuong_phap_do: txt(input.phuong_phap_do),
    ty_trong: num(input.ty_trong), // mỗi phương pháp đo có Tỷ trọng riêng; ô Tỷ trọng gộp của mục tiêu = tổng
    muc_toi_thieu: txt(input.muc_toi_thieu),
    muc_mong_doi: txt(input.muc_mong_doi),
    muc_thach_thuc: txt(input.muc_thach_thuc),
    ngay_bat_dau: txt(input.ngay_bat_dau),
    ngay_hoan_thanh: txt(input.ngay_hoan_thanh),
    ket_qua_thuc_hien: txt(input.ket_qua_thuc_hien),
    cbnv_tu_danh_gia: num(input.cbnv_tu_danh_gia),
    qltt_danh_gia: num(input.qltt_danh_gia),
  };
}

// Tổng Tỷ trọng của MỌI dòng (mục tiêu + từng phương pháp đo) trong cùng
// tháng + phòng ban KHÔNG được vượt 100%.
async function assertWeightWithinLimit(
  periodId: number,
  departmentId: number | null,
  excludeId: number | null,
  weight: number | null,
): Promise<void> {
  if (weight == null) return;
  if (weight < 0 || weight > 100) throw new GnvError("Tỷ trọng phải nằm trong khoảng 0–100%.");
  const q = db("gnv_items").where({ period_id: periodId, is_deleted: false }).sum({ s: "ty_trong" });
  if (departmentId != null) q.where({ department_id: departmentId });
  if (excludeId != null) q.whereNot({ id: excludeId });
  const row = (await q.first()) as { s: number | null } | undefined;
  const current = Number(row?.s ?? 0);
  const total = Math.round((current + weight) * 100) / 100;
  if (total > 100) {
    throw new GnvError(
      `Tổng Tỷ trọng không được vượt quá 100%: hiện các mục tiêu khác đã chiếm ${Math.round(current * 100) / 100}%, còn tối đa ${Math.max(0, Math.round((100 - current) * 100) / 100)}%.`,
    );
  }
}

function itemFields(input: GnvItemInput) {
  validateLevels(input);
  return {
    muc_tieu: txt(input.muc_tieu),
    chi_so_kpi: txt(input.chi_so_kpi),
    phuong_phap_do: txt(input.phuong_phap_do),
    don_vi_do: txt(input.don_vi_do),
    ty_trong: num(input.ty_trong),
    muc_toi_thieu: txt(input.muc_toi_thieu),
    muc_mong_doi: txt(input.muc_mong_doi),
    muc_thach_thuc: txt(input.muc_thach_thuc),
    ngay_bat_dau: txt(input.ngay_bat_dau),
    ngay_hoan_thanh: txt(input.ngay_hoan_thanh),
    ket_qua_thuc_hien: txt(input.ket_qua_thuc_hien),
    cbnv_tu_danh_gia: num(input.cbnv_tu_danh_gia),
    qltt_danh_gia: num(input.qltt_danh_gia),
  };
}

// Danh sách nhóm + dòng của 1 tháng/phòng ban (departmentId null = scope.all
// không lọc; SCOPE_EMPTY đã bị chặn ở controller).
export async function listGnv(periodId: number, departmentId?: number | null): Promise<GnvGroupWithItems[]> {
  const gq = db("gnv_groups").where({ period_id: periodId, is_deleted: false });
  const iq = db("gnv_items").where({ period_id: periodId, is_deleted: false });
  if (departmentId != null) {
    gq.where({ department_id: departmentId });
    iq.where({ department_id: departmentId });
  }
  const groups = (await gq.orderBy("thu_tu", "asc").orderBy("id", "asc")) as GnvGroup[];
  const items = (await iq.orderBy("thu_tu", "asc").orderBy("id", "asc")) as GnvItem[];
  // Dòng LẤY TỪ BACKLOG (có task_id): "Kết quả thực hiện chỉ tiêu" tự lấy từ cột Tiến độ của nhiệm vụ trong Backlog,
  // NHƯNG vẫn sửa được ở GNV. Quy tắc: Tiến độ ở Backlog khác tien_do_goc (đã đổi từ lần lấy/sửa tay cuối) -> hiện
  // Tiến độ mới của Backlog; không đổi -> hiện giá trị lưu ở GNV (có thể là nội dung user đã sửa tay).
  // Nhiệm vụ đã bị xoá khỏi Backlog thì giữ giá trị đã lưu.
  const taskIds = [...new Set(items.map((i) => i.task_id).filter((x): x is number => x != null))];
  if (taskIds.length) {
    const tasks = (await db("tasks").whereIn("id", taskIds).where({ is_deleted: false }).select("id", "tien_do")) as { id: number; tien_do: string | null }[];
    const progress = new Map(tasks.map((t) => [t.id, t.tien_do ?? null]));
    for (const it of items as (GnvItem & { tien_do_goc?: string | null; lien_ket_backlog?: boolean })[]) {
      if (it.task_id == null || !progress.has(it.task_id)) continue;
      it.lien_ket_backlog = true;
      const current = progress.get(it.task_id) ?? null;
      if (current !== (it.tien_do_goc ?? null)) it.ket_qua_thuc_hien = current;
    }
  }
  // Thứ tự hiển thị: dòng mục tiêu rồi tới các phương pháp đo con của nó.
  return groups.map((g) => {
    const mine = items.filter((i) => i.group_id === g.id);
    const heads = mine.filter((i) => i.parent_item_id == null);
    const ordered: GnvItem[] = [];
    for (const h of heads) {
      ordered.push(h, ...mine.filter((i) => i.parent_item_id === h.id));
    }
    return { ...g, items: ordered };
  });
}

async function getGroup(id: number): Promise<GnvGroup | undefined> {
  return (await db("gnv_groups").where({ id, is_deleted: false }).first()) as GnvGroup | undefined;
}
async function getItem(id: number): Promise<GnvItem | undefined> {
  return (await db("gnv_items").where({ id, is_deleted: false }).first()) as GnvItem | undefined;
}

export async function createGroup(
  periodId: number,
  departmentId: number | null,
  tenNhom: string,
  scope: DataScope,
): Promise<GnvGroup> {
  if (departmentId == null) throw new GnvError("Hãy chọn 1 phòng ban cụ thể trước khi tạo nhóm.");
  assertDepartmentInScope(scope, departmentId);
  const max = await db("gnv_groups")
    .where({ period_id: periodId, department_id: departmentId, is_deleted: false })
    .max({ m: "thu_tu" })
    .first();
  const [row] = await db("gnv_groups")
    .insert({ period_id: periodId, department_id: departmentId, ten_nhom: tenNhom.trim(), thu_tu: Number((max as any)?.m ?? 0) + 1 })
    .returning("*");
  return row as GnvGroup;
}

export async function updateGroup(id: number, tenNhom: string, scope: DataScope): Promise<GnvGroup | undefined> {
  const g = await getGroup(id);
  if (!g) return undefined;
  assertDepartmentInScope(scope, g.department_id);
  const [row] = await db("gnv_groups").where({ id }).update({ ten_nhom: tenNhom.trim(), updated_at: db.fn.now() }).returning("*");
  return row as GnvGroup;
}

export async function deleteGroup(id: number, scope: DataScope): Promise<boolean> {
  const g = await getGroup(id);
  if (!g) return false;
  assertDepartmentInScope(scope, g.department_id);
  await db.transaction(async (trx) => {
    await softDeleteWhere(trx as any, "gnv_items", { group_id: id });
    await softDeleteWhere(trx as any, "gnv_groups", { id });
  });
  return true;
}

async function nextItemOrder(groupId: number): Promise<number> {
  const max = await db("gnv_items").where({ group_id: groupId, is_deleted: false }).max({ m: "thu_tu" }).first();
  return Number((max as any)?.m ?? 0) + 1;
}

export async function createItem(
  groupId: number,
  input: GnvItemInput,
  scope: DataScope,
  parentItemId?: number | null,
): Promise<GnvItem> {
  const g = await getGroup(groupId);
  if (!g) throw new GnvError("Không tìm thấy nhóm.");
  assertDepartmentInScope(scope, g.department_id);
  let fields: Record<string, unknown>;
  if (parentItemId) {
    const parent = await getItem(parentItemId);
    if (!parent || parent.group_id !== g.id || parent.parent_item_id != null) {
      throw new GnvError("Không tìm thấy mục tiêu để thêm phương pháp đo.");
    }
    validateLevels(input, parent.don_vi_do);
    fields = methodFields(input);
    await assertWeightWithinLimit(g.period_id, g.department_id, null, fields.ty_trong as number | null);
  } else {
    fields = itemFields(input);
    await assertWeightWithinLimit(g.period_id, g.department_id, null, fields.ty_trong as number | null);
  }
  const [row] = await db("gnv_items")
    .insert({
      group_id: g.id,
      period_id: g.period_id,
      department_id: g.department_id,
      parent_item_id: parentItemId ?? null,
      thu_tu: await nextItemOrder(g.id),
      ...fields,
    })
    .returning("*");
  return row as GnvItem;
}

export async function updateItem(id: number, input: GnvItemInput, scope: DataScope): Promise<GnvItem | undefined> {
  const it = await getItem(id);
  if (!it) return undefined;
  assertDepartmentInScope(scope, it.department_id);
  // Dòng lấy từ Backlog: user được sửa "Kết quả thực hiện chỉ tiêu" ở GNV. Ghi nhận Tiến độ Backlog hiện tại làm mốc
  // (tien_do_goc) để chỉ khi Backlog đổi Tiến độ SAU ĐÓ thì GNV mới lấy lại giá trị mới. Để trống = lấy lại từ Backlog.
  const task = it.task_id != null ? ((await db("tasks").where({ id: it.task_id, is_deleted: false }).select("tien_do").first()) as { tien_do: string | null } | undefined) : undefined;
  const sync = (ketQua: string | null): { tien_do_goc?: string | null } => (task ? { tien_do_goc: ketQua ? task.tien_do ?? null : null } : {});
  if (it.parent_item_id != null) {
    const parent = await getItem(it.parent_item_id);
    validateLevels(input, parent?.don_vi_do ?? null);
    const mf = methodFields(input);
    await assertWeightWithinLimit(it.period_id, it.department_id, it.id, mf.ty_trong);
    const [row] = await db("gnv_items").where({ id }).update({ ...mf, ...sync(mf.ket_qua_thuc_hien), updated_at: db.fn.now() }).returning("*");
    return row as GnvItem;
  }
  const fields = itemFields(input);
  await assertWeightWithinLimit(it.period_id, it.department_id, it.id, fields.ty_trong);
  const [row] = await db.transaction(async (trx) => {
    // Đổi Đơn vị đo -> mức chỉ tiêu của các phương pháp đo con không còn hợp kiểu.
    if (fields.don_vi_do !== it.don_vi_do) {
      await trx("gnv_items")
        .where({ parent_item_id: id, is_deleted: false })
        .update({ muc_toi_thieu: null, muc_mong_doi: null, muc_thach_thuc: null });
    }
    return trx("gnv_items").where({ id }).update({ ...fields, ...sync(fields.ket_qua_thuc_hien), updated_at: db.fn.now() }).returning("*");
  });
  return row as GnvItem;
}

export async function deleteItem(id: number, scope: DataScope): Promise<boolean> {
  const it = await getItem(id);
  if (!it) return false;
  assertDepartmentInScope(scope, it.department_id);
  await db.transaction(async (trx) => {
    await softDeleteWhere(trx as any, "gnv_items", { parent_item_id: id });
    await softDeleteWhere(trx as any, "gnv_items", { id });
  });
  return true;
}

// Lấy nhiệm vụ từ Backlog vào nhóm: CHỈ nhận task cùng tháng + cùng phòng
// ban với nhóm (không lẫn tháng/phòng khác). Nội dung được SAO CHÉP: Nhiệm
// vụ -> Phương pháp đo (Mục tiêu để trống, không lấy DoD), Tiến độ -> Kết quả
// thực hiện; KHÔNG lấy Ngày thực hiện/Deadline (Ngày bắt đầu/hoàn thành để trống). Task đã có
// trong GNV của tháng/phòng này thì bỏ qua (không thêm trùng).
export async function addItemsFromTasks(
  groupId: number,
  taskIds: number[],
  scope: DataScope,
  opts: { merge?: boolean; parentItemId?: number | null } = {},
): Promise<{ added: number; skipped: number }> {
  const g = await getGroup(groupId);
  if (!g) throw new GnvError("Không tìm thấy nhóm.");
  assertDepartmentInScope(scope, g.department_id);
  // Cách gộp mục tiêu: parentItemId = thêm vào mục tiêu CÓ SẴN (mọi task thành
  // phương pháp đo con của nó); merge = gộp các task đang chọn vào 1 mục tiêu
  // MỚI (task đầu là dòng mục tiêu, các task sau là phương pháp đo con);
  // mặc định mỗi task là 1 mục tiêu riêng.
  let parentId: number | null = null;
  if (opts.parentItemId) {
    const parent = await getItem(opts.parentItemId);
    if (!parent || parent.group_id !== g.id || parent.parent_item_id != null) {
      throw new GnvError("Không tìm thấy mục tiêu để thêm phương pháp đo.");
    }
    parentId = parent.id;
  }
  const tasks = await db("tasks")
    .whereIn("id", taskIds)
    .where({ period_id: g.period_id, department_id: g.department_id, is_deleted: false })
    .orderBy("stt", "asc");
  const existing = new Set(
    (await db("gnv_items").where({ period_id: g.period_id, department_id: g.department_id, is_deleted: false }).whereNotNull("task_id").pluck("task_id")) as number[],
  );
  let order = await nextItemOrder(g.id);
  let added = 0;
  for (const t of tasks as any[]) {
    if (existing.has(t.id)) continue;
    const [row] = await db("gnv_items")
      .insert({
        group_id: g.id,
        period_id: g.period_id,
        department_id: g.department_id,
        task_id: t.id,
        parent_item_id: parentId,
        thu_tu: order++,
        phuong_phap_do: txt(t.nhiem_vu),
        ket_qua_thuc_hien: txt(t.tien_do),
        tien_do_goc: t.tien_do ?? null,
      })
      .returning("*");
    if (opts.merge && !opts.parentItemId && parentId == null) parentId = (row as GnvItem).id;
    added++;
  }
  return { added, skipped: taskIds.length - added };
}

// Sao chép NHÓM + MỤC TIÊU từ tháng khác (cùng phòng ban) sang tháng đích.
// Chỉ chép phần "khung" dùng lại được: tên nhóm, Mục tiêu, Chỉ số KPI, Đơn vị
// đo, Tỷ trọng và (tuỳ chọn) tên các Phương pháp đo. KHÔNG chép mức chỉ tiêu,
// ngày, kết quả, điểm đánh giá — các giá trị này là của riêng từng tháng.
// - Nhóm trùng tên đã có ở tháng đích -> dùng lại nhóm đó (không tạo nhóm trùng).
// - Mục tiêu trùng nội dung trong nhóm đích -> bỏ qua (chép lại nhiều lần không nhân đôi).
// - Tổng Tỷ trọng tháng đích sau khi chép không được vượt 100% (vượt = không chép gì).
export async function copyFromPeriod(
  sourcePeriodId: number,
  targetPeriodId: number,
  departmentId: number | null,
  selections: { group_id: number; item_ids: number[] }[],
  withMethods: boolean,
  scope: DataScope,
): Promise<{ groups_created: number; items_added: number; skipped: number }> {
  if (departmentId == null) throw new GnvError("Hãy chọn 1 phòng ban cụ thể trước khi sao chép.");
  assertDepartmentInScope(scope, departmentId);
  if (sourcePeriodId === targetPeriodId) throw new GnvError("Hãy chọn tháng nguồn khác tháng hiện tại.");

  const srcGroups = (await db("gnv_groups").where({ period_id: sourcePeriodId, department_id: departmentId, is_deleted: false }).orderBy("thu_tu")) as GnvGroup[];
  const srcItems = (await db("gnv_items").where({ period_id: sourcePeriodId, department_id: departmentId, is_deleted: false }).orderBy("thu_tu")) as GnvItem[];

  const plan = selections
    .map((sel) => {
      const group = srcGroups.find((g) => g.id === sel.group_id);
      if (!group) return null;
      const heads = srcItems.filter((i) => i.group_id === group.id && i.parent_item_id == null && sel.item_ids.includes(i.id));
      return heads.length ? { group, heads } : null;
    })
    .filter((x): x is { group: GnvGroup; heads: GnvItem[] } => x !== null);
  if (plan.length === 0) throw new GnvError("Chưa chọn mục tiêu nào để sao chép.");

  return db.transaction(async (trx) => {
    const norm = (v: string | null) => (v ?? "").trim().toLowerCase();
    let groupsCreated = 0;
    let itemsAdded = 0;
    let skipped = 0;
    let addedWeight = 0;
    const toInsert: { targetGroupId: number; head: GnvItem; order: number }[] = [];

    for (const { group, heads } of plan) {
      let target = (await trx("gnv_groups")
        .where({ period_id: targetPeriodId, department_id: departmentId, is_deleted: false, ten_nhom: group.ten_nhom })
        .first()) as GnvGroup | undefined;
      if (!target) {
        const max = await trx("gnv_groups").where({ period_id: targetPeriodId, department_id: departmentId, is_deleted: false }).max({ m: "thu_tu" }).first();
        const [created] = await trx("gnv_groups")
          .insert({ period_id: targetPeriodId, department_id: departmentId, ten_nhom: group.ten_nhom, thu_tu: Number((max as any)?.m ?? 0) + 1 })
          .returning("*");
        target = created as GnvGroup;
        groupsCreated++;
      }
      const existing = (await trx("gnv_items").where({ group_id: target.id, is_deleted: false }).whereNull("parent_item_id")) as GnvItem[];
      const existingKeys = new Set(existing.map((e) => norm(e.muc_tieu)));
      const maxOrder = await trx("gnv_items").where({ group_id: target.id, is_deleted: false }).max({ m: "thu_tu" }).first();
      let order = Number((maxOrder as any)?.m ?? 0) + 1;
      for (const head of heads) {
        if (existingKeys.has(norm(head.muc_tieu))) {
          skipped++;
          continue;
        }
        existingKeys.add(norm(head.muc_tieu));
        addedWeight += head.ty_trong ?? 0;
        if (withMethods) addedWeight += srcItems.filter((i) => i.parent_item_id === head.id).reduce((s, i) => s + (i.ty_trong ?? 0), 0);
        toInsert.push({ targetGroupId: target.id, head, order: order++ });
      }
    }

    // Kiểm tra trần 100% TRƯỚC khi ghi mục tiêu (nhóm vừa tạo trong giao dịch sẽ tự rollback khi lỗi).
    const cur = (await trx("gnv_items")
      .where({ period_id: targetPeriodId, department_id: departmentId, is_deleted: false })
      .sum({ s: "ty_trong" })
      .first()) as { s: number | null } | undefined;
    const current = Number(cur?.s ?? 0);
    if (Math.round((current + addedWeight) * 100) / 100 > 100) {
      throw new GnvError(
        `Tổng Tỷ trọng sau khi sao chép sẽ là ${Math.round((current + addedWeight) * 100) / 100}% (vượt 100%): tháng này đã có ${Math.round(current * 100) / 100}%, các mục tiêu chọn thêm ${Math.round(addedWeight * 100) / 100}%. Hãy bỏ bớt mục tiêu.`,
      );
    }

    for (const { targetGroupId, head, order } of toInsert) {
      const [newHead] = await trx("gnv_items")
        .insert({
          group_id: targetGroupId,
          period_id: targetPeriodId,
          department_id: departmentId,
          thu_tu: order,
          muc_tieu: head.muc_tieu,
          chi_so_kpi: head.chi_so_kpi,
          don_vi_do: head.don_vi_do,
          ty_trong: head.ty_trong,
          phuong_phap_do: withMethods ? head.phuong_phap_do : null,
        })
        .returning("*");
      itemsAdded++;
      if (withMethods) {
        const kids = srcItems.filter((i) => i.parent_item_id === head.id);
        let o = order;
        for (const kid of kids) {
          await trx("gnv_items").insert({
            group_id: targetGroupId,
            period_id: targetPeriodId,
            department_id: departmentId,
            parent_item_id: (newHead as GnvItem).id,
            thu_tu: o,
            phuong_phap_do: kid.phuong_phap_do,
            ty_trong: kid.ty_trong,
          });
        }
      }
    }
    return { groups_created: groupsCreated, items_added: itemsAdded, skipped };
  });
}
