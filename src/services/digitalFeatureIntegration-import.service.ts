import ExcelJS from "exceljs";
import {
  createDigitalFeatureIntegration,
  listDigitalFeatureIntegrations,
} from "./digitalFeatureIntegration.service.js";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";

// ===== Import/Export Excel "Tích hợp & Sự kiện" =====
// Cột khớp 1-1 với bảng dữ liệu hiển thị trong tab (trừ STT — chỉ để đánh
// số, bỏ qua khi import).
export const DIGITAL_FEATURE_INT_IMPORT_HEADERS = [
  "STT",
  "Hướng",
  "Module / hệ thống",
  "Dữ liệu trao đổi",
  "Cơ chế & tần suất",
] as const;

const KEYS = {
  huong: ["huong"],
  module_he_thong: ["module / he thong", "module he thong", "module", "he thong"],
  du_lieu_trao_doi: ["du lieu trao doi"],
  co_che_tan_suat: ["co che & tan suat", "co che tan suat", "co che"],
} as const;

export function buildDigitalFeatureIntTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Tích hợp & Sự kiện",
    DIGITAL_FEATURE_INT_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : Math.min(46, Math.max(14, header.length + 4)),
    })),
    [
      [
        1,
        "Nhận vào",
        "CRM",
        "Deal thắng: Mã deal, Tên khách hàng, Giá gói, Lĩnh vực",
        "Webhook realtime — tạo Gói thầu khi Deal chuyển thắng",
      ],
      [
        2,
        "Đẩy ra",
        "Hệ thống ERP",
        "Kết quả đấu thầu: Số TBMT, Trạng thái, Giá trúng",
        "REST API định kỳ 15 phút/lần — đồng bộ trạng thái",
      ],
    ],
  );
}

export interface DigitalFeatureIntImportResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importDigitalFeatureIntFromWorkbook(
  buffer: Buffer,
  digitalFeatureId: number,
): Promise<DigitalFeatureIntImportResult> {
  const { headers, rows } = await parseFirstSheet(buffer);
  const col = (keys: readonly string[]) => pickColumn(headers, keys as unknown as string[]);

  // Cột "Hướng" bắt buộc — thiếu cột này cả file không import được gì.
  const huongCol = col(KEYS.huong);
  if (!huongCol) {
    throw new Error('File thiếu cột "Hướng" — hãy dùng đúng biểu mẫu mẫu (File mẫu).');
  }

  const result: DigitalFeatureIntImportResult = { imported: 0, skipped: [] };
  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // dòng Excel thật (dòng 1 là tiêu đề)
    const huongValue = val(row, huongCol);
    const label = huongValue || val(row, col(KEYS.module_he_thong));

    if (!huongValue) {
      result.skipped.push({ row: rowNo, label, reason: "Thiếu Hướng" });
      continue;
    }

    await createDigitalFeatureIntegration({
      digital_feature_id: digitalFeatureId,
      huong: huongValue,
      module_he_thong: val(row, col(KEYS.module_he_thong)) || undefined,
      du_lieu_trao_doi: val(row, col(KEYS.du_lieu_trao_doi)) || undefined,
      co_che_tan_suat: val(row, col(KEYS.co_che_tan_suat)) || undefined,
    });
    result.imported += 1;
  }

  return result;
}

export async function exportDigitalFeatureIntToExcel(digitalFeatureId: number): Promise<ExcelJS.Buffer> {
  const items = await listDigitalFeatureIntegrations(digitalFeatureId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Tích hợp & Sự kiện");
  sheet.columns = DIGITAL_FEATURE_INT_IMPORT_HEADERS.map((header) => ({
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
      item.huong ?? "",
      item.module_he_thong ?? "",
      item.du_lieu_trao_doi ?? "",
      item.co_che_tan_suat ?? "",
    ]);
  });

  return workbook.xlsx.writeBuffer();
}
