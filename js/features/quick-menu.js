"use strict";

export function createQuickMenu({
  $,
  showForm,
  setCurrentId,
  bulkActions,
  expanded,
  renderRecords,
  getViewMode,
  setViewMode,
  getCustomColumns = () => 3,
  setCustomColumns = () => {}
}) {
  if ($("quick-menu")) return;

  const menu = document.createElement("aside");
  menu.id = "quick-menu";
  menu.className = "quick-menu";
  menu.setAttribute("aria-label", "Record shortcuts");

  menu.innerHTML = `
    <button type="button" class="quick-menu-toggle"
      data-action="toggle" title="Show shortcuts"
      aria-label="Show shortcuts" aria-expanded="false">
      <i data-lucide="chevron-left" aria-hidden="true"></i>
    </button>

    <div class="quick-menu-content">
      <p class="quick-menu-heading">RECORD SHORTCUTS</p>

      <button type="button" data-action="new" title="New record">
        <i data-lucide="plus-circle" aria-hidden="true"></i>
        <span class="shortcut-label">New record</span>
      </button>

      <button type="button" data-action="paste" title="Paste records">
        <i data-lucide="clipboard-paste" aria-hidden="true"></i>
        <span class="shortcut-label">Paste</span>
      </button>

      <button type="button" data-action="select" title="Selection mode">
        <i data-lucide="list-checks" aria-hidden="true"></i>
        <span class="shortcut-label">Select records</span>
      </button>

      <button type="button" data-action="expand" title="Expand or collapse previews">
        <i data-lucide="chevrons-up-down" aria-hidden="true"></i>
        <span class="shortcut-label">Toggle details</span>
      </button>

      <div class="quick-menu-divider"></div>

      <button type="button" data-action="search" title="Search records">
        <i data-lucide="search" aria-hidden="true"></i>
        <span class="shortcut-label">Search</span>
      </button>

      <button type="button" data-action="filters" title="Advanced filters">
        <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
        <span class="shortcut-label">Advanced filters</span>
      </button>

      <button type="button" data-action="types" title="Filter by type"
        aria-expanded="false">
        <i data-lucide="tags" aria-hidden="true"></i>
        <span class="shortcut-label">Types</span>
        <i class="quick-menu-chevron" data-lucide="chevron-down"
          aria-hidden="true"></i>
      </button>

      <div id="quick-menu-types" class="quick-menu-types" hidden></div>

      <div class="quick-menu-divider"></div>

      <button type="button" data-action="list" title="List view">
        <i data-lucide="list" aria-hidden="true"></i>
        <span class="shortcut-label">List view</span>
      </button>

      <button type="button" data-action="grid" title="Grid view">
        <i data-lucide="grid-2x2" aria-hidden="true"></i>
        <span class="shortcut-label">Grid view</span>
      </button>

      <button type="button" data-action="custom" title="Custom grid view">
        <i data-lucide="layout-grid" aria-hidden="true"></i>
        <span class="shortcut-label">Custom Grid</span>
      </button>

      <div id="quick-menu-custom-settings" class="quick-menu-custom-settings" hidden>
        <label for="quick-menu-custom-columns">Grid columns</label>
        <select id="quick-menu-custom-columns">
          <option value="2">2 columns</option>
          <option value="3">3 columns</option>
          <option value="4">4 columns</option>
          <option value="5">5 columns</option>
          <option value="6">6 columns</option>
        </select>
      </div>
    </div>
  `;

  const style = document.createElement("style");
  style.id = "quick-menu-styles";
  style.textContent = `
    #quick-menu.quick-menu {
      position: fixed;
      z-index: 1200;
      top: 100px;
      left: 14px;
      right: auto;
      width: 254px;
      max-height: calc(100vh - 124px);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0;
      padding: 9px;
      overflow: visible;
      box-sizing: border-box;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 12px 40px #0005;
      transform: translateX(0);
      transition: transform .2s ease;
    }

    #quick-menu.quick-menu[hidden] {
      display: none !important;
    }

    #quick-menu.quick-menu:not(.open) {
      transform: translateX(calc(-100% - 14px));
    }

    #quick-menu .quick-menu-toggle {
      position: absolute;
      top: 10px;
      left: auto;
      right: -36px;
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      min-height: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid var(--border);
      border-left: 0;
      border-radius: 0 10px 10px 0;
      background: var(--panel);
      color: var(--text);
      transform: none;
      cursor: pointer;
    }

    #quick-menu .quick-menu-toggle svg {
      width: 19px;
      height: 19px;
      transform: rotate(180deg);
      transition: transform .2s ease;
    }

    #quick-menu.open .quick-menu-toggle svg {
      transform: rotate(0deg);
    }

    #quick-menu .quick-menu-content {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
      gap: 5px;
      min-width: 0;
      max-height: calc(100vh - 144px);
      overflow-x: hidden;
      overflow-y: auto;
    }

    #quick-menu .quick-menu-heading {
      display: block;
      margin: 5px 8px 9px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 750;
      letter-spacing: .12em;
    }

    #quick-menu .quick-menu-content > button {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      width: 100%;
      min-width: 0;
      min-height: 40px;
      height: auto;
      padding: 9px 10px;
      border: 1px solid transparent;
      border-radius: 9px;
      background: transparent;
      color: var(--muted);
      text-align: left;
      cursor: pointer;
    }

    #quick-menu .quick-menu-content > button:hover,
    #quick-menu .quick-menu-content > button.active {
      border-color: var(--border);
      background: #252130;
      color: var(--accent);
    }

    #quick-menu .quick-menu-content > button > svg {
      display: block;
      flex: 0 0 18px;
      width: 18px;
      height: 18px;
    }

    #quick-menu .shortcut-label {
      display: block;
      flex: 1;
      min-width: 0;
      color: inherit;
      font-size: 12px;
      line-height: 1.35;
      text-align: left;
      white-space: normal;
    }

    #quick-menu .quick-menu-chevron {
      flex: 0 0 14px !important;
      width: 14px !important;
      height: 14px !important;
      margin-left: auto;
    }

    #quick-menu .quick-menu-divider {
      display: block;
      flex: none;
      height: 1px;
      margin: 5px 3px;
      background: var(--border);
    }

    #quick-menu .quick-menu-types {
      position: fixed;
      z-index: 1210;
      display: grid;
      gap: 4px;
      width: 220px;
      max-height: min(320px, calc(100vh - 24px));
      overflow-y: auto;
      padding: 5px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #17171e;
      box-shadow: 0 12px 32px #0008;
    }

    #quick-menu .quick-menu-types[hidden] {
      display: none !important;
    }

    #quick-menu .quick-menu-custom-settings {
      display: grid;
      gap: 6px;
      padding: 8px 10px 10px 38px;
    }

    #quick-menu .quick-menu-custom-settings[hidden] {
      display: none !important;
    }

    #quick-menu .quick-menu-custom-settings label {
      color: var(--muted);
      font-size: 11px;
    }

    #quick-menu .quick-menu-custom-settings select {
      width: 100%;
      padding: 7px;
      font-size: 12px;
    }

    #quick-menu .quick-menu-types button {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      width: 100%;
      min-height: 35px;
      height: auto;
      padding: 8px;
      border: 1px solid transparent;
      border-radius: 7px;
      background: transparent;
      color: var(--text);
      text-align: left;
      font-size: 12px;
      cursor: pointer;
    }

    #quick-menu .quick-menu-types button:hover,
    #quick-menu .quick-menu-types button.active {
      border-color: var(--border);
      background: #292532;
    }

    #quick-menu .quick-menu-types .type-check {
      display: block;
      flex: 0 0 16px;
      width: 16px;
      color: var(--accent);
      text-align: center;
    }

    @media (max-width: 760px) {
      #quick-menu.quick-menu {
        top: 82px;
        left: 8px;
        right: auto;
        bottom: auto;
        width: min(254px, calc(100vw - 54px));
        max-height: calc(100vh - 98px);
      }

      #quick-menu .quick-menu-content {
        max-height: calc(100vh - 118px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      #quick-menu.quick-menu,
      #quick-menu .quick-menu-toggle svg {
        transition: none;
      }
    }
  `;

  document.head.querySelector("#quick-menu-styles")?.remove();
  document.head.append(style);
  document.body.append(menu);

  const toggle = menu.querySelector(".quick-menu-toggle");
  const typesPanel = $("quick-menu-types");
  const typesButton = menu.querySelector('[data-action="types"]');
  const customSettings = $("quick-menu-custom-settings");
  const customColumnsSelect = $("quick-menu-custom-columns");
  const recordsView = $("records-view");

  function paintIcons(root = menu) {
    try {
      window.lucide?.createIcons?.({ root });
    } catch (error) {
      console.warn("Could not render shortcut icons.", error);
    }
  }

  function setOpen(open) {
    menu.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Hide shortcuts" : "Show shortcuts");
    toggle.title = open ? "Hide shortcuts" : "Show shortcuts";
  }

  function syncVisibility() {
    const recordsActive = recordsView && !recordsView.hidden;
    menu.hidden = !recordsActive;

    if (!recordsActive) {
      typesPanel.hidden = true;
      typesButton.setAttribute("aria-expanded", "false");
    }
  }

  function updateViewButtons() {
    menu.querySelectorAll(
      '[data-action="list"], [data-action="grid"], [data-action="custom"]'
    ).forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.action === getViewMode()
      );
    });

    customSettings.hidden = getViewMode() !== "custom";
    customColumnsSelect.value = String(getCustomColumns());
  }

  function positionTypesPanel() {
    const rect = typesButton.getBoundingClientRect();
    const panelWidth = 220;
    const panelHeight = Math.min(
      typesPanel.scrollHeight || 260,
      window.innerHeight - 24
    );
    const gap = 8;

    let left = rect.right + gap;

    if (left + panelWidth > window.innerWidth - 8) {
      left = rect.left - panelWidth - gap;
    }

    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));

    let top = rect.top;
    top = Math.max(8, Math.min(top, window.innerHeight - panelHeight - 8));

    typesPanel.style.left = left + "px";
    typesPanel.style.top = top + "px";
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function renderTypes() {
    const categories = $("categories");
    if (!categories) return;

    const sourceButtons = [...categories.querySelectorAll("[data-type]")];

    typesPanel.innerHTML = sourceButtons.map(sourceButton => {
      const type = sourceButton.dataset.type;
      const selected = sourceButton.classList.contains("active");
      const label = sourceButton.textContent.trim();

      return `
        <button type="button"
          data-type="${escapeHTML(type)}"
          class="${selected ? "active" : ""}">
          <span class="type-check">${selected ? "✓" : ""}</span>
          <span>${escapeHTML(label)}</span>
        </button>
      `;
    }).join("");

    typesPanel.querySelectorAll("button[data-type]").forEach(button => {
      button.addEventListener("click", () => {
        const type = button.dataset.type;
        const original = [...categories.querySelectorAll("[data-type]")]
          .find(item => item.dataset.type === type);

        if (original) original.click();

        renderTypes();
        paintIcons(typesPanel);
      });
    });
  }

  toggle.addEventListener("click", () => {
    setOpen(!menu.classList.contains("open"));
  });

  menu.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    switch (button.dataset.action) {
      case "toggle":
        break;

      case "new":
        setCurrentId(null);
        showForm();
        break;

      case "paste":
        bulkActions.pasteClipboard();
        break;

      case "select":
        bulkActions.startSelectionMode();
        break;

      case "expand": {
        const visibleIds = [
          ...$("records").querySelectorAll("[data-open]")
        ].map(element => element.dataset.open);

        if (!visibleIds.length) return;

        const allExpanded = visibleIds.every(id => expanded.has(id));

        visibleIds.forEach(id => {
          if (allExpanded) expanded.delete(id);
          else expanded.add(id);
        });

        renderRecords();
        break;
      }

      case "search":
        setOpen(true);
        $("search")?.focus();
        $("search")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        break;

      case "filters":
        setOpen(true);
        $("toggle-filters")?.click();
        $("advanced-filter-content")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        break;

      case "types": {
        setOpen(true);

        if (typesPanel.hidden) {
          renderTypes();
          typesPanel.hidden = false;
          positionTypesPanel();
        } else {
          typesPanel.hidden = true;
        }

        typesButton.setAttribute(
          "aria-expanded",
          String(!typesPanel.hidden)
        );

        paintIcons(typesPanel);
        break;
      }

      case "list":
        setViewMode("list");
        renderRecords();
        updateViewButtons();
        break;

      case "grid":
        setViewMode("grid");
        renderRecords();
        updateViewButtons();
        break;

      case "custom":
        setViewMode("custom");
        renderRecords();
        updateViewButtons();
        break;
    }
  });

  customColumnsSelect.addEventListener("change", () => {
    setCustomColumns(Number(customColumnsSelect.value));
    renderRecords();
    updateViewButtons();
  });

  window.addEventListener("resize", () => {
    if (!typesPanel.hidden) positionTypesPanel();
  });

  window.addEventListener("scroll", () => {
    if (!typesPanel.hidden) positionTypesPanel();
  }, true);

  const categoriesObserver = new MutationObserver(() => {
    if (!typesPanel.hidden) renderTypes();
  });

  if ($("categories")) {
    categoriesObserver.observe($("categories"), {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (recordsView) {
    new MutationObserver(syncVisibility).observe(recordsView, {
      attributes: true,
      attributeFilter: ["hidden"]
    });
  }

  setOpen(false);
  syncVisibility();
  updateViewButtons();
  paintIcons();

  return { updateViewButtons };
}
