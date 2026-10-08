import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createDepartment } from "../src/services/department.service.js";
import { createPeriod } from "../src/services/period.service.js";
import { createTeam } from "../src/services/team.service.js";
import { createMember, updateMember } from "../src/services/member.service.js";
import {
  deleteAttendanceRecord,
  listAttendanceRecords,
  replaceAttendanceRecords,
  setAttendanceExcluded,
} from "../src/services/attendance.service.js";
import { createFeatureRequest, getFeatureRequest } from "../src/services/featureRequest.service.js";
import { updateFeatureRequestHandler } from "../src/controllers/featureRequest.controller.js";
import { ScopeForbiddenError, type DataScope } from "../src/services/scope.util.js";

// Vòng 2 sau báo cáo pentest Viettel IDC ("nhiều chức năng tương tự" BUG-223/
// BUG-224): Chấm công không phân quyền phòng ban, sửa Yêu cầu tính năng cho đổi
// phòng đề xuất/đích, chuyển nhân sự sang team phòng khác, danh mục không validate.

const ALL: DataScope = { all: true, departmentId: null };
let counter = 0;
const uniq = (p: string) => `${p} ${Date.now()}-${++counter}`;

async function twoDepts() {
  const a = await createDepartment({ name: uniq("SG A") });
  const b = await createDepartment({ name: uniq("SG B") });
  return { a, b, scopeA: { all: false, departmentId: a.id } as DataScope, scopeB: { all: false, departmentId: b.id } as DataScope };
}

describe("Chấm công — phân quyền theo phòng ban", () => {
  it("import của phòng A không xóa dữ liệu phòng B cùng tháng; mỗi phòng chỉ thấy dữ liệu của mình", async () => {
    const { a, b, scopeA, scopeB } = await twoDepts();
    const period = await createPeriod({ year: 2078, month: (counter % 12) + 1 });
    await replaceAttendanceRecords(period.id, [{ Name: "NV-B" }], b.id, scopeB);
    await replaceAttendanceRecords(period.id, [{ Name: "NV-A" }], a.id, scopeA);

    const listA = await listAttendanceRecords(period.id, a.id);
    const listB = await listAttendanceRecords(period.id, b.id);
    expect(listA.rows.map((r) => r.row_data.Name)).toEqual(["NV-A"]);
    expect(listB.rows.map((r) => r.row_data.Name)).toEqual(["NV-B"]);
  });

  it("phòng A không import được thay mặt phòng B (403)", async () => {
    const { b, scopeA } = await twoDepts();
    const period = await createPeriod({ year: 2078, month: (counter % 12) + 1 });
    await expect(replaceAttendanceRecords(period.id, [{ Name: "x" }], b.id, scopeA)).rejects.toBeInstanceOf(
      ScopeForbiddenError,
    );
  });

  it("xóa / đánh dấu 'không tính công' dòng của phòng khác bị bỏ qua", async () => {
    const { b, scopeA, scopeB } = await twoDepts();
    const period = await createPeriod({ year: 2078, month: (counter % 12) + 1 });
    const [row] = await replaceAttendanceRecords(period.id, [{ Name: "NV-B" }], b.id, scopeB);

    expect(await setAttendanceExcluded([row.id], true, scopeA)).toBe(0);
    expect(await deleteAttendanceRecord(row.id, scopeA)).toBe(false);
    const still = await listAttendanceRecords(period.id, b.id);
    expect(still.rows).toHaveLength(1);
    expect(still.rows[0].excluded_from_late).toBe(false);

    expect(await deleteAttendanceRecord(row.id, scopeB)).toBe(true);
  });
});

describe("Nhân sự — chuyển sang team phòng khác", () => {
  it("updateMember với team_id thuộc phòng ngoài phạm vi -> 403, không đổi dữ liệu", async () => {
    const { a, b, scopeA } = await twoDepts();
    const period = await createPeriod({ year: 2078, month: (counter % 12) + 1 });
    const teamA = await createTeam(uniq("T-A"), period.id, a.id, ALL);
    const teamB = await createTeam(uniq("T-B"), period.id, b.id, ALL);
    const m = await createMember({ name: uniq("NS"), team_id: teamA.id, period_id: period.id }, scopeA);

    await expect(updateMember(m.id, { team_id: teamB.id }, scopeA)).rejects.toBeInstanceOf(ScopeForbiddenError);
  });

  it("chuyển team trong cùng phòng vẫn được", async () => {
    const { a, scopeA } = await twoDepts();
    const period = await createPeriod({ year: 2078, month: (counter % 12) + 1 });
    const t1 = await createTeam(uniq("T1"), period.id, a.id, ALL);
    const t2 = await createTeam(uniq("T2"), period.id, a.id, ALL);
    const m = await createMember({ name: uniq("NS"), team_id: t1.id, period_id: period.id }, scopeA);
    const updated = await updateMember(m.id, { team_id: t2.id }, scopeA);
    expect(updated?.team_id).toBe(t2.id);
  });
});

