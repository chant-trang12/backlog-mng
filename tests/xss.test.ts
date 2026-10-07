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

    // ATTT Mass Assignment: tinh_chat phải thuộc danh mục Phân loại — seed
    // chính giá trị đã strip để vừa test strip vừa qua được validate.
    const plList = await request(app).get("/api/phan-loai");
    if (!plList.body.some((p: { ten_phan_loai: string }) => p.ten_phan_loai === STRIPPED)) {
      await request(app).post("/api/phan-loai").send({ ten_phan_loai: STRIPPED });
    }

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

  it("PUT /api/tasks/:id — trang_thai, tien_do và PUT /grade — cpo_comment", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 2);
    await makeTeam(app, "XSS update team", periodId);
    const created = await request(app)
      .post(`/api/periods/${periodId}/tasks`)
      .send({ team: "XSS update team", nhiem_vu: "Task gốc" });
    const taskId = created.body.id as number;

    // ATTT Mass Assignment: trang_thai chỉ nhận enum hợp lệ (không thể nhét
    // payload); cpo_comment không nhận qua PUT thường — chỉ qua /grade.
    const updated = await request(app)
      .put(`/api/tasks/${taskId}`)
      .send({ trang_thai: "Đang thực hiện", tien_do: `50%${PAYLOAD}` });
    expect(updated.status).toBe(200);
    expect(updated.body.trang_thai).toBe("Đang thực hiện");
    expectNoHtmlChars(updated.body.tien_do);
    expect(updated.body.tien_do).toBe(`50%${STRIPPED}`);

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

  it("Ma trận: mỗi router nghiệp vụ còn lại đều strip payload ở chức năng tạo/sửa", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2016, 9);
    const teamId = await makeTeam(app, "XSS matrix team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự matrix", team_id: teamId, period_id: periodId });
    const memberId = member.body.id as number;
    const dept = await request(app)
      .post("/api/departments")
      .send({ name: `Phòng FR${PAYLOAD}`, code: "FR" });
    const deptId = dept.body.id as number;

    const cases: { name: string; run: () => Promise<request.Response> }[] = [
      {
        name: "POST /api/teams (Team)",
        run: () => request(app).post("/api/teams").send({ name: `Team${PAYLOAD}`, period_id: periodId }),
      },
      {
        name: "POST /api/departments (Phòng ban)",
        run: () => request(app).post("/api/departments").send({ name: `Phòng${PAYLOAD}`, code: PAYLOAD }),
      },
      {
        name: "POST /api/support-records (Hỗ trợ)",
        run: () =>
          request(app).post("/api/support-records").send({
            member_id: memberId,
            team_nhan_ho_tro_id: teamId,
            period_id: periodId,
            noi_dung: PAYLOAD,
            ngay_ho_tro: "2026-01-20",
            nguoi_xac_nhan: PAYLOAD,
          }),
      },
      {
        name: "POST /api/training-records (Đào tạo)",
        run: () =>
          request(app).post("/api/training-records").send({
            member_id: memberId,
            period_id: periodId,
            loai: "Đào tạo",
            ngay_thuc_hien: "2026-01-21",
            nguoi_xac_nhan: PAYLOAD,
            noi_dung: PAYLOAD,
          }),
      },
      {
        name: "POST /api/compliance-records (Tuân thủ)",
        run: () =>
          request(app)
            .post("/api/compliance-records")
            .send({ member_id: memberId, period_id: periodId, vi_pham: 1, noi_dung: PAYLOAD }),
      },
      {
        name: "POST /api/danh-gia-records/bulk (Đánh giá)",
        run: () =>
          request(app).post("/api/danh-gia-records/bulk").send({
            period_id: periodId,
            team_id: teamId,
            entries: [{ member_id: memberId, so_thu_tu: 1, ghi_chu: PAYLOAD }],
          }),
      },
      {
        name: "POST /api/noiquy-overrides (Nội quy)",
        run: () => request(app).post("/api/noiquy-overrides").send({ period_id: periodId, names: [PAYLOAD] }),
      },
      {
        name: "POST /api/tags (Cấu hình - Tag)",
        run: () => request(app).post("/api/tags").send({ ten_tag: PAYLOAD }),
      },
      {
        name: "POST /api/phan-loai (Cấu hình - Phân loại)",
        run: () => request(app).post("/api/phan-loai").send({ ten_phan_loai: PAYLOAD }),
      },
      {
        name: "POST /api/nhom (Cấu hình - Nhóm)",
        run: () => request(app).post("/api/nhom").send({ ten_nhom: PAYLOAD }),
      },
      {
        name: "POST /api/chuc-vu (Cấu hình - Chức vụ)",
        run: () => request(app).post("/api/chuc-vu").send({ ten_chuc_vu: PAYLOAD }),
      },
      {
        name: "POST /api/he-thong (Cấu hình - Hệ thống)",
        run: () => request(app).post("/api/he-thong").send({ ten_he_thong: PAYLOAD }),
      },
      {
        name: "POST /api/muc-tieu (Cấu hình - Mục tiêu)",
        run: () => request(app).post("/api/muc-tieu").send({ ten_muc_tieu: PAYLOAD }),
      },
      {
        name: "POST /api/phan-loai-nhan-su (Cấu hình - Phân loại nhân sự)",
        run: () => request(app).post("/api/phan-loai-nhan-su").send({ ten_phan_loai: PAYLOAD }),
      },
      {
        name: "POST /api/ranking-config/columns (Ranking)",
        run: () => request(app).post("/api/ranking-config/columns").send({ ten_cot: PAYLOAD }),
      },
      {
        name: "POST /api/roadmap-items (Roadmap)",
        run: () =>
          request(app)
            .post("/api/roadmap-items")
            .send({ year: 2016, team: `Roadmap${PAYLOAD}`, nhiem_vu: PAYLOAD }),
      },
      {
        name: "POST /api/tieu-chi (Tiêu chí)",
        run: () =>
          request(app).post("/api/tieu-chi").send({ nhom: `Nhóm${PAYLOAD}`, ten_tieu_chi: PAYLOAD }),
      },
      {
        name: "POST /api/feature-requests (Yêu cầu tính năng)",
        run: () =>
          request(app)
            .post("/api/feature-requests")
            .send({ he_thong: PAYLOAD, tieu_de: `Yêu cầu${PAYLOAD}`, target_department_id: deptId }),
      },
      {
        name: "POST /api/tasks/:id/items (Việc con)",
        run: async () => {
          const task = await request(app)
            .post(`/api/periods/${periodId}/tasks`)
            .send({ team: "XSS matrix team", nhiem_vu: "Task cho việc con" });
          return request(app)
            .post(`/api/tasks/${task.body.id}/items`)
            .send({ ten_viec: PAYLOAD, trang_thai: "Đang thực hiện", ghi_chu: PAYLOAD });
        },
      },
    ];

    for (const c of cases) {
      const res = await c.run();
      expect(res.status, `${c.name} -> ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`).toBeDefined();
      expect([200, 201], `${c.name} -> HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`).toContain(
        res.status,
      );
      // Payload là nguồn duy nhất chứa "<"/">" — toàn bộ response JSON phải sạch.
      expect(`${c.name}: ${JSON.stringify(res.body)}`).not.toContain("<");
      expect(`${c.name}: ${JSON.stringify(res.body)}`).not.toContain(">");
    }
  });
});
