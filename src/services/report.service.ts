import { randomUUID } from "node:crypto";
import { db } from "../db/database.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { fillPptx, type FillData } from "./pptx.service.js";
import { ReportError, getTemplateFile, type TemplateField } from "./reportTemplate.service.js";
import { listReportComments } from "./reportComment.service.js";
import { imageMetaByCode, imageRowsForExport } from "./reportImage.service.js";
import { childPeriods, exportFileName, periodLabel, periodShort, previousPeriod, validIdx, type PeriodType } from "./reportPeriod.util.js";

export { ReportError };

// ---- Nội dung từng đầu mục (JSON trong report_sections.content_json) ----
export interface TableRow {
  id: string;
  ten: string;
  don_vi: string;
  ke_hoach: number | null;
  thuc_hien: number | null;
  edited?: { ke_hoach?: boolean; thuc_hien?: boolean }; // ô đã sửa tay (không bị ghi đè khi cập nhật lại)
  manual?: boolean; // dòng thêm tay (không bị xoá khi cập nhật lại)
}
export interface ListItem {
  id: string;
  text: string;
  selected?: boolean; // chỉ có ở danh sách "gợi ý từ kỳ con": false = chưa tick, không đưa vào báo cáo
  src?: string; // nhãn kỳ con nguồn (VD "T7")
}
export type Content = { rows?: TableRow[]; items?: ListItem[]; text?: string };

const newId = () => randomUUID().slice(0, 8);
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

// Làm sạch nội dung client gửi lên theo kiểu đầu mục.
export function sanitizeContent(kind: string, raw: any): Content {
  if (kind === "table") {
    const rows = Array.isArray(raw?.rows) ? raw.rows : [];
    return {
      rows: rows.slice(0, 200).map((r: any) => ({
        id: str(r?.id) || newId(),
        ten: str(r?.ten),
        don_vi: str(r?.don_vi),
        ke_hoach: numOrNull(r?.ke_hoach),
        thuc_hien: numOrNull(r?.thuc_hien),
        ...(r?.edited ? { edited: { ke_hoach: !!r.edited.ke_hoach, thuc_hien: !!r.edited.thuc_hien } } : {}),
        ...(r?.manual ? { manual: true } : {}),
      })),
    };
  }
  if (kind === "list") {
    const items = Array.isArray(raw?.items) ? raw.items : [];
    return {
      items: items.slice(0, 200).map((i: any) => ({
        id: str(i?.id) || newId(),
        text: str(i?.text),
        ...(typeof i?.selected === "boolean" ? { selected: i.selected } : {}),
        ...(str(i?.src) ? { src: str(i.src) } : {}),
      })),
    };
  }
  if (kind === "paragraph") return { text: String(raw?.text ?? "").slice(0, 20000) };
  return {};
}

function isEmpty(kind: string, c: Content | undefined): boolean {
  if (!c) return true;
  if (kind === "table") return !(c.rows ?? []).some((r) => r.ten);
  if (kind === "list") return !(c.items ?? []).some((i) => i.text && i.selected !== false);
  if (kind === "paragraph") return !(c.text ?? "").trim();
  return false;
}

async function loadFields(templateId: number): Promise<TemplateField[]> {
  return (await db("report_template_fields").where({ template_id: templateId, is_hidden: false }).orderBy("thu_tu", "asc")) as TemplateField[];
}
async function loadSections(reportId: number): Promise<Map<string, Content>> {
  const rows = (await db("report_sections").where({ report_id: reportId })) as any[];
  return new Map(rows.map((r) => [r.code, r.content_json ? (JSON.parse(r.content_json) as Content) : {}]));
}
async function getRawReport(id: number) {
  return (await db("reports").where({ id, is_deleted: false }).first()) as any | undefined;
}
async function findReport(dept: number, type: PeriodType, year: number, idx: number) {
  return (await db("reports").where({ department_id: dept, period_type: type, year, idx, is_deleted: false }).first()) as any | undefined;
}
async function saveSection(reportId: number, code: string, content: Content) {
  const json = JSON.stringify(content);
  const hit = await db("report_sections").where({ report_id: reportId, code }).first();
  if (hit) await db("report_sections").where({ id: hit.id }).update({ content_json: json, updated_at: db.fn.now() });
  else await db("report_sections").insert({ report_id: reportId, code, content_json: json });
}
const touch = (id: number, extra: Record<string, unknown> = {}) =>
  db("reports").where({ id }).update({ updated_at: db.fn.now(), rev: db.raw("rev + 1"), ...extra });