describe("Yêu cầu tính năng — PUT không đổi được phòng đề xuất/đích với tài khoản giới hạn", () => {
  async function callUpdate(id: number, body: Record<string, unknown>, scope: DataScope) {
    let status = 200;
    let payload: unknown;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(p: unknown) {
        payload = p;
        return this;
      },
    };
    await updateFeatureRequestHandler({ params: { id: String(id) }, body, dataScope: scope } as any, res as any);
    return { status, payload: payload as any };
  }

  it("scope giới hạn: department_id / target_department_id trong body bị bỏ qua", async () => {
    const { a, b, scopeA } = await twoDepts();
    const fr = await createFeatureRequest({
      he_thong: "Website",
      tieu_de: uniq("FR"),
      department_id: a.id,
      target_department_id: b.id,
    } as any);

    const { status } = await callUpdate(
      fr.id,
      { mo_ta: "sửa mô tả", department_id: b.id, target_department_id: a.id },
      scopeA,
    );
    expect(status).toBe(200);
    const after = await getFeatureRequest(fr.id);
    expect(after?.mo_ta).toBe("sửa mô tả");
    expect(after?.department_id).toBe(a.id);
    expect(after?.target_department_id).toBe(b.id);
  });

  it("scope.all (admin) vẫn đổi được phòng", async () => {
    const { a, b } = await twoDepts();
    const fr = await createFeatureRequest({
      he_thong: "Website",
      tieu_de: uniq("FR"),
      department_id: a.id,
      target_department_id: b.id,
    } as any);
    const { status } = await callUpdate(fr.id, { target_department_id: a.id }, ALL);
    expect(status).toBe(200);
    expect((await getFeatureRequest(fr.id))?.target_department_id).toBe(a.id);
  });
});

describe("Validate kiểu/danh mục (Mass Assignment vòng 2)", () => {
  it("Yêu cầu tính năng: do_uu_tien ngoài danh sách, loai_yeu_cau ngoài danh mục, text không phải chuỗi -> 400", async () => {
    const app = createApp();
    const depts = await request(app).get("/api/departments");
    const target = depts.body[0].id;
    const base = { he_thong: "Website", target_department_id: target };

    const badPriority = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: uniq("P"), do_uu_tien: "IDC_TEST" });
    expect(badPriority.status).toBe(400);
    expect(badPriority.body.error).toMatch(/do_uu_tien/);

    const badLoai = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: uniq("L"), loai_yeu_cau: "IDC_TEST" });
    expect(badLoai.status).toBe(400);
    expect(badLoai.body.error).toMatch(/Loại yêu cầu/);

    const badType = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: uniq("T"), mo_ta: { a: 1 } });
    expect(badType.status).toBe(400);

    const ok = await request(app).post("/api/feature-requests").send({ ...base, tieu_de: uniq("OK"), do_uu_tien: "Cao" });
    expect(ok.status).toBe(201);
  });

  it("Roadmap: phan_loai ngoài danh mục / trang_thai lạ -> 400", async () => {
    const app = createApp();
    const bad = await request(app)
      .post("/api/roadmap-items")
      .send({ year: 2079, team: "BSS", nhiem_vu: "x", phan_loai: "IDC_TEST" });
    expect(bad.status).toBe(400);
    const badStatus = await request(app)
      .post("/api/roadmap-items")
      .send({ year: 2079, team: "BSS", nhiem_vu: "x", trang_thai: "IDC_TEST" });
    expect(badStatus.status).toBe(400);
    const ok = await request(app).post("/api/roadmap-items").send({ year: 2079, team: "BSS", nhiem_vu: "x" });
    expect(ok.status).toBe(201);
  });
});
