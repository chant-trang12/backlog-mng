// ---- Tasks ----

// ---- Cấu hình cột hiển thị ở bảng Danh sách nhiệm vụ ----
// Bảng có 14 cột dữ liệu nên rất dài theo chiều ngang — cho người dùng tự
// chọn ẩn cột nào không cần xem, lưu riêng theo máy/trình duyệt (localStorage,
// KHÔNG lưu server) vì đây chỉ là tuỳ chọn hiển thị cá nhân, không phải dữ
// liệu nghiệp vụ. Cột checkbox, "Nhiệm vụ" (tên task — cần thấy để biết
// đang xem dòng nào) và cột hành động (Sửa/Xoá...) không cho ẩn.
const TASK_TOGGLEABLE_COLUMNS = [
  { key: "stt", label: "STT" },
  { key: "tag", label: "Tag" },
  { key: "phan_loai", label: "Phân loại" },
  { key: "team", label: "Team" },
  { key: "dod", label: "DoD" },
  { key: "deadline", label: "Deadline" },
  { key: "hoan_thanh", label: "% Hoàn thành" },
  { key: "trang_thai", label: "Trạng thái" },
  { key: "dau_moi_phoi_hop", label: "Đầu mối phối hợp" },
  { key: "tien_do", label: "Tiến độ" },
  { key: "tinh_chat", label: "Tính chất" },
  { key: "danh_gia_phan_tram", label: "% Đánh giá" },
  { key: "danh_gia_noi_dung", label: "Nội dung đánh giá" },
];
const TASK_COL_LS_KEY = "backlog.taskColumns.hiddenV1";

function loadHiddenTaskColumns() {
  try {
    const raw = localStorage.getItem(TASK_COL_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    // localStorage có thể bị chặn (chế độ ẩn danh, site data bị khoá) —
    // bỏ qua, chỉ mất tuỳ chọn ẩn cột đã lưu trước đó trên máy này.
    return new Set();
  }
}

function saveHiddenTaskColumns() {
  try {
    localStorage.setItem(TASK_COL_LS_KEY, JSON.stringify([...state.hiddenTaskColumns]));
  } catch {
    // Không lưu được thì bỏ qua — tuỳ chọn vẫn áp dụng cho phiên hiện tại,
    // chỉ không nhớ lại cho lần sau.
  }
}

function isTaskColHidden(key) {
  return state.hiddenTaskColumns.has(key);
}

// Đồng bộ thuộc tính hidden của các <th> tiêu đề theo đúng tuỳ chọn đã lưu
// — header là markup tĩnh (không render lại theo state.tasks như tbody) nên
// cần hàm riêng, gọi lúc khởi động trang (xem initTaskColumnMenu) và mỗi
// lần vẽ lại bảng (renderTasks) để không bị ghi đè bởi lý do ẩn cột Team
// khác (KPI tính theo task — applyDeptModeSidebarNav).
function applyTaskColumnHeaderVisibility() {
  TASK_TOGGLEABLE_COLUMNS.forEach(({ key }) => {
    const th = document.querySelector(`#task-table thead [data-col="${key}"]`);
    if (!th) return;
    th.hidden = isTaskColHidden(key) || (key === "team" && homeCachTinhKpiTheoTask());
  });
}

function renderTaskColMenu() {
  el.taskColMenuList.innerHTML = TASK_TOGGLEABLE_COLUMNS.map(
    ({ key, label }) => `
    <label class="col-menu-item">
      <input type="checkbox" class="task-col-checkbox" data-col-key="${key}" ${isTaskColHidden(key) ? "" : "checked"} />
      ${label}
    </label>`,
  ).join("");
  el.taskColMenuList.querySelectorAll(".task-col-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const key = e.target.dataset.colKey;
      if (e.target.checked) state.hiddenTaskColumns.delete(key);
      else state.hiddenTaskColumns.add(key);
      saveHiddenTaskColumns();
      renderTasks();
    });
  });
}

function openTaskColMenu() {
  renderTaskColMenu();
  el.taskColMenu.hidden = false;
  el.taskColMenuBtn.setAttribute("aria-expanded", "true");
}

function closeTaskColMenu() {
  el.taskColMenu.hidden = true;
  el.taskColMenuBtn.setAttribute("aria-expanded", "false");
}

function initTaskColumnMenu() {
  state.hiddenTaskColumns = loadHiddenTaskColumns();
  applyTaskColumnHeaderVisibility();

  el.taskColMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (el.taskColMenu.hidden) openTaskColMenu();
    else closeTaskColMenu();
  });
  document.addEventListener("click", (e) => {
    if (!el.taskColMenu.hidden && !el.taskColMenuWrap.contains(e.target)) closeTaskColMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTaskColMenu();
  });
  el.taskColMenuReset.addEventListener("click", () => {
    state.hiddenTaskColumns.clear();
    saveHiddenTaskColumns();
    applyTaskColumnHeaderVisibility();
    renderTaskColMenu();
    renderTasks();
  });
}
initTaskColumnMenu();

async function loadTasks() {
  if (!state.currentPeriodId) {
    state.tasksAll = [];
    state.tasks = [];
    renderTasks();
    renderTaskWarnings();
    syncHomeFromCurrentIfNeeded();
    return;
  }
  state.tasksAll = await api(`/api/periods/${state.currentPeriodId}/tasks?_=1${deptParam()}`);
  const taskIds = new Set(state.tasksAll.map((t) => t.id));
  state.selectedTaskIds.forEach((id) => {
    if (!taskIds.has(id)) state.selectedTaskIds.delete(id);
  });
  applyTaskFilters();
  renderTasks();
  renderTaskWarnings();
  syncHomeFromCurrentIfNeeded();
}

function renderEmpty() {
  el.taskTbody.innerHTML = "";
  el.emptyState.hidden = false;
}

// Task thay thế (tạo khi Xin Hủy nhiệm vụ) — liên kết tới task gốc đã hủy,
// hiển thị TÁCH BIỆT với DoD (không chèn vào DoD, DoD luôn là nội dung
// thật, sửa/xóa tự do bình thường — xem updateTask, task.service.ts).
function renderReplacementInfoNote(t) {
  if (!t.thay_cho_task_id) return "";
  const original = state.tasksAll.find((x) => x.id === t.thay_cho_task_id);
  if (!original) return "";
  return `<div class="auto-cancel-note">Thay thế cho nhiệm vụ đã hủy #${original.stt}: "${original.nhiem_vu}".</div>`;
}

