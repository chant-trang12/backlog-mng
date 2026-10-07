import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// ATTT Mass Assignment —PUT /api/tasks/:id chấp nhận giá trị tinh_chat
// "IDC_TEST" (ngoài danh mục Phân loại) và các tham số lạ trong body.
// Fix: whitelist trường (pickFields) + validate danh mục/enum ở controller.

async function seedPhanLoai(app: ReturnType<typeof createApp>, tenPhanLoai: string) {
  const list = await request(app).get("/api/phan-loai");
  if (!list.body.some((p: { ten_phan_loai: string }) => p.ten_phan_loai === tenPhanLoai)) {
    await request(app).post("/api/phan-loai").send({ ten_phan_loai: tenPhanLoai });
  }
}

async function seedTag(app: ReturnType<typeof createApp>, tenTag: string) {
  const list = await request(app).get("/api/tags");
  if (!list.body.some((t: { ten_tag: string }) => t.ten_tag === tenTag)) {
    await request(app).post("/api/tags").send({ ten_tag: tenTag });
  }
}

async function makeTask(app: ReturnType<typeof createApp>, nhiemVu: string, extra: Record<string, unknown> = {}) {
  const period = await request(app).post("/api/periods").send({ year: 2016, month: 5 });
  const team = await request(app).post("/api/teams").send({ name: "MA team", period_id: period.body.id });
  const res = await request(app)
    .post(`/api/periods/${period.body.id}/tasks`)
    .send({ team: team.body.name, nhiem_vu: nhiemVu, ...extra });
  expect(res.status).toBe(201);
  return res.body;
}

