// ---- Roadmap năm (theo phòng ban + năm) ----

// 1 năm 4 quý, 3 tháng = 1 quý — suy ra từ Thời gian kết thúc.
function quyFromDate(dateStr) {
  if (!dateStr || dateStr.length < 7) return "";
  const m = Number(dateStr.slice(5, 7));
  if (!m) return "";
  return `Quý ${Math.ceil(m / 3)}/${dateStr.slice(0, 4)}`;
}

const ROADMAP_YEAR_MIN = 2015;
const ROADMAP_YEAR_MAX = new Date().getFullYear() + 10;

function renderRoadmapYear() {
  el.roadmapYearValue.textContent = String(state.roadmapYear);
  el.roadmapYearPrev.disabled = state.roadmapYear <= ROADMAP_YEAR_MIN;
  el.roadmapYearNext.disabled = state.roadmapYear >= ROADMAP_YEAR_MAX;
}

function stepRoadmapYear(delta) {
  const next = state.roadmapYear + delta;
  if (next < ROADMAP_YEAR_MIN || next > ROADMAP_YEAR_MAX) return;
  state.roadmapYear = next;
  renderRoadmapYear();
  loadRoadmap().catch((err) => showToast(err.message));
}

async function loadRoadmap() {
  renderRoadmapYear();
  if (state.currentDepartmentId == null) {
    state.roadmapItems = [];
    renderRoadmap();
    return;
  }
  state.roadmapItems = await api(
    `/api/roadmap-items?year=${state.roadmapYear}&department_id=${state.currentDepartmentId}`,
  );
  if (state.roadmapSelectedId != null && !state.roadmapItems.some((x) => x.id === state.roadmapSelectedId)) {
    closeRoadmapDetail();
  }
  const roadmapIds = new Set(state.roadmapItems.map((it) => it.id));
  state.roadmapSelectedIds.forEach((id) => {
    if (!roadmapIds.has(id)) state.roadmapSelectedIds.delete(id);
  });
  roadmapPagination.reset();
  renderRoadmap();
  if (state.roadmapSelectedId != null) renderRoadmapDetail();
}