function renderTasks() {
  el.emptyState.hidden = state.periods.length !== 0;
  // Phòng ban tính KPI theo task (không chia team) — ẩn cột Team (tiêu đề
  // đã ẩn ở applyDeptModeSidebarNav, ở đây ẩn từng ô). Đồng bộ lại tiêu đề
  // theo đúng 2 lý do ẩn cột Team (KPI theo task + tuỳ chọn người dùng ở
  // menu "Cột hiển thị") mỗi lần vẽ bảng — xem applyTaskColumnHeaderVisibility().
  const hideTeamColumn = homeCachTinhKpiTheoTask();
  applyTaskColumnHeaderVisibility();
  // colCount tính động theo đúng số cột tiêu đề ĐANG hiện (đã áp dụng cả 2
  // lý do ẩn ở trên) — để 2 dòng "trống"/"không khớp bộ lọc" bên dưới luôn
  // colspan đúng, không cần cộng trừ thủ công mỗi khi thêm/ẩn cột.
  const colCount = document.querySelectorAll("#task-table thead th:not([hidden])").length;
  if (state.tasksAll.length === 0) {
    el.taskTbody.innerHTML = `<tr><td colspan="${colCount}" class="muted" style="text-align:center;padding:16px">Chưa có task nào trong tháng này.</td></tr>`;
    updateTaskSelectionUI();
    taskPagination.slice(state.tasks);
    return;
  }
  if (state.tasks.length === 0) {
    el.taskTbody.innerHTML = `<tr><td colspan="${colCount}" class="muted" style="text-align:center;padding:16px">Không có task nào khớp bộ lọc.</td></tr>`;
    updateTaskSelectionUI();
    taskPagination.slice(state.tasks);
    return;
  }

  const pageItems = taskPagination.slice(state.tasks);

  const colHidden = (key) => (isTaskColHidden(key) || (key === "team" && hideTeamColumn) ? "hidden" : "");
  el.taskTbody.innerHTML = pageItems
    .map((t) => {
      const statusClass = STATUS_CLASS[t.trang_thai] || "status-default";
      return `
    <tr data-id="${t.id}">
      <td><input type="checkbox" class="task-row-checkbox" ${state.selectedTaskIds.has(t.id) ? "checked" : ""} /></td>
      <td data-col="stt" ${colHidden("stt")}>${t.stt}</td>
      <td data-col="tag" ${colHidden("tag")}>${t.tag ? `<span ${tagBadgeAttrs(t.tag)}>${t.tag}</span>` : ""}</td>
      <td data-col="phan_loai" ${colHidden("phan_loai")}>${renderNatureBadges(t.tinh_chat)}</td>
      <td data-col="team" ${colHidden("team")}><span class="status-badge ${teamColorClass(t.team)}">${t.team}</span></td>
      <td>${t.nhiem_vu}</td>
      <td data-col="dod" ${colHidden("dod")}>${(t.dod ?? "").replace(/\n/g, "<br/>")}${renderReplacementInfoNote(t)}</td>
      <td data-col="deadline" ${colHidden("deadline")}>${formatDateDisplay(t.deadline)}</td>
      <td data-col="hoan_thanh" ${colHidden("hoan_thanh")}>
        <span class="progress-bar"><span style="width:${Math.min(100, Math.max(0, t.phan_tram_hoan_thanh))}%"></span></span>${t.phan_tram_hoan_thanh}%
      </td>
      <td data-col="trang_thai" ${colHidden("trang_thai")}><span class="status-badge ${statusClass}">${t.trang_thai}</span></td>
      <td data-col="dau_moi_phoi_hop" ${colHidden("dau_moi_phoi_hop")}>${t.dau_moi_phoi_hop ?? ""}</td>
      <td data-col="tien_do" ${colHidden("tien_do")}>
        ${(t.tien_do ?? "").replace(/\n/g, "<br/>")}
        ${renderProgressHistory(t)}
      </td>
      <td data-col="tinh_chat" ${colHidden("tinh_chat")}>
        <div class="badge-group">
          ${t.khong_tinh_diem ? `<span class="status-badge tinh-chat-khong-tinh-diem">${t.khong_tinh_diem}</span>` : ""}
          ${t.da_chuyen_thang ? `<span class="status-badge tinh-chat-da-chuyen" title="Đã chuyển sang tháng sau, không thể chuyển tiếp">Đã chuyển</span>` : ""}
        </div>
      </td>
      <td data-col="danh_gia_phan_tram" ${colHidden("danh_gia_phan_tram")} style="position:relative">
        ${
          t.prev_cpo_danh_gia !== null
            ? `<span class="cell-prev-badge" title="Đánh giá gần nhất (tháng trước): ${t.prev_cpo_danh_gia}%${t.prev_cpo_graded_at ? " — " + fmtGradedAt(t.prev_cpo_graded_at) : ""}${t.prev_cpo_graded_by ? " · " + t.prev_cpo_graded_by : ""}">↩ ${t.prev_cpo_danh_gia}%</span>`
            : ""
        }
        ${t.cpo_danh_gia !== null ? t.cpo_danh_gia + "%" : ""}
        ${renderGradingHistory(t, "percent")}
      </td>
      <td data-col="danh_gia_noi_dung" ${colHidden("danh_gia_noi_dung")}>
        ${(t.cpo_comment ?? "").replace(/\n/g, "<br/>")}
        ${t.cpo_graded_at ? `<div class="cell-graded-at"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-clock"/></svg>${fmtGradedAt(t.cpo_graded_at)}${t.cpo_graded_by ? " · " + t.cpo_graded_by : ""}</div>` : ""}
        ${renderGradingHistory(t, "content")}
      </td>
      <td><div class="actions-cell">
        <button class="small btn-edit write-action edit-btn">Sửa</button>
        <button class="small btn-delete delete-btn">Xóa</button>
        <button class="small btn-grade grade-write-action grade-btn">Chấm điểm</button>
        <button class="small btn-progress progress-btn">Cập nhật tiến độ</button>
        <button class="small btn-member member-btn" title="Quản lý nhân sự tham gia task này"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-user"/></svg>Nhân sự${t.member_count ? ` (${t.member_count})` : ""}</button>
      </div></td>
    </tr>`;
    })
    .join("");

  el.taskTbody.querySelectorAll(".task-row-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (e.target.checked) {
        state.selectedTaskIds.add(id);
      } else {
        state.selectedTaskIds.delete(id);
      }
      updateTaskSelectionUI();
    });
  });
  el.taskTbody.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTaskDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openGradeDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".progress-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openProgressDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".member-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openTaskMemberDialog(state.tasks.find((t) => t.id === id));
    });
  });
  el.taskTbody.querySelectorAll(".grade-hist-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const list = document.getElementById(btn.dataset.histTarget);
      const willOpen = list.hidden;
      // đóng các popover lịch sử khác
      el.taskTbody.querySelectorAll(".grade-history-list").forEach((l) => {
        if (l !== list) l.hidden = true;
      });
      el.taskTbody.querySelectorAll(".grade-hist-toggle").forEach((b) => b.classList.remove("open"));
      list.hidden = !willOpen;
      btn.classList.toggle("open", willOpen);
    });
  });
  el.taskTbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      if (!await confirmDialog("Xóa task này?")) return;
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        state.selectedTaskIds.delete(id);
        await loadTasks();
        showToast("Đã xóa task.", "success");
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  updateTaskSelectionUI();
  syncTaskStickyOffsets();
}

// 6 cột đầu (checkbox/STT/Tag/Phân loại/Team/Nhiệm vụ) của #task-table cố
// định khi cuộn ngang (xem CSS "left: var(--task-col2-left...)") — đo ĐÚNG
// width thật đã render của 5 cột đầu, giống syncMemberStickyOffsets() ở
// 03-members.js. Cột Team bị ẩn (hidden) ở phòng ban tính KPI theo task thì
// width đo được tự động là 0, nên các cột sau nó tự co lại đúng vị trí mà
// không cần code riêng cho từng cách tính KPI.
function syncTaskStickyOffsets() {
  const table = document.getElementById("task-table");
  const ths = table?.querySelectorAll("thead th");
  if (!table || !ths || ths.length < 6) return;
  let left = 0;
  const lefts = [];
  for (let i = 0; i < 5; i++) {
    left += ths[i].getBoundingClientRect().width;
    lefts.push(left);
  }
  table.style.setProperty("--task-col2-left", `${lefts[0]}px`);
  table.style.setProperty("--task-col3-left", `${lefts[1]}px`);
  table.style.setProperty("--task-col4-left", `${lefts[2]}px`);
  table.style.setProperty("--task-col5-left", `${lefts[3]}px`);
  table.style.setProperty("--task-col6-left", `${lefts[4]}px`);
}
window.addEventListener("resize", () => syncTaskStickyOffsets());

function updateTaskSelectionUI() {
  const visible = state.tasks;
  const visibleSelectedCount = visible.filter((t) => state.selectedTaskIds.has(t.id)).length;
  const count = state.selectedTaskIds.size;

  el.bulkActions.hidden = count === 0;
  el.selectedTaskCount.textContent = String(count);
  if (count === 0) closeBulkMenu();
  else updateBulkMenuItems();

  el.taskSelectAll.checked = visible.length > 0 && visibleSelectedCount === visible.length;
  el.taskSelectAll.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < visible.length;
}

function selectedTasks() {
  return state.tasksAll.filter((t) => state.selectedTaskIds.has(t.id));
}

function taskHasNatureTon(t) {
  return (t.tinh_chat ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("Nhiệm vụ tồn");
}

// Luôn liệt kê đủ các thao tác trong menu (ổn định, dễ đoán); chỉ khóa
// (disabled) kèm tooltip khi thao tác không áp dụng cho lựa chọn hiện tại.
function updateBulkMenuItems() {
  const sel = selectedTasks();
  const allNoScore = sel.length > 0 && sel.every((t) => t.khong_tinh_diem);
  const anyNoScore = sel.some((t) => t.khong_tinh_diem);
  const allTon = sel.length > 0 && sel.every(taskHasNatureTon);
  const anyTon = sel.some(taskHasNatureTon);

  const setItem = (action, { disabled = false, title = "" }) => {
    const item = el.bulkActionsMenu.querySelector(`[data-bulk-action="${action}"]`);
    if (!item) return;
    item.disabled = disabled;
    item.title = title;
  };

  // Không còn khóa cứng theo cờ da_chuyen_thang ở đây nữa — task đã chuyển
  // mà bản sao bên tháng sau đã bị xóa thì vẫn chuyển lại được bình thường
  // (server tự kiểm tra đúng việc này, xem moveTasksToNextMonth ở
  // task.service.ts). Task nào thật sự còn bản sao (chưa xóa) thì server tự
  // bỏ qua, báo lại qua "skippedAlreadyMoved" — xem toast sau khi bấm.
  setItem("ton", {
    disabled: allTon,
    title: allTon ? 'Mọi task đã chọn đều đã có "Nhiệm vụ tồn".' : "",
  });
  setItem("unmark-ton", {
    disabled: !anyTon,
    title: !anyTon ? 'Không task nào đang "Nhiệm vụ tồn".' : "",
  });
  setItem("no-score", {
    disabled: allNoScore,
    title: allNoScore ? 'Mọi task đã chọn đều đã "Không tính điểm".' : "",
  });
  setItem("unmark-no-score", {
    disabled: !anyNoScore,
    title: !anyNoScore ? 'Không task nào đang "Không tính điểm".' : "",
  });
}

function openBulkMenu() {
  updateBulkMenuItems();
  el.bulkActionsMenu.hidden = false;
  el.bulkActionsBtn.setAttribute("aria-expanded", "true");
}

function closeBulkMenu() {
  el.bulkActionsMenu.hidden = true;
  el.bulkActionsBtn.setAttribute("aria-expanded", "false");
}

el.bulkActionsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (el.bulkActionsMenu.hidden) openBulkMenu();
  else closeBulkMenu();
});

document.addEventListener("click", (e) => {
  if (!el.bulkActions.hidden && !el.bulkActions.contains(e.target)) closeBulkMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeBulkMenu();
});

el.bulkActionsMenu.addEventListener("click", async (e) => {
  const item = e.target.closest("[data-bulk-action]");
  if (!item || item.disabled) return;
  closeBulkMenu();
  const action = item.dataset.bulkAction;
  if (action === "move") await doMoveTasksToNextMonth();
  else if (action === "ton") await doMarkTasksTon();
  else if (action === "unmark-ton") await doUnmarkTasksTon();
  else if (action === "no-score") await doMarkTasksNoScore();
  else if (action === "unmark-no-score") await doUnmarkTasksNoScore();
  else if (action === "delete") await doDeleteTasks();
});

el.taskSelectAll.addEventListener("change", (e) => {
  if (e.target.checked) {
    state.tasks.forEach((t) => state.selectedTaskIds.add(t.id));
  } else {
    state.tasks.forEach((t) => state.selectedTaskIds.delete(t.id));
  }
  renderTasks();
});

async function doMoveTasksToNextMonth() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !await confirmDialog(
      `Chuyển ${ids.length} task đã chọn sang tháng sau? Task có Deadline trước tháng đích sẽ được đánh dấu "Nhiệm vụ tồn".`,
      { danger: false },
    )
  ) {
    return;
  }
  try {
    const result = await api(`/api/periods/${state.currentPeriodId}/tasks/move-to-next-month`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadPeriods();
    const skippedCount = result.skippedAlreadyMoved?.length ?? 0;
    const skippedNote = skippedCount > 0 ? ` (bỏ qua ${skippedCount} task đã chuyển trước đó)` : "";
    showToast(`Đã chuyển ${result.moved.length} task sang ${result.targetPeriod.label}.${skippedNote}`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doMarkTasksNoScore() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Đánh dấu "Không tính điểm" cho ${ids.length} task đã chọn?`, { danger: false })) return;
  try {
    await api("/api/tasks/mark-no-score", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã đánh dấu "Không tính điểm" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doUnmarkTasksNoScore() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Bỏ đánh dấu "Không tính điểm" cho ${ids.length} task đã chọn?`, { danger: false })) return;
  try {
    await api("/api/tasks/unmark-no-score", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã bỏ đánh dấu "Không tính điểm" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doDeleteTasks() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (!await confirmDialog(`Xóa vĩnh viễn ${ids.length} task đã chọn? Không thể hoàn tác.`)) return;
  try {
    await api("/api/tasks/delete-selected", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã xóa ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doMarkTasksTon() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !await confirmDialog(
      `Đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task đã chọn? Task sẽ được gắn Tính chất "Nhiệm vụ tồn" và Không tính điểm.`,
      { danger: false },
    )
  ) {
    return;
  }
  try {
    await api("/api/tasks/mark-ton", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

async function doUnmarkTasksTon() {
  const ids = [...state.selectedTaskIds];
  if (ids.length === 0) return;
  if (
    !await confirmDialog(
      `Bỏ đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task đã chọn? Task sẽ bỏ Tính chất "Nhiệm vụ tồn" và bỏ Không tính điểm.`,
      { danger: false },
    )
  ) {
    return;
  }
  try {
    await api("/api/tasks/unmark-ton", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    state.selectedTaskIds.clear();
    await loadTasks();
    showToast(`Đã bỏ đánh dấu "Nhiệm vụ tồn" cho ${ids.length} task.`, "success");
  } catch (err) {
    showToast(err.message);
  }
}

// ---- Task dialog (create / update — dùng chung cho nhập mới và cập nhật tiến độ) ----

const teamSelect = document.getElementById("f-team");

function setNatureValue(value) {
  const selected = new Set(
    (value ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  document.querySelectorAll('#f-tinh-chat-group input[type="checkbox"]').forEach((cb) => {
    cb.checked = selected.has(cb.value);
  });
}

function getNatureValue() {
  return [...document.querySelectorAll('#f-tinh-chat-group input[type="checkbox"]:checked')]
    .map((cb) => cb.value)
    .join(", ");
}

// "Nhiệm vụ tồn" là giá trị hệ thống (tự gắn khi chuyển task sang tháng
// sau), không có checkbox trong dialog Sửa — nếu task đang có sẵn, giữ lại
// nguyên khi lưu, không để form (chỉ biết các Phân loại quản lý được) xoá mất.
let editingTaskHasTon = false;

function openTaskDialog(task) {
  el.taskForm.reset();
  document.getElementById("task-id").value = task?.id ?? "";
  el.taskDialogTitle.textContent = task ? `Sửa nhiệm vụ: ${task.nhiem_vu}` : "Nhập task mới";
  editingTaskHasTon = task ? taskHasNatureTon(task) : false;

  teamSelect.innerHTML = state.teams
    .map((t) => `<option value="${t.name}">${t.name}</option>`)
    .join("");
  const chosenTeam = task?.team || state.taskFilters.team || state.currentTeam || state.teams[0]?.name || "";
  teamSelect.value = chosenTeam;

  const tagSelect = document.getElementById("f-tag");
  tagSelect.innerHTML =
    `<option value="">-- Không chọn --</option>` +
    state.tags.map((t) => `<option value="${t.ten_tag}">${t.ten_tag}</option>`).join("");
  tagSelect.value = task?.tag ?? "";

  document.getElementById("f-tinh-chat-group").innerHTML = state.categoryOptions
    .map((p) => `<label class="checkbox-option"><input type="checkbox" value="${p.ten_phan_loai}" /> ${p.ten_phan_loai}</label>`)
    .join("");
  setNatureValue(task?.tinh_chat ?? "");
  document.getElementById("f-nhiem-vu").value = task?.nhiem_vu ?? "";
  // DoD luôn là nội dung THẬT, sửa/xóa tự do bình thường — liên kết "task
  // thay thế cho task nào đã hủy" hiển thị RIÊNG ở replacementInfoEl bên
  // dưới (không còn nhét vào DoD nữa), giống kiểu khối "lịch sử" tách biệt.
  document.getElementById("f-dod").value = task?.dod ?? "";
  const replacementInfoEl = document.getElementById("f-dod-replacement-info");
  const originalTask = task?.thay_cho_task_id ? state.tasksAll.find((t) => t.id === task.thay_cho_task_id) : null;
  replacementInfoEl.hidden = !originalTask;
  if (originalTask) {
    replacementInfoEl.textContent = `Thay thế cho nhiệm vụ đã hủy #${originalTask.stt}: "${originalTask.nhiem_vu}".`;
  }
  document.getElementById("f-deadline").value = formatDateInput(task?.deadline);
  document.getElementById("f-dau-moi-phoi-hop").value = task?.dau_moi_phoi_hop ?? "";
  el.taskDialog.showModal();
}

el.addTaskBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy tạo một tháng backlog trước.");
    return;
  }
  if (state.teams.length === 0) {
    showToast("Hãy khai báo ít nhất một team trước khi nhập task.");
    return;
  }
  openTaskDialog(null);
});

