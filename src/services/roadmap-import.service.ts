import type ExcelJS from "exceljs";
import { createRoadmapItem } from "./roadmap.service.js";
import type { TaskStatus } from "../types/backlog.js";
import {
  buildTemplateWorkbook,
  parseDateToIso,
  parseFirstSheet,
  pickColumn,
} from "./workbook.util.js";

const KEYS = {
  team: ["team", "nhom", "doi"],
  nhiem_vu: ["nhiem vu", "cong viec", "task", "noi dung"],
  he_thong: ["he thong", "system"],
  muc_tieu: ["muc tieu", "objective", "goal"],
  dod: ["dod", "definition of done"],
  dieu_kien: ["dieu kien dam bao", "dieu kien", "assurance"],
  phan_loai: ["phan loai", "loai"],
  bat_dau: ["thoi gian bat dau", "bat dau", "start", "ngay bat dau"],
  ket_thuc: ["thoi gian ket thuc", "ket thuc", "end", "ngay ket thuc"],
  trang_thai: ["trang thai", "status"],
  ghi_chu: ["ghi chu", "note", "comment"],
};

const STATUSES: TaskStatus[] = ["Chưa thực hiện", "Đang thực hiện", "Hoàn thành", "Hủy"];

export interface ImportRoadmapResult {
  imported: number;
  skipped: { row: number; nhiem_vu: string; reason: string }[];
  teamsCreated: string[];
}

export function buildRoadmapImportTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Roadmap năm",
    [
      { header: "Team", width: 14 },
      { header: "Hệ thống", width: 16 },
      { header: "Mục tiêu", width: 18 },
      { header: "Nhiệm vụ", width: 36 },
      { header: "DOD", width: 30 },
      { header: "Điều kiện đảm bảo", width: 30 },
      { header: "Phân loại", width: 14 },
      { header: "Thời gian bắt đầu", width: 16 },
      { header: "Thời gian kết thúc", width: 16 },
      { header: "Trạng thái", width: 16 },
      { header: "Ghi chú", width: 24 },
    ],
    [
      ["CRM", "Website", "Tính năng mới", "Làm màn hình quản lý abc", "Chạy trên prod", "Có kiểm thử tự động", "NVKH", "02/01/2026", "15/03/2026", "Chưa thực hiện", ""],
      ["NVKH", "Nội bộ", "Nâng cấp tính năng", "Tối ưu truy vấn xyz", "", "", "NVPS", "01/04/2026", "30/06/2026", "Đang thực hiện", "Ưu tiên cao"],
    ],
  );
}

export async function importRoadmapFromWorkbook(
  year: number,
  buffer: Buffer,
  departmentId?: number | null,
): Promise<ImportRoadmapResult> {
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
  const nhiemVuCol = col("nhiem_vu");
  if (!nhiemVuCol) {
    throw new Error('Không tìm thấy cột "Nhiệm vụ" trong file — tải file mẫu để đúng định dạng.');
  }
  const teamCol = col("team");

  // Roadmap chỉ theo (phòng, năm) — không tạo team; team lưu dạng chuỗi.
  const result: ImportRoadmapResult = { imported: 0, skipped: [], teamsCreated: [] };
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

    const rawStatus = val(row, col("trang_thai"));
    const trangThai = STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());

    await createRoadmapItem({
      year,
      department_id: departmentId ?? null,
      team: teamName,
      nhiem_vu: nhiemVu,
      he_thong: val(row, col("he_thong")) || undefined,
      muc_tieu: val(row, col("muc_tieu")) || undefined,
      dod: val(row, col("dod")) || undefined,
      dieu_kien_dam_bao: val(row, col("dieu_kien")) || undefined,
      phan_loai: val(row, col("phan_loai")) || undefined,
      thoi_gian_bat_dau: parseDateToIso(val(row, col("bat_dau"))) || undefined,
      thoi_gian_ket_thuc: parseDateToIso(val(row, col("ket_thuc"))) || undefined,
      trang_thai: trangThai,
      ghi_chu: val(row, col("ghi_chu")) || undefined,
    });
    result.imported += 1;
  }

  return result;
}
