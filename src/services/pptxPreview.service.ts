import JSZip from "jszip";
import type { FillData } from "./pptx.service.js";

// Xem trước báo cáo PowerPoint dạng slide: đọc file mẫu .pptx (hình học + định dạng của từng ô chữ/bảng/ảnh), điền dữ liệu báo cáo giống hệt
// lúc xuất (cùng quy ước mã {{...}}), rồi trả mô hình JSON để trình duyệt vẽ lên khung slide. Mỗi đoạn/ô điền từ 1 đầu mục có kèm `code`
// (và `row`/`sub` với ô bảng) để người dùng bấm vào sửa/góp ý trực tiếp. Chỉ mang tính minh hoạ — mẫu phức tạp (hiệu ứng, WordArt...) không vẽ được.

// ---------------------------------------------------------------- XML nhỏ gọn
interface XNode {
  n: string;
  a: Record<string, string>;
  c: XNode[];
  t: string;
}
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function parseXml(xml: string): XNode {
  const root: XNode = { n: "#root", a: {}, c: [], t: "" };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const cur = stack[stack.length - 1];
    if (m[6] !== undefined) {
      cur.t += unesc(m[6]);
    } else if (m[1] !== undefined) {
      cur.t += m[1];
    } else if (m[3]) {
      if (m[2]) {
        if (stack.length > 1) stack.pop();
      } else {
        const a: Record<string, string> = {};
        for (const at of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[at[1]] = unesc(at[2] ?? at[3] ?? "");
        const node: XNode = { n: m[3], a, c: [], t: "" };
        cur.c.push(node);
        if (!m[5]) stack.push(node);
      }
    }
  }
  return root.c[0] ?? root;
}
const kids = (x: XNode | undefined, name: string) => (x ? x.c.filter((k) => k.n === name) : []);
const kid = (x: XNode | undefined, name: string) => (x ? x.c.find((k) => k.n === name) : undefined);
const path = (x: XNode | undefined, ...names: string[]) => names.reduce<XNode | undefined>((cur, nm) => kid(cur, nm), x);
const num = (v: string | undefined, d = 0) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

// ---------------------------------------------------------------- Theme + màu
type Theme = Record<string, string>;
function themeColors(xml: string | undefined): Theme {
  const out: Theme = {};
  if (!xml) return out;
  const cs = path(parseXml(xml), "a:themeElements", "a:clrScheme");
  for (const c of cs?.c ?? []) {
    const v = c.c[0];
    const hex = v?.a.val && /^[0-9A-Fa-f]{6}$/.test(v.a.val) ? v.a.val : v?.a.lastClr;
    if (hex) out[c.n.replace("a:", "")] = hex.toUpperCase();
  }
  return out;
}
const SCHEME_ALIAS: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
function hslAdjust(hex: string, mod: number, off: number): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  let l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = Math.min(1, Math.max(0, l * mod + off));
  const f = (p: number, q: number, t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  let rr = l, gg = l, bb = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    rr = f(p, q, h + 1 / 3);
    gg = f(p, q, h);
    bb = f(p, q, h - 1 / 3);
  }
  return [rr, gg, bb].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function colorOf(node: XNode | undefined, theme: Theme): string | undefined {
  const c = node?.c.find((k) => k.n === "a:srgbClr" || k.n === "a:schemeClr" || k.n === "a:sysClr");
  if (!c) return undefined;
  let hex: string | undefined;
  if (c.n === "a:srgbClr") hex = c.a.val?.toUpperCase();
  else if (c.n === "a:sysClr") hex = c.a.lastClr?.toUpperCase();
  else hex = theme[SCHEME_ALIAS[c.a.val] ?? c.a.val];
  if (!hex || !/^[0-9A-F]{6}$/.test(hex)) return undefined;
  const mod = kid(c, "a:lumMod");
  const off = kid(c, "a:lumOff");
  if (mod || off) hex = hslAdjust(hex, mod ? num(mod.a.val, 100000) / 100000 : 1, off ? num(off.a.val, 0) / 100000 : 0);
  return `#${hex}`;
}
// Màu nền của spPr/tcPr: solidFill -> màu; noFill -> null; không có -> undefined.
function fillOf(pr: XNode | undefined, theme: Theme): string | null | undefined {
  if (!pr) return undefined;
  if (kid(pr, "a:noFill")) return null;
  const sf = kid(pr, "a:solidFill");
  if (sf) return colorOf(sf, theme) ?? undefined;
  const gf = kid(pr, "a:gradFill");
  if (gf) return gradCss(gf, theme);
  return undefined;
}
// Nền chuyển màu (a:gradFill) -> CSS linear-gradient (bỏ qua gradient dạng path/tâm, lấy theo trục góc).
function gradCss(gf: XNode, theme: Theme): string | undefined {
  const stops = kids(kid(gf, "a:gsLst"), "a:gs")
    .map((g) => ({ pos: num(g.a.pos, 0) / 1000, color: colorOf(g, theme) }))
    .filter((x): x is { pos: number; color: string } => !!x.color);
  if (!stops.length) return undefined;
  if (stops.length === 1) return stops[0].color;
  const ang = num(kid(gf, "a:lin")?.a.ang, 5400000) / 60000; // OOXML: 0° = trái -> phải, tăng theo chiều kim đồng hồ; CSS: 0° = dưới -> trên
  return `linear-gradient(${(ang + 90) % 360}deg, ${stops.map((x) => `${x.color} ${x.pos}%`).join(", ")})`;
}