// ---- Tổng quan năm (màn hình chọn kỳ) ----
export async function overview(departmentId: number, year: number) {
  const reports = (await db("reports").where({ department_id: departmentId, year, is_deleted: false }).select("id", "period_type", "idx", "status", "last_exported_at")) as any[];
  const templates = (await db("report_templates").where({ department_id: departmentId }).select("period_type")) as any[];
  // Số góp ý CHƯA XỬ LÝ theo từng báo cáo (để hiện chấm đỏ ở tháng/quý/năm) và theo năm (để biết năm khác có góp ý).
  const openRows = (await db("report_comments as c")
    .join("reports as r", "r.id", "c.report_id")
    .where({ "r.department_id": departmentId, "r.is_deleted": false, "c.is_deleted": false, "c.status": "open" })
    .groupBy("r.id", "r.year")
    .select("r.id", "r.year")
    .count({ n: "*" })) as any[];
  const openById = new Map(openRows.map((r) => [Number(r.id), Number(r.n)]));
  const openByYear: Record<number, number> = {};
  for (const r of openRows) openByYear[Number(r.year)] = (openByYear[Number(r.year)] ?? 0) + Number(r.n);
  return {
    reports: reports.map((r) => ({ ...r, open_comments: openById.get(Number(r.id)) ?? 0 })),
    templates: templates.map((t) => t.period_type),
    open_by_year: openByYear,
  };
}

// ---- Tổng hợp từ kỳ con ----
async function childReports(dept: number, type: PeriodType, year: number, idx: number) {
  const defs = childPeriods(type, year, idx);
  const found: { def: (typeof defs)[number]; report: any | undefined }[] = [];
  for (const d of defs) found.push({ def: d, report: await findReport(dept, d.type, d.year, d.idx) });
  return found;
}

function aggregateSum(children: { def: any; sections: Map<string, Content> }[], code: string): TableRow[] {
  const map = new Map<string, TableRow>();
  for (const ch of children) {
    for (const r of ch.sections.get(code)?.rows ?? []) {
      if (!r.ten) continue;
      const key = norm(r.ten);
      const cur = map.get(key) ?? { id: newId(), ten: r.ten, don_vi: r.don_vi, ke_hoach: null, thuc_hien: null };
      if (r.ke_hoach != null) cur.ke_hoach = (cur.ke_hoach ?? 0) + r.ke_hoach;
      if (r.thuc_hien != null) cur.thuc_hien = (cur.thuc_hien ?? 0) + r.thuc_hien;
      if (!cur.don_vi) cur.don_vi = r.don_vi;
      map.set(key, cur);
    }
  }
  return [...map.values()];
}

function aggregateSuggest(children: { def: any; sections: Map<string, Content> }[], code: string, type: PeriodType): ListItem[] {
  const out: ListItem[] = [];
  for (const ch of children) {
    const label = periodShort(ch.def.type, ch.def.idx);
    for (const i of ch.sections.get(code)?.items ?? []) {
      if (i.text && i.selected !== false) out.push({ id: newId(), text: i.text, selected: false, src: label });
    }
  }
  return out;
}

async function priorYearSection(dept: number, type: PeriodType, year: number, idx: number, fields: TemplateField[], code: string): Promise<Content | null> {
  const prior = await findReport(dept, type, year - 1, idx);
  if (!prior) return null;
  const sections = await loadSections(prior.id);
  const own = sections.get(code);
  if (own && !isEmpty("table", own)) return JSON.parse(JSON.stringify(own));
  const ref = fields.find((f) => f.kind === "table" && f.source === "sum" && sections.has(f.code));
  return ref ? JSON.parse(JSON.stringify(sections.get(ref.code))) : null;
}

