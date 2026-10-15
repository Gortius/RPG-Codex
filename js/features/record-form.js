
"use strict";

export function createRecordFormFeature({
  $,
  getRecords,
  setRecords,
  getEditingId,
  getSelectedTags,
  getSelectedRelated,
  readSelect,
  readProperties,
  uniq,
  uid,
  getRecord,
  syncCatalogs,
  saveRecords,
  setCurrentId,
  openRecord
}) {
  $("record-form").addEventListener("submit", e => {
    e.preventDefault();

    const name = $("f-name").value.trim();
    const type = readSelect("f-type", "f-new-type");
    const category = readSelect("f-category", "f-new-category");
    const records = getRecords();
    const editingId = getEditingId();

    if (!name || !type) {
      alert("Please enter a name and choose a type.");
      return;
    }

    if (type === "__new__" || category === "__new__") {
      alert("Please enter the new type or category name.");
      return;
    }

    if (records.some(r =>
      r.id !== editingId &&
      r.name.toLowerCase() === name.toLowerCase() &&
      r.type === type
    )) {
      if (!confirm("A record with this name and type already exists. Save anyway?")) {
        return;
      }
    }

    const properties = readProperties();
    const existing = editingId ? getRecord(editingId) : null;

    const record = {
      id: editingId || uid(),
      name,
      icon: $("f-icon").value.trim(),
      type,
      category,
      subcategory: $("f-subcategory").value.trim(),
      description: $("f-description").value.trim(),
      tags: uniq(getSelectedTags()),
      properties,
      related: uniq(getSelectedRelated()),
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    if (existing) {
      setRecords(records.map(r => r.id === editingId ? record : r));
    } else {
      records.push(record);
      setRecords(records);
    }

    // Preserve existing incoming relationships.
    getRecords().forEach(r => {
      if (
        r.id !== record.id &&
        r.related.includes(record.id) &&
        !record.related.includes(r.id)
      ) {
        // Existing incoming relationships remain intact.
      }
    });

    syncCatalogs();
    saveRecords();

    setCurrentId(record.id);
    openRecord(record.id);
  });
}