// ---------------------------------------------------------------- Mô hình trả về
export interface PRun { t: string; b?: boolean; i?: boolean; u?: boolean; sz?: number; color?: string; spc?: number } // spc: giãn chữ (pt)
export interface PPara { runs: PRun[]; align?: string; bullet?: string; marL?: number; indent?: number; sz?: number; code?: string; line?: number }
export interface PCell { paras: PPara[]; fill?: string; span?: number; vmerge?: boolean; code?: string; row?: string; sub?: string; edit?: boolean; anchor?: string }
export interface PShape {
  t: "text" | "table" | "image" | "imagebox" | "line";
  flipV?: boolean; // đường thẳng chạy từ dưới lên
  crop?: [number, number, number, number]; // ảnh cắt xén (a:srcRect) l,t,r,b dạng tỉ lệ 0..1
  x: number; y: number; w: number; h: number; rot?: number;
  anchor?: string; fill?: string; line?: string; lineW?: number; geom?: string;
  insets?: [number, number, number, number];
  scale?: number; // normAutofit fontScale
  paras?: PPara[];
  codes?: string[];
  cols?: number[];
  rows?: { h: number; cells: PCell[] }[];
  src?: string; code?: string; caption?: string; has_image?: boolean; url?: string;
  deco?: boolean; // hình trang trí từ layout/master
}
export interface PSlide { no: number; bg?: { color?: string; image?: string; css?: string }; shapes: PShape[]; notes?: PPara[] } // notes: ghi chú thuyết trình (khung Notes dưới slide)
export interface PreviewModel { slide_w: number; slide_h: number; slides: PSlide[]; media: Record<string, string> } // media: khoá -> data URI (ảnh nền/ảnh trong mẫu, dùng chung nhiều slide)

const TOKEN_RE = /\{\{\s*([\p{L}\p{N}_]+)(?:\.([\p{L}\p{N}_]+))?\s*\}\}/gu;
const nfc = (s: string) => s.normalize("NFC");
const MAX_IMG = 12_000_000; // mỗi ảnh (ảnh bìa/nền chất lượng cao thường > 1,5MB)
const MAX_MEDIA_TOTAL = 40_000_000; // tổng ảnh gửi về trình duyệt
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", jpe: "image/jpeg", bmp: "image/bmp", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };

interface Ctx {
  zip: JSZip;
  theme: Theme;
  data: FillData;
  reportId: number;
  rowIds: Map<string, string[]>;
  mediaCache: Map<string, string | null>;
  media: Record<string, string>;
}

