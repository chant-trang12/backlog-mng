import ExcelJS from "exceljs";
import {
  createDigitalFeatureDataObject,
  listDigitalFeatureDataObjects,
} from "./digitalFeatureDataObject.service.js";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";

// ===== Import/Export Excel "Đối tượng dữ liệu & Vòng đời trạng thái" =====
// Cột khớp 1-1 với bảng dữ liệu hiển thị trong tab (trừ STT — chỉ để đánh
// số, bỏ qua khi import).
export const DIGITAL_FEATURE_DO_IMPORT_HEADERS = [
  "STT",
  "Đối tượng",
  "Khóa & thuộc tính chính",
  "Vòng đời trạng thái",
] as const;

const KEYS = {
  ten_doi_tuong: ["doi tuong", "ten doi tuong"],
  khoa_thuoc_tinh: ["khoa & thuoc tinh chinh", "khoa thuoc tinh chinh", "khoa"],
  vong_doi_trang_thai: ["vong doi trang thai", "vong doi"],
} as const;

export function buildDigitalFeatureDoTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Đối tượng dữ liệu & Vòng đời trạng thái",
    DIGITAL_FEATURE_DO_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : Math.min(46, Math.max(14, header.length + 4)),
    })),
    [
      [
        1,
        "Gói thầu",
        "Số TBMT (khóa), Tên gói thầu, Chủ đầu tư, Giá gói, Lĩnh vực, Nguồn",
        "Nháp -> Đang thu thập -> Chờ rà soát -> Đang đấu thầu -> Trúng/Không trúng -> Đóng",
      ],
      [
        2,
        "HSMT",
        "Mã HSMT (khóa), Gói thầu (FK), File đính kèm, Người soạn, Hạn nộp",
        "Soạn thảo -> Kiểm tra -> Phát hành -> Hết hạn",
      ],
    ],
  );
}

export interface DigitalFeatureDoImportResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importDigitalFeatureDoFromWorkbook(
  buffer: Buffer,
  digitalFeatureId: number,
): Promise<DigitalFeatureDoImportResult> {
  const { headers, rows } = await parseFirstSheet(buffer);
  const col = (keys: readonly string[]) => pickColumn(headers, keys as unknown as string[]);

  // Cột "Đối tượng" bắt buộc — thiếu cột này cả file không import được gì.
  const tenCol = col(KEYS.ten_doi_tuong);
  if (!tenCol) {
    throw new Error('File thiếu cột "Đối tượng" — hãy dùng đúng biểu mẫu mẫu (File mẫu).');
  }

  const result: DigitalFeatureDoImportResult = { imported: 0, skipped: [] };
  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // dòng Excel thật (dòng 1 là tiêu đề)
    const tenValue = val(row, tenCol);

    if (!tenValue) {
      result.skipped.push({ row: rowNo, label: "", reason: "Thiếu Đối tượng" });
      continue;
    }

    await createDigitalFeatureDataObject({
      digital_feature_id: digitalFeatureId,
      ten_doi_tuong: tenValue,
      khoa_thuoc_tinh: val(row, col(KEYS.khoa_thuoc_tinh)) || undefined,
      vong_doi_trang_thai: val(row, col(KEYS.vong_doi_trang_thai)) || undefined,
    });
    result.imported += 1;
  }

  return result;
}

export async function exportDigitalFeatureDoToExcel(digitalFeatureId: number): Promise<ExcelJS.Buffer> {
  const items = await listDigitalFeatureDataObjects(digitalFeatureId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Đối tượng dữ liệu & Vòng đời");
  sheet.columns = DIGITAL_FEATURE_DO_IMPORT_HEADERS.map((header) => ({
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
      item.ten_doi_tuong ?? "",
      item.khoa_thuoc_tinh ?? "",
      item.vong_doi_trang_thai ?? "",
    ]);
  });

  return workbook.xlsx.writeBuffer();
}
