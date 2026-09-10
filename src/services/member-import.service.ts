import type ExcelJS from "exceljs";
import { createMember } from "./member.service.js";
import { createTeam, listTeams } from "./team.service.js";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";

// 3 cột của file mẫu nhập nhân sự — chỉ "Họ và Tên" là bắt buộc.
export const MEMBER_IMPORT_HEADERS = ["Họ và Tên", "Chức vụ", "Team"] as const;

const NAME_KEYS = ["ho va ten", "ho ten", "hoten", "name", "full name"];
const CHUC_VU_KEYS = ["chuc vu", "chucvu", "position", "role", "title"];
const TEAM_KEYS = ["team", "nhom", "doi", "bo phan"];

export interface ImportMembersResult {
  imported: number;
  skipped: { row: number; name: string; reason: string }[];
  teamsCreated: string[];
}

// Tạo file .xlsx mẫu: dòng 1 tiêu đề 3 cột, kèm 2 dòng ví dụ.
export function buildMemberImportTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Nhân sự",
    [
      { header: MEMBER_IMPORT_HEADERS[0], width: 28 },
      { header: MEMBER_IMPORT_HEADERS[1], width: 22 },
      { header: MEMBER_IMPORT_HEADERS[2], width: 18 },
    ],
    [
      ["Nguyễn Văn A", "Trưởng nhóm", "CRM"],
      ["Trần Thị B", "", "CSKH"],
    ],
  );
}

// Import nhân sự từ bytes file Excel vào 1 tháng backlog. Chỉ thêm mới —
// không xóa nhân sự sẵn có; trùng (period_id, team_id, name) được bỏ qua nhờ
// createMember() idempotent. Team chưa có trong tháng sẽ được tạo mới.
export async function importMembersFromWorkbook(
  periodId: number,
  buffer: Buffer,
  departmentId?: number | null,
): Promise<ImportMembersResult> {
  let parsed: Awaited<ReturnType<typeof parseFirstSheet>>;
  try {
    parsed = await parseFirstSheet(buffer);
  } catch {
    throw new Error("File không đúng định dạng Excel (.xlsx) — tải file mẫu để đúng định dạng.");
  }
  const { headers, rows } = parsed;
  if (headers.length === 0) {
    throw new Error("Không đọc được cột dữ liệu nào trong file — kiểm tra lại dòng tiêu đề (dòng 1).");
  }

  const nameCol = pickColumn(headers, NAME_KEYS);
  if (!nameCol) {
    throw new Error('Không tìm thấy cột "Họ và Tên" trong file — tải file mẫu để đúng định dạng.');
  }
  const chucVuCol = pickColumn(headers, CHUC_VU_KEYS);
  const teamCol = pickColumn(headers, TEAM_KEYS);

  const teams = await listTeams(periodId, departmentId ?? null);
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const teamsCreated: string[] = [];

  const result: ImportMembersResult = { imported: 0, skipped: [], teamsCreated };

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2; // dòng 1 là tiêu đề
    const row = rows[i];
    const name = (row[nameCol] ?? "").trim();
    const chucVu = chucVuCol ? (row[chucVuCol] ?? "").trim() : "";
    const teamName = teamCol ? (row[teamCol] ?? "").trim() : "";

    if (!name) {
      result.skipped.push({ row: rowNo, name: "", reason: "Thiếu Họ và Tên" });
      continue;
    }
    if (!teamName) {
      result.skipped.push({ row: rowNo, name, reason: "Thiếu Team" });
      continue;
    }

    let teamId = teamByName.get(teamName.toLowerCase());
    if (!teamId) {
      const team = await createTeam(teamName, periodId, departmentId ?? null);
      teamId = team.id;
      teamByName.set(teamName.toLowerCase(), teamId);
      teamsCreated.push(team.name);
    }

    await createMember({
      period_id: periodId,
      team_id: teamId,
      name,
      chuc_vu: chucVu || undefined,
    });
    result.imported += 1;
  }

  return result;
}