el.cancelBtn.addEventListener("click", () => el.taskDialog.close());

el.taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("task-id").value;
  let nature = getNatureValue();
  if (editingTaskHasTon) {
    const items = nature.split(",").map((v) => v.trim()).filter(Boolean);
    if (!items.includes("Nhiệm vụ tồn")) items.push("Nhiệm vụ tồn");
    nature = items.join(", ");
  }
  const payload = {
    team: document.getElementById("f-team").value.trim(),
    tinh_chat: nature || undefined,
    tag: document.getElementById("f-tag").value || undefined,
    nhiem_vu: document.getElementById("f-nhiem-vu").value.trim(),
    dod: document.getElementById("f-dod").value.trim() || undefined,
    deadline: document.getElementById("f-deadline").value || undefined,
    dau_moi_phoi_hop: document.getElementById("f-dau-moi-phoi-hop").value.trim() || undefined,
  };

  try {
    if (id) {
      await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      el.taskDialog.close();
      await loadTasks();
      showToast("Đã cập nhật task.", "success");
    } else {
      await api(`/api/periods/${state.currentPeriodId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ ...payload, department_id: state.currentDepartmentId ?? undefined }),
      });
      el.taskDialog.close();
      await loadTasks();
      showToast("Đã thêm task mới.", "success");
    }
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Chấm điểm (% Đánh giá, Nội dung đánh giá) ----

// Task đang Hủy và đã được (tự) chấm điểm — hiển thị "xin hủy ngày nào,
// ai chấm" dựa trên cpo_graded_at/cpo_graded_by sẵn có (KHÔNG lưu thêm
// field riêng) — tách biệt khỏi Nội dung đánh giá, để ô đó luôn gõ tự do
// được, không bị ghi chú hệ thống chiếm chỗ/khóa.
function cancelGradeInfoLine(task) {
  if (task?.trang_thai !== "Hủy" || !task?.cpo_graded_at) return "";
  const ngay = fmtGradedAt(task.cpo_graded_at).split(" ")[0];
  const boiNguoi = task.cpo_graded_by ? ` bởi ${task.cpo_graded_by}` : "";
  return `Nhiệm vụ đã Hủy — chấm điểm gần nhất ngày ${ngay}${boiNguoi}.`;
}

function openGradeDialog(task) {
  el.gradeForm.reset();
  document.getElementById("grade-task-id").value = task?.id ?? "";
  document.getElementById("grade-percent").value = task?.cpo_danh_gia ?? "";
  document.getElementById("grade-comment").value = task?.cpo_comment ?? "";
  const infoEl = document.getElementById("grade-comment-cancel-info");
  const infoText = cancelGradeInfoLine(task);
  infoEl.hidden = !infoText;
  infoEl.textContent = infoText;
  el.gradeDialog.showModal();
}

el.gradeCancelBtn.addEventListener("click", () => el.gradeDialog.close());

el.gradeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("grade-task-id").value;
  const percentValue = document.getElementById("grade-percent").value;
  const payload = {
    cpo_danh_gia: percentValue ? Number(percentValue) : undefined,
    cpo_comment: document.getElementById("grade-comment").value.trim() || undefined,
  };

  try {
    // Route riêng /grade (khác PUT /tasks/:id sửa task thường) — chỉ admin/
    // BGĐ được phép, chặn ở requireWrite (auth.middleware.ts).
    await api(`/api/tasks/${id}/grade`, { method: "PUT", body: JSON.stringify(payload) });
    el.gradeDialog.close();
    await loadTasks();
    showToast("Đã lưu chấm điểm.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Cập nhật tiến độ (% Hoàn thành, Trạng thái, Tiến độ) ----
// Tách riêng khỏi dialog Sửa: đây là cập nhật định kỳ trong lúc làm việc,
// không đụng tới nội dung task (Team/Tag/Phân loại/Nhiệm vụ/DoD/Deadline).

let progressDialogTask = null;
// true khi đang bấm "Xin Hủy nhiệm vụ" (toggle) — KHÔNG còn là 1 lựa chọn
// trong select Trạng thái nữa (tách riêng để không bị chọn nhầm như đổi
// trạng thái thường, xem index.html).
let progressCancelRequested = false;

function openProgressDialog(task) {
  el.progressForm.reset();
  progressDialogTask = task ?? null;
  progressCancelRequested = false;
  document.getElementById("progress-task-id").value = task?.id ?? "";
  document.getElementById("progress-phan-tram").value = task?.phan_tram_hoan_thanh ?? 0;
  // Task đã ở trạng thái Hủy từ trước (do dữ liệu cũ, hoặc hủy qua đường
  // khác) -> select không còn option "Hủy" để hiển thị đúng giá trị, mặc
  // định về "Chưa thực hiện" (chỉ ảnh hưởng hiển thị, không tự đổi lại
  // trạng thái trừ khi người dùng chủ động Lưu).
  document.getElementById("progress-trang-thai").value =
    task?.trang_thai === "Hủy" ? "Chưa thực hiện" : task?.trang_thai ?? "Chưa thực hiện";
  document.getElementById("progress-tien-do").value = task?.tien_do ?? "";
  document.getElementById("progress-cancel-replacement-nhiemvu").value = "";
  updateRequestCancelBtnUI();
  updateProgressCancelWarning();
  el.progressDialog.showModal();
}

function updateRequestCancelBtnUI() {
  const btn = document.getElementById("progress-request-cancel-btn");
  // Task ĐÃ ở trạng thái Hủy từ trước (VD đã xin hủy + thay thế xong ở lần
  // mở dialog trước) -> backend chỉ xử lý ở LẦN ĐẦU chuyển vào Hủy (xem
  // updateTask, task.service.ts), bấm lại nút này không còn tác dụng gì —
  // khóa nút, không cho bấm lại, tránh hiểu nhầm là xin hủy lại được.
  if (progressDialogTask?.trang_thai === "Hủy") {
    btn.textContent = "Nhiệm vụ đã hủy";
    btn.disabled = true;
    btn.classList.remove("btn-delete", "btn-exclude");
    btn.classList.add("btn-muted-disabled");
    return;
  }
  btn.disabled = false;
  btn.classList.remove("btn-muted-disabled");
  btn.textContent = progressCancelRequested ? "Bỏ xin Hủy nhiệm vụ" : "Xin Hủy nhiệm vụ";
  btn.classList.toggle("btn-exclude", progressCancelRequested);
  btn.classList.toggle("btn-delete", !progressCancelRequested);
}

// % thời gian mục tiêu (đầu tháng backlog -> Deadline task) đã trôi qua —
// BẢN SAO công thức ở computeElapsedFraction (task.service.ts), chỉ để
// quyết định UI (hiện cảnh báo/bắt nhập task thay thế); server luôn tính
// lại và validate đúng, đây không phải nguồn sự thật cuối cùng.
function clientComputeElapsedFraction(task) {
  if (!task?.deadline) return null;
  const period = state.periods.find((p) => p.id === task.period_id);
  if (!period) return null;
  const start = new Date(period.year, period.month - 1, 1).getTime();
  const end = new Date(task.deadline).getTime();
  if (!Number.isFinite(end)) return null;
  const total = end - start;
  if (total <= 0) return Infinity;
  return Math.max(0, (Date.now() - start) / total);
}

function cancelPenaltyTierLabel(fraction) {
  if (fraction >= 0.75) return 5;
  if (fraction >= 2 / 3) return 10;
  return 50;
}

// Chỉ hiện cảnh báo/form task thay thế khi ĐANG xin Hủy (nút toggle) VÀ
// task chưa ở trạng thái Hủy từ trước — khớp đúng điều kiện backend (chỉ
// xử lý ở lần đầu chuyển vào Hủy, xem updateTask, task.service.ts).
function updateProgressCancelWarning() {
  const warningEl = document.getElementById("progress-cancel-warning");
  const replacementWrap = document.getElementById("progress-cancel-replacement");
  const isNewCancel = progressCancelRequested && progressDialogTask?.trang_thai !== "Hủy";
  if (!isNewCancel) {
    warningEl.hidden = true;
    replacementWrap.hidden = true;
    return;
  }
  const fraction = clientComputeElapsedFraction(progressDialogTask);
  if (fraction === null) {
    warningEl.hidden = true;
    replacementWrap.hidden = true;
    return;
  }
  if (fraction < 0.25) {
    warningEl.hidden = true;
    replacementWrap.hidden = false;
  } else {
    replacementWrap.hidden = true;
    warningEl.hidden = false;
    warningEl.textContent = `Đã trôi qua ${Math.round(Math.min(fraction, 1) * 100)}% thời gian deadline — Xin hủy lúc này sẽ tự động chấm ${cancelPenaltyTierLabel(fraction)}%.`;
  }
}

document.getElementById("progress-request-cancel-btn").addEventListener("click", () => {
  progressCancelRequested = !progressCancelRequested;
  updateRequestCancelBtnUI();
  updateProgressCancelWarning();
});

el.progressCancelBtn.addEventListener("click", () => el.progressDialog.close());

el.progressForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("progress-task-id").value;
  const payload = {
    phan_tram_hoan_thanh: Number(document.getElementById("progress-phan-tram").value) || 0,
    // Xin Hủy (nút toggle) ghi đè Trạng thái thành "Hủy" bất kể select đang
    // chọn gì — "Hủy" không còn là 1 lựa chọn trong select nữa.
    trang_thai: progressCancelRequested ? "Hủy" : document.getElementById("progress-trang-thai").value,
    tien_do: document.getElementById("progress-tien-do").value.trim() || undefined,
  };

  const replacementWrap = document.getElementById("progress-cancel-replacement");
  if (!replacementWrap.hidden) {
    const nhiemVu = document.getElementById("progress-cancel-replacement-nhiemvu").value.trim();
    if (!nhiemVu) {
      showToast("Hãy nhập Nhiệm vụ thay thế để hủy task này.");
      return;
    }
    payload.replacement_task = {
      team: progressDialogTask?.team,
      department_id: progressDialogTask?.department_id ?? undefined,
      nhiem_vu: nhiemVu,
    };
  }

  try {
    await api(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    el.progressDialog.close();
    await loadTasks();
    showToast("Đã cập nhật tiến độ.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Nhân sự tham gia task (quản lý sâu hơn: ai làm task này, vai trò gì —
// VD 1 task dự án phần mềm có SM, PO, Dev, QA cùng tham gia) ----

async function openTaskMemberDialog(task) {
  if (!task) return;
  state.taskMemberTaskId = task.id;
  // % Đánh giá của task (cpo_danh_gia) — có giá trị thì mới hiện phần phân
  // bổ tỷ lệ đóng góp/điểm cá nhân, task chưa chấm điểm thì chưa có gì để
  // quy đổi.
  state.taskMemberTaskScore = task.cpo_danh_gia;
  const graded = state.taskMemberTaskScore != null;
  el.taskMemberDialogTitle.textContent = `Nhân sự tham gia: ${task.nhiem_vu}`;
  el.taskMemberDialogTeam.textContent = `Team ${task.team}`;
  // Mặc định luôn ĐÓNG khung "Thêm nhân sự" mỗi lần mở dialog — phần lớn
  // lượt mở popup này là để XEM danh sách đã gán, chỉ cần mở khung khi
  // thật sự muốn thêm người mới.
  document.getElementById("tm-add-frame-toggle").setAttribute("aria-expanded", "false");
  document.getElementById("tm-add-frame-body").hidden = true;
  el.taskMemberScoreRow.hidden = !graded;
  el.taskMemberScoreBadge.textContent = graded ? `% Đánh giá: ${state.taskMemberTaskScore}%` : "";
  state.taskMemberScoreUnit = "percent";
  el.tmScoreUnit.value = "percent";
  // Tạm bỏ lựa chọn "Thang điểm 5" ở Đơn vị điểm cá nhân cho mọi phòng ban
  // (trước đây chỉ ẩn với phòng tính KPI theo task, nay bỏ luôn với phòng
  // tính KPI theo team để tránh nhầm đơn vị).
  const scale5Option = document.getElementById("tm-score-unit-scale5");
  if (scale5Option) scale5Option.hidden = true;
  fillTaskMemberCategorySelect();
  renderTaskMemberThead();
  await loadTaskMembers();
  el.taskMemberDialog.showModal();
}

function fillTaskMemberCategorySelect() {
  el.tmCategory.innerHTML =
    `<option value="">— Không —</option>` +
    state.memberParticipationOptions.map((p) => `<option value="${p.ten_phan_loai}">${p.ten_phan_loai}</option>`).join("");
}

function renderTaskMemberThead() {
  const graded = state.taskMemberTaskScore != null;
  // Tỷ lệ đóng góp KHÔNG phụ thuộc điểm task — luôn hiện được, kể cả task
  // chưa chấm điểm. Điểm cá nhân thì cần % Đánh giá của task để quy đổi nên
  // vẫn chỉ hiện khi đã chấm điểm.
  el.taskMemberThead.innerHTML = `<tr>
    <th style="width:190px">Nhân sự</th>
    <th style="width:190px">Vai trò</th>
    <th style="width:150px">Phân loại</th>
    <th style="width:120px">Tỷ lệ đóng góp (%)</th>
    ${graded ? '<th style="width:140px">Điểm cá nhân</th>' : ""}
    <th style="width:570px">Nội dung công việc</th>
    <th style="width:190px">Ghi chú</th>
    <th style="width:56px"></th>
  </tr>`;
}

// Chọn nhân sự từ danh sách nhân sự đã khai báo của tháng đang xem (giống
// nguồn dữ liệu ở trang Team & Nhân sự) — bớt các nhân sự đã gán vào task
// này rồi (1 người chỉ tham gia 1 lần / task, "vai trò" hiển thị ở bảng bên
// trên lấy thẳng theo Chức vụ có sẵn của người đó, không chọn riêng ở đây).
// Gợi ý gõ tìm tự vẽ bằng div (không dùng <input list> + <datalist>) vì bên
// trong <dialog>, Chrome định vị popup gợi ý của datalist sai chỗ (bung ra
// góc màn hình thay vì ngay dưới ô nhập) — lỗi UI gốc trình duyệt, không
// sửa được bằng CSS.
function fillTaskMemberSelect() {
  const assignedIds = new Set(state.taskMembers.map((tm) => tm.member_id));
  state.taskMemberAvailable = state.members.filter((m) => !assignedIds.has(m.id));
  state.taskMemberSelectedId = null;
  el.tmMember.value = "";
  el.tmMember.disabled = state.taskMemberAvailable.length === 0;
  el.tmMember.placeholder = state.taskMemberAvailable.length > 0 ? "Gõ tên để tìm..." : "Đã gán hết nhân sự";
  hideTaskMemberSuggestions();
}

function taskMemberLabel(m) {
  return `${m.name}${m.team_name ? " (" + m.team_name + ")" : ""}`;
}

function hideTaskMemberSuggestions() {
  el.tmMemberSuggestions.hidden = true;
}

function renderTaskMemberSuggestions() {
  const q = el.tmMember.value.trim().toLowerCase();
  const matches = state.taskMemberAvailable.filter((m) => !q || taskMemberLabel(m).toLowerCase().includes(q));
  el.tmMemberSuggestions.innerHTML = matches.length
    ? matches
        .slice(0, 30)
        .map((m) => `<div class="tm-suggest-item" data-id="${m.id}">${taskMemberLabel(m)}</div>`)
        .join("")
    : `<div class="tm-suggest-empty">Không tìm thấy nhân sự phù hợp.</div>`;
  el.tmMemberSuggestions.hidden = false;

  el.tmMemberSuggestions.querySelectorAll(".tm-suggest-item").forEach((item) => {
    // mousedown (không phải click) để chạy TRƯỚC sự kiện blur của input —
    // giữ được lựa chọn thay vì bị ẩn gợi ý mất trước khi kịp xử lý.
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const id = Number(item.dataset.id);
      const m = state.taskMemberAvailable.find((x) => x.id === id);
      el.tmMember.value = m ? taskMemberLabel(m) : "";
      state.taskMemberSelectedId = id;
      hideTaskMemberSuggestions();
    });
  });
}

el.tmMember.addEventListener("input", () => {
  state.taskMemberSelectedId = null; // sửa lại chữ thì phải chọn lại từ gợi ý
  if (!el.tmMember.disabled) renderTaskMemberSuggestions();
});
el.tmMember.addEventListener("focus", () => {
  if (!el.tmMember.disabled) renderTaskMemberSuggestions();
});
el.tmMember.addEventListener("blur", () => hideTaskMemberSuggestions());

async function loadTaskMembers() {
  if (!state.taskMemberTaskId) return;
  state.taskMembers = await api(`/api/tasks/${state.taskMemberTaskId}/members`);
  renderTaskMembers();
  fillTaskMemberSelect();
}

const round2 = (n) => Math.round(n * 100) / 100;
const percentToScale5 = (p) => round2(p / 20);
const scale5ToPercent = (s) => round2(s * 20);

function renderTaskMembers() {
  const graded = state.taskMemberTaskScore != null;
  el.taskMemberEmpty.hidden = state.taskMembers.length > 0;
  el.taskMemberScoreRow.hidden = !graded;
  el.taskMemberUnitRow.hidden = !graded;
  // Tổng tỷ lệ đóng góp đã phân bổ không phụ thuộc điểm task — luôn hiện.
  el.taskMemberTotalRow.hidden = false;
  const unit = state.taskMemberScoreUnit;

  el.taskMemberTbody.innerHTML = state.taskMembers
    .map((tm) => {
      const contrib = tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : null;
      // Tỷ lệ đóng góp giữa các nhân sự cho task — không cần task đã chấm
      // điểm mới chia được, nên luôn hiện cột này.
      const contribCell = `<td><input type="number" class="inline-cell-input tm-contrib-input" data-id="${tm.id}" min="0" max="100" step="0.1" value="${contrib ?? ""}" placeholder="—" style="width:76px" /></td>`;
      let scoreCell = "";
      if (graded) {
        // Công thức tự tính (áp dụng mọi phòng ban, không phân biệt
        // theo_team/theo_task nữa — khớp đúng công thức đã dùng ở "Điểm cá
        // nhân (Tính theo task)"/tong_diem, xem taskMember.service.ts):
        // task "Hỗ trợ" nhân Tỷ lệ đóng góp; "Thực hiện chính" (hoặc chưa
        // phân loại) thì thẳng % Đánh giá, KHÔNG nhân Tỷ lệ đóng góp — tránh
        // task nhiều người chia sẻ (tỷ lệ thấp) bị kéo điểm xuống so với
        // task 1 người làm trọn (100%) dù % Đánh giá như nhau.
        const auto =
          tm.phan_loai === HO_TRO_LABEL
            ? contrib != null
              ? round2((state.taskMemberTaskScore * contrib) / 100)
              : null
            : state.taskMemberTaskScore;
        const isManual = tm.diem_ca_nhan != null;
        const rawPercent = isManual ? Number(tm.diem_ca_nhan) : auto;
        const displayScore = rawPercent == null ? "" : unit === "scale5" ? percentToScale5(rawPercent) : rawPercent;
        const autoTitle =
          tm.phan_loai === HO_TRO_LABEL
            ? "Tự tính (Hỗ trợ) = % Đánh giá của task × Tỷ lệ đóng góp"
            : "Tự tính (Thực hiện chính) = thẳng % Đánh giá của task, không nhân Tỷ lệ đóng góp";
        // Dùng grid 2 cột CỐ ĐỊNH (không phải flex) — cột 1 luôn đúng 64px
        // cho ô nhập, bất kể phần đuôi (icon "↺" hay chữ "(tự tính)") dài
        // ngắn khác nhau — đảm bảo số luôn nằm cùng 1 vị trí giữa các dòng
        // (flex justify-content trước đó vẫn bị lệch do rộng phần đuôi
        // khác nhau ảnh hưởng tới layout tổng — xem ảnh chụp user gửi).
        scoreCell = `
      <td>
        <div style="display:grid;grid-template-columns:64px 1fr;align-items:center;gap:4px">
          <input type="number" class="inline-cell-input tm-score-input" data-id="${tm.id}" step="0.1" value="${displayScore}" placeholder="—" style="width:64px" />
          ${
            isManual
              ? `<span class="pill-x tm-score-reset" data-id="${tm.id}" title="Xóa điểm nhập tay, về tự tính theo %" style="justify-self:start">↺</span>`
              : `<span class="muted" style="font-size:0.68rem;white-space:nowrap;justify-self:start" title="${autoTitle}">(tự tính)</span>`
          }
        </div>
      </td>`;
      }
      const categoryOptions =
        `<option value="">— Không —</option>` +
        state.memberParticipationOptions
          .map((p) => `<option value="${p.ten_phan_loai}"${p.ten_phan_loai === tm.phan_loai ? " selected" : ""}>${p.ten_phan_loai}</option>`)
          .join("");
      return `
    <tr data-id="${tm.id}">
      <td>${tm.member_name}</td>
      <td>${tm.member_chuc_vu ?? ""}</td>
      <td>
        <select class="tm-phanloai-select inline-cell-input ${memberParticipationColorClass(tm.phan_loai)}" data-id="${tm.id}" style="border:none;font-weight:600">${categoryOptions}</select>
      </td>
      ${contribCell}
      ${scoreCell}
      <td><input type="text" class="inline-cell-input tm-work-content-input" data-id="${tm.id}" value="${(tm.noi_dung_cong_viec ?? "").replace(/"/g, "&quot;")}" placeholder="—" style="width:100%;text-align:left" /></td>
      <td><input type="text" class="inline-cell-input tm-note-input" data-id="${tm.id}" value="${(tm.ghi_chu ?? "").replace(/"/g, "&quot;")}" placeholder="—" style="width:100%;text-align:left" /></td>
      <td><button type="button" class="small btn-delete tm-del-btn" data-id="${tm.id}" title="Bỏ khỏi task">×</button></td>
    </tr>`;
    })
    .join("");

  el.taskMemberTbody.querySelectorAll(".tm-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmDialog("Bỏ nhân sự này khỏi task?", { danger: false }))) return;
      try {
        await api(`/api/task-members/${btn.dataset.id}`, { method: "DELETE" });
        await loadTaskMembers();
        await loadTasks(); // cập nhật lại số đếm ở nút "Nhân sự (N)"
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  el.taskMemberTbody.querySelectorAll(".tm-phanloai-select").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await api(`/api/task-members/${select.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ phan_loai: select.value || null }),
        });
        await loadTaskMembers();
      } catch (err) {
        showToast(err.message);
        await loadTaskMembers();
      }
    });
  });

  // Tỷ lệ đóng góp sửa được kể cả task chưa chấm điểm.
  el.taskMemberTbody.querySelectorAll(".tm-contrib-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const val = input.value.trim();
      try {
        await api(`/api/task-members/${input.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ ty_le_dong_gop: val === "" ? null : Number(val) }),
        });
        await loadTaskMembers();
      } catch (err) {
        showToast(err.message);
        await loadTaskMembers(); // trả input về giá trị đã lưu (request bị từ chối)
      }
    });
  });

  // Nội dung công việc/Ghi chú — sửa trực tiếp trong bảng sau khi đã thêm
  // nhân sự (trước đây chỉ nhập được lúc thêm mới, không sửa lại được).
  el.taskMemberTbody.querySelectorAll(".tm-work-content-input").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await api(`/api/task-members/${input.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ noi_dung_cong_viec: input.value.trim() || null }),
        });
      } catch (err) {
        showToast(err.message);
        await loadTaskMembers();
      }
    });
  });
  el.taskMemberTbody.querySelectorAll(".tm-note-input").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        await api(`/api/task-members/${input.dataset.id}`, {
          method: "PUT",
          body: JSON.stringify({ ghi_chu: input.value.trim() || null }),
        });
      } catch (err) {
        showToast(err.message);
        await loadTaskMembers();
      }
    });
  });

  if (graded) {
    el.taskMemberTbody.querySelectorAll(".tm-score-input").forEach((input) => {
      input.addEventListener("change", async () => {
        const val = input.value.trim();
        const percentValue = val === "" ? null : state.taskMemberScoreUnit === "scale5" ? scale5ToPercent(Number(val)) : Number(val);
        try {
          await api(`/api/task-members/${input.dataset.id}`, {
            method: "PUT",
            body: JSON.stringify({ diem_ca_nhan: percentValue }),
          });
          await loadTaskMembers();
        } catch (err) {
          showToast(err.message);
          await loadTaskMembers();
        }
      });
    });
    el.taskMemberTbody.querySelectorAll(".tm-score-reset").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/task-members/${btn.dataset.id}`, {
            method: "PUT",
            body: JSON.stringify({ diem_ca_nhan: null }),
          });
          await loadTaskMembers();
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  updateTaskMemberTotalBadge();
}

function updateTaskMemberTotalBadge() {
  // Tổng tỷ lệ đóng góp không phụ thuộc điểm task — tính kể cả khi task
  // chưa chấm điểm.
  const total = round2(
    state.taskMembers.reduce((s, tm) => s + (tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : 0), 0),
  );
  el.taskMemberTotalBadge.textContent = `Tổng đã phân bổ: ${total}% / 100%`;
  el.taskMemberTotalBadge.className =
    "status-badge " + (Math.abs(total - 100) < 0.01 ? "status-hoan-thanh" : total > 100 ? "status-huy" : "status-default");
}

el.tmScoreUnit.addEventListener("change", () => {
  state.taskMemberScoreUnit = el.tmScoreUnit.value;
  renderTaskMembers();
});

// Chia đều tỷ lệ đóng góp cho tất cả nhân sự đang có trong task (làm tròn 1
// chữ số thập phân, dồn phần dư vào người cuối để tổng luôn đúng 100%). Áp
// dụng giảm trước/tăng sau để tổng không bao giờ tạm thời vượt quá 100% khi
// đang lưu tuần tự từng dòng (backend chặn cứng > 100%).
// Nhân sự "Hỗ trợ" mặc định 10% (vẫn sửa lại được sau) — phần còn lại
// (100% - tổng % của các "Hỗ trợ") mới chia đều cho các nhân sự còn lại
// (Thực hiện chính hoặc chưa phân loại). Nếu số "Hỗ trợ" quá nhiều (>10
// người, vượt 100% nếu giữ nguyên 10%/người) thì co lại đều nhau cho vừa
// 100%, tránh chặn cứng ở backend khi lưu.
const HO_TRO_LABEL = "Hỗ trợ";
const HO_TRO_DEFAULT_PERCENT = 10;

el.tmSplitEvenBtn.addEventListener("click", async () => {
  const members = state.taskMembers;
  if (members.length === 0) return;

  const supportMembers = members.filter((tm) => tm.phan_loai === HO_TRO_LABEL);
  const mainMembers = members.filter((tm) => tm.phan_loai !== HO_TRO_LABEL);

  const perSupport =
    supportMembers.length * HO_TRO_DEFAULT_PERCENT > 100
      ? round2(100 / supportMembers.length)
      : HO_TRO_DEFAULT_PERCENT;
  const supportTotal = round2(perSupport * supportMembers.length);
  const remaining = Math.max(0, round2(100 - supportTotal));

  let mainValues = [];
  if (mainMembers.length > 0) {
    const base = Math.floor((remaining / mainMembers.length) * 10) / 10;
    mainValues = new Array(mainMembers.length).fill(base);
    mainValues[mainValues.length - 1] = round2(base + round2(remaining - base * mainMembers.length));
  }

  const updates = [
    ...supportMembers.map((tm) => ({
      id: tm.id,
      newVal: perSupport,
      delta: perSupport - (tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : 0),
    })),
    ...mainMembers.map((tm, i) => ({
      id: tm.id,
      newVal: mainValues[i],
      delta: mainValues[i] - (tm.ty_le_dong_gop != null ? Number(tm.ty_le_dong_gop) : 0),
    })),
  ].sort((a, b) => a.delta - b.delta); // giảm trước, tăng sau — tránh tổng tạm thời vượt 100%

  try {
    for (const u of updates) {
      await api(`/api/task-members/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ ty_le_dong_gop: u.newVal }),
      });
    }
    await loadTaskMembers();
    showToast("Đã chia đều tỷ lệ đóng góp.", "success");
  } catch (err) {
    showToast(err.message);
    await loadTaskMembers();
  }
});