async function relsOf(zip: JSZip, partPath: string): Promise<Map<string, { type: string; target: string }>> {
  const dir = partPath.slice(0, partPath.lastIndexOf("/"));
  const file = zip.file(`${dir}/_rels/${partPath.split("/").pop()}.rels`);
  const out = new Map<string, { type: string; target: string }>();
  if (!file) return out;
  for (const r of kids(parseXml(await file.async("string")), "Relationship")) {
    let target = r.a.Target ?? "";
    if (!/^https?:/.test(target)) {
      const parts = (target.startsWith("/") ? target.slice(1) : `${dir}/${target}`).split("/");
      const stack: string[] = [];
      for (const p of parts) {
        if (p === "..") stack.pop();
        else if (p !== ".") stack.push(p);
      }
      target = stack.join("/");
    }
    out.set(r.a.Id, { type: (r.a.Type ?? "").split("/").pop() ?? "", target });
  }
  return out;
}
// Trả khoá media ("m1"...) của ảnh trong mẫu; data URI nằm ở model.media (mỗi ảnh chỉ gửi 1 lần dù nhiều slide dùng chung).
async function mediaUri(ctx: Ctx, target: string): Promise<string | null> {
  if (ctx.mediaCache.has(target)) return ctx.mediaCache.get(target)!;
  const f = ctx.zip.file(target);
  let key: string | null = null;
  if (f) {
    const buf = await f.async("nodebuffer");
    const ext = target.split(".").pop()!.toLowerCase();
    const used = Object.values(ctx.media).reduce((a, v) => a + v.length, 0);
    if (buf.length <= MAX_IMG && MIME[ext] && used + buf.length * 1.4 <= MAX_MEDIA_TOTAL) {
      key = `m${Object.keys(ctx.media).length + 1}`;
      ctx.media[key] = `data:${MIME[ext]};base64,${buf.toString("base64")}`;
    }
  }
  ctx.mediaCache.set(target, key);
  return key;
}

// ---------------------------------------------------------------- Kế thừa kiểu chữ (shape -> layout -> master)
interface Inherit {
  lst: XNode[]; // các <a:lstStyle> theo thứ tự ưu tiên giảm dần
  styles: XNode | undefined; // p:txStyles của master
  kind: "title" | "body" | "other";
  fontScale: number;
}
const lvlPr = (lst: XNode | undefined, lvl: number) => kid(lst, `a:lvl${lvl + 1}pPr`);
function pick<T>(inh: Inherit, lvl: number, get: (pPr: XNode) => T | undefined): T | undefined {
  for (const l of inh.lst) {
    const v = lvlPr(l, lvl) && get(lvlPr(l, lvl)!);
    if (v !== undefined) return v;
  }
  const ts = inh.styles && kid(inh.styles, inh.kind === "title" ? "p:titleStyle" : inh.kind === "body" ? "p:bodyStyle" : "p:otherStyle");
  const p = lvlPr(ts, lvl);
  return p ? get(p) : undefined;
}

function buildRuns(p: XNode, inh: Inherit, lvl: number, theme: Theme): PRun[] {
  const defSz = pick(inh, lvl, (pPr) => (kid(pPr, "a:defRPr")?.a.sz ? num(kid(pPr, "a:defRPr")!.a.sz) / 100 : undefined));
  const defColor = pick(inh, lvl, (pPr) => colorOf(kid(kid(pPr, "a:defRPr"), "a:solidFill"), theme));
  const defB = pick(inh, lvl, (pPr) => (kid(pPr, "a:defRPr")?.a.b !== undefined ? kid(pPr, "a:defRPr")!.a.b === "1" : undefined));
  const out: PRun[] = [];
  for (const r of p.c) {
    if (r.n === "a:br") {
      out.push({ t: "\n" });
      continue;
    }
    if (r.n !== "a:r" && r.n !== "a:fld") continue;
    const rp = kid(r, "a:rPr");
    const text = kid(r, "a:t")?.t ?? "";
    out.push({
      t: text,
      b: rp?.a.b !== undefined ? rp.a.b === "1" : defB,
      i: rp?.a.i === "1" || undefined,
      u: (rp?.a.u && rp.a.u !== "none") || undefined,
      sz: rp?.a.sz ? num(rp.a.sz) / 100 : defSz,
      color: colorOf(kid(rp, "a:solidFill"), theme) ?? defColor,
      spc: rp?.a.spc ? num(rp.a.spc) / 100 : undefined,
    });
  }
  return out;
}
const runsText = (runs: PRun[]) => runs.map((r) => r.t).join("");
function paraMeta(p: XNode, inh: Inherit, lvl: number, isPh: boolean): Omit<PPara, "runs"> {
  const pPr = kid(p, "a:pPr");
  const algn = pPr?.a.algn ?? pick(inh, lvl, (x) => x.a.algn);
  const buNone = !!kid(pPr, "a:buNone");
  const buChar = kid(pPr, "a:buChar")?.a.char ?? pick(inh, lvl, (x) => (kid(x, "a:buNone") ? "" : kid(x, "a:buChar")?.a.char));
  const bullet = buNone ? undefined : buChar || (kid(pPr, "a:buAutoNum") ? "#" : isPh && inh.kind === "body" && buChar !== "" ? "•" : undefined);
  const marL = pPr?.a.marL !== undefined ? num(pPr.a.marL) : pick(inh, lvl, (x) => (x.a.marL !== undefined ? num(x.a.marL) : undefined));
  const indent = pPr?.a.indent !== undefined ? num(pPr.a.indent) : pick(inh, lvl, (x) => (x.a.indent !== undefined ? num(x.a.indent) : undefined));
  const line = kid(kid(pPr, "a:lnSpc"), "a:spcPct")?.a.val ? num(kid(kid(pPr, "a:lnSpc"), "a:spcPct")!.a.val) / 100000 : undefined;
  return { align: algn, bullet, marL, indent, line };
}

