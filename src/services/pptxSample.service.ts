import JSZip from "jszip";
import type { PeriodType } from "./reportPeriod.util.js";
import { esc } from "./pptx.service.js";

// Sinh file .pptx MẪU VÍ DỤ (không cần PowerPoint) để người dùng xem cách gán mã {{...}}: mở file bằng
// PowerPoint, chỉnh lại tiêu đề/logo/màu cho đúng mẫu công ty, giữ nguyên các mã rồi tải lên.
const EMU = 12700;
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const RED = "EE0033";

type Slide = { title: string; body: "list" | "table" | "paragraph" | "cover"; code: string; note?: string };

function slidesFor(type: PeriodType): Slide[] {
  if (type === "month") {
    return [
      { title: "BÁO CÁO", body: "cover", code: "ky_bao_cao" },
      { title: "1. Kết quả kinh doanh", body: "table", code: "ket_qua_kd" },
      { title: "2. Công việc đã hoàn thành", body: "list", code: "cv_hoan_thanh" },
      { title: "3. Công việc đang triển khai", body: "list", code: "cv_dang_lam" },
      { title: "4. Tồn tại, vướng mắc", body: "list", code: "ton_tai" },
      { title: "5. Kế hoạch tháng tới", body: "list", code: "ke_hoach" },
    ];
  }
  const noun = type === "quarter" ? "quý" : type === "half" ? "6 tháng" : "năm";
  return [
    { title: "BÁO CÁO", body: "cover", code: "ky_bao_cao" },
    { title: `1. Kết quả kinh doanh ${noun}`, body: "table", code: "ket_qua_kd" },
    { title: "2. So sánh cùng kỳ năm trước", body: "table", code: "so_sanh_cung_ky" },
    { title: `3. Công việc nổi bật trong ${noun}`, body: "list", code: "cv_noi_bat" },
    { title: "4. Tồn tại, vướng mắc", body: "list", code: "ton_tai" },
    { title: "5. Đánh giá chung", body: "paragraph", code: "danh_gia" },
    { title: `6. Kế hoạch ${noun} tới`, body: "list", code: "ke_hoach" },
  ];
}

let nextId = 2;
const sp = (name: string, x: number, y: number, w: number, h: number, paras: string, opts: { fill?: string; anchor?: string } = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${nextId++}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x * EMU}" y="${y * EMU}"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${opts.fill ? `<a:solidFill><a:srgbClr val="${opts.fill}"/></a:solidFill>` : "<a:noFill/>"}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" rIns="91440" anchor="${opts.anchor ?? "t"}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const run = (t: string, o: { sz?: number; b?: boolean; color?: string } = {}) =>
  `<a:r><a:rPr lang="vi-VN" sz="${(o.sz ?? 18) * 100}" b="${o.b ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${o.color ?? "1C1917"}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
const para = (inner: string, o: { bullet?: boolean; algn?: string } = {}) =>
  `<a:p><a:pPr${o.bullet ? ' marL="342900" indent="-342900"' : ""} algn="${o.algn ?? "l"}">${o.bullet ? `<a:buClr><a:srgbClr val="${RED}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="■"/>` : "<a:buNone/>"}</a:pPr>${inner}</a:p>`;

const cell = (t: string, o: { head?: boolean; right?: boolean } = {}) =>
  `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${para(run(t, { sz: 14, b: o.head, color: o.head ? "FFFFFF" : "1C1917" }), { algn: o.right ? "r" : "l" })}</a:txBody><a:tcPr anchor="ctr"><a:lnL w="6350"><a:solidFill><a:srgbClr val="D6D3D1"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="D6D3D1"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="D6D3D1"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="D6D3D1"/></a:solidFill></a:lnB>${o.head ? `<a:solidFill><a:srgbClr val="${RED}"/></a:solidFill>` : "<a:noFill/>"}</a:tcPr></a:tc>`;
function table(code: string): string {
  const widths = [300, 100, 110, 110, 120];
  const row = (cells: string) => `<a:tr h="${40 * EMU}">${cells}</a:tr>`;
  const head = ["Chỉ tiêu", "Đơn vị", "Kế hoạch", "Thực hiện", "% kế hoạch"].map((t, i) => cell(t, { head: true, right: i >= 2 })).join("");
  const tpl = [`{{${code}.ten}}`, `{{${code}.don_vi}}`, `{{${code}.ke_hoach}}`, `{{${code}.thuc_hien}}`, `{{${code}.ty_le}}`].map((t, i) => cell(t, { right: i >= 2 })).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${nextId++}" name="Bảng chỉ tiêu"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${40 * EMU}" y="${120 * EMU}"/><a:ext cx="${widths.reduce((a, b) => a + b, 0) * EMU}" cy="${80 * EMU}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w * EMU}"/>`).join("")}</a:tblGrid>${row(head)}${row(tpl)}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