document.getElementById("tm-add-frame-toggle").addEventListener("click", () => {
  const toggle = document.getElementById("tm-add-frame-toggle");
  const body = document.getElementById("tm-add-frame-body");
  const expanded = toggle.getAttribute("aria-expanded") !== "false";
  toggle.setAttribute("aria-expanded", String(!expanded));
  body.hidden = expanded;
});

el.tmAddBtn.addEventListener("click", async () => {
  const memberId = state.taskMemberSelectedId;
  if (!memberId) {
    showToast("Gõ tên và chọn đúng 1 nhân sự trong danh sách gợi ý.");
    return;
  }
  try {
    await api(`/api/tasks/${state.taskMemberTaskId}/members`, {
      method: "POST",
      body: JSON.stringify({
        member_id: memberId,
        phan_loai: el.tmCategory.value || undefined,
        noi_dung_cong_viec: el.tmWorkContent.value.trim() || undefined,
        ghi_chu: el.tmNote.value.trim() || undefined,
      }),
    });
    el.tmWorkContent.value = "";
    el.tmNote.value = "";
    el.tmCategory.value = "";
    await loadTaskMembers();
    await loadTasks();
    showToast("Đã thêm nhân sự.", "success");
  } catch (err) {
    showToast(err.message);
  }
});