// Văn bản có **chữ đậm** -> các run (base: định dạng run mẫu).
function richRuns(text: string, base: PRun | undefined): PRun[] {
  const b = base ?? { t: "" };
  const out: PRun[] = [];
  let last = 0;
  for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) {
    if (m.index! > last) out.push({ ...b, t: text.slice(last, m.index) });
    out.push({ ...b, t: m[1], b: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length || out.length === 0) out.push({ ...b, t: text.slice(last) });
  return out;
}

// ---------------------------------------------------------------- Điền dữ liệu vào đoạn văn
function fillParagraphs(paras: XNode[], inh: Inherit, theme: Theme, data: FillData, isPh: boolean, codes: Set<string>): PPara[] {
  const out: PPara[] = [];
  for (const p of paras) {
    const lvl = num(kid(p, "a:pPr")?.a.lvl);
    const runs = buildRuns(p, inh, lvl, theme);
    const meta = paraMeta(p, inh, lvl, isPh);
    const text = runsText(runs);
    const toks = [...text.matchAll(TOKEN_RE)].filter((m) => !m[2]);
    const base = runs.find((r) => r.t.trim()) ?? runs[0];
    if (toks.length === 0) {
      const stripped = text.replace(TOKEN_RE, "");
      out.push({ ...meta, runs: stripped === text ? runs : [{ ...(base ?? { t: "" }), t: stripped }] });
      continue;
    }
    const code = nfc(toks[0][1]);
    const d = data[code];
    codes.add(code);
    const lines =
      !d ? [""]
      : d.kind === "auto" || d.kind === "paragraph" ? (d.text ?? "").split(/\r?\n/)
      : d.kind === "list" ? (d.items ?? [])
      : d.kind === "table" ? (d.rows ?? []).map((r) => `${r.ten}: ${r.thuc_hien || "—"}${r.don_vi ? " " + r.don_vi : ""} / KH ${r.ke_hoach || "—"}${r.ty_le ? ` (${r.ty_le})` : ""}`)
      : [""];
    const emit = lines.length ? lines : [""];
    emit.forEach((line, k) => {
      const filled = text.replace(TOKEN_RE, (_, c: string, sub?: string) => (nfc(c) === code && !sub ? line : ""));
      out.push({ ...meta, bullet: k === 0 && !line && emit.length === 1 && d?.kind !== "list" ? meta.bullet : meta.bullet, runs: richRuns(filled, base), code });
    });
  }
  return out;
}

// ---------------------------------------------------------------- Hình học
interface Xf { x: number; y: number; w: number; h: number; rot?: number }
interface GroupT { ox: number; oy: number; sx: number; sy: number }
const ID: GroupT = { ox: 0, oy: 0, sx: 1, sy: 1 };
function xfOf(node: XNode | undefined, g: GroupT): Xf | undefined {
  const xf = node && (kid(node, "a:xfrm") ?? kid(node, "p:xfrm"));
  const off = kid(xf, "a:off");
  const ext = kid(xf, "a:ext");
  if (!xf || !off || !ext) return undefined;
  return { x: g.ox + num(off.a.x) * g.sx, y: g.oy + num(off.a.y) * g.sy, w: num(ext.a.cx) * g.sx, h: num(ext.a.cy) * g.sy, rot: xf.a.rot ? num(xf.a.rot) / 60000 : undefined };
}
const cropOf = (bf: XNode | undefined): [number, number, number, number] | undefined => {
  const r = kid(bf, "a:srcRect");
  if (!r) return undefined;
  const v = (k: string) => Math.max(0, Math.min(0.95, num(r.a[k], 0) / 100000));
  const c: [number, number, number, number] = [v("l"), v("t"), v("r"), v("b")];
  return c.some((x) => x > 0) ? c : undefined;
};
const phOf = (sp: XNode) => kid(kid(kid(sp, "p:nvSpPr"), "p:nvPr"), "p:ph");

interface LayoutInfo { shapes: XNode[]; master: XNode | undefined; bg: XNode | undefined }

async function renderTree(tree: XNode, ctx: Ctx, rels: Map<string, { type: string; target: string }>, g: GroupT, inhOf: (ph: XNode | undefined, sp: XNode) => { xf?: Xf; inh: Inherit }, decoOnly: boolean): Promise<PShape[]> {
  const out: PShape[] = [];
  for (const el of tree.c) {
    if (el.n === "p:grpSp") {
      const gx = kid(kid(el, "p:grpSpPr"), "a:xfrm");
      const off = kid(gx, "a:off"), ext = kid(gx, "a:ext"), cho = kid(gx, "a:chOff"), che = kid(gx, "a:chExt");
      let ng = g;
      if (off && ext && cho && che && num(che.a.cx) && num(che.a.cy)) {
        const sx = (num(ext.a.cx) * g.sx) / num(che.a.cx), sy = (num(ext.a.cy) * g.sy) / num(che.a.cy);
        ng = { ox: g.ox + num(off.a.x) * g.sx - num(cho.a.x) * sx, oy: g.oy + num(off.a.y) * g.sy - num(cho.a.y) * sy, sx, sy };
      }
      out.push(...(await renderTree(el, ctx, rels, ng, inhOf, decoOnly)));
    } else if (el.n === "p:sp") {
      const ph = phOf(el);
      if (decoOnly && ph) continue;
      const { xf: inhXf, inh } = inhOf(ph, el);
      const own = xfOf(kid(el, "p:spPr"), g);
      const xf = own ?? (inhXf ? { x: g.ox + inhXf.x * g.sx, y: g.oy + inhXf.y * g.sy, w: inhXf.w * g.sx, h: inhXf.h * g.sy } : undefined);
      if (!xf) continue;
      const spPr = kid(el, "p:spPr");
      const tx = kid(el, "p:txBody");
      const paras = kids(tx, "a:p");
      const geom = kid(spPr, "a:prstGeom")?.a.prst;
      const fill = fillOf(spPr, ctx.theme);
      const ln = kid(spPr, "a:ln");
      const lnColor = ln && !kid(ln, "a:noFill") ? colorOf(kid(ln, "a:solidFill"), ctx.theme) : undefined;
      // Hình khối tô bằng ảnh (a:blipFill trong spPr) — thường là ảnh bìa/nền: vẽ ảnh phía dưới chữ.
      const sbf = kid(spPr, "a:blipFill");
      const srid = kid(sbf, "a:blip")?.a["r:embed"];
      const starget = srid ? rels.get(srid)?.target : undefined;
      if (starget) {
        const ssrc = await mediaUri(ctx, starget);
        if (ssrc) out.push({ t: "image", x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, src: ssrc, crop: cropOf(sbf), deco: decoOnly || undefined });
      }
      const base: PShape = { t: "text", x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, fill: fill ?? undefined, line: lnColor, lineW: ln?.a.w ? num(ln.a.w) : undefined, geom, deco: decoOnly || undefined };
      // Khung chữ chứa mã ảnh -> ô ảnh báo cáo.
      const allText = paras.map((p) => runsText(buildRuns(p, inh, 0, ctx.theme))).join("\n");
      const imgTok = [...allText.matchAll(TOKEN_RE)].filter((m) => !m[2]).map((m) => nfc(m[1])).find((c) => ctx.data[c]?.kind === "image");
      if (imgTok) {
        const im = ctx.data[imgTok].image;
        out.push({ ...base, t: "imagebox", code: imgTok, has_image: !!im, caption: im?.caption ?? "", url: im ? `/api/reports/${ctx.reportId}/images/${encodeURIComponent(imgTok)}` : undefined, codes: [imgTok] });
        continue;
      }
      const bp = kid(tx, "a:bodyPr");
      const codes = new Set<string>();
      const fs = kid(bp, "a:normAutofit")?.a.fontScale;
      out.push({
        ...base,
        anchor: bp?.a.anchor ?? "t",
        insets: [num(bp?.a.lIns, 91440), num(bp?.a.tIns, 45720), num(bp?.a.rIns, 91440), num(bp?.a.bIns, 45720)],
        scale: fs ? num(fs) / 100000 : undefined,
        paras: fillParagraphs(paras, { ...inh, lst: [kid(tx, "a:lstStyle")!, ...inh.lst].filter(Boolean) }, ctx.theme, ctx.data, !!ph, codes),
        codes: [...codes],
      });
    } else if (el.n === "p:pic") {
      const xf = xfOf(kid(el, "p:spPr"), g);
      const bf = kid(el, "p:blipFill");
      const rid = kid(bf, "a:blip")?.a["r:embed"];
      const target = rid ? rels.get(rid)?.target : undefined;
      if (!xf || !target) continue;
      const src = await mediaUri(ctx, target);
      if (src) out.push({ t: "image", x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, src, crop: cropOf(bf), deco: decoOnly || undefined });
    } else if (el.n === "p:cxnSp") {
      // Đường nối/đường kẻ thẳng (VD gạch dưới tiêu đề slide bìa).
      const spPr = kid(el, "p:spPr");
      const xf = xfOf(spPr, g);
      if (!xf) continue;
      const ln = kid(spPr, "a:ln");
      const color = ln && !kid(ln, "a:noFill") ? colorOf(kid(ln, "a:solidFill"), ctx.theme) : undefined;
      if (!color) continue;
      const xfrm = kid(spPr, "a:xfrm");
      out.push({ t: "line", x: xf.x, y: xf.y, w: xf.w, h: xf.h, rot: xf.rot, line: color, lineW: ln?.a.w ? num(ln.a.w) : 12700, flipV: xfrm?.a.flipV === "1" || undefined, deco: decoOnly || undefined });
    } else if (el.n === "p:graphicFrame") {
      const tbl = kid(kid(kid(el, "a:graphic"), "a:graphicData"), "a:tbl");
      const xf = xfOf(el, g);
      if (!tbl || !xf) continue;
      out.push(tableShape(tbl, xf, ctx));
    }
  }
  return out;
}

function tableShape(tbl: XNode, xf: Xf, ctx: Ctx): PShape {
  const cols = kids(kid(tbl, "a:tblGrid"), "a:gridCol").map((c) => num(c.a.w));
  const noInh: Inherit = { lst: [], styles: undefined, kind: "other", fontScale: 1 };
  const header = kid(tbl, "a:tblPr")?.a.firstRow === "1";
  const rows: { h: number; cells: PCell[] }[] = [];
  const cellOf = (tc: XNode, token: { code: string; row?: string; sub?: string; item?: Record<string, string> } | null, rowHead: boolean): PCell => {
    const tcPr = kid(tc, "a:tcPr");
    const paras = kids(kid(tc, "a:txBody"), "a:p").map((p) => {
      const runs = buildRuns(p, noInh, 0, ctx.theme);
      const meta = paraMeta(p, noInh, 0, false);
      const text = runsText(runs);
      let out = text;
      if (token) out = text.replace(TOKEN_RE, (_, c: string, sub?: string) => (nfc(c) === token.code && sub && token.item ? token.item[sub] ?? "" : ""));
      else out = text.replace(TOKEN_RE, "");
      const base = runs.find((r) => r.t.trim()) ?? runs[0];
      return { ...meta, runs: [{ ...(base ?? { t: "" }), t: out }] } as PPara;
    });
    const fill = fillOf(tcPr, ctx.theme);
    const m = token ? [...runsText(kids(kid(tc, "a:txBody"), "a:p").flatMap((p) => buildRuns(p, noInh, 0, ctx.theme))).matchAll(TOKEN_RE)].find((x) => nfc(x[1]) === token.code && x[2]) : undefined;
    return {
      paras,
      fill: fill ?? (rowHead ? undefined : undefined),
      span: tc.a.gridSpan ? num(tc.a.gridSpan) : undefined,
      vmerge: tc.a.vMerge === "1" || tc.a.hMerge === "1" || undefined,
      anchor: tcPr?.a.anchor,
      ...(m && token ? { code: token.code, row: token.row, sub: m[2], edit: ["ten", "don_vi", "ke_hoach", "thuc_hien"].includes(m[2]) } : {}),
    };
  };
  kids(tbl, "a:tr").forEach((tr, ri) => {
    const tcs = kids(tr, "a:tc");
    const rowText = tcs.map((tc) => kids(kid(tc, "a:txBody"), "a:p").map((p) => runsText(buildRuns(p, noInh, 0, ctx.theme))).join("\n")).join("\n");
    const tok = [...rowText.matchAll(TOKEN_RE)].find((m) => m[2]);
    const h = num(tr.a.h);
    if (!tok) {
      rows.push({ h, cells: tcs.map((tc) => cellOf(tc, null, header && ri === 0)) });
      return;
    }
    const code = nfc(tok[1]);
    const items = ctx.data[code]?.rows ?? [];
    const ids = ctx.rowIds.get(code) ?? [];
    if (items.length === 0) rows.push({ h, cells: tcs.map((tc) => cellOf(tc, { code }, false)) });
    else items.forEach((item, k) => rows.push({ h, cells: tcs.map((tc) => cellOf(tc, { code, row: ids[k], item }, false)) }));
  });
  const codes = [...new Set(rows.flatMap((r) => r.cells.map((c) => c.code).filter(Boolean) as string[]))];
  return { t: "table", x: xf.x, y: xf.y, w: xf.w, h: rows.reduce((s, r) => s + r.h, 0) || xf.h, cols, rows, codes, headerRow: header } as PShape & { headerRow?: boolean };
}

// ---------------------------------------------------------------- Chính
export async function buildPreviewModel(template: Buffer, data: FillData, opts: { reportId: number; rowIds: Map<string, string[]> }): Promise<PreviewModel> {
  const zip = await JSZip.loadAsync(template);
  const pres = parseXml(await zip.file("ppt/presentation.xml")!.async("string"));
  const sz = kid(pres, "p:sldSz");
  const model: PreviewModel = { slide_w: num(sz?.a.cx, 9144000), slide_h: num(sz?.a.cy, 5143500), slides: [], media: {} };
  const slideNames = Object.keys(zip.files)
    .map((n) => ({ n, m: n.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map((x) => x.n);

  const themeCache = new Map<string, Theme>();
  const ctx: Ctx = { zip, theme: {}, data, reportId: opts.reportId, rowIds: opts.rowIds, mediaCache: new Map(), media: model.media };

  let no = 0;
  for (const name of slideNames) {
    no += 1;
    const slideXml = parseXml(await zip.file(name)!.async("string"));
    const rels = await relsOf(zip, name);
    const layoutPath = [...rels.values()].find((r) => r.type === "slideLayout")?.target;
    const layoutXml = layoutPath && zip.file(layoutPath) ? parseXml(await zip.file(layoutPath)!.async("string")) : undefined;
    const layoutRels = layoutPath ? await relsOf(zip, layoutPath) : new Map();
    const masterPath = [...layoutRels.values()].find((r: { type: string }) => r.type === "slideMaster")?.target;
    const masterXml = masterPath && zip.file(masterPath) ? parseXml(await zip.file(masterPath)!.async("string")) : undefined;
    const masterRels = masterPath ? await relsOf(zip, masterPath) : new Map();
    const themePath = [...masterRels.values()].find((r: { type: string }) => r.type === "theme")?.target;
    if (themePath && !themeCache.has(themePath)) themeCache.set(themePath, themeColors(await zip.file(themePath)?.async("string")));
    const theme = (themePath && themeCache.get(themePath)) || {};
    const sctx: Ctx = { ...ctx, theme };

    // Màu/ảnh nền: slide -> layout -> master. Hỗ trợ màu đặc, chuyển màu, ảnh và tham chiếu kiểu nền của theme (p:bgRef).
    const themeRaw = themePath ? await zip.file(themePath)?.async("string") : undefined;
    const themeRels = themePath ? await relsOf(zip, themePath) : new Map();
    const bgOf = async (root: XNode | undefined, r: Map<string, { type: string; target: string }>) => {
      const bgPr = path(root, "p:cSld", "p:bg", "p:bgPr");
      if (bgPr) {
        const color = colorOf(kid(bgPr, "a:solidFill"), theme);
        if (color) return { color };
        const gf = kid(bgPr, "a:gradFill");
        const css = gf ? gradCss(gf, theme) : undefined;
        if (css) return { css };
        const rid = kid(kid(bgPr, "a:blipFill"), "a:blip")?.a["r:embed"];
        const t = rid ? r.get(rid)?.target : undefined;
        const image = t ? await mediaUri(sctx, t) : null;
        return image ? { image } : undefined;
      }
      const ref = path(root, "p:cSld", "p:bg", "p:bgRef");
      const idx = ref ? num(ref.a.idx, 0) : 0;
      if (ref && idx >= 1001 && themeRaw) {
        const list = path(parseXml(themeRaw), "a:themeElements", "a:fmtScheme", "a:bgFillStyleLst");
        const fill = list?.c[idx - 1001];
        const phClr = colorOf(ref, theme);
        if (fill?.n === "a:blipFill") {
          const rid = kid(fill, "a:blip")?.a["r:embed"];
          const t = rid ? themeRels.get(rid)?.target : undefined;
          const image = t ? await mediaUri(sctx, t) : null;
          if (image) return { image };
        }
        if (phClr) return { color: phClr };
      }
      return undefined;
    };
    const bg = (await bgOf(slideXml, rels)) ?? (await bgOf(layoutXml, layoutRels)) ?? (await bgOf(masterXml, masterRels));

    // Tra khung kế thừa theo <p:ph> (idx/type) trong layout rồi master.
    const treeOf = (x: XNode | undefined) => path(x, "p:cSld", "p:spTree");
    const phKey = (ph: XNode) => `${ph.a.type ?? ""}|${ph.a.idx ?? ""}`;
    const findPh = (x: XNode | undefined, ph: XNode): XNode | undefined =>
      kids(treeOf(x), "p:sp").find((sp) => {
        const p = phOf(sp);
        return p && (phKey(p) === phKey(ph) || (ph.a.idx !== undefined && p.a.idx === ph.a.idx) || (!!ph.a.type && p.a.type === ph.a.type && ph.a.idx === undefined));
      });
    const styles = kid(masterXml, "p:txStyles");
    const inhOf = (ph: XNode | undefined): { xf?: Xf; inh: Inherit } => {
      const kind = ph?.a.type && /title/i.test(ph.a.type) ? "title" : ph ? "body" : "other";
      const lst: XNode[] = [];
      let xf: Xf | undefined;
      if (ph) {
        for (const root of [layoutXml, masterXml]) {
          const sp = findPh(root, ph);
          if (!sp) continue;
          const l = kid(kid(sp, "p:txBody"), "a:lstStyle");
          if (l) lst.push(l);
          xf = xf ?? xfOf(kid(sp, "p:spPr"), ID);
        }
      }
      return { xf, inh: { lst, styles, kind, fontScale: 1 } };
    };

    const shapes: PShape[] = [];
    if (masterXml && treeOf(masterXml)) shapes.push(...(await renderTree(treeOf(masterXml)!, sctx, masterRels, ID, (ph, sp) => ({ ...inhOf(undefined), inh: { lst: [], styles, kind: "other", fontScale: 1 } }), true)));
    if (layoutXml && treeOf(layoutXml)) shapes.push(...(await renderTree(treeOf(layoutXml)!, sctx, layoutRels, ID, (ph, sp) => ({ inh: { lst: [], styles, kind: "other", fontScale: 1 } }), true)));
    shapes.push(...(await renderTree(treeOf(slideXml)!, sctx, rels, ID, (ph) => inhOf(ph), false)));
    // Ghi chú thuyết trình (Notes) của slide: đoạn văn trong khung nội dung (ph body) của notesSlide, điền mã như slide.
    let notes: PPara[] | undefined;
    const notesPath = [...rels.values()].find((r) => r.type === "notesSlide")?.target;
    if (notesPath && zip.file(notesPath)) {
      const nx = parseXml(await zip.file(notesPath)!.async("string"));
      const sps = kids(path(nx, "p:cSld", "p:spTree"), "p:sp");
      const body = sps.find((sp) => phOf(sp)?.a.type === "body") ?? sps.find((sp) => !phOf(sp) && kid(sp, "p:txBody"));
      if (body) {
        const tx = kid(body, "p:txBody");
        const inh: Inherit = { lst: [kid(tx, "a:lstStyle")].filter(Boolean) as XNode[], styles: undefined, kind: "other", fontScale: 1 };
        const codes = new Set<string>();
        const paras = fillParagraphs(kids(tx, "a:p"), inh, theme, data, false, codes);
        if (paras.some((p) => p.runs.some((r) => r.t.trim()) || p.code)) notes = paras;
      }
    }
    model.slides.push({ no, bg, shapes, notes });
  }
  return model;
}
