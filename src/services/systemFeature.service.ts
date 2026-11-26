import { createHash } from "node:crypto";
import { db } from "../db/database.js";
import { getSystem, nextSystemCode, DEFAULT_DOC_TYPES, SystemError, type DocType } from "./system.service.js";
import { validateAttachmentFile } from "../utils/fileValidation.js";
import { removeFile, resolveStored, saveFile } from "../utils/fileStorage.js";
import { softDeleteWhere } from "./softDelete.util.js";

// cho_duyet / tu_choi do Yêu cầu tính năng gốc quyết định (không chọn tay).
export const FEATURE_STATUSES = ["chua_bat_dau", "dang_thuc_hien", "cho_nghiem_thu", "hoan_thanh", "cho_duyet", "tu_choi"] as const;
const REQUEST_OWNED = ["cho_duyet", "tu_choi"];
export const PRIORITIES = ["thap", "trung_binh", "cao"] as const;
export interface Actor {
  name?: string | null;
}
async function logEvent(featureId: number, kind: string, text: string, actor?: Actor) {
  await db("system_feature_events").insert({ feature_id: featureId, kind, text: text.slice(0, 1000), actor: actor?.name ?? null });
}
export async function listEvents(featureId: number) {
  return db("system_feature_events").where({ feature_id: featureId }).orderBy("id", "desc").limit(50);
}

export const MAX_DOC_BYTES = 50 * 1024 * 1024;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DAY = 86400000;
const dayNum = (s: string) => Math.floor(Date.parse(`${s}T00:00:00Z`) / DAY);

// Bỏ dấu + hạ chữ thường để so khớp tên hệ thống người dùng gõ với danh mục.
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export async function findSystemIdByName(name: unknown): Promise<number | null> {
  const n = norm(name);
  if (!n) return null;
  const rows = (await db("he_thong_options").select("id", "ten_he_thong")) as any[];
  return rows.find((r) => norm(r.ten_he_thong) === n)?.id ?? null;
}

// Tên hệ thống ở yêu cầu chưa có trong danh mục -> tự thêm hệ thống mới (trạng thái Đang phát triển, chưa có đơn vị quản lý)
// để mọi yêu cầu đều được chia theo hệ thống. Trùng/gõ sai thì dùng "Chưa phân loại → Gán" hoặc xoá ở Cấu hình > Hệ thống.
async function resolveOrCreateSystem(name: unknown): Promise<number | null> {
  const clean = String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 255);
  if (!clean) return null;
  const found = await findSystemIdByName(clean);
  if (found != null) return found;
  try {
    const maxRow = await db("he_thong_options").max({ m: "thu_tu" }).first();
    const [created] = await db("he_thong_options")
      .insert({ ten_he_thong: clean, thu_tu: Number((maxRow as any)?.m ?? -1) + 1, ma_he_thong: await nextSystemCode(), trang_thai: "dang_phat_trien", updated_at: db.fn.now() })
      .returning("id");
    return Number(typeof created === "object" ? (created as any).id : created);
  } catch {
    return findSystemIdByName(clean); // vừa được tạo ở nơi khác
  }
}

