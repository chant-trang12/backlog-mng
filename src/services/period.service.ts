import { db } from "../db/database.js";
import { cloneMembersFromPeriod } from "./member.service.js";
import { cloneTeamsFromPeriod } from "./team.service.js";
import type { CreatePeriodInput, Period } from "../types/backlog.js";

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function defaultLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]}/${year}`;
}

// 1.2 Tạo mới một backlog theo tháng — mỗi (năm, tháng) chỉ có một period, tạo
// lại nếu đã tồn tại thì trả về period cũ (idempotent) để tránh trùng lặp khi
// người dùng bấm "Tạo tháng mới" nhiều lần cho cùng một tháng.
export async function createPeriod(input: CreatePeriodInput): Promise<Period> {
  const existing = await getPeriodByYearMonth(input.year, input.month);
  if (existing) return existing;

  const label = input.label?.trim() || defaultLabel(input.year, input.month);
  const [created] = await db("periods")
    .insert({ year: input.year, month: input.month, label })
    .returning("*");

  // Tháng mới kế thừa danh sách team + nhân sự từ tháng gần nhất đã có (nếu
  // có), để không phải khai báo lại từ đầu — nhưng từ đây là các danh sách
  // độc lập. Phải nhân bản team TRƯỚC nhân sự vì nhân sự cần map team_id
  // đúng theo team (mới) của tháng vừa tạo.
  const latestOther = await db("periods")
    .where("id", "!=", created.id)
    .orderBy("year", "desc")
    .orderBy("month", "desc")
    .select("id")
    .first();

  if (latestOther) {
    await cloneTeamsFromPeriod(latestOther.id, created.id);
    await cloneMembersFromPeriod(latestOther.id, created.id);
  }

  return created as Period;
}

export async function getPeriodByYearMonth(year: number, month: number): Promise<Period | undefined> {
  const row = await db("periods").where({ year, month }).first();
  return row as Period | undefined;
}

export async function getPeriod(id: number): Promise<Period | undefined> {
  const row = await db("periods").where({ id }).first();
  return row as Period | undefined;
}

export async function listPeriods(): Promise<Period[]> {
  const rows = await db("periods").orderBy("year", "desc").orderBy("month", "desc");
  return rows as Period[];
}

export async function deletePeriod(id: number): Promise<boolean> {
  return await db.transaction(async (trx) => {
    await trx("tasks").where({ period_id: id }).delete();
    await trx("attendance_records").where({ period_id: id }).delete();
    await trx("compliance_records").where({ period_id: id }).delete();
    await trx("training_records").where({ period_id: id }).delete();
    await trx("support_records").where({ period_id: id }).delete();
    await trx("danh_gia_records").where({ period_id: id }).delete();
    await trx("noiquy_overrides").where({ period_id: id }).delete();
    await trx("incidents").where({ period_id: id }).delete();
    await trx("tickets").where({ period_id: id }).delete();
    await trx("creation_rates").where({ period_id: id }).delete();
    await trx("members").where({ period_id: id }).delete();
    await trx("teams").where({ period_id: id }).delete();
    const count = await trx("periods").where({ id }).delete();
    return count > 0;
  });
}
