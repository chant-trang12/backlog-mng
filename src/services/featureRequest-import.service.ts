import type ExcelJS from "exceljs";
import { createFeatureRequest, isDuplicateTieuDe, listActiveTieuDeIndex, normalizeTieuDe } from "./featureRequest.service.js";
import { listDepartments } from "./department.service.js";
import { buildTemplateWorkbook, normalizeHeader, parseDateToIso, parseFirstSheet, pickColumn } from "./workbook.util.js";
import { isDepartmentInScope, type DataScope } from "./scope.util.js";

// ===== Import Excel "Yêu cầu tính năng" theo biểu mẫu Quy trình số hóa =====
// 20 cột (kể cả STT — chỉ để đánh số, bỏ qua khi import).
// Mapping với cột dữ liệu hiện có (trùng thì GỘP LẠI 1, không tạo cột mới):
//   "Tiêu đề"                             -> feature_requests.tieu_de
//                                            (bắt buộc ở DB — nếu trống tự
//                                            lấy từ Hoạt động/Đề xuất/Mô tả)
//   "Phòng ban thực hiện"                 -> feature_requests.target_department_id
//                                            (CHÍNH LÀ "Phòng ban đích" của
//                                            form — khớp theo tên/mã phòng;
//                                            dòng trống cột này thì fallback
//                                            về phòng đang xem của người
//                                            import ?department_id, khớp
//                                            logic cũ "phòng import = phòng đích")
//   "Mô tả từng bước đang thực hiện"      -> feature_requests.mo_ta
//   "Hệ thống cần cải tiến (nếu có)"      -> feature_requests.he_thong
//   "Ưu tiên"                             -> feature_requests.do_uu_tien
//   "Đơn vị đề xuất"                      -> feature_requests.department_id
//                                            (khớp theo tên/mã phòng ban)
//   "Nhân sự đầu mối"                     -> feature_requests.nguoi_de_xuat
//   "Ghi chú"                             -> feature_requests.ghi_chu_xu_ly
//   "Thời gian mong muốn thực hiện"       -> feature_requests.thoi_gian_mong_muon
//                                            (trước đây cột này là "Quy trình
//                                            hiện" — đã đổi tên theo yêu cầu,
//                                            map vào trường date của form
//                                            Thêm mới yêu cầu)
// Các cột còn lại là trường mới (linh_vuc, mang, hoat_dong_nghiep_vu, ...).
// Các cột còn lại là trường mới (linh_vuc, mang, hoat_dong_nghiep_vu, ...).
export const FEATURE_REQUEST_IMPORT_HEADERS = [
  "STT",
  "Tiêu đề",
  "Lĩnh Vực",
  "Mảng",
  "Hoạt động/nghiệp vụ",
  "Quy trình số hóa",
  "Mã quy trình",
  "Bước số hóa",
  "Mô tả từng bước đang thực hiện",
  "Vấn đề tồn tại",
  "Hệ thống cần cải tiến (nếu có)",
  "Đề xuất quy trình/nghiệp vụ",
  "Hiệu quả khi thực hiện",
  "Thời gian mong muốn thực hiện",
  "Kế hoạch software",
  "Kết quả mong muốn",
  "Ưu tiên",
  "Đơn vị đề xuất",
  "Phòng ban thực hiện",
  "Nhân sự đầu mối",
  "Ghi chú",
] as const;

export const PRIORITIES = ["Thấp", "Trung bình", "Cao", "Khẩn cấp"];

