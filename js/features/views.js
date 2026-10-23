
"use strict";

export function createViewFeatures({
  $,
  esc,
  iconOf,
  getRecords,
  getRecord,
  deleteRecord,
  showForm,
  setCurrentId
}) {
  function openRecord(id) {
    const r = getRecord(id);

    if (!r) {
      alert("This record could not be found.");
      return;
    }

    setCurrentId(id);

    // Hide the main workspace and show the record details.
    // The correct dashboard element is "dashboard-view".
    $("home").hidden = true;
    $("dashboard-view").hidden = true;
    $("records-view").hidden = true;
    $("editor").hidden = true;
    $("detail").hidden = false;

    const records = getRecords();

    const propertyTypeLabel = property => ({
      number: "Number",
      percentage: "Percentage",
      text: "Text",
      list: "List"
    }[property.valueType] || "Text");

    const renderPropertyValue = property => {
      if (property.valueType === "percentage") {
        const value = Number(property.value);
        return Number.isFinite(value)
          ? `${esc(Number((value * 100).toFixed(6)))}%`
          : '<span class="muted">Not set</span>';
      }
      if (property.valueType === "list") {
        const items = Array.isArray(property.value) ? property.value : [];
        if (!items.length) return '<span class="muted">Empty list</span>';
        return `<ul class="property-detail-list">${items.map(item => {
          const itemType = item && typeof item === "object" && !Array.isArray(item) ? item.type : "text";
          const value = item && typeof item === "object" && !Array.isArray(item) ? item.value : item;
          if (itemType === "record") {
            const linked = getRecord(String(value ?? ""));
            return linked
              ? `<li><button type="button" class="property-record-link" data-related="${esc(linked.id)}">${iconOf(linked)} ${esc(linked.name)} <span class="relation-type">· ${esc(linked.type)}</span></button></li>`
              : `<li><span class="muted">Missing record reference: ${esc(value ?? "")}</span></li>`;
          }
          if (itemType === "percentage") {
            const n = Number(value);
            return `<li>${Number.isFinite(n) ? `${esc(Number((n * 100).toFixed(6)))}%` : "—"}</li>`;
          }
          if (itemType === "json") {
            const text = typeof value === "string" ? value : JSON.stringify(value);
            return `<li><code>${esc(text ?? "null")}</code></li>`;
          }
          return `<li>${esc(value ?? "—")}</li>`;
        }).join("")}</ul>`;
      }
      if (property.valueType === "number") {
        const n = Number(property.value);
        return property.value === null || property.value === "" || !Number.isFinite(n)
          ? '<span class="muted">Not set</span>'
          : esc(n);
      }
      return esc(property.value ?? "");
    };

    const props = r.properties.length
      ? r.properties.map(property =>
          `<div class="field"><span class="field-label">${esc(property.name)} <span class="property-type-chip">${propertyTypeLabel(property)}</span></span><div class="property-detail-value">${renderPropertyValue(property)}</div></div>`
        ).join("")
      : '<p class="muted">No properties defined.</p>';

    const related = r.related
      .map(getRecord)
      .filter(Boolean);

    const incoming = records.filter(
      x => x.id !== r.id && x.related.includes(r.id)
    );

    const relationList = arr => arr.length
      ? arr.map(x =>
          `<div class="relationship-item"><button type="button" data-related="${esc(x.id)}">${iconOf(x)} ${esc(x.name)} <span class="relation-type">· ${esc(x.type)}</span></button></div>`
        ).join("")
      : '<p class="muted">None</p>';

    $("detail-content").innerHTML = `
      <p class="eyebrow">${esc(r.type.toUpperCase())}</p>

      <div class="record-heading">
        <span class="record-icon">${iconOf(r)}</span>
        <div>
          <h2>${esc(r.name)}</h2>
          <p class="muted">
            ${esc(r.category || "Uncategorized")}${r.subcategory ? " · " + esc(r.subcategory) : ""}
          </p>
        </div>
      </div>

      <div class="actions">
        <button id="edit-record" class="primary" type="button">Edit Record</button>
        <button id="delete-record" class="danger" type="button">Delete</button>
      </div>

      <div class="panel">
        <h3>Description</h3>
        <p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.description || "No description.")}</p>
      </div>

      <div class="panel">
        <h3>Properties</h3>
        ${props}
      </div>

      <div class="panel">
        <h3>Tags</h3>
        <div class="tags">
          ${r.tags.length
            ? r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join(" ")
            : '<span class="muted">No tags</span>'}
        </div>
      </div>

      <div class="panel">
        <h3>Relationships</h3>
        <p class="muted">Open a linked record to navigate through your database.</p>

        <div class="relationship-group">
          <h4>Related records (${related.length})</h4>
          ${relationList(related)}
        </div>

        <div class="relationship-group">
          <h4>Linked to this record (${incoming.length})</h4>
          ${relationList(incoming)}
        </div>
      </div>
    `;

    $("edit-record").onclick = () => showForm(r);
    $("delete-record").onclick = () => deleteRecord(r.id);

    $("detail-content")
      .querySelectorAll("[data-related]")
      .forEach(button => {
        button.onclick = () => openRecord(button.dataset.related);
      });

    try { window.lucide?.createIcons?.({ root: $("detail-content") }); } catch {}
    window.scrollTo(0, 0);
  }

  return { openRecord };
}
