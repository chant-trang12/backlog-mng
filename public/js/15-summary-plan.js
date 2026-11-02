// ---- Kế hoạch tổng hợp > tab "KQ xếp loại CBNV" ----
// Lọc theo Tháng theo dõi (state.currentPeriodId, dùng CHUNG với Backlog/
// Team & Nhân sự — xem #cbnv-period-select wiring ở 02-departments-periods-
// teams.js) + phòng ban đang xem (bộ chuyển đổi phòng ban chung ở header,
// deptParam()) — mỗi phòng ban 1 danh sách riêng, KHÔNG hiển thị lẫn lộn.

const cbnvPagination = createPagination("cbnv", () => renderCbnvTable(), "bản ghi");

async function loadCbnvXepLoai() {
  if (!state.currentPeriodId) {
    state.cbnvRecords = [];
    renderCbnvTable();
    return;
  }
  state.cbnvRecords = await api(`/api/cbnv-xep-loai?period_id=${state.currentPeriodId}${deptParam()}`);
  renderCbnvTable();
}

function filteredCbnvRecords() {
  const term = (state.cbnvSearch ?? "").trim().toLowerCase();
  if (!term) return state.cbnvRecords;
  return state.cbnvRecords.filter((r) =>
    [r.ma_nhan_vien, r.ho_va_ten, r.chuc_danh, r.don_vi, r.department_name, r.to_nhom]
      .some((v) => (v ?? "").toLowerCase().includes(term)),
  );
}

