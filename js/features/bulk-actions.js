
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

  let clipboard = null;
  let undoSnapshot = null;
  let undoLabel = "";

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

  function rememberUndo(records, label) {
    undoSnapshot = clone(records);
    undoLabel = label;
  }

  function commit(nextRecords, label) {
    const previousRecords = getRecords();

    setRecords(nextRecords);

    if (!saveRecords()) {
      setRecords(previousRecords);
      alert("The operation could not be saved. No changes were applied.");
      return false;
    }

    rememberUndo(previousRecords, label);
    selected.clear();
    renderHome();
    updatePanel();
    return true;
  }

  function updatePanel() {
    const count = selectedRecords().length;

    $("bulk-count").textContent =
      `${count} selected`;

    $("bulk-delete").disabled = count === 0;
    $("bulk-duplicate").disabled = count === 0;
    $("bulk-copy").disabled = count === 0;
    $("bulk-cut").disabled = count === 0;
    $("bulk-select-visible").disabled =
      !getRecords().length;

    $("bulk-paste").disabled = !clipboard;
    $("bulk-edit").disabled = count === 0;
    $("bulk-clear-selection").disabled = count === 0;

    $("bulk-undo").disabled = !undoSnapshot;

    $("bulk-undo").textContent = undoSnapshot
      ? `Undo: ${undoLabel}`
      : "Undo last operation";
  }

  function decorateRecords() {
    const cards = $("records").querySelectorAll(".record-card");

    cards.forEach(card => {
      const openButton = card.querySelector("[data-open]");
      const actions = card.querySelector(".record-actions");

      if (!openButton || !actions) return;

      const id = openButton.dataset.open;

      if (!card.querySelector("[data-bulk-check]")) {
        const label = document.createElement("label");
        label.className = "bulk-select-label";
        label.innerHTML =
          `<input type="checkbox" data-bulk-check="${esc(id)}">` +
          "<span>Select</span>";

        actions.prepend(label);
      }

      const checkbox = card.querySelector("[data-bulk-check]");

      checkbox.checked = selected.has(id);
    });

    updatePanel();
  }

  function selectVisible() {
    $("records")
      .querySelectorAll("[data-open]")
      .forEach(button => selected.add(button.dataset.open));

    decorateRecords();
  }

  function clearSelection() {
    selected.clear();
    decorateRecords();
  }

  function deleteSelected() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    if (!confirm(
      `Delete ${chosen.length} selected record(s)? ` +
      "Links to these records will also be removed."
    )) {
      return;
    }

    const ids = new Set(chosen.map(record => record.id));

    const nextRecords = getRecords()
      .filter(record => !ids.has(record.id))
      .map(record => ({
        ...record,
        related: (record.related || [])
          .filter(id => !ids.has(id))
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

      // Relationships intentionally continue pointing to originals.
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

    updatePanel();
  }

  function cutSelected() {
    const chosen = selectedRecords();

    if (!chosen.length) return;

    clipboard = {
      mode: "cut",
      ids: chosen.map(record => record.id)
    };

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
      const nextRecords = [...remaining, ...moving];

      if (commit(nextRecords, `Move ${moving.length} records`)) {
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

    if (!name) {
      alert("Choose or enter a property name.");
      return;
    }

    if (operation !== "remove" && !value) {
      alert("Enter a value for this property.");
      return;
    }

    const chosenIds = new Set(chosen.map(record => record.id));

    const nextRecords = getRecords().map(record => {
      if (!chosenIds.has(record.id)) return record;

      const properties = [...(record.properties || [])];
      const index = properties.findIndex(
        property => property.name.toLowerCase() === name.toLowerCase()
      );

      if (operation === "remove") {
        return {
          ...record,
          properties: properties.filter(
            property => property.name.toLowerCase() !== name.toLowerCase()
          )
        };
      }

      if (index >= 0) {
        properties[index] = {
          ...properties[index],
          value
        };
      } else {
        properties.push({ name, value });
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

    renderHome();
    updatePanel();
  }

  function createPanel() {
    if ($("bulk-actions-panel")) return;

    const panel = document.createElement("section");
    panel.id = "bulk-actions-panel";
    panel.className = "panel bulk-panel";

    panel.innerHTML = `
      <div class="bulk-heading">
        <div>
          <h3>Bulk actions</h3>
          <p class="muted" id="bulk-count">0 selected</p>
        </div>
        <button id="bulk-select-visible" class="secondary" type="button">
          Select visible
        </button>
      </div>

      <div class="bulk-buttons">
        <button id="bulk-clear-selection" class="secondary" type="button">
          Clear selection
        </button>
        <button id="bulk-copy" class="secondary" type="button">Copy</button>
        <button id="bulk-cut" class="secondary" type="button">Cut</button>
        <button id="bulk-paste" class="secondary" type="button">Paste</button>
        <button id="bulk-duplicate" class="secondary" type="button">
          Duplicate
        </button>
        <button id="bulk-delete" class="danger" type="button">
          Delete selected
        </button>
      </div>

      <div class="bulk-edit">
        <h4>Edit a property on selected records</h4>

        <label for="bulk-property-name">Property</label>
        <input id="bulk-property-name" list="bulk-property-options"
          placeholder="e.g. Health">
        <datalist id="bulk-property-options"></datalist>

        <label for="bulk-property-operation">Operation</label>
        <select id="bulk-property-operation">
          <option value="set">Set or add property</option>
          <option value="remove">Remove property</option>
        </select>

        <label for="bulk-property-value">Value</label>
        <input id="bulk-property-value" placeholder="Property value">

        <button id="bulk-edit" class="primary" type="button">
          Apply to selected
        </button>
      </div>

      <div class="bulk-undo-row">
        <button id="bulk-undo" class="secondary" type="button">
          Undo last operation
        </button>
      </div>

      <p class="hint">
        Copy creates new records when pasted. Cut and paste moves records
        within this database and preserves their IDs. Duplicate creates
        copies immediately. Undo covers the latest successful bulk operation.
      </p>
    `;

    const records = $("records");
    records.parentNode.insertBefore(panel, records);

    $("bulk-select-visible").onclick = selectVisible;
    $("bulk-clear-selection").onclick = clearSelection;
    $("bulk-delete").onclick = deleteSelected;
    $("bulk-duplicate").onclick = duplicateSelected;
    $("bulk-copy").onclick = copySelected;
    $("bulk-cut").onclick = cutSelected;
    $("bulk-paste").onclick = pasteClipboard;
    $("bulk-edit").onclick = editSelectedProperty;
    $("bulk-undo").onclick = undoLastOperation;

    $("bulk-property-operation").onchange = () => {
      const remove = $("bulk-property-operation").value === "remove";
      $("bulk-property-value").disabled = remove;
    };

    $("bulk-property-options").innerHTML = catalogNames("properties")
      .map(name => `<option value="${esc(name)}"></option>`)
      .join("");

    panel.addEventListener("change", event => {
      const checkbox = event.target.closest("[data-bulk-check]");

      if (!checkbox) return;

      const id = checkbox.dataset.bulkCheck;

      if (checkbox.checked) {
        selected.add(id);
      } else {
        selected.delete(id);
      }

      updatePanel();
    });

    updatePanel();
  }

  createPanel();

  const observer = new MutationObserver(() => {
    decorateRecords();
  });

  observer.observe($("records"), {
    childList: true,
    subtree: true
  });

  decorateRecords();

  return {
    clearSelection,
    getSelectedIds: () => [...selected]
  };
}
