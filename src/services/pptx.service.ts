import JSZip from "jszip";

// Đọc/điền file mẫu .pptx bằng JSZip + thao tác trực tiếp trên XML slide.
// Quy ước mã giữ chỗ (đặt trong ô văn bản/ô bảng của slide):
//   {{ma}}          — danh sách gạch đầu dòng / đoạn văn / tự điền / bảng dạng dòng chữ
//   {{ma.ten}} {{ma.don_vi}} {{ma.ke_hoach}} {{ma.thuc_hien}} {{ma.ty_le}}
//                   — đặt trong 1 HÀNG của bảng PowerPoint: hàng đó được nhân bản cho mỗi chỉ tiêu.
// PowerPoint hay tách 1 mã thành nhiều "run" (gõ dở, sửa lỗi chính tả...) nên trước khi quét/điền,
// mọi đoạn văn có "{{" được gộp lại thành 1 run (giữ định dạng của run đầu).

export interface ScannedCode {
  code: string;
  slide_no: number;
  has_row_tokens: boolean;
}

const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?\s*\}\}/g;
const PARA_RE = /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g;
const RUN_RE = /<a:r(?:\s[^>]*)?>[\s\S]*?<\/a:r>/g;
const ROW_RE = /<a:tr(?:\s[^>]*)?>[\s\S]*?<\/a:tr>/g;

const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function runText(run: string): string {
  const m = run.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
  return m ? unesc(m[1]) : "";
}
function paragraphText(p: string): string {
  return (p.match(RUN_RE) ?? []).map(runText).join("");
}
function setRunText(run: string, text: string): string {
  const t = `<a:t>${esc(text)}</a:t>`;
  return /<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>|<a:t\s*\/>/.test(run)
    ? run.replace(/<a:t(?:\s[^>]*)?>[\s\S]*?<\/a:t>|<a:t\s*\/>/, t)
    : run.replace(/<\/a:r>$/, `${t}</a:r>`);
}

// Gộp các run của đoạn văn chứa "{{" thành 1 run (giữ định dạng run đầu).
function mergeRunsInParagraph(p: string): string {
  const runs = p.match(RUN_RE);
  if (!runs || runs.length === 0) return p;
  const full = runs.map(runText).join("");
  if (!full.includes("{{")) return p;
  let first = true;
  return p.replace(RUN_RE, (run) => {
    if (first) {
      first = false;
      return setRunText(run, full);
    }
    return "";
  });
}
function normalizeXml(xml: string): string {
  return xml.replace(PARA_RE, (p) => (p.includes("{{") || (p.match(RUN_RE) ?? []).length > 1 ? mergeRunsInParagraph(p) : p));
}

function slideEntries(zip: JSZip): { name: string; no: number }[] {
  return Object.keys(zip.files)
    .map((name) => ({ name, m: name.match(/^ppt\/slides\/slide(\d+)\.xml$/) }))
    .filter((x) => x.m)
    .map((x) => ({ name: x.name, no: Number(x.m![1]) }))
    .sort((a, b) => a.no - b.no);
}

// Quét file mẫu: danh sách mã (theo thứ tự xuất hiện) + số slide.
export async function scanPptx(buffer: Buffer): Promise<{ slide_count: number; codes: ScannedCode[] }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("File không đọc được — hãy tải lên file .pptx hợp lệ.");
  }
  const slides = slideEntries(zip);
  if (slides.length === 0) throw new Error("Không tìm thấy slide nào — hãy tải lên file .pptx hợp lệ.");
  const codes = new Map<string, ScannedCode>();
  for (const [i, s] of slides.entries()) {
    const xml = normalizeXml(await zip.file(s.name)!.async("string"));
    for (const p of xml.match(PARA_RE) ?? []) {
      const text = paragraphText(p);
      for (const m of text.matchAll(TOKEN_RE)) {
        const code = m[1];
        const cur = codes.get(code) ?? { code, slide_no: i + 1, has_row_tokens: false };
        if (m[2]) cur.has_row_tokens = true;
        codes.set(code, cur);
      }
    }
  }
  return { slide_count: slides.length, codes: [...codes.values()] };
}

export type FillItem = Record<string, string>;
export interface FillData {
  // code -> giá trị: chuỗi (tự điền/đoạn văn), mảng chuỗi (danh sách), mảng object (bảng chỉ tiêu)
  [code: string]: { kind: "auto" | "paragraph" | "list" | "table"; text?: string; items?: string[]; rows?: FillItem[] };
}

function replaceTokens(text: string, scalar: (code: string, sub?: string) => string): string {
  return text.replace(TOKEN_RE, (_, code: string, sub?: string) => scalar(code, sub));
}

