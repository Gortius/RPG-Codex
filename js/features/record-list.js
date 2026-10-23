
"use strict";

const VIEW_FIX_STYLE_ID = "rpg-codex-view-mode-fixes";

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

function ensureViewModeStyles() {
  if (document.getElementById(VIEW_FIX_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = VIEW_FIX_STYLE_ID;

  style.textContent = `
    /* Ícones de navegação no cabeçalho */
    #top-page-nav {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      width: fit-content;
      margin: 0;
      padding: 4px;
      background: transparent;
      border: 0;
    }

    #top-page-nav .nav-button {
      display: grid;
      place-items: center;
      flex: 0 0 42px;
      width: 42px;
      height: 42px;
      padding: 0;
    }

    #top-page-nav .nav-button svg {
      display: block;
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }

    /* Ordenação da lista */
    .records-heading {
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .records-tools {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
      margin-left: auto;
    }

    .records-tools .sort-label {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }

    .records-tools #sort-records {
      width: auto;
      min-width: 170px;
      max-width: 240px;
      padding: 9px 10px;
    }

    .records-tools #sort-direction {
      padding: 9px 11px;
      white-space: nowrap;
    }

    .records-tools #count {
      white-space: nowrap;
    }

    @media (max-width: 760px) {
      .records-tools {
        justify-content: flex-start;
        width: 100%;
        margin-left: 0;
      }

      .records-tools #sort-records {
        flex: 1 1 170px;
        min-width: 0;
        max-width: 100%;
      }
    }

    @media (max-width: 420px) {
      .records-tools .sort-label {
        flex-basis: 100%;
      }

      .records-tools #sort-records {
        flex-basis: 100%;
      }
    }

    /* Custom Grid com Preview */
    #records.custom-grid {
      display: grid;
      grid-template-columns:
        repeat(var(--custom-grid-columns, 3), minmax(0, 1fr));
      align-items: start;
      gap: 10px;
    }

    #records.custom-grid .record-card {
      display: flex;
      flex-direction: column;
      align-self: start;
      min-width: 0;
      height: auto;
    }

    #records.custom-grid .record-card > .record {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      width: 100%;
      min-width: 0;
      height: auto;
      padding: 11px;
    }

    #records.custom-grid .record-card > .record .record-icon {
      flex: 0 0 30px;
      width: 30px;
      height: 30px;
      font-size: 18px;
    }

    #records.custom-grid .record-info {
      flex: 1 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    #records.custom-grid .record-info strong {
      display: block;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    #records.custom-grid .record-info p {
      margin-top: 5px;
      line-height: 1.4;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    #records.custom-grid .record-arrow {
      flex: 0 0 auto;
      margin-left: auto;
    }

    #records.custom-grid .record-actions {
      display: flex !important;
      justify-content: flex-start;
      padding: 0 11px 10px;
    }

    #records.custom-grid .preview-toggle {
      max-width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    #records.custom-grid .record-preview {
      display: block !important;
      min-width: 0;
      padding: 10px 11px 12px;
      overflow-wrap: anywhere;
    }

    #records.custom-grid .preview-property {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      min-width: 0;
      padding: 7px 0;
    }

    #records.custom-grid .preview-property span,
    #records.custom-grid .preview-property strong {
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    #records.custom-grid .preview-property strong {
      text-align: left;
    }

    @media (max-width: 760px) {
      #records.custom-grid {
        grid-template-columns:
          repeat(var(--custom-grid-columns, 3), minmax(0, 1fr));
        gap: 7px;
      }

      #records.custom-grid .record-card > .record {
        gap: 7px;
        padding: 9px;
      }

      #records.custom-grid .record-card > .record .record-icon {
        flex-basis: 25px;
        width: 25px;
        height: 25px;
        font-size: 16px;
      }

      #records.custom-grid .record-info strong {
        font-size: 12px;
      }

      #records.custom-grid .record-info p {
        font-size: 10px;
      }

      #records.custom-grid .record-actions {
        padding: 0 9px 9px;
      }

      #records.custom-grid .preview-toggle {
        padding: 5px 7px;
        font-size: 11px;
      }

      #records.custom-grid .record-preview {
        padding: 8px 9px 10px;
      }
    }

    @media (max-width: 420px) {
      #records.custom-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  document.head.append(style);
}

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
  ensureViewModeStyles();

  const sortSelect = $("sort-records");
  const directionButton = $("sort-direction");

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
                            <strong>${esc(property.value)}</strong>
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
