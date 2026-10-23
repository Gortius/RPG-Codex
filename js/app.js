import {
  loadRecords as loadStoredRecords,
  saveRecords as saveStoredRecords,
  loadSavedFilters as loadStoredSavedFilters,
  persistFilters as persistStoredFilters,
  loadProjects, saveProjects, getActiveProjectId, setActiveProjectId,
  exportProjectBundle, importProjectBundle, loadTrash, saveTrash
} from "./data/storage.js";
import { iconMarkup, paintIcons, mountIconPicker } from "./features/icon-library.js";

import { createRecordFeatures } from "./features/records.js";
import { createCatalogFeatures } from "./features/catalogs.js";
import { filterRecords } from "./features/filtering.js";
import { createViewFeatures } from "./features/views.js";
import { createPropertyEditor } from "./features/property-editor.js";
import { createPickerFeatures } from "./features/pickers.js";
import { createEditorFeatures } from "./features/editor.js";
import { createRecordFormFeature } from "./features/record-form.js";
import { createRecordListFeature } from "./features/record-list.js";
import { createFilterUIFeatures } from "./features/filter-ui.js";
import { createSavedFiltersFeature } from "./features/saved-filters.js";
import { createBulkActionsFeature } from "./features/bulk-actions.js";
import { createQuickMenu } from "./features/quick-menu.js";

"use strict";

const DEFAULT_TYPES = [
  "Mob", "Item", "Material", "Area", "Recipe",
  "Effect", "Skill", "NPC", "Boss"
];

const DEFAULT_TAGS = [
  "Common", "Uncommon", "Rare", "Epic",
  "Legendary", "Craftable", "Quest", "Optional"
];

const DEFAULT_PROPS = [
  "Health", "Damage", "Defense", "Armor", "Speed",
  "Attack Speed", "Cooldown", "Duration", "Level", "Rarity"
];

const $ = id => document.getElementById(id);

const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

const uid = () =>
  "r-" + Date.now().toString(36) + "-" +
  Math.random().toString(36).slice(2, 8);

