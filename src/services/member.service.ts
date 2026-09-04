import { db } from "../db/database.js";
import type { CreateMemberInput, Member, MemberWithTeam, UpdateMemberInput } from "../types/backlog.js";

// Khai báo nhân sự — dùng để chọn NVTT (người phụ trách) khi nhập/cập nhật
// task thay vì gõ tự do. Idempotent theo (period_id, team_id, name) — mỗi
// tháng backlog có danh sách nhân sự riêng, xóa/sửa ở tháng nào chỉ ảnh
// hưởng tháng đó.
export async function createMember(input: CreateMemberInput): Promise<Member> {
  const name = input.name.trim();
  const existing = await db("members")
    .where({ period_id: input.period_id, team_id: input.team_id, name })
    .first();
  if (existing) return existing as Member;

  const [created] = await db("members")
    .insert({
      period_id: input.period_id,
      team_id: input.team_id,
      name,
      chuc_vu: input.chuc_vu?.trim() || null,
      tuan_thu: input.tuan_thu?.trim() || null,
      noi_quy: input.noi_quy?.trim() || null,
      dao_tao: input.dao_tao?.trim() || null,
      ho_tro: input.ho_tro?.trim() || null,
      danh_gia: input.danh_gia?.trim() || null,
    })
    .returning("*");

  return created as Member;
}

export async function getMember(id: number): Promise<Member | undefined> {
  const row = await db("members").where({ id }).first();
  return row as Member | undefined;
}

// Danh sách nhân sự của 1 tháng backlog (mọi team), kèm tên team — hiển thị
// dạng bảng STT / Họ và Tên / Chức vụ / Team / Tuân thủ / Nội quy / Đào tạo /
// Hỗ trợ / Đánh giá. Cột "Tuân thủ", "Đào tạo", "Hỗ trợ", "Đánh giá" không
// phải nhập tay — "Tuân thủ" tính từ tổng số Vi phạm (compliance_records),
// "Đào tạo" và "Hỗ trợ" tính từ số lượng bản ghi tương ứng (training_records
// / support_records), "Đánh giá" lấy Ranking (so_thu_tu) từ danh_gia_records
// — tất cả map theo member_id của nhân sự đó trong đúng tháng đang xem.
export async function listMembers(periodId: number): Promise<MemberWithTeam[]> {
  const crSub = db("compliance_records")
    .select("member_id")
    .sum({ total_vi_pham: "vi_pham" })
    .where("period_id", periodId)
    .groupBy("member_id")
    .as("cr");

  const trSub = db("training_records")
    .select("member_id")
    .count({ total_count: "*" })
    .where("period_id", periodId)
    .groupBy("member_id")
    .as("tr");

  const srSub = db("support_records")
    .select("member_id")
    .count({ total_count: "*" })
    .where("period_id", periodId)
    .groupBy("member_id")
    .as("sr");

  const dgSub = db("danh_gia_records")
    .select("member_id", "so_thu_tu")
    .where("period_id", periodId)
    .as("dg");

  const rows = await db("members")
    .join("teams", "teams.id", "members.team_id")
    .leftJoin(crSub, "cr.member_id", "members.id")
    .leftJoin(trSub, "tr.member_id", "members.id")
    .leftJoin(srSub, "sr.member_id", "members.id")
    .leftJoin(dgSub, "dg.member_id", "members.id")
    .where("members.period_id", periodId)
    .select(
      "members.id",
      "members.period_id",
      "members.team_id",
      "members.name",
      "members.chuc_vu",
      "members.noi_quy",
      "members.created_at",
      "teams.name as team_name",
      "cr.total_vi_pham",
      "tr.total_count as tr_count",
      "sr.total_count as sr_count",
      "dg.so_thu_tu as danh_gia",
    )
    .orderBy("teams.name", "asc")
    .orderBy("members.name", "asc");

  return rows.map((r: any) => ({
    id: r.id,
    period_id: r.period_id,
    team_id: r.team_id,
    name: r.name,
    chuc_vu: r.chuc_vu,
    team_name: r.team_name,
    tuan_thu: r.total_vi_pham != null ? `-${r.total_vi_pham}` : null,
    noi_quy: r.noi_quy,
    dao_tao: r.tr_count != null && Number(r.tr_count) > 0 ? `+${r.tr_count}` : null,
    ho_tro: r.sr_count != null && Number(r.sr_count) > 0 ? `+${r.sr_count}` : null,
    danh_gia: r.danh_gia ?? null,
    created_at: r.created_at,
  }));
}

