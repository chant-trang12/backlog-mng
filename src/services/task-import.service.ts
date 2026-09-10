import type ExcelJS from "exceljs";
import { createTask } from "./task.service.js";
import { createTeam, listTeams } from "./team.service.js";
import type { TaskStatus } from "../types/backlog.js";
import {
  buildTemplateWorkbook,
  parseDateToIso,
  parseFirstSheet,
  pickColumn,
} from "./workbook.util.js";

export const TASK_IMPORT_HEADERS = [
  "Team",
  "Nhiệm vụ",
  "Tag",
  "Tính chất",
  "DoD",
  "Deadline",
  "% Hoàn thành",
  "Trạng thái",
  "Tiến độ",
] as const;

const KEYS = {
  team: ["team", "nhom", "doi"],
  nhiem_vu: ["nhiem vu", "cong viec", "task", "noi dung"],
  tag: ["tag", "the"],
  tinh_chat: ["tinh chat", "phan loai"],
  dod: ["dod", "definition of done"],
  deadline: ["deadline", "han", "ngay het han", "ngay ket thuc"],
  phan_tram: ["% hoan thanh", "phan tram hoan thanh", "hoan thanh", "progress"],
  trang_thai: ["trang thai", "status"],
  tien_do: ["tien do", "ghi chu tien do"],
};

const STATUSES: TaskStatus[] = ["Chưa thực hiện", "Đang thực hiện", "Hoàn thành", "Hủy"];

export interface ImportTasksResult {
  imported: number;
  skipped: { row: number; nhiem_vu: string; reason: string }[];
  teamsCreated: string[];
}

export function buildTaskImportTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Nhiệm vụ",
    [
      { header: "Team", width: 14 },
      { header: "Nhiệm vụ", width: 40 },
      { header: "Tag", width: 16 },
      { header: "Tính chất", width: 16 },
      { header: "DoD", width: 32 },
      { header: "Deadline", width: 14 },
      { header: "% Hoàn thành", width: 14 },
      { header: "Trạng thái", width: 16 },
      { header: "Tiến độ", width: 32 },
    ],
    [
      ["CRM", "Xây dựng API abc", "Số hoá", "NVKH", "Chạy được trên staging", "15/03/2026", 0, "Chưa thực hiện", ""],
      ["NVKH", "Rà soát quy trình xyz", "", "NVPS", "", "", 50, "Đang thực hiện", "Đã xong bước 1"],
    ],
  );
}

export async function importTasksFromWorkbook(
  periodId: number,
  buffer: Buffer,
  departmentId?: number | null,
): Promise<ImportTasksResult> {
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

  const col = (k: keyof typeof KEYS) => pickColumn(headers, KEYS[k]);
  const teamCol = col("team");
  const nhiemVuCol = col("nhiem_vu");
  if (!nhiemVuCol) {
    throw new Error('Không tìm thấy cột "Nhiệm vụ" trong file — tải file mẫu để đúng định dạng.');
  }

  const teams = await listTeams(periodId, departmentId ?? null);
  const teamByName = new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.name]));
  const teamsCreated: string[] = [];
  const result: ImportTasksResult = { imported: 0, skipped: [], teamsCreated };

  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2;
    const row = rows[i];
    const nhiemVu = val(row, nhiemVuCol);
    const teamName = val(row, teamCol);

    if (!nhiemVu) {
      result.skipped.push({ row: rowNo, nhiem_vu: "", reason: "Thiếu Nhiệm vụ" });
      continue;
    }
    if (!teamName) {
      result.skipped.push({ row: rowNo, nhiem_vu: nhiemVu, reason: "Thiếu Team" });
      continue;
    }

    if (!teamByName.has(teamName.toLowerCase())) {
      const team = await createTeam(teamName, periodId, departmentId ?? null);
      teamByName.set(teamName.toLowerCase(), team.name);
      teamsCreated.push(team.name);
    }

    const rawStatus = val(row, col("trang_thai"));
    const trangThai = STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());
    const rawPct = val(row, col("phan_tram")).replace("%", "").replace(",", ".");
    const pct = Number(rawPct);

    await createTask(periodId, {
      department_id: departmentId ?? undefined,
      team: teamByName.get(teamName.toLowerCase()) ?? teamName,
      nhiem_vu: nhiemVu,
      tag: val(row, col("tag")) || undefined,
      tinh_chat: val(row, col("tinh_chat")) || undefined,
      dod: val(row, col("dod")) || undefined,
      deadline: parseDateToIso(val(row, col("deadline"))) || undefined,
      phan_tram_hoan_thanh: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : undefined,
      trang_thai: trangThai,
      tien_do: val(row, col("tien_do")) || undefined,
    });
    result.imported += 1;
  }

  return result;
}
