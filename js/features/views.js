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
    if (!r) return;

    setCurrentId(id);

    $("dashboard").hidden = true;
    $("home").hidden = true;
    $("editor").hidden = true;
    $("detail").hidden = false;

    const records = getRecords();

    const props = r.properties.length
      ? r.properties.map(p =>
          `<div class="field"><span class="field-label">${esc(p.name)}</span>${esc(p.value)}</div>`
        ).join("")
      : '<p class="muted">No properties defined.</p>';

    const related = r.related.map(getRecord).filter(Boolean);
    const incoming = records.filter(
      x => x.id !== r.id && x.related.includes(r.id)
    );

    const relationList = arr => arr.length
      ? arr.map(x =>
          `<div class="relationship-item"><button data-related="${esc(x.id)}">${esc(iconOf(x))} ${esc(x.name)} <span class="relation-type">· ${esc(x.type)}</span></button></div>`
        ).join("")
      : '<p class="muted">None</p>';

    $("detail-content").innerHTML = `<p class="eyebrow">${esc(r.type.toUpperCase())}</p>
<div class="record-heading"><span class="record-icon">${esc(iconOf(r))}</span><div><h2>${esc(r.name)}</h2><p class="muted">${esc(r.category || "Uncategorized")}${r.subcategory ? " · " + esc(r.subcategory) : ""}</p></div></div>
<div class="actions"><button id="edit-record" class="primary">Edit Record</button><button id="delete-record" class="danger">Delete</button></div>
<div class="panel"><h3>Description</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.description || "No description.")}</p></div>
<div class="panel"><h3>Properties</h3>${props}</div>
<div class="panel"><h3>Tags</h3><div class="tags">${r.tags.length ? r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join(" ") : '<span class="muted">No tags</span>'}</div></div>
<div class="panel"><h3>Relationships</h3><p class="muted">Open a linked record to navigate through your database.</p>
<div class="relationship-group"><h4>Related records (${related.length})</h4>${relationList(related)}</div>
<div class="relationship-group"><h4>Linked to this record (${incoming.length})</h4>${relationList(incoming)}</div></div>`;

    $("edit-record").onclick = () => showForm(r);
    $("delete-record").onclick = () => deleteRecord(r.id);

    $("detail-content")
      .querySelectorAll("[data-related]")
      .forEach(button => {
        button.onclick = () => openRecord(button.dataset.related);
      });
  }

  return { openRecord };
}
