import { describe, expect, it } from "vitest";
import request from "supertest";
import ExcelJS from "exceljs";
import { createApp } from "../src/app.js";

// Dựng buffer .xlsx từ tiêu đề + các dòng dữ liệu, để test route import.
async function xlsxBuffer(headers: string[], rows: (string | undefined)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function makePeriod(app: ReturnType<typeof createApp>, year: number, month: number) {
  const res = await request(app).post("/api/periods").send({ year, month });
  return res.body.id as number;
}

async function makeTeam(app: ReturnType<typeof createApp>, name: string, periodId: number) {
  const res = await request(app).post("/api/teams").send({ name, period_id: periodId });
  return res.body.id as number;
}

// Tháng mới tạo kế thừa team/nhân sự từ tháng "gần nhất" trên TOÀN BỘ DB test
// (dùng chung file với các test khác) — chọn năm chắc chắn lớn hơn mọi năm
// khác đang có để đảm bảo period vừa tạo luôn là tháng gần nhất thật sự.
async function nextAvailableYear(app: ReturnType<typeof createApp>, baseline: number) {
  const periods = await request(app).get("/api/periods");
  const maxYear = Math.max(baseline, ...periods.body.map((p: { year: number }) => p.year));
  return maxYear + 1;
}

describe("Member declaration (CRUD table: STT / Họ và Tên / Chức vụ / Team)", () => {
  it("creates, updates, lists (with team name), and deletes a member", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2041, 1);
    const teamId = await makeTeam(app, "Member test team", periodId);

    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nguyễn Văn A", chuc_vu: "Trưởng nhóm", team_id: teamId, period_id: periodId });
    expect(member.status).toBe(201);
    expect(member.body.name).toBe("Nguyễn Văn A");
    expect(member.body.chuc_vu).toBe("Trưởng nhóm");

    const list = await request(app).get(`/api/members?period_id=${periodId}`);
    expect(list.status).toBe(200);
    const found = list.body.find((m: { id: number }) => m.id === member.body.id);
    expect(found.team_name).toBe("Member test team");

    const updated = await request(app)
      .put(`/api/members/${member.body.id}`)
      .send({ chuc_vu: "Quản lý" });
    expect(updated.status).toBe(200);
    expect(updated.body.chuc_vu).toBe("Quản lý");
    expect(updated.body.name).toBe("Nguyễn Văn A");

    const del = await request(app).delete(`/api/members/${member.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get(`/api/members?period_id=${periodId}`);
    expect(listAfter.body.some((m: { id: number }) => m.id === member.body.id)).toBe(false);
  });

  it("rejects creating a member with an invalid team_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2041, 2);
    const res = await request(app)
      .post("/api/members")
      .send({ name: "X", team_id: 999999, period_id: periodId });
    expect(res.status).toBe(400);
  });

  it("rejects creating a member with an invalid period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2041, 12);
    const teamId = await makeTeam(app, "CSKH incident invalid team", periodId);
    const res = await request(app)
      .post("/api/members")
      .send({ name: "X", team_id: teamId, period_id: 999999 });
    expect(res.status).toBe(400);
  });

  it("bulk-deletes selected members via checkbox delete-selected", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2041, 3);
    const teamId = await makeTeam(app, "Bulk delete test team", periodId);

    const m1 = await request(app).post("/api/members").send({ name: "Bulk 1", team_id: teamId, period_id: periodId });
    const m2 = await request(app).post("/api/members").send({ name: "Bulk 2", team_id: teamId, period_id: periodId });
    const m3 = await request(app).post("/api/members").send({ name: "Bulk 3", team_id: teamId, period_id: periodId });

    const res = await request(app)
      .post("/api/members/delete-selected")
      .send({ ids: [m1.body.id, m2.body.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const list = await request(app).get(`/api/members?period_id=${periodId}`);
    const ids = list.body.map((m: { id: number }) => m.id);
    expect(ids).not.toContain(m1.body.id);
    expect(ids).not.toContain(m2.body.id);
    expect(ids).toContain(m3.body.id);
  });

  it("rejects delete-selected with an empty ids array", async () => {
    const app = createApp();
    const res = await request(app).post("/api/members/delete-selected").send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("serves an .xlsx import template", async () => {
    const app = createApp();
    const res = await request(app).get("/api/members/import-template").buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain(".xlsx");
    expect(Number(res.headers["content-length"])).toBeGreaterThan(0);
  });

  it("imports members from an Excel file: creates missing teams, skips rows without a name/team, is additive", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2053, 5);
    await makeTeam(app, "CRM", periodId);

    const buf = await xlsxBuffer(
      ["Họ và Tên", "Chức vụ", "Team"],
      [
        ["Nguyễn Văn A", "Trưởng nhóm", "CRM"], // team đã có
        ["Trần Thị B", "", "CSKH"], // team mới -> tự tạo
        ["", "Nhân viên", "CRM"], // thiếu tên -> bỏ qua
        ["Lê Văn C", "Nhân viên", ""], // thiếu team -> bỏ qua
      ],
    );

    const res = await request(app)
      .post(`/api/members/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    expect(res.body.teamsCreated).toEqual(["CSKH"]);
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped.map((s: { reason: string }) => s.reason).sort()).toEqual([
      "Thiếu Họ và Tên",
      "Thiếu Team",
    ]);

    const list = await request(app).get(`/api/members?period_id=${periodId}`);
    const a = list.body.find((m: { name: string }) => m.name === "Nguyễn Văn A");
    expect(a.chuc_vu).toBe("Trưởng nhóm");
    expect(a.team_name).toBe("CRM");
    expect(list.body.some((m: { name: string }) => m.name === "Trần Thị B")).toBe(true);

    // Nhập lại: idempotent theo (period, team, name) — không nhân đôi.
    const res2 = await request(app)
      .post(`/api/members/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res2.status).toBe(201);
    const listAfter = await request(app).get(`/api/members?period_id=${periodId}`);
    expect(listAfter.body.filter((m: { name: string }) => m.name === "Nguyễn Văn A")).toHaveLength(1);
  });

  it("rejects an import file missing the Họ và Tên column", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2053, 6);
    const buf = await xlsxBuffer(["Tên đầy đủ", "Team"], [["X", "CRM"]]);
    const res = await request(app)
      .post(`/api/members/import?period_id=${periodId}`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Họ và Tên");
  });

  it("rejects an import with an invalid period_id", async () => {
    const app = createApp();
    const buf = await xlsxBuffer(["Họ và Tên", "Team"], [["X", "CRM"]]);
    const res = await request(app)
      .post(`/api/members/import?period_id=999999`)
      .set("Content-Type", "application/octet-stream")
      .send(buf);
    expect(res.status).toBe(400);
  });

  it("cascades member deletion when the parent team is deleted", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2041, 4);
    const teamId = await makeTeam(app, "Member cascade test team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "B", team_id: teamId, period_id: periodId });

    await request(app).delete(`/api/teams/${teamId}`);

    const listAfter = await request(app).get(`/api/members?period_id=${periodId}`);
    expect(listAfter.body.some((m: { id: number }) => m.id === member.body.id)).toBe(false);
  });

  it("clones members into a newly created period, and deleting in one period does not affect another", async () => {
    const app = createApp();

    // createPeriod() nhân bản nhân sự từ tháng gần nhất trên toàn bộ DB (không
    // scope theo test) — DB test dùng chung file với các test khác chạy song
    // song, nên chọn năm chắc chắn lớn hơn mọi năm khác đang có để tháng vừa
    // tạo luôn là "tháng gần nhất" thật sự, tránh test bị nhiễu chéo.
    const existingPeriods = await request(app).get("/api/periods");
    const maxYear = Math.max(2042, ...existingPeriods.body.map((p: { year: number }) => p.year));
    const testYear = maxYear + 1;

    const augId = await makePeriod(app, testYear, 8);
    const teamId = await makeTeam(app, "Period scoped member team", augId);

    const memberA = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: teamId, period_id: augId });
    expect(memberA.status).toBe(201);

    // Tháng mới tạo sau đó phải kế thừa nhân sự (và team) từ tháng gần nhất.
    const sepId = await makePeriod(app, testYear, 9);

    const sepList = await request(app).get(`/api/members?period_id=${sepId}`);
    const clonedA = sepList.body.find((m: { name: string }) => m.name === "Nhân sự A");
    expect(clonedA).toBeDefined();
    expect(clonedA.id).not.toBe(memberA.body.id); // bản ghi riêng, không dùng chung id
    expect(clonedA.team_id).not.toBe(teamId); // team cũng là bản ghi riêng theo period

    // Xóa "Nhân sự A" ở tháng 9 — bản ghi ở tháng 8 phải còn nguyên.
    const del = await request(app).delete(`/api/members/${clonedA.id}`);
    expect(del.status).toBe(204);

    const augListAfter = await request(app).get(`/api/members?period_id=${augId}`);
    expect(augListAfter.body.some((m: { id: number }) => m.id === memberA.body.id)).toBe(true);

    const sepListAfter = await request(app).get(`/api/members?period_id=${sepId}`);
    expect(sepListAfter.body.some((m: { name: string }) => m.name === "Nhân sự A")).toBe(false);
  });

  it("cột Tuân thủ ở bảng Nhân sự tính từ tổng Vi phạm đúng theo từng tháng, hiển thị dạng -N", async () => {
    const app = createApp();
    const testYear = await nextAvailableYear(app, 2046);
    const augId = await makePeriod(app, testYear, 8);
    const teamId = await makeTeam(app, "Compliance summary team", augId);
    const sepId = await makePeriod(app, testYear, 9);

    // Tháng 8: nhân sự A vi phạm 1 lần.
    const memberAAug = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: teamId, period_id: augId });
    await request(app)
      .post("/api/compliance-records")
      .send({ member_id: memberAAug.body.id, period_id: augId, vi_pham: 1 });

    // Tháng 9: nhân sự A vi phạm 2 lần, nhân sự B vi phạm 5 lần.
    const sepTeamId = (await request(app).get(`/api/teams?period_id=${sepId}`)).body.find(
      (t: { name: string }) => t.name === "Compliance summary team",
    ).id;
    const memberASep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: sepTeamId, period_id: sepId });
    const memberBSep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự B", team_id: sepTeamId, period_id: sepId });
    await request(app)
      .post("/api/compliance-records")
      .send({ member_id: memberASep.body.id, period_id: sepId, vi_pham: 2 });
    await request(app)
      .post("/api/compliance-records")
      .send({ member_id: memberBSep.body.id, period_id: sepId, vi_pham: 5 });

    const augList = await request(app).get(`/api/members?period_id=${augId}`);
    const aAug = augList.body.find((m: { id: number }) => m.id === memberAAug.body.id);
    expect(aAug.tuan_thu).toBe("-1");

    const sepList = await request(app).get(`/api/members?period_id=${sepId}`);
    const aSep = sepList.body.find((m: { id: number }) => m.id === memberASep.body.id);
    const bSep = sepList.body.find((m: { id: number }) => m.id === memberBSep.body.id);
    expect(aSep.tuan_thu).toBe("-2");
    expect(bSep.tuan_thu).toBe("-5");
  });

  it("cột Đào tạo ở bảng Nhân sự tính từ số lượng bản ghi Đào tạo đúng theo từng tháng, hiển thị dạng +N", async () => {
    const app = createApp();
    const testYear = await nextAvailableYear(app, 2050);
    const augId = await makePeriod(app, testYear, 8);
    const teamId = await makeTeam(app, "Training summary team", augId);
    const sepId = await makePeriod(app, testYear, 9);
    const sepTeamId = (await request(app).get(`/api/teams?period_id=${sepId}`)).body.find(
      (t: { name: string }) => t.name === "Training summary team",
    ).id;

    // Tháng 8: nhân sự A có 1 bản ghi đào tạo.
    const memberAAug = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: teamId, period_id: augId });
    await request(app)
      .post("/api/training-records")
      .send({ member_id: memberAAug.body.id, period_id: augId, loai: "Đào tạo" });

    // Tháng 9: nhân sự A có 2 bản ghi, nhân sự B có 5 bản ghi.
    const memberASep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: sepTeamId, period_id: sepId });
    const memberBSep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự B", team_id: sepTeamId, period_id: sepId });
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/training-records")
        .send({ member_id: memberASep.body.id, period_id: sepId, loai: "Đào tạo" });
    }
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/training-records")
        .send({ member_id: memberBSep.body.id, period_id: sepId, loai: "Đào tạo" });
    }

    const augList = await request(app).get(`/api/members?period_id=${augId}`);
    const aAug = augList.body.find((m: { id: number }) => m.id === memberAAug.body.id);
    expect(aAug.dao_tao).toBe("+1");

    const sepList = await request(app).get(`/api/members?period_id=${sepId}`);
    const aSep = sepList.body.find((m: { id: number }) => m.id === memberASep.body.id);
    const bSep = sepList.body.find((m: { id: number }) => m.id === memberBSep.body.id);
    expect(aSep.dao_tao).toBe("+2");
    expect(bSep.dao_tao).toBe("+5");
  });

  it("cột Hỗ trợ ở bảng Nhân sự tính từ số lượng bản ghi Hỗ trợ đúng theo từng tháng, hiển thị dạng +N", async () => {
    const app = createApp();
    const testYear = await nextAvailableYear(app, 2051);
    const augId = await makePeriod(app, testYear, 8);
    const teamId = await makeTeam(app, "Support summary team", augId);
    const teamNhanId = await makeTeam(app, "Support summary team nhận", augId);
    const sepId = await makePeriod(app, testYear, 9);
    const sepTeams = (await request(app).get(`/api/teams?period_id=${sepId}`)).body;
    const sepTeamId = sepTeams.find((t: { name: string }) => t.name === "Support summary team").id;
    const sepTeamNhanId = sepTeams.find((t: { name: string }) => t.name === "Support summary team nhận").id;

    // Tháng 8: nhân sự A có 1 bản ghi hỗ trợ.
    const memberAAug = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: teamId, period_id: augId });
    await request(app)
      .post("/api/support-records")
      .send({ member_id: memberAAug.body.id, team_nhan_ho_tro_id: teamNhanId, period_id: augId });

    // Tháng 9: nhân sự A có 2 bản ghi, nhân sự B có 3 bản ghi.
    const memberASep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: sepTeamId, period_id: sepId });
    const memberBSep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự B", team_id: sepTeamId, period_id: sepId });
    for (let i = 0; i < 2; i++) {
      await request(app)
        .post("/api/support-records")
        .send({ member_id: memberASep.body.id, team_nhan_ho_tro_id: sepTeamNhanId, period_id: sepId });
    }
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/support-records")
        .send({ member_id: memberBSep.body.id, team_nhan_ho_tro_id: sepTeamNhanId, period_id: sepId });
    }

    const augList = await request(app).get(`/api/members?period_id=${augId}`);
    const aAug = augList.body.find((m: { id: number }) => m.id === memberAAug.body.id);
    expect(aAug.ho_tro).toBe("+1");

    const sepList = await request(app).get(`/api/members?period_id=${sepId}`);
    const aSep = sepList.body.find((m: { id: number }) => m.id === memberASep.body.id);
    const bSep = sepList.body.find((m: { id: number }) => m.id === memberBSep.body.id);
    expect(aSep.ho_tro).toBe("+2");
    expect(bSep.ho_tro).toBe("+3");
  });

  it("cột Đánh giá ở bảng Nhân sự lấy Ranking từ tab Đánh giá đúng theo từng tháng", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2052, 1);
    const teamId = await makeTeam(app, "Đánh giá summary team", periodId);

    const memberA = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự A", team_id: teamId, period_id: periodId });
    const memberB = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự B", team_id: teamId, period_id: periodId });

    await request(app)
      .post("/api/danh-gia-records/bulk")
      .send({
        period_id: periodId,
        team_id: teamId,
        entries: [{ member_id: memberA.body.id, so_thu_tu: 7 }],
      });

    const list = await request(app).get(`/api/members?period_id=${periodId}`);
    const a = list.body.find((m: { id: number }) => m.id === memberA.body.id);
    const b = list.body.find((m: { id: number }) => m.id === memberB.body.id);
    expect(a.danh_gia).toBe(7);
    expect(b.danh_gia).toBeFalsy();
  });
});
