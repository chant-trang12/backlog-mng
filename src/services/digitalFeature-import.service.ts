import ExcelJS from "exceljs";
import {
  createDigitalFeature,
  listDigitalFeatures,
} from "./digitalFeature.service.js";
import type { DigitalFeatureFilters } from "../types/digitalFeature.js";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";

// ===== Import/Export Excel "Quản lý tính năng số hoá" =====
// Cột khớp 1-1 với bảng dữ liệu hiển thị (trừ STT — chỉ để đánh số, bỏ qua
// khi import): Mã, Module, Đơn vị chủ trì (đề xuất), Đơn vị phối hợp, Giai
// đoạn, TN / MH, Mục tiêu nghiệp vụ, Vai trò P.BĐKD, Nhận đầu vào từ,
// Chuyển đầu ra tới.
export const DIGITAL_FEATURE_IMPORT_HEADERS = [
  "STT",
  "Mã",
  "Module",
  "Đơn vị chủ trì (đề xuất)",
  "Đơn vị phối hợp",
  "Giai đoạn",
  "TN / MH",
  "Mục tiêu nghiệp vụ",
  "Vai trò P.BĐKD",
  "Nhận đầu vào từ",
  "Chuyển đầu ra tới",
] as const;

const KEYS = {
  ma: ["ma", "ma tinh nang"],
  module: ["module", "modul", "mo dun"],
  don_vi_chu_tri: ["don vi chu tri (de xuat)", "don vi chu tri de xuat", "don vi chu tri"],
  don_vi_phoi_hop: ["don vi phoi hop"],
  giai_doan: ["giai doan"],
  tn_mh: ["tn / mh", "tn /mh", "tn/ mh", "tn/mh", "tn mh"],
  muc_tieu: ["muc tieu nghiep vu", "muc tieu nghiep vu"],
  vai_tro_pbdkd: ["vai tro p.bdkd", "vai tro pbdkd", "vai tro p bdkd", "vai tro"],
  nhan_dau_vao_tu: ["nhan dau vao tu", "nhan dau vao"],
  chuyen_dau_ra_toi: ["chuyen dau ra toi", "chuyen dau ra"],
} as const;

export function buildDigitalFeatureTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Tính năng số hoá",
    DIGITAL_FEATURE_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : Math.min(42, Math.max(14, header.length + 4)),
    })),
    [
      [
        1,
        "TNSH-001",
        "Văn bản - Quản lý điều hành",
        "Phòng Hành chính - Quản trị",
        "Phòng Công nghệ thông tin; Văn thư",
        "Đang triển khai",
        "TN",
        "Số hoá quy trình soạn thảo, trình ký và lưu trữ công văn.",
        "Phê duyệt nhu cầu, phân bổ nguồn lực.",
        "Văn thư; Phòng Hành chính",
        "Ban Giám đốc; Các phòng ban",
      ],
      [
        2,
        "TNSH-002",
        "Chăm sóc khách hàng",
        "Phòng Kinh doanh",
        "Phòng Công nghệ thông tin",
        "Đề xuất",
        "MH",
        "Tiếp nhận và theo dõi yêu cầu hỗ trợ khách hàng trực tuyến.",
        "Định hướng quy trình, kiểm tra tiến độ.",
        "Tổng đài CSKH",
        "Bộ phận xử lý yêu cầu",
      ],
    ],
  );
}

export interface DigitalFeatureImportResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importDigitalFeaturesFromWorkbook(buffer: Buffer): Promise<DigitalFeatureImportResult> {
  const { headers, rows } = await parseFirstSheet(buffer);
  const col = (keys: readonly string[]) => pickColumn(headers, keys as unknown as string[]);

  // Cột Module bắt buộc (tên tính năng/nghiệp vụ cần quản lý) — thiếu cột
  // này cả file không import được gì.
  const moduleCol = col(KEYS.module);
  if (!moduleCol) {
    throw new Error('File thiếu cột "Module" — hãy dùng đúng biểu mẫu mẫu (Tải excel mẫu).');
  }

  const result: DigitalFeatureImportResult = { imported: 0, skipped: [] };
  // Mã đã dùng trong file này + Mã đang hiển thị trong hệ thống — để chặn
  // trùng Mã (kể cả trùng nội bộ trong cùng file).
  const seenMa = new Set<string>();
  const existing = await listDigitalFeatures();
  for (const r of existing) {
    if (r.ma) seenMa.add(r.ma.trim().toLowerCase());
  }

  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // dòng Excel thật (dòng 1 là tiêu đề)
    const moduleValue = val(row, moduleCol);
    const label = moduleValue || val(row, col(KEYS.ma));

    if (!moduleValue) {
      result.skipped.push({ row: rowNo, label, reason: "Thiếu Module" });
      continue;
    }

    const ma = val(row, col(KEYS.ma));
    if (ma) {
      const key = ma.toLowerCase();
      if (seenMa.has(key)) {
        result.skipped.push({ row: rowNo, label, reason: `Trùng Mã "${ma}" với tính năng đã có` });
        continue;
      }
      seenMa.add(key);
    }

    await createDigitalFeature({
      ma: ma || undefined, // trống -> tự sinh TNSH-xxx
      module: moduleValue,
      don_vi_chu_tri: val(row, col(KEYS.don_vi_chu_tri)) || undefined,
      don_vi_phoi_hop: val(row, col(KEYS.don_vi_phoi_hop)) || undefined,
      giai_doan: val(row, col(KEYS.giai_doan)) || undefined,
      tn_mh: val(row, col(KEYS.tn_mh)) || undefined,
      muc_tieu_nghiep_vu: val(row, col(KEYS.muc_tieu)) || undefined,
      vai_tro_pbdkd: val(row, col(KEYS.vai_tro_pbdkd)) || undefined,
      nhan_dau_vao_tu: val(row, col(KEYS.nhan_dau_vao_tu)) || undefined,
      chuyen_dau_ra_toi: val(row, col(KEYS.chuyen_dau_ra_toi)) || undefined,
    });
    result.imported += 1;
  }

  return result;
}

export async function exportDigitalFeaturesToExcel(filters: DigitalFeatureFilters = {}): Promise<ExcelJS.Buffer> {
  const items = await listDigitalFeatures(filters);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Tính năng số hoá");
  sheet.columns = DIGITAL_FEATURE_IMPORT_HEADERS.map((header) => ({
    header,
    width: header === "STT" ? 6 : Math.min(42, Math.max(14, header.length + 4)),
  }));
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF632423" } };
  });
  sheet.getRow(1).height = 24;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  items.forEach((item, idx) => {
    sheet.addRow([
      idx + 1,
      item.ma ?? "",
      item.module ?? "",
      item.don_vi_chu_tri ?? "",
      item.don_vi_phoi_hop ?? "",
      item.giai_doan ?? "",
      item.tn_mh ?? "",
      item.muc_tieu_nghiep_vu ?? "",
      item.vai_tro_pbdkd ?? "",
      item.nhan_dau_vao_tu ?? "",
      item.chuyen_dau_ra_toi ?? "",
    ]);
  });

  return workbook.xlsx.writeBuffer();
}
