import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Cấu hình: Tiêu chí", () => {
  it("creates, lists, updates, and deletes a tieu chi config", async () => {
    const app = createApp();
    const created = await request(app)
      .post("/api/tieu-chi")
      .send({ nhom: "Khách hàng", ten_tieu_chi: "Sprint Goal", cach_tinh_diem: "%HT Sprint goal * Điểm chuẩn" });
    expect(created.status).toBe(201);
    expect(created.body.nhom).toBe("Khách hàng");
    expect(created.body.co_chi_tieu).toBe(false);

    const list = await request(app).get("/api/tieu-chi");
    const found = list.body.find((c: { id: number }) => c.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.diem_chuan).toEqual([]);

    const updated = await request(app)
      .put(`/api/tieu-chi/${created.body.id}`)
      .send({ ten_tieu_chi: "Sprint Goal (đã sửa)", co_chi_tieu: true });
    expect(updated.status).toBe(200);
    expect(updated.body.ten_tieu_chi).toBe("Sprint Goal (đã sửa)");
    expect(updated.body.co_chi_tieu).toBe(true);

    const del = await request(app).delete(`/api/tieu-chi/${created.body.id}`);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get("/api/tieu-chi");
    expect(listAfter.body.some((c: { id: number }) => c.id === created.body.id)).toBe(false);
  });

  it("mặc định kieu_tinh = 'khong_tinh' khi không cấu hình công thức", async () => {
    const app = createApp();
    const created = await request(app)
      .post("/api/tieu-chi")
      .send({ nhom: "Khách hàng", ten_tieu_chi: "Test không công thức" });
    expect(created.body.kieu_tinh).toBe("khong_tinh");
    expect(created.body.nguon_du_lieu).toBeNull();
    expect(created.body.he_so).toBeNull();
    await request(app).delete(`/api/tieu-chi/${created.body.id}`);
  });

  it("cấu hình công thức tính điểm (kieu_tinh/nguon_du_lieu/he_so) cho tiêu chí, sửa lại được", async () => {
    const app = createApp();
    const created = await request(app).post("/api/tieu-chi").send({
      nhom: "Khách hàng",
      ten_tieu_chi: "Test công thức",
      kieu_tinh: "tru_theo_loi",
      nguon_du_lieu: "so_luong_su_co",
      he_so: 0.15,
    });
    expect(created.body.kieu_tinh).toBe("tru_theo_loi");
    expect(created.body.nguon_du_lieu).toBe("so_luong_su_co");
    expect(created.body.he_so).toBe(0.15);

    const updated = await request(app)
      .put(`/api/tieu-chi/${created.body.id}`)
      .send({ kieu_tinh: "dem_dong_cong", nguon_du_lieu: "dem_ho_tro", he_so: 3 });
    expect(updated.body.kieu_tinh).toBe("dem_dong_cong");
    expect(updated.body.nguon_du_lieu).toBe("dem_ho_tro");
    expect(updated.body.he_so).toBe(3);

    // Xóa công thức (về "không tính") -> nguon_du_lieu/he_so cũng về null.
    const cleared = await request(app)
      .put(`/api/tieu-chi/${created.body.id}`)
      .send({ kieu_tinh: "khong_tinh", nguon_du_lieu: null, he_so: null });
    expect(cleared.body.kieu_tinh).toBe("khong_tinh");
    expect(cleared.body.nguon_du_lieu).toBeNull();
    expect(cleared.body.he_so).toBeNull();

    await request(app).delete(`/api/tieu-chi/${created.body.id}`);
  });

  it("sao chép tiêu chí giữ nguyên công thức tính điểm (kieu_tinh/nguon_du_lieu/he_so)", async () => {
    const app = createApp();
    const deptSrc = await request(app).post("/api/departments").send({ name: "TC Formula Src" });
    const deptDst = await request(app).post("/api/departments").send({ name: "TC Formula Dst" });

    const created = await request(app).post("/api/tieu-chi").send({
      nhom: "Vận hành",
      ten_tieu_chi: "TC Formula Clone",
      dung_chung: false,
      department_id: deptSrc.body.id,
      kieu_tinh: "dem_dong_tru",
      nguon_du_lieu: "dem_tuan_thu",
      he_so: 4,
    });

    await request(app)
      .post("/api/tieu-chi/clone")
      .send({ from_department_id: deptSrc.body.id, to_department_id: deptDst.body.id });

    const listDst = await request(app).get(`/api/tieu-chi?department_id=${deptDst.body.id}`);
    const cloned = listDst.body.find((c: { ten_tieu_chi: string }) => c.ten_tieu_chi === "TC Formula Clone");
    expect(cloned.kieu_tinh).toBe("dem_dong_tru");
    expect(cloned.nguon_du_lieu).toBe("dem_tuan_thu");
    expect(cloned.he_so).toBe(4);

    await request(app).delete(`/api/tieu-chi/${created.body.id}`);
    await request(app).delete(`/api/tieu-chi/${cloned.id}`);
  });

  it("upserts điểm chuẩn/chỉ tiêu theo team, không tạo trùng khi lưu lại", async () => {
    const app = createApp();
    const created = await request(app)
      .post("/api/tieu-chi")
      .send({ nhom: "Vận hành", ten_tieu_chi: "Test Tuân thủ" });
    const id = created.body.id;

    await request(app).put(`/api/tieu-chi/${id}/diem-chuan`).send({ team_name: "BSS", diem_chuan: "10" });
    await request(app)
      .put(`/api/tieu-chi/${id}/diem-chuan`)
      .send({ team_name: "BSS", diem_chuan: "20", chi_tieu: "98%" });

    const list = await request(app).get("/api/tieu-chi");
    const found = list.body.find((c: { id: number }) => c.id === id);
    expect(found.diem_chuan).toHaveLength(1);
    expect(found.diem_chuan[0]).toEqual({ team_name: "BSS", diem_chuan: "20", chi_tieu: "98%" });

    // tieu_chi_configs là cấu hình toàn cục (không theo period) — dọn dẹp để
    // không để lại dữ liệu test trong cấu hình thật.
    await request(app).delete(`/api/tieu-chi/${id}`);
  });

  it("deleting a tieu chi cascades its điểm chuẩn rows", async () => {
    const app = createApp();
    const created = await request(app).post("/api/tieu-chi").send({ nhom: "Vận hành", ten_tieu_chi: "Test X" });
    await request(app).put(`/api/tieu-chi/${created.body.id}/diem-chuan`).send({ team_name: "CRM", diem_chuan: "5" });

    await request(app).delete(`/api/tieu-chi/${created.body.id}`);

    const list = await request(app).get("/api/tieu-chi");
    expect(list.body.some((c: { id: number }) => c.id === created.body.id)).toBe(false);
  });

  it("cung cấp đủ điểm chuẩn từng tiêu chí để tính Tổng điểm (client tự cộng, không lưu tay)", async () => {
    const app = createApp();
    const c1 = await request(app).post("/api/tieu-chi").send({ nhom: "Khách hàng", ten_tieu_chi: "Test Sprint Goal" });
    const c2 = await request(app).post("/api/tieu-chi").send({ nhom: "Vận hành", ten_tieu_chi: "Test Tuân thủ" });

    await request(app).put(`/api/tieu-chi/${c1.body.id}/diem-chuan`).send({ team_name: "BSS", diem_chuan: "70" });
    await request(app).put(`/api/tieu-chi/${c2.body.id}/diem-chuan`).send({ team_name: "BSS", diem_chuan: "-1" });

    const list = await request(app).get("/api/tieu-chi");
    const bssDiemChuan = list.body
      .filter((c: { id: number }) => c.id === c1.body.id || c.id === c2.body.id)
      .flatMap((c: { diem_chuan: { team_name: string; diem_chuan: string }[] }) => c.diem_chuan)
      .filter((d: { team_name: string }) => d.team_name === "BSS")
      .reduce((sum: number, d: { diem_chuan: string }) => sum + Number(d.diem_chuan), 0);
    expect(bssDiemChuan).toBe(69);

    // tieu_chi_configs là cấu hình toàn cục (không theo period) — dọn dẹp để
    // không để lại dữ liệu test trong cấu hình thật.
    await request(app).delete(`/api/tieu-chi/${c1.body.id}`);
    await request(app).delete(`/api/tieu-chi/${c2.body.id}`);
  });

  it("rejects creating a tieu chi missing required fields", async () => {
    const app = createApp();
    const res = await request(app).post("/api/tieu-chi").send({ ten_tieu_chi: "X" });
    expect(res.status).toBe(400);
  });

  describe("Tiêu chí theo phòng ban (dùng chung / riêng từng phòng)", () => {
    async function makeDept(app: ReturnType<typeof createApp>, name: string) {
      const res = await request(app).post("/api/departments").send({ name });
      return res.body.id as number;
    }

    it("mặc định (không gửi department_id) -> tiêu chí dùng chung, mọi phòng đều thấy", async () => {
      const app = createApp();
      const deptA = await makeDept(app, "TC Phòng A");
      const deptB = await makeDept(app, "TC Phòng B");

      const created = await request(app)
        .post("/api/tieu-chi")
        .send({ nhom: "Khách hàng", ten_tieu_chi: "TC Dùng chung mặc định" });
      expect(created.body.department_id).toBeNull();

      const listA = await request(app).get(`/api/tieu-chi?department_id=${deptA}`);
      const listB = await request(app).get(`/api/tieu-chi?department_id=${deptB}`);
      expect(listA.body.some((c: { id: number }) => c.id === created.body.id)).toBe(true);
      expect(listB.body.some((c: { id: number }) => c.id === created.body.id)).toBe(true);

      await request(app).delete(`/api/tieu-chi/${created.body.id}`);
    });

    it("tiêu chí riêng (dung_chung=false) của phòng A -> phòng B không thấy", async () => {
      const app = createApp();
      const deptA = await makeDept(app, "TC Phòng A2");
      const deptB = await makeDept(app, "TC Phòng B2");

      const created = await request(app)
        .post("/api/tieu-chi")
        .send({
          nhom: "Vận hành",
          ten_tieu_chi: "TC Riêng phòng A",
          dung_chung: false,
          department_id: deptA,
        });
      expect(created.body.department_id).toBe(deptA);

      const listA = await request(app).get(`/api/tieu-chi?department_id=${deptA}`);
      const listB = await request(app).get(`/api/tieu-chi?department_id=${deptB}`);
      expect(listA.body.some((c: { id: number }) => c.id === created.body.id)).toBe(true);
      expect(listB.body.some((c: { id: number }) => c.id === created.body.id)).toBe(false);

      await request(app).delete(`/api/tieu-chi/${created.body.id}`);
    });

    it("phòng tắt dung_tieu_chi_chung -> chỉ thấy tiêu chí riêng, không còn thấy tiêu chí dùng chung", async () => {
      const app = createApp();
      const deptC = await makeDept(app, "TC Phòng C khác hẳn");

      const shared = await request(app)
        .post("/api/tieu-chi")
        .send({ nhom: "Khách hàng", ten_tieu_chi: "TC Dùng chung 2" });
      const own = await request(app)
        .post("/api/tieu-chi")
        .send({ nhom: "Khách hàng", ten_tieu_chi: "TC Riêng của C", dung_chung: false, department_id: deptC });

      const beforeToggle = await request(app).get(`/api/tieu-chi?department_id=${deptC}`);
      expect(beforeToggle.body.some((c: { id: number }) => c.id === shared.body.id)).toBe(true);
      expect(beforeToggle.body.some((c: { id: number }) => c.id === own.body.id)).toBe(true);

      const toggled = await request(app).put(`/api/departments/${deptC}`).send({ dung_tieu_chi_chung: false });
      expect(toggled.body.dung_tieu_chi_chung).toBe(false);

      const afterToggle = await request(app).get(`/api/tieu-chi?department_id=${deptC}`);
      expect(afterToggle.body.some((c: { id: number }) => c.id === shared.body.id)).toBe(false);
      expect(afterToggle.body.some((c: { id: number }) => c.id === own.body.id)).toBe(true);

      await request(app).delete(`/api/tieu-chi/${shared.body.id}`);
      await request(app).delete(`/api/tieu-chi/${own.body.id}`);
    });

    it("sao chép tiêu chí từ phòng khác -> tạo bản riêng mới của phòng đích, bỏ qua trùng nhóm+tên", async () => {
      const app = createApp();
      const deptSrc = await makeDept(app, "TC Phòng nguồn");
      const deptDst = await makeDept(app, "TC Phòng đích");

      const c1 = await request(app)
        .post("/api/tieu-chi")
        .send({ nhom: "Vận hành", ten_tieu_chi: "TC Clone 1", dung_chung: false, department_id: deptSrc });
      const c2 = await request(app)
        .post("/api/tieu-chi")
        .send({ nhom: "Vận hành", ten_tieu_chi: "TC Clone 2", dung_chung: false, department_id: deptSrc });

      const clone1 = await request(app)
        .post("/api/tieu-chi/clone")
        .send({ from_department_id: deptSrc, to_department_id: deptDst });
      expect(clone1.status).toBe(201);
      expect(clone1.body.cloned).toBe(2);

      const listDst = await request(app).get(`/api/tieu-chi?department_id=${deptDst}`);
      const namesDst = listDst.body.map((c: { ten_tieu_chi: string }) => c.ten_tieu_chi);
      expect(namesDst).toEqual(expect.arrayContaining(["TC Clone 1", "TC Clone 2"]));
      // Bản sao là RIÊNG của phòng đích, không phải dùng chung.
      listDst.body
        .filter((c: { ten_tieu_chi: string }) => c.ten_tieu_chi.startsWith("TC Clone"))
        .forEach((c: { department_id: number }) => expect(c.department_id).toBe(deptDst));

      // Sao chép lại lần 2 -> không tạo trùng (đã có sẵn ở phòng đích).
      const clone2 = await request(app)
        .post("/api/tieu-chi/clone")
        .send({ from_department_id: deptSrc, to_department_id: deptDst });
      expect(clone2.body.cloned).toBe(0);

      const listDstAfter = await request(app).get(`/api/tieu-chi?department_id=${deptDst}`);
      const cloneCount = listDstAfter.body.filter((c: { ten_tieu_chi: string }) => c.ten_tieu_chi.startsWith("TC Clone")).length;
      expect(cloneCount).toBe(2); // vẫn đúng 2, không nhân đôi

      const idsToDelete = [
        c1.body.id,
        c2.body.id,
        ...listDstAfter.body.filter((c: { ten_tieu_chi: string }) => c.ten_tieu_chi.startsWith("TC Clone") && c.department_id === deptDst).map((c: { id: number }) => c.id),
      ];
      for (const id of idsToDelete) {
        await request(app).delete(`/api/tieu-chi/${id}`);
      }
    });

    it("rejects clone khi thiếu tham số hoặc phòng nguồn = phòng đích", async () => {
      const app = createApp();
      const dept = await makeDept(app, "TC Phòng tự sao chép");
      expect((await request(app).post("/api/tieu-chi/clone").send({})).status).toBe(400);
      expect(
        (await request(app).post("/api/tieu-chi/clone").send({ from_department_id: dept, to_department_id: dept }))
          .status,
      ).toBe(400);
    });
  });
});
