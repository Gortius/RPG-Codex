
"use strict";

const LEGACY_SORTS = {
  "name": { key: "name", direction: "asc", option: "name-asc" },
  "name-asc": { key: "name", direction: "asc", option: "name-asc" },
  "name-desc": { key: "name", direction: "desc", option: "name-asc" },
  "details": { key: "details", direction: "asc", option: "details-asc" },
  "details-asc": { key: "details", direction: "asc", option: "details-asc" },
  "details-desc": { key: "details", direction: "desc", option: "details-asc" },
  "date": { key: "date", direction: "asc", option: "oldest" },
  "oldest": { key: "date", direction: "asc", option: "oldest" },
  "newest": { key: "date", direction: "desc", option: "oldest" },
  "relations": { key: "relations", direction: "asc", option: "relations-asc" },
  "relations-asc": { key: "relations", direction: "asc", option: "relations-asc" },
  "relations-desc": { key: "relations", direction: "desc", option: "relations-asc" },
  "type": { key: "name", direction: "asc", option: "name-asc" },
  "category": { key: "name", direction: "asc", option: "name-asc" }
};

function getSortInfoFromSelect(select) {
  const value = select?.value || "name-asc";

  if (LEGACY_SORTS[value]) {
    return LEGACY_SORTS[value];
  }

  return {
    key: "name",
    direction: "asc",
    option: "name-asc"
  };
}

function updateDirectionButton($) {
  const button = $("sort-direction");
  if (!button) return;

  const direction = button.dataset.direction === "desc"
    ? "desc"
    : "asc";

  button.dataset.direction = direction;
  button.textContent = direction === "asc"
    ? "↑ Ascending"
    : "↓ Descending";

  button.title = direction === "asc"
    ? "Switch to descending order"
    : "Switch to ascending order";

  button.setAttribute(
    "aria-label",
    direction === "asc"
      ? "Switch to descending order"
      : "Switch to ascending order"
  );
}

export function createRecordListFeature({
  $,
  esc,
  iconOf,
  getRecords,
  filterRecords,
  getFilterState,
  expanded,
  openRecord,
  getViewMode = () => "list",
  getCustomColumns = () => 3
}) {
  const sortSelect = $("sort-records");
  const directionButton = $("sort-direction");
  function previewValue(property) {
    if (property.valueType === "percentage") {
      const value = Number(property.value);
      return Number.isFinite(value) ? `${Number((value * 100).toFixed(6))}%` : "—";
    }
    if (property.valueType === "list") {
      const items = Array.isArray(property.value) ? property.value : [];
      return `List · ${items.length} item${items.length === 1 ? "" : "s"}`;
    }
    if (property.valueType === "number") {
      const value = Number(property.value);
      return property.value === null || property.value === "" || !Number.isFinite(value) ? "—" : String(value);
    }
    return String(property.value ?? "");
  }


  // Compatibilidade com os valores de ordenação das versões anteriores.
  if (sortSelect) {
    const saved = LEGACY_SORTS[sortSelect.value];

    if (saved) {
      sortSelect.value = saved.option;

      if (directionButton && saved.direction === "desc") {
        directionButton.dataset.direction = "desc";
      }
    }
  }

  updateDirectionButton($);

  if (directionButton) {
    directionButton.onclick = () => {
      directionButton.dataset.direction =
        directionButton.dataset.direction === "desc"
          ? "asc"
          : "desc";

      updateDirectionButton($);
      renderRecords();
    };
  }

  function renderRecords() {
    updateDirectionButton($);

    const state = getFilterState();
    const sortInfo = getSortInfoFromSelect(sortSelect);
    const direction = directionButton?.dataset.direction === "desc"
      ? "desc"
      : "asc";

    const sort = `${sortInfo.key}-${direction}`;

    let list = filterRecords(getRecords(), {
      query: $("search").value,
      types: state.activeTypes,
      category: $("filter-category").value,
      subcategory: $("filter-subcategory").value,
      tags: state.activeTags,
      conditions: state.conditions,
      sort
    });

    if (state.qualityOnly) {
      list = list.filter(record =>
        !String(record.description || "").trim() ||
        !Array.isArray(record.tags) ||
        record.tags.length === 0 ||
        !Array.isArray(record.properties) ||
        record.properties.length === 0
      );
    }

    const viewMode = getViewMode();
    const container = $("records");

    container.classList.toggle("grid-view", viewMode === "grid");
    container.classList.toggle("list-view", viewMode === "list");
    container.classList.toggle("custom-grid", viewMode === "custom");

    const columns = Math.max(
      2,
      Math.min(6, Number(getCustomColumns()) || 3)
    );

    container.style.setProperty(
      "--custom-grid-columns",
      String(columns)
    );

    $("count").textContent = list.length + " shown";

    if (!list.length) {
      container.innerHTML =
        '<div class="empty">No records found.<br><br>Try changing your filters or search.</div>';
      return;
    }

    container.innerHTML = list.map(record => {
      const tags = Array.isArray(record.tags) ? record.tags : [];
      const properties = Array.isArray(record.properties)
        ? record.properties
        : [];

      const category = record.category || record.type;

      // O Grid tradicional permanece compacto.
      // O Custom Grid usa o conteúdo completo da lista e inclui Preview.
      if (viewMode === "grid") {
        return `
          <div class="record-card compact-card">
            <button
              class="record compact-record"
              type="button"
              data-open="${esc(record.id)}"
              aria-pressed="false"
            >
              <span class="record-icon">${iconOf(record)}</span>
              <strong class="compact-record-name">${esc(record.name)}</strong>
              <span class="compact-record-category">${esc(category)}</span>
            </button>
          </div>
        `;
      }

      return `
        <div class="record-card">
          <button
            class="record"
            type="button"
            data-open="${esc(record.id)}"
            aria-pressed="false"
          >
            <span class="record-icon">${iconOf(record)}</span>

            <span class="record-info">
              <strong>${esc(record.name)}</strong>
              <p>${esc(record.type)}${
                record.category ? " · " + esc(record.category) : ""
              }${
                record.subcategory ? " · " + esc(record.subcategory) : ""
              }${
                tags.length ? " · " + esc(tags.join(", ")) : ""
              }</p>
            </span>

            <span class="record-arrow">›</span>
          </button>

          <div class="record-actions">
            <button
              class="preview-toggle ${
                expanded.has(record.id) ? "active" : ""
              }"
              type="button"
              data-preview="${esc(record.id)}"
            >
              ${
                expanded.has(record.id)
                  ? "Hide preview"
                  : "Preview"
              } · ${properties.length}
            </button>
          </div>

          ${
            expanded.has(record.id)
              ? `
                <div class="record-preview">
                  ${
                    properties.length
                      ? properties.map(property => `
                          <div class="preview-property">
                            <span>${esc(property.name)}</span>
                            <strong>${esc(previewValue(property))}</strong>
                          </div>
                        `).join("")
                      : '<p class="muted">No properties defined.</p>'
                  }
                </div>
              `
              : ""
          }
        </div>
      `;
    }).join("");

    try {
      window.lucide?.createIcons?.({ root: container });
    } catch {}

    container.querySelectorAll("[data-open]").forEach(button => {
      button.onclick = () => openRecord(button.dataset.open);
    });

    container.querySelectorAll("[data-preview]").forEach(button => {
      button.onclick = () => {
        const id = button.dataset.preview;

        if (expanded.has(id)) {
          expanded.delete(id);
        } else {
          expanded.add(id);
        }

        renderRecords();
      };
    });
  }

  return { renderRecords };
}