// Tính nội dung gộp cho các đầu mục có nguồn tự động; trả {code: content} + snapshot kỳ con.
async function aggregate(report: any, fields: TemplateField[]) {
  const type = report.period_type as PeriodType;
  const kids = await childReports(report.department_id, type, report.year, report.idx);
  const children = [] as { def: any; report: any; sections: Map<string, Content> }[];
  for (const k of kids) if (k.report) children.push({ def: k.def, report: k.report, sections: await loadSections(k.report.id) });
  const result = new Map<string, Content>();
  for (const f of fields) {
    if (f.source === "sum" && f.kind === "table" && children.length) result.set(f.code, { rows: aggregateSum(children, f.code) });
    else if (f.source === "suggest" && f.kind === "list" && children.length) result.set(f.code, { items: aggregateSuggest(children, f.code, type) });
    else if (f.source === "last" && children.length) {
      const last = [...children].reverse().find((c) => c.sections.has(f.code) && !isEmpty(f.kind, c.sections.get(f.code)));
      if (last) result.set(f.code, JSON.parse(JSON.stringify(last.sections.get(f.code))));
    } else if (f.source === "prior_year" && f.kind === "table") {
      const p = await priorYearSection(report.department_id, type, report.year, report.idx, fields, f.code);
      if (p) {
        // chỉ giữ số liệu kỳ trước làm tham chiếu
        result.set(f.code, p);
      }
    }
  }
  const snapshot = { children: Object.fromEntries(children.map((c) => [String(c.report.id), Number(c.report.rev ?? 0)])) };
  return { result, snapshot, missing: kids.filter((k) => !k.report).map((k) => ({ type: k.def.type, idx: k.def.idx, label: periodLabel(k.def.type, report.year, k.def.idx) })) };
}

// ---- Tạo báo cáo ----
export async function createReport(dept: number, type: PeriodType, year: number, idx: number, byUser: string | null, scope: DataScope) {
  assertDepartmentInScope(scope, dept);
  if (!validIdx(type, idx) || !Number.isInteger(year) || year < 2000 || year > 2100) throw new ReportError("Kỳ báo cáo không hợp lệ.");
  const tpl = (await db("report_templates").where({ department_id: dept, period_type: type }).select("id").first()) as any;
  if (!tpl) throw new ReportError("Chưa có file mẫu cho loại kỳ này — hãy tải mẫu lên ở tab Mẫu PowerPoint.");
  if (await findReport(dept, type, year, idx)) throw new ReportError("Báo cáo của kỳ này đã tồn tại.");

  const fields = await loadFields(tpl.id);
  const [row] = await db("reports").insert({ department_id: dept, period_type: type, year, idx, template_id: tpl.id, created_by: byUser }).returning("id");
  const id = typeof row === "object" ? (row as any).id : (row as number);
  const report = await getRawReport(id);

  const agg = await aggregate(report, fields);
  const prev = previousPeriod(type, year, idx);
  const prevReport = type === "month" && prev ? await findReport(dept, type, prev.year, prev.idx) : undefined;
  const prevSections = prevReport ? await loadSections(prevReport.id) : new Map<string, Content>();
  for (const f of fields) {
    if (f.kind === "auto" || f.kind === "image") continue;
    let content: Content = agg.result.get(f.code) ?? (f.kind === "table" ? { rows: [] } : f.kind === "list" ? { items: [] } : { text: "" });
    // Tháng: bảng "mang sang" giữ tên chỉ tiêu + đơn vị, bỏ số liệu.
    if (type === "month" && f.kind === "table" && f.carry_over && f.source !== "prior_year") {
      const old = prevSections.get(f.code)?.rows ?? [];
      content = { rows: old.filter((r) => r.ten).map((r) => ({ id: newId(), ten: r.ten, don_vi: r.don_vi, ke_hoach: null, thuc_hien: null })) };
    }
    await saveSection(id, f.code, content);
  }
  await db("reports").where({ id }).update({ snapshot_json: JSON.stringify(agg.snapshot) });
  return { id, missing_children: agg.missing };
}

