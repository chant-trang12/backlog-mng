// ---- Cấu hình: Tiêu chí (dùng chung mọi tháng backlog) ----
// Cột điểm chuẩn theo team lấy theo state.teams của tháng đang chọn (map
// theo team_name) — đổi tháng thì render lại (renderTieuChi gọi từ
// loadTeams), không cần tải lại dữ liệu tiêu chí.

async function loadTieuChi() {
  state.tieuChiConfigs = await api(`/api/tieu-chi${deptParam("?")}`);
  renderTieuChi();
  renderHomeDashboard();
}

function renderTieuChi() {
  if (!el.tieuChiTbody) return;
  const teamNames = state.teams.map((t) => t.name);

  // Dựng lại header (cột team) theo đúng team của tháng đang chọn.
  const teamHeaderCells = teamNames.map((name) => `<th style="min-width:100px">${name}</th>`).join("");
  el.tieuChiTheadRow.innerHTML = `
    <th style="min-width:140px">Nhóm</th>
    <th style="min-width:180px">Tiêu chí</th>
    <th style="min-width:280px">Cách tính điểm</th>
    <th style="min-width:130px">Phạm vi</th>
    ${teamHeaderCells}
    <th style="min-width:170px"></th>`;

  el.tieuChiEmpty.hidden = state.tieuChiConfigs.length > 0;

  el.tieuChiTbody.innerHTML = state.tieuChiConfigs
    .map((c) => {
      const diemChuanByTeam = new Map(c.diem_chuan.map((d) => [d.team_name, d]));
      const mainCells = teamNames
        .map((name) => {
          const value = diemChuanByTeam.get(name)?.diem_chuan ?? "";
          return `<td><input class="inline-cell-input tieuchi-diem-chuan-input" data-tieu-chi-id="${c.id}" data-team="${name}" value="${value}" /></td>`;
        })
        .join("");
      // Phạm vi: department_id null = tiêu chí dùng chung mọi phòng; có giá
      // trị = tiêu chí riêng — vì listTieuChiConfigs() chỉ trả về tiêu chí
      // riêng của ĐÚNG phòng đang xem nên ở đây luôn là "của phòng này".
      const scopeBadge =
        c.department_id == null
          ? `<span class="status-badge status-default">Dùng chung</span>`
          : `<span class="status-badge tieuchi-scope-rieng">Riêng phòng này</span>`;
      const mainRow = `
    <tr data-id="${c.id}">
      <td><span class="status-badge ${nhomColorClass(c.nhom)}">${c.nhom}</span></td>
      <td>${c.ten_tieu_chi}</td>
      <td style="white-space:pre-wrap">${c.cach_tinh_diem ?? ""}</td>
      <td>${scopeBadge}</td>
      ${mainCells}
      <td><div class="actions-cell">
        <button class="small btn-edit edit-tieuchi-btn">Sửa</button>
        <button class="small btn-delete delete-tieuchi-btn">Xóa</button>
      </div></td>
    </tr>`;

      if (!c.co_chi_tieu) return mainRow;

      const chiTieuCells = teamNames
        .map((name) => {
          const value = diemChuanByTeam.get(name)?.chi_tieu ?? "";
          return `<td><input class="inline-cell-input tieuchi-chi-tieu-input" data-tieu-chi-id="${c.id}" data-team="${name}" value="${value}" /></td>`;
        })
        .join("");
      const chiTieuRow = `
    <tr class="tieuchi-chitieu-row" data-id="${c.id}">
      <td colspan="4"><em>Chỉ tiêu</em></td>
      ${chiTieuCells}
      <td></td>
    </tr>`;
      return mainRow + chiTieuRow;
    })
    .join("");

  // Hàng Tổng điểm — tự động cộng tổng cột Điểm chuẩn (không tính dòng Chỉ
  // tiêu) của tất cả tiêu chí theo từng team, không cho nhập tay.
  const tongDiemCells = teamNames
    .map((name) => {
      const total = state.tieuChiConfigs.reduce((sum, c) => {
        const raw = c.diem_chuan.find((d) => d.team_name === name)?.diem_chuan;
        const n = Number(raw);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      return `<td style="font-weight:600">${total}</td>`;
    })
    .join("");
  el.tieuChiTongDiemRow.innerHTML = `
    <td colspan="4" style="font-weight:600">Tổng điểm</td>
    ${tongDiemCells}
    <td></td>`;

  el.tieuChiTbody.querySelectorAll(".tieuchi-diem-chuan-input, .tieuchi-chi-tieu-input").forEach((input) => {
    input.addEventListener("change", () => saveTieuChiDiemChuan(input.dataset.tieuChiId, input.dataset.team));
  });

  el.tieuChiTbody.querySelectorAll(".edit-tieuchi-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTieuChiDialog(state.tieuChiConfigs.find((c) => c.id === id));
    });
  });
  el.tieuChiTbody.querySelectorAll(".delete-tieuchi-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa tiêu chí này? Toàn bộ điểm chuẩn đã cấu hình cho tiêu chí này cũng sẽ bị xóa.")) return;
      try {
        await api(`/api/tieu-chi/${id}`, { method: "DELETE" });
        await loadTieuChi();
        showToast("Đã xóa tiêu chí.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Đọc giá trị hiện tại của cả 2 ô (Điểm chuẩn + Chỉ tiêu nếu có) cho đúng 1
// cặp (tiêu chí, team) rồi lưu cùng lúc — API upsert theo cặp giá trị.
async function saveTieuChiDiemChuan(tieuChiId, teamName) {
  const diemChuanInput = el.tieuChiTbody.querySelector(
    `.tieuchi-diem-chuan-input[data-tieu-chi-id="${tieuChiId}"][data-team="${teamName}"]`,
  );
  const chiTieuInput = el.tieuChiTbody.querySelector(
    `.tieuchi-chi-tieu-input[data-tieu-chi-id="${tieuChiId}"][data-team="${teamName}"]`,
  );
  try {
    const updated = await api(`/api/tieu-chi/${tieuChiId}/diem-chuan${deptParam("?")}`, {
      method: "PUT",
      body: JSON.stringify({
        team_name: teamName,
        diem_chuan: diemChuanInput?.value.trim() || undefined,
        chi_tieu: chiTieuInput?.value.trim() || undefined,
      }),
    });
    // Cập nhật lại state cục bộ để hàng Tổng điểm tính lại ngay, không cần
    // tải lại toàn bộ danh sách tiêu chí.
    const index = state.tieuChiConfigs.findIndex((c) => c.id === Number(tieuChiId));
    if (index !== -1) state.tieuChiConfigs[index] = updated;
    renderTieuChi();
    renderHomeDashboard();
  } catch (err) {
    showToast(err.message);
  }
}

function openTieuChiDialog(config) {
  el.tieuChiForm.reset();
  document.getElementById("tc-id").value = config?.id ?? "";
  el.tieuChiDialogTitle.textContent = config ? "Sửa tiêu chí" : "Thêm tiêu chí";

  const nhomSelect = document.getElementById("tc-nhom");
  nhomSelect.innerHTML = state.nhomOptions.map((n) => `<option value="${n.ten_nhom}">${n.ten_nhom}</option>`).join("");
  nhomSelect.value = config?.nhom ?? state.nhomOptions[0]?.ten_nhom ?? "";
  document.getElementById("tc-ten").value = config?.ten_tieu_chi ?? "";
  document.getElementById("tc-cach-tinh").value = config?.cach_tinh_diem ?? "";
  document.getElementById("tc-co-chi-tieu").checked = Boolean(config?.co_chi_tieu);
  // Thêm mới: mặc định KHÔNG dùng chung (riêng phòng đang xem) — dùng chung
  // là hành động chủ động, không phải mặc định. Sửa: giữ đúng phạm vi hiện
  // có của tiêu chí đó.
  document.getElementById("tc-dung-chung").checked = config ? config.department_id == null : false;

  el.tcKieuTinh.innerHTML = TIEU_CHI_KIEU_TINH.map((k) => `<option value="${k.value}">${k.label}</option>`).join("");
  el.tcNguon.innerHTML = TIEU_CHI_NGUON_DU_LIEU.map((n) => `<option value="${n.value}">${n.label}</option>`).join("");
  el.tcKieuTinh.value = config?.kieu_tinh ?? "khong_tinh";
  el.tcNguon.value = config?.nguon_du_lieu ?? TIEU_CHI_NGUON_DU_LIEU[0].value;
  el.tcHeSo.value = config?.he_so ?? "";
  updateTieuChiKieuTinhFields();

  el.tieuChiDialog.showModal();
}

// Ẩn/hiện "Nguồn dữ liệu"/"Hệ số" theo đúng kiểu tính đang chọn — không
// phải kiểu nào cũng cần cả 2 (VD "Không tính" thì ẩn hết).
function updateTieuChiKieuTinhFields() {
  const kieu = TIEU_CHI_KIEU_TINH.find((k) => k.value === el.tcKieuTinh.value) ?? TIEU_CHI_KIEU_TINH[0];
  el.tcNguonRow.hidden = !kieu.needsNguon;
  el.tcHeSoWrap.hidden = !kieu.needsHeSo;
  el.tcKieuTinhHint.textContent = kieu.hint;
}
el.tcKieuTinh.addEventListener("change", updateTieuChiKieuTinhFields);

el.addTieuChiBtn.addEventListener("click", () => openTieuChiDialog(null));
el.tieuChiCancelBtn.addEventListener("click", () => el.tieuChiDialog.close());
el.tieuChiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("tc-id").value;
  const kieu = TIEU_CHI_KIEU_TINH.find((k) => k.value === el.tcKieuTinh.value) ?? TIEU_CHI_KIEU_TINH[0];
  const payload = {
    nhom: document.getElementById("tc-nhom").value.trim(),
    ten_tieu_chi: document.getElementById("tc-ten").value.trim(),
    cach_tinh_diem: document.getElementById("tc-cach-tinh").value.trim() || undefined,
    co_chi_tieu: document.getElementById("tc-co-chi-tieu").checked,
    dung_chung: document.getElementById("tc-dung-chung").checked,
    department_id: state.currentDepartmentId,
    kieu_tinh: kieu.value,
    nguon_du_lieu: kieu.needsNguon ? el.tcNguon.value : null,
    he_so: kieu.needsHeSo && el.tcHeSo.value.trim() !== "" ? Number(el.tcHeSo.value) : null,
  };
  try {
    if (id) {
      await api(`/api/tieu-chi/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.tieuChiDialog.close();
      await loadTieuChi();
      showToast("Đã cập nhật tiêu chí.", "success");
    } else {
      await api("/api/tieu-chi", { method: "POST", body: JSON.stringify(payload) });
      el.tieuChiDialog.close();
      await loadTieuChi();
      showToast("Đã thêm tiêu chí.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// Sao chép tiêu chí từ 1 phòng khác thành tiêu chí riêng của phòng đang
// xem — bộ khởi điểm nhanh cho phòng có tiêu chí "gần giống" phòng khác.
el.cloneTieuChiBtn.addEventListener("click", () => {
  const fromSelect = document.getElementById("clone-tieuchi-from");
  const others = state.departments.filter((d) => d.id !== state.currentDepartmentId);
  if (others.length === 0) {
    showToast("Chưa có phòng ban nào khác để sao chép tiêu chí.");
    return;
  }
  fromSelect.innerHTML = others.map((d) => `<option value="${d.id}">${d.name}</option>`).join("");
  el.cloneTieuChiDialog.showModal();
});
el.cloneTieuChiCancelBtn.addEventListener("click", () => el.cloneTieuChiDialog.close());
el.cloneTieuChiForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fromDepartmentId = Number(document.getElementById("clone-tieuchi-from").value);
  try {
    const result = await api("/api/tieu-chi/clone", {
      method: "POST",
      body: JSON.stringify({ from_department_id: fromDepartmentId, to_department_id: state.currentDepartmentId }),
    });
    el.cloneTieuChiDialog.close();
    await loadTieuChi();
    showToast(
      result.cloned > 0 ? `Đã sao chép ${result.cloned} tiêu chí.` : "Không có tiêu chí mới để sao chép (đã có sẵn hết).",
      "success",
    );
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình: Ranking team ----
// Bảng tự do: hàng = vị trí xếp hạng, cột = kịch bản xếp hạng (VD "Rank",
// "Rank gần cuối", "Rank cuối") — cho phép thêm/xóa cả hàng và cột.

async function loadRanking() {
  state.rankingConfig = await api("/api/ranking-config");
  renderRanking();
}

function renderRanking() {
  if (!el.rankingTbody) return;
  const { rows, columns, cells } = state.rankingConfig;
  const cellByKey = new Map(cells.map((c) => [`${c.vi_tri}:${c.column_id}`, c.gia_tri]));

  const columnHeaderCells = columns
    .map(
      (col) => `
    <th data-column-id="${col.id}">
      <div class="ranking-column-header">
        <input class="ranking-column-name-input" data-column-id="${col.id}" value="${col.ten_cot}" />
        <span class="pill-x delete-ranking-column-btn" data-column-id="${col.id}" title="Xóa cột">×</span>
      </div>
    </th>`,
    )
    .join("");
  el.rankingTheadRow.innerHTML = `<th style="width:140px;text-align:center">Ranking Team</th>${columnHeaderCells}`;

  el.rankingEmpty.hidden = rows.length > 0;

  el.rankingTbody.innerHTML = rows
    .map((viTri) => {
      const rowCells = columns
        .map((col) => {
          const value = cellByKey.get(`${viTri}:${col.id}`) ?? "";
          return `<td><input class="inline-cell-input ranking-cell-input" data-vi-tri="${viTri}" data-column-id="${col.id}" value="${value}" /></td>`;
        })
        .join("");
      return `
    <tr data-vi-tri="${viTri}">
      <td>
        <div class="row" style="justify-content:center;flex-wrap:nowrap;gap:6px">
          <span>${viTri}</span>
          <span class="pill-x delete-ranking-row-btn" data-vi-tri="${viTri}" title="Xóa dòng">×</span>
        </div>
      </td>
      ${rowCells}
    </tr>`;
    })
    .join("");

  el.rankingTheadRow.querySelectorAll(".ranking-column-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await api(`/api/ranking-config/columns/${input.dataset.columnId}`, {
          method: "PUT",
          body: JSON.stringify({ ten_cot: input.value.trim() }),
        });
        const col = state.rankingConfig.columns.find((c) => c.id === Number(input.dataset.columnId));
        if (col) col.ten_cot = input.value.trim();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.rankingTheadRow.querySelectorAll(".delete-ranking-column-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa cột này? Toàn bộ giá trị đã nhập trong cột sẽ bị xóa.")) return;
      try {
        await api(`/api/ranking-config/columns/${btn.dataset.columnId}`, { method: "DELETE" });
        await loadRanking();
        showToast("Đã xóa cột.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  el.rankingTbody.querySelectorAll(".delete-ranking-row-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa dòng xếp hạng này?")) return;
      try {
        await api(`/api/ranking-config/rows/${btn.dataset.viTri}`, { method: "DELETE" });
        await loadRanking();
        showToast("Đã xóa dòng.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.rankingTbody.querySelectorAll(".ranking-cell-input").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await api("/api/ranking-config/cells", {
          method: "PUT",
          body: JSON.stringify({
            vi_tri: Number(input.dataset.viTri),
            column_id: Number(input.dataset.columnId),
            gia_tri: input.value.trim() || undefined,
          }),
        });
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addRankingRowBtn.addEventListener("click", async () => {
  try {
    await api("/api/ranking-config/rows", { method: "POST" });
    await loadRanking();
  } catch (err) {
    showToast(err.message);
  }
});
el.addRankingColumnBtn.addEventListener("click", async () => {
  try {
    await api("/api/ranking-config/columns", {
      method: "POST",
      body: JSON.stringify({ ten_cot: "Cột mới" }),
    });
    await loadRanking();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình: Tag & Phân loại ----
// Danh mục dùng ở form nhập task Backlog (select Tag, checkbox Phân loại) và
// bộ lọc — thay cho danh sách cố định cứng trước đây. Đổi ở đây ảnh hưởng
// ngay lập tức tới màu badge, dropdown/checkbox nhập task, bộ lọc Backlog, và
// các cột theo Tag ở Home (renderHomeCompletionRateTable/renderHomeCompletionTable).

async function loadTags() {
  state.tags = await api("/api/tags");
  renderTagConfig();
  renderFilterTagOptions();
  renderTasks();
  renderFilterTagDependents();
}

async function loadPhanLoai() {
  state.phanLoaiOptions = await api("/api/phan-loai");
  renderPhanLoaiConfig();
  renderTasks();
  renderFilterTinhChatOptions();
}

// Các phần phụ thuộc vào state.tags ngoài chính bảng cấu hình: bộ lọc Backlog
// hiện chưa có lọc theo Tag, nhưng Home (bảng Tỉ lệ hoàn thành nhiệm vụ) dùng
// state.tags để dựng cột — render lại khi danh mục Tag đổi.
function renderFilterTagDependents() {
  renderHomeDashboard();
}

function renderTagConfig() {
  if (!el.tagConfigTbody) return;
  el.tagConfigEmpty.hidden = state.tags.length > 0;
  el.tagConfigTbody.innerHTML = state.tags
    .map(
      (t) => `
    <tr data-id="${t.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          <span ${tagBadgeAttrs(t.ten_tag)}>&nbsp;</span>
          <input class="inline-cell-input tag-name-input" data-id="${t.id}" value="${t.ten_tag}" style="flex:1" />
        </div>
      </td>
      <td><span class="pill-x delete-tag-btn" data-id="${t.id}" title="Xóa tag">×</span></td>
    </tr>`,
    )
    .join("");

  el.tagConfigTbody.querySelectorAll(".tag-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên tag không được để trống.");
        input.value = state.tags.find((t) => t.id === Number(input.dataset.id))?.ten_tag ?? "";
        return;
      }
      try {
        await api(`/api/tags/${input.dataset.id}`, { method: "PUT", body: JSON.stringify({ ten_tag: value }) });
        await loadTags();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.tagConfigTbody.querySelectorAll(".delete-tag-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa tag này? Các task đang gắn tag này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/tags/${btn.dataset.id}`, { method: "DELETE" });
        await loadTags();
        showToast("Đã xóa tag.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function renderPhanLoaiConfig() {
  if (!el.phanLoaiConfigTbody) return;
  el.phanLoaiConfigEmpty.hidden = state.phanLoaiOptions.length > 0;
  el.phanLoaiConfigTbody.innerHTML = state.phanLoaiOptions
    .map(
      (p) => `
    <tr data-id="${p.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          <span ${phanLoaiBadgeAttrs(p.ten_phan_loai)}>&nbsp;</span>
          <input class="inline-cell-input phanloai-name-input" data-id="${p.id}" value="${p.ten_phan_loai}" style="flex:1" />
        </div>
      </td>
      <td><span class="pill-x delete-phanloai-btn" data-id="${p.id}" title="Xóa phân loại">×</span></td>
    </tr>`,
    )
    .join("");

  el.phanLoaiConfigTbody.querySelectorAll(".phanloai-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên phân loại không được để trống.");
        input.value = state.phanLoaiOptions.find((p) => p.id === Number(input.dataset.id))?.ten_phan_loai ?? "";
        return;
      }
      try {
        await api(`/api/phan-loai/${input.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ ten_phan_loai: value }),
        });
        await loadPhanLoai();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.phanLoaiConfigTbody.querySelectorAll(".delete-phanloai-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa phân loại này? Các task đang gắn phân loại này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/phan-loai/${btn.dataset.id}`, { method: "DELETE" });
        await loadPhanLoai();
        showToast("Đã xóa phân loại.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addTagBtn.addEventListener("click", async () => {
  try {
    await api("/api/tags", { method: "POST", body: JSON.stringify({ ten_tag: "Tag mới" }) });
    await loadTags();
  } catch (err) {
    showToast(err.message);
  }
});
el.addPhanLoaiBtn.addEventListener("click", async () => {
  try {
    await api("/api/phan-loai", { method: "POST", body: JSON.stringify({ ten_phan_loai: "Phân loại mới" }) });
    await loadPhanLoai();
  } catch (err) {
    showToast(err.message);
  }
});

// Danh mục Nhóm hiển thị ở cột "Nhóm" của tab Tiêu chí — đổi ở đây ảnh hưởng
// ngay tới màu badge (nhomColorClass) và dropdown "Nhóm" ở dialog Thêm/Sửa
// tiêu chí.
async function loadNhom() {
  state.nhomOptions = await api("/api/nhom");
  renderNhomConfig();
  renderTieuChi();
}

function renderNhomConfig() {
  if (!el.nhomConfigTbody) return;
  el.nhomConfigEmpty.hidden = state.nhomOptions.length > 0;
  el.nhomConfigTbody.innerHTML = state.nhomOptions
    .map(
      (n) => `
    <tr data-id="${n.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          <span class="status-badge ${nhomColorClass(n.ten_nhom)}">&nbsp;</span>
          <input class="inline-cell-input nhom-name-input" data-id="${n.id}" value="${n.ten_nhom}" style="flex:1" />
        </div>
      </td>
      <td><span class="pill-x delete-nhom-btn" data-id="${n.id}" title="Xóa nhóm">×</span></td>
    </tr>`,
    )
    .join("");

  el.nhomConfigTbody.querySelectorAll(".nhom-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên nhóm không được để trống.");
        input.value = state.nhomOptions.find((n) => n.id === Number(input.dataset.id))?.ten_nhom ?? "";
        return;
      }
      try {
        await api(`/api/nhom/${input.dataset.id}`, { method: "PUT", body: JSON.stringify({ ten_nhom: value }) });
        await loadNhom();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.nhomConfigTbody.querySelectorAll(".delete-nhom-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa nhóm này? Các tiêu chí đang gắn nhóm này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/nhom/${btn.dataset.id}`, { method: "DELETE" });
        await loadNhom();
        showToast("Đã xóa nhóm.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addNhomBtn.addEventListener("click", async () => {
  try {
    await api("/api/nhom", { method: "POST", body: JSON.stringify({ ten_nhom: "Nhóm mới" }) });
    await loadNhom();
  } catch (err) {
    showToast(err.message);
  }
});

// Danh mục Chức vụ ở dropdown "Chức vụ" khi thêm/sửa nhân sự (Team & Nhân sự).
async function loadChucVu() {
  state.chucVuOptions = await api("/api/chuc-vu");
  renderChucVuConfig();
}

function renderChucVuConfig() {
  if (!el.chucVuConfigTbody) return;
  el.chucVuConfigEmpty.hidden = state.chucVuOptions.length > 0;
  el.chucVuConfigTbody.innerHTML = state.chucVuOptions
    .map(
      (c) => `
    <tr data-id="${c.id}">
      <td><input class="inline-cell-input chucvu-name-input" data-id="${c.id}" value="${c.ten_chuc_vu}" style="width:100%" /></td>
      <td><span class="pill-x delete-chucvu-btn" data-id="${c.id}" title="Xóa chức vụ">×</span></td>
    </tr>`,
    )
    .join("");

  el.chucVuConfigTbody.querySelectorAll(".chucvu-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast("Tên chức vụ không được để trống.");
        input.value = state.chucVuOptions.find((c) => c.id === Number(input.dataset.id))?.ten_chuc_vu ?? "";
        return;
      }
      try {
        await api(`/api/chuc-vu/${input.dataset.id}`, { method: "PUT", body: JSON.stringify({ ten_chuc_vu: value }) });
        await loadChucVu();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  el.chucVuConfigTbody.querySelectorAll(".delete-chucvu-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa chức vụ này? Các nhân sự đang gắn chức vụ này sẽ giữ nguyên giá trị cũ nhưng không còn khớp danh mục.")) return;
      try {
        await api(`/api/chuc-vu/${btn.dataset.id}`, { method: "DELETE" });
        await loadChucVu();
        showToast("Đã xóa chức vụ.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

el.addChucVuBtn.addEventListener("click", async () => {
  try {
    await api("/api/chuc-vu", { method: "POST", body: JSON.stringify({ ten_chuc_vu: "Chức vụ mới" }) });
    await loadChucVu();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình > Phòng ban ----

async function loadDepartmentConfig() {
  if (!el.departmentConfigTbody) return;
  const [departments, teamCounts] = await Promise.all([
    api("/api/departments"),
    api(`/api/teams?period_id=${state.currentPeriodId ?? state.periods[0]?.id ?? 0}`).catch(() => []),
  ]);
  state.departments = departments;
  renderDeptSwitcher();
  renderDepartmentConfig(teamCounts || []);
}

function renderDepartmentConfig(allTeams) {
  const countByDept = new Map();
  (allTeams || []).forEach((t) => {
    countByDept.set(t.department_id, (countByDept.get(t.department_id) ?? 0) + 1);
  });

  el.departmentConfigEmpty.hidden = state.departments.length > 0;
  el.departmentConfigTbody.innerHTML = state.departments
    .map(
      (d, i) => `
    <tr data-id="${d.id}">
      <td style="text-align:center">${i + 1}</td>
      <td><input class="inline-cell-input dept-name-input" data-id="${d.id}" value="${d.name}" title="${d.name}" style="width:100%;text-align:left" /></td>
      <td><input class="inline-cell-input dept-code-input" data-id="${d.id}" value="${d.code ?? ""}" title="${d.code ?? ""}" style="width:100%" /></td>
      <td style="text-align:center">${countByDept.get(d.id) ?? 0}</td>
      <td style="text-align:center"><input type="checkbox" class="dept-dung-tieuchi-chung-input" data-id="${d.id}" ${d.dung_tieu_chi_chung ? "checked" : ""} title="Bỏ chọn để phòng này chỉ dùng tiêu chí riêng, không thấy tiêu chí dùng chung" /></td>
      <td>
        <select class="inline-cell-input dept-cach-tinh-kpi-input" data-id="${d.id}" title="Theo Task: KPI cộng dồn trực tiếp theo từng nhân sự từ các task họ tham gia, không chia theo team">
          <option value="theo_team"${d.cach_tinh_kpi !== "theo_task" ? " selected" : ""}>Theo Team</option>
          <option value="theo_task"${d.cach_tinh_kpi === "theo_task" ? " selected" : ""}>Theo Task</option>
        </select>
      </td>
      <td style="text-align:center"><span class="pill-x delete-dept-btn" data-id="${d.id}" title="Xóa phòng">×</span></td>
    </tr>`,
    )
    .join("");

  const save = async (id, patch, revertEl, revertVal) => {
    try {
      await api(`/api/departments/${id}`, { method: "PUT", body: JSON.stringify(patch) });
      await loadDepartmentConfig();
      await refreshAfterDeptChange();
    } catch (err) {
      showToast(err.message);
      if (revertEl) revertEl.value = revertVal;
    }
  };

  el.departmentConfigTbody.querySelectorAll(".dept-name-input, .dept-code-input").forEach((input) => {
    input.addEventListener("input", () => {
      input.title = input.value;
    });
  });
  el.departmentConfigTbody.querySelectorAll(".dept-name-input").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.value.trim();
      const original = state.departments.find((d) => d.id === Number(input.dataset.id));
      if (!value) {
        showToast("Tên phòng không được để trống.");
        input.value = original?.name ?? "";
        return;
      }
      save(input.dataset.id, { name: value }, input, original?.name ?? "");
    });
  });
  el.departmentConfigTbody.querySelectorAll(".dept-code-input").forEach((input) => {
    input.addEventListener("change", () => {
      save(input.dataset.id, { code: input.value.trim() });
    });
  });
  el.departmentConfigTbody.querySelectorAll(".dept-dung-tieuchi-chung-input").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const nextValue = checkbox.checked;
      try {
        await api(`/api/departments/${checkbox.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ dung_tieu_chi_chung: nextValue }),
        });
        await loadDepartmentConfig();
        await refreshAfterDeptChange();
      } catch (err) {
        showToast(err.message);
        checkbox.checked = !nextValue; // revert đúng thuộc tính checked, không phải value
      }
    });
  });
  el.departmentConfigTbody.querySelectorAll(".dept-cach-tinh-kpi-input").forEach((select) => {
    select.addEventListener("change", async () => {
      const prevValue = select.value === "theo_task" ? "theo_team" : "theo_task";
      try {
        await api(`/api/departments/${select.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ cach_tinh_kpi: select.value }),
        });
        await loadDepartmentConfig();
        await refreshAfterDeptChange();
      } catch (err) {
        showToast(err.message);
        select.value = prevValue;
      }
    });
  });
  el.departmentConfigTbody.querySelectorAll(".delete-dept-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa phòng này? Chỉ xóa được khi phòng không còn team nào.")) return;
      try {
        await api(`/api/departments/${btn.dataset.id}`, { method: "DELETE" });
        await loadDepartmentConfig();
        await refreshAfterDeptChange();
        showToast("Đã xóa phòng.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// Sau khi danh sách phòng đổi (thêm/sửa/xóa): nếu phòng đang chọn không còn
// thì chuyển về phòng đầu tiên, rồi nạp lại dữ liệu.
async function refreshAfterDeptChange() {
  const stillExists = state.departments.some((d) => d.id === state.currentDepartmentId);
  if (!stillExists) {
    state.currentDepartmentId = state.departments[0]?.id ?? null;
    try {
      localStorage.setItem(DEPT_LS_KEY, String(state.currentDepartmentId));
    } catch {}
  }
  renderDeptSwitcher();
  try {
    await loadTeams();
    await loadMembers();
    await loadRoadmap();
    await loadTieuChi(); // dung_tieu_chi_chung có thể vừa đổi -> tiêu chí thấy được cũng đổi theo
    syncHomeFromCurrentIfNeeded();
  } catch (err) {
    showToast(err.message);
  }
}

el.addDepartmentBtn.addEventListener("click", () => {
  document.getElementById("department-form").reset();
  document.getElementById("department-dialog").showModal();
});
document.getElementById("department-cancel-btn").addEventListener("click", () => {
  document.getElementById("department-dialog").close();
});
document.getElementById("department-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("department-name").value.trim();
  const code = document.getElementById("department-code").value.trim();
  if (!name) {
    showToast("Tên phòng không được để trống.");
    return;
  }
  try {
    await api("/api/departments", { method: "POST", body: JSON.stringify({ name, code: code || undefined }) });
    document.getElementById("department-dialog").close();
    await loadDepartmentConfig();
    showToast("Đã thêm phòng.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cấu hình > Quản lý User & Phân quyền (chỉ Admin thấy được, xem
// checkAuth()/#config-users-pill) ----

const USER_ROLE_LABELS = { admin: "Admin", editor: "Biên tập", viewer: "Chỉ xem" };

function formatUserLastLogin(value) {
  if (!value) return "—";
  const [datePart, timePart] = String(value).split(" ");
  if (!datePart) return "—";
  const [y, m, d] = datePart.split("-");
  return timePart ? `${d}/${m}/${y} ${timePart.slice(0, 5)}` : `${d}/${m}/${y}`;
}

async function loadUsersConfig() {
  const tbody = document.getElementById("users-config-tbody");
  if (!tbody) return;
  const users = await api("/api/users");
  renderUsersConfig(users);
}

function renderUsersConfig(users) {
  const tbody = document.getElementById("users-config-tbody");
  const empty = document.getElementById("users-config-empty");
  if (!tbody) return;
  empty.hidden = users.length > 0;

  tbody.innerHTML = users
    .map((u) => {
      // Không tự đổi role/khóa chính tài khoản đang đăng nhập — khớp guard
      // chặn ở server (user.service.ts#updateUser/deleteUser), disable luôn
      // control tương ứng ở FE để đỡ bấm vào rồi bị lỗi.
      const isSelf = state.currentUserId != null && u.id === state.currentUserId;
      const roleOptions = Object.entries(USER_ROLE_LABELS)
        .map(([value, label]) => `<option value="${value}"${u.role === value ? " selected" : ""}>${label}</option>`)
        .join("");
      return `
    <tr data-id="${u.id}">
      <td>${u.name}${isSelf ? ' <span class="muted">(bạn)</span>' : ""}</td>
      <td>${u.username}</td>
      <td>${u.email ?? ""}</td>
      <td><select class="inline-cell-input user-role-select" data-id="${u.id}" ${isSelf ? "disabled" : ""}>${roleOptions}</select></td>
      <td style="text-align:center">
        <span class="status-badge ${u.active ? "status-hoan-thanh" : "status-huy"}">${u.active ? "Đang hoạt động" : "Đã khóa"}</span>
      </td>
      <td>${formatUserLastLogin(u.last_login_at)}</td>
      <td style="text-align:center">
        <button type="button" class="small ${u.active ? "btn-delete" : ""} user-toggle-active-btn" data-id="${u.id}" data-active="${u.active}" ${isSelf ? "disabled" : ""}>${u.active ? "Khóa" : "Mở khóa"}</button>
      </td>
    </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".user-role-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const prevValue = select.dataset.prevValue ?? select.value;
      try {
        await api(`/api/users/${select.dataset.id}`, { method: "PUT", body: JSON.stringify({ role: select.value }) });
        showToast("Đã đổi quyền.", "success");
        await loadUsersConfig();
      } catch (err) {
        showToast(err.message);
        select.value = prevValue;
      }
    });
  });

  tbody.querySelectorAll(".user-toggle-active-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextActive = btn.dataset.active !== "true";
      const msg = nextActive ? "Mở khóa tài khoản này?" : "Khóa tài khoản này? Người này sẽ không đăng nhập/thao tác được nữa.";
      if (!(await confirmDialog(msg))) return;
      try {
        await api(`/api/users/${btn.dataset.id}`, { method: "PUT", body: JSON.stringify({ active: nextActive }) });
        showToast(nextActive ? "Đã mở khóa." : "Đã khóa tài khoản.", "success");
        await loadUsersConfig();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

// ---- Cấu hình > Hệ thống / Mục tiêu (danh mục đơn, dùng ở Roadmap năm) ----

function renderSimpleCatalog(tbodyEl, emptyEl, items, valueKey, endpoint, reload, label, colorClassFn) {
  if (!tbodyEl) return;
  emptyEl.hidden = items.length > 0;
  tbodyEl.innerHTML = items
    .map(
      (it) => `
    <tr data-id="${it.id}">
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:8px;align-items:center">
          ${colorClassFn ? `<span class="status-badge ${colorClassFn(it[valueKey])}">&nbsp;</span>` : ""}
          <input class="inline-cell-input sc-name-input" data-id="${it.id}" value="${it[valueKey]}" style="flex:1;text-align:left" />
        </div>
      </td>
      <td><span class="pill-x sc-del-btn" data-id="${it.id}" title="Xóa">×</span></td>
    </tr>`,
    )
    .join("");

  tbodyEl.querySelectorAll(".sc-name-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const value = input.value.trim();
      if (!value) {
        showToast(`Tên ${label} không được để trống.`);
        input.value = items.find((x) => x.id === Number(input.dataset.id))?.[valueKey] ?? "";
        return;
      }
      try {
        await api(`${endpoint}/${input.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ [valueKey]: value }),
        });
        await reload();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
  tbodyEl.querySelectorAll(".sc-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog(`Xóa ${label} này? Các dòng roadmap đang dùng sẽ giữ giá trị cũ nhưng không còn khớp danh mục.`)) return;
      try {
        await api(`${endpoint}/${btn.dataset.id}`, { method: "DELETE" });
        await reload();
        showToast(`Đã xóa ${label}.`, "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

async function loadHeThong() {
  state.heThongOptions = await api("/api/he-thong");
  renderSimpleCatalog(el.heThongConfigTbody, el.heThongConfigEmpty, state.heThongOptions, "ten_he_thong", "/api/he-thong", loadHeThong, "hệ thống", heThongColorClass);
  renderRoadmap();
}
async function loadMucTieu() {
  state.mucTieuOptions = await api("/api/muc-tieu");
  renderSimpleCatalog(el.mucTieuConfigTbody, el.mucTieuConfigEmpty, state.mucTieuOptions, "ten_muc_tieu", "/api/muc-tieu", loadMucTieu, "mục tiêu", mucTieuColorClass);
  renderRoadmap();
}

el.addHeThongBtn.addEventListener("click", async () => {
  try {
    await api("/api/he-thong", { method: "POST", body: JSON.stringify({ ten_he_thong: "Hệ thống mới" }) });
    await loadHeThong();
  } catch (err) {
    showToast(err.message);
  }
});
el.addMucTieuBtn.addEventListener("click", async () => {
  try {
    await api("/api/muc-tieu", { method: "POST", body: JSON.stringify({ ten_muc_tieu: "Mục tiêu mới" }) });
    await loadMucTieu();
  } catch (err) {
    showToast(err.message);
  }
});

async function loadPhanLoaiNhanSu() {
  state.phanLoaiNhanSuOptions = await api("/api/phan-loai-nhan-su");
  renderSimpleCatalog(
    el.phanLoaiNhanSuConfigTbody,
    el.phanLoaiNhanSuConfigEmpty,
    state.phanLoaiNhanSuOptions,
    "ten_phan_loai",
    "/api/phan-loai-nhan-su",
    loadPhanLoaiNhanSu,
    "phân loại",
    phanLoaiNhanSuColorClass,
  );
}
el.addPhanLoaiNhanSuBtn.addEventListener("click", async () => {
  try {
    await api("/api/phan-loai-nhan-su", { method: "POST", body: JSON.stringify({ ten_phan_loai: "Phân loại mới" }) });
    await loadPhanLoaiNhanSu();
  } catch (err) {
    showToast(err.message);
  }
});

