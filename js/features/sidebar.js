
"use strict";

const $ = id => document.getElementById(id);

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

function paintSidebarIcons(root = document) {
  try {
    window.lucide?.createIcons?.({ root });
  } catch (error) {
    console.warn("Could not render sidebar icons.", error);
  }
}

function addSidebarStyles() {
  if ($("sidebar-styles")) return;

  const style = document.createElement("style");
  style.id = "sidebar-styles";
  style.textContent = `
    header {
      justify-content: flex-start;
      gap: 14px;
    }

    .sidebar-toggle {
      display: grid;
      place-items: center;
      flex: 0 0 42px;
      width: 42px;
      height: 42px;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--panel);
      color: var(--text);
    }

    .sidebar-toggle:hover,
    .sidebar-close:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .sidebar-toggle svg,
    .sidebar-close svg {
      width: 21px;
      height: 21px;
    }

    .brand {
      min-width: 0;
      margin-right: auto;
    }

    .sidebar-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1500;
      background: #080810aa;
      opacity: 0;
      visibility: hidden;
      transition: opacity .2s ease, visibility .2s ease;
    }

    .sidebar-backdrop.open {
      opacity: 1;
      visibility: visible;
    }

    .app-sidebar {
      position: fixed;
      z-index: 1501;
      inset: 0 auto 0 0;
      display: flex;
      flex-direction: column;
      gap: 22px;
      width: min(320px, calc(100vw - 48px));
      padding: 20px 16px;
      overflow-x: hidden;
      overflow-y: auto;
      background: var(--panel);
      border-right: 1px solid var(--border);
      box-shadow: 18px 0 55px #0004;
      transform: translateX(-105%);
      visibility: hidden;
      transition: transform .22s ease, visibility .22s ease;
    }

    .app-sidebar.open {
      transform: translateX(0);
      visibility: visible;
    }

    .sidebar-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .sidebar-heading strong {
      font-size: 16px;
    }

    .sidebar-heading small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 11px;
    }

    .sidebar-close {
      display: grid;
      place-items: center;
      flex: 0 0 38px;
      width: 38px;
      height: 38px;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: transparent;
      color: var(--text);
    }

    .sidebar-section-label {
      margin: 0 0 9px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 750;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .sidebar-navigation {
      display: grid;
      gap: 5px;
    }

    .sidebar-navigation .page-nav {
      display: grid;
      gap: 5px;
      margin: 0;
      padding: 0;
      background: transparent;
      border: 0;
    }

    .sidebar-navigation .nav-button {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 11px;
      width: 100%;
      min-height: 44px;
      padding: 11px 12px;
      border: 1px solid transparent;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      text-align: left;
      font-weight: 600;
    }

    .sidebar-navigation .nav-button svg {
      width: 19px;
      height: 19px;
      flex: 0 0 19px;
    }

    .sidebar-navigation .nav-button.active {
      border-color: #393047;
      background: #292532;
      color: var(--text);
      box-shadow: none;
    }

    .sidebar-navigation .nav-button:hover {
      color: var(--text);
      background: #23242b;
    }

    .sidebar-project-section {
      padding-top: 18px;
      border-top: 1px solid var(--border);
    }

    .app-sidebar .header-tools {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 9px;
      width: 100%;
      padding: 0;
    }

    .sidebar-project-picker {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #121318;
    }

    .sidebar-project-picker > svg {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      color: var(--accent);
    }

    .app-sidebar #project-switcher {
      min-width: 0;
      max-width: none;
      width: 100%;
      padding: 3px 22px 3px 0;
      border: 0;
      background: transparent;
      color: var(--text);
    }

    .app-sidebar #project-manage,
    .app-sidebar #trash-open {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      width: 100%;
      min-height: 43px;
      padding: 10px 12px;
      text-align: left;
    }

    .app-sidebar #project-manage svg,
    .app-sidebar #trash-open svg {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
    }

    .app-sidebar .projects-dropdown {
      position: static;
      width: 100%;
      margin-top: 0;
      box-shadow: none;
    }

    .projects-dropdown button {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .projects-dropdown button svg {
      flex: 0 0 17px;
      width: 17px;
      height: 17px;
    }

    .sidebar-footer {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
    }

    @media (min-width: 900px) {
      .app-sidebar {
        width: 300px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .app-sidebar,
      .sidebar-backdrop {
        transition: none;
      }
    }
  `;

  document.head.append(style);
}

