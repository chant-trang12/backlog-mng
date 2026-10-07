import ExcelJS from "exceljs";
import { buildTemplateWorkbook, parseFirstSheet, pickColumn } from "./workbook.util.js";
import { createIncident } from "./incident.service.js";
import type { DataScope } from "./scope.util.js";
import type { CreateIncidentInput } from "../types/cskh.js";

// Header file mẫu import Sự cố — KHỚP CHÍNH XÁC các cột bảng dữ liệu trang
// Sự cố (24 cột, đúng thứ tự; "Thời gian gián đoạn." giữ dấu chấm cuối như
// file gốc user gửi). Không có cột Tháng/Team — import gán theo Tháng + Team
// chọn trong popup "Nhập Excel".
export const INCIDENT_IMPORT_HEADERS = [
  "Tạo bởi",
  "Dịch vụ do IDC quản lý hoặc đối tác",
  "Tên sự cố",
  "Hiện tượng",
  "Phạm vi sự cố và ảnh hưởng dịch vụ KH",
  "Nguyên nhân",
  "Hành động",
  "Thời Điểm Ghi Nhận Sự Cố",
  "Thời điểm hoàn thành xử lý sự cố",
  "Thời gian xử lý sự cố",
  "Gián đoạn dịch vụ KH",
  "Thời gian gián đoạn.",
  "Lý do không gián đoạn",
  "Dịch Vụ",
  "Nhóm dịch vụ",
  "Đơn vị chịu trách nhiệm về sự cố",
  "BU/Site chịu trách nhiệm về sự cố",
  "Cấp độ theo phạm vi ảnh hưởng đến KH",
  "Tình trạng",
  "Link Ticket",
  "Link ITSM",
  "Đánh giá SLA sự cố",
  "Đánh giá nguyên nhân sự cố",
  "Diễn giải lý do vượt SLA",
];

// Alias so khớp cột (so sánh sau normalizeHeader — bỏ dấu, lowercase): tên
// chuẩn + các biến thể thường gặp (có/không dấu chấm, viết khác).
const KEYS: Record<keyof Omit<CreateIncidentInput, "period_id" | "team_id">, string[]> = {
  tao_boi: ["Tạo bởi", "Tao boi"],
  dich_vu_idc: ["Dịch vụ do IDC quản lý hoặc đối tác", "Dich vu do IDC quan ly hoac doi tac"],
  ten_su_co: ["Tên sự cố", "Ten su co"],
  hien_tuong: ["Hiện tượng", "Hien tuong"],
  pham_vi_anh_huong: ["Phạm vi sự cố và ảnh hưởng dịch vụ KH", "Pham vi su co va anh huong dich vu KH"],
  nguyen_nhan: ["Nguyên nhân", "Nguyen nhan"],
  hanh_dong: ["Hành động", "Hanh dong"],
  thoi_diem_ghi_nhan: ["Thời Điểm Ghi Nhận Sự Cố", "Thời điểm ghi nhận sự cố", "Thoi diem ghi nhan su co"],
  thoi_diem_hoan_thanh: ["Thời điểm hoàn thành xử lý sự cố", "Thoi diem hoan thanh xu ly su co"],
  thoi_gian_xu_ly: ["Thời gian xử lý sự cố", "Thoi gian xu ly su co"],
  gian_doad_dich_vu: ["Gián đoạn dịch vụ KH", "Gian doan dich vu KH"],
  thoi_gian_gian_doad: ["Thời gian gián đoạn.", "Thời gian gián đoạn", "Thoi gian gian doan"],
  ly_do_khong_gian_doad: ["Lý do không gián đoạn", "Ly do khong gian doan"],
  dich_vu: ["Dịch Vụ", "Dich vu"],
  nhom_dich_vu: ["Nhóm dịch vụ", "Nhom dich vu"],
  don_vi_trach_nhiem: ["Đơn vị chịu trách nhiệm về sự cố", "Don vi chiu trach nhiem ve su co"],
  bu_site_trach_nhiem: ["BU/Site chịu trách nhiệm về sự cố", "BU/Site chiu trach nhiem ve su co"],
  cap_do_anh_huong: ["Cấp độ theo phạm vi ảnh hưởng đến KH", "Cap do theo pham vi anh huong den KH"],
  tinh_trang: ["Tình trạng", "Tinh trang"],
  link_ticket: ["Link Ticket"],
  link_itsm: ["Link ITSM"],
  danh_gia_sla: ["Đánh giá SLA sự cố", "Danh gia SLA su co"],
  danh_gia_nguyen_nhan: ["Đánh giá nguyên nhân sự cố", "Danh gia nguyen nhan su co"],
  dien_giai_vuot_sla: ["Diễn giải lý do vượt SLA", "Dien giai ly do vuot SLA"],
};