export async function updateMember(id: number, input: UpdateMemberInput): Promise<Member | undefined> {
  const existing = await getMember(id);
  if (!existing) return undefined;

  const merged = {
    team_id: input.team_id ?? existing.team_id,
    name: input.name?.trim() ?? existing.name,
    chuc_vu: input.chuc_vu !== undefined ? input.chuc_vu.trim() || null : existing.chuc_vu,
    tuan_thu: input.tuan_thu !== undefined ? input.tuan_thu.trim() || null : existing.tuan_thu,
    noi_quy: input.noi_quy !== undefined ? input.noi_quy.trim() || null : existing.noi_quy,
    dao_tao: input.dao_tao !== undefined ? input.dao_tao.trim() || null : existing.dao_tao,
    ho_tro: input.ho_tro !== undefined ? input.ho_tro.trim() || null : existing.ho_tro,
    danh_gia: input.danh_gia !== undefined ? input.danh_gia.trim() || null : existing.danh_gia,
  };

  const [updated] = await db("members")
    .where({ id })
    .update(merged)
    .returning("*");

  return updated as Member;
}

export async function deleteMember(id: number): Promise<boolean> {
  return await db.transaction(async (trx) => {
    await trx("compliance_records").where({ member_id: id }).delete();
    await trx("training_records").where({ member_id: id }).delete();
    await trx("support_records").where({ member_id: id }).delete();
    await trx("danh_gia_records").where({ member_id: id }).delete();
    const count = await trx("members").where({ id }).delete();
    return count > 0;
  });
}

// Xóa nhiều nhân sự theo danh sách id đã chọn (checkbox trên bảng Nhân sự).
export async function deleteMembers(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return await db.transaction(async (trx) => {
    await trx("compliance_records").whereIn("member_id", ids).delete();
    await trx("training_records").whereIn("member_id", ids).delete();
    await trx("support_records").whereIn("member_id", ids).delete();
    await trx("danh_gia_records").whereIn("member_id", ids).delete();
    const count = await trx("members").whereIn("id", ids).delete();
    return Number(count);
  });
}

// Nhân bản toàn bộ nhân sự từ 1 tháng sang tháng mới tạo, để tháng mới có sẵn
// danh sách kế thừa nhưng độc lập hoàn toàn với tháng nguồn.
export async function cloneMembersFromPeriod(fromPeriodId: number, toPeriodId: number): Promise<void> {
  const oldMembers = await db("members as m")
    .join("teams as old_team", "old_team.id", "m.team_id")
    .where("m.period_id", fromPeriodId)
    .select("m.*", "old_team.name as team_name");

  const newTeams = await db("teams").where({ period_id: toPeriodId });
  const teamMap = new Map(newTeams.map((t) => [t.name, t.id]));

  for (const m of oldMembers) {
    const newTeamId = teamMap.get(m.team_name);
    if (!newTeamId) continue;
    const existing = await db("members")
      .where({ period_id: toPeriodId, team_id: newTeamId, name: m.name })
      .first();
    if (!existing) {
      await db("members").insert({
        period_id: toPeriodId,
        team_id: newTeamId,
        name: m.name,
        chuc_vu: m.chuc_vu,
        tuan_thu: m.tuan_thu,
        noi_quy: m.noi_quy,
        dao_tao: m.dao_tao,
        ho_tro: m.ho_tro,
        danh_gia: m.danh_gia,
      });
    }
  }
}