// ---- Đọc báo cáo ----
export async function getReport(id: number, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) return null;
  assertDepartmentInScope(scope, report.department_id);
  const type = report.period_type as PeriodType;
  const tpl = (await db("report_templates").where({ department_id: report.department_id, period_type: type }).select("id", "file_name", "version", "slide_count").first()) as any;
  const fields = tpl ? await loadFields(tpl.id) : [];
  const sections = await loadSections(id);
  const images = await imageMetaByCode(id);

  // Cảnh báo: kỳ con đổi sau lúc tổng hợp / kỳ con còn thiếu.
  const snapshot = report.snapshot_json ? JSON.parse(report.snapshot_json) : { children: {} };
  const kids = await childReports(report.department_id, type, report.year, report.idx);
  const changed: { label: string }[] = [];
  for (const k of kids) {
    const label = periodLabel(k.def.type, report.year, k.def.idx);
    const snap = k.report ? snapshot.children?.[String(k.report.id)] : undefined;
    if (k.report && snap !== undefined && Number(k.report.rev ?? 0) !== Number(snap)) changed.push({ label });
    else if (k.report && snap === undefined && Object.keys(snapshot.children ?? {}).length > 0) changed.push({ label });
  }
  const missingChildren = kids.filter((k) => !k.report).map((k) => ({ label: periodLabel(k.def.type, report.year, k.def.idx) }));

  // Gợi ý mang sang từ kỳ liền trước (danh sách có carry_over).
  const prev = previousPeriod(type, report.year, report.idx);
  const prevReport = prev ? await findReport(report.department_id, type, prev.year, prev.idx) : undefined;
  const prevSections = prevReport ? await loadSections(prevReport.id) : new Map<string, Content>();
  const prevLabel = prev ? periodLabel(type, prev.year, prev.idx) : "";

  const out = fields.map((f) => {
    if (f.kind === "image") {
      const meta = images.get(f.code);
      return { ...f, content: meta ?? { has_image: false, caption: "" }, filled: !!meta, carry_count: 0 };
    }
    const content = sections.get(f.code) ?? (f.kind === "table" ? { rows: [] } : f.kind === "list" ? { items: [] } : { text: "" });
    const carry = f.carry_over && f.kind === "list" ? (prevSections.get(f.code)?.items ?? []).filter((i) => i.text && i.selected !== false).length : 0;
    return { ...f, content, filled: f.kind === "auto" ? true : !isEmpty(f.kind, content), carry_count: carry };
  });
  return {
    id: report.id, department_id: report.department_id, period_type: type, year: report.year, idx: report.idx,
    status: report.status, label: periodLabel(type, report.year, report.idx), file_name: tpl?.file_name ?? null,
    slide_count: tpl?.slide_count ?? 0, last_exported_at: report.last_exported_at, updated_at: report.updated_at,
    has_prev: !!prevReport, prev_label: prevLabel, fields: out,
    comments: await listReportComments(id),
    changed_children: changed, missing_children: missingChildren,
  };
}

// ---- Sửa nội dung 1 đầu mục (tự lưu nháp) ----
export async function updateSection(id: number, code: string, rawContent: any, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) return null;
  assertDepartmentInScope(scope, report.department_id);
  const tpl = (await db("report_templates").where({ department_id: report.department_id, period_type: report.period_type }).first()) as any;
  const f = tpl ? ((await db("report_template_fields").where({ template_id: tpl.id, code }).first()) as TemplateField | undefined) : undefined;
  if (!f) throw new ReportError("Không tìm thấy đầu mục.");
  if (f.kind === "auto") throw new ReportError("Đầu mục tự điền, không sửa được.");
  if (f.kind === "image") throw new ReportError("Đầu mục Hình ảnh: hãy dùng chức năng tải ảnh.");
  const content = sanitizeContent(f.kind, rawContent);
  await saveSection(id, code, content);
  await touch(id, { status: "draft" });
  return content;
}

