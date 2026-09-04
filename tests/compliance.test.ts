import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

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

describe("Team & Nhân sự: Tuân thủ", () => {
  it("creates, lists (with member/team/period details), updates, and deletes a compliance record", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2043, 1);
    const teamId = await makeTeam(app, "Compliance test team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Tuân thủ", team_id: teamId, period_id: periodId });

    const created = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: member.body.id, period_id: periodId, vi_pham: 2, noi_dung: "Đi trễ" });
    expect(created.status).toBe(201);
    expect(created.body.vi_pham).toBe(2);

    const list = await request(app).get(`/api/compliance-records?period_id=${periodId}`);
    const found = list.body.find((c: { id: number }) => c.id === created.body.id);
    expect(found.member_name).toBe("Nhân sự Tuân thủ");
    expect(found.team_name).toBe("Compliance test team");
    expect(found.period_label).toBe("Tháng 1/2043");

    const updated = await request(app)
      .put(`/api/compliance-records/${created.body.id}`)
      .send({ vi_pham: 5, noi_dung: "Vi phạm nội quy" });
    expect(updated.status).toBe(200);
    expect(updated.body.vi_pham).toBe(5);
    expect(updated.body.noi_dung).toBe("Vi phạm nội quy");

    const del = await request(app).delete(`/api/compliance-records/${created.body.id}`);
    expect(del.status).toBe(204);
  });

  it("rejects a compliance record with an invalid member_id or period_id", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2043, 2);
    const teamId = await makeTeam(app, "Compliance invalid team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự X", team_id: teamId, period_id: periodId });

    const badMember = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: 999999, period_id: periodId, vi_pham: 1 });
    expect(badMember.status).toBe(400);

    const badPeriod = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: member.body.id, period_id: 999999, vi_pham: 1 });
    expect(badPeriod.status).toBe(400);
  });

  it("rejects a non-numeric vi_pham", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2043, 3);
    const teamId = await makeTeam(app, "Compliance number team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Y", team_id: teamId, period_id: periodId });

    const res = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: member.body.id, period_id: periodId, vi_pham: "abc" });
    expect(res.status).toBe(400);
  });

  it("cascades deletion when the parent period or member is deleted", async () => {
    const app = createApp();
    const periodId = await makePeriod(app, 2043, 4);
    const teamId = await makeTeam(app, "Compliance cascade team", periodId);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Z", team_id: teamId, period_id: periodId });
    const record = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: member.body.id, period_id: periodId, vi_pham: 1 });

    await request(app).delete(`/api/members/${member.body.id}`);

    const list = await request(app).get(`/api/compliance-records?period_id=${periodId}`);
    expect(list.body.some((c: { id: number }) => c.id === record.body.id)).toBe(false);
  });

  it("only lists records for the requested Tháng theo dõi, not other months", async () => {
    const app = createApp();
    const augId = await makePeriod(app, 2044, 8);
    const teamId = await makeTeam(app, "Compliance filter team", augId);
    const sepId = await makePeriod(app, 2044, 9);
    const member = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Lọc Tháng", team_id: teamId, period_id: augId });

    const record = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: member.body.id, period_id: augId, vi_pham: 1 });
    expect(record.status).toBe(201);

    const augList = await request(app).get(`/api/compliance-records?period_id=${augId}`);
    expect(augList.body.some((c: { id: number }) => c.id === record.body.id)).toBe(true);

    const sepList = await request(app).get(`/api/compliance-records?period_id=${sepId}`);
    expect(sepList.body.some((c: { id: number }) => c.id === record.body.id)).toBe(false);
  });

  it("sửa hoặc xóa 1 bản ghi Tuân thủ chỉ ảnh hưởng đúng tháng đó, không ảnh hưởng tháng khác", async () => {
    const app = createApp();
    const testYear = await nextAvailableYear(app, 2045);
    const augId = await makePeriod(app, testYear, 8);
    const teamAugId = await makeTeam(app, "Compliance edit-delete scope team", augId);
    const sepId = await makePeriod(app, testYear, 9);
    const teamSepId = (await request(app).get(`/api/teams?period_id=${sepId}`)).body.find(
      (t: { name: string }) => t.name === "Compliance edit-delete scope team",
    ).id;

    // Cùng 1 nhân sự (idempotent theo period_id+team_id+name) khai báo riêng ở
    // từng tháng — mô phỏng đúng tình huống người dùng: 2 bản ghi Tuân thủ
    // "giống nhau" nhưng thuộc 2 tháng khác nhau.
    const memberAug = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Sửa Xóa", team_id: teamAugId, period_id: augId });
    const memberSep = await request(app)
      .post("/api/members")
      .send({ name: "Nhân sự Sửa Xóa", team_id: teamSepId, period_id: sepId });

    const recordAug = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: memberAug.body.id, period_id: augId, vi_pham: 1, noi_dung: "Ban đầu" });
    const recordSep = await request(app)
      .post("/api/compliance-records")
      .send({ member_id: memberSep.body.id, period_id: sepId, vi_pham: 1, noi_dung: "Ban đầu" });

    // Sửa bản ghi tháng 9 — bản ghi tháng 8 phải giữ nguyên.
    const updated = await request(app)
      .put(`/api/compliance-records/${recordSep.body.id}`)
      .send({ vi_pham: 9, noi_dung: "Đã sửa ở tháng 9" });
    expect(updated.status).toBe(200);
    expect(updated.body.vi_pham).toBe(9);

    const augAfterEdit = await request(app).get(`/api/compliance-records?period_id=${augId}`);
    const augRecordAfterEdit = augAfterEdit.body.find((c: { id: number }) => c.id === recordAug.body.id);
    expect(augRecordAfterEdit.vi_pham).toBe(1);
    expect(augRecordAfterEdit.noi_dung).toBe("Ban đầu");

    // Xóa bản ghi tháng 9 — bản ghi tháng 8 phải còn nguyên.
    const del = await request(app).delete(`/api/compliance-records/${recordSep.body.id}`);
    expect(del.status).toBe(204);

    const augAfterDelete = await request(app).get(`/api/compliance-records?period_id=${augId}`);
    expect(augAfterDelete.body.some((c: { id: number }) => c.id === recordAug.body.id)).toBe(true);

    const sepAfterDelete = await request(app).get(`/api/compliance-records?period_id=${sepId}`);
    expect(sepAfterDelete.body.some((c: { id: number }) => c.id === recordSep.body.id)).toBe(false);
  });
});
