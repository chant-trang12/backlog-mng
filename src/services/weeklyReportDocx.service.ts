import JSZip from "jszip";
import type { WeeklyData, WeeklyRow } from "./weeklyReport.service.js";

// Xuất "BC tuần" ra Word (.docx) theo mẫu Báo cáo giao ban tuần: khổ A4 ngang, 3 mục A/B/C.
// Tự dựng OOXML thủ công (không thêm thư viện) — chỉ dùng đoạn văn, bảng (gộp ô ngang/dọc, tô nền), căn lề.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dmy = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
const dmyy = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;

const NAVY = "1F2A44";
const RED = "C00032";
const PINK = "F2DCDB";
const STATUS_FILL: Record<string, string> = {
  "Hoàn thành": "C6E0B4",
  "Đang thực hiện": "EBEFA9",
  "Vướng mắc / cần gia hạn": "F8CBAD",
  "Chưa cập nhật": "E7E6E6",
};

interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  color?: string;
  size?: number; // half-points
}
const run = (text: string, o: RunOpts = {}) =>
  `<w:r><w:rPr>${o.bold ? "<w:b/>" : ""}${o.italic ? "<w:i/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const para = (runs: string, o: { align?: "left" | "center" | "right"; before?: number; after?: number; ind?: { left: number; hanging: number } } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}"/>${o.ind ? `<w:ind w:left="${o.ind.left}" w:hanging="${o.ind.hanging}"/>` : ""}<w:jc w:val="${o.align ?? "left"}"/></w:pPr>${runs}</w:p>`;

// Văn bản nhiều dòng -> nhiều đoạn; dòng bắt đầu "- " / "• " thành gạch đầu dòng.
function textParas(v: string | null | undefined, o: RunOpts & { align?: "left" | "center" } = {}): string {
  const lines = (v ?? "").split("\n").map((l) => l.trimEnd());
  if (lines.length === 1 && lines[0] === "") return para("", { align: o.align });
  return lines
    .map((l) => {
      const m = l.match(/^\s*(?:[-•*])\s+(.*)$/);
      return m ? para(run(`• ${m[1]}`, o), { align: "left", ind: { left: 240, hanging: 240 } }) : para(run(l, o), { align: o.align });
    })
    .join("");
}