function renderCbnvTable() {
  const visible = filteredCbnvRecords();
  const groupHeader = document.getElementById("cbnv-group-ketqua");
  const period = state.periods.find((p) => p.id === state.currentPeriodId);
  if (groupHeader) groupHeader.textContent = `Kết quả hoàn thành nhiệm vụ/công việc ${period?.label ?? ""}`;

  document.getElementById("cbnv-empty").hidden = visible.length > 0;
  const pageItems = cbnvPagination.slice(visible);
  const pageStart = (cbnvPagination.page - 1) * cbnvPagination.pageSize;
  document.getElementById("cbnv-tbody").innerHTML = pageItems
    .map(
      (r, i) => `
    <tr data-id="${r.id}">
      <td>${pageStart + i + 1}</td>
      <td>${r.ma_nhan_vien ?? ""}</td>
      <td>${r.ho_va_ten}</td>
      <td>${r.chuc_danh ?? ""}</td>
      <td>${r.don_vi ?? ""}</td>
      <td>${r.department_name ?? ""}</td>
      <td>${r.to_nhom ?? ""}</td>
      <td>${r.diem_danh_gia ?? ""}</td>
      <td>${r.xep_loai_ket_qua ?? ""}</td>
      <td>${r.tuan_thu_dia_diem ?? ""}</td>
      <td>${r.tuan_thu_noi_quy ?? ""}</td>
      <td>${r.xep_loai ?? ""}</td>
      <td>${r.xep_loai_muc_do ?? ""}</td>
      <td>${(r.chu_y ?? "").replace(/\n/g, "<br/>")}</td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action cbnv-edit-btn">Sửa</button>
        <button class="small btn-delete cbnv-delete-btn">Xóa</button>
      </div></td>
    </tr>`,
    )
    .join("");

  document.getElementById("cbnv-tbody").querySelectorAll(".cbnv-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.closest("tr").dataset.id);
      openCbnvEditDialog(state.cbnvRecords.find((r) => r.id === id));
    });
  });
  document.getElementById("cbnv-tbody").querySelectorAll(".cbnv-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.closest("tr").dataset.id);
      if (!confirm("Xóa dòng KQ xếp loại này?")) return;
      try {
        await api(`/api/cbnv-xep-loai/${id}`, { method: "DELETE" });
        await loadCbnvXepLoai();
        showToast("Đã xóa.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

document.getElementById("cbnv-search")?.addEventListener("input", (e) => {
  state.cbnvSearch = e.target.value;
  cbnvPagination.reset();
  renderCbnvTable();
});

// ---- Sửa ----

function openCbnvEditDialog(record) {
  if (!record) return;
  state.cbnvEditingId = record.id;
  document.getElementById("cbnv-f-ma-nhan-vien").value = record.ma_nhan_vien ?? "";
  document.getElementById("cbnv-f-ho-va-ten").value = record.ho_va_ten ?? "";
  document.getElementById("cbnv-f-chuc-danh").value = record.chuc_danh ?? "";
  document.getElementById("cbnv-f-don-vi").value = record.don_vi ?? "";
  document.getElementById("cbnv-f-to-nhom").value = record.to_nhom ?? "";
  document.getElementById("cbnv-f-diem").value = record.diem_danh_gia ?? "";
  document.getElementById("cbnv-f-xep-loai-ket-qua").value = record.xep_loai_ket_qua ?? "";
  document.getElementById("cbnv-f-tuan-thu-dia-diem").value = record.tuan_thu_dia_diem ?? "";
  document.getElementById("cbnv-f-tuan-thu-noi-quy").value = record.tuan_thu_noi_quy ?? "";
  document.getElementById("cbnv-f-xep-loai").value = record.xep_loai ?? "";
  document.getElementById("cbnv-f-xep-loai-muc-do").value = record.xep_loai_muc_do ?? "";
  document.getElementById("cbnv-f-chu-y").value = record.chu_y ?? "";
  document.getElementById("cbnv-edit-dialog").showModal();
}

document.getElementById("cbnv-edit-cancel-btn")?.addEventListener("click", () => {
  document.getElementById("cbnv-edit-dialog").close();
});

document.getElementById("cbnv-edit-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const diemRaw = document.getElementById("cbnv-f-diem").value;
  const body = {
    ma_nhan_vien: document.getElementById("cbnv-f-ma-nhan-vien").value.trim(),
    ho_va_ten: document.getElementById("cbnv-f-ho-va-ten").value.trim(),
    chuc_danh: document.getElementById("cbnv-f-chuc-danh").value.trim(),
    don_vi: document.getElementById("cbnv-f-don-vi").value.trim(),
    to_nhom: document.getElementById("cbnv-f-to-nhom").value.trim(),
    diem_danh_gia: diemRaw === "" ? null : Number(diemRaw),
    xep_loai_ket_qua: document.getElementById("cbnv-f-xep-loai-ket-qua").value.trim(),
    tuan_thu_dia_diem: document.getElementById("cbnv-f-tuan-thu-dia-diem").value,
    tuan_thu_noi_quy: document.getElementById("cbnv-f-tuan-thu-noi-quy").value,
    xep_loai: document.getElementById("cbnv-f-xep-loai").value,
    xep_loai_muc_do: document.getElementById("cbnv-f-xep-loai-muc-do").value.trim(),
    chu_y: document.getElementById("cbnv-f-chu-y").value.trim(),
  };
  if (!body.ho_va_ten) {
    showToast("Hãy nhập Họ và Tên.");
    return;
  }
  try {
    await api(`/api/cbnv-xep-loai/${state.cbnvEditingId}`, { method: "PUT", body: JSON.stringify(body) });
    document.getElementById("cbnv-edit-dialog").close();
    await loadCbnvXepLoai();
    showToast("Đã lưu.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Tải file mẫu / Import Excel / Xuất Excel ----

document.getElementById("cbnv-download-template-btn")?.addEventListener("click", () => {
  window.location.href = "/api/cbnv-xep-loai/import-template";
});

document.getElementById("cbnv-export-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn Tháng theo dõi trước.");
    return;
  }
  window.location.href = `/api/cbnv-xep-loai/export?period_id=${state.currentPeriodId}${deptParam()}`;
});

document.getElementById("cbnv-import-btn")?.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn Tháng theo dõi trước.");
    return;
  }
  document.getElementById("cbnv-import-input").click();
});

