import { db } from "../db/database.js";
import type { CreateMemberInput, Member, MemberWithTeam, UpdateMemberInput } from "../types/backlog.js";

// Khai báo nhân sự — dùng để chọn NVTT (người phụ trách) khi nhập/cập nhật
// task thay vì gõ tự do. Idempotent theo (period_id, team_id, name) — mỗi
// tháng backlog có danh sách nhân sự riêng, xóa/sửa ở tháng nào chỉ ảnh
// hưởng tháng đó.
export function createMember(input: CreateMemberInput): Member {
  const name = input.name.trim();
  const existing = db
    .prepare(`SELECT * FROM members WHERE period_id = ? AND team_id = ? AND name = ?`)
    .get(input.period_id, input.team_id, name) as Member | undefined;
  if (existing) return existing;

  return db
    .prepare(
      `INSERT INTO members (period_id, team_id, name, chuc_vu, tuan_thu, noi_quy, dao_tao, ho_tro, danh_gia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.team_id,
      name,
      input.chuc_vu?.trim() || null,
      input.tuan_thu?.trim() || null,
      input.noi_quy?.trim() || null,
      input.dao_tao?.trim() || null,
      input.ho_tro?.trim() || null,
      input.danh_gia?.trim() || null,
    ) as Member;
}

export function getMember(id: number): Member | undefined {
  return db.prepare(`SELECT * FROM members WHERE id = ?`).get(id) as Member | undefined;
}

// Danh sách nhân sự của 1 tháng backlog (mọi team), kèm tên team — hiển thị
// dạng bảng STT / Họ và Tên / Chức vụ / Team / Tuân thủ / Nội quy / Đào tạo /
// Hỗ trợ / Đánh giá. Cột "Tuân thủ", "Đào tạo", "Hỗ trợ", "Đánh giá" không
// phải nhập tay — "Tuân thủ" tính từ tổng số Vi phạm (compliance_records),
// "Đào tạo" và "Hỗ trợ" tính từ số lượng bản ghi tương ứng (training_records
// / support_records), "Đánh giá" lấy Ranking (so_thu_tu) từ danh_gia_records
// — tất cả map theo member_id (đã bao hàm đúng Team vì 1 nhân sự chỉ thuộc
// 1 team) của nhân sự đó trong đúng tháng đang xem.
export function listMembers(periodId: number): MemberWithTeam[] {
  return db
    .prepare(
      `SELECT members.id, members.period_id, members.team_id, members.name, members.chuc_vu,
              members.noi_quy, members.created_at,
              teams.name AS team_name,
              CASE WHEN cr.total_vi_pham IS NOT NULL THEN '-' || cr.total_vi_pham ELSE NULL END AS tuan_thu,
              CASE WHEN tr.total_count IS NOT NULL THEN '+' || tr.total_count ELSE NULL END AS dao_tao,
              CASE WHEN sr.total_count IS NOT NULL THEN '+' || sr.total_count ELSE NULL END AS ho_tro,
              dg.so_thu_tu AS danh_gia
       FROM members
       JOIN teams ON teams.id = members.team_id
       LEFT JOIN (
         SELECT member_id, SUM(vi_pham) AS total_vi_pham
         FROM compliance_records
         WHERE period_id = ?
         GROUP BY member_id
       ) cr ON cr.member_id = members.id
       LEFT JOIN (
         SELECT member_id, COUNT(*) AS total_count
         FROM training_records
         WHERE period_id = ?
         GROUP BY member_id
       ) tr ON tr.member_id = members.id
       LEFT JOIN (
         SELECT member_id, COUNT(*) AS total_count
         FROM support_records
         WHERE period_id = ?
         GROUP BY member_id
       ) sr ON sr.member_id = members.id
       LEFT JOIN danh_gia_records dg ON dg.member_id = members.id AND dg.period_id = ?
       WHERE members.period_id = ?
       ORDER BY teams.name ASC, members.name ASC`,
    )
    .all(periodId, periodId, periodId, periodId, periodId) as MemberWithTeam[];
}

export function updateMember(id: number, input: UpdateMemberInput): Member | undefined {
  const existing = getMember(id);
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

  return db
    .prepare(
      `UPDATE members
       SET team_id = ?, name = ?, chuc_vu = ?, tuan_thu = ?, noi_quy = ?, dao_tao = ?, ho_tro = ?, danh_gia = ?
       WHERE id = ? RETURNING *`,
    )
    .get(
      merged.team_id,
      merged.name,
      merged.chuc_vu,
      merged.tuan_thu,
      merged.noi_quy,
      merged.dao_tao,
      merged.ho_tro,
      merged.danh_gia,
      id,
    ) as Member;
}

export function deleteMember(id: number): boolean {
  const result = db.prepare(`DELETE FROM members WHERE id = ?`).run(id);
  return result.changes > 0;
}

// Xóa nhiều nhân sự theo danh sách id đã chọn (checkbox trên bảng Nhân sự).
export function deleteMembers(ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  const result = db.prepare(`DELETE FROM members WHERE id IN (${placeholders})`).run(...ids);
  return result.changes;
}

// Nhân bản toàn bộ nhân sự từ 1 tháng sang tháng mới tạo, để tháng mới có sẵn
// danh sách kế thừa nhưng độc lập hoàn toàn với tháng nguồn. Team giờ cũng
// gắn theo period nên phải map team_id theo TÊN team (team_id gốc và team_id
// của tháng mới là 2 id khác nhau dù cùng tên) — bắt buộc gọi
// cloneTeamsFromPeriod(fromPeriodId, toPeriodId) trước hàm này để team đích
// đã tồn tại.
export function cloneMembersFromPeriod(fromPeriodId: number, toPeriodId: number): void {
  db.prepare(
    `INSERT INTO members (period_id, team_id, name, chuc_vu, tuan_thu, noi_quy, dao_tao, ho_tro, danh_gia)
     SELECT ?, new_team.id, m.name, m.chuc_vu, m.tuan_thu, m.noi_quy, m.dao_tao, m.ho_tro, m.danh_gia
     FROM members m
     JOIN teams old_team ON old_team.id = m.team_id
     JOIN teams new_team ON new_team.period_id = ? AND new_team.name = old_team.name
     WHERE m.period_id = ?`,
  ).run(toPeriodId, toPeriodId, fromPeriodId);
}
