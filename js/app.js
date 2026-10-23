import {
  loadRecords as loadStoredRecords,
  saveRecords as saveStoredRecords,
  loadSavedFilters as loadStoredSavedFilters,
  persistFilters as persistStoredFilters,
  getScopedStorageKey,
  STORAGE_KEY,
  CATALOG_KEY
} from "./data/storage.js?v=20261023-r5";
import { iconMarkup, paintIcons, mountIconPicker } from "./features/icon-library.js";
import { STARTER_RECORDS } from "./data/default-records.js";

import { createRecordFeatures } from "./features/records.js?v=20261023-r5";
import { createCatalogFeatures } from "./features/catalogs.js?v=20261023-r5";
import { filterRecords } from "./features/filtering.js?v=20261023-r5";
import { createViewFeatures } from "./features/views.js?v=20261023-r5";
import { createPropertyEditor } from "./features/property-editor.js?v=20261023-r5";
import { createPickerFeatures } from "./features/pickers.js";
import { createEditorFeatures } from "./features/editor.js";
import { createRecordFormFeature } from "./features/record-form.js?v=20261023-r5";
import { createRecordListFeature } from "./features/record-list.js?v=20261023-r5";
import { createFilterUIFeatures } from "./features/filter-ui.js";
import { createSavedFiltersFeature } from "./features/saved-filters.js";
import { createBulkActionsFeature } from "./features/bulk-actions.js?v=20261023-r5";
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

// App state. Keep these declarations centralized so feature modules can
// safely receive references to the same in-memory data and UI state.
let records = [];
let savedFilters = [];
let viewMode = "list";

try {
  const storedViewMode = localStorage.getItem("rpg-codex-view-mode-v1");
  if (["list", "grid", "custom"].includes(storedViewMode)) {
    viewMode = storedViewMode;
  }
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
  return loadStoredRecords(STARTER_RECORDS, uid);
}

function saveRecords() {
  let previousRecordsRaw;
  let previousCatalogsRaw;

  try {
    previousRecordsRaw = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));
    previousCatalogsRaw = localStorage.getItem(getScopedStorageKey(CATALOG_KEY));
  } catch (error) {
    console.error("Could not snapshot records/catalogs before saving.", error);
    alert("Could not access browser storage. The changes were not confirmed as saved.");
    return false;
  }

  if (!saveStoredRecords(records)) return false;

  try {
    syncCatalogs();
    if (!saveCatalogs()) {
      throw new Error("The tag/property catalog could not be saved.");
    }
  } catch (error) {
    console.error("Record/catalog save failed; rolling back the record write.", error);
    try {
      const recordsKey = getScopedStorageKey(STORAGE_KEY);
      const catalogsKey = getScopedStorageKey(CATALOG_KEY);

      if (previousRecordsRaw === null) localStorage.removeItem(recordsKey);
      else localStorage.setItem(recordsKey, previousRecordsRaw);

      if (previousCatalogsRaw === null) localStorage.removeItem(catalogsKey);
      else localStorage.setItem(catalogsKey, previousCatalogsRaw);
    } catch (rollbackError) {
      console.error("Could not roll back record/catalog writes after save failure.", rollbackError);
      alert("The catalog could not be saved and rollback also failed. Export or preserve a backup before further changes.");
    }
    return false;
  }

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
  catalogNames,
  getRecords: () => records
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
    sortDirection: $("sort-direction")?.dataset.direction === "desc" ? "desc" : "asc",
    conditions: conditions.map(c => ({ ...c }))
  };
}

function applyFilterState(state) {
  qualityOnly = false;
  activeTypes = Array.isArray(state.types) ? state.types : [];
  activeTags = Array.isArray(state.tags) ? state.tags : [];

  $("search").value = state.query || "";

  renderFilterOptions();
  $("filter-category").value = state.category || "";

  renderFilterOptions();
  $("filter-category").value = state.category || "";
  $("filter-subcategory").value = state.subcategory || "";
  const legacySort = String(state.sort || "name-asc");
  const sortOptionAliases = {
    name: "name-asc",
    "name-asc": "name-asc",
    "name-desc": "name-asc",
    type: "name-asc",
    category: "name-asc",
    details: "details-asc",
    "details-asc": "details-asc",
    "details-desc": "details-asc",
    date: "oldest",
    oldest: "oldest",
    newest: "oldest",
    relations: "relations-asc",
    "relations-asc": "relations-asc",
    "relations-desc": "relations-asc"
  };
  $("sort-records").value = sortOptionAliases[legacySort] || "name-asc";
  const sortDirection = state.sortDirection === "desc" ||
    (!state.sortDirection && /(?:-desc|newest)$/.test(legacySort))
    ? "desc"
    : "asc";
  const sortDirectionButton = $("sort-direction");
  if (sortDirectionButton) sortDirectionButton.dataset.direction = sortDirection;

  conditions = Array.isArray(state.conditions)
    ? state.conditions
        .filter(condition => condition && typeof condition === "object" && !Array.isArray(condition))
        .map(condition => ({
          ...condition,
          property: String(condition.property ?? ""),
          operator: String(condition.operator || "contains"),
          value: String(condition.value ?? "")
        }))
    : [];

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
  $("sort-direction").dataset.direction = "asc";

  renderHome();
};

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

mountIconPicker({ $, renderIcons: false });
renderDashboard();
