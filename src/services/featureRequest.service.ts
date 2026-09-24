import { db } from "../db/database.js";
import type {
  CreateFeatureRequestInput,
  FeatureRequestWithDept,
  LinkToBacklogInput,
  LinkToRoadmapInput,
  LoaiYeuCauOption,
  UpdateFeatureRequestInput,
} from "../types/featureRequest.js";
import { createTask } from "./task.service.js";
import { createRoadmapItem } from "./roadmap.service.js";
import { getPeriod } from "./period.service.js";

const UNRESTRICTED = { all: true, departmentId: null } as const;

// [DEMO 3002 - v2] Theo yêu cầu mới: MỘT yêu cầu chỉ hiển thị cho đúng 2
// phòng liên quan trực tiếp — phòng đề xuất (department_id) và phòng đích
// (target_department_id); phòng khác KHÔNG thấy được, kể cả khi biết ID.
// departmentId=null/undefined (chưa chọn phòng ban nào ở sidebar) -> trả
// rỗng, không phải "xem hết" — tránh rò rỉ yêu cầu của phòng khác khi state
// chưa kịp có currentDepartmentId.
export async function listFeatureRequests(departmentId: number | null): Promise<FeatureRequestWithDept[]> {
  if (departmentId == null) return [];
  const rows = await db("feature_requests as fr")
    .leftJoin("departments as d", "d.id", "fr.department_id")
    .leftJoin("departments as td", "td.id", "fr.target_department_id")
    .select("fr.*", "d.name as department_name", "td.name as target_department_name")
    .where("fr.department_id", departmentId)
    .orWhere("fr.target_department_id", departmentId)
    .orderBy("fr.created_at", "desc");
  return rows as FeatureRequestWithDept[];
}

export async function getFeatureRequest(id: number): Promise<FeatureRequestWithDept | undefined> {
  const row = await db("feature_requests as fr")
    .leftJoin("departments as d", "d.id", "fr.department_id")
    .leftJoin("departments as td", "td.id", "fr.target_department_id")
    .select("fr.*", "d.name as department_name", "td.name as target_department_name")
    .where("fr.id", id)
    .first();
  return row as FeatureRequestWithDept | undefined;
}

export async function createFeatureRequest(input: CreateFeatureRequestInput): Promise<FeatureRequestWithDept> {
  const [created] = await db("feature_requests")
    .insert({
      he_thong: input.he_thong.trim(),
      loai_yeu_cau: input.loai_yeu_cau ?? null,
      tieu_de: input.tieu_de.trim(),
      mo_ta: input.mo_ta?.trim() || null,
      ket_qua_mong_muon: input.ket_qua_mong_muon?.trim() || null,
      thoi_gian_mong_muon: input.thoi_gian_mong_muon || null,
      department_id: input.department_id ?? null,
      target_department_id: input.target_department_id,
      nguoi_de_xuat: input.nguoi_de_xuat?.trim() || null,
      do_uu_tien: input.do_uu_tien ?? "Trung bình",
      trang_thai: "Chờ duyệt",
    })
    .returning("id");
  const id = typeof created === "object" ? created.id : created;
  return (await getFeatureRequest(id)) as FeatureRequestWithDept;
}

export async function updateFeatureRequest(
  id: number,
  input: UpdateFeatureRequestInput,
): Promise<FeatureRequestWithDept | undefined> {
  const existing = await db("feature_requests").where({ id }).first();
  if (!existing) return undefined;

  await db("feature_requests")
    .where({ id })
    .update({
      he_thong: input.he_thong !== undefined ? input.he_thong.trim() : existing.he_thong,
      loai_yeu_cau: input.loai_yeu_cau !== undefined ? input.loai_yeu_cau : existing.loai_yeu_cau,
      tieu_de: input.tieu_de !== undefined ? input.tieu_de.trim() : existing.tieu_de,
      mo_ta: input.mo_ta !== undefined ? input.mo_ta.trim() || null : existing.mo_ta,
      ket_qua_mong_muon:
        input.ket_qua_mong_muon !== undefined ? input.ket_qua_mong_muon.trim() || null : existing.ket_qua_mong_muon,
      thoi_gian_mong_muon:
        input.thoi_gian_mong_muon !== undefined ? input.thoi_gian_mong_muon || null : existing.thoi_gian_mong_muon,
      department_id: input.department_id !== undefined ? input.department_id : existing.department_id,
      target_department_id:
        input.target_department_id !== undefined ? input.target_department_id : existing.target_department_id,
      nguoi_de_xuat:
        input.nguoi_de_xuat !== undefined ? input.nguoi_de_xuat.trim() || null : existing.nguoi_de_xuat,
      do_uu_tien: input.do_uu_tien !== undefined ? input.do_uu_tien : existing.do_uu_tien,
      trang_thai: input.trang_thai !== undefined ? input.trang_thai : existing.trang_thai,
      ghi_chu_xu_ly:
        input.ghi_chu_xu_ly !== undefined ? input.ghi_chu_xu_ly.trim() || null : existing.ghi_chu_xu_ly,
      updated_at: db.fn.now(),
    });
  return getFeatureRequest(id);
}