const uniq = a =>
  [...new Set(
    a.map(x => String(x || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

const starter = [
  {
    id: "sample-mob",
    name: "Leafling",
    type: "Mob",
    category: "Beginning Hole",
    description: "A small creature found near the entrance.",
    tags: ["Common"],
    properties: [
      { name: "Health", value: "20" },
      { name: "Damage", value: "3" }
    ],
    related: []
  },
  {
    id: "sample-material",
    name: "Vines",
    type: "Material",
    category: "Beginning Hole",
    description: "A basic crafting material gathered from local creatures and plants.",
    tags: ["Craftable"],
    properties: [{ name: "Rarity", value: "Common" }],
    related: []
  },
  {
    id: "sample-item",
    name: "Leaf Bow",
    type: "Item",
    category: "Beginning Hole",
    description: "A simple bow made with materials from the starting area.",
    tags: ["Craftable", "Common"],
    properties: [
      { name: "Damage", value: "5" },
      { name: "Attack Speed", value: "1.0" }
    ],
    related: ["sample-recipe"]
  },
  {
    id: "sample-area",
    name: "Beginning Hole",
    type: "Area",
    category: "Sector 1",
    description: "The player's starting area, featuring a locked door and an early guardian.",
    tags: ["Starting Area"],
    properties: [{ name: "Level", value: "1" }],
    related: ["sample-mob"]
  },
  {
    id: "sample-effect",
    name: "Slowness",
    type: "Effect",
    category: "Debuff",
    description: "Reduces the affected target's movement speed.",
    tags: ["Debuff"],
    properties: [{ name: "Duration", value: "3 seconds" }],
    related: []
  },
  {
    id: "sample-recipe",
    name: "Leaf Bow Recipe",
    type: "Recipe",
    category: "Beginning Hole",
    description: "Crafting recipe for the Leaf Bow.",
    tags: ["Craftable"],
    properties: [{ name: "Material Cost", value: "Vines + Wood" }],
    related: ["sample-item"]
  }
];

let records = [];
let savedFilters = [];
let viewMode = "list";

try {
  viewMode = localStorage.getItem("rpg-codex-view-mode-v1") || "list";
} catch {}

let activeTypes = [];
let activeTags = [];
let conditions = [];
let qualityOnly = false;
let customColumns = 3;

try {
  const storedColumns = Number(
    localStorage.getItem("rpg-codex-custom-columns-v1")
  );

  if (Number.isFinite(storedColumns)) {
    customColumns = Math.max(2, Math.min(6, Math.round(storedColumns)));
  }
} catch {}

let expanded = new Set();

let filtersOpen = false;
let editingId = null;
let currentId = null;

let selectedTags = [];
let selectedRelated = [];

let tagOpen = false;
let relatedOpen = false;
let tagSearch = "";
let relatedSearch = "";
let tagCreateOpen = false;

function iconFor(type) {
  return ({
    Mob: "lucide:bug",
    Item: "lucide:swords",
    Material: "lucide:gem",
    Area: "lucide:map",
    Recipe: "lucide:scroll-text",
    Effect: "lucide:sparkles",
    Skill: "lucide:wand-sparkles",
    NPC: "lucide:user-round",
    Boss: "lucide:skull"
  })[type] || "lucide:circle";
}

function iconOf(record) {
  return iconMarkup(
    record.icon || iconFor(record.type),
    "circle",
    record.iconColor || "#B9A0FF"
  );
}

function loadRecords() {
  return loadStoredRecords(starter, uid);
}

function saveRecords() {
  if (!saveStoredRecords(records)) return false;

  syncCatalogs();
  saveCatalogs();

  $("status").textContent =
    "Saved in this browser · " + records.length + " records";

  return true;
}

const {
  syncCatalogs,
  mergeCatalog,
  loadCatalogs,
  saveCatalogs,
  catalogNames
} = createCatalogFeatures({
  getRecords: () => records,
  defaultTags: DEFAULT_TAGS,
  defaultProperties: DEFAULT_PROPS
});

const {
  setupSelect,
  readSelect,
  renderPropertyRows,
  addPropertyRow,
  readProperties
} = createPropertyEditor({
  $,
  esc,
  catalogNames
});

function persistFilters() {
  return persistStoredFilters(savedFilters);
}

function filterState() {
  return {
    query: $("search").value,
    types: [...activeTypes],
    category: $("filter-category").value,
    subcategory: $("filter-subcategory").value,
    tags: [...activeTags],
    sort: $("sort-records").value,
    conditions: conditions.map(c => ({ ...c }))
  };
}

function applyFilterState(state) {
  qualityOnly = false;
  activeTypes = state.types || [];
  activeTags = state.tags || [];

  $("search").value = state.query || "";

  renderFilterOptions();
  $("filter-category").value = state.category || "";

  renderFilterOptions();
  $("filter-category").value = state.category || "";
  $("filter-subcategory").value = state.subcategory || "";
  $("sort-records").value = state.sort || "name-asc";

  conditions = (state.conditions || []).map(c => ({ ...c }));

  renderConditionRows();
  renderCategories();
  renderRecords();
  updateFilterToggle();
}

const { renderRecords } = createRecordListFeature({
  $,
  esc,
  iconOf,
  getRecords: () => records,
  filterRecords,
  getFilterState: () => ({
    activeTypes,
    activeTags,
    conditions,
    qualityOnly
  }),
  expanded,
  openRecord: id => openRecord(id),
  getViewMode: () => viewMode,
  getCustomColumns: () => customColumns
});

const {
  renderCategories,
  renderFilterTags,
  renderFilterOptions,
  renderConditionRows,
  renderSavedFilters,
  updateFilterToggle
} = createFilterUIFeatures({
  $,
  esc,
  uniq,
  defaultTypes: DEFAULT_TYPES,
  getRecords: () => records,
  catalogNames,
  getActiveTypes: () => activeTypes,
  setActiveTypes: value => {
    activeTypes = value;
  },
  getActiveTags: () => activeTags,
  setActiveTags: value => {
    activeTags = value;
  },
  getConditions: () => conditions,
  getFiltersOpen: () => filtersOpen,
  getSavedFilters: () => savedFilters,
  renderRecords: () => renderRecords()
});

const {
  saveCurrentFilter,
  applySelectedFilter,
  deleteSelectedFilter
} = createSavedFiltersFeature({
  $,
  getSavedFilters: () => savedFilters,
  setSavedFilters: value => {
    savedFilters = value;
  },
  uid,
  getFilterState: () => filterState(),
  applyFilterState: state => applyFilterState(state),
  persistFilters: () => persistFilters(),
  renderSavedFilters: () => renderSavedFilters()
});

function renderHome() {
  $("home").hidden = false;
  $("detail").hidden = true;
  $("editor").hidden = true;

  $("dashboard-view").hidden = true;
  $("records-view").hidden = false;

  $("nav-dashboard").classList.remove("active");
  $("nav-records").classList.add("active");

  renderCategories();
  renderFilterOptions();
  renderConditionRows();
  renderSavedFilters();
  renderRecords();
  updateFilterToggle();
  paintIcons();
}

function dashboardRecordMarkup(record, detail) {
  return `
    <button
      class="dashboard-record"
      type="button"
      data-dashboard-open="${esc(record.id)}"
    >
      <span class="record-icon">${iconOf(record)}</span>
      <span class="dashboard-record-info">
        <strong>${esc(record.name)}</strong>
        <span>${esc(detail || record.type)}</span>
      </span>
      <span class="record-arrow">›</span>
    </button>
  `;
}

function renderDashboard() {
  $("home").hidden = false;
  $("detail").hidden = true;
  $("editor").hidden = true;

  $("dashboard-view").hidden = false;
  $("records-view").hidden = true;

  $("nav-dashboard").classList.add("active");
  $("nav-records").classList.remove("active");

  const typeCounts = records.reduce((counts, record) => {
    counts[record.type] = (counts[record.type] || 0) + 1;
    return counts;
  }, {});

  const usedTypes = Object.entries(typeCounts)
    .sort((a, b) => a[0].localeCompare(b[0]));

  const incomplete = records.filter(record => {
    const missingDescription = !String(record.description || "").trim();
    const missingTags =
      !Array.isArray(record.tags) || record.tags.length === 0;
    const missingProperties =
      !Array.isArray(record.properties) || record.properties.length === 0;

    return missingDescription || missingTags || missingProperties;
  });

  $("stat-total-value").textContent = records.length;
  $("stat-types-value").textContent = usedTypes.length;
  $("stat-quality-value").textContent = incomplete.length;

  $("dashboard-types").innerHTML = usedTypes.length
    ? usedTypes.map(([type, count]) => `
      <button
        class="dashboard-type"
        type="button"
        data-dashboard-type="${esc(type)}"
      >
        <span class="dashboard-type-icon">${iconMarkup(iconFor(type))}</span>
        <span class="dashboard-type-name">${esc(type)}</span>
        <span class="dashboard-type-count">${count}</span>
        <span class="dashboard-bar">
          <span style="width:${Math.round(
            count / Math.max(records.length, 1) * 100
          )}%"></span>
        </span>
      </button>
    `).join("")
    : '<p class="empty">No records yet. Create your first record to see a breakdown.</p>';

  const recent = [...records]
    .sort((a, b) => {
      const dateA = Date.parse(a.createdAt || "") || 0;
      const dateB = Date.parse(b.createdAt || "") || 0;
      return dateB - dateA || records.indexOf(b) - records.indexOf(a);
    })
    .slice(0, 5);

  $("dashboard-recent").innerHTML = recent.length
    ? recent.map(record =>
        dashboardRecordMarkup(
          record,
          record.type + (record.category ? " · " + record.category : "")
        )
      ).join("")
    : '<p class="empty">No records yet. Create your first record to get started.</p>';

  $("dashboard-types")
    .querySelectorAll("[data-dashboard-type]")
    .forEach(button => {
      button.onclick = () => {
        qualityOnly = false;
        activeTypes = [button.dataset.dashboardType];
        renderHome();
      };
    });

  $("dashboard-recent")
    .querySelectorAll("[data-dashboard-open]")
    .forEach(button => {
      button.onclick = () => openRecord(button.dataset.dashboardOpen);
    });

  paintIcons();
}

const {
  getRecord,
  deleteRecord
} = createRecordFeatures({
  getRecords: () => records,
  setRecords: nextRecords => {
    records = nextRecords;
  },
  saveRecords,
  renderHome,
  expanded,
  setCurrentId: id => {
    currentId = id;
  }
});

const { renderPicker } = createPickerFeatures({
  $,
  esc,
  getRecords: () => records,
  getRecord,
  catalogNames,
  mergeCatalog,
  saveCatalogs,
  getEditingId: () => editingId,
  getSelectedTags: () => selectedTags,
  setSelectedTags: value => {
    selectedTags = value;
  },
  getSelectedRelated: () => selectedRelated,
  setSelectedRelated: value => {
    selectedRelated = value;
  },
  getTagOpen: () => tagOpen,
  setTagOpen: value => {
    tagOpen = value;
  },
  getRelatedOpen: () => relatedOpen,
  setRelatedOpen: value => {
    relatedOpen = value;
  },
  getTagSearch: () => tagSearch,
  setTagSearch: value => {
    tagSearch = value;
  },
  getRelatedSearch: () => relatedSearch,
  setRelatedSearch: value => {
    relatedSearch = value;
  },
  getTagCreateOpen: () => tagCreateOpen,
  setTagCreateOpen: value => {
    tagCreateOpen = value;
  }
});

let openRecord;

const {
  showForm,
  cancelForm
} = createEditorFeatures({
  $,
  uniq,
  DEFAULT_TYPES,
  getRecords: () => records,
  getRecord,
  getCurrentId: () => currentId,
  setEditingId: value => {
    editingId = value;
  },
  setSelectedTags: value => {
    selectedTags = value;
  },
  setSelectedRelated: value => {
    selectedRelated = value;
  },
  setTagOpen: value => {
    tagOpen = value;
  },
  setRelatedOpen: value => {
    relatedOpen = value;
  },
  setTagCreateOpen: value => {
    tagCreateOpen = value;
  },
  setTagSearch: value => {
    tagSearch = value;
  },
  setRelatedSearch: value => {
    relatedSearch = value;
  },
  setupSelect,
  renderPropertyRows,
  renderPicker,
  openRecord: id => openRecord(id),
  renderHome
});

openRecord = createViewFeatures({
  $,
  esc,
  iconOf,
  getRecords: () => records,
  getRecord,
  deleteRecord,
  showForm,
  setCurrentId: id => {
    currentId = id;
  }
}).openRecord;

createRecordFormFeature({
  $,
  getRecords: () => records,
  setRecords: value => {
    records = value;
  },
  getEditingId: () => editingId,
  getSelectedTags: () => selectedTags,
  getSelectedRelated: () => selectedRelated,
  readSelect,
  readProperties,
  uniq,
  uid,
  getRecord,
  saveRecords,
  setCurrentId: value => {
    currentId = value;
  },
  openRecord: id => openRecord(id)
});

$("nav-dashboard").onclick = renderDashboard;

$("nav-records").onclick = () => {
  qualityOnly = false;
  renderHome();
};

$("dashboard-all-records").onclick = () => {
  qualityOnly = false;
  renderHome();
};

$("dashboard-new-record").onclick = () => {
  currentId = null;
  showForm();
};

$("stat-total").onclick = () => {
  qualityOnly = false;
  activeTypes = [];
  renderHome();
};

$("stat-types").onclick = () => {
  qualityOnly = false;
  activeTypes = [];
  renderHome();
};

$("stat-quality").onclick = () => {
  qualityOnly = true;
  activeTypes = [];
  renderHome();
};

$("new-record").onclick = () => {
  currentId = null;
  showForm();
};

$("add-property").onclick = () => addPropertyRow();

$("back").onclick = () => {
  currentId = null;
  renderHome();
};

$("cancel-top").onclick = cancelForm;
$("cancel-bottom").onclick = cancelForm;

$("search").addEventListener("input", renderRecords);

$("toggle-filters").onclick = () => {
  filtersOpen = !filtersOpen;
  updateFilterToggle();
};

$("filter-category").onchange = () => {
  renderFilterOptions();
  renderRecords();
  updateFilterToggle();
};

$("filter-subcategory").onchange = () => {
  renderRecords();
  updateFilterToggle();
};

$("sort-records").onchange = renderRecords;

$("add-filter-condition").onclick = () => {
  conditions.push({
    property: "",
    operator: "contains",
    value: ""
  });

  renderConditionRows();
  renderRecords();
  updateFilterToggle();
};

$("save-filter").onclick = saveCurrentFilter;
$("apply-saved-filter").onclick = applySelectedFilter;
$("delete-saved-filter").onclick = deleteSelectedFilter;

$("clear-filters").onclick = () => {
  qualityOnly = false;
  activeTypes = [];
  activeTags = [];
  conditions = [];

  $("search").value = "";
  $("filter-category").value = "";
  $("filter-subcategory").value = "";
  $("sort-records").value = "name-asc";

  renderHome();
};

function downloadJson(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupWorkspaceTools() {
  const switcher = $("project-switcher");
  const manageButton = $("project-manage");
  const backupFile = $("backup-file");
  const trashButton = $("trash-open");

  if (!switcher || !manageButton || !backupFile || !trashButton) return;

  let projects = loadProjects();

  if (!projects.some(project => project.id === getActiveProjectId())) {
    setActiveProjectId("default");
  }

  function renderProjects() {
    projects = loadProjects();

    switcher.innerHTML = projects.map(project =>
      `<option value="${esc(project.id)}">${esc(project.name)}</option>`
    ).join("");

    switcher.value = getActiveProjectId();
  }

  function activeProject() {
    return projects.find(project => project.id === getActiveProjectId());
  }

  function createProject() {
    const name = prompt("Name for the new project:");
    if (!name || !name.trim()) return;

    const id = "p-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 7);

    projects.push({
      id,
      name: name.trim(),
      createdAt: new Date().toISOString()
    });

    saveProjects(projects);
    setActiveProjectId(id);
    location.reload();
  }

  function renameProject() {
    const project = activeProject();
    if (!project) return;

    const name = prompt("New project name:", project.name);
    if (!name || !name.trim()) return;

    project.name = name.trim();
    saveProjects(projects);
    renderProjects();
  }

  function deleteProject() {
    const id = getActiveProjectId();

    if (id === "default") {
      alert("The original project cannot be deleted.");
      return;
    }

    const project = activeProject();

    if (!confirm(
      `Delete project “${project?.name || id}” and all its local data? ` +
      "Export a backup first if needed."
    )) return;

    [
      "rpg-codex-records-v2",
      "rpg-codex-catalogs-v1",
      "rpg-codex-saved-filters-v1",
      "rpg-codex-trash-v1"
    ].forEach(key => localStorage.removeItem(`${key}::${id}`));

    projects = projects.filter(item => item.id !== id);
    saveProjects(projects);
    setActiveProjectId("default");
    location.reload();
  }

  function exportProject() {
    try {
      const bundle = exportProjectBundle();
      bundle.records = records;

      downloadJson(
        `rpg-codex-${getActiveProjectId()}-backup.json`,
        bundle
      );
    } catch (error) {
      alert("Could not create backup: " + error.message);
    }
  }

  function startImport() {
    backupFile.click();
  }

  switcher.onchange = () => {
    if (switcher.value === getActiveProjectId()) return;

    setActiveProjectId(switcher.value);
    location.reload();
  };

  manageButton.onclick = () => {
    const action = prompt(
      "Projects\n\n" +
      "1. Add project\n" +
      "2. Rename current project\n" +
      "3. Delete current project\n" +
      "4. Export current project\n" +
      "5. Import project backup\n\n" +
      "Type a number or action name."
    );

    if (!action) return;

    const normalized = action.trim().toLowerCase();

    if (["1", "add", "new", "create"].includes(normalized)) {
      createProject();
    } else if (["2", "rename"].includes(normalized)) {
      renameProject();
    } else if (["3", "delete", "remove"].includes(normalized)) {
      deleteProject();
    } else if (["4", "export"].includes(normalized)) {
      exportProject();
    } else if (["5", "import"].includes(normalized)) {
      startImport();
    } else {
      alert("Choose an action from 1 to 5.");
    }
  };

  backupFile.onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const bundle = JSON.parse(await file.text());

      const replace = confirm(
        "Import mode:\n\n" +
        "OK = replace the current project's records.\n" +
        "Cancel = merge the backup with the current records."
      );

      const count = Array.isArray(bundle.records) ? bundle.records.length : 0;

      if (!confirm(
        `Import ${count} records into “${activeProject()?.name || "this project"}”?`
      )) return;

      importProjectBundle(bundle, { replace });

      alert("Import complete. The app will reload to show the imported data.");
      location.reload();
    } catch (error) {
      alert("Import failed: " + error.message);
    } finally {
      event.target.value = "";
    }
  };

  trashButton.onclick = () => {
    const trash = loadTrash();

    if (!trash.length) {
      alert("The trash is empty.");
      return;
    }

    const menu = trash.map((item, i) =>
      `${i + 1}. ${item.record?.name || "Unnamed record"}`
    ).join("\n");

    const choice = prompt(
      `Trash (${trash.length} items)\n${menu}\n\n` +
      "Type a number to restore, or EMPTY to permanently delete all items."
    );

    if (!choice) return;

    if (choice.trim().toLowerCase() === "empty") {
      if (confirm("Permanently delete every item in the trash? This cannot be undone.")) {
        saveTrash([]);
        alert("Trash emptied.");
      }
      return;
    }

    const index = Number(choice) - 1;

    if (!Number.isInteger(index) || index < 0 || index >= trash.length) {
      alert("Invalid selection.");
      return;
    }

    const item = trash[index];

    if (records.some(record => record.id === item.record.id)) {
      alert(
        "A record with this ID already exists. Export a backup and " +
        "resolve the conflict before restoring."
      );
      return;
    }

    const previousRecords = records;
    const restored = { ...item.record };

    delete restored._trashedAt;
    delete restored._linkedFrom;

    records = [...records, restored].map(record => ({
      ...record,
      related: [...(record.related || [])]
    }));

    (item.linkedFrom || item.record._linkedFrom || []).forEach(id => {
      const linked = records.find(record => record.id === id);

      if (linked && !linked.related.includes(restored.id)) {
        linked.related.push(restored.id);
      }
    });

    if (!saveRecords()) {
      records = previousRecords;
      return;
    }

    trash.splice(index, 1);

    try {
      saveTrash(trash);
    } catch (error) {
      console.error("Could not update trash", error);
    }

    renderHome();
    alert("Record restored.");
  };

  renderProjects();
}

records = loadRecords();
loadCatalogs();
savedFilters = loadStoredSavedFilters();

const bulkActions = createBulkActionsFeature({
  $,
  esc,
  uid,
  getRecords: () => records,
  setRecords: nextRecords => {
    records = nextRecords;
  },
  saveRecords,
  renderHome,
  catalogNames
});

createQuickMenu({
  $,
  showForm,
  setCurrentId: value => {
    currentId = value;
  },
  bulkActions,
  expanded,
  renderRecords,
  getViewMode: () => viewMode,
  setViewMode: value => {
    viewMode = value;
    try {
      localStorage.setItem("rpg-codex-view-mode-v1", value);
    } catch {}
  },
  getCustomColumns: () => customColumns,
  setCustomColumns: value => {
    customColumns = Math.max(2, Math.min(6, Math.round(Number(value) || 3)));
    try {
      localStorage.setItem(
        "rpg-codex-custom-columns-v1",
        String(customColumns)
      );
    } catch {}
  }
});

mountIconPicker({ $ });
setupWorkspaceTools();
renderDashboard();
