import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("Cấu hình: Ranking team", () => {
  it("adds rows and columns, sets cell values, and lists the full grid", async () => {
    const app = createApp();

    const row1 = await request(app).post("/api/ranking-config/rows");
    expect(row1.status).toBe(201);
    const viTri1 = row1.body.vi_tri;
    const row2 = await request(app).post("/api/ranking-config/rows");
    expect(row2.body.vi_tri).toBe(viTri1 + 1);

    const col1 = await request(app).post("/api/ranking-config/columns").send({ ten_cot: "Test Rank Col A" });
    expect(col1.status).toBe(201);
    const col2 = await request(app).post("/api/ranking-config/columns").send({ ten_cot: "Test Rank Col B" });

    await request(app)
      .put("/api/ranking-config/cells")
      .send({ vi_tri: viTri1, column_id: col1.body.id, gia_tri: "A" });
    await request(app)
      .put("/api/ranking-config/cells")
      .send({ vi_tri: viTri1, column_id: col2.body.id, gia_tri: "B" });

    const config = await request(app).get("/api/ranking-config");
    expect(config.body.rows).toEqual(expect.arrayContaining([viTri1, row2.body.vi_tri]));
    expect(config.body.columns.map((c: { id: number }) => c.id)).toEqual(
      expect.arrayContaining([col1.body.id, col2.body.id]),
    );
    const cellA = config.body.cells.find(
      (c: { vi_tri: number; column_id: number }) => c.vi_tri === viTri1 && c.column_id === col1.body.id,
    );
    expect(cellA.gia_tri).toBe("A");

    // ranking_columns/rows là bảng cấu hình toàn cục (không theo period) —
    // dọn dẹp để không để lại dữ liệu test trong cấu hình thật.
    await request(app).delete(`/api/ranking-config/rows/${viTri1}`);
    await request(app).delete(`/api/ranking-config/rows/${row2.body.vi_tri}`);
    await request(app).delete(`/api/ranking-config/columns/${col1.body.id}`);
    await request(app).delete(`/api/ranking-config/columns/${col2.body.id}`);
  });

  it("renames a column", async () => {
    const app = createApp();
    const col = await request(app).post("/api/ranking-config/columns").send({ ten_cot: "Test Cột mới" });
    const renamed = await request(app)
      .put(`/api/ranking-config/columns/${col.body.id}`)
      .send({ ten_cot: "Test Cột đã đổi tên" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.ten_cot).toBe("Test Cột đã đổi tên");

    await request(app).delete(`/api/ranking-config/columns/${col.body.id}`);
  });

  it("deleting a row or column cascades its cells", async () => {
    const app = createApp();
    const row = await request(app).post("/api/ranking-config/rows");
    const col = await request(app).post("/api/ranking-config/columns").send({ ten_cot: "Temp" });
    await request(app)
      .put("/api/ranking-config/cells")
      .send({ vi_tri: row.body.vi_tri, column_id: col.body.id, gia_tri: "C" });

    const delRow = await request(app).delete(`/api/ranking-config/rows/${row.body.vi_tri}`);
    expect(delRow.status).toBe(204);

    const config = await request(app).get("/api/ranking-config");
    expect(config.body.rows).not.toContain(row.body.vi_tri);
    expect(config.body.cells.some((c: { vi_tri: number }) => c.vi_tri === row.body.vi_tri)).toBe(false);

    const delCol = await request(app).delete(`/api/ranking-config/columns/${col.body.id}`);
    expect(delCol.status).toBe(204);
  });

  it("rejects invalid row/column operations", async () => {
    const app = createApp();
    const badColumn = await request(app).post("/api/ranking-config/columns").send({});
    expect(badColumn.status).toBe(400);

    const badRowDelete = await request(app).delete("/api/ranking-config/rows/999999");
    expect(badRowDelete.status).toBe(404);
  });
});