// 2 dòng ví dụ cho file mẫu.
const SAMPLE_ROWS: string[][] = [
  [
    "Nguyễn Văn A",
    "IDC quản lý",
    "Lỗi đăng nhập portal",
    "Không đăng nhập được portal",
    "50 khách hàng khu vực Hà Nội",
    "Chứng chỉ SSL hết hạn",
    "Cấp lại chứng chỉ, khởi động lại dịch vụ",
    "07/10/2026 08:30",
    "07/10/2026 10:00",
    "1 giờ 30 phút",
    "Có",
    "1 giờ",
    "",
    "Portal KH",
    "Portal",
    "Phòng CNTT",
    "BU Hà Nội",
    "Cấp 2",
    "Đã đóng",
    "https://ticket.example.com/12345",
    "https://itsm.example.com/inc/98765",
    "Đạt",
    "Lỗi kỹ thuật",
    "Không vượt SLA",
  ],
  [
    "Trần Thị B",
    "Đối tác",
    "Chậm đồng bộ dữ liệu",
    "Dữ liệu khách hàng cập nhật trễ 30 phút",
    "Toàn bộ khách hàng dùng dịch vụ đồng bộ",
    "Lỗi kết nối giữa hệ thống đối tác và IDC",
    "Liên hệ đối tác, xử lý kết nối",
    "08/10/2026 14:00",
    "08/10/2026 15:20",
    "1 giờ 20 phút",
    "Không",
    "",
    "Dịch vụ chạy song song, không ảnh hưởng truy cập",
    "Đồng bộ dữ liệu",
    "Dịch vụ dữ liệu",
    "Đối tác ABC",
    "BU Site X",
    "Cấp 3",
    "Đã đóng",
    "https://ticket.example.com/12346",
    "",
    "Đạt",
    "Lỗi kết nối",
    "Không vượt SLA",
  ],
];

export async function buildIncidentImportTemplate(): Promise<ExcelJS.Buffer> {
  return buildTemplateWorkbook(
    "Sự cố",
    INCIDENT_IMPORT_HEADERS.map((header) => ({ header, width: 24 })),
    SAMPLE_ROWS,
  );
}

// Chuỗi thời điểm trong file ("07/10/2026 08:30", "07/10/2026", ISO, hoặc
// dạng "yyyy-mm-dd hh:mm") về chuỗi lưu cột incidents "YYYY-MM-DDTHH:mm"
// (giờ local, cùng dạng <input type="datetime-local">). Không có giờ →
// mặc định 00:00. Không hiểu → trả chuỗi gốc (hiển thị nguyên văn).
function parseDateTimeToLocalStorage(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0"] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}`;
  }
  m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, d, mo, y, h = "0", mi = "0"] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}`;
  }
  return t;
}

const DATETIME_KEYS = new Set(["thoi_diem_ghi_nhan", "thoi_diem_hoan_thanh"]);

export async function importIncidentsFromWorkbook(
  buffer: Buffer,
  periodId: number,
  teamId: number,
  scope: DataScope,
): Promise<{ imported: number; skipped: { row: number; label: string; reason: string }[] }> {
  // dateWithTime: ô Excel kiểu Date giữ cả giờ:phút (cột thời điểm sự cố).
  let parsed;
  try {
    parsed = await parseFirstSheet(buffer, { dateWithTime: true });
  } catch {
    throw new Error("File không đúng định dạng Excel (.xlsx) — hãy tải file mẫu rồi điền theo đúng cột");
  }
  const { headers, rows } = parsed;
  if (headers.length === 0) {
    throw new Error('File trống hoặc thiếu dòng tiêu đề — hãy tải file mẫu rồi điền theo đúng cột');
  }
  const tenSuCoCol = pickColumn(headers, KEYS.ten_su_co);
  if (!tenSuCoCol) {
    throw new Error('Không tìm thấy cột "Tên sự cố" trong file — hãy tải file mẫu rồi điền theo đúng cột');
  }

  const columns: Record<string, string | undefined> = {};
  for (const key of Object.keys(KEYS) as Array<keyof typeof KEYS>) {
    columns[key] = pickColumn(headers, KEYS[key]);
  }

  const result = { imported: 0, skipped: [] as { row: number; label: string; reason: string }[] };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // dòng 1 là tiêu đề
    const ten = (row[tenSuCoCol] ?? "").trim();
    if (!ten) {
      result.skipped.push({ row: rowNo, label: "", reason: 'Thiếu "Tên sự cố"' });
      continue;
    }
    try {
      const input: CreateIncidentInput = { period_id: periodId, team_id: teamId, ten_su_co: ten };
      for (const key of Object.keys(KEYS) as Array<keyof typeof KEYS>) {
        if (key === "ten_su_co") continue;
        const col = columns[key];
        const value = col ? (row[col] ?? "").trim() : "";
        input[key] = DATETIME_KEYS.has(key)
          ? parseDateTimeToLocalStorage(value) || null
          : value || null;
      }
      await createIncident(input, scope);
      result.imported += 1;
    } catch (err) {
      result.skipped.push({
        row: rowNo,
        label: ten,
        reason: err instanceof Error ? err.message : "Lỗi không xác định",
      });
    }
  }
  return result;
}