const KEYS = {
  tieu_de: ["tieu de"],
  linh_vuc: ["linh vuc"],
  mang: ["mang"],
  hoat_dong: ["hoat dong/nghiep vu", "hoat dong nghiep vu", "hoat dong", "nghiep vu"],
  quy_trinh_so_hoa: ["quy trinh so hoa"],
  ma_quy_trinh: ["ma quy trinh"],
  buoc_so_hoa: ["buoc so hoa"],
  mo_ta: ["mo ta tung buoc dang thuc hien", "mo ta tung buoc", "mo ta", "mo ta chi tiet"],
  van_de_ton_tai: ["van de ton tai"],
  he_thong: ["he thong can cai tien (neu co)", "he thong can cai tien neu co", "he thong can cai tien", "he thong"],
  de_xuat: ["de xuat quy trinh/nghiep vu", "de xuat quy trinh nghiep vu", "de xuat quy trinh"],
  hieu_qua: ["hieu qua khi thuc hien", "hieu qua"],
  thoi_gian: ["thoi gian mong muon thuc hien", "thoi gian mong muon"],
  ke_hoach_software: ["ke hoach software", "ke hoach phan mem"],
  ket_qua: ["ket qua mong muon", "ket qua"],
  uu_tien: ["uu tien", "do uu tien"],
  don_vi: ["don vi de xuat", "don vi", "phong ban de xuat"],
  phong_ban_thuc_hien: ["phong ban thuc hien", "phong ban dich"],
  dau_moi: ["nhan su dau moi", "nguoi de xuat"],
  ghi_chu: ["ghi chu"],
};

export interface ImportFeatureRequestsResult {
  imported: number;
  skipped: { row: number; label: string; reason: string }[];
}

export function buildFeatureRequestImportTemplate(opts?: {
  departments?: string[];
  heThong?: string[];
}): Promise<ExcelJS.Buffer> {
  const departments = opts?.departments ?? [];
  const heThong = opts?.heThong ?? [];
  return buildTemplateWorkbook(
    "Yêu cầu tính năng",
    FEATURE_REQUEST_IMPORT_HEADERS.map((header) => ({
      header,
      width: header === "STT" ? 6 : header === "Tiêu đề" ? 30 : Math.min(42, Math.max(14, header.length + 4)),
    })),
    [
      [
        1,
        "Trình ký văn bản điện tử",
        "Hành chính",
        "Văn bản - Quản lý điều hành",
        "Soạn thảo, trình ký và phát hành công văn",
        "Có",
        "QT-HC-01",
        "Trình ký điện tử",
        "Văn thư soạn công văn trên Word, in bản cứng, xin chữ ký thủ công qua từng phòng, sau đó scan lưu hồ sơ.",
        "Mất thời gian luân chuyển bản cứng, khó tra cứu lịch sử trình ký.",
        heThong[0] ?? "Website nội bộ",
        "Trình ký trực tuyến trên hệ thống, lưu vết từng bước tự động.",
        "Giảm 70% thời gian trình ký, tra cứu hồ sơ ngay lập tức.",
        "06/10/2026",
        "Nâng cấp module văn bản trên website nội bộ",
        "Công văn ký điện tử ngay trên hệ thống, tra cứu được lịch sử ký.",
        "Cao",
        departments[0] ?? "Phòng Công nghệ thông tin",
        departments[0] ?? "Phòng Công nghệ thông tin",
        "Nguyễn Văn A",
        "",
      ],
      [
        2,
        "Tiếp nhận yêu cầu CSKH trực tuyến",
        "Kinh doanh",
        "Chăm sóc khách hàng",
        "Tiếp nhận và phân loại yêu cầu hỗ trợ từ khách hàng",
        "Một phần",
        "QT-KD-05",
        "Tiếp nhận yêu cầu",
        "Nhân viên tổng đài nghe phone, ghi yêu cầu vào sổ tay rồi chuyển email cho bộ phận phù hợp.",
        "Yêu cầu bị bỏ sót, không theo dõi được tiến độ xử lý.",
        "",
        "Form nhập yêu cầu trực tuyến, tự động điều phối theo loại yêu cầu.",
        "Không bỏ sót yêu cầu, đo được thời gian xử lý trung bình.",
        "20/01/2027",
        "Tích hợp vào app CSKH hiện có",
        "Yêu cầu khách hàng được ghi nhận tự động, không bỏ sót.",
        "Trung bình",
        departments[1] ?? "Phòng Vận hành",
        departments[0] ?? "Phòng Công nghệ thông tin",
        "Trần Thị B",
        "",
      ],
    ],
    [
      { column: 11, options: heThong }, // Hệ thống cần cải tiến (nếu có) — danh mục Cấu hình > Hệ thống
      { column: 17, options: [...PRIORITIES] }, // Ưu tiên
      { column: 18, options: departments }, // Đơn vị đề xuất
      { column: 19, options: departments }, // Phòng ban thực hiện = Phòng ban đích
    ],
  );
}

