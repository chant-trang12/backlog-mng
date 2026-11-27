// ---- Cột "Thao tác" trong bảng: thu gọn nút (kiểu vConsole) ----
// Mỗi bảng tự dựng nút trong <td><div class="actions-cell">...</div></td> (nhiều
// file JS khác nhau). File này hậu xử lý MỌI .actions-cell sau khi bảng vẽ xong
// (MutationObserver), không phải sửa từng file:
//  - Nút "Sửa" / "Xóa" / "Xem" -> nút chỉ có biểu tượng (chữ vẫn giữ trong
//    title + aria-label + span ẩn, nên code nào đọc textContent vẫn đúng).
//  - Ô có nút chữ khác (Chấm điểm, Cập nhật tiến độ, Nhân sự...) -> giữ nút
//    biểu tượng ở ngoài, gom phần còn lại vào menu "⋯" (Xóa luôn xếp cuối).
// Nút được DI CHUYỂN (không clone) và vẫn nằm trong đúng <tr>/<td> cũ: mọi
// listener đã gắn, mọi handler kiểu e.target.closest("tr") / ủy quyền trên
// <tbody> vẫn chạy y nguyên; class phân quyền (write-action, btn-delete...) giữ
// nguyên nên CSS ẩn theo vai trò vẫn đúng. Bỏ qua bảng nằm trong popup.
(function () {
  const ICONS = [
    { re: /^sửa$/i, icon: "i-pen" },
    { re: /^x[oó]a$|^xoá$/i, icon: "i-trash", danger: true },
    { re: /^(xem|xem chi tiết|chi tiết)$/i, icon: "i-eye" },
  ];
  const labelOf = (btn) => btn.textContent.replace(/\s+/g, " ").trim();
  const iconFor = (text) => ICONS.find((x) => x.re.test(text));
  const isDanger = (it) => !!it.def?.danger || it.btn.classList.contains("btn-delete");

  function toIconButton(btn, def, text) {
    btn.classList.add("ra-icon-btn");
    if (def.danger) btn.classList.add("ra-danger");
    if (!btn.title) btn.title = text;
    btn.setAttribute("aria-label", text);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon ra-icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `icons.svg#${def.icon}`);
    svg.appendChild(use);
    const sr = document.createElement("span");
    sr.className = "ra-sr";
    sr.textContent = text;
    btn.replaceChildren(svg, sr);
  }

  function labelHeader(cell) {
    const th = cell.closest("table")?.tHead?.rows[0]?.lastElementChild;
    if (th && th.tagName === "TH" && !th.textContent.trim() && !th.querySelector("input")) th.textContent = "Thao tác";
  }

  function syncMoreVisibility(cell) {
    const more = cell.querySelector(":scope > .ra-more");
    const menu = cell.querySelector(":scope > .ra-menu");
    if (!more || !menu) return;
    // Vai trò hiện tại có thể ẩn hết mục trong menu (CSS display:none theo data-role).
    const anyVisible = [...menu.children].some((b) => getComputedStyle(b).display !== "none");
    more.hidden = !anyVisible;
  }

  function enhance(cell) {
    if (cell.dataset.raDone || cell.closest("dialog")) return;
    const buttons = [...cell.children].filter((n) => n.tagName === "BUTTON");
    if (buttons.length === 0) return;
    cell.dataset.raDone = "1";
    cell.classList.add("ra-done");
    labelHeader(cell);

    const items = buttons.map((btn) => {
      const text = labelOf(btn);
      const def = iconFor(text);
      return { btn, text, def, compact: !!def || text.length <= 2 };
    });
    let inline = items.filter((i) => i.compact && !isDanger(i));
    let menuItems = items.filter((i) => !inline.includes(i));
    // Menu chỉ có 1 mục thì không cần menu — để tất cả ở ngoài.
    if (menuItems.length <= 1 || items.every((i) => i.compact)) {
      inline = items;
      menuItems = [];
    }
    inline.forEach((i) => i.def && toIconButton(i.btn, i.def, i.text));
    if (menuItems.length === 0) return;

    const more = document.createElement("button");
    more.type = "button";
    more.className = "small ra-more";
    more.title = "Thao tác khác";
    more.setAttribute("aria-label", "Thao tác khác");
    more.setAttribute("aria-haspopup", "menu");
    more.setAttribute("aria-expanded", "false");
    more.textContent = "⋯";

    const menu = document.createElement("div");
    menu.className = "ra-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    [...menuItems.filter((i) => !isDanger(i)), ...menuItems.filter(isDanger)].forEach((i) => {
      i.btn.setAttribute("role", "menuitem");
      if (isDanger(i)) i.btn.classList.add("ra-danger");
      menu.appendChild(i.btn);
    });
    // Bấm vào khoảng trống trong menu: không để lọt xuống handler "bấm dòng mở chi tiết".
    menu.addEventListener("click", (e) => {
      if (!e.target.closest("button")) e.stopPropagation();
    });
    cell.append(more, menu);
    syncMoreVisibility(cell);
  }

  // ---- Mở/đóng menu "⋯" (position: fixed để không bị khung cuộn của bảng cắt) ----
  let openCell = null;

  function closeMenu() {
    if (!openCell) return;
    openCell.classList.remove("ra-open");
    const menu = openCell.querySelector(":scope > .ra-menu");
    if (menu) menu.hidden = true;
    openCell.querySelector(":scope > .ra-more")?.setAttribute("aria-expanded", "false");
    openCell = null;
  }

  function openMenu(cell) {
    closeMenu();
    const more = cell.querySelector(":scope > .ra-more");
    const menu = cell.querySelector(":scope > .ra-menu");
    if (!more || !menu) return;
    menu.hidden = false;
    cell.classList.add("ra-open");
    more.setAttribute("aria-expanded", "true");
    const r = more.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    openCell = cell;
  }

  // Ô Thao tác ghim mép phải (position: sticky): khi nút nhận focus bằng chuột,
  // trình duyệt cuộn khung bảng tới vị trí GỐC của ô (cuối bảng) -> bảng nhảy
  // ngang. Chặn focus do bấm chuột (sự kiện click vẫn chạy bình thường; dùng
  // bàn phím Tab vẫn focus được).
  document.addEventListener("mousedown", (e) => {
    if (e.button === 0 && e.target.closest(".actions-cell.ra-done button")) e.preventDefault();
  });

  document.addEventListener("click", (e) => {
    const more = e.target.closest(".ra-more");
    if (more) {
      const cell = more.closest(".actions-cell");
      if (openCell === cell) closeMenu();
      else openMenu(cell);
      return;
    }
    // Bấm 1 mục: listener riêng của nút đó đã chạy trước (nổi bọt) -> giờ đóng menu.
    closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openCell) {
      const more = openCell.querySelector(":scope > .ra-more");
      closeMenu();
      more?.focus();
    }
  });
  window.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);

  // ---- Theo dõi bảng vẽ lại ----
  function scan() {
    document.querySelectorAll("td > .actions-cell:not([data-ra-done])").forEach(enhance);
  }
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  scan();

  // Vai trò (data-role trên <body>) gắn sau khi kiểm tra đăng nhập — tính lại nút "⋯".
  new MutationObserver(() => document.querySelectorAll(".actions-cell.ra-done").forEach(syncMoreVisibility)).observe(
    document.body,
    { attributes: true, attributeFilter: ["data-role"] },
  );
})();
