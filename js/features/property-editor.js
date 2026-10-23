"use strict";

const VALUE_TYPES = [
  { value: "number", label: "Number" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "text", label: "Text" },
  { value: "list", label: "List" }
];
const ITEM_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "record", label: "Record reference" },
  { value: "json", label: "JSON / other value" }
];
const strictNumber = value => {
  const text = String(value ?? "").trim();
  if (!text || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

function inferValueType(property) {
  if (VALUE_TYPES.some(type => type.value === property?.valueType)) return property.valueType;
  if (Array.isArray(property?.value)) return "list";
  if (typeof property?.value === "number") return "number";
  const value = String(property?.value ?? "").trim();
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*%$/.test(value)) return "percentage";
  if (strictNumber(value) !== null) return "number";
  return "text";
}

function normalizeListItems(value) {
  if (!Array.isArray(value)) {
    if (value === null || value === undefined || value === "") return [];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) value = parsed;
        else value = value.split(/\r?\n/).filter(Boolean);
      } catch { value = value.split(/\r?\n/).filter(Boolean); }
    } else value = [value];
  }
  return value.map(item => {
    if (item && typeof item === "object" && !Array.isArray(item) && ITEM_TYPES.some(t => t.value === item.type)) {
      return { type: item.type, value: item.value ?? "" };
    }
    if (typeof item === "number") return { type: "number", value: item };
    if (item && typeof item === "object") return { type: "json", value: item };
    return { type: "text", value: String(item ?? "") };
  });
}