el.taskMemberCloseBtn.addEventListener("click", () => el.taskMemberDialog.close());

// ---- Export ----

el.exportBtn.addEventListener("click", () => {
  if (!state.currentPeriodId) {
    showToast("Hãy chọn một tháng backlog trước.");
    return;
  }
  const query = state.taskFilters.team
    ? `?team=${encodeURIComponent(state.taskFilters.team)}`
    : "";
  window.location.href = `/api/periods/${state.currentPeriodId}/tasks/export${query}`;
});

// ---- Thanh cuộn ngang phía trên bảng Nhiệm vụ ----
// Bảng Nhiệm vụ có tới 15-16 cột, thanh cuộn ngang mặc định của trình
// duyệt chỉ nằm ở CUỐI bảng (#task-table-wrap) — phải cuộn dọc hết bảng
// mới thấy được để kéo qua lại. Thêm 1 thanh giả (#task-table-scroll-top)
// PHÍA TRÊN, đồng bộ 2 chiều với thanh thật bên dưới; bề rộng thanh giả
// (spacer) khớp đúng scrollWidth thật của bảng qua ResizeObserver — tự cập
// nhật mỗi khi bảng đổi kích thước (đổi trang, ẩn/hiện cột Team theo
// cach_tinh_kpi, resize cửa sổ...), không cần sửa gì trong renderTasks().
function setupTaskScrollTopSync() {
  const top = document.getElementById("task-table-scroll-top");
  const spacer = document.getElementById("task-table-scroll-top-spacer");
  const wrap = document.getElementById("task-table-wrap");
  const table = document.getElementById("task-table");
  if (!top || !spacer || !wrap || !table) return;

  function syncWidth() {
    spacer.style.width = `${table.scrollWidth}px`;
    // Bảng không cần cuộn ngang (màn hình đủ rộng) thì ẩn hẳn thanh giả,
    // đỡ chiếm chỗ vô ích.
    top.hidden = table.scrollWidth <= wrap.clientWidth;
  }

  // Cờ chặn vòng lặp vô hạn (2 bên cùng lắng nghe "scroll" của nhau, set
  // scrollLeft của bên kia lại kích hoạt sự kiện "scroll" của chính nó).
  let syncing = false;
  top.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    wrap.scrollLeft = top.scrollLeft;
    syncing = false;
  });
  wrap.addEventListener("scroll", () => {
    if (syncing) return;
    syncing = true;
    top.scrollLeft = wrap.scrollLeft;
    syncing = false;
  });

  syncWidth();
  new ResizeObserver(syncWidth).observe(table);
  window.addEventListener("resize", syncWidth);
}
setupTaskScrollTopSync();

