
"use strict";

export function createRecordListFeature({
  $,
  esc,
  iconOf,
  getRecords,
  filterRecords,
  getFilterState,
  expanded,
  openRecord
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

    $("count").textContent = list.length + " shown";

    if (!list.length) {
      $("records").innerHTML =
        '<div class="empty">No records found.<br><br>Try changing your filters or search.</div>';
      return;
    }

    $("records").innerHTML = list.map(r => `
      <div class="record-card">
        <button class="record" data-open="${esc(r.id)}">
          <span class="record-icon">${esc(iconOf(r))}</span>
          <span class="record-info">
            <strong>${esc(r.name)}</strong>
            <p>${esc(r.type)}${r.category ? " · " + esc(r.category) : ""}${r.subcategory ? " · " + esc(r.subcategory) : ""}${r.tags.length ? " · " + esc(r.tags.join(", ")) : ""}</p>
          </span>
          <span class="record-arrow">›</span>
        </button>

        <div class="record-actions">
          <button class="preview-toggle ${expanded.has(r.id) ? "active" : ""}" data-preview="${esc(r.id)}">
            ${expanded.has(r.id) ? "Hide preview" : "Preview"} · ${r.properties.length}
          </button>
        </div>

        ${expanded.has(r.id) ? `
          <div class="record-preview">
            ${r.properties.length
              ? r.properties.map(p => `
                <div class="preview-property">
                  <span>${esc(p.name)}</span>
                  <strong>${esc(p.value)}</strong>
                </div>
              `).join("")
              : '<p class="muted">No properties defined.</p>'}
          </div>
        ` : ""}
      </div>
    `).join("");

    $("records").querySelectorAll("[data-open]").forEach(button => {
      button.onclick = () => openRecord(button.dataset.open);
    });

    $("records").querySelectorAll("[data-preview]").forEach(button => {
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
