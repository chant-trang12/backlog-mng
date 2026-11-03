import type { Request, Response } from "express";
import * as tpl from "../services/reportTemplate.service.js";
import * as rep from "../services/report.service.js";
import { buildSamplePptx } from "../services/pptxSample.service.js";
import { isPeriodType, type PeriodType } from "../services/reportPeriod.util.js";
import { parsePositiveInt } from "../utils/validate.js";
import { resolveListDepartmentId, SCOPE_EMPTY, type DataScope } from "../services/scope.util.js";

function scopeOf(req: Request): DataScope {
  return req.dataScope ?? { all: true, departmentId: null };
}
// Phòng ban thao tác: role bị giới hạn luôn là phòng của chính họ; admin/full-access phải chọn 1 phòng cụ thể.
function deptOf(req: Request): number | null {
  const scope = scopeOf(req);
  if (!scope.all) return scope.departmentId;
  const raw = req.query.department_id ?? req.body?.department_id;
  const n = raw != null && raw !== "" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}
function byUser(req: Request): string | null {
  return req.appUser?.name ?? req.appUser?.username ?? null;
}
function typeOf(req: Request): PeriodType | null {
  const t = req.params.type ?? req.body?.period_type;
  return isPeriodType(t) ? t : null;
}
function fail(res: Response, e: unknown) {
  if (e instanceof tpl.ReportError) return res.status(400).json({ error: e.message });
  throw e;
}
const NEED_DEPT = { error: "Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban trước." };

// ---- Mẫu ----
export async function listTemplatesHandler(req: Request, res: Response) {
  const d = deptOf(req);
  if (d == null) return res.json([]);
  res.json(await tpl.listTemplates(d));
}
export async function getTemplateHandler(req: Request, res: Response) {
  const d = deptOf(req);
  const t = typeOf(req);
  if (d == null || !t) return res.status(400).json(NEED_DEPT);
  res.json(await tpl.getTemplate(d, t));
}
export async function downloadTemplateHandler(req: Request, res: Response) {
  const d = deptOf(req);
  const t = typeOf(req);
  if (d == null || !t) return res.status(400).json(NEED_DEPT);
  const row = await tpl.getTemplateFile(d, t);
  if (!row) return res.status(404).json({ error: "Chưa có file mẫu" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
  res.send(Buffer.from(row.file_data));
}
export async function uploadTemplateHandler(req: Request, res: Response) {
  const d = deptOf(req);
  const t = typeOf(req);
  if (d == null || !t) return res.status(400).json(NEED_DEPT);
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Thiếu file .pptx" });
  const fileName = typeof req.query.file_name === "string" && req.query.file_name ? req.query.file_name : "mau.pptx";
  try {
    res.json(await tpl.uploadTemplate(d, t, req.body, fileName, byUser(req), scopeOf(req), req.query.dry_run === "1"));
  } catch (e) {
    if (e instanceof Error && !(e instanceof tpl.ReportError)) return res.status(400).json({ error: e.message });
    fail(res, e);
  }
}
export async function updateFieldsHandler(req: Request, res: Response) {
  const d = deptOf(req);
  const t = typeOf(req);
  if (d == null || !t) return res.status(400).json(NEED_DEPT);
  try {
    res.json(await tpl.updateTemplateFields(d, t, Array.isArray(req.body?.fields) ? req.body.fields : [], scopeOf(req)));
  } catch (e) {
    fail(res, e);
  }
}

// File mẫu VÍ DỤ (sinh sẵn, không cần mẫu đã tải lên) — để xem cách gán mã {{...}}.
export async function sampleTemplateHandler(req: Request, res: Response) {
  const t = typeOf(req);
  if (!t) return res.status(400).json({ error: "Loại kỳ không hợp lệ" });
  const buf = await buildSamplePptx(t);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(`Mau_VD_BaoCao_${t}.pptx`)}`);
  res.send(buf);
}

// ---- Báo cáo ----
export async function overviewHandler(req: Request, res: Response) {
  const year = Number(req.query.year);
  const requested = req.query.department_id != null ? Number(req.query.department_id) : null;
  const d = resolveListDepartmentId(scopeOf(req), requested);
  if (d === SCOPE_EMPTY || d == null) return res.json({ reports: [], templates: [] });
  res.json(await rep.overview(d, year));
}
export async function createReportHandler(req: Request, res: Response) {
  const d = deptOf(req);
  const t = typeOf(req);
  if (d == null) return res.status(400).json(NEED_DEPT);
  if (!t) return res.status(400).json({ error: "Loại kỳ không hợp lệ" });
  try {
    res.status(201).json(await rep.createReport(d, t, Number(req.body?.year), Number(req.body?.idx), byUser(req), scopeOf(req)));
  } catch (e) {
    fail(res, e);
  }
}
const idOf = (req: Request) => parsePositiveInt(String(req.params.id ?? ""));
export async function getReportHandler(req: Request, res: Response) {
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  const r = await rep.getReport(id, scopeOf(req));
  if (!r) return res.status(404).json({ error: "Không tìm thấy báo cáo" });
  res.json(r);
}
export async function updateSectionHandler(req: Request, res: Response) {
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const c = await rep.updateSection(id, String(req.params.code), req.body?.content, scopeOf(req));
    if (!c) return res.status(404).json({ error: "Không tìm thấy báo cáo" });
    res.json(c);
  } catch (e) {
    fail(res, e);
  }
}
function simple(fn: (id: number, req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    const id = idOf(req);
    if (!id) return res.status(400).json({ error: "id không hợp lệ" });
    try {
      await fn(id, req);
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  };
}
export const copyPreviousHandler = simple((id, req) => rep.copyFromPrevious(id, scopeOf(req)));
export const pullPreviousHandler = simple((id, req) => rep.pullPrevious(id, String(req.params.code), scopeOf(req)));
export const refreshHandler = simple((id, req) => rep.refreshFromChildren(id, scopeOf(req)));
export async function deleteReportHandler(req: Request, res: Response) {
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await rep.deleteReport(id, scopeOf(req)))) return res.status(404).json({ error: "Không tìm thấy báo cáo" });
  res.status(204).end();
}
export async function exportReportHandler(req: Request, res: Response) {
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const r = await rep.exportReport(id, byUser(req), scopeOf(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(r.fileName)}`);
    res.setHeader("X-Missing-Required", encodeURIComponent(JSON.stringify(r.missingRequired)));
    res.setHeader("X-Version-No", String(r.versionNo));
    res.setHeader("Access-Control-Expose-Headers", "X-Missing-Required, X-Version-No, Content-Disposition");
    res.send(r.file);
  } catch (e) {
    fail(res, e);
  }
}
export async function listVersionsHandler(req: Request, res: Response) {
  const id = idOf(req);
  if (!id) return res.status(400).json({ error: "id không hợp lệ" });
  res.json(await rep.listVersions(id, scopeOf(req)));
}
export async function downloadVersionHandler(req: Request, res: Response) {
  const vid = parsePositiveInt(String(req.params.vid ?? ""));
  if (!vid) return res.status(400).json({ error: "id không hợp lệ" });
  const v = await rep.getVersionFile(vid, scopeOf(req));
  if (!v) return res.status(404).json({ error: "Không tìm thấy phiên bản" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(v.file_name)}`);
  res.send(Buffer.from(v.file_data));
}