// ---- Sao chép từ kỳ trước ----
export async function copyFromPrevious(id: number, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const prev = previousPeriod(report.period_type, report.year, report.idx);
  const prevReport = prev ? await findReport(report.department_id, report.period_type, prev.year, prev.idx) : undefined;
  if (!prevReport) throw new ReportError("Chưa có báo cáo kỳ trước để sao chép.");
  const tpl = (await db("report_templates").where({ department_id: report.department_id, period_type: report.period_type }).first()) as any;
  const fields = await loadFields(tpl.id);
  const prevSections = await loadSections(prevReport.id);
  for (const f of fields) {
    if (f.kind === "auto" || f.kind === "image") continue;
    const c = prevSections.get(f.code);
    if (!c) continue;
    const copy = JSON.parse(JSON.stringify(c)) as Content;
    for (const r of copy.rows ?? []) r.id = newId();
    for (const i of copy.items ?? []) i.id = newId();
    await saveSection(id, f.code, copy);
  }
  await touch(id, { status: "draft" });
}

// Lấy lại các dòng của danh sách kỳ trước vào đầu mục (nút "Lấy từ tháng X (N dòng)").
export async function pullPrevious(id: number, code: string, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const prev = previousPeriod(report.period_type, report.year, report.idx);
  const prevReport = prev ? await findReport(report.department_id, report.period_type, prev.year, prev.idx) : undefined;
  const prevItems = prevReport ? ((await loadSections(prevReport.id)).get(code)?.items ?? []).filter((i) => i.text && i.selected !== false) : [];
  if (prevItems.length === 0) throw new ReportError("Kỳ trước không có dòng nào để lấy.");
  const cur = (await loadSections(id)).get(code) ?? {};
  const have = new Set((cur.items ?? []).map((i) => norm(i.text)));
  const merged = [...(cur.items ?? []), ...prevItems.filter((i) => !have.has(norm(i.text))).map((i) => ({ id: newId(), text: i.text }))];
  await saveSection(id, code, { items: merged });
  await touch(id, { status: "draft" });
}

// ---- Cập nhật lại từ kỳ con (không tự ghi đè: chỉ khi người dùng bấm) ----
export async function refreshFromChildren(id: number, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const tpl = (await db("report_templates").where({ department_id: report.department_id, period_type: report.period_type }).first()) as any;
  const fields = await loadFields(tpl.id);
  const agg = await aggregate(report, fields);
  const current = await loadSections(id);
  for (const f of fields) {
    const fresh = agg.result.get(f.code);
    if (!fresh) continue;
    const old = current.get(f.code);
    if (f.kind === "table" && f.source === "sum") {
      // giữ ô đã sửa tay + dòng thêm tay
      const oldByKey = new Map((old?.rows ?? []).map((r) => [norm(r.ten), r]));
      const rows = (fresh.rows ?? []).map((r) => {
        const o = oldByKey.get(norm(r.ten));
        if (!o?.edited) return r;
        return { ...r, edited: o.edited, ke_hoach: o.edited.ke_hoach ? o.ke_hoach : r.ke_hoach, thuc_hien: o.edited.thuc_hien ? o.thuc_hien : r.thuc_hien };
      });
      for (const o of old?.rows ?? []) if (o.manual && !rows.some((r) => norm(r.ten) === norm(o.ten))) rows.push(o);
      await saveSection(id, f.code, { rows });
    } else if (f.kind === "list" && f.source === "suggest") {
      const keep = new Map((old?.items ?? []).filter((i) => i.src && i.selected).map((i) => [norm(i.text), true]));
      const items = (fresh.items ?? []).map((i) => (keep.has(norm(i.text)) ? { ...i, selected: true } : i));
      for (const o of old?.items ?? []) if (!o.src && !items.some((i) => norm(i.text) === norm(o.text))) items.push(o);
      await saveSection(id, f.code, { items });
    } else {
      await saveSection(id, f.code, fresh);
    }
  }
  await db("reports").where({ id }).update({ snapshot_json: JSON.stringify(agg.snapshot) });
  await touch(id, { status: "draft" });
}

export async function deleteReport(id: number, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) return false;
  assertDepartmentInScope(scope, report.department_id);
  await db("reports").where({ id }).update({ is_deleted: true, deleted_at: db.fn.now() });
  return true;
}