export async function importFeatureRequestsFromWorkbook(
  buffer: Buffer,
  targetDepartmentId: number | null | undefined,
  // Quy tắc 9.2 — phạm vi của người import (fix IDOR: từng dòng chỉ được
  // ghi vào hộp thư của phòng nằm trong phạm vi; "Đơn vị đề xuất" của tài
  // khoản bị giới hạn cũng bị ép về đúng phòng của họ, không tin cột trong
  // file). Mặc định UNRESTRICTED cho caller cũ không truyền (test...).
  scope: DataScope = { all: true, departmentId: null },
): Promise<ImportFeatureRequestsResult> {
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
  const donViCol = col("don_vi");
  if (!donViCol) {
    throw new Error('Không tìm thấy cột "Đơn vị đề xuất" trong file — tải file mẫu để đúng định dạng.');
  }

  // Khớp "Đơn vị đề xuất" với danh mục phòng ban: so khớp tên (bỏ dấu,
  // không phân biệt hoa thường) hoặc mã phòng (CNTT, VH...). Không tự tạo
  // phòng ban mới — dòng không khớp được sẽ bị bỏ qua kèm lý do.
  const departments = await listDepartments();
  const deptByKey = new Map<string, number>();
  for (const d of departments) {
    deptByKey.set(normalizeHeader(d.name), d.id);
    if (d.code) deptByKey.set(normalizeHeader(d.code), d.id);
  }

  const result: ImportFeatureRequestsResult = { imported: 0, skipped: [] };
  const val = (row: Record<string, string>, c: string | undefined) => (c ? (row[c] ?? "").trim() : "");

  // Chống trùng Tiêu đề: nạp các tiêu đề đang hiển thị (chưa xóa) 1 lần, và
  // bổ sung dần tiêu đề của các dòng đã nhập trong lần import này — dòng
  // trùng (kể cả trùng trong file) bị bỏ qua kèm lý do.
  const titleIndex = await listActiveTieuDeIndex();

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2;
    const row = rows[i];
    const hoatDong = val(row, col("hoat_dong"));
    const deXuat = val(row, col("de_xuat"));
    const moTa = val(row, col("mo_ta"));
    const label = hoatDong || deXuat || moTa.slice(0, 60);

    const donVi = val(row, donViCol);
    let deptId = donVi ? deptByKey.get(normalizeHeader(donVi)) : undefined;
    if (!deptId) {
      result.skipped.push({
        row: rowNo,
        label,
        reason: donVi
          ? `Không tìm thấy "Đơn vị đề xuất: ${donVi}" trong danh mục phòng ban`
          : "Thiếu Đơn vị đề xuất",
      });
      continue;
    }

    // Fix IDOR: tài khoản bị giới hạn 1 phòng luôn là "Đơn vị đề xuất" của
    // chính mình — bỏ qua giá trị trong file (không thể giả mạo phòng khác).
    if (!scope.all) deptId = scope.departmentId ?? undefined;

    // "Phòng ban thực hiện" = Phòng ban đích (target_department_id): dòng có
    // điền thì khớp theo tên/mã phòng (sai thì bỏ qua kèm lý do — giống Đơn
    // vị đề xuất); dòng TRỐNG thì fallback về phòng đang xem của người
    // import (targetDepartmentId) — giữ đúng logic "phòng import = phòng
    // đích" cho file cũ không có cột này.
    const phongBanThucHien = val(row, col("phong_ban_thuc_hien"));
    let targetId = targetDepartmentId ?? null;
    if (phongBanThucHien) {
      const matchedTarget = deptByKey.get(normalizeHeader(phongBanThucHien));
      if (!matchedTarget) {
        result.skipped.push({
          row: rowNo,
          label,
          reason: `Không tìm thấy "Phòng ban thực hiện: ${phongBanThucHien}" trong danh mục phòng ban`,
        });
        continue;
      }
      targetId = matchedTarget;
    }
    // Fix IDOR: dòng chỉ ra phòng đích ngoài phạm vi của người import thì
    // bỏ qua — không ghi yêu cầu vào hộp thư của phòng khác.
    if (!isDepartmentInScope(scope, targetId)) {
      result.skipped.push({
        row: rowNo,
        label,
        reason: `Phòng ban thực hiện không nằm trong phạm vi phòng ban của bạn`,
      });
      continue;
    }
    if (!label) {
      result.skipped.push({ row: rowNo, label: "", reason: "Thiếu Hoạt động/nghiệp vụ, Mô tả và Đề xuất" });
      continue;
    }

    // Tiêu đề (bắt buộc ở DB) — lấy từ cột "Tiêu đề"; nếu trống tự lấy từ
    // Hoạt động/nghiệp vụ, fallback Đề xuất/Mô tả (cắt 200 ký tự).
    const tieuDe = (val(row, col("tieu_de")) || hoatDong || deXuat || moTa).slice(0, 200);

    // Trùng Tiêu đề (với yêu cầu đang có HOẶC với dòng đã nhập trước đó
    // trong cùng file) -> bỏ qua dòng này, không thêm trùng.
    if (isDuplicateTieuDe(titleIndex, tieuDe, {
      departmentId: deptId ?? null,
      targetDepartmentId: targetId ?? null,
    })) {
      result.skipped.push({
        row: rowNo,
        label,
        reason: `Trùng Tiêu đề với yêu cầu đã có trong bảng dữ liệu`,
      });
      continue;
    }
    titleIndex.push({
      norm: normalizeTieuDe(tieuDe),
      departmentId: deptId ?? null,
      targetDepartmentId: targetId ?? null,
    });

    const rawPriority = val(row, col("uu_tien"));
    const priority = PRIORITIES.find((p) => p.toLowerCase() === rawPriority.toLowerCase());

    await createFeatureRequest({
      // "Hệ thống cần cải tiến (nếu có)" — cột "(nếu có)" nên để trống được
      // ("" thỏa NOT NULL); hiển thị "—" ở bảng, gán sau qua Sửa nếu cần.
      he_thong: val(row, col("he_thong")),
      tieu_de: tieuDe,
      mo_ta: moTa || undefined,
      department_id: deptId,
      target_department_id: targetId,
      nguoi_de_xuat: val(row, col("dau_moi")) || undefined,
      do_uu_tien: priority ?? "Trung bình",
      linh_vuc: val(row, col("linh_vuc")) || undefined,
      mang: val(row, col("mang")) || undefined,
      hoat_dong_nghiep_vu: hoatDong || undefined,
      quy_trinh_so_hoa: val(row, col("quy_trinh_so_hoa")) || undefined,
      ma_quy_trinh: val(row, col("ma_quy_trinh")) || undefined,
      buoc_so_hoa: val(row, col("buoc_so_hoa")) || undefined,
      van_de_ton_tai: val(row, col("van_de_ton_tai")) || undefined,
      de_xuat_quy_trinh: deXuat || undefined,
      hieu_qua_khi_thuc_hien: val(row, col("hieu_qua")) || undefined,
      // Ô ngày có thể là Date (cellToText về "dd/mm/yyyy") hoặc người dùng
      // gõ tay — parseDateToIso chuẩn hóa hết về "YYYY-MM-DD" khớp input
      // type=date của form Thêm mới; không parse được thì bỏ qua.
      thoi_gian_mong_muon: parseDateToIso(val(row, col("thoi_gian"))) || undefined,
      ke_hoach_software: val(row, col("ke_hoach_software")) || undefined,
      // Kết quả mong muốn — trường DoD khi Đưa vào Backlog/Roadmap (xem
      // linkFeatureRequestToBacklog/linkFeatureRequestToRoadmap), nên cho
      // nhập được từ file thay vì chỉ có ở form.
      ket_qua_mong_muon: val(row, col("ket_qua")) || undefined,
      ghi_chu_xu_ly: val(row, col("ghi_chu")) || undefined,
    });
    result.imported += 1;
  }

  return result;
}
