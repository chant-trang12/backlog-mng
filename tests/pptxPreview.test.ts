import { describe, expect, it } from "vitest";
import { buildSamplePptx } from "../src/services/pptxSample.service.js";
import { buildPreviewModel } from "../src/services/pptxPreview.service.js";
import type { FillData } from "../src/services/pptx.service.js";

// Xem trước báo cáo PowerPoint dạng slide: mô hình slide dựng từ file mẫu + dữ liệu, kèm mã đầu mục để sửa/góp ý trực tiếp.
describe("buildPreviewModel (xem trước slide)", () => {
  const data: FillData = {
    ky_bao_cao: { kind: "auto", text: "Quý IV/2026" },
    ket_qua_kd: {
      kind: "table",
      rows: [
        { ten: "Doanh thu", don_vi: "tỷ", ke_hoach: "10", thuc_hien: "8", ty_le: "80%" },
        { ten: "Lợi nhuận", don_vi: "tỷ", ke_hoach: "2", thuc_hien: "3", ty_le: "150%" },
      ],
    },
    cv_noi_bat: { kind: "list", items: ["Việc A", "**Đậm:** việc B"] },
    danh_gia: { kind: "paragraph", text: "Đánh giá chung tốt\nDòng 2" },
  };
  const rowIds = new Map([["ket_qua_kd", ["r1", "r2"]]]);

  it("trả kích thước slide + đủ số slide của mẫu", async () => {
    const m = await buildPreviewModel(await buildSamplePptx("quarter"), data, { reportId: 1, rowIds });
    expect(m.slide_w / 12700).toBe(960);
    expect(m.slide_h / 12700).toBe(540);
    expect(m.slides).toHaveLength(7);
  });

  it("bảng: nhân bản hàng theo số chỉ tiêu, ô gắn mã đầu mục + id dòng + cột; % tự tính không sửa được", async () => {
    const m = await buildPreviewModel(await buildSamplePptx("quarter"), data, { reportId: 1, rowIds });
    const table = m.slides.flatMap((s) => s.shapes).find((x) => x.t === "table" && x.codes?.includes("ket_qua_kd"))!;
    expect(table.rows).toHaveLength(3); // 1 hàng tiêu đề + 2 chỉ tiêu
    const cells = table.rows![1].cells;
    expect(cells.map((c) => c.paras[0].runs[0].t)).toEqual(["Doanh thu", "tỷ", "10", "8", "80%"]);
    expect(cells.map((c) => c.sub)).toEqual(["ten", "don_vi", "ke_hoach", "thuc_hien", "ty_le"]);
    expect(cells.map((c) => c.edit)).toEqual([true, true, true, true, false]);
    expect(cells[0].row).toBe("r1");
    expect(table.rows![2].cells[0].row).toBe("r2");
  });

  it("danh sách / đoạn văn: mỗi dòng thành 1 đoạn gắn mã đầu mục; **đậm** thành run in đậm", async () => {
    const m = await buildPreviewModel(await buildSamplePptx("quarter"), data, { reportId: 1, rowIds });
    const shapes = m.slides.flatMap((s) => s.shapes);
    const list = shapes.find((x) => x.codes?.includes("cv_noi_bat"))!;
    expect(list.paras!.map((p) => p.runs.map((r) => r.t).join(""))).toEqual(["Việc A", "Đậm: việc B"]);
    expect(list.paras!.every((p) => p.code === "cv_noi_bat" && !!p.bullet)).toBe(true);
    expect(list.paras![1].runs.some((r) => r.b && r.t === "Đậm:")).toBe(true);
    const para = shapes.find((x) => x.codes?.includes("danh_gia"))!;
    expect(para.paras!.map((p) => p.runs[0].t)).toEqual(["Đánh giá chung tốt", "Dòng 2"]);
  });

  it("mã tự điền được thay bằng giá trị; mã không có dữ liệu thành rỗng (không còn {{...}})", async () => {
    const m = await buildPreviewModel(await buildSamplePptx("quarter"), data, { reportId: 1, rowIds });
    const text = JSON.stringify(m.slides);
    expect(text).toContain("Quý IV/2026");
    expect(text).not.toContain("{{");
  });
});

describe("buildPreviewModel — ghi chú thuyết trình (Notes)", () => {
  it("đọc khung Notes của slide, điền mã và gắn mã đầu mục", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await buildSamplePptx("quarter"));
    const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    zip.file(
      "ppt/notesSlides/notesSlide1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Ghi chú"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="vi-VN"/><a:t>{{danh_gia}}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
    );
    const rels = await zip.file("ppt/slides/_rels/slide2.xml.rels")!.async("string");
    zip.file("ppt/slides/_rels/slide2.xml.rels", rels.replace("</Relationships>", '<Relationship Id="rIdN1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>'));
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const data: FillData = { danh_gia: { kind: "paragraph", text: "Ghi chú dòng 1\nGhi chú dòng 2" } };
    const m = await buildPreviewModel(buf, data, { reportId: 1, rowIds: new Map() });
    const notes = m.slides[1].notes!;
    expect(notes.map((p) => p.runs.map((r) => r.t).join(""))).toEqual(["Ghi chú dòng 1", "Ghi chú dòng 2"]);
    expect(notes.every((p) => p.code === "danh_gia")).toBe(true);
    expect(m.slides[0].notes).toBeUndefined();
  });
});