// Gộp mọi giá trị hiển thị của 1 dòng roadmap thành 1 chuỗi để tìm từ khoá.
function roadmapRowText(it) {
  return [
    it.team,
    it.he_thong,
    it.muc_tieu,
    it.nhiem_vu,
    it.dod,
    it.dieu_kien_dam_bao,
    it.phan_loai,
    formatDateDisplay(it.thoi_gian_bat_dau),
    formatDateDisplay(it.thoi_gian_ket_thuc),
    quyFromDate(it.thoi_gian_ket_thuc),
    it.trang_thai,
    it.ghi_chu,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

el.roadmapSearch.addEventListener("input", () => {
  state.roadmapSearch = el.roadmapSearch.value;
  roadmapPagination.reset();
  renderRoadmap();
});

// Hệ thống và Mục tiêu trước đây dùng chung bảng màu team-color-N, đánh số
// độc lập theo từng danh mục — nên hay trùng màu nhau (VD "Website" và
// "Tính năng mới" cùng ở vị trí đầu danh mục thì cùng ra team-color-0).
// Nay mỗi danh mục có bảng màu riêng (ht-color-N / mt-color-N, xem
// style.css) để không bao giờ trùng màu với nhau lẫn với Team.
function systemColorClass(value) {
  const i = state.systemOptions.findIndex((h) => h.ten_he_thong === value);
  return `ht-color-${(i === -1 ? 0 : i) % TEAM_COLOR_COUNT}`;
}
function objectiveColorClass(value) {
  const i = state.objectiveOptions.findIndex((m) => m.ten_muc_tieu === value);
  return `mt-color-${(i === -1 ? 0 : i) % TEAM_COLOR_COUNT}`;
}

// Phân loại nhân sự tham gia task — 2 giá trị mặc định (Thực hiện chính /
// Hỗ trợ) có màu cố định riêng, dễ nhận ngay (xanh lá = chính, xanh dương =
// hỗ trợ); phân loại tự thêm khác thì quay vòng theo bảng màu team-color.
function memberParticipationColorClass(value) {
  if (!value) return "status-default";
  if (value === "Thực hiện chính") return "phan-loai-ns-chinh";
  if (value === "Hỗ trợ") return "phan-loai-ns-hotro";
  const i = state.memberParticipationOptions.findIndex((p) => p.ten_phan_loai === value);
  return `team-color-${(i === -1 ? 0 : i) % TEAM_COLOR_COUNT}`;
}

// "Chọn tất cả" thao tác trên tập đã lọc theo từ khoá (giống bảng Danh sách
// nhiệm vụ), không phải toàn bộ dữ liệu của năm khi đang gõ tìm kiếm.
function filteredRoadmapItems() {
  const term = state.roadmapSearch.trim().toLowerCase();
  return term ? state.roadmapItems.filter((it) => roadmapRowText(it).includes(term)) : state.roadmapItems;
}

function renderRoadmap() {
  const filtered = filteredRoadmapItems();

  if (state.roadmapItems.length === 0) {
    el.roadmapEmpty.textContent = 'Chưa có dòng roadmap nào cho năm này — bấm "+ Thêm dòng roadmap".';
    el.roadmapEmpty.hidden = false;
  } else if (filtered.length === 0) {
    el.roadmapEmpty.textContent = "Không tìm thấy dòng nào khớp từ khoá.";
    el.roadmapEmpty.hidden = false;
  } else {
    el.roadmapEmpty.hidden = true;
  }

  const pageItems = roadmapPagination.slice(filtered);
  const offset = (roadmapPagination.page - 1) * roadmapPagination.pageSize;
  const nl2br = (s) => (s ?? "").replace(/\n/g, "<br>");
  const badge = (value, attrs) =>
    value ? `<span ${attrs}>${value}</span>` : "";
  el.roadmapTbody.innerHTML = pageItems
    .map((it, i) => {
      const sc = STATUS_CLASS[it.trang_thai] || "status-default";
      const selCls = it.id === state.roadmapSelectedId ? " class=\"rm-row-selected\"" : "";
      return `<tr data-id="${it.id}"${selCls}>
      <td style="text-align:center"><input type="checkbox" class="roadmap-row-checkbox" ${state.roadmapSelectedIds.has(it.id) ? "checked" : ""} /></td>
      <td style="text-align:center">${offset + i + 1}</td>
      <td style="text-align:center;vertical-align:middle">${badge(it.team, `class="status-badge ${teamColorClass(it.team)}"`)}</td>
      <td style="text-align:center;vertical-align:middle">${badge(it.he_thong, `class="status-badge ${systemColorClass(it.he_thong)}"`)}</td>
      <td style="text-align:center;vertical-align:middle">${badge(it.muc_tieu, `class="status-badge ${objectiveColorClass(it.muc_tieu)}"`)}</td>
      <td class="rm-nv-cell${it.synced_task_id ? " has-sync-badge" : ""}">${it.synced_task_id ? '<span class="rm-synced-badge" title="Đã tự động đưa vào Backlog theo tháng bắt đầu">✓ Đã vào Backlog</span>' : ""}${nl2br(it.nhiem_vu)}</td>
      <td>${nl2br(it.dod)}</td>
      <td>${nl2br(it.dieu_kien_dam_bao)}</td>
      <td style="text-align:center;vertical-align:middle">${badge(it.phan_loai, categoryBadgeAttrs(it.phan_loai))}</td>
      <td style="text-align:center">${formatDateDisplay(it.thoi_gian_bat_dau)}</td>
      <td style="text-align:center">${formatDateDisplay(it.thoi_gian_ket_thuc)}</td>
      <td style="text-align:center">${quyFromDate(it.thoi_gian_ket_thuc)}</td>
      <td style="text-align:center"><span class="status-badge ${sc}">${it.trang_thai}</span></td>
      <td>${nl2br(it.ghi_chu)}</td>
      <td>
        <div class="actions-cell">
          <button class="small btn-edit rm-edit-btn" data-id="${it.id}">Sửa</button>
          <button class="small btn-delete rm-del-btn" data-id="${it.id}">Xóa</button>
        </div>
      </td>
    </tr>`;
    })
    .join("");

  el.roadmapTbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button, input")) return; // bỏ qua khi bấm Sửa/Xóa/checkbox
      selectRoadmapRow(Number(tr.dataset.id));
    });
  });
  el.roadmapTbody.querySelectorAll(".roadmap-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.roadmapSelectedIds.add(id);
      } else {
        state.roadmapSelectedIds.delete(id);
      }
      updateRoadmapSelectionUI();
    });
  });
  el.roadmapTbody.querySelectorAll(".rm-edit-btn").forEach((b) => {
    b.addEventListener("click", () =>
      openRoadmapDialog(state.roadmapItems.find((x) => x.id === Number(b.dataset.id))),
    );
  });
  el.roadmapTbody.querySelectorAll(".rm-del-btn").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa dòng roadmap này? Chi tiết công việc theo tháng cũng bị xóa.")) return;
      try {
        await api(`/api/roadmap-items/${b.dataset.id}`, { method: "DELETE" });
        await loadRoadmap();
        showToast("Đã xóa dòng roadmap.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateRoadmapSelectionUI();
}

function updateRoadmapSelectionUI() {
  const visible = filteredRoadmapItems();
  const visibleSelectedCount = visible.filter((it) => state.roadmapSelectedIds.has(it.id)).length;
  el.deleteSelectedRoadmapBtn.hidden = state.roadmapSelectedIds.size === 0;
  el.selectedRoadmapCount.textContent = String(state.roadmapSelectedIds.size);
  el.roadmapSelectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
  el.roadmapSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
}

el.roadmapSelectAll.addEventListener("change", (e) => {
  const visible = filteredRoadmapItems();
  if (e.target.checked) {
    visible.forEach((it) => state.roadmapSelectedIds.add(it.id));
  } else {
    visible.forEach((it) => state.roadmapSelectedIds.delete(it.id));
  }
  renderRoadmap();
});

el.deleteSelectedRoadmapBtn.addEventListener("click", async () => {
  const ids = [...state.roadmapSelectedIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Xóa ${ids.length} dòng roadmap đã chọn? Chi tiết công việc theo tháng cũng bị xóa.`)) return;
  try {
    await api("/api/roadmap-items/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.roadmapSelectedIds.clear();
    await loadRoadmap();
    showToast(`Đã xóa ${ids.length} dòng roadmap.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Chi tiết công việc theo tháng của 1 dòng roadmap ----

// Các tháng cần hiển thị: từ tháng Bắt đầu tới tháng Kết thúc (thiếu ngày
// nào thì lấy biên: bắt đầu = 1, kết thúc = 12), giới hạn trong năm roadmap.
function roadmapMonths(item) {
  const y = item.year;
  const monthOf = (d, fallback) => {
    if (!d || d.length < 7) return fallback;
    if (Number(d.slice(0, 4)) < y) return 1;
    if (Number(d.slice(0, 4)) > y) return 12;
    return Number(d.slice(5, 7)) || fallback;
  };
  let a = monthOf(item.thoi_gian_bat_dau, 1);
  let b = monthOf(item.thoi_gian_ket_thuc, 12);
  if (a > b) [a, b] = [b, a];
  const out = [];
  for (let m = Math.max(1, a); m <= Math.min(12, b); m++) out.push(m);
  return out;
}

async function selectRoadmapRow(id) {
  if (state.roadmapSelectedId === id) {
    closeRoadmapDetail();
    renderRoadmap();
    return;
  }
  state.roadmapSelectedId = id;
  try {
    state.roadmapDetails = await api(`/api/roadmap-items/${id}/details`);
  } catch (err) {
    showToast(err.message);
    return;
  }
  renderRoadmap();
  renderRoadmapDetail();
  el.roadmapDetailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeRoadmapDetail() {
  state.roadmapSelectedId = null;
  state.roadmapDetails = [];
  el.roadmapDetailCard.hidden = true;
}

async function reloadRoadmapDetails() {
  if (state.roadmapSelectedId == null) return;
  state.roadmapDetails = await api(`/api/roadmap-items/${state.roadmapSelectedId}/details`);
  renderRoadmapDetail();
}

function renderRoadmapDetail() {
  const item = state.roadmapItems.find((x) => x.id === state.roadmapSelectedId);
  if (!item) {
    closeRoadmapDetail();
    return;
  }
  el.roadmapDetailCard.hidden = false;
  el.roadmapDetailTitle.textContent = `Chi tiết: ${item.nhiem_vu}`;
  const range =
    formatDateDisplay(item.thoi_gian_bat_dau) && formatDateDisplay(item.thoi_gian_ket_thuc)
      ? `${formatDateDisplay(item.thoi_gian_bat_dau)} → ${formatDateDisplay(item.thoi_gian_ket_thuc)}`
      : `năm ${item.year}`;
  el.roadmapDetailSub.textContent = `${item.team}${item.he_thong ? " · " + item.he_thong : ""} · ${range}`;

  const months = roadmapMonths(item);
  const nl2br = (s) => (s ?? "").replace(/\n/g, "<br>");
  el.roadmapDetailMonths.innerHTML = months
    .map((m) => {
      const rows = state.roadmapDetails.filter((d) => d.month === m);
      const body = rows.length
        ? `<div class="table-wrap"><table class="rm-detail-table">
            <thead><tr><th style="min-width:260px">Nội dung công việc</th><th style="width:130px">Trạng thái</th><th style="min-width:160px">Ghi chú</th><th style="width:120px"></th></tr></thead>
            <tbody>${rows
              .map(
                (d) => `<tr>
                  <td>${nl2br(d.noi_dung)}</td>
                  <td style="text-align:center"><span class="status-badge ${STATUS_CLASS[d.trang_thai] || "status-default"}">${d.trang_thai}</span></td>
                  <td>${nl2br(d.ghi_chu)}</td>
                  <td><div class="actions-cell">
                    <button class="small btn-edit rd-edit-btn" data-id="${d.id}">Sửa</button>
                    <button class="small btn-delete rd-del-btn" data-id="${d.id}">Xóa</button>
                  </div></td>
                </tr>`,
              )
              .join("")}</tbody></table></div>`
        : `<p class="muted" style="margin:6px 0 0">Chưa có việc nào cho tháng này.</p>`;
      return `<div class="rm-month-block">
        <div class="row" style="justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:1rem">Tháng ${m}/${item.year}</h3>
          <button type="button" class="small primary rd-add-btn" data-month="${m}">+ Thêm việc</button>
        </div>
        ${body}
      </div>`;
    })
    .join("");

  el.roadmapDetailMonths.querySelectorAll(".rd-add-btn").forEach((b) => {
    b.addEventListener("click", () => openRoadmapDetailDialog(item, Number(b.dataset.month), null));
  });
  el.roadmapDetailMonths.querySelectorAll(".rd-edit-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const d = state.roadmapDetails.find((x) => x.id === Number(b.dataset.id));
      openRoadmapDetailDialog(item, d.month, d);
    });
  });
  el.roadmapDetailMonths.querySelectorAll(".rd-del-btn").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!await confirmDialog("Xóa việc này?")) return;
      try {
        await api(`/api/roadmap-details/${b.dataset.id}`, { method: "DELETE" });
        await reloadRoadmapDetails();
        showToast("Đã xóa.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

function openRoadmapDetailDialog(item, month, detail) {
  el.roadmapDetailForm.reset();
  document.getElementById("rd-id").value = detail?.id ?? "";
  document.getElementById("rd-item-id").value = item.id;
  el.roadmapDetailDialogTitle.textContent = detail ? "Sửa việc" : "Thêm việc";
  const months = roadmapMonths(item);
  document.getElementById("rd-month").innerHTML = months
    .map((m) => `<option value="${m}">Tháng ${m}/${item.year}</option>`)
    .join("");
  document.getElementById("rd-month").value = String(detail?.month ?? month ?? months[0]);
  document.getElementById("rd-trang-thai").value = detail?.trang_thai ?? "Chưa thực hiện";
  document.getElementById("rd-noi-dung").value = detail?.noi_dung ?? "";
  document.getElementById("rd-ghi-chu").value = detail?.ghi_chu ?? "";
  el.roadmapDetailDialog.showModal();
}

el.roadmapDetailClose.addEventListener("click", () => {
  closeRoadmapDetail();
  renderRoadmap();
});
el.roadmapDetailCancelBtn.addEventListener("click", () => el.roadmapDetailDialog.close());

el.roadmapDetailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("rd-id").value;
  const itemId = document.getElementById("rd-item-id").value;
  const payload = {
    month: Number(document.getElementById("rd-month").value),
    trang_thai: document.getElementById("rd-trang-thai").value,
    noi_dung: document.getElementById("rd-noi-dung").value.trim(),
    ghi_chu: document.getElementById("rd-ghi-chu").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/roadmap-details/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api(`/api/roadmap-items/${itemId}/details`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    el.roadmapDetailDialog.close();
    await reloadRoadmapDetails();
    showToast(id ? "Đã cập nhật việc." : "Đã thêm việc.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

function rmFillSelect(selectEl, values, current, placeholder) {
  selectEl.innerHTML =
    (placeholder ? `<option value="">${placeholder}</option>` : "") +
    values.map((v) => `<option value="${v}">${v}</option>`).join("");
  selectEl.value = current ?? "";
}

function openRoadmapDialog(item) {
  el.roadmapForm.reset();
  document.getElementById("rm-id").value = item?.id ?? "";
  el.roadmapDialogTitle.textContent = item ? "Sửa dòng roadmap" : "Thêm dòng roadmap";
  rmFillSelect(
    document.getElementById("rm-team"),
    state.teams.map((t) => t.name),
    item?.team ?? state.currentTeam ?? state.teams[0]?.name ?? "",
    null,
  );
  rmFillSelect(document.getElementById("rm-he-thong"), state.systemOptions.map((h) => h.ten_he_thong), item?.he_thong, "— Không —");
  rmFillSelect(document.getElementById("rm-muc-tieu"), state.objectiveOptions.map((m) => m.ten_muc_tieu), item?.muc_tieu, "— Không —");
  rmFillSelect(document.getElementById("rm-phan-loai"), state.categoryOptions.map((p) => p.ten_phan_loai), item?.phan_loai, "— Không —");
  document.getElementById("rm-nhiem-vu").value = item?.nhiem_vu ?? "";
  document.getElementById("rm-dod").value = item?.dod ?? "";
  document.getElementById("rm-dieu-kien").value = item?.dieu_kien_dam_bao ?? "";
  document.getElementById("rm-bat-dau").value = formatDateInput(item?.thoi_gian_bat_dau);
  document.getElementById("rm-ket-thuc").value = formatDateInput(item?.thoi_gian_ket_thuc);
  document.getElementById("rm-trang-thai").value = item?.trang_thai ?? "Chưa thực hiện";
  document.getElementById("rm-ghi-chu").value = item?.ghi_chu ?? "";
  document.getElementById("rm-quy").value = quyFromDate(document.getElementById("rm-ket-thuc").value);
  el.roadmapDialog.showModal();
}

document.getElementById("rm-ket-thuc").addEventListener("change", (e) => {
  document.getElementById("rm-quy").value = quyFromDate(e.target.value);
});

el.addRoadmapBtn.addEventListener("click", () => {
  if (state.currentDepartmentId == null) {
    showToast("Chưa có phòng ban nào.");
    return;
  }
  if (state.teams.length === 0) {
    showToast("Phòng này chưa có team — hãy khai báo team trước.");
    return;
  }
  openRoadmapDialog(null);
});
el.roadmapCancelBtn.addEventListener("click", () => el.roadmapDialog.close());
el.roadmapYearPrev.addEventListener("click", () => stepRoadmapYear(-1));
el.roadmapYearNext.addEventListener("click", () => stepRoadmapYear(1));

el.downloadRoadmapTemplateBtn.addEventListener("click", () => {
  window.location.href = `/api/roadmap-items/import-template?period_id=${state.currentPeriodId ?? ""}${deptParam()}`;
});
el.importRoadmapBtn.addEventListener("click", () => {
  if (state.currentDepartmentId == null) {
    showToast("Chưa có phòng ban nào.");
    return;
  }
  el.roadmapFileInput.click();
});
el.roadmapFileInput.addEventListener("change", async () => {
  const file = el.roadmapFileInput.files[0];
  el.roadmapFileInput.value = "";
  if (!file) return;
  try {
    await runExcelImport({
      url: `/api/roadmap-items/import?year=${state.roadmapYear}${deptParam()}`,
      file,
      unit: "dòng roadmap",
    });
    await loadRoadmap();
  } catch (err) {
    showToast(err.message);
  }
});

el.roadmapForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("rm-id").value;
  const payload = {
    year: state.roadmapYear,
    department_id: state.currentDepartmentId,
    team: document.getElementById("rm-team").value,
    he_thong: document.getElementById("rm-he-thong").value || undefined,
    muc_tieu: document.getElementById("rm-muc-tieu").value || undefined,
    phan_loai: document.getElementById("rm-phan-loai").value || undefined,
    nhiem_vu: document.getElementById("rm-nhiem-vu").value.trim(),
    dod: document.getElementById("rm-dod").value.trim() || undefined,
    dieu_kien_dam_bao: document.getElementById("rm-dieu-kien").value.trim() || undefined,
    thoi_gian_bat_dau: document.getElementById("rm-bat-dau").value || undefined,
    thoi_gian_ket_thuc: document.getElementById("rm-ket-thuc").value || undefined,
    trang_thai: document.getElementById("rm-trang-thai").value,
    ghi_chu: document.getElementById("rm-ghi-chu").value.trim() || undefined,
  };
  try {
    if (id) {
      await api(`/api/roadmap-items/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/api/roadmap-items", { method: "POST", body: JSON.stringify(payload) });
    }
    el.roadmapDialog.close();
    await loadRoadmap();
    showToast(id ? "Đã cập nhật dòng roadmap." : "Đã thêm dòng roadmap.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

