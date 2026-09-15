import type { Request, Response } from "express";
import {
  cloneTieuChiConfigs,
  createTieuChiConfig,
  deleteTieuChiConfig,
  listTieuChiConfigs,
  setTieuChiDiemChuan,
  updateTieuChiConfig,
} from "../services/tieuchi.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

// undefined -> không đổi (chỉ dùng ở update), null/"" -> xóa (về null),
// giá trị khác -> Number(). Number(null) === 0 nên PHẢI loại null ra trước,
// không thì "xóa hệ số" lại lưu nhầm thành 0.
function toNullableFloat(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function createTieuChiConfigHandler(req: Request, res: Response) {
  const { nhom, ten_tieu_chi, cach_tinh_diem, co_chi_tieu, thu_tu, department_id, dung_chung, kieu_tinh, nguon_du_lieu, he_so } =
    req.body ?? {};
  if (!isNonEmptyText(nhom)) {
    return res.status(400).json({ error: "Trường 'nhom' là bắt buộc" });
  }
  if (!isNonEmptyText(ten_tieu_chi)) {
    return res.status(400).json({ error: "Trường 'ten_tieu_chi' là bắt buộc" });
  }

  // dung_chung=true (hoặc không gửi department_id) -> tiêu chí dùng chung
  // (department_id NULL); ngược lại tiêu chí riêng của department_id gửi lên.
  const scopedDepartmentId =
    dung_chung || department_id == null ? null : Number(department_id);

  const config = await createTieuChiConfig({
    nhom,
    ten_tieu_chi,
    cach_tinh_diem,
    co_chi_tieu: Boolean(co_chi_tieu),
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
    department_id: scopedDepartmentId,
    kieu_tinh: kieu_tinh || undefined,
    nguon_du_lieu: nguon_du_lieu || null,
    he_so: toNullableFloat(he_so) ?? null,
  });
  res.status(201).json(config);
}

// GET /api/tieu-chi?department_id=X — trả tiêu chí "thấy được" của phòng X
// (dùng chung, nếu phòng đó bật + tiêu chí riêng của phòng đó). Không truyền
// department_id thì chỉ trả tiêu chí dùng chung.
export async function listTieuChiConfigsHandler(req: Request, res: Response) {
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  res.json(await listTieuChiConfigs(departmentId));
}

export async function updateTieuChiConfigHandler(req: Request, res: Response) {
  const { nhom, ten_tieu_chi, cach_tinh_diem, co_chi_tieu, thu_tu, department_id, dung_chung, kieu_tinh, nguon_du_lieu, he_so } =
    req.body ?? {};
  const scopedDepartmentId =
    dung_chung !== undefined || department_id !== undefined
      ? dung_chung || department_id == null
        ? null
        : Number(department_id)
      : undefined;

  const config = await updateTieuChiConfig(Number(req.params.id), {
    nhom,
    ten_tieu_chi,
    cach_tinh_diem,
    co_chi_tieu: co_chi_tieu !== undefined ? Boolean(co_chi_tieu) : undefined,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
    department_id: scopedDepartmentId,
    kieu_tinh: kieu_tinh || undefined,
    nguon_du_lieu: nguon_du_lieu !== undefined ? nguon_du_lieu || null : undefined,
    he_so: toNullableFloat(he_so),
  });
  if (!config) return res.status(404).json({ error: "Không tìm thấy tiêu chí" });
  res.json(config);
}

export async function deleteTieuChiConfigHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTieuChiConfig(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tiêu chí" });
  res.status(204).send();
}

// PUT /api/tieu-chi/:id/diem-chuan { team_name, diem_chuan, chi_tieu }
export async function setTieuChiDiemChuanHandler(req: Request, res: Response) {
  const { team_name, diem_chuan, chi_tieu } = req.body ?? {};
  if (!isNonEmptyText(team_name)) {
    return res.status(400).json({ error: "Trường 'team_name' là bắt buộc" });
  }
  await setTieuChiDiemChuan(Number(req.params.id), team_name, diem_chuan ?? null, chi_tieu ?? null);
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const configs = await listTieuChiConfigs(departmentId);
  res.json(configs.find((c) => c.id === Number(req.params.id)));
}

// POST /api/tieu-chi/clone { from_department_id, to_department_id } — sao
// chép tiêu chí "thấy được" của phòng nguồn thành tiêu chí riêng mới của
// phòng đích (bỏ qua trùng nhóm + tên đã có sẵn).
export async function cloneTieuChiConfigsHandler(req: Request, res: Response) {
  // req.body đến từ JSON nên from/to_department_id là number thật, không
  // phải string như param URL — parsePositiveInt (thiết kế cho URL param)
  // sẽ luôn trả NaN cho number, phải Number() trực tiếp.
  const fromDepartmentId = Number(req.body?.from_department_id);
  const toDepartmentId = Number(req.body?.to_department_id);
  if (
    !Number.isInteger(fromDepartmentId) ||
    fromDepartmentId <= 0 ||
    !Number.isInteger(toDepartmentId) ||
    toDepartmentId <= 0
  ) {
    return res.status(400).json({ error: "Thiếu 'from_department_id' hoặc 'to_department_id'" });
  }
  if (fromDepartmentId === toDepartmentId) {
    return res.status(400).json({ error: "Phòng nguồn và phòng đích phải khác nhau" });
  }
  const cloned = await cloneTieuChiConfigs(fromDepartmentId, toDepartmentId);
  res.status(201).json({ cloned });
}
