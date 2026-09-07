import { describe, expect, it } from "vitest";
import { db, initDatabase } from "../src/db/database.js";

describe("Database layer (Knex)", () => {
  it("initializes and verifies schema tables exist", async () => {
    await initDatabase();
    const hasPeriods = await db.schema.hasTable("periods");
    const hasTasks = await db.schema.hasTable("tasks");
    const hasTeams = await db.schema.hasTable("teams");
    const hasMembers = await db.schema.hasTable("members");
    const hasTieuChi = await db.schema.hasTable("tieu_chi_configs");

    expect(hasPeriods).toBe(true);
    expect(hasTasks).toBe(true);
    expect(hasTeams).toBe(true);
    expect(hasMembers).toBe(true);
    expect(hasTieuChi).toBe(true);
  });
});
