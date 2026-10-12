import ExcelJS from "exceljs";
import {
  createDigitalFeatureScreen,
  listDigitalFeatureScreens,
} from "./digitalFeatureScreen.service.js";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";

// ===== Import/Export Excel "Màn hình, Tính năng & Phân quyền" =====
// Cột khớp 1-1 với bảng dữ liệu hiển thị trong tab (trừ STT — chỉ để đánh
// số, bỏ qua khi import).
export const DIGITAL_FEATURE_SCREEN_IMPORT_HEADERS = [
  "STT",
  "Mã MH",
  "TN",
  "Tên màn hình / chức năng",
  "Loại",
  "Thành phần chính / trường dữ liệu",
  "Hành động (nút / thao tác)",
  "Quy tắc nghiệp vụ & kiểm tra",
  "Sales / AM",
  "Trưởng đơn vị KD",
  "Presales / Sản phẩm",
  "NV BĐKD (thực thi)",
  "Kiểm soát / Lãnh đạo BĐKD",
  "Pháp chế",
  "TCKT",
  "Ban lãnh đạo",
  "Quản trị hệ thống",
] as const;

const KEYS = {
  ma_mh: ["ma mh", "ma man hinh"],
  tn: ["tn", "tinh nang"],
  ten_man_hinh: ["ten man hinh / chuc nang", "ten man hinh chuc nang", "ten man hinh"],
  loai: ["loai"],
  thanh_phan_chinh: ["thanh phan chinh / truong du lieu", "thanh phan chinh truong du lieu", "thanh phan chinh"],
  hanh_dong: ["hanh dong (nut / thao tac)", "hanh dong nut thao tac", "hanh dong"],
  quy_tac_nghiep_vu: ["quy tac nghiep vu & kiem tra", "quy tac nghiep vu kiem tra", "quy tac nghiep vu"],
  sales_am: ["sales / am", "sales am"],
  truong_dvkd: ["truong don vi kd", "truong don vi kinh doanh"],
  presales_sp: ["presales / san pham", "presales san pham", "presales"],
  nv_bdkd: ["nv bdkd (thuc thi)", "nv bdkd thuc thi", "nv bdkd"],
  ks_lanh_dao_bdkd: ["kiem soat / lanh dao bdkd", "kiem soat lanh dao bdkd", "kiem soat"],
  phap_che: ["phap che"],
  tckt: ["tckt"],
  ban_lanh_dao: ["ban lanh dao"],
  quan_tri_he_thong: ["quan tri he thong", "qtht"],
} as const;

export function buildDigitalFeatureScreenTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Màn hình, Tính năng & Phân quyền",
    DIGITAL_FEATURE_SCREEN_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : Math.min(42, Math.max(14, header.length + 4)),
    })),
    [
      [
        1,
        "MH-001",
        "TN-01",
        "Danh sách hồ sơ thầu",
        "Màn hình danh sách",
        "Bảng: Tên gói thầu, Chủ đầu tư, Trạng thái, Hạn nộp",
        "Tìm kiếm, Lọc trạng thái, Thêm hồ sơ, Xuất Excel",
        "Chỉ hiện hồ sơ theo đơn vị được phân quyền.",
        "Xem",
        "Xem, Xóa",
        "Xem",
        "Thêm, Sửa",
        "Xem toàn bộ đơn vị",
        "Xem",
        "Xem",
        "Xem",
        "Toàn quyền",
      ],
      [
        2,
        "MH-002",
        "TN-01",
        "Lập hồ sơ mời thầu",
        "Màn hình nhập liệu",
        "Form: Thông tin gói thầu, HSMT, Bảo lãnh",
        "Lưu nháp, Trình duyệt, Tải HSMT mẫu",
        "Bắt buộc đủ HSMT trước khi trình duyệt.",
        "Xem",
        "Phê duyệt",
        "Soạn thảo",
        "Soạn thảo, Trình duyệt",
        "Kiểm soát",
        "Rà soát pháp lý",
        "Kiểm soát chi phí",
        "Xem",
        "Cấu hình biểu mẫu",
      ],
    ],
  );
}

export interface DigitalFeatureScreenImportResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export async function importDigitalFeatureScreensFromWorkbook(
  buffer: Buffer,
  digitalFeatureId: number,
): Promise<DigitalFeatureScreenImportResult> {
  const { headers, rows } = await parseFirstSheet(buffer);
  const col = (keys: readonly string[]) => pickColumn(headers, keys as unknown as string[]);

  // Cột "Tên màn hình / chức năng" bắt buộc — thiếu cột này cả file không
  // import được gì.
  const tenCol = col(KEYS.ten_man_hinh);
  if (!tenCol) {
    throw new Error('File thiếu cột "Tên màn hình / chức năng" — hãy dùng đúng biểu mẫu mẫu (File mẫu).');
  }

  const result: DigitalFeatureScreenImportResult = { imported: 0, skipped: [] };
  // Mã MH đã dùng trong module (đang hiển thị) + trong file này — dòng trùng
  // Mã MH thì bỏ qua, kể cả trùng nội bộ trong cùng file (import lại file cũ
  // không nhân bản dữ liệu).
  const seenMaMh = new Set<string>();
  const existing = await listDigitalFeatureScreens(digitalFeatureId);
  for (const r of existing) {
    if (r.ma_mh) seenMaMh.add(r.ma_mh.trim().toLowerCase());
  }

  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // dòng Excel thật (dòng 1 là tiêu đề)
    const tenValue = val(row, tenCol);
    const label = tenValue || val(row, col(KEYS.ma_mh));

    if (!tenValue) {
      result.skipped.push({ row: rowNo, label, reason: "Thiếu Tên màn hình / chức năng" });
      continue;
    }

    const maMh = val(row, col(KEYS.ma_mh));
    if (maMh) {
      const key = maMh.toLowerCase();
      if (seenMaMh.has(key)) {
        result.skipped.push({ row: rowNo, label, reason: `Trùng Mã MH "${maMh}" với màn hình đã có` });
        continue;
      }
      seenMaMh.add(key);
    }

    await createDigitalFeatureScreen({
      digital_feature_id: digitalFeatureId,
      ma_mh: maMh || undefined, // trống -> tự sinh MH-xxx
      tn: val(row, col(KEYS.tn)) || undefined,
      ten_man_hinh: tenValue,
      loai: val(row, col(KEYS.loai)) || undefined,
      thanh_phan_chinh: val(row, col(KEYS.thanh_phan_chinh)) || undefined,
      hanh_dong: val(row, col(KEYS.hanh_dong)) || undefined,
      quy_tac_nghiep_vu: val(row, col(KEYS.quy_tac_nghiep_vu)) || undefined,
      sales_am: val(row, col(KEYS.sales_am)) || undefined,
      truong_dvkd: val(row, col(KEYS.truong_dvkd)) || undefined,
      presales_sp: val(row, col(KEYS.presales_sp)) || undefined,
      nv_bdkd: val(row, col(KEYS.nv_bdkd)) || undefined,
      ks_lanh_dao_bdkd: val(row, col(KEYS.ks_lanh_dao_bdkd)) || undefined,
      phap_che: val(row, col(KEYS.phap_che)) || undefined,
      tckt: val(row, col(KEYS.tckt)) || undefined,
      ban_lanh_dao: val(row, col(KEYS.ban_lanh_dao)) || undefined,
      quan_tri_he_thong: val(row, col(KEYS.quan_tri_he_thong)) || undefined,
    });
    result.imported += 1;
  }

  return result;
}

export async function exportDigitalFeatureScreensToExcel(digitalFeatureId: number): Promise<ExcelJS.Buffer> {
  const items = await listDigitalFeatureScreens(digitalFeatureId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "backlog-manager";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Màn hình & Phân quyền");
  sheet.columns = DIGITAL_FEATURE_SCREEN_IMPORT_HEADERS.map((header) => ({
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
      item.ma_mh ?? "",
      item.tn ?? "",
      item.ten_man_hinh ?? "",
      item.loai ?? "",
      item.thanh_phan_chinh ?? "",
      item.hanh_dong ?? "",
      item.quy_tac_nghiep_vu ?? "",
      item.sales_am ?? "",
      item.truong_dvkd ?? "",
      item.presales_sp ?? "",
      item.nv_bdkd ?? "",
      item.ks_lanh_dao_bdkd ?? "",
      item.phap_che ?? "",
      item.tckt ?? "",
      item.ban_lanh_dao ?? "",
      item.quan_tri_he_thong ?? "",
    ]);
  });

  return workbook.xlsx.writeBuffer();
}