export function createPropertyEditor({ $, esc, catalogNames, getRecords = () => [] }) {
  function selectOptions(values, current, placeholder) {
    const options = [...new Set([...(values || []), ...(current && !(values || []).includes(current) ? [current] : [])])];
    return `<option value="">${esc(placeholder)}</option>` +
      options.map(v => `<option value="${esc(v)}" ${v === current ? "selected" : ""}>${esc(v)}</option>`).join("") +
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
    return el.value === "__new__" ? $(newInput).value.trim() : el.value;
  }

  function listRecordOptions(currentId) {
    const records = Array.isArray(getRecords()) ? getRecords() : [];
    const currentExists = records.some(record => String(record.id) === String(currentId));
    const missing = currentId && !currentExists
      ? `<option value="${esc(currentId)}" selected>(Unavailable record: ${esc(currentId)})</option>`
      : "";
    return missing + records.map(record =>
      `<option value="${esc(record.id)}" ${String(record.id) === String(currentId) ? "selected" : ""}>${esc(record.name)} · ${esc(record.type || "Record")}</option>`
    ).join("");
  }

  function renderListItem(item = { type: "text", value: "" }, index = 0) {
    const type = ITEM_TYPES.some(option => option.value === item.type) ? item.type : "text";
    const typeOptions = ITEM_TYPES.map(option =>
      `<option value="${option.value}" ${type === option.value ? "selected" : ""}>${option.label}</option>`
    ).join("");
    let input = "";
    if (type === "record") {
      input = `<select data-list-item-record aria-label="Record for list item"><option value="">Choose a record…</option>${listRecordOptions(item.value)}</select>`;
    } else if (type === "json") {
      const value = typeof item.value === "string" ? item.value : JSON.stringify(item.value ?? null);
      input = `<input data-list-item-value type="text" aria-label="JSON list item" placeholder='e.g. {"kind":"fire"} or [1,2,3]' value="${esc(value)}">`;
    } else if (type === "number") {
      input = `<input data-list-item-value type="number" step="any" aria-label="Numeric list item" value="${esc(item.value ?? "")}" placeholder="Number">`;
    } else if (type === "percentage") {
      const percent = item.value === "" || item.value == null ? "" : Number(item.value) * 100;
      input = `<input data-list-item-value type="number" step="any" aria-label="Percentage list item" value="${esc(Number.isFinite(percent) ? percent : "")}" placeholder="e.g. 20 for 20%">`;
    } else {
      input = `<input data-list-item-value type="text" aria-label="Text list item" value="${esc(item.value ?? "")}" placeholder="List item">`;
    }
    return `<div class="property-list-item" data-list-item data-list-index="${index}">
      <select data-list-item-type aria-label="List item type">${typeOptions}</select>
      <div class="property-list-item-value">${input}</div>
      <button type="button" class="remove" data-remove-list-item aria-label="Remove list item">×</button>
    </div>`;
  }

  function renderValueControl(row, type, value) {
    const container = row.querySelector(".property-value-container");
    if (!container) return;
    type = VALUE_TYPES.some(item => item.value === type) ? type : "text";
    row.dataset.valueType = type;

    if (type === "number") {
      const v = value === null || value === undefined ? "" : value;
      container.innerHTML = `<input class="property-value" data-property-scalar type="number" step="any" aria-label="Number property value" value="${esc(v)}" placeholder="Enter a number">`;
      return;
    }
    if (type === "percentage") {
      const n = value === null || value === undefined || value === "" ? "" : Number(value) * 100;
      container.innerHTML = `<input class="property-value" data-property-scalar type="number" step="any" aria-label="Percentage property value" value="${esc(Number.isFinite(n) ? n : "")}" placeholder="e.g. 20 for 20%"><small class="property-value-hint">Enter 20 for 20%. Formulas receive 0.2.</small>`;
      return;
    }
    if (type === "text") {
      const v = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      container.innerHTML = `<input class="property-value" data-property-scalar type="text" aria-label="Text property value" value="${esc(v)}" placeholder="Enter text">`;
      return;
    }

    const items = normalizeListItems(value);
    container.innerHTML = `<div class="property-list-items">${items.map(renderListItem).join("")}</div>
      <button class="secondary property-add-list-item" type="button" data-add-list-item>＋ Add list item</button>
      <small class="property-value-hint">A list can mix text, numbers, percentages, JSON values and references to any record. Lists are not used in formulas.</small>`;
  }

  function readRawCurrentValue(row) {
    const type = row.dataset.valueType || "text";
    if (type === "list") return readListItems(row, false);
    const scalar = row.querySelector("[data-property-scalar]")?.value ?? "";
    if (type === "number") return scalar.trim() === "" ? null : strictNumber(scalar);
    if (type === "percentage") return scalar.trim() === "" ? null : (strictNumber(scalar) ?? 0) / 100;
    return scalar;
  }

  function readListItems(row, validate = true) {
    return [...row.querySelectorAll("[data-list-item]")].map((itemRow, index) => {
      const type = itemRow.querySelector("[data-list-item-type]")?.value || "text";
      const input = itemRow.querySelector("[data-list-item-value]");
      let value;
      if (type === "record") {
        value = itemRow.querySelector("[data-list-item-record]")?.value || "";
      } else if (type === "number") {
        const raw = input?.value ?? "";
        value = raw.trim() === "" ? null : strictNumber(raw);
        if (validate && raw.trim() !== "" && value === null) throw new Error(`List item ${index + 1} must contain a valid number.`);
      } else if (type === "percentage") {
        const raw = input?.value ?? "";
        const parsed = raw.trim() === "" ? null : strictNumber(raw);
        if (validate && raw.trim() !== "" && parsed === null) throw new Error(`List item ${index + 1} must contain a valid percentage.`);
        value = parsed === null ? null : parsed / 100;
      } else if (type === "json") {
        const raw = input?.value ?? "";
        if (!raw.trim()) value = null;
        else {
          try { value = JSON.parse(raw); }
          catch { if (validate) throw new Error(`List item ${index + 1} must contain valid JSON.`); value = raw; }
        }
      } else value = input?.value ?? "";
      return { type, value };
    });
  }

  function addPropertyRow(property = {}) {
    if (typeof property === "string") property = { name: property, value: arguments[1] ?? "", valueType: "text" };
    const name = property?.name || "";
    const value = property?.value ?? "";
    const valueType = inferValueType(property);
    const row = document.createElement("div");
    row.className = "property-row";
    row.innerHTML = `
      <div class="property-name-wrap">
        <select class="property-name" aria-label="Property name">${selectOptions(catalogNames("properties"), name, "Property name")}</select>
        <input class="property-new" placeholder="New property name" aria-label="New property name" hidden>
      </div>
      <div class="property-type-wrap"><label class="property-inline-label">Value type</label><select class="property-type" aria-label="Property value type">${VALUE_TYPES.map(option => `<option value="${option.value}" ${valueType === option.value ? "selected" : ""}>${option.label}</option>`).join("")}</select></div>
      <div class="property-value-container"></div>
      <button type="button" class="remove" aria-label="Remove property">×</button>`;

    const nameSelect = row.querySelector(".property-name");
    const nameInput = row.querySelector(".property-new");
    const typeSelect = row.querySelector(".property-type");
    renderValueControl(row, valueType, value);
    nameSelect.onchange = () => {
      const creating = nameSelect.value === "__new__";
      nameInput.hidden = !creating;
      if (creating) nameInput.focus();
    };
    typeSelect.onchange = () => {
      let nextValue = readRawCurrentValue(row);
      if (typeSelect.value === "list" && !Array.isArray(nextValue)) nextValue = [];
      else if (typeSelect.value !== "list" && Array.isArray(nextValue)) nextValue = JSON.stringify(nextValue);
      renderValueControl(row, typeSelect.value, nextValue);
    };
    row.addEventListener("change", event => {
      const itemType = event.target.closest("[data-list-item-type]");
      if (!itemType) return;
      const items = readListItems(row, false);
      const itemRow = itemType.closest("[data-list-item]");
      const index = Number(itemRow?.dataset.listIndex);
      const defaults = { text: "", number: null, percentage: null, record: "", json: null };
      items[index] = { type: itemType.value, value: defaults[itemType.value] };
      renderValueControl(row, "list", items);
    });
    row.addEventListener("click", event => {
      if (event.target.closest("[data-add-list-item]")) {
        const items = readListItems(row, false);
        items.push({ type: "text", value: "" });
        renderValueControl(row, "list", items);
      }
      const removeItem = event.target.closest("[data-remove-list-item]");
      if (removeItem) {
        const items = readListItems(row, false);
        const index = Number(removeItem.closest("[data-list-item]")?.dataset.listIndex);
        items.splice(index, 1);
        renderValueControl(row, "list", items);
      }
    });
    row.querySelector(".remove").onclick = () => row.remove();
    $("property-rows").appendChild(row);
  }

  function renderPropertyRows(properties = []) {
    $("property-rows").innerHTML = "";
    properties.forEach(property => addPropertyRow(property));
  }

  function readProperties() {
    return [...$("property-rows").querySelectorAll(".property-row")].map(row => {
      const select = row.querySelector(".property-name");
      const name = select.value === "__new__" ? row.querySelector(".property-new").value.trim() : select.value;
      const valueType = row.querySelector(".property-type")?.value || "text";
      let value;
      if (valueType === "list") value = readListItems(row, true);
      else {
        const raw = row.querySelector("[data-property-scalar]")?.value ?? "";
        if (valueType === "number") {
          value = raw.trim() === "" ? null : strictNumber(raw);
          if (raw.trim() !== "" && value === null) throw new Error(`Property “${name || "(unnamed)"}” must contain a valid number.`);
        } else if (valueType === "percentage") {
          const parsed = raw.trim() === "" ? null : strictNumber(raw);
          if (raw.trim() !== "" && parsed === null) throw new Error(`Property “${name || "(unnamed)"}” must contain a valid percentage.`);
          value = parsed === null ? null : parsed / 100;
        } else value = raw;
      }
      return { name, valueType, value };
    }).filter(property => property.name);
  }

  return { setupSelect, readSelect, renderPropertyRows, addPropertyRow, readProperties };
}