async function nextCode(systemId: number | null): Promise<string> {
  const q = db("system_features").where({ is_deleted: false }).select("ma_tinh_nang");
  if (systemId == null) q.whereNull("system_id");
  else q.where({ system_id: systemId });
  let max = 0;
  for (const r of (await q) as any[]) {
    const m = /^TN-(\d+)$/i.exec(String(r.ma_tinh_nang));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TN-${String(max + 1).padStart(2, "0")}`;
}

// Chữ viết tắt loại tài liệu: 2 chữ cái đầu của 2 từ đầu (Đặc tả -> ĐT, Thiết kế -> TK, Test case -> TC).
export function docAbbr(label: string): string {
  const w = label.trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return label.trim().slice(0, 2).toUpperCase();
}

async function requiredDocsOf(systemId: number | null): Promise<DocType[]> {
  if (systemId == null) return DEFAULT_DOC_TYPES.filter((d) => d.required);
  const s = await getSystem(systemId);
  return (s?.tai_lieu_bat_buoc ?? DEFAULT_DOC_TYPES).filter((d) => d.required);
}

async function view(r: any, docsByFeature: Map<number, any[]>, deptNames: Map<number, string>, required: DocType[], frInfo: Map<number, any>) {
  const fr = r.feature_request_id != null ? frInfo.get(Number(r.feature_request_id)) : undefined;
  const docs = docsByFeature.get(r.id) ?? [];
  const have = new Set(docs.map((d) => d.doc_key));
  const today = dayNum(ymd(new Date()));
  let display = r.trang_thai as string;
  let overdueDays = 0;
  let lateDays = 0;
  if (r.trang_thai === "hoan_thanh") {
    if (r.ngay_hoan_thanh_thuc_te && r.han_hoan_thanh) lateDays = Math.max(0, dayNum(r.ngay_hoan_thanh_thuc_te) - dayNum(r.han_hoan_thanh));
  } else if (!REQUEST_OWNED.includes(r.trang_thai) && r.han_hoan_thanh && dayNum(r.han_hoan_thanh) < today) {
    display = "qua_han";
    overdueDays = today - dayNum(r.han_hoan_thanh);
  }
  return {
    id: r.id,
    system_id: r.system_id ?? null,
    ma_tinh_nang: r.ma_tinh_nang,
    ten: r.ten,
    mo_ta: r.mo_ta ?? "",
    muc_uu_tien: r.muc_uu_tien,
    don_vi_thuc_hien_id: r.don_vi_thuc_hien_id ?? null,
    don_vi_thuc_hien_name: r.don_vi_thuc_hien_id != null ? deptNames.get(r.don_vi_thuc_hien_id) ?? null : null,
    don_vi_yeu_cau_id: r.don_vi_yeu_cau_id ?? null,
    don_vi_yeu_cau_name: r.don_vi_yeu_cau_id != null ? deptNames.get(r.don_vi_yeu_cau_id) ?? null : null,
    nguoi_yeu_cau: r.nguoi_yeu_cau ?? "",
    so_van_ban: r.so_van_ban ?? "",
    ngay_yeu_cau: r.ngay_yeu_cau ?? "",
    ngay_bat_dau: r.ngay_bat_dau ?? "",
    han_hoan_thanh: r.han_hoan_thanh ?? "",
    ngay_hoan_thanh_thuc_te: r.ngay_hoan_thanh_thuc_te ?? "",
    nguoi_phu_trach_id: r.nguoi_phu_trach_id ?? null,
    nguoi_phu_trach_name: r.nguoi_phu_trach_name ?? "",
    trang_thai: r.trang_thai,
    trang_thai_hien_thi: display,
    qua_han_ngay: overdueDays,
    tre_ngay: lateDays,
    feature_request_id: r.feature_request_id ?? null,
    // Lịch gốc đơn vị đề xuất mong muốn vs lịch đơn vị thực hiện xác nhận (từ Yêu cầu tính năng).
    han_mong_muon: fr && typeof fr.thoi_gian_mong_muon === "string" ? fr.thoi_gian_mong_muon.slice(0, 10) : "",
    han_du_kien: fr?.thoi_gian_du_kien ?? "",
    ly_do_dieu_chinh: fr?.ly_do_dieu_chinh ?? "",
    he_thong_goc: r.he_thong_goc ?? "",
    docs: docs.map((d) => ({ id: d.id, doc_key: d.doc_key, filename: d.filename, size: d.size, version: d.version ?? "", release_date: d.release_date ?? "", change_note: d.change_note ?? "", uploaded_by_name: d.uploaded_by_name ?? "", created_at: d.created_at })),
    tien_do: r.trang_thai === "hoan_thanh" ? 100 : Number(r.tien_do ?? 0),
    phien_ban_phat_hanh: r.phien_ban_phat_hanh ?? "",
    con_ngay: r.trang_thai !== "hoan_thanh" && r.han_hoan_thanh ? dayNum(r.han_hoan_thanh) - today : null,
    required_docs: required.map((d) => ({ key: d.key, label: d.label, sub: d.sub ?? "", abbr: docAbbr(d.label), has: have.has(d.key) })),
    thieu_tai_lieu: !REQUEST_OWNED.includes(r.trang_thai) && required.some((d) => !have.has(d.key)),
    updated_at: r.updated_at ?? r.created_at,
  };
}

async function viewMany(rows: any[], systemId: number | null) {
  const ids = rows.map((r) => r.id);
  const docs = ids.length ? ((await db("system_feature_docs").whereIn("feature_id", ids).orderBy("id", "asc").select("id", "feature_id", "doc_key", "filename", "size", "version", "release_date", "change_note", "uploaded_by_name", "created_at")) as any[]) : [];
  const by = new Map<number, any[]>();
  for (const d of docs) (by.get(d.feature_id) ?? by.set(d.feature_id, []).get(d.feature_id)!).push(d);
  const depts = new Map<number, string>(((await db("departments").select("id", "name")) as any[]).map((d) => [d.id, d.name]));
  const required = await requiredDocsOf(systemId);
  const frIds = rows.map((r) => r.feature_request_id).filter((x) => x != null);
  const frs = frIds.length ? ((await db("feature_requests").whereIn("id", frIds).select("id", "thoi_gian_mong_muon", "thoi_gian_du_kien", "ly_do_dieu_chinh")) as any[]) : [];
  const frInfo = new Map<number, any>(frs.map((f) => [Number(f.id), f]));
  return Promise.all(rows.map((r) => view(r, by, depts, required, frInfo)));
}

// Chỉ tính năng mà phòng đang xem là đơn vị yêu cầu HOẶC đơn vị thực hiện (deptId=null -> không có gì, như Yêu cầu tính năng).
const visibleTo = (deptId: number | null) => (q: any) => q.where((b: any) => b.where("don_vi_yeu_cau_id", deptId).orWhere("don_vi_thuc_hien_id", deptId));

export async function listBySystem(systemId: number, deptId: number | null) {
  if (deptId == null) return [];
  const rows = (await db("system_features").where({ system_id: systemId, is_deleted: false }).modify(visibleTo(deptId)).orderBy("id", "asc")) as any[];
  return viewMany(rows, systemId);
}

// Chưa gán hệ thống (system_id rỗng, hoặc hệ thống đã bị xoá khỏi danh mục).
export async function listUnassigned(deptId: number | null) {
  if (deptId == null) return [];
  const rows = (await db("system_features as f")
    .leftJoin("he_thong_options as h", "h.id", "f.system_id")
    .where("f.is_deleted", false)
    .where((b) => b.where("f.don_vi_yeu_cau_id", deptId).orWhere("f.don_vi_thuc_hien_id", deptId))
    .whereNull("h.id")
    .orderBy("f.id", "asc")
    .select("f.*")) as any[];
  return viewMany(rows, null);
}

// Đơn vị yêu cầu / thực hiện của tính năng sắp tạo (để kiểm tra phạm vi trước khi ghi).
export async function featureDeptsForInput(input: FeatureInput) {
  const yc = Number(input.don_vi_yeu_cau_id);
  const sysId = Number(input.system_id);
  const th = Number.isInteger(sysId) && sysId > 0 ? (await db("he_thong_options").where({ id: sysId }).first("don_vi_quan_ly_id"))?.don_vi_quan_ly_id ?? null : null;
  return { don_vi_yeu_cau_id: Number.isInteger(yc) && yc > 0 ? yc : null, don_vi_thuc_hien_id: th as number | null };
}

export async function getFeatureRow(id: number) {
  return (await db("system_features").where({ id, is_deleted: false }).first()) as any | undefined;
}

export async function getFeatureRowByDoc(docId: number) {
  const d = await db("system_feature_docs").where({ id: docId }).first("feature_id");
  return d ? getFeatureRow(d.feature_id) : undefined;
}

export async function getFeature(id: number) {
  const r = await db("system_features").where({ id, is_deleted: false }).first();
  if (!r) return undefined;
  return (await viewMany([r], r.system_id ?? null))[0];
}

export interface FeatureInput {
  system_id?: unknown;
  ma_tinh_nang?: unknown;
  ten?: unknown;
  mo_ta?: unknown;
  muc_uu_tien?: unknown;
  don_vi_yeu_cau_id?: unknown;
  nguoi_yeu_cau?: unknown;
  so_van_ban?: unknown;
  ngay_yeu_cau?: unknown;
  ngay_bat_dau?: unknown;
  han_hoan_thanh?: unknown;
  ngay_hoan_thanh_thuc_te?: unknown;
  nguoi_phu_trach_id?: unknown;
  nguoi_phu_trach_name?: unknown;
  trang_thai?: unknown;
  nhap?: unknown; // lưu nháp: chỉ cần tên tính năng
}

const str = (v: unknown, max: number, label: string) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new SystemError(`${label} tối đa ${max} ký tự.`);
  return s;
};
const date = (v: unknown, label: string) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new SystemError(`${label} không hợp lệ.`);
  return s;
};

async function clean(input: FeatureInput, id?: number, manual = true) {
  const out: Record<string, any> = {};
  let systemId: number | null = null;
  if (input.system_id != null && input.system_id !== "") {
    systemId = Number(input.system_id);
    if (!Number.isInteger(systemId) || !(await db("he_thong_options").where({ id: systemId }).first())) throw new SystemError("Không tìm thấy hệ thống.");
  }
  out.system_id = systemId;
  // Đơn vị thực hiện mặc định = đơn vị quản lý hệ thống (tính năng sinh từ yêu cầu lấy theo phòng đích của yêu cầu — xem sync).
  if (!id && systemId != null) out.don_vi_thuc_hien_id = (await db("he_thong_options").where({ id: systemId }).first("don_vi_quan_ly_id"))?.don_vi_quan_ly_id ?? null;
  const ten = str(input.ten, 255, "Tên tính năng");
  if (!ten) throw new SystemError("Tên tính năng là bắt buộc.");
  out.ten = ten;
  let ma = str(input.ma_tinh_nang, 50, "Mã tính năng");
  if (!ma) ma = await nextCode(systemId);
  const dup = db("system_features").where({ is_deleted: false }).whereRaw("lower(ma_tinh_nang) = ?", [ma.toLowerCase()]);
  if (systemId == null) dup.whereNull("system_id");
  else dup.where({ system_id: systemId });
  if (id) dup.whereNot("id", id);
  if (await dup.first()) throw new SystemError("Mã tính năng đã tồn tại trong hệ thống này.");
  out.ma_tinh_nang = ma;
  out.mo_ta = str(input.mo_ta, 4000, "Mô tả") || null;
  const pr = typeof input.muc_uu_tien === "string" && input.muc_uu_tien ? input.muc_uu_tien : "trung_binh";
  if (!(PRIORITIES as readonly string[]).includes(pr)) throw new SystemError("Mức ưu tiên không hợp lệ.");
  out.muc_uu_tien = pr;
  if (input.don_vi_yeu_cau_id != null && input.don_vi_yeu_cau_id !== "") {
    const d = Number(input.don_vi_yeu_cau_id);
    if (!Number.isInteger(d) || !(await db("departments").where({ id: d }).first())) throw new SystemError("Không tìm thấy đơn vị yêu cầu.");
    out.don_vi_yeu_cau_id = d;
  } else out.don_vi_yeu_cau_id = null;
  out.nguoi_yeu_cau = str(input.nguoi_yeu_cau, 255, "Người yêu cầu") || null;
  out.so_van_ban = str(input.so_van_ban, 100, "Số văn bản yêu cầu") || null;
  out.ngay_yeu_cau = date(input.ngay_yeu_cau, "Ngày yêu cầu");
  out.ngay_bat_dau = date(input.ngay_bat_dau, "Ngày bắt đầu");
  out.han_hoan_thanh = date(input.han_hoan_thanh, "Hạn hoàn thành");
  out.ngay_hoan_thanh_thuc_te = date(input.ngay_hoan_thanh_thuc_te, "Ngày hoàn thành thực tế");
  if (manual) {
    if (!out.don_vi_yeu_cau_id) throw new SystemError("Đơn vị yêu cầu là bắt buộc.");
    if (!out.ngay_bat_dau) throw new SystemError("Ngày bắt đầu là bắt buộc.");
    if (!out.han_hoan_thanh) throw new SystemError("Hạn hoàn thành là bắt buộc.");
  }
  if (out.ngay_bat_dau && out.han_hoan_thanh && out.han_hoan_thanh < out.ngay_bat_dau) throw new SystemError("Hạn hoàn thành phải sau hoặc bằng ngày bắt đầu.");
  if (input.nguoi_phu_trach_id != null && input.nguoi_phu_trach_id !== "") {
    const u = Number(input.nguoi_phu_trach_id);
    const row = Number.isInteger(u) ? await db("users").where({ id: u }).first() : null;
    if (!row) throw new SystemError("Không tìm thấy người phụ trách.");
    out.nguoi_phu_trach_id = u;
    out.nguoi_phu_trach_name = row.name || row.username;
  } else {
    out.nguoi_phu_trach_id = null;
    out.nguoi_phu_trach_name = str(input.nguoi_phu_trach_name, 255, "Người phụ trách") || null;
  }
  let tt = typeof input.trang_thai === "string" && input.trang_thai ? input.trang_thai : "chua_bat_dau";
  if (!(FEATURE_STATUSES as readonly string[]).includes(tt)) throw new SystemError("Trạng thái không hợp lệ.");
  // Có ngày hoàn thành thực tế = đã hoàn thành; chọn Hoàn thành mà chưa có ngày -> lấy hôm nay.
  if (REQUEST_OWNED.includes(tt)) tt = "chua_bat_dau"; // không cho đặt tay (updateFeature giữ nguyên trạng thái cũ)
  if (out.ngay_hoan_thanh_thuc_te) tt = "hoan_thanh";
  else if (tt === "hoan_thanh") out.ngay_hoan_thanh_thuc_te = ymd(new Date());
  out.trang_thai = tt;
  return out;
}

export async function createFeature(input: FeatureInput, actor?: Actor) {
  const data = await clean(input, undefined, !input.nhap);
  const [created] = await db("system_features").insert({ ...data, updated_at: db.fn.now() }).returning("id");
  const id = Number(typeof created === "object" ? (created as any).id : created);
  await logEvent(id, "create", data.nguoi_phu_trach_name ? `Tạo tính năng, giao cho ${data.nguoi_phu_trach_name}` : "Tạo tính năng", actor);
  return (await getFeature(id))!;
}

export async function updateFeature(id: number, input: FeatureInput, actor?: Actor) {
  const cur = await db("system_features").where({ id, is_deleted: false }).first();
  if (!cur) return undefined;
  const data = await clean(input, id, !input.nhap && (!cur.feature_request_id || !!(input.ngay_bat_dau || input.han_hoan_thanh)));
  // Trạng thái Chờ duyệt / Từ chối thuộc về yêu cầu gốc — không đổi tay ở đây.
  if (REQUEST_OWNED.includes(cur.trang_thai)) data.trang_thai = cur.trang_thai;
  await db("system_features").where({ id }).update({ ...data, updated_at: db.fn.now() });
  await logEvent(id, "edit", "Sửa thông tin tính năng", actor);
  return getFeature(id);
}

// Cập nhật tiến độ: % hoàn thành + trạng thái (+ ngày hoàn thành thực tế, phiên bản phát hành) + ghi chú -> ghi lịch sử.
export async function updateProgress(id: number, input: { tien_do?: unknown; trang_thai?: unknown; ngay_hoan_thanh_thuc_te?: unknown; phien_ban_phat_hanh?: unknown; ghi_chu?: unknown }, actor?: Actor) {
  const cur = await db("system_features").where({ id, is_deleted: false }).first();
  if (!cur) return undefined;
  const pct = Number(input.tien_do);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw new SystemError("Tiến độ phải từ 0 đến 100.");
  let tt = typeof input.trang_thai === "string" && input.trang_thai ? input.trang_thai : cur.trang_thai;
  if (!(FEATURE_STATUSES as readonly string[]).includes(tt)) throw new SystemError("Trạng thái không hợp lệ.");
  if (REQUEST_OWNED.includes(cur.trang_thai)) tt = cur.trang_thai; // Chờ duyệt/Từ chối do yêu cầu gốc quyết định
  let done = date(input.ngay_hoan_thanh_thuc_te, "Ngày hoàn thành thực tế") ?? cur.ngay_hoan_thanh_thuc_te ?? null;
  if (!REQUEST_OWNED.includes(tt)) {
    if (pct === 100 && tt !== "cho_nghiem_thu") tt = "hoan_thanh";
    if (tt === "hoan_thanh") done = done || ymd(new Date());
    else done = null;
    if (tt === "chua_bat_dau" && pct > 0) tt = "dang_thuc_hien";
    if (tt === "dang_thuc_hien" && pct === 0) tt = "chua_bat_dau";
  }
  const ver = str(input.phien_ban_phat_hanh, 50, "Phiên bản phát hành") || cur.phien_ban_phat_hanh || null;
  const note = str(input.ghi_chu, 500, "Ghi chú");
  await db("system_features").where({ id }).update({ tien_do: tt === "hoan_thanh" ? 100 : pct, trang_thai: tt, ngay_hoan_thanh_thuc_te: done, phien_ban_phat_hanh: ver, updated_at: db.fn.now() });
  const label: Record<string, string> = { chua_bat_dau: "Chưa bắt đầu", dang_thuc_hien: "Đang thực hiện", cho_nghiem_thu: "Chờ nghiệm thu", hoan_thanh: "Hoàn thành" };
  await logEvent(id, "progress", `Cập nhật tiến độ lên ${tt === "hoan_thanh" ? 100 : pct}%${tt !== cur.trang_thai ? ` · ${label[tt] ?? tt}` : ""}${note ? ` — ${note}` : ""}`, actor);
  return getFeature(id);
}

// Xoá (mềm) tính năng. Tính năng sinh từ Yêu cầu tính năng -> xoá mềm cả yêu cầu gốc, để 2 menu luôn khớp nhau
// (nếu chỉ xoá tính năng thì yêu cầu vẫn còn bên Yêu cầu tính năng mà không còn ở đây). Tệp tài liệu giữ nguyên để khôi phục được.
export async function deleteFeature(id: number): Promise<boolean> {
  const cur = await db("system_features").where({ id, is_deleted: false }).first("id", "feature_request_id");
  if (!cur) return false;
  // Còn tài liệu thì không cho xoá — phải xoá hết tài liệu trước (tránh mất tài liệu đã nghiệm thu theo tính năng).
  const docs = Number(((await db("system_feature_docs").where({ feature_id: id }).count({ n: "*" }).first()) as any)?.n ?? 0);
  if (docs > 0) throw new SystemError(`Tính năng còn ${docs} tài liệu — hãy xoá hết tài liệu trước khi xoá tính năng.`);
  await db("system_features").where({ id }).update({ is_deleted: true, updated_at: db.fn.now() });
  if (cur.feature_request_id) await softDeleteWhere(db, "feature_requests", { id: cur.feature_request_id, is_deleted: false });
  return true;
}

// Gán tính năng chưa phân loại vào hệ thống (mã trùng trong hệ thống đích -> sinh mã mới).
export async function assignSystem(id: number, systemId: number) {
  const cur = await db("system_features").where({ id, is_deleted: false }).first();
  if (!cur) return undefined;
  if (!(await db("he_thong_options").where({ id: systemId }).first())) throw new SystemError("Không tìm thấy hệ thống.");
  const clash = await db("system_features").where({ system_id: systemId, is_deleted: false }).whereRaw("lower(ma_tinh_nang) = ?", [String(cur.ma_tinh_nang).toLowerCase()]).whereNot("id", id).first();
  await db("system_features").where({ id }).update({ system_id: systemId, ma_tinh_nang: clash ? await nextCode(systemId) : cur.ma_tinh_nang, updated_at: db.fn.now() });
  return getFeature(id);
}

// ---- Số liệu thẻ hệ thống ----
export async function statsBySystem(deptId: number | null | undefined): Promise<Map<number, { total: number; doing: number; done: number; docs: number }>> {
  const out = new Map<number, { total: number; doing: number; done: number; docs: number }>();
  if (deptId == null) return out; // chưa chọn phòng (hoặc gọi nội bộ) -> không số liệu
  const feats = (await db("system_features").where({ is_deleted: false }).whereNotNull("system_id").modify(visibleTo(deptId)).select("id", "system_id", "trang_thai")) as any[];
  const docCount = new Map<number, number>(((await db("system_feature_docs").groupBy("feature_id").select("feature_id").count({ n: "*" })) as any[]).map((r) => [Number(r.feature_id), Number(r.n)]));
  for (const f of feats) {
    const s = out.get(f.system_id) ?? { total: 0, doing: 0, done: 0, docs: 0 };
    s.total++;
    if (f.trang_thai === "dang_thuc_hien") s.doing++;
    if (f.trang_thai === "hoan_thanh") s.done++;
    s.docs += docCount.get(f.id) ?? 0;
    out.set(f.system_id, s);
  }
  return out;
}

// ---- Tài liệu ----
export async function addDoc(featureId: number, docKey: string, filename: string, data: Buffer, meta: { version?: string; release_date?: string; note?: string } = {}, actor?: Actor) {
  const f = await db("system_features").where({ id: featureId, is_deleted: false }).first();
  if (!f) throw new SystemError("Không tìm thấy tính năng.");
  const sys = f.system_id != null ? await getSystem(f.system_id) : undefined;
  const types: DocType[] = sys?.tai_lieu_bat_buoc ?? DEFAULT_DOC_TYPES;
  const type = types.find((d) => d.key === docKey);
  if (!type && docKey !== "khac") throw new SystemError("Loại tài liệu không hợp lệ.");
  if (data.length === 0) throw new SystemError("Thiếu nội dung file.");
  if (data.length > MAX_DOC_BYTES) throw new SystemError("File vượt quá 50MB.");
  const v = validateAttachmentFile(filename, data);
  if (!v.ok) throw new SystemError(v.error);
  const version = str(meta.version, 30, "Phiên bản") || null;
  const rel = date(meta.release_date, "Ngày ban hành");
  const note = str(meta.note, 1000, "Ghi chú thay đổi") || null;
  // Nội dung tệp ghi ra ổ đĩa; DB chỉ giữ mô tả + đường dẫn (cột data để rỗng). Ghi DB lỗi thì xoá tệp vừa ghi.
  const storagePath = await saveFile(`system-features/${featureId}`, filename, data);
  try {
    await db("system_feature_docs").insert({ feature_id: featureId, doc_key: docKey, filename: filename.slice(0, 255), mime: v.mime, size: data.length, data: Buffer.alloc(0), storage_path: storagePath, version, release_date: rel, change_note: note, uploaded_by_name: actor?.name ?? null });
  } catch (e) {
    await removeFile(storagePath);
    throw e;
  }
  await db("system_features").where({ id: featureId }).update({ updated_at: db.fn.now() });
  await logEvent(featureId, "doc", `Tải lên ${type?.label ?? "Khác"} ${filename}${version ? ` v${version}` : ""}`, actor);
  return getFeature(featureId);
}

// Thông tin để tải tệp: đường dẫn tuyệt đối trên ổ đĩa (absPath) — hoặc nội dung trong DB với bản ghi cũ chưa chuyển.
export async function getDoc(docId: number) {
  const d = (await db("system_feature_docs as d").join("system_features as f", "f.id", "d.feature_id").where("d.id", docId).where("f.is_deleted", false).first("d.filename", "d.mime", "d.size", "d.storage_path")) as any;
  if (!d) return undefined;
  if (d.storage_path) return { filename: d.filename as string, mime: d.mime as string, size: Number(d.size), absPath: resolveStored(d.storage_path) };
  const legacy = await db("system_feature_docs").where({ id: docId }).first("data");
  return { filename: d.filename as string, mime: d.mime as string, size: Number(d.size), data: legacy?.data as Buffer | undefined };
}

export async function deleteDoc(docId: number, actor?: Actor) {
  const d = await db("system_feature_docs").where({ id: docId }).first();
  if (!d) return undefined;
  await db("system_feature_docs").where({ id: docId }).delete();
  await removeFile(d.storage_path);
  await logEvent(d.feature_id, "doc", `Xoá tài liệu ${d.filename}`, actor);
  await db("system_features").where({ id: d.feature_id }).update({ updated_at: db.fn.now() });
  return getFeature(d.feature_id);
}

// ---- Đồng bộ từ Yêu cầu tính năng ----
// MỌI yêu cầu (Chờ duyệt / Đã duyệt / Từ chối) đều có 1 tính năng tương ứng ở đây (feature_request_id).
// Hệ thống ghi ở yêu cầu khớp danh mục (không phân biệt hoa/thường, dấu) -> gán luôn; không khớp (VD import Excel
// gõ tên lạ) -> "Chưa phân loại" kèm tên gốc, người quản lý gán hoặc tạo hệ thống sau.
// Các trường lấy từ yêu cầu chỉ được ghi đè khi yêu cầu gốc đổi (updated_at) SAU lần đồng bộ trước — sửa tay ở đây vẫn giữ.
const ts = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
// Dấu vân tay nội dung yêu cầu (không chỉ updated_at — mốc giây có thể trùng khi sửa liên tiếp).
const sig = (fr: any) => createHash("sha1").update(JSON.stringify([ts(fr.updated_at), fr.he_thong, fr.tieu_de, fr.mo_ta, fr.do_uu_tien, fr.department_id, fr.target_department_id, fr.nguoi_de_xuat, fr.trang_thai, fr.thoi_gian_mong_muon, fr.thoi_gian_du_kien, fr.ly_do_dieu_chinh])).digest("hex");
const FR_STATUS: Record<string, string> = { "Chờ duyệt": "cho_duyet", "Đã duyệt": "chua_bat_dau", "Từ chối": "tu_choi" };

function fromRequest(fr: any) {
  const pick = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  // Hạn dự kiến do đơn vị thực hiện xác nhận ưu tiên hơn thời gian mong muốn của bên đề xuất.
  const han = pick(fr.thoi_gian_du_kien) ?? pick(fr.thoi_gian_mong_muon);
  const created = fr.created_at ? new Date(String(fr.created_at instanceof Date ? fr.created_at.toISOString() : fr.created_at).replace(" ", "T")) : null;
  return {
    ten: String(fr.tieu_de).slice(0, 255),
    mo_ta: fr.mo_ta || null,
    muc_uu_tien: fr.do_uu_tien === "Cao" ? "cao" : fr.do_uu_tien === "Thấp" ? "thap" : "trung_binh",
    don_vi_yeu_cau_id: fr.department_id ?? null,
    nguoi_yeu_cau: fr.nguoi_de_xuat || null,
    ngay_yeu_cau: created && !isNaN(created.getTime()) ? ymd(created) : null,
    han,
    he_thong_goc: String(fr.he_thong ?? "").slice(0, 255) || null,
  };
}

let syncing: Promise<void> | null = null;
export function syncFeatureRequests(): Promise<void> {
  // Tuần tự hoá: 2 lần gọi chồng nhau không được tạo trùng tính năng cho cùng 1 yêu cầu.
  syncing = (syncing ?? Promise.resolve()).then(doSync, doSync);
  return syncing;
}

async function doSync(): Promise<void> {
  if (!(await db.schema.hasTable("feature_requests"))) return;
  // Điền đơn vị thực hiện cho tính năng cũ: từ phòng đích của yêu cầu; tính năng nhập tay lấy đơn vị quản lý hệ thống.
  await db("system_features").whereNull("don_vi_thuc_hien_id").whereNotNull("feature_request_id").update({
    don_vi_thuc_hien_id: db("feature_requests").select("target_department_id").whereRaw("feature_requests.id = system_features.feature_request_id"),
  });
  await db("system_features").whereNull("don_vi_thuc_hien_id").whereNull("feature_request_id").whereNotNull("system_id").update({
    don_vi_thuc_hien_id: db("he_thong_options").select("don_vi_quan_ly_id").whereRaw("he_thong_options.id = system_features.system_id"),
  });
  const frs = (await db("feature_requests").select("id", "he_thong", "tieu_de", "mo_ta", "do_uu_tien", "department_id", "target_department_id", "nguoi_de_xuat", "trang_thai", "thoi_gian_mong_muon", "thoi_gian_du_kien", "ly_do_dieu_chinh", "created_at", "updated_at", "is_deleted")) as any[];
  const feats = (await db("system_features").whereNotNull("feature_request_id").select("id", "feature_request_id", "trang_thai", "is_deleted", "fr_synced_at", "system_id", "he_thong_goc")) as any[];
  const byFr = new Map<number, any>(feats.map((f) => [Number(f.feature_request_id), f]));
  for (const fr of frs) {
    const f = byFr.get(fr.id);
    const deleted = !!fr.is_deleted;
    if (!f) {
      if (deleted) continue;
      const d = fromRequest(fr);
      const systemId = await resolveOrCreateSystem(fr.he_thong);
      const [ins] = await db("system_features").insert({
        system_id: systemId,
        ma_tinh_nang: await nextCode(systemId),
        ten: d.ten,
        mo_ta: d.mo_ta,
        muc_uu_tien: d.muc_uu_tien,
        don_vi_yeu_cau_id: d.don_vi_yeu_cau_id,
        don_vi_thuc_hien_id: fr.target_department_id ?? null,
        nguoi_yeu_cau: d.nguoi_yeu_cau,
        ngay_yeu_cau: d.ngay_yeu_cau,
        han_hoan_thanh: d.han,
        trang_thai: FR_STATUS[fr.trang_thai] ?? "chua_bat_dau",
        feature_request_id: fr.id,
        he_thong_goc: d.he_thong_goc,
        fr_synced_at: sig(fr),
        updated_at: db.fn.now(),
      }).returning("id");
      await logEvent(Number(typeof ins === "object" ? (ins as any).id : ins), "create", `Tạo từ yêu cầu tính năng${d.nguoi_yeu_cau ? ` của ${d.nguoi_yeu_cau}` : ""}`);
      continue;
    }
    if (f.is_deleted) continue; // đã bị admin xoá ở đây — không tạo lại
    if (deleted) {
      await db("system_features").where({ id: f.id }).update({ is_deleted: true, updated_at: db.fn.now() });
      continue;
    }
    if (f.system_id == null && f.he_thong_goc) {
      // Tính năng đang "Chưa phân loại" nhưng yêu cầu có ghi tên hệ thống -> xếp vào (hoặc tạo) hệ thống đó.
      const sysId = await resolveOrCreateSystem(f.he_thong_goc);
      if (sysId != null) {
        await db("system_features").where({ id: f.id }).update({ system_id: sysId, ma_tinh_nang: await nextCode(sysId), updated_at: db.fn.now() });
        f.system_id = sysId;
      }
    }
    if (sig(fr) === String(f.fr_synced_at ?? "")) continue;
    const d = fromRequest(fr);
    const patch: Record<string, any> = {
      ten: d.ten,
      mo_ta: d.mo_ta,
      muc_uu_tien: d.muc_uu_tien,
      don_vi_yeu_cau_id: d.don_vi_yeu_cau_id,
      don_vi_thuc_hien_id: fr.target_department_id ?? null,
      nguoi_yeu_cau: d.nguoi_yeu_cau,
      he_thong_goc: d.he_thong_goc,
      han_hoan_thanh: d.han,
      fr_synced_at: sig(fr),
    };
    if (d.he_thong_goc !== (f.he_thong_goc ?? null)) {
      // Yêu cầu đổi sang hệ thống khác (trong hoặc ngoài danh mục) -> chuyển tính năng theo.
      const sysId = await resolveOrCreateSystem(fr.he_thong);
      if (sysId != null && sysId !== f.system_id) patch.system_id = sysId;
    }
    const want = FR_STATUS[fr.trang_thai];
    if (want === "cho_duyet" || want === "tu_choi") {
      if (["chua_bat_dau", "cho_duyet", "tu_choi"].includes(f.trang_thai)) patch.trang_thai = want;
    } else if (REQUEST_OWNED.includes(f.trang_thai)) patch.trang_thai = "chua_bat_dau"; // vừa được duyệt
    await db("system_features").where({ id: f.id }).update(patch);
  }
}