// Điền dữ liệu vào file mẫu. Mã không có dữ liệu -> thay bằng chuỗi rỗng.
export async function fillPptx(buffer: Buffer, data: FillData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  for (const s of slideEntries(zip)) {
    let xml = normalizeXml(await zip.file(s.name)!.async("string"));

    // 1) Hàng bảng có mã dạng {{ma.cot}} -> nhân bản theo số chỉ tiêu.
    xml = xml.replace(ROW_RE, (row) => {
      const tokens = [...paragraphsText(row).matchAll(TOKEN_RE)].filter((m) => m[2]);
      if (tokens.length === 0) return row;
      const code = tokens[0][1];
      const rows = data[code]?.rows ?? [];
      const make = (item: FillItem | null) =>
        row.replace(PARA_RE, (p) => {
          const text = paragraphText(p);
          if (!text.includes("{{")) return p;
          const out = replaceTokens(text, (c, sub) => (c === code && sub && item ? item[sub] ?? "" : ""));
          return setParagraphText(p, out);
        });
      return rows.length ? rows.map(make).join("") : make(null);
    });

    // 2) Đoạn văn có mã {{ma}} (không có phần .cot).
    xml = xml.replace(PARA_RE, (p) => {
      const text = paragraphText(p);
      const m = [...text.matchAll(TOKEN_RE)].filter((x) => !x[2]);
      if (m.length === 0) {
        // còn mã dạng {{ma.cot}} ngoài hàng bảng -> xoá trắng
        return text.includes("{{") ? setParagraphText(p, replaceTokens(text, () => "")) : p;
      }
      const code = m[0][1];
      const d = data[code];
      if (!d) return setParagraphText(p, replaceTokens(text, () => ""));
      if (d.kind === "auto" || d.kind === "paragraph") {
        const lines = (d.text ?? "").split(/\r?\n/);
        return lines.map((line) => setParagraphRich(p, replaceTokens(text, (c, sub) => (c === code && !sub ? line : "")))).join("");
      }
      const lines =
        d.kind === "list"
          ? d.items ?? []
          : (d.rows ?? []).map((r) => `${r.ten}: ${r.thuc_hien || "—"}${r.don_vi ? " " + r.don_vi : ""} / KH ${r.ke_hoach || "—"}${r.ty_le ? ` (${r.ty_le})` : ""}`);
      if (lines.length === 0) return setParagraphText(p, replaceTokens(text, () => ""));
      return lines.map((line) => setParagraphRich(p, replaceTokens(text, (c, sub) => (c === code && !sub ? line : "")))).join("");
    });

    zip.file(s.name, xml);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function paragraphsText(xml: string): string {
  return (xml.match(PARA_RE) ?? []).map(paragraphText).join("\n");
}

// Bật chữ đậm cho 1 run (thêm/sửa thuộc tính b của a:rPr).
function boldRun(run: string): string {
  if (/<a:rPr\b/.test(run)) {
    return /<a:rPr\b[^>]*\bb="/.test(run) ? run.replace(/(<a:rPr\b[^>]*?)\bb="[^"]*"/, '$1b="1"') : run.replace(/<a:rPr\b/, '<a:rPr b="1"');
  }
  return run.replace(/(<a:r(?:\s[^>]*)?>)/, '$1<a:rPr b="1"/>');
}

// Văn bản có đánh dấu **chữ đậm** (VD "**Phân tích DL:** Hoàn thành 03 Dashboard") -> tách thành nhiều run,
// phần trong ** ** in đậm, còn lại giữ định dạng của run mẫu. Không có dấu ** thì như setParagraphText.
function setParagraphRich(p: string, text: string): string {
  if (!/\*\*.+?\*\*/.test(text) && !text.includes("\n")) return setParagraphText(p, text);
  const runs = p.match(RUN_RE);
  if (!runs || runs.length === 0) return p;
  const base = runs[0];
  // rPr của run mẫu dùng cho thẻ ngắt dòng để giữ cỡ chữ.
  const rPr = base.match(/<a:rPr\b[\s\S]*?(?:\/>|<\/a:rPr>)/)?.[0] ?? "";
  const brTag = rPr ? `<a:br>${rPr}</a:br>` : "<a:br/>";
  const parts: string[] = [];
  text.split(/\r?\n/).forEach((line, li) => {
    if (li > 0) parts.push(brTag);
    let last = 0;
    for (const m of line.matchAll(/\*\*(.+?)\*\*/g)) {
      if (m.index! > last) parts.push(setRunText(base, line.slice(last, m.index)));
      parts.push(boldRun(setRunText(base, m[1])));
      last = m.index! + m[0].length;
    }
    if (last < line.length || line.length === 0) parts.push(setRunText(base, line.slice(last)));
  });
  let first = true;
  return p.replace(RUN_RE, () => {
    if (first) {
      first = false;
      return parts.join("");
    }
    return "";
  });
}

// Đặt văn bản cho đoạn văn: dùng run đầu (đã gộp), bỏ các run còn lại.
function setParagraphText(p: string, text: string): string {
  const runs = p.match(RUN_RE);
  if (!runs || runs.length === 0) return p;
  let first = true;
  return p.replace(RUN_RE, (run) => {
    if (first) {
      first = false;
      return setRunText(run, text);
    }
    return "";
  });
}
