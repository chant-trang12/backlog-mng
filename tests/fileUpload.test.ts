import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { detectAttachmentMime, validateAttachmentFile } from "../src/utils/fileValidation.js";

// ---- Fix ATTT "Upload tệp tin bất kỳ" (file đính kèm Yêu cầu tính năng) ----
// Whitelist extension + xác minh magic bytes + server tự suy MIME.

// Bytes thật của từng loại file (đủ signature để nhận diện).
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF = Buffer.from("GIF89a", "latin1");
const WEBP = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WEBP", "latin1")]);
const PDF = Buffer.from("%PDF-1.7 fake", "latin1");
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // PK.. (OOXML)
const DOC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ (Windows PE)
const HTML = Buffer.from('<script>alert("xss")</script>', "latin1");
const TEXT = Buffer.from("Spec: mô tả yêu cầu tính năng\n", "utf8");

let frUniqueSeq = 0;

async function createFeatureRequest(app: ReturnType<typeof createApp>): Promise<number> {
  frUniqueSeq += 1;
  const created = await request(app)
    .post("/api/feature-requests")
    .send({
      he_thong: "CRM",
      tieu_de: `Test đính kèm ATTT ${Date.now()}-${frUniqueSeq}`,
      target_department_id: 1,
    });
  expect(created.status).toBe(201);
  return created.body.id;
}

describe("validateAttachmentFile — whitelist extension + magic bytes", () => {
  it("chấp nhận các định dạng trong whitelist, MIME do server suy ra", () => {
    expect(validateAttachmentFile("mockup.png", PNG)).toEqual({ ok: true, mime: "image/png" });
    expect(validateAttachmentFile("anh.jpg", JPG)).toEqual({ ok: true, mime: "image/jpeg" });
    expect(validateAttachmentFile("do hoa.webp", WEBP)).toEqual({ ok: true, mime: "image/webp" });
    expect(validateAttachmentFile("bien-dong.gif", GIF)).toEqual({ ok: true, mime: "image/gif" });
    expect(validateAttachmentFile("spec.pdf", PDF)).toEqual({ ok: true, mime: "application/pdf" });
    expect(validateAttachmentFile("bao-cao.docx", DOCX)).toEqual({ ok: true, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(validateAttachmentFile("cu.doc", DOC)).toEqual({ ok: true, mime: "application/msword" });
    expect(validateAttachmentFile("mo-ta.txt", TEXT)).toEqual({ ok: true, mime: "text/plain" });
    expect(validateAttachmentFile("du-lieu.csv", TEXT)).toEqual({ ok: true, mime: "text/csv" });
  });

  it("chặn định dạng ngoài whitelist (html/svg/js/php/exe/zip...) — không dùng blacklist", () => {
    for (const [name, content] of [
      ["xss.html", HTML],
      ["xss.svg", HTML],
      ["payload.js", HTML],
      ["shell.php", EXE],
      ["trojan.exe", EXE],
      ["trojan.bat", TEXT],
      ["archive.zip", DOCX],
      ["nofile", TEXT],
    ] as const) {
      const result = validateAttachmentFile(name, content);
      expect(result.ok, name).toBe(false);
    }
  });

  it("chặn nội dung không khớp phần mở rộng (virus.exe đổi tên .png, .txt chứa nhị phân)", () => {
    const mismatch = validateAttachmentFile("fake.png", EXE);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.error).toContain(".png");

    const binaryAsTxt = validateAttachmentFile("readme.txt", EXE);
    expect(binaryAsTxt.ok).toBe(false);

    const pngAsTxt = validateAttachmentFile("image.txt", PNG);
    expect(pngAsTxt.ok).toBe(false);
  });

  it("chặn file rỗng và file không có phần mở rộng hợp lệ", () => {
    expect(validateAttachmentFile("trong.png", Buffer.alloc(0)).ok).toBe(false);
    expect(validateAttachmentFile("", TEXT).ok).toBe(false);
  });
});

describe("detectAttachmentMime — MIME từ nội dung thật (dùng khi tải file về)", () => {
  it("nhận diện đúng signature, không nhận diện được thì octet-stream", () => {
    expect(detectAttachmentMime(PNG)).toBe("image/png");
    expect(detectAttachmentMime(JPG)).toBe("image/jpeg");
    expect(detectAttachmentMime(PDF)).toBe("application/pdf");
    expect(detectAttachmentMime(DOCX)).toBe("application/octet-stream");
    expect(detectAttachmentMime(TEXT)).toBe("text/plain");
    expect(detectAttachmentMime(EXE)).toBe("application/octet-stream");
  });
});

describe("POST/GET /api/feature-requests/:id/attachment — kiểm tra tại HTTP", () => {
  it("tải lên file hợp lệ (.png) -> thành công với MIME do server gán", async () => {
    const app = createApp();
    const id = await createFeatureRequest(app);
    const res = await request(app)
      .post(`/api/feature-requests/${id}/attachment?filename=screenshot.png`)
      .set("Content-Type", "text/html") // client nói dối Content-Type
      .send(PNG);
    expect(res.status).toBe(200);
    expect(res.body.attachment_filename).toBe("screenshot.png");
    expect(res.body.attachment_mime).toBe("image/png"); // từ magic bytes, KHÔNG phải header client
  });

  it("tải lên .html/.exe bị chặn 400 kèm lý do", async () => {
    const app = createApp();
    const id = await createFeatureRequest(app);
    const html = await request(app)
      .post(`/api/feature-requests/${id}/attachment?filename=xss.html`)
      .set("Content-Type", "text/html")
      .send(HTML);
    expect(html.status).toBe(400);

    const exeRenamed = await request(app)
      .post(`/api/feature-requests/${id}/attachment?filename=link.png`)
      .set("Content-Type", "image/png")
      .send(EXE);
    expect(exeRenamed.status).toBe(400);
    expect(exeRenamed.body.error).toContain("không khớp");
  });

  it("tải file về: Content-Type từ magic bytes + nosniff + luôn 'attachment'", async () => {
    const app = createApp();
    const id = await createFeatureRequest(app);
    await request(app)
      .post(`/api/feature-requests/${id}/attachment?filename=anh.png`)
      .set("Content-Type", "text/html")
      .send(PNG);

    const res = await request(app).get(`/api/feature-requests/${id}/attachment`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"].startsWith("attachment")).toBe(true);
  });
});
