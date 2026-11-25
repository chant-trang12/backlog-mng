import type { Request, Response } from "express";
import { SystemError, getSystem } from "../services/system.service.js";
import {
  addDoc,
  assignSystem,
  createFeature,
  deleteDoc,
  deleteFeature,
  getDoc,
  getFeature,
  listBySystem,
  listUnassigned,
  listEvents,
  updateProgress,
  syncFeatureRequests,
  updateFeature,
} from "../services/systemFeature.service.js";
import { parsePositiveInt } from "../utils/validate.js";
import { isSystemFeatureInScope, resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";
import { featureDeptsForInput, getFeatureRow, getFeatureRowByDoc } from "../services/systemFeature.service.js";

const fail = (res: Response, e: unknown) => {
  if (e instanceof SystemError) return res.status(400).json({ error: e.message });
  throw e;
};
const scopeOf = (req: Request): DataScope => req.dataScope ?? { all: true, departmentId: null };
// Phòng đang xem (?department_id=, đã ép theo phạm vi tài khoản) — null = chưa chọn / ngoài phạm vi -> không có dữ liệu.
export function viewDepartmentId(req: Request): number | null {
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const d = resolveListDepartmentId(scopeOf(req), Number.isFinite(requested as number) ? requested : null);
  return d === SCOPE_EMPTY ? null : d;
}
// Tính năng có nằm trong phạm vi (đơn vị yêu cầu hoặc đơn vị thực hiện) của người gọi không.
async function accessible(req: Request, res: Response, id: number): Promise<boolean> {
  const row = await getFeatureRow(id);
  if (!row || !isSystemFeatureInScope(scopeOf(req), row)) {
    res.status(404).json({ error: "Không tìm thấy tính năng" });
    return false;
  }
  return true;
}
const actorOf = (req: Request) => {
  const u = (req as any).appUser as { name?: string; username?: string } | undefined;
  return { name: u?.name || u?.username || null };
};
const bad = (res: Response) => res.status(400).json({ error: "id không hợp lệ" });

export async function listSystemFeaturesHandler(req: Request, res: Response) {
  await syncFeatureRequests();
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  if (!(await getSystem(id))) return res.status(404).json({ error: "Không tìm thấy hệ thống" });
  res.json(await listBySystem(id, viewDepartmentId(req)));
}

export async function listUnassignedHandler(req: Request, res: Response) {
  await syncFeatureRequests();
  res.json(await listUnassigned(viewDepartmentId(req)));
}

export async function getFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  await syncFeatureRequests(); // trạng thái luôn khớp yêu cầu gốc (VD vừa được duyệt ở menu Yêu cầu tính năng)
  if (!(await accessible(req, res, id))) return;
  const f = await getFeature(id);
  if (!f) return res.status(404).json({ error: "Không tìm thấy tính năng" });
  res.json(f);
}

export async function createFeatureHandler(req: Request, res: Response) {
  if (!isSystemFeatureInScope(scopeOf(req), await featureDeptsForInput(req.body ?? {}))) {
    return res.status(403).json({ error: "Bạn chỉ tạo được tính năng do đơn vị mình yêu cầu hoặc thực hiện." });
  }
  try {
    res.status(201).json(await createFeature(req.body ?? {}, actorOf(req)));
  } catch (e) {
    fail(res, e);
  }
}

export async function updateFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  if (!(await accessible(req, res, id))) return;
  try {
    const f = await updateFeature(id, req.body ?? {}, actorOf(req));
    if (!f) return res.status(404).json({ error: "Không tìm thấy tính năng" });
    res.json(f);
  } catch (e) {
    fail(res, e);
  }
}

export async function assignFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  const sys = parsePositiveInt(String(req.body?.system_id ?? ""));
  if (!Number.isFinite(id) || !Number.isFinite(sys)) return bad(res);
  if (!(await accessible(req, res, id))) return;
  try {
    const f = await assignSystem(id, sys);
    if (!f) return res.status(404).json({ error: "Không tìm thấy tính năng" });
    res.json(f);
  } catch (e) {
    fail(res, e);
  }
}

export async function deleteFeatureHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  if (!(await accessible(req, res, id))) return;
  if (!(await deleteFeature(id))) return res.status(404).json({ error: "Không tìm thấy tính năng" });
  res.status(204).send();
}

// POST /api/system-features/:id/docs/:key?filename=... — body là bytes thô của file.
export async function uploadDocHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  if (!(await accessible(req, res, id))) return;
  const filename = typeof req.query.filename === "string" ? req.query.filename.trim() : "";
  if (!filename) return res.status(400).json({ error: "Thiếu tên file (query 'filename')" });
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Thiếu nội dung file" });
  try {
    const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
    res.json(await addDoc(id, String(req.params.key), filename, req.body, { version: q("version"), release_date: q("release_date"), note: q("note") }, actorOf(req)));
  } catch (e) {
    fail(res, e);
  }
}

export async function downloadDocHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.docId);
  if (!Number.isFinite(id)) return bad(res);
  const owner = await getFeatureRowByDoc(id);
  if (!owner || !isSystemFeatureInScope(scopeOf(req), owner)) return res.status(404).json({ error: "Không tìm thấy tài liệu" });
  const d = await getDoc(id);
  if (!d) return res.status(404).json({ error: "Không tìm thấy tài liệu" });
  res.setHeader("Content-Type", d.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  const ascii = d.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // ?inline=1 (nút Xem): PDF/ảnh mở ngay trên trình duyệt; loại khác vẫn tải về.
  const inline = req.query.inline === "1" && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(d.mime);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.send(d.data);
}

export async function deleteDocHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.docId);
  if (!Number.isFinite(id)) return bad(res);
  const owner = await getFeatureRowByDoc(id);
  if (!owner || !isSystemFeatureInScope(scopeOf(req), owner)) return res.status(404).json({ error: "Không tìm thấy tài liệu" });
  const f = await deleteDoc(id, actorOf(req));
  if (!f) return res.status(404).json({ error: "Không tìm thấy tài liệu" });
  res.json(f);
}

export async function eventsHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  if (!(await accessible(req, res, id))) return;
  res.json(await listEvents(id));
}

export async function progressHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return bad(res);
  if (!(await accessible(req, res, id))) return;
  try {
    const f = await updateProgress(id, req.body ?? {}, actorOf(req));
    if (!f) return res.status(404).json({ error: "Không tìm thấy tính năng" });
    res.json(f);
  } catch (e) {
    fail(res, e);
  }
}