document.getElementById("cbnv-import-input")?.addEventListener("change", async () => {
  const input = document.getElementById("cbnv-import-input");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    const buffer = await file.arrayBuffer();
    const res = await fetch(`/api/cbnv-xep-loai/import?period_id=${state.currentPeriodId}${deptParam()}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: buffer,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Lỗi ${res.status}`);
    }
    const result = await res.json();
    await loadCbnvXepLoai();

    let msg = `Đã nhập ${result.imported} dòng.`;
    if (result.skipped?.length) {
      const detail = result.skipped
        .slice(0, 5)
        .map((s) => `dòng ${s.row}${s.label ? ` (${s.label})` : ""}: ${s.reason}`)
        .join("; ");
      const more = result.skipped.length > 5 ? `; +${result.skipped.length - 5} dòng khác` : "";
      showToast(`${msg} Bỏ qua ${result.skipped.length} dòng — ${detail}${more}`, "error");
    } else {
      showToast(msg, "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- "Lấy thông tin xếp loại" ----
// Tính Rank/KI bằng ĐÚNG thuật toán Ranking team đã có sẵn ở Trang chủ
// (08-home.js: homeComputeTeamScores/homeKiColumnForMemberRank/homeKiValue/
// homeLowerKiOneLevel/homeRaiseKiOneLevel) — KHÔNG viết lại thuật toán tính
// điểm/rank ở đây (user đã chốt phạm vi "theo phòng đang xem", tái dùng
// nguyên hàm FE thay vì port sang backend). Hoạt động cho MỌI team của
// phòng đang xem (deptParam()) ở tháng đang chọn.
document.getElementById("cbnv-fetch-ki-btn")?.addEventListener("click", async () => {
  const dept = state.departments.find((d) => d.id === state.currentDepartmentId);
  if (!dept) {
    showToast('Hãy chọn 1 phòng ban cụ thể ở bộ chuyển đổi phòng ban trước (không dùng được khi đang xem "Tất cả").');
    return;
  }
  if (dept.cach_tinh_kpi !== "theo_team") {
    showToast(`Phòng "${dept.name}" không tính KPI theo team — không có dữ liệu Ranking team để lấy.`);
    return;
  }
  if (!state.currentPeriodId) {
    showToast("Hãy chọn Tháng theo dõi trước.");
    return;
  }

  try {
    // Nạp dữ liệu Trang chủ cho ĐÚNG tháng/phòng đang xem — periodId trùng
    // state.currentPeriodId nên refreshHomeForPeriod() đi nhánh "alias" (xem
    // 02-departments-periods-teams.js), không gọi thêm API thừa ngoài KPI
    // theo task.
    await refreshHomeForPeriod(state.currentPeriodId);
    state.homePeriodId = state.currentPeriodId;

    const teamNames = state.homeTeams.map((t) => t.name);
    if (teamNames.length === 0) {
      showToast("Phòng ban này chưa có team nào ở tháng đang chọn.");
      return;
    }

    const eligible = homeEligibleTasks(state.homeTasks);
    const rankingData = teamNames
      .map((name) => ({ team: name, value: homeComputeTeamScores(name, eligible).tongDiem }))
      .sort((a, b) => b.value - a.value);

    const entries = [];
    rankingData.forEach((d, idx) => {
      const team = d.team;
      const teamRankPosition = idx + 1;
      const rankedMembers = state.homeEvaluationRecords
        .filter((r) => r.team_name === team)
        .sort((a, b) => a.so_thu_tu - b.so_thu_tu);
      rankedMembers.forEach((m, i) => {
        const kiColumn = homeKiColumnForMemberRank(i, rankedMembers.length);
        const rawKi = homeKiValue(kiColumn, teamRankPosition);
        const member = state.homeMembers.find((mem) => mem.id === m.member_id);
        let ki = rawKi;
        if (member?.ha_ki) {
          ki = homeLowerKiOneLevel(rawKi);
        } else if (member?.tang_ki) {
          const raised = homeRaiseKiOneLevel(rawKi);
          ki = raised.atCeiling ? rawKi : raised.value;
        }
        entries.push({ member_id: m.member_id, ho_va_ten: m.member_name, to_nhom: team, xep_loai: ki });
      });
    });

    if (entries.length === 0) {
      showToast('Chưa có nhân sự nào nhập Ranking (tab "Đánh giá") ở các team của phòng này.');
      return;
    }

    const result = await api("/api/cbnv-xep-loai/fetch-ki", {
      method: "POST",
      body: JSON.stringify({ period_id: state.currentPeriodId, department_id: dept.id, entries }),
    });
    await loadCbnvXepLoai();
    showToast(`Đã lấy thông tin xếp loại: ${result.created} dòng mới, ${result.updated} dòng cập nhật.`, "success");
  } catch (err) {
    showToast(err.message);
  }
});
