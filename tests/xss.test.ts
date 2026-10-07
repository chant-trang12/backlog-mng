import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";
import { sanitizeDeepInPlace, stripHtmlChars } from "../src/utils/sanitize.util.js";

// Payload theo báo cáo ATTT (Stored XSS qua <iframe srcdoc>).
const PAYLOAD =
  '<iframe srcdoc="&lt;script src=&quot;/api/feature-requests/35/attachment?department_id=4&quot;&gt;&lt;/script&gt;"></iframe>';
const STRIPPED = PAYLOAD.replace(/[<>]/g, "");

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
}

function expectNoHtmlChars(value: unknown): void {
  expect(typeof value).toBe("string");
  expect(String(value)).not.toContain("<");
  expect(String(value)).not.toContain(">");
}

describe("ATTT: Stored XSS — mọi đầu vào ghi đều bị strip ký tự tạo thẻ HTML", () => {
  it("stripHtmlChars chỉ bỏ < > — giữ nguyên &, nháy, chữ còn lại", () => {
    expect(stripHtmlChars(PAYLOAD)).toBe(STRIPPED);
    expect(stripHtmlChars('A & B "x" \'y\' <b>đậm</b>')).toBe('A & B "x" \'y\' bđậm/b');
  });

  it("POST /api/periods/:id/tasks — team, tinh_chat, nhiem_vu, dod, deadline, dau_moi_phoi_hop", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 1);
    await makeTeam(app, "XSS team", periodId);

    const res = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({
        team: `XSS team${PAYLOAD}`,
        tinh_chat: PAYLOAD,
        nhiem_vu: `Nhiệm vụ${PAYLOAD}`,
        dod: PAYLOAD,
        deadline: "2016-01-31",
        dau_moi_phoi_hop: PAYLOAD,
      });
    expect(res.status).toBe(201);
    expect(res.body.nhiem_vu).toBe(`Nhiệm vụ${STRIPPED}`);
    for (const key of ["team", "tinh_chat", "nhiem_vu", "dod", "dau_moi_phoi_hop"]) {
      expectNoHtmlChars(res.body[key]);
    }
    expect(res.body.deadline).toBe("2016-01-31");
  });

  it("PUT /api/tasks/:id — trang_thai, tien_do, cpo_comment và PUT /grade — cpo_comment", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 2);
    await makeTeam(app, "XSS update team", periodId);
    const created = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "XSS update team", nhiem_vu: "Task gốc" });
    const taskId = created.body.id as number;

    const updated = await request(app)
      .put(`/api/tasks/${taskId}`)
      .send({ trang_thai: `Đang làm${PAYLOAD}`, tien_do: `50%${PAYLOAD}`, cpo_comment: PAYLOAD });
    expect(updated.status).toBe(200);
    for (const key of ["trang_thai", "tien_do", "cpo_comment"]) {
      expectNoHtmlChars(updated.body[key]);
    }

    const graded = await request(app)
      .put(`/api/tasks/${taskId}/grade`)
      .send({ cpo_danh_gia: 80, cpo_comment: `Tốt${PAYLOAD}` });
    expect(graded.status).toBe(200);
    expectNoHtmlChars(graded.body.cpo_comment);
    expect(graded.body.cpo_comment).toBe(`Tốt${STRIPPED}`);
  });

  it("POST /api/tasks/:id/members — phan_loai, ghi_chu", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 3);
    const teamId = await makeTeam(app, "XSS tm team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự XSS", team_id: teamId, period_id: periodId });
    const task = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "XSS tm team", nhiem_vu: "Task có nhân sự" });

    const res = await request(app)
      .post(`/api/tasks/${task.body.id}/members`)
      .send({ member_id: member.body.id, phan_loai: PAYLOAD, ghi_chu: PAYLOAD });
    expect(res.status).toBe(201);
    for (const key of ["phan_loai", "ghi_chu"]) {
      expectNoHtmlChars(res.body[key]);
    }
  });

  it("POST + PUT /api/members — name, chuc_vu, ghi_chu", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 4);
    const teamId = await makeTeam(app, "XSS member team", periodId);

    const created = await request(app)
      .post("/api/members")
      .send({ name: `Nguyễn Văn${PAYLOAD}`, chuc_vu: PAYLOAD, ghi_chu: PAYLOAD, team_id: teamId, period_id: periodId });
    expect(created.status).toBe(201);
    for (const key of ["name", "chuc_vu", "ghi_chu"]) {
      expectNoHtmlChars(created.body[key]);
    }

    const updated = await request(app)
      .put(`/api/members/${created.body.id}`)
      .send({ name: `Sửa tên${PAYLOAD}`, chuc_vu: `Trưởng nhóm${PAYLOAD}`, ghi_chu: PAYLOAD });
    expect(updated.status).toBe(200);
    for (const key of ["name", "chuc_vu", "ghi_chu"]) {
      expectNoHtmlChars(updated.body[key]);
    }
  });

  it("POST /api/incidents — payload ở các cột dữ liệu sự cố", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 5);
    const teamId = await makeTeam(app, "XSS incident team", periodId);

    const res = await request(app).post("/api/incidents").send({
      team_id: teamId,
      period_id: periodId,
      ten_su_co: `Su co${PAYLOAD}`,
      hien_tuong: PAYLOAD,
      nguyen_nhan: PAYLOAD,
      hanh_dong: PAYLOAD,
      don_vi_trach_nhiem: PAYLOAD,
    });
    expect(res.status).toBe(201);
    for (const key of ["ten_su_co", "hien_tuong", "nguyen_nhan", "hanh_dong", "don_vi_trach_nhiem"]) {
      expectNoHtmlChars(res.body[key]);
    }
  });

  it("Giữ nguyên ký tự hợp lệ (&, nháy, dấu tiếng Việt) — chỉ bỏ < >", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 6);
    const teamId = await makeTeam(app, "XSS legit team", periodId);

    const res = await request(app)
      .post("/api/members")
      .send({ name: 'A & B "kiểm tra" <nhân>sự', chuc_vu: "Trưởng nhóm", team_id: teamId, period_id: periodId });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('A & B "kiểm tra" nhânsự');
  });

  it("sanitizeDeepInPlace: object/array lồng sâu được strip, Buffer giữ nguyên", () => {
    const body = {
      a: `x${PAYLOAD}`,
      nested: { b: [PAYLOAD, { c: PAYLOAD }, 5, null, true] },
      keep: Buffer.from("<ok>"),
      n: 42,
    };
    sanitizeDeepInPlace(body);
    expect(body.a).toBe(`x${STRIPPED}`);
    expect(body.nested.b[0]).toBe(STRIPPED);
    expect((body.nested.b[1] as { c: string }).c).toBe(STRIPPED);
    expect(body.nested.b[2]).toBe(5);
    expect(body.keep.toString()).toBe("<ok>");
  });

  it("Import Excel: ô chứa payload -> dữ liệu import không còn ký tự tạo thẻ", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 7);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Chấm công");
    sheet.addRow(["Họ tên", "Ngày công", "Ghi chú"]);
    sheet.addRow([`Nguyễn Văn A${PAYLOAD}`, 22, "Đủ công"]);
    const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());

    const imported = await request(app)
      .post(`/api/attendance-records/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(xlsx);
    expect(imported.status).toBe(201);
    expect(imported.body.rows).toHaveLength(1);
    const hoTen = imported.body.rows[0].row_data["Họ tên"] as string;
    expect(hoTen).toBe(`Nguyễn Văn A${STRIPPED}`);
  });

  it("scrubLegacyHtmlChars: dữ liệu CŨ trong DB (payload lưu trước khi fix) cũng được làm sạch", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 8);
    const teamId = await makeTeam(app, "XSS scrub team", periodId);
    const created = await request(app)
      .post("/api/members")
      .send({ name: `Cũ${PAYLOAD}`, team_id: teamId, period_id: periodId });
    const memberId = created.body.id as number;

    // Giả lập dữ liệu legacy: ghi thẳng payload vào DB (bỏ qua middleware).
    const { db } = await import("../src/db/database.js");
    await db("members").where({ id: memberId }).update({ name: `Cũ${PAYLOAD}` });
    const before = await db("members").where({ id: memberId }).first("name");
    expect(before.name).toBe(`Cũ${PAYLOAD}`);

    const { scrubLegacyHtmlChars } = await import("../src/db/migrations/xssScrub.js");
    await scrubLegacyHtmlChars();

    const after = await db("members").where({ id: memberId }).first("name");
    expect(after.name).toBe(`Cũ${STRIPPED}`);
  });
});