describe("ATTT: Mass Assignment — whitelist trường + validate danh mục/enum", () => {
  it("Bước tái hiện pentest: PUT /api/tasks/:id với tinh_chat 'IDC_TEST' ngoài danh mục -> 400, giữ nguyên giá trị cũ", async () => {
    const app = createApp();
    await seedPhanLoai(app, "NVKH");
    const task = await makeTask(app, "Rà soát quy trình xyz", { tinh_chat: "NVKH" });

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ team: "BSS", tinh_chat: "IDC_TEST", tag: "Đầu tư", nhiem_vu: "Rà soát quy trình xyz" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/danh mục Phân loại/);

    const after = await request(app).get(`/api/periods/${task.period_id}/tasks`);
    const row = after.body.find((t: { id: number }) => t.id === task.id);
    expect(row.tinh_chat).toBe("NVKH");
  });

  it("tinh_chat hợp lệ (danh mục + tag hệ thống 'Nhiệm vụ tồn') -> 200", async () => {
    const app = createApp();
    await seedPhanLoai(app, "NVPS");
    const task = await makeTask(app, "Task tinh chat hop le");

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ tinh_chat: "NVPS, Nhiệm vụ tồn" });
    expect(res.status).toBe(200);
    expect(res.body.tinh_chat).toBe("NVPS, Nhiệm vụ tồn");
  });

  it("Tham số lạ trong body bị bỏ qua hoàn toàn (id, stt, period_id, cpo_danh_gia, cpo_comment...)", async () => {
    const app = createApp();
    const task = await makeTask(app, "Task tham so la", { tinh_chat: null });

    const res = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({
        nhiem_vu: "Task tham so la (da sua)",
        id: 999999,
        stt: 99,
        period_id: 1,
        department_id: 424242,
        cpo_danh_gia: 5,
        cpo_comment: "ghi đè qua route thường",
        cpo_graded_by: "attacker",
        cpo_graded_at: "2000-01-01 00:00:00",
        khong_tinh_diem: "Không tính điểm",
        thay_the_task_id: 123,
        creator_name: "attacker",
        creator_date: "2000-01-01",
        approver_name: "attacker",
        approver_date: "2000-01-01",
      });
    expect(res.status).toBe(200);
    expect(res.body.nhiem_vu).toBe("Task tham so la (da sua)");
    expect(res.body.id).toBe(task.id);
    expect(res.body.stt).toBe(task.stt);
    expect(res.body.period_id).toBe(task.period_id);
    expect(res.body.department_id).toBe(task.department_id);
    expect(res.body.cpo_danh_gia).toBeNull();
    expect(res.body.cpo_comment).toBeNull();
    expect(res.body.cpo_graded_by).toBeNull();
    expect(res.body.cpo_graded_at).toBeNull();
    expect(res.body.khong_tinh_diem).toBeNull();
    expect(res.body.thay_the_task_id).toBeNull();
  });

  it("Trường chấm điểm chỉ đổi được qua route riêng /grade (admin/BGĐ), không qua PUT thường", async () => {
    const app = createApp();
    const task = await makeTask(app, "Task cham diem rieng");

    await request(app).put(`/api/tasks/${task.id}`).send({ cpo_danh_gia: 1, cpo_comment: "spoof" });
    const viaNormal = await request(app).get(`/api/tasks/${task.id}`);
    expect(viaNormal.body.cpo_danh_gia ?? null).toBeNull();
    expect(viaNormal.body.cpo_comment ?? null).toBeNull();

    const graded = await request(app)
      .put(`/api/tasks/${task.id}/grade`)
      .send({ cpo_danh_gia: 85, cpo_comment: "Tốt" });
    expect(graded.status).toBe(200);
    expect(graded.body.cpo_danh_gia).toBe(85);
    expect(graded.body.cpo_comment).toBe("Tốt");
  });

  it("tag ngoài danh mục Tag -> 400; tag có trong danh mục -> 200", async () => {
    const app = createApp();
    const task = await makeTask(app, "Task tag");

    const bad = await request(app).put(`/api/tasks/${task.id}`).send({ tag: "Tag Không Tồn Tại" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/danh mục Tag/);

    await seedTag(app, "Đầu tư");
    const ok = await request(app).put(`/api/tasks/${task.id}`).send({ tag: "Đầu tư" });
    expect(ok.status).toBe(200);
    expect(ok.body.tag).toBe("Đầu tư");
  });

  it("trang_thai ngoài enum -> 400; các trạng thái hợp lệ -> 200", async () => {
    const app = createApp();
    const task = await makeTask(app, "Task trang thai");

    const bad = await request(app).put(`/api/tasks/${task.id}`).send({ trang_thai: "IDC_TEST" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/trang_thai/);

    const ok = await request(app).put(`/api/tasks/${task.id}`).send({ trang_thai: "Đang thực hiện" });
    expect(ok.status).toBe(200);
    expect(ok.body.trang_thai).toBe("Đang thực hiện");
  });

  it("Task item (Việc con): trang_thai ngoài enum -> 400", async () => {
    const app = createApp();
    const task = await makeTask(app, "Task cho viec con");

    const created = await request(app)
      .post(`/api/tasks/${task.id}/items`)
      .send({ ten_viec: "Việc 1" });
    expect(created.status).toBe(201);

    const bad = await request(app)
      .put(`/api/task-items/${created.body.id}`)
      .send({ trang_thai: "IDC_TEST" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/trang_thai/);

    const ok = await request(app)
      .put(`/api/task-items/${created.body.id}`)
      .send({ trang_thai: "Hoàn thành" });
    expect(ok.status).toBe(200);
    expect(ok.body.trang_thai).toBe("Hoàn thành");
  });

  it("Feature request: tạo mới với tham số lạ -> trạng thái luôn 'Chờ duyệt', trường lạ bị bỏ qua", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "MA Phòng FR" });

    const created = await request(app)
      .post("/api/feature-requests")
      .send({
        he_thong: "Hệ thống MA",
        tieu_de: "FR mass assignment",
        target_department_id: dept.body.id,
        trang_thai: "Đã duyệt",
        linked_task_id: 123,
        id: 99999,
        approved_by: "attacker",
      });
    expect(created.status).toBe(201);
    expect(created.body.trang_thai).toBe("Chờ duyệt");
    expect(created.body.linked_task_id).toBeNull();
  });

  it("Feature request: PUT thường KHÔNG đổi được trang_thai (chỉ qua approve/reject/...), vẫn sửa được field form", async () => {
    const app = createApp();
    const dept = await request(app).post("/api/departments").send({ name: "MA Phòng FR 2" });
    const fr = await request(app)
      .post("/api/feature-requests")
      .send({ he_thong: "Hệ thống MA", tieu_de: "FR update", target_department_id: dept.body.id });
    expect(fr.status).toBe(201);

    const updated = await request(app)
      .put(`/api/feature-requests/${fr.body.id}`)
      .send({ tieu_de: "FR update (đã sửa)", trang_thai: "Đã duyệt" });
    expect(updated.status).toBe(200);
    expect(updated.body.tieu_de).toBe("FR update (đã sửa)");
    expect(updated.body.trang_thai).toBe("Chờ duyệt");

    // Đường nghiệp vụ hợp lệ vẫn đổi được trạng thái.
    const approved = await request(app).post(`/api/feature-requests/${fr.body.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.trang_thai ?? approved.body).toMatch(/Đã duyệt|trang_thai/);
  });
});