export async function deleteFeatureRequest(id: number): Promise<boolean> {
  const count = await db("feature_requests").where({ id }).delete();
  return count > 0;
}

export async function listLoaiYeuCau(): Promise<LoaiYeuCauOption[]> {
  const rows = await db("loai_yeu_cau_options").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as LoaiYeuCauOption[];
}

// ---- Luồng Duyệt/Từ chối (chỉ phòng đích được gọi — kiểm tra scope ở
// controller trước khi tới đây) ----

export async function approveFeatureRequest(id: number): Promise<FeatureRequestWithDept | undefined> {
  const existing = await db("feature_requests").where({ id }).first();
  if (!existing || existing.trang_thai !== "Chờ duyệt") return undefined;
  await db("feature_requests").where({ id }).update({ trang_thai: "Đã duyệt", updated_at: db.fn.now() });
  return getFeatureRequest(id);
}

export async function rejectFeatureRequest(
  id: number,
  ghiChu?: string,
): Promise<FeatureRequestWithDept | undefined> {
  const existing = await db("feature_requests").where({ id }).first();
  if (!existing || existing.trang_thai !== "Chờ duyệt") return undefined;
  await db("feature_requests")
    .where({ id })
    .update({
      trang_thai: "Từ chối",
      ghi_chu_xu_ly: ghiChu?.trim() || existing.ghi_chu_xu_ly,
      updated_at: db.fn.now(),
    });
  return getFeatureRequest(id);
}

// Đưa yêu cầu (đã Duyệt) vào Backlog đúng tháng được chọn — tạo 1 Task mới
// gắn department_id = phòng đích (phòng thực hiện), Nhiệm vụ = Tiêu đề yêu
// cầu, DoD = Mô tả chi tiết. Chỉ đưa được 1 lần (linked_task_id).
export async function linkFeatureRequestToBacklog(
  id: number,
  input: LinkToBacklogInput,
): Promise<FeatureRequestWithDept | undefined> {
  const existing = await db("feature_requests").where({ id }).first();
  if (!existing || existing.trang_thai !== "Đã duyệt" || existing.linked_task_id) return undefined;

  const period = await getPeriod(input.period_id);
  if (!period) throw new Error("Tháng backlog không hợp lệ");
  const today = new Date();
  if (period.year < today.getFullYear() || (period.year === today.getFullYear() && period.month < today.getMonth() + 1)) {
    throw new Error("Không thể đưa vào tháng backlog đã qua");
  }

  const task = await createTask(
    input.period_id,
    {
      department_id: existing.target_department_id ?? undefined,
      team: input.team,
      nhiem_vu: existing.tieu_de,
      dod: existing.mo_ta ?? undefined,
    },
    UNRESTRICTED,
  );
  await db("feature_requests").where({ id }).update({ linked_task_id: task.id, updated_at: db.fn.now() });
  return getFeatureRequest(id);
}

// Đưa yêu cầu (đã Duyệt) vào Roadmap năm — tạo 1 dòng roadmap mới gắn
// department_id = phòng đích. Chỉ đưa được 1 lần (linked_roadmap_item_id).
export async function linkFeatureRequestToRoadmap(
  id: number,
  input: LinkToRoadmapInput,
): Promise<FeatureRequestWithDept | undefined> {
  const existing = await db("feature_requests").where({ id }).first();
  if (!existing || existing.trang_thai !== "Đã duyệt" || existing.linked_roadmap_item_id) return undefined;

  const roadmapItem = await createRoadmapItem(
    {
      department_id: existing.target_department_id ?? undefined,
      year: input.year,
      team: input.team,
      he_thong: existing.he_thong ?? undefined,
      nhiem_vu: existing.tieu_de,
      dod: existing.mo_ta ?? undefined,
    },
    UNRESTRICTED,
  );
  await db("feature_requests")
    .where({ id })
    .update({ linked_roadmap_item_id: roadmapItem.id, updated_at: db.fn.now() });
  return getFeatureRequest(id);
}