function slideXml(s: Slide): string {
  nextId = 2;
  const parts: string[] = [];
  if (s.body === "cover") {
    parts.push(sp("Nền tiêu đề", 0, 0, 960, 540, para(""), { fill: RED }));
    parts.push(sp("Tiêu đề", 60, 170, 840, 80, para(run("BÁO CÁO", { sz: 44, b: true, color: "FFFFFF" })), { anchor: "b" }));
    parts.push(sp("Kỳ báo cáo", 60, 260, 840, 70, para(run(`{{${s.code}}}`, { sz: 32, color: "FFFFFF" }))));
  } else {
    parts.push(sp("Thanh tiêu đề", 0, 0, 960, 34, para(run("BÁO CÁO {{ky_bao_cao}}", { sz: 12, b: true, color: "FFFFFF" })), { fill: RED, anchor: "ctr" }));
    parts.push(sp("Tiêu đề", 40, 50, 880, 50, para(run(s.title, { sz: 26, b: true }))));
    if (s.body === "table") parts.push(table(s.code));
    else if (s.body === "paragraph") parts.push(sp("Nội dung", 40, 120, 880, 360, para(run(`{{${s.code}}}`, { sz: 18 }))));
    else parts.push(sp("Nội dung", 40, 120, 880, 360, para(run(`{{${s.code}}}`, { sz: 18 }), { bullet: true })));
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${parts.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Mau"><a:themeElements><a:clrScheme name="Mau"><a:dk1><a:srgbClr val="1C1917"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44403C"/></a:dk2><a:lt2><a:srgbClr val="F5F5F4"/></a:lt2><a:accent1><a:srgbClr val="${RED}"/></a:accent1><a:accent2><a:srgbClr val="179188"/></a:accent2><a:accent3><a:srgbClr val="2EC48F"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="0284C7"/></a:accent5><a:accent6><a:srgbClr val="57534E"/></a:accent6><a:hlink><a:srgbClr val="0369A1"/></a:hlink><a:folHlink><a:srgbClr val="57534E"/></a:folHlink></a:clrScheme><a:fontScheme name="Mau"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Mau"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const EMPTY_TREE = `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>`;
const REL = (items: [string, string, string][]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join("")}</Relationships>`;

export async function buildSamplePptx(type: PeriodType): Promise<Buffer> {
  const slides = slidesFor(type);
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
  );
  zip.file("_rels/.rels", REL([["rId1", "officeDocument", "ppt/presentation.xml"]]));
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${960 * EMU}" cy="${540 * EMU}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  zip.file("ppt/_rels/presentation.xml.rels", REL([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ...slides.map((_, i): [string, string, string] => [`rId${i + 2}`, "slide", `slides/slide${i + 1}.xml`])]));
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}>${EMPTY_TREE}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
  );
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", REL([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]));
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="blank">${EMPTY_TREE}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", REL([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]));
  zip.file("ppt/theme/theme1.xml", THEME);
  slides.forEach((s, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, REL([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]]));
  });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
