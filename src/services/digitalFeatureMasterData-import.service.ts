import ExcelJS from "exceljs";
import {
  createDigitalFeatureMasterData,
  listDigitalFeatureMasterData,
} from "./digitalFeatureMasterData.service.js";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";

// ===== Import/Export Excel "Danh mục (Master Data) của Module" =====
// Cột khớp 1-1 với bảng dữ liệu hiển thị trong tab (trừ STT — chỉ để đánh
// số, bỏ qua khi import).
export const DIGITAL_FEATURE_MD_IMPORT_HEADERS = [
  "STT",
  "Mã danh mục",
  "Tên danh mục",
  "Nội dung / thuộc tính",
  "Quản trị bởi",
] as const;

const KEYS = {
  ma_danh_muc: ["ma danh muc", "ma dm"],
  ten_danh_muc: ["ten danh muc"],
  noi_dung_thuoc_tinh: ["noi dung / thuoc tinh", "noi dung thuoc tinh", "noi dung"],
  quan_tri_boi: ["quan tri boi", "quan tri"],
} as const;

export function buildDigitalFeatureMdTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Danh mục (Master Data) của Module",
    DIGITAL_FEATURE_MD_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : Math.min(46, Math.max(14, header.length + 4)),
    })),
    [
      [
        1,
        "DM-001",
        "Danh mục gói thầu",
        "Trường: Số TBMT, Tên gói thầu, Chủ đầu tư, Giá gói, Trạng thái",
        "P.BĐKD",
      ],
      [
        2,
        "DM-002",
        "Danh mục khách hàng",
        "Trường: Mã KH, Tên KH, Lĩnh vực, Địa bàn, Nguồn (CRM/nhập tay)",
        "Quản trị hệ thống",
      ],
    ],
  );
}

export interface DigitalFeatureMdImportResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importDigitalFeatureMdFromWorkbook(
  buffer: Buffer,
  digitalFeatureId: number,
): Promise<DigitalFeatureMdImportResult> {
  const { headers, rows } = await parseFirstSheet(buffer);
  const col = (keys: readonly string[]) => pickColumn(headers, keys as unknown as string[]);

  // Cột "Tên danh mục" bắt buộc — thiếu cột này cả file không import được gì.
  const tenCol = col(KEYS.ten_danh_muc);
  if (!tenCol) {
    throw new Error('File thiếu cột "Tên danh mục" — hãy dùng đúng biểu mẫu mẫu (File mẫu).');
  }

  const result: DigitalFeatureMdImportResult = { imported: 0, skipped: [] };
  // Mã danh mục đã dùng trong module (đang hiển thị) + trong file này —
  // dòng trùng Mã thì bỏ qua (import lại file cũ không nhân bản dữ liệu).
  const seenMa = new Set<string>();
  const existing = await listDigitalFeatureMasterData(digitalFeatureId);
  for (const r of existing) {
    if (r.ma_danh_muc) seenMa.add(r.ma_danh_muc.trim().toLowerCase());
  }

  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // dòng Excel thật (dòng 1 là tiêu đề)
    const tenValue = val(row, tenCol);
    const label = tenValue || val(row, col(KEYS.ma_danh_muc));

    if (!tenValue) {
      result.skipped.push({ row: rowNo, label, reason: "Thiếu Tên danh mục" });
      continue;
    }

    const ma = val(row, col(KEYS.ma_danh_muc));
    if (ma) {
      const key = ma.toLowerCase();
      if (seenMa.has(key)) {
        result.skipped.push({ row: rowNo, label, reason: `Trùng Mã danh mục "${ma}" với dòng đã có` });
        continue;
      }
      seenMa.add(key);
    }

    await createDigitalFeatureMasterData({
      digital_feature_id: digitalFeatureId,
      ma_danh_muc: ma || undefined, // trống -> tự sinh DM-xxx
      ten_danh_muc: tenValue,
      noi_dung_thuoc_tinh: val(row, col(KEYS.noi_dung_thuoc_tinh)) || undefined,
      quan_tri_boi: val(row, col(KEYS.quan_tri_boi)) || undefined,
    });
    result.imported += 1;
  }

  return result;
}

export async function exportDigitalFeatureMdToExcel(digitalFeatureId: number): Promise<ExcelJS.Buffer> {
  const items = await listDigitalFeatureMasterData(digitalFeatureId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Danh mục (Master Data)");
  sheet.columns = DIGITAL_FEATURE_MD_IMPORT_HEADERS.map((header) => ({
    header,
    width: header === "STT" ? 6 : Math.min(46, Math.max(14, header.length + 4)),
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
      item.ma_danh_muc ?? "",
      item.ten_danh_muc ?? "",
      item.noi_dung_thuoc_tinh ?? "",
      item.quan_tri_boi ?? "",
    ]);
  });

  return workbook.xlsx.writeBuffer();
}
