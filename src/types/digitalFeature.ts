export interface DigitalFeature {
  id: number;
  ma: string | null;
  module: string;
  don_vi_chu_tri: string | null;
  don_vi_phoi_hop: string | null;
  giai_doan: string | null;
  tn_mh: string | null;
  muc_tieu_nghiep_vu: string | null;
  vai_tro_pbdkd: string | null;
  nhan_dau_vao_tu: string | null;
  chuyen_dau_ra_toi: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CreateDigitalFeatureInput = Partial<Omit<DigitalFeature, "id" | "created_at" | "updated_at">> & {
  module: string;
};

export type UpdateDigitalFeatureInput = Partial<Omit<DigitalFeature, "id" | "created_at" | "updated_at">>;

/** Bộ lọc danh sách (dùng cho cả API list lẫn xuất Excel). */
export interface DigitalFeatureFilters {
  search?: string;
  module?: string;
  giai_doan?: string;
  tn_mh?: string;
  don_vi_chu_tri?: string;
}

// ===== Màn hình, Tính năng & Phân quyền (tab 2 màn hình chi tiết) =====

export interface DigitalFeatureScreen {
  id: number;
  digital_feature_id: number;
  ma_mh: string | null;
  tn: string | null;
  ten_man_hinh: string;
  loai: string | null;
  thanh_phan_chinh: string | null;
  hanh_dong: string | null;
  quy_tac_nghiep_vu: string | null;
  sales_am: string | null;
  truong_dvkd: string | null;
  presales_sp: string | null;
  nv_bdkd: string | null;
  ks_lanh_dao_bdkd: string | null;
  phap_che: string | null;
  tckt: string | null;
  ban_lanh_dao: string | null;
  quan_tri_he_thong: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CreateDigitalFeatureScreenInput = Partial<
  Omit<DigitalFeatureScreen, "id" | "digital_feature_id" | "created_at" | "updated_at">
> & {
  digital_feature_id: number;
  ten_man_hinh: string;
};

export type UpdateDigitalFeatureScreenInput = Partial<
  Omit<DigitalFeatureScreen, "id" | "digital_feature_id" | "created_at" | "updated_at">
>;

// ===== Danh mục (Master Data) của Module (tab 3 màn hình chi tiết) =====

export interface DigitalFeatureMasterData {
  id: number;
  digital_feature_id: number;
  ma_danh_muc: string | null;
  ten_danh_muc: string;
  noi_dung_thuoc_tinh: string | null;
  quan_tri_boi: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CreateDigitalFeatureMasterDataInput = Partial<
  Omit<DigitalFeatureMasterData, "id" | "digital_feature_id" | "created_at" | "updated_at">
> & {
  digital_feature_id: number;
  ten_danh_muc: string;
};

export type UpdateDigitalFeatureMasterDataInput = Partial<
  Omit<DigitalFeatureMasterData, "id" | "digital_feature_id" | "created_at" | "updated_at">
>;
