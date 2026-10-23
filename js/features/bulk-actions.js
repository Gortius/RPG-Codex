"use strict";

export function createBulkActionsFeature({
  $,
  esc,
  uid,
  getRecords,
  setRecords,
  saveRecords,
  renderHome,
  catalogNames
}) {
  const selected = new Set();

  let selectionMode = false;
  let clipboard = null;
  let undoSnapshot = null;
  let undoLabel = "";
  let holdTimer = null;
  let holdTarget = null;
  let suppressClickId = null;

  const HOLD_DURATION = 450;
  const clone = value => JSON.parse(JSON.stringify(value));

  function uniqueName(base, records) {
    const names = new Set(
      records.map(record => record.name.toLowerCase())
    );

    let name = `${base} (Copy)`;
    let index = 2;

    while (names.has(name.toLowerCase())) {
      name = `${base} (Copy ${index})`;
      index++;
    }

    return name;
  }

  function selectedRecords() {
    const ids = new Set(selected);
    return getRecords().filter(record => ids.has(record.id));
  }

  function updatePanel() {
    const panel = $("bulk-actions-panel");
    const layout = $("bulk-layout");

    if (!panel || !layout) return;

    layout.classList.toggle("selection-mode", selectionMode);
    panel.hidden = !selectionMode;

    $("bulk-count").textContent =
      `${selectedRecords().length} selected`;

    $("bulk-delete").disabled = selected.size === 0;
    $("bulk-duplicate").disabled = selected.size === 0;
    $("bulk-copy").disabled = selected.size === 0;
    $("bulk-cut").disabled = selected.size === 0;
    $("bulk-edit").disabled = selected.size === 0;
    $("bulk-clear-selection").disabled = selected.size === 0;

    $("bulk-select-visible").disabled =
      !$("records").querySelector("[data-open]");

    $("bulk-paste").disabled = !clipboard;
    $("bulk-undo").disabled = !undoSnapshot;

    $("bulk-undo").textContent = undoSnapshot
      ? `Undo: ${undoLabel}`
      : "Undo last operation";

    const remove =
      $("bulk-property-operation").value === "remove";

    $("bulk-property-value").disabled = remove;
    if ($("bulk-property-type")) $("bulk-property-type").disabled = remove;
  }

  function enterSelectionMode(id) {
    selectionMode = true;
    selected.add(id);
    suppressClickId = id;

    updateRecordStyles();
    updatePanel();
  }

  function startSelectionMode() {
  selectionMode = true;
  updateRecordStyles();
  updatePanel();
  }
  
  function exitSelectionMode() {
    selectionMode = false;
    selected.clear();
    suppressClickId = null;

    updateRecordStyles();
    updatePanel();
  }

  function toggleSelected(id) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }

    // Keep selection mode active until the user explicitly exits.
    updateRecordStyles();
    updatePanel();
  }

  function updateRecordStyles() {
    $("records").querySelectorAll(".record-card").forEach(card => {
      const button = card.querySelector("[data-open]");
      if (!button) return;

      const isSelected = selected.has(button.dataset.open);

      card.classList.toggle("bulk-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }

  function selectVisible() {
    selectionMode = true;

    $("records").querySelectorAll("[data-open]").forEach(button => {
      selected.add(button.dataset.open);
    });

    updateRecordStyles();
    updatePanel();
  }

  function clearSelection() {
    selected.clear();
    updateRecordStyles();
    updatePanel();
  }

  function commit(nextRecords, label) {
    const previousRecords = getRecords();

    setRecords(nextRecords);

    if (!saveRecords()) {
      setRecords(previousRecords);
      alert("The operation could not be saved. No changes were applied.");
      return false;
    }

    undoSnapshot = clone(previousRecords);
    undoLabel = label;

    selected.clear();
    selectionMode = false;

    renderHome();
    updatePanel();

    return true;
  }

  function deleteSelected() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    if (!confirm(
      `Delete ${chosen.length} selected record(s)? ` +
      "Links to these records will also be removed."
    )) return;

    const ids = new Set(chosen.map(record => record.id));

    const nextRecords = getRecords()
      .filter(record => !ids.has(record.id))
      .map(record => ({
        ...record,
        related: (record.related || []).filter(id => !ids.has(id))
      }));

    commit(nextRecords, `Delete ${chosen.length} records`);
  }

  function duplicateSelected() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    const nextRecords = [...getRecords()];

    chosen.forEach(record => {
      const copy = clone(record);
      copy.id = uid();
      copy.name = uniqueName(record.name, nextRecords);

      // Relations continue pointing to the original records.
      nextRecords.push(copy);
    });

    commit(nextRecords, `Duplicate ${chosen.length} records`);
  }

  function copySelected() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    clipboard = {
      mode: "copy",
      records: clone(chosen)
    };

    $("bulk-message").textContent =
      `${chosen.length} record(s) copied. Use Paste to create copies.`;

    updatePanel();
  }

  function cutSelected() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    clipboard = {
      mode: "cut",
      ids: chosen.map(record => record.id)
    };

    $("bulk-message").textContent =
      `${chosen.length} record(s) marked to move. Use Paste to move them to the end of the list.`;

    updatePanel();
  }

  function pasteClipboard() {
    if (!clipboard) return;

    const records = getRecords();

    if (clipboard.mode === "cut") {
      const ids = new Set(clipboard.ids);
      const moving = records.filter(record => ids.has(record.id));

      if (!moving.length) {
        clipboard = null;
        updatePanel();
        return;
      }

      const remaining = records.filter(record => !ids.has(record.id));

      if (commit(
        [...remaining, ...moving],
        `Move ${moving.length} records`
      )) {
        clipboard = null;
      }

      updatePanel();
      return;
    }

    if (clipboard.mode === "copy") {
      const nextRecords = [...records];

      clipboard.records.forEach(original => {
        const copy = clone(original);
        copy.id = uid();
        copy.name = uniqueName(original.name, nextRecords);
        nextRecords.push(copy);
      });

      commit(
        nextRecords,
        `Paste ${clipboard.records.length} copied records`
      );

      updatePanel();
    }
  }

  function editSelectedProperty() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    const name = $("bulk-property-name").value.trim();
    const operation = $("bulk-property-operation").value;
    const value = $("bulk-property-value").value.trim();
    const valueType = $("bulk-property-type")?.value || "text";

    if (!name) {
      alert("Choose or enter a property name.");
      return;
    }

    let typedValue = value;
    if (operation !== "remove") {
      if (valueType === "number" || valueType === "percentage") {
        if (!value || !Number.isFinite(Number(value))) {
          alert(`Enter a valid ${valueType === "percentage" ? "percentage" : "number"}.`);
          return;
        }
        typedValue = valueType === "percentage" ? Number(value) / 100 : Number(value);
      } else if (valueType === "list") {
        try {
          typedValue = JSON.parse(value);
          if (!Array.isArray(typedValue)) throw new Error("The value must be a JSON array.");
        } catch (error) {
          alert(`Enter a valid JSON array for the list. Example: [\"one\", 2, {\"type\":\"record\",\"value\":\"record-id\"}]. ${error.message || ""}`);
          return;
        }
      }
    }

    const chosenIds = new Set(chosen.map(record => record.id));

    const nextRecords = getRecords().map(record => {
      if (!chosenIds.has(record.id)) return record;

      const properties = [...(record.properties || [])];
      const normalizedName = name.toLowerCase();

      const index = properties.findIndex(
        property => property.name.toLowerCase() === normalizedName
      );

      if (operation === "remove") {
        return {
          ...record,
          properties: properties.filter(
            property => property.name.toLowerCase() !== normalizedName
          )
        };
      }

      if (index >= 0) {
        properties[index] = {
          ...properties[index],
          valueType,
          value: typedValue
        };
      } else {
        properties.push({ name, valueType, value: typedValue });
      }

      return { ...record, properties };
    });

    commit(
      nextRecords,
      `${operation === "remove" ? "Remove" : "Set"} property "${name}"`
    );
  }

  function undoLastOperation() {
    if (!undoSnapshot) return;

    if (!confirm(`Undo "${undoLabel}"?`)) return;

    const currentRecords = getRecords();
    const previousRecords = clone(undoSnapshot);

    setRecords(previousRecords);

    if (!saveRecords()) {
      setRecords(currentRecords);
      alert("Undo could not be saved. The current records were restored.");
      return;
    }

    undoSnapshot = null;
    undoLabel = "";
    selected.clear();
    selectionMode = false;

    renderHome();
    updatePanel();
  }

  function createPanel() {
    if ($("bulk-actions-panel")) return;

    const records = $("records");
    const parent = records.parentNode;

    const layout = document.createElement("div");
    layout.id = "bulk-layout";
    layout.className = "bulk-layout";

    const panel = document.createElement("aside");
    panel.id = "bulk-actions-panel";
    panel.className = "panel bulk-panel";
    panel.hidden = true;

    panel.innerHTML = `
      <div class="bulk-heading">
        <div>
          <h3>Bulk actions</h3>
          <p class="muted" id="bulk-count">0 selected</p>
        </div>
        <button id="bulk-exit" class="secondary" type="button"
          aria-label="Exit selection mode">Done</button>
      </div>

      <p class="hint">
        Select records by tapping them. Hold a record to enter selection mode.
      </p>

      <button id="bulk-select-visible" class="secondary bulk-full"
        type="button">Select visible</button>

      <button id="bulk-clear-selection" class="secondary bulk-full"
        type="button">Clear selection</button>

      <div class="bulk-buttons">
        <button id="bulk-copy" class="secondary" type="button">Copy</button>
        <button id="bulk-cut" class="secondary" type="button">Cut</button>
        <button id="bulk-paste" class="secondary" type="button">Paste</button>
        <button id="bulk-duplicate" class="secondary" type="button">Duplicate</button>
        <button id="bulk-delete" class="danger" type="button">Delete selected</button>
      </div>

      <div class="bulk-edit">
        <h4>Edit a property</h4>

        <label for="bulk-property-name">Property</label>
        <input id="bulk-property-name" list="bulk-property-options"
          placeholder="e.g. Health">
        <datalist id="bulk-property-options"></datalist>

        <label for="bulk-property-operation">Operation</label>
        <select id="bulk-property-operation">
          <option value="set">Set or add property</option>
          <option value="remove">Remove property</option>
        </select>

        <label for="bulk-property-type">Value type</label>
        <select id="bulk-property-type">
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="percentage">Percentage (%)</option>
          <option value="list">List (JSON array)</option>
        </select>
        <p class="hint">The selected type will be applied to this property on every selected record. For percentages enter 20 for 20%; lists must be valid JSON arrays.</p>

        <label for="bulk-property-value">Value</label>
        <input id="bulk-property-value" placeholder="Property value">

        <button id="bulk-edit" class="primary bulk-full" type="button">
          Apply to selected
        </button>
      </div>

      <div class="bulk-undo-row">
        <button id="bulk-undo" class="secondary bulk-full" type="button">
          Undo last operation
        </button>
      </div>

      <p id="bulk-message" class="hint" aria-live="polite"></p>

      <p class="hint">
        Copy creates new records when pasted. Cut and paste moves records
        within this database and preserves their IDs. Duplicate creates
        copies immediately. Undo covers the latest successful bulk operation.
      </p>
    `;

    // Put the record list and the contextual panel inside one layout.
    parent.insertBefore(layout, records);
    layout.append(records, panel);

    $("bulk-exit").onclick = exitSelectionMode;
    $("bulk-select-visible").onclick = selectVisible;
    $("bulk-clear-selection").onclick = clearSelection;
    $("bulk-delete").onclick = deleteSelected;
    $("bulk-duplicate").onclick = duplicateSelected;
    $("bulk-copy").onclick = copySelected;
    $("bulk-cut").onclick = cutSelected;
    $("bulk-paste").onclick = pasteClipboard;
    $("bulk-edit").onclick = editSelectedProperty;
    $("bulk-undo").onclick = undoLastOperation;

    $("bulk-property-operation").addEventListener("change", () => {
      updatePanel();
    });

    $("bulk-property-options").innerHTML = catalogNames("properties")
      .map(name => `<option value="${esc(name)}"></option>`)
      .join("");

    updatePanel();
  }

  function cancelHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    holdTarget = null;
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;

    const button = event.target.closest("[data-open]");
    if (!button) return;

    if (selectionMode) return;

    cancelHold();

    const id = button.dataset.open;
    holdTarget = id;

    holdTimer = setTimeout(() => {
      holdTimer = null;
      enterSelectionMode(id);
    }, HOLD_DURATION);
  }

  function onPointerUp() {
    cancelHold();
  }

  function onClickCapture(event) {
    const button = event.target.closest("[data-open]");
    if (!button) return;

    const id = button.dataset.open;

    if (suppressClickId === id) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickId = null;
      return;
    }

    if (!selectionMode) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    toggleSelected(id);
  }

  createPanel();

  const records = $("records");

  records.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  records.addEventListener("click", onClickCapture, true);

  // Keep selection state in sync when filtering or sorting rerenders the list.
  const observer = new MutationObserver(() => {
    updateRecordStyles();
    updatePanel();
  });

  observer.observe(records, {
    childList: true,
    subtree: true
  });

  return {
  clearSelection: exitSelectionMode,
  startSelectionMode,
  pasteClipboard,
  getSelectedIds: () => [...selected]
};
}
