
"use strict";

export function createPropertyEditor({
  $,
  esc,
  catalogNames
}) {
  function selectOptions(values, current, placeholder) {
    return `<option value="">${esc(placeholder)}</option>` +
      values.map(v =>
        `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(v)}</option>`
      ).join("") +
      `<option value="__new__">+ Create new...</option>`;
  }

  function setupSelect(id, values, current, placeholder, newInput) {
    const el = $(id);
    el.innerHTML = selectOptions(values, current, placeholder);
    el.value = values.includes(current) ? current : "";

    el.onchange = () => {
      const create = el.value === "__new__";
      $(newInput).hidden = !create;
      if (create) $(newInput).focus();
    };
  }

  function readSelect(id, newInput) {
    const el = $(id);
    if (el.value === "__new__") {
      return $(newInput).value.trim();
    }
    return el.value;
  }

  function renderPropertyRows(properties = []) {
    $("property-rows").innerHTML = "";
    properties.forEach(p => addPropertyRow(p.name, p.value));
  }

  function addPropertyRow(name = "", value = "") {
    const row = document.createElement("div");
    row.className = "property-row";

    row.innerHTML = `<select class="property-name">${selectOptions(catalogNames("properties"), name, "Property name")}</select>
<input class="property-new" placeholder="New property name" hidden>
<input class="property-value" placeholder="Value" value="${esc(value)}">
<button type="button" class="remove" aria-label="Remove property">×</button>`;

    const select = row.querySelector(".property-name");
    const newName = row.querySelector(".property-new");

    select.onchange = () => {
      newName.hidden = select.value !== "__new__";
      if (!newName.hidden) newName.focus();
    };

    row.querySelector(".remove").onclick = () => row.remove();
    $("property-rows").appendChild(row);
  }

  function readProperties() {
    return [...$("property-rows").querySelectorAll(".property-row")]
      .map(row => {
        const select = row.querySelector(".property-name");
        const name = select.value === "__new__"
          ? row.querySelector(".property-new").value.trim()
          : select.value;

        return {
          name,
          value: row.querySelector(".property-value").value.trim()
        };
      })
      .filter(p => p.name);
  }

  return {
    setupSelect,
    readSelect,
    renderPropertyRows,
    addPropertyRow,
    readProperties
  };
}