// ---- Xuất PowerPoint ----
const fmtNum = (n: number | null) => (n == null ? "" : n.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
export function ratio(r: { ke_hoach: number | null; thuc_hien: number | null }): number | null {
  return r.ke_hoach && r.thuc_hien != null ? (r.thuc_hien / r.ke_hoach) * 100 : null;
}

export async function exportReport(id: number, byUser: string | null, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) throw new ReportError("Không tìm thấy báo cáo.");
  assertDepartmentInScope(scope, report.department_id);
  const type = report.period_type as PeriodType;
  const tplFile = await getTemplateFile(report.department_id, type);
  if (!tplFile) throw new ReportError("Chưa có file mẫu cho loại kỳ này.");
  const fields = await loadFields(tplFile.id);
  const sections = await loadSections(id);
  const label = periodLabel(type, report.year, report.idx);

  const data: FillData = {};
  const missingRequired: string[] = [];
  const imageRows = new Map((await imageRowsForExport(id)).map((r: any) => [r.field_code, r]));
  for (const f of fields) {
    const c = sections.get(f.code);
    if (f.kind === "image") {
      const r = imageRows.get(f.code);
      data[f.code] = {
        kind: "image",
        image: r ? { data: Buffer.from(r.data), ext: String(r.mime).includes("png") ? "png" : "jpg", caption: r.caption ?? "", name: r.file_name ?? "" } : null,
      };
      if (f.required && !r) missingRequired.push(f.label);
      continue;
    }
    if (f.kind === "auto") data[f.code] = { kind: "auto", text: label };
    else if (f.kind === "paragraph") data[f.code] = { kind: "paragraph", text: c?.text ?? "" };
    else if (f.kind === "list") data[f.code] = { kind: "list", items: (c?.items ?? []).filter((i) => i.text && i.selected !== false).map((i) => i.text) };
    else
      data[f.code] = {
        kind: "table",
        rows: (c?.rows ?? []).filter((r) => r.ten).map((r) => {
          const p = ratio(r);
          return { ten: r.ten, don_vi: r.don_vi, ke_hoach: fmtNum(r.ke_hoach), thuc_hien: fmtNum(r.thuc_hien), ty_le: p == null ? "" : `${p.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` };
        }),
      };
    if (f.required && f.kind !== "auto" && isEmpty(f.kind, c)) missingRequired.push(f.label);
  }
  // Góp ý của báo cáo -> Comment của slide trong file xuất (kèm tên đầu mục + trạng thái).
  const labelByCode = new Map(fields.map((f) => [f.code, f.label]));
  const slideByCode = new Map(fields.map((f) => [f.code, f.slide_no]));
  const comments = (await listReportComments(id))
    .map((c) => ({
      slide_no: slideByCode.get(c.field_code) ?? c.slide_no ?? 1,
      author: c.author_name ?? "Góp ý",
      date: (c.created_at as unknown) instanceof Date ? (c.created_at as unknown as Date) : new Date(String(c.created_at).replace(" ", "T") + (String(c.created_at).includes("T") ? "" : "Z")),
      text: `${c.status === "resolved" ? "[Đã xử lý] " : ""}[${labelByCode.get(c.field_code) ?? c.field_code}] ${c.content}`,
    }));
  const file = await fillPptx(Buffer.from(tplFile.file_data), data, comments);
  const fileName = exportFileName(type, report.year, report.idx);
  const last = (await db("report_versions").where({ report_id: id }).max({ m: "version_no" }).first()) as any;
  const versionNo = Number(last?.m ?? 0) + 1;
  await db("report_versions").insert({ report_id: id, version_no: versionNo, file_name: fileName, file_data: file, created_by: byUser });
  await db("reports").where({ id }).update({ status: "exported", last_exported_at: db.fn.now() });
  return { file, fileName, versionNo, missingRequired };
}

export async function listVersions(id: number, scope: DataScope) {
  const report = await getRawReport(id);
  if (!report) return [];
  assertDepartmentInScope(scope, report.department_id);
  return db("report_versions").where({ report_id: id }).select("id", "version_no", "file_name", "created_by", "created_at").orderBy("version_no", "desc");
}
export async function getVersionFile(versionId: number, scope: DataScope) {
  const v = (await db("report_versions").where({ id: versionId }).first()) as any;
  if (!v) return null;
  const report = await getRawReport(v.report_id);
  if (!report) return null;
  assertDepartmentInScope(scope, report.department_id);
  return v as { file_name: string; file_data: Buffer };
}
