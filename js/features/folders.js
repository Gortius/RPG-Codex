"use strict";

/* RPG Codex folders, settings, reference picker and legacy category cleanup.
   This enhancement is intentionally isolated from the record model so it works
   with existing project-scoped storage and does not alter record IDs. */

(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const RECORDS_KEY = "rpg-codex-records-v2";
  const ACTIVE_PROJECT_KEY = "rpg-codex-active-project-v1";
  const FOLDERS_KEY = "rpg-codex-folders-v1";
  const ASSIGNMENTS_KEY = "rpg-codex-folder-assignments-v1";
  const SELECTED_FOLDER_KEY = "rpg-codex-selected-folder-v1";
  const SETTINGS_KEY = "rpg-codex-settings-v1";
  const NO_FOLDER = "__no_folder__";

  function activeProjectId() {
    try { return localStorage.getItem(ACTIVE_PROJECT_KEY) || "default"; }
    catch { return "default"; }
  }

  function scopedKey(base) {
    const projectId = activeProjectId();
    return projectId === "default" ? base : `${base}::${projectId}`;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.error(`RPG Codex: could not read ${key}.`, error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`RPG Codex: could not save ${key}.`, error);
      notify("Could not save this change in browser storage. Check available space.", "error");
      return false;
    }
  }

  function readStoredRecords() {
    const result = readJSON(scopedKey(RECORDS_KEY), []);
    return Array.isArray(result) ? result.filter(record => record && typeof record === "object") : [];
  }

  function fallbackRecordsFromUI() {
    const result = [];
    document.querySelectorAll("#records [data-open]").forEach(button => {
      const id = button.dataset.open;
      const name = button.querySelector("strong")?.textContent?.trim() || "";
      if (!id || !name || result.some(record => record.id === id)) return;
      const text = button.querySelector(".record-info p")?.textContent?.trim() || "";
      result.push({ id, name, type: text.split(" · ")[0] || "Record", tags: [], properties: [] });
    });
    return result;
  }

  function allRecords() {
    const saved = readStoredRecords();
    return saved.length ? saved : fallbackRecordsFromUI();
  }

  function normalizeFolder(folder) {
    return {
      id: String(folder?.id || uid("folder")),
      name: String(folder?.name || "").trim(),
      tags: Array.isArray(folder?.tags)
        ? [...new Set(folder.tags.map(tag => String(tag).trim()).filter(Boolean))]
        : []
    };
  }

  let folders = [];
  let assignments = {};
  let selectedFolderId = null;
  let currentRecordId = null;
  let currentModal = null;
  let isFolderSetupReady = false;

  function readSettings() {
    const value = readJSON(SETTINGS_KEY, {});
    // Migrate the previous setting name while keeping its meaning: checked = pinned.
    const pinned = value?.foldersPinnedToTop ?? value?.showFoldersAtTop;
    return { foldersPinnedToTop: pinned !== false };
  }

  let settings = readSettings();

  function loadFolderData() {
    const loadedFolders = readJSON(scopedKey(FOLDERS_KEY), []);
    folders = Array.isArray(loadedFolders)
      ? loadedFolders.map(normalizeFolder).filter(folder => folder.name)
      : [];

    const loadedAssignments = readJSON(scopedKey(ASSIGNMENTS_KEY), {});
    assignments = loadedAssignments && typeof loadedAssignments === "object" && !Array.isArray(loadedAssignments)
      ? Object.fromEntries(Object.entries(loadedAssignments).map(([recordId, folderId]) => [String(recordId), String(folderId)]))
      : {};

    const storedSelection = readJSON(scopedKey(SELECTED_FOLDER_KEY), null);
    selectedFolderId = storedSelection === NO_FOLDER || folders.some(folder => folder.id === storedSelection)
      ? storedSelection
      : null;
  }

  function saveFolderData() {
    const okFolders = writeJSON(scopedKey(FOLDERS_KEY), folders);
    const okAssignments = writeJSON(scopedKey(ASSIGNMENTS_KEY), assignments);
    writeJSON(scopedKey(SELECTED_FOLDER_KEY), selectedFolderId);
    return okFolders && okAssignments;
  }

  function notify(message, type = "success") {
    const existing = document.querySelector(".enhancement-toast");
    if (existing) {
      existing.textContent = message;
      existing.dataset.type = type;
      existing.classList.add("visible");
      clearTimeout(existing._hideTimer);
      existing._hideTimer = setTimeout(() => existing.classList.remove("visible"), 3600);
      return;
    }
    const toast = document.createElement("div");
    toast.className = "enhancement-toast visible";
    toast.dataset.type = type;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.append(toast);
    toast._hideTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
  }

  function addStyles() {
    if ($("folders-enhancement-styles")) return;
    const style = document.createElement("style");
    style.id = "folders-enhancement-styles";
    style.textContent = `
      /* Retired fields remain in the DOM for compatibility with the current app code. */
      .form-field.rpg-legacy-hidden, .filter-group.rpg-legacy-hidden { display:none !important; }
      .property-inline-label { display:none !important; }
      .property-type-wrap { justify-content:flex-start !important; align-self:stretch; min-width:0; }
      .property-type-wrap .property-type { margin-top:0 !important; }
      .property-row { align-items:start; }
      .property-name-wrap, .property-type-wrap, .property-value-container { min-width:0; }
      .property-value-container { width:100%; }
      .reference-picker-trigger { width:100%; display:flex; align-items:center; gap:8px; text-align:left; justify-content:space-between; min-height:40px; overflow:hidden; }
      .reference-picker-trigger span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .folder-browser { margin: 14px 0 20px; padding: 16px; }
      .folder-browser[hidden] { display:none !important; }
      .record-card[hidden] { display:none !important; }
      .folder-browser-actions button[aria-pressed="true"] { border-color:var(--accent, #B9A0FF); background:rgba(185,160,255,.10); }
      .folder-browser-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .folder-browser-heading h3 { margin:0; }
      .folder-browser-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .folder-browser-actions button, .folder-card-actions button { display:inline-flex; align-items:center; gap:6px; }
      .folder-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }
      .folder-card { min-width:0; border:1px solid var(--border, #38313f); border-radius:12px; background:var(--panel, #211e26); overflow:hidden; }
      .folder-card.active { border-color:var(--accent, #B9A0FF); box-shadow:0 0 0 1px var(--accent, #B9A0FF) inset; }
      .folder-card-main { border:0; background:transparent; color:inherit; width:100%; display:flex; gap:10px; align-items:flex-start; text-align:left; padding:12px 12px 8px; cursor:pointer; }
      .folder-card-main:hover { background:rgba(185,160,255,.08); }
      .folder-card-icon { flex:0 0 20px; margin-top:2px; opacity:.9; }
      .folder-card-info { min-width:0; display:flex; flex-direction:column; gap:4px; }
      .folder-card-info strong { overflow-wrap:anywhere; }
      .folder-card-info small { color:var(--muted, #aaa); }
      .folder-card-tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px; }
      .folder-card-tags .chip { font-size:11px; padding:2px 6px; }
      .folder-card-actions { border-top:1px solid var(--border, #38313f); display:flex; gap:6px; justify-content:flex-end; padding:6px 8px; }
      .folder-card-actions button { padding:5px 8px; font-size:12px; }
      .folder-browser-hint { margin:0 0 10px; color:var(--muted, #aaa); font-size:12px; }
      .folder-modal-overlay, .reference-modal-overlay { position:fixed; inset:0; z-index:10010; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(0,0,0,.68); }
      .folder-modal, .reference-modal { width:min(680px,100%); max-height:min(86vh,850px); overflow:auto; background:var(--panel, #211e26); color:var(--text, #f2edf7); border:1px solid var(--border, #403849); border-radius:16px; padding:20px; box-shadow:0 24px 70px rgba(0,0,0,.4); }
      .folder-modal h2, .reference-modal h2 { margin:0 36px 8px 0; }
      .folder-modal .hint, .reference-modal .hint { color:var(--muted, #aaa); }
      .folder-modal label, .reference-modal label { display:block; margin:14px 0 6px; font-weight:600; font-size:13px; }
      .folder-modal input, .reference-modal input, .reference-modal select { width:100%; }
      .folder-modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:20px; flex-wrap:wrap; }
      .folder-modal-close, .reference-modal-close { float:right; font-size:20px; width:34px; height:34px; padding:0; }
      .reference-modal-tools { display:grid; grid-template-columns:minmax(0,1fr) 160px 170px; gap:10px; align-items:end; margin:12px 0; }
      .reference-modal-tools label { margin-top:0; }
      .reference-results { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
      .reference-result { display:flex; justify-content:space-between; align-items:center; gap:12px; text-align:left; width:100%; padding:10px 12px; border:1px solid var(--border, #403849); border-radius:10px; background:transparent; color:inherit; }
      .reference-result:hover, .reference-result:focus-visible { border-color:var(--accent, #B9A0FF); background:rgba(185,160,255,.08); }
      .reference-result-info { min-width:0; display:flex; flex-direction:column; gap:3px; }
      .reference-result-info strong { overflow-wrap:anywhere; }
      .reference-result-info small { color:var(--muted, #aaa); }
      .reference-result-tags { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px; }
      .reference-result-tags .chip { font-size:11px; padding:2px 6px; }
      .sidebar-settings-button { width:100%; display:flex; align-items:center; gap:10px; padding:11px 12px; text-align:left; border:1px solid var(--border, #403849); background:transparent; color:inherit; border-radius:10px; cursor:pointer; }
      .sidebar-settings-button:hover, .sidebar-settings-button.active { border-color:var(--accent, #B9A0FF); background:rgba(185,160,255,.08); }
      #settings-view { max-width:900px; margin:0 auto; }
      .settings-card { padding:18px; margin:18px 0; border:1px solid var(--border, #403849); border-radius:14px; background:var(--panel, #211e26); }
      .settings-option { display:flex; gap:12px; align-items:flex-start; }
      .settings-option input[type=checkbox] { width:auto; margin-top:4px; }
      .settings-option strong { display:block; }
      .settings-option small { display:block; color:var(--muted, #aaa); margin-top:4px; }
      @media (max-width: 680px) { .reference-modal-tools { grid-template-columns:1fr; } .folder-card-grid { grid-template-columns:1fr; } .folder-browser { padding:12px; } .folder-modal, .reference-modal { padding:15px; } }
    `;
    document.head.append(style);
  }

  function hideLegacyFields() {
    ["f-category", "f-subcategory"].forEach(id => {
      const element = $(id);
      if (!element) return;
      const group = element.closest(".form-field");
      if (group) group.classList.add("rpg-legacy-hidden");
      if (element.tagName === "SELECT") element.value = "";
      else element.value = "";
    });
    ["filter-category", "filter-subcategory"].forEach(id => {
      const element = $(id);
      if (!element) return;
      const group = element.closest(".filter-group");
      if (group) group.classList.add("rpg-legacy-hidden");
      element.value = "";
    });
    const filterGrid = $("filter-category")?.closest(".filter-grid");
    if (filterGrid) filterGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(190px, 1fr))";
  }

  function sanitizeStoredCategoryFields() {
    const key = scopedKey(RECORDS_KEY);
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return;
      const stored = JSON.parse(raw);
      if (!Array.isArray(stored)) return;
      let changed = false;
      const cleaned = stored.map(record => {
        if (!record || typeof record !== "object") return record;
        if ((record.category || "") === "" && (record.subcategory || "") === "") return record;
        changed = true;
        const next = { ...record, category: "", subcategory: "" };
        return next;
      });
      if (changed) localStorage.setItem(key, JSON.stringify(cleaned));
    } catch (error) {
      console.warn("RPG Codex: legacy category values were left untouched because their data could not be read safely.", error);
    }
  }

  function recordById(id) {
    return allRecords().find(record => String(record.id) === String(id));
  }

  function displayOnlyTypeAndTags() {
    const recordMap = new Map(allRecords().map(record => [String(record.id), record]));
    document.querySelectorAll("#records [data-open]").forEach(button => {
      const record = recordMap.get(String(button.dataset.open));
      if (!record) return;
      const tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
      const label = `${record.type || "Record"}${tags.length ? " · " + tags.join(", ") : ""}`;
      const details = button.querySelector(".record-info p");
      if (details && details.textContent !== label) details.textContent = label;
      const compact = button.querySelector(".compact-record-category");
      if (compact && compact.textContent !== String(record.type || "Record")) compact.textContent = record.type || "Record";
    });
    document.querySelectorAll("#dashboard-recent [data-dashboard-open]").forEach(button => {
      const record = recordMap.get(String(button.dataset.dashboardOpen));
      const detail = button.querySelector(".dashboard-record-info span");
      if (!detail) return;
      const typeLabel = String(record?.type || detail.textContent.split(" · ")[0] || "Record");
      if (detail.textContent !== typeLabel) detail.textContent = typeLabel;
    });
    const detailMeta = $("detail-content")?.querySelector(".record-heading .muted");
    if (detailMeta && detailMeta.textContent.trim()) detailMeta.textContent = "";
  }

  function cleanCurrentFilterValues() {
    const category = $("filter-category");
    const subcategory = $("filter-subcategory");
    let changed = false;
    if (category && category.value) { category.value = ""; changed = true; }
    if (subcategory && subcategory.value) { subcategory.value = ""; changed = true; }
    if (changed) $("search")?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function renderFolderSelect(selected = "") {
    const select = $("folder-assignment-select");
    if (!select) return;
    const current = selected || select.value || "";
    select.innerHTML = '<option value="">No folder</option>' + folders.map(folder =>
      `<option value="${esc(folder.id)}">${esc(folder.name)}</option>`
    ).join("");
    select.value = folders.some(folder => folder.id === current) ? current : "";
  }

  function inferEditingRecordId() {
    if (currentRecordId && recordById(currentRecordId)) return currentRecordId;
    if (!$("form-title")?.textContent.toLowerCase().includes("edit")) return null;
    const name = $("f-name")?.value.trim().toLowerCase();
    const typeSelect = $("f-type");
    const type = typeSelect?.value === "__new__" ? $("f-new-type")?.value.trim() : typeSelect?.value;
    const match = allRecords().find(record => String(record.name || "").trim().toLowerCase() === name && String(record.type || "") === String(type || ""));
    return match?.id || null;
  }

  function syncFolderSelect() {
    const select = $("folder-assignment-select");
    if (!select) return;
    const editing = $("form-title")?.textContent.toLowerCase().includes("edit");
    const recordId = editing ? inferEditingRecordId() : null;
    currentRecordId = recordId;
    const assigned = recordId ? assignments[String(recordId)] || "" : (selectedFolderId && selectedFolderId !== NO_FOLDER ? selectedFolderId : "");
    renderFolderSelect(assigned);
  }

  function injectFolderAssignment() {
    const form = $("record-form");
    const typeField = $("f-type")?.closest(".form-field");
    if (!form || !typeField || $("folder-assignment-field")) return;
    const field = document.createElement("div");
    field.className = "form-field folder-assignment-field";
    field.id = "folder-assignment-field";
    field.innerHTML = `
      <label for="folder-assignment-select">Folder (optional)</label>
      <select id="folder-assignment-select" aria-label="Assign record to folder"><option value="">No folder</option></select>
      <p class="hint">Folders are an optional layer for grouping records. Type and Tags still describe each record.</p>
    `;
    typeField.insertAdjacentElement("afterend", field);
    renderFolderSelect();
  }

  function folderCounts() {
    const counts = new Map(folders.map(folder => [folder.id, 0]));
    let noFolderCount = 0;
    const records = allRecords();
    records.forEach(record => {
      const folderId = assignments[String(record.id)];
      if (counts.has(folderId)) counts.set(folderId, counts.get(folderId) + 1);
      else noFolderCount++;
    });
    return { counts, noFolderCount };
  }

  // Count records that are currently present in the normal search/filter result list.
  // We intentionally do not exclude hidden cards here: the active folder filter hides
  // cards after the app's regular search has produced its results.
  function folderSearchMatchCounts() {
    const result = new Map(folders.map(folder => [folder.id, 0]));
    const container = $("records");
    if (!container) return result;
    const seen = new Set();
    container.querySelectorAll(".record-card [data-open]").forEach(button => {
      const id = String(button.dataset.open || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      const folderId = assignments[id];
      if (result.has(folderId)) result.set(folderId, result.get(folderId) + 1);
    });
    return result;
  }

  function renderFolderBrowser() {
    const browser = $("folder-browser");
    if (!browser) return;
    // The setting controls search behavior, not whether the folder browser exists.
    browser.hidden = false;
    const { counts, noFolderCount } = folderCounts();
    const query = $("search")?.value.trim().toLocaleLowerCase() || "";
    const matchingCounts = folderSearchMatchCounts();
    const visibleFolders = settings.foldersPinnedToTop || !query
      ? folders
      : folders.filter(folder => {
          const folderText = [folder.name, ...(folder.tags || [])].join(" ").toLocaleLowerCase();
          return folderText.includes(query) || (matchingCounts.get(folder.id) || 0) > 0;
        });

    const folderCards = visibleFolders.map(folder => {
      const active = selectedFolderId === folder.id ? " active" : "";
      const tags = folder.tags.map(tag => `<span class="chip">${esc(tag)}</span>`).join("");
      const total = counts.get(folder.id) || 0;
      const matches = matchingCounts.get(folder.id) || 0;
      const matchLabel = query && matches > 0
        ? ` · ${matches} correspondência${matches === 1 ? "" : "s"} dentro da pasta`
        : "";
      return `
        <article class="folder-card${active}" data-folder-card="${esc(folder.id)}">
          <button type="button" class="folder-card-main" data-folder-open="${esc(folder.id)}" aria-pressed="${selectedFolderId === folder.id}">
            <i class="folder-card-icon" data-lucide="folder" aria-hidden="true"></i>
            <span class="folder-card-info"><strong>${esc(folder.name)}</strong><small>${total} registros${esc(matchLabel)}</small><span class="folder-card-tags">${tags}</span></span>
          </button>
          <div class="folder-card-actions">
            <button type="button" class="secondary" data-folder-edit="${esc(folder.id)}"><i data-lucide="pencil" aria-hidden="true"></i><span>Edit</span></button>
            <button type="button" class="secondary" data-folder-delete="${esc(folder.id)}"><i data-lucide="trash-2" aria-hidden="true"></i><span>Delete</span></button>
          </div>
        </article>`;
    }).join("");
    const emptyMessage = query && !settings.foldersPinnedToTop
      ? "No folders or matching records found."
      : "No folders yet. Create one to group related records.";
    browser.innerHTML = `
      <div class="folder-browser-heading">
        <h3>Folders</h3>
        <div class="folder-browser-actions">
          <button type="button" class="secondary" data-folder-filter-all aria-pressed="${selectedFolderId === null}"><i data-lucide="layers" aria-hidden="true"></i><span>All records</span></button>
          <button type="button" class="secondary" data-folder-filter-none aria-pressed="${selectedFolderId === NO_FOLDER}"><i data-lucide="folder-x" aria-hidden="true"></i><span>No folder (${noFolderCount})</span></button>
          <button type="button" class="primary" data-folder-create><i data-lucide="folder-plus" aria-hidden="true"></i><span>New folder</span></button>
        </div>
      </div>
      <p class="folder-browser-hint">${settings.foldersPinnedToTop
        ? "Folders stay at the top while you search. Matching records inside each folder are counted."
        : "Folders are included in search results when their name or tags match, or when they contain matching records."}</p>
      <div class="folder-card-grid">
        ${folderCards || `<p class="muted">${esc(emptyMessage)}</p>`}
      </div>
    `;
    const heading = browser.querySelector(".folder-browser-heading h3");
    if (heading) heading.title = selectedFolderId === null ? "Folders are shown before records" : selectedFolderId === NO_FOLDER ? "Showing records without a folder" : `Showing records in ${folders.find(folder => folder.id === selectedFolderId)?.name || "folder"}`;
    browser.querySelectorAll("[data-folder-open]").forEach(button => {
      button.onclick = () => {
        selectedFolderId = button.dataset.folderOpen;
        writeJSON(scopedKey(SELECTED_FOLDER_KEY), selectedFolderId);
        renderFolderBrowser();
        applyFolderFilter();
      };
    });
    browser.querySelector("[data-folder-filter-all]")?.addEventListener("click", () => {
      selectedFolderId = null;
      writeJSON(scopedKey(SELECTED_FOLDER_KEY), selectedFolderId);
      renderFolderBrowser();
      applyFolderFilter();
    });
    browser.querySelector("[data-folder-filter-none]")?.addEventListener("click", () => {
      selectedFolderId = NO_FOLDER;
      writeJSON(scopedKey(SELECTED_FOLDER_KEY), selectedFolderId);
      renderFolderBrowser();
      applyFolderFilter();
    });
    browser.querySelector("[data-folder-create]")?.addEventListener("click", () => openFolderEditor());
    browser.querySelectorAll("[data-folder-edit]").forEach(button => button.addEventListener("click", () => openFolderEditor(folders.find(folder => folder.id === button.dataset.folderEdit))));
    browser.querySelectorAll("[data-folder-delete]").forEach(button => button.addEventListener("click", () => deleteFolder(button.dataset.folderDelete)));
    try { window.lucide?.createIcons?.({ root: browser }); } catch {}
  }

  function applyFolderFilter() {
    const container = $("records");
    if (!container) return;
    const cards = [...container.querySelectorAll(".record-card")].filter(card => card.querySelector("[data-open]"));
    let shown = 0;
    cards.forEach(card => {
      const recordId = card.querySelector("[data-open]")?.dataset.open;
      let visible = true;
      if (selectedFolderId === NO_FOLDER) visible = !assignments[String(recordId)] || !folders.some(folder => folder.id === assignments[String(recordId)]);
      else if (selectedFolderId !== null) visible = assignments[String(recordId)] === selectedFolderId;
      card.hidden = !visible;
      if (visible) shown++;
    });
    if (selectedFolderId !== null) {
      const count = $("count");
      if (count) count.textContent = `${shown} shown`;
      const defaultEmpty = container.querySelector(":scope > .empty");
      if (shown === 0 && cards.length > 0) {
        const emptyText = "No records in this folder match the current filters.";
        if (defaultEmpty) {
          if (defaultEmpty.textContent !== emptyText) defaultEmpty.textContent = emptyText;
        }
        else {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.dataset.folderFilterEmpty = "true";
          empty.textContent = "No records in this folder match the current filters.";
          container.append(empty);
        }
      } else if (shown > 0) {
        container.querySelector("[data-folder-filter-empty]")?.remove();
      }
    } else {
      cards.forEach(card => { card.hidden = false; });
      container.querySelector("[data-folder-filter-empty]")?.remove();
    }
  }

  function openFolderEditor(existing = null) {
    currentModal?.remove();
    const folder = existing ? normalizeFolder(existing) : null;
    const overlay = document.createElement("div");
    overlay.className = "folder-modal-overlay";
    overlay.innerHTML = `
      <section class="folder-modal" role="dialog" aria-modal="true" aria-labelledby="folder-modal-title">
        <button type="button" class="secondary folder-modal-close" data-folder-modal-close aria-label="Close">×</button>
        <h2 id="folder-modal-title">${folder ? "Edit folder" : "Create folder"}</h2>
        <p class="hint">A folder has only a name and tags. It does not add another record type.</p>
        <form id="folder-edit-form">
          <label for="folder-name">Name *</label>
          <input id="folder-name" maxlength="80" required autocomplete="off" placeholder="e.g. Starter Area" value="${esc(folder?.name || "")}">
          <label for="folder-tags">Tags</label>
          <input id="folder-tags" maxlength="500" autocomplete="off" placeholder="e.g. Early Game, Quest, Materials" value="${esc((folder?.tags || []).join(", "))}">
          <small class="hint">Separate tags with commas. Folder tags are separate from record tags.</small>
          <div class="folder-modal-actions">
            <button type="button" class="secondary" data-folder-modal-close>Cancel</button>
            <button type="submit" class="primary">${folder ? "Save changes" : "Create folder"}</button>
          </div>
        </form>
      </section>`;
    document.body.append(overlay);
    currentModal = overlay;
    const close = () => { overlay.remove(); if (currentModal === overlay) currentModal = null; };
    overlay.querySelectorAll("[data-folder-modal-close]").forEach(button => button.addEventListener("click", close));
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.querySelector("#folder-edit-form").addEventListener("submit", event => {
      event.preventDefault();
      const name = overlay.querySelector("#folder-name").value.trim();
      const tags = [...new Set(overlay.querySelector("#folder-tags").value.split(",").map(tag => tag.trim()).filter(Boolean))];
      if (!name) { overlay.querySelector("#folder-name").focus(); return; }
      if (folders.some(item => item.id !== folder?.id && item.name.toLowerCase() === name.toLowerCase())) {
        notify("A folder with this name already exists.", "error");
        return;
      }
      if (folder) {
        folders = folders.map(item => item.id === folder.id ? { id: folder.id, name, tags } : item);
      } else {
        // Creating a folder should not silently change the active record filter.
        folders.push({ id: uid("folder"), name, tags });
      }
      if (saveFolderData()) {
        close();
        renderFolderSelect();
        renderFolderBrowser();
        syncFolderSelect();
        applyFolderFilter();
        notify(folder ? "Folder updated." : "Folder created.");
      }
    });
    overlay.querySelector("#folder-name")?.focus();
  }

  function deleteFolder(id) {
    const folder = folders.find(item => item.id === id);
    if (!folder) return;
    if (!confirm(`Delete the folder “${folder.name}”? Records will be kept and become unassigned.`)) return;
    folders = folders.filter(item => item.id !== id);
    Object.entries(assignments).forEach(([recordId, folderId]) => {
      if (folderId === id) delete assignments[recordId];
    });
    if (selectedFolderId === id) selectedFolderId = null;
    if (saveFolderData()) {
      renderFolderSelect();
      renderFolderBrowser();
      applyFolderFilter();
      notify("Folder deleted. Records were not deleted.");
    }
  }

  function allRecordTypes(records) {
    return [...new Set(records.map(record => String(record.type || "Record")).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  }

  function recordSearchText(record) {
    const tags = Array.isArray(record.tags) ? record.tags : [];
    const properties = Array.isArray(record.properties) ? record.properties : [];
    return [record.name, record.type, record.description, ...tags,
      ...properties.map(property => `${property?.name || ""} ${stringifyValue(property?.value)}`)]
      .join(" ").toLowerCase();
  }

  function stringifyValue(value) {
    try { return typeof value === "string" ? value : JSON.stringify(value ?? ""); }
    catch { return String(value ?? ""); }
  }

  function openRecordReferencePicker(select, trigger) {
    currentModal?.remove();
    const records = allRecords();
    const currentId = select.value;
    const fallbackOptions = [...select.options].filter(option => option.value).map(option => {
      const parts = option.textContent.split(" · ");
      return { id: option.value, name: parts[0] || option.value, type: parts[1] || "Record", tags: [], properties: [], description: "" };
    });
    const merged = new Map(records.map(record => [String(record.id), record]));
    fallbackOptions.forEach(record => { if (!merged.has(String(record.id))) merged.set(String(record.id), record); });
    const list = [...merged.values()];
    const typeOptions = allRecordTypes(list).map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join("");
    const tagOptions = [...new Set(list.flatMap(record => Array.isArray(record.tags) ? record.tags : []))].sort((a,b) => String(a).localeCompare(String(b))).map(tag => `<option value="${esc(tag)}">${esc(tag)}</option>`).join("");
    const overlay = document.createElement("div");
    overlay.className = "reference-modal-overlay";
    overlay.innerHTML = `
      <section class="reference-modal" role="dialog" aria-modal="true" aria-labelledby="reference-modal-title">
        <button type="button" class="secondary reference-modal-close" data-reference-close aria-label="Close">×</button>
        <h2 id="reference-modal-title">Choose a record</h2>
        <p class="hint">Search by name, type, tags, description or property values.</p>
        <div class="reference-modal-tools">
          <div><label for="reference-search">Search</label><input id="reference-search" type="search" placeholder="Record name, type, tag…" autocomplete="off"></div>
          <div><label for="reference-type">Type</label><select id="reference-type"><option value="">All types</option>${typeOptions}</select></div>
          <div><label for="reference-tag">Tag</label><select id="reference-tag"><option value="">All tags</option>${tagOptions}</select></div>
        </div>
        <div id="reference-results" class="reference-results"></div>
      </section>`;
    document.body.append(overlay);
    currentModal = overlay;
    const close = () => { overlay.remove(); if (currentModal === overlay) currentModal = null; trigger?.focus(); };
    overlay.querySelectorAll("[data-reference-close]").forEach(button => button.addEventListener("click", close));
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    const search = overlay.querySelector("#reference-search");
    const typeFilter = overlay.querySelector("#reference-type");
    const tagFilter = overlay.querySelector("#reference-tag");
    const results = overlay.querySelector("#reference-results");
    function renderResults() {
      const query = search.value.trim().toLowerCase();
      const selectedType = typeFilter.value;
      const selectedTag = tagFilter.value;
      const filtered = list.filter(record => {
        const tags = Array.isArray(record.tags) ? record.tags : [];
        return (!selectedType || String(record.type || "Record") === selectedType) &&
          (!selectedTag || tags.includes(selectedTag)) &&
          (!query || recordSearchText(record).includes(query));
      });
      if (!filtered.length) {
        results.innerHTML = '<p class="empty">No compatible records found. Try another search or filter.</p>';
        return;
      }
      results.innerHTML = filtered.slice(0, 250).map(record => {
        const tags = (Array.isArray(record.tags) ? record.tags : []).slice(0, 4).map(tag => `<span class="chip">${esc(tag)}</span>`).join("");
        const active = String(record.id) === String(currentId) ? " · Selected" : "";
        return `<button type="button" class="reference-result" data-reference-id="${esc(record.id)}">
          <span class="reference-result-info"><strong>${esc(record.name)}${active}</strong><small>${esc(record.type || "Record")}${record.description ? " · " + esc(record.description.slice(0, 90)) : ""}</small></span>
          <span class="reference-result-tags">${tags}</span>
        </button>`;
      }).join("");
      results.querySelectorAll("[data-reference-id]").forEach(button => button.addEventListener("click", () => {
        const id = button.dataset.referenceId;
        select.value = id;
        if (!select.value) {
          const option = document.createElement("option");
          option.value = id;
          option.textContent = `${list.find(record => String(record.id) === id)?.name || id} · ${list.find(record => String(record.id) === id)?.type || "Record"}`;
          select.append(option);
          select.value = id;
        }
        updateReferenceTrigger(select, trigger);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
      }));
    }
    search.addEventListener("input", renderResults);
    typeFilter.addEventListener("change", renderResults);
    tagFilter.addEventListener("change", renderResults);
    document.addEventListener("keydown", function onKey(event) {
      if (event.key !== "Escape" || !overlay.isConnected) return;
      document.removeEventListener("keydown", onKey);
      close();
    }, { once: true });
    renderResults();
    search.focus();
  }

  function updateReferenceTrigger(select, trigger) {
    const option = select.selectedOptions?.[0];
    const label = option && option.value ? option.textContent.trim() : "Choose a record…";
    trigger.innerHTML = `<i data-lucide="search" aria-hidden="true"></i><span>${esc(label)}</span><i data-lucide="chevron-down" aria-hidden="true"></i>`;
    trigger.title = label;
    try { window.lucide?.createIcons?.({ root: trigger }); } catch {}
  }

  function enhancePropertyRows() {
    document.querySelectorAll("#property-rows .property-inline-label").forEach(label => label.remove());
    document.querySelectorAll("#property-rows select[data-list-item-record]").forEach(select => {
      if (select.dataset.referencePickerEnhanced === "true") return;
      select.dataset.referencePickerEnhanced = "true";
      select.hidden = true;
      select.setAttribute("aria-hidden", "true");
      const wrapper = select.closest(".property-list-item-value") || select.parentElement;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary reference-picker-trigger";
      button.setAttribute("aria-label", "Search for a record reference");
      wrapper.append(button);
      updateReferenceTrigger(select, button);
      button.addEventListener("click", () => openRecordReferencePicker(select, button));
    });
  }

  function injectFolderBrowser() {
    const records = $("records");
    const recordsView = $("records-view");
    if (!records || !recordsView || $("folder-browser")) return;
    const browser = document.createElement("section");
    browser.id = "folder-browser";
    browser.className = "folder-browser panel";
    // Put folders in the results area, after search and filter controls.
    const resultsHeading = recordsView.querySelector(".records-heading");
    if (resultsHeading) resultsHeading.insertAdjacentElement("beforebegin", browser);
    else records.insertAdjacentElement("beforebegin", browser);
  }

  function injectSettingsPage() {
    if ($("settings-view")) return;
    const main = document.querySelector("main");
    if (!main) return;
    const section = document.createElement("section");
    section.id = "settings-view";
    section.hidden = true;
    section.innerHTML = `
      <button type="button" class="back" id="settings-back">← Back to records</button>
      <p class="eyebrow">WORKSPACE</p>
      <h2>Settings</h2>
      <p class="muted">Customize how RPG Codex organizes and displays your database.</p>
      <div class="settings-card">
        <h3>Folder search and sorting</h3>
        <label class="settings-option" for="setting-folders-pinned">
          <input type="checkbox" id="setting-folders-pinned">
          <span><strong>Keep folders pinned at the top of search results</strong><small>When enabled, folders stay visible at the top while you search and show how many matching records they contain. When disabled, only folders whose name/tags match or that contain matching records appear in the folder results. This setting does not hide folders or clear the selected folder.</small></span>
        </label>
      </div>
      <div class="settings-card">
        <h3>Folders</h3>
        <p class="muted">Folders have a name and tags. Records keep their own Type, Tags, properties and relationships.</p>
        <button type="button" class="secondary" id="settings-create-folder"><i data-lucide="folder-plus" aria-hidden="true"></i> Create folder</button>
      </div>
    `;
    main.append(section);
    $("setting-folders-pinned").checked = settings.foldersPinnedToTop;
    $("setting-folders-pinned").addEventListener("change", event => {
      settings.foldersPinnedToTop = Boolean(event.target.checked);
      writeJSON(SETTINGS_KEY, settings);
      renderFolderBrowser();
      applyFolderFilter();
    });
    $("settings-create-folder").addEventListener("click", () => openFolderEditor());
    $("settings-back").addEventListener("click", () => $("nav-records")?.click());
    try { window.lucide?.createIcons?.({ root: section }); } catch {}
  }

  function openSettings() {
    const home = $("home");
    const detail = $("detail");
    const editor = $("editor");
    const settingsView = $("settings-view");
    if (home) home.hidden = true;
    if (detail) detail.hidden = true;
    if (editor) editor.hidden = true;
    if (settingsView) settingsView.hidden = false;
    $("nav-dashboard")?.classList.remove("active");
    $("nav-records")?.classList.remove("active");
    document.querySelectorAll("[data-open-settings]").forEach(button => button.classList.add("active"));
    const sidebar = $("app-sidebar");
    const toggle = $("sidebar-toggle");
    sidebar?.classList.remove("open");
    $("sidebar-backdrop")?.classList.remove("open");
    sidebar?.setAttribute("aria-hidden", "true");
    $("sidebar-backdrop")?.setAttribute("aria-hidden", "true");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.setAttribute("aria-label", "Open navigation menu");
    document.body.style.overflow = "";
    window.scrollTo(0, 0);
  }

  function addSettingsMenuItem() {
    const sidebar = $("app-sidebar");
    if (!sidebar || sidebar.querySelector("[data-open-settings]")) return;
    const section = document.createElement("section");
    section.className = "sidebar-settings-section";
    section.innerHTML = `
      <p class="sidebar-section-label">Preferences</p>
      <button type="button" class="sidebar-settings-button" data-open-settings>
        <i data-lucide="settings" aria-hidden="true"></i><span>Settings</span>
      </button>`;
    sidebar.querySelector(".sidebar-project-section")?.insertAdjacentElement("afterend", section);
    section.querySelector("[data-open-settings]").addEventListener("click", openSettings);
    try { window.lucide?.createIcons?.({ root: section }); } catch {}
  }

  function normalizeBackupIcons() {
    const menu = $("projects-dropdown");
    if (!menu) return;
    const desired = { export: "upload", import: "download" };
    Object.entries(desired).forEach(([action, iconName]) => {
      const button = menu.querySelector(`[data-project-action="${action}"]`);
      if (!button || button.dataset.rpgCodexIconFixed === iconName) return;
      const label = button.querySelector("span")?.textContent?.trim() ||
        button.textContent.trim().replace(/^[＋✎↓↑]\s*/, "");
      button.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i><span>${esc(label)}</span>`;
      button.dataset.rpgCodexIconFixed = iconName;
      try { window.lucide?.createIcons?.({ root: button }); } catch {}
    });
  }

  function pruneAssignments() {
    const knownFolderIds = new Set(folders.map(folder => folder.id));
    Object.entries(assignments).forEach(([recordId, folderId]) => {
      if (!knownFolderIds.has(folderId)) delete assignments[recordId];
    });
  }

  function assignCurrentRecordAfterSave() {
    const form = $("record-form");
    if (!form) return;
    let pending = null;
    form.addEventListener("submit", () => {
      pending = {
        folderId: $("folder-assignment-select")?.value || "",
        editingId: inferEditingRecordId(),
        name: $("f-name")?.value.trim() || "",
        type: $("f-type")?.value === "__new__" ? $("f-new-type")?.value.trim() : $("f-type")?.value || ""
      };
      setTimeout(() => {
        if (!pending || !$("editor")?.hidden) return;
        sanitizeStoredCategoryFields();
        const records = readStoredRecords();
        let record = pending.editingId ? records.find(item => String(item.id) === String(pending.editingId)) : null;
        if (!record) {
          const matches = records.filter(item => String(item.name || "").trim().toLowerCase() === pending.name.toLowerCase() && String(item.type || "") === String(pending.type || ""));
          record = matches[matches.length - 1] || null;
        }
        if (record) {
          currentRecordId = String(record.id);
          if (pending.folderId && folders.some(folder => folder.id === pending.folderId)) assignments[String(record.id)] = pending.folderId;
          else delete assignments[String(record.id)];
          saveFolderData();
          renderFolderBrowser();
          applyFolderFilter();
        }
        pending = null;
      }, 0);
    }, true);
  }

  function exposeBackupAPI() {
    window.RPGCodexFolders = {
      deleteProjectData(projectId) {
        const id = String(projectId || "default");
        [FOLDERS_KEY, ASSIGNMENTS_KEY, SELECTED_FOLDER_KEY].forEach(base => {
          if (id !== "default") localStorage.removeItem(`${base}::${id}`);
          else localStorage.removeItem(base);
        });
      },
      getBackupData() {
        const validIds = new Set(readStoredRecords().map(record => String(record.id)));
        const cleanAssignments = Object.fromEntries(Object.entries(assignments).filter(([recordId, folderId]) => validIds.has(String(recordId)) && folders.some(folder => folder.id === folderId)));
        return { folders: folders.map(folder => ({ id: folder.id, name: folder.name, tags: [...folder.tags] })), assignments: cleanAssignments };
      },
      importBackupData(data, options = {}) {
        const replace = Boolean(options.replace);
        if (!data || !Array.isArray(data.folders) || !data.assignments || typeof data.assignments !== "object" || Array.isArray(data.assignments)) {
          if (replace) {
            folders = [];
            assignments = {};
            selectedFolderId = null;
            saveFolderData();
            renderFolderBrowser();
          }
          return;
        }
        const incomingFolders = data.folders.map(normalizeFolder).filter(folder => folder.name);
        const idRemap = new Map();
        const resultFolders = replace ? [] : [...folders];
        const reservedIds = new Set(resultFolders.map(folder => folder.id));
        incomingFolders.forEach(folder => {
          const sameIdIndex = resultFolders.findIndex(item => item.id === folder.id);
          const sameNameIndex = resultFolders.findIndex(item => item.name.toLowerCase() === folder.name.toLowerCase());
          let targetId = folder.id;
          let existingIndex = sameIdIndex;
          if (existingIndex < 0 && sameNameIndex >= 0) {
            existingIndex = sameNameIndex;
            targetId = resultFolders[existingIndex].id;
          } else if (existingIndex < 0 && reservedIds.has(targetId)) {
            targetId = uid("folder");
          }
          reservedIds.add(targetId);
          idRemap.set(folder.id, targetId);
          const next = { id: targetId, name: folder.name, tags: [...folder.tags] };
          if (existingIndex >= 0) resultFolders[existingIndex] = next;
          else resultFolders.push(next);
        });
        const incomingRecords = Array.isArray(options.records) ? options.records : [];
        const currentRecords = readStoredRecords();
        const nextAssignments = replace ? {} : { ...assignments };
        Object.entries(data.assignments).forEach(([sourceRecordId, sourceFolderId]) => {
          if (!idRemap.has(String(sourceFolderId))) return;
          let targetRecord = currentRecords.find(record => String(record.id) === String(sourceRecordId));
          if (targetRecord && incomingRecords.some(record => String(record.id) === String(sourceRecordId)) && (String(targetRecord.name) !== String(incomingRecords.find(record => String(record.id) === String(sourceRecordId))?.name) || String(targetRecord.type) !== String(incomingRecords.find(record => String(record.id) === String(sourceRecordId))?.type))) {
            targetRecord = null;
          }
          if (!targetRecord) {
            const sourceRecord = incomingRecords.find(record => String(record.id) === String(sourceRecordId));
            if (sourceRecord) targetRecord = currentRecords.find(record => String(record.name || "").toLowerCase() === String(sourceRecord.name || "").toLowerCase() && String(record.type || "") === String(sourceRecord.type || ""));
          }
          if (targetRecord) nextAssignments[String(targetRecord.id)] = idRemap.get(String(sourceFolderId));
        });
        folders = resultFolders;
        assignments = nextAssignments;
        if (!folders.some(folder => folder.id === selectedFolderId) && selectedFolderId !== NO_FOLDER) selectedFolderId = null;
        pruneAssignments();
        saveFolderData();
        renderFolderSelect();
        renderFolderBrowser();
        applyFolderFilter();
      }
    };
  }

  function setupObservers() {
    const recordList = $("records");
    if (recordList) {
      const observer = new MutationObserver(() => {
        displayOnlyTypeAndTags();
        applyFolderFilter();
        renderFolderBrowser();
        enhancePropertyRows();
        normalizeBackupIcons();
      });
      observer.observe(recordList, { childList: true, subtree: true });
    }
    const properties = $("property-rows");
    if (properties) {
      const observer = new MutationObserver(() => enhancePropertyRows());
      observer.observe(properties, { childList: true, subtree: true });
      enhancePropertyRows();
    }
    const detail = $("detail-content");
    if (detail) {
      const observer = new MutationObserver(() => displayOnlyTypeAndTags());
      observer.observe(detail, { childList: true, subtree: true });
    }
    const dashboard = $("dashboard-recent");
    if (dashboard) {
      const observer = new MutationObserver(() => displayOnlyTypeAndTags());
      observer.observe(dashboard, { childList: true, subtree: true });
    }
    const bodyObserver = new MutationObserver(() => {
      addSettingsMenuItem();
      normalizeBackupIcons();
      hideLegacyFields();
      displayOnlyTypeAndTags();
      enhancePropertyRows();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    const editor = $("editor");
    if (editor) {
      const editorObserver = new MutationObserver(() => {
        if (!editor.hidden) {
          setTimeout(() => {
            hideLegacyFields();
            syncFolderSelect();
          }, 0);
        }
      });
      editorObserver.observe(editor, { attributes: true, attributeFilter: ["hidden"] });
    }
    document.addEventListener("click", event => {
      const open = event.target.closest("[data-open], [data-dashboard-open], [data-related]");
      if (open) currentRecordId = open.dataset.open || open.dataset.dashboardOpen || open.dataset.related || null;
      if (event.target.closest("#new-record, #dashboard-new-record")) currentRecordId = null;
      if (event.target.closest("#project-manage")) setTimeout(normalizeBackupIcons, 0);
      if (event.target.closest("#apply-saved-filter, #saved-filters")) setTimeout(cleanCurrentFilterValues, 0);
    }, true);
    ["nav-dashboard", "nav-records"].forEach(id => $(id)?.addEventListener("click", () => {
      if ($("settings-view")) $("settings-view").hidden = true;
      document.querySelectorAll("[data-open-settings]").forEach(button => button.classList.remove("active"));
    }));
    $("search")?.addEventListener("input", () => setTimeout(() => {
      applyFolderFilter();
      renderFolderBrowser();
    }, 0));
    ["filter-tags", "advanced-filter-content", "property-conditions"].forEach(id => $(id)?.addEventListener("change", () => setTimeout(applyFolderFilter, 0)));
    formCaptureEscape();
  }

  function formCaptureEscape() {
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && currentModal?.isConnected) {
        currentModal.remove();
        currentModal = null;
      }
    });
  }

  function setup() {
    if (isFolderSetupReady) return;
    isFolderSetupReady = true;
    addStyles();
    loadFolderData();
    injectFolderBrowser();
    injectFolderAssignment();
    injectSettingsPage();
    addSettingsMenuItem();
    sanitizeStoredCategoryFields();
    hideLegacyFields();
    cleanCurrentFilterValues();
    displayOnlyTypeAndTags();
    renderFolderSelect();
    renderFolderBrowser();
    exposeBackupAPI();
    assignCurrentRecordAfterSave();
    setupObservers();
    applyFolderFilter();
    try { window.lucide?.createIcons?.({ root: document.body }); } catch {}
  }

  // The preceding modules are imported in sequence by index.html; the DOM is ready by this point.
  setup();
})();
