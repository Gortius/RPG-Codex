"use strict";

export function createRecordListFeature({
  $,
  esc,
  iconOf,
  getRecords,
  filterRecords,
  getFilterState,
  expanded,
  openRecord,
  getViewMode = () => "list"
}) {
  function renderRecords() {
    const state = getFilterState();

    const list = filterRecords(getRecords(), {
      query: $("search").value,
      types: state.activeTypes,
      category: $("filter-category").value,
      subcategory: $("filter-subcategory").value,
      tags: state.activeTags,
      conditions: state.conditions,
      sort: $("sort-records").value
    });

    const viewMode = getViewMode();
    const container = $("records");

    container.classList.toggle("grid-view", viewMode === "grid");
    container.classList.toggle("list-view", viewMode === "list");

    $("count").textContent = list.length + " shown";

    if (!list.length) {
      container.innerHTML =
        '<div class="empty">No records found.<br><br>Try changing your filters or search.</div>';
      return;
    }

    container.innerHTML = list.map(record => {
      const category = record.category || record.type;

      if (viewMode === "grid") {
        return `
          <div class="record-card compact-card">
            <button class="record compact-record"
              type="button"
              data-open="${esc(record.id)}"
              aria-pressed="false">
              <span class="record-icon">${esc(iconOf(record))}</span>
              <strong class="compact-record-name">${esc(record.name)}</strong>
              <span class="compact-record-category">${esc(category)}</span>
            </button>
          </div>
        `;
      }

      return `
        <div class="record-card">
          <button class="record"
            type="button"
            data-open="${esc(record.id)}"
            aria-pressed="false">
            <span class="record-icon">${esc(iconOf(record))}</span>

            <span class="record-info">
              <strong>${esc(record.name)}</strong>
              <p>${esc(record.type)}${record.category ? " · " + esc(record.category) : ""}${record.subcategory ? " · " + esc(record.subcategory) : ""}${record.tags.length ? " · " + esc(record.tags.join(", ")) : ""}</p>
            </span>

            <span class="record-arrow">›</span>
          </button>

          <div class="record-actions">
            <button class="preview-toggle ${expanded.has(record.id) ? "active" : ""}"
              type="button"
              data-preview="${esc(record.id)}">
              ${expanded.has(record.id) ? "Hide preview" : "Preview"} · ${record.properties.length}
            </button>
          </div>

          ${expanded.has(record.id) ? `
            <div class="record-preview">
              ${record.properties.length
                ? record.properties.map(property => `
                  <div class="preview-property">
                    <span>${esc(property.name)}</span>
                    <strong>${esc(property.value)}</strong>
                  </div>
                `).join("")
                : '<p class="muted">No properties defined.</p>'}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

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
