import { describe, expect, it } from "vitest";
import request from "supertest";
import JSZip from "jszip";
import { createApp } from "../src/app.js";

// BC tuần: xuất Word (.docx) theo mẫu Báo cáo giao ban tuần.
describe("BC tuần — xuất Word", () => {
  it("trả file .docx hợp lệ có tiêu đề, tuần và đủ 3 mục A/B/C", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "BC tuần Word" });
    const res = await request(app).get(`/api/weekly-reports/export?year=2026&week=47&department_id=${dept.body.id}`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/wordprocessingml/);
    const xml = await (await JSZip.loadAsync(res.body)).file("word/document.xml")!.async("string");
    expect(xml).toContain("BÁO CÁO GIAO BAN TUẦN BC TUẦN WORD");
    expect(xml).toContain("Tuần 47");
    for (const h of ["A. NHIỆM VỤ", "B. NHIỆM VỤ ĐƯỢC GIAO VOFFICE", "C. VĂN BẢN VOFFICE"]) expect(xml).toContain(h);
  });

  it("thiếu phòng ban -> báo lỗi; BC chia sẻ không tồn tại -> không xuất được", async () => {
    const app = createApp();
    expect((await request(app).get("/api/weekly-reports/export?year=2026&week=47")).status).toBe(400);
    expect((await request(app).get("/api/weekly-reports/shared/999999/export")).status).toBeGreaterThanOrEqual(400);
  });
});
