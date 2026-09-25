// Xem ghi chú thiết kế đầy đủ ở migrations/actionLogs.ts.
export type ActionLogType = "dang_nhap" | "dang_xuat" | "tao_moi" | "cap_nhat" | "xoa" | "chuyen_du_lieu";

export const ACTION_LOG_TYPES: ActionLogType[] = [
  "dang_nhap",
  "dang_xuat",
  "tao_moi",
  "cap_nhat",
  "xoa",
  "chuyen_du_lieu",
];

export interface ActionLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  department_id: number | null;
  department_name: string | null;
  action: ActionLogType;
  module: string | null;
  description: string;
  method: string | null;
  path: string | null;
  ip: string | null;
  created_at: string;
}

// department_name KHÔNG truyền vào đây — recordActionLog() tự tra theo
// department_id (xem actionLog.service.ts) để chỗ gọi (middleware) không
// phải tự query thêm bảng departments.
export interface ActionLogInput {
  user_id: number | null;
  user_name: string | null;
  department_id: number | null;
  action: ActionLogType;
  module: string | null;
  description: string;
  method?: string | null;
  path?: string | null;
  ip?: string | null;
}

export interface ListActionLogsFilter {
  user_id?: number;
  action?: ActionLogType;
  module?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}