interface Cell {
  w: number;
  content: string; // XML đoạn văn
  span?: number;
  vmerge?: "restart" | "continue";
  fill?: string;
  valign?: "top" | "center";
}
const cell = (c: Cell) =>
  `<w:tc><w:tcPr><w:tcW w:w="${c.w}" w:type="dxa"/>${c.span ? `<w:gridSpan w:val="${c.span}"/>` : ""}${c.vmerge ? (c.vmerge === "restart" ? '<w:vMerge w:val="restart"/>' : "<w:vMerge/>") : ""}${c.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill}"/>` : ""}<w:vAlign w:val="${c.valign ?? "center"}"/></w:tcPr>${c.content || para("")}</w:tc>`;
const row = (cells: Cell[], header = false) => `<w:tr><w:trPr><w:cantSplit/>${header ? "<w:tblHeader/>" : ""}</w:trPr>${cells.map(cell).join("")}</w:tr>`;
const BORDERS = ["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="7F7F7F"/>`).join("");
const table = (widths: number[], rows: string, borders = true) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${borders ? `<w:tblBorders>${BORDERS}</w:tblBorders>` : ""}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${rows}</w:tbl>`;

const hdrCell = (w: number, label: string): Cell => ({ w, fill: NAVY, content: para(run(label, { bold: true, color: "FFFFFF" }), { align: "center" }) });
const body = (w: number, v: string | null | undefined, o: Partial<Cell> & { align?: "left" | "center"; bold?: boolean } = {}): Cell => ({
  w,
  valign: o.valign ?? "center",
  fill: o.fill,
  span: o.span,
  vmerge: o.vmerge,
  content: textParas(v, { align: o.align, bold: o.bold }),
});

export async function buildWeeklyReportDocx(data: WeeklyData): Promise<Buffer> {
  const wk = data.week;
  const phong = (data.department_name ?? "").toUpperCase();
  const N = wk.week;
  const N1 = wk.next_week;
  const byS = (s: string) => data.rows.filter((r) => r.section === s).sort((a, b) => a.thu_tu - b.thu_tu || a.id - b.id);
  const parts: string[] = [];

  // Đầu trang: 2 cột không viền.
  parts.push(
    table(
      [7700, 7698],
      row([
        { w: 7700, content: para(run(data.ten_cong_ty.toUpperCase(), { bold: true }), { align: "center" }) + para(run(phong, { bold: true }), { align: "center" }) },
        { w: 7698, content: para(run("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { bold: true }), { align: "center" }) + para(run("Độc lập - Tự do - Hạnh phúc", { bold: true }), { align: "center" }) },
      ]),
      false,
    ),
  );
  parts.push(para(run(`BÁO CÁO GIAO BAN TUẦN ${phong}`, { bold: true, color: RED, size: 30 }), { align: "center", before: 360, after: 60 }));
  parts.push(
    para(
      run(`Tuần ${N} (từ ngày ${dmy(wk.start)} đến ngày ${dmyy(wk.end)}) – Kế hoạch tuần ${N1} (từ ngày ${dmy(wk.next_start)} đến ngày ${dmyy(wk.next_end)})`, { italic: true }),
      { align: "center", after: 240 },
    ),
  );

  // ---- A
  const aW = [700, 1700, 2400, 3900, 3500, 3198];
  parts.push(para(run(`A. NHIỆM VỤ CỦA ${phong.replace(/^PHÒNG\s+/, "P.")} THEO MẢNG CÔNG VIỆC (KẾT QUẢ TUẦN ${N} VÀ KẾ HOẠCH TUẦN ${N1})`, { bold: true, color: "000000", size: 26 }), { before: 120, after: 120 }));
  const aRows = byS("A");
  let aXml = row([hdrCell(aW[0], "STT"), hdrCell(aW[1], "Mảng công việc"), hdrCell(aW[2], "Mục tiêu"), hdrCell(aW[3], "Nội dung công việc"), hdrCell(aW[4], `Kết quả thực hiện tuần ${N}`), hdrCell(aW[5], `Kế hoạch tuần ${N1}`)], true);
  let stt = 0;
  aRows.forEach((r, i) => {
    const first = i === 0 || aRows[i - 1].mang_cong_viec !== r.mang_cong_viec;
    if (first) stt++;
    aXml += row([
      body(aW[0], first ? String(stt) : "", { align: "center", bold: true, vmerge: first ? "restart" : "continue", valign: "center" }),
      { ...body(aW[1], first ? r.mang_cong_viec : "", { bold: true, vmerge: first ? "restart" : "continue", valign: "center", fill: "F2F2F2" }) },
      body(aW[2], r.muc_tieu, { valign: "center" }),
      body(aW[3], r.noi_dung),
      body(aW[4], r.tien_do),
      body(aW[5], r.ke_hoach),
    ]);
  });
  if (!aRows.length) aXml += row([body(aW[0], "", {}), body(aW[1], "", {}), body(aW[2], "", {}), body(aW[3], "", {}), body(aW[4], "", {}), body(aW[5], "", {})]);
  parts.push(table(aW, aXml));

  // ---- B
  const bW = [600, 2600, 1300, 2400, 1500, 1600, 1900, 2000, 1498];
  parts.push(para(run("B. NHIỆM VỤ ĐƯỢC GIAO VOFFICE THEO KẾT LUẬN", { bold: true, color: "000000", size: 26 }), { before: 360, after: 120 }));
  const statusCell = (w: number, v: string | null) => body(w, v, { align: "center", bold: v === "Đang thực hiện" || v === "Hoàn thành", fill: v ? STATUS_FILL[v] : undefined, valign: "center" });
  let bXml = row([hdrCell(bW[0], "STT"), hdrCell(bW[1], "Nhiệm vụ"), hdrCell(bW[2], "Chủ trì"), hdrCell(bW[3], `Tiến độ thực hiện tuần ${N}`), hdrCell(bW[4], "Nội dung"), hdrCell(bW[5], "Khó khăn"), hdrCell(bW[6], "Đề xuất"), hdrCell(bW[7], `Kế hoạch tuần ${N1}`), hdrCell(bW[8], "Trạng thái")], true);
  const groupRow = (label: string, widths: number[]) =>
    row([
      { w: widths[0], fill: PINK, content: para("") },
      { w: widths.slice(1).reduce((a, b) => a + b, 0), span: widths.length - 1, fill: PINK, content: para(run(label, { bold: true, color: "7B1F2A" })) },
    ]);
  const bodyRowsBC = (rows: WeeklyRow[], widths: number[], withNoiDung: boolean) =>
    rows
      .map((r, i) => {
        const cells: Cell[] = [body(widths[0], String(i + 1), { align: "center", valign: "center" }), body(widths[1], r.ten, { bold: withNoiDung }), body(widths[2], r.chu_tri, { align: "center", valign: "center" }), body(widths[3], r.tien_do)];
        let k = 4;
        if (withNoiDung) cells.push(body(widths[k++], r.noi_dung));
        cells.push(body(widths[k++], r.kho_khan), body(widths[k++], r.de_xuat), body(widths[k++], r.ke_hoach), statusCell(widths[k], r.trang_thai));
        return row(cells);
      })
      .join("");
  bXml += groupRow("I. NHIỆM VỤ PHỐI HỢP", bW) + bodyRowsBC(byS("B1"), bW, true);
  bXml += groupRow("II. NHIỆM VỤ TRỰC TIẾP", bW) + bodyRowsBC(byS("B2"), bW, true);
  parts.push(table(bW, bXml));

  // ---- C
  const cW = [600, 3000, 1500, 2700, 1800, 2000, 2400, 1398];
  parts.push(para(run("C. VĂN BẢN VOFFICE ĐƯỢC GIAO THỰC HIỆN", { bold: true, color: "000000", size: 26 }), { before: 360, after: 120 }));
  let cXml = row([hdrCell(cW[0], "STT"), hdrCell(cW[1], "Văn bản"), hdrCell(cW[2], "Chủ trì"), hdrCell(cW[3], `Tiến độ thực hiện tuần ${N}`), hdrCell(cW[4], "Khó khăn"), hdrCell(cW[5], "Đề xuất"), hdrCell(cW[6], `Kế hoạch tuần ${N1}`), hdrCell(cW[7], "Trạng thái")], true);
  cXml += bodyRowsBC(byS("C"), cW, false);
  parts.push(table(cW, cXml));

  parts.push(
    para(run("Ghi chú trạng thái: ", { bold: true }) + run("Hoàn thành (xanh) · Đang thực hiện (vàng) · Vướng mắc / cần gia hạn (cam) · Chưa cập nhật (xám)", { italic: true }), { before: 200, after: 360 }),
  );
  parts.push(para(run(`TRƯỞNG ${phong}`, { bold: true }), { align: "right", before: 120 }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join("")}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("word/document.xml", documentXml);
  zip.file("word/styles.xml", stylesXml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