function setupSidebar() {
  const header = document.querySelector("header");
  const brand = header?.querySelector(".brand");
  const navigation = document.querySelector(".page-nav");
  const headerTools = document.querySelector(".header-tools");

  if (!header || !brand || !navigation || !headerTools) return;

  // Avoid duplicate sidebars if the module is loaded more than once.
  if ($("app-sidebar")) return;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "sidebar-toggle";
  toggle.className = "sidebar-toggle";
  toggle.setAttribute("aria-label", "Open navigation menu");
  toggle.setAttribute("aria-controls", "app-sidebar");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';

  header.insertBefore(toggle, brand);

  const backdrop = document.createElement("div");
  backdrop.id = "sidebar-backdrop";
  backdrop.className = "sidebar-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const sidebar = document.createElement("aside");
  sidebar.id = "app-sidebar";
  sidebar.className = "app-sidebar";
  sidebar.setAttribute("aria-label", "Main menu");
  sidebar.setAttribute("aria-hidden", "true");

  sidebar.innerHTML = `
    <div class="sidebar-heading">
      <div>
        <strong>RPG Codex</strong>
        <small>Navigation & workspace</small>
      </div>
      <button type="button" class="sidebar-close" id="sidebar-close"
        aria-label="Close navigation menu">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>
    </div>

    <section>
      <p class="sidebar-section-label">Navigation</p>
      <div id="sidebar-navigation" class="sidebar-navigation"></div>
    </section>

    <section class="sidebar-project-section">
      <p class="sidebar-section-label">Workspace</p>
      <div id="sidebar-project-tools"></div>
    </section>

    <div class="sidebar-footer">
      Your projects are stored locally in this browser.
    </div>
  `;

  document.body.append(backdrop, sidebar);

  // Move the existing controls, preserving their event listeners and IDs.
  $("sidebar-navigation").append(navigation);
  $("sidebar-project-tools").append(headerTools);

  const switcher = $("project-switcher");
  const manageButton = $("project-manage");
  const trashButton = $("trash-open");

  if (switcher && !switcher.parentElement?.classList.contains("sidebar-project-picker")) {
    const picker = document.createElement("div");
    picker.className = "sidebar-project-picker";
    picker.innerHTML = '<i data-lucide="folder-open" aria-hidden="true"></i>';
    switcher.parentElement.insertBefore(picker, switcher);
    picker.append(switcher);
  }

  if (manageButton) {
    manageButton.innerHTML =
      '<i data-lucide="folder-cog" aria-hidden="true"></i><span>Manage project</span>';
    manageButton.setAttribute("aria-label", "Manage project");
    manageButton.setAttribute("aria-expanded", "false");
  }

  if (trashButton) {
    trashButton.innerHTML =
      '<i data-lucide="trash-2" aria-hidden="true"></i><span>Trash</span>';
  }

  const navDashboard = $("nav-dashboard");
  const navRecords = $("nav-records");

  if (navDashboard) {
    navDashboard.innerHTML =
      '<i data-lucide="layout-dashboard" aria-hidden="true"></i><span>Overview</span>';
  }

  if (navRecords) {
    navRecords.innerHTML =
      '<i data-lucide="database" aria-hidden="true"></i><span>Records</span>';
  }

  function openSidebar() {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
    sidebar.setAttribute("aria-hidden", "false");
    backdrop.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation menu");
    document.body.style.overflow = "hidden";
    $("sidebar-close")?.focus();
  }

  function closeSidebar({ returnFocus = true } = {}) {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    sidebar.setAttribute("aria-hidden", "true");
    backdrop.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation menu");
    document.body.style.overflow = "";

    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) closeSidebar();
    else openSidebar();
  });

  $("sidebar-close")?.addEventListener("click", () => closeSidebar());
  backdrop.addEventListener("click", () => closeSidebar());

  navigation.addEventListener("click", event => {
    if (event.target.closest(".nav-button")) {
      closeSidebar({ returnFocus: false });
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && sidebar.classList.contains("open")) {
      closeSidebar();
    }
  });

  // The project dropdown is created by enhancements.js after a click.
  // Decorate its action buttons with icons when it appears.
 
  const projectMenuObserver = new MutationObserver(() => {
    const menu = $("projects-dropdown");
    if (!menu) return;

    const icons = {
      new: "folder-plus",
      rename: "pencil",
      delete: "trash-2",
      export: "download",
      import: "upload"
    };

    let changed = false;

    menu.querySelectorAll("[data-project-action]").forEach(button => {
      if (button.dataset.sidebarIconAdded === "true") return;

      const icon = icons[button.dataset.projectAction];
      if (!icon) return;

      const label = button.textContent.trim()
        .replace(/^[＋✎↓↑]\s*/, "");

      button.innerHTML =
        `<i data-lucide="${icon}" aria-hidden="true"></i>` +
        `<span>${escapeHTML(label)}</span>`;

      button.dataset.sidebarIconAdded = "true";
      changed = true;
    });

    // Renderiza ícones somente quando algum botão foi realmente alterado.
    if (changed) paintSidebarIcons(menu);
  });

  projectMenuObserver.observe(document.body, {
    childList: true,
    subtree: true
  });


  // Clicking a project-management action closes the sidebar but leaves the
  // in-page modal open and usable.
  manageButton?.addEventListener("click", () => {
    closeSidebar({ returnFocus: false });
  });

  trashButton?.addEventListener("click", () => {
    closeSidebar({ returnFocus: false });
  });

  switcher?.addEventListener("change", () => {
    closeSidebar({ returnFocus: false });
  });

  addSidebarStyles();
  paintSidebarIcons(header);
  paintSidebarIcons(sidebar);
}

setupSidebar();
