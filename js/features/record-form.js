
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

    // Build a new array without modifying the original list.
    const nextRecords = existing
      ? records.map(r => r.id === editingId ? record : r)
      : [...records, record];

    setRecords(nextRecords);

    // Only open the record if saving succeeded.
    if (!saveRecords()) {
      setRecords(records);
      alert(
        "The record could not be saved. Your previous data remains loaded. " +
        "The form will stay open so you can try again or copy your changes."
      );
      return;
    }

    setCurrentId(record.id);
    openRecord(record.id);
  });
}
