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

    let properties;
    try {
      properties = readProperties();
    } catch (error) {
      const message = $("form-message");
      message.textContent = error.message || "One of the property values is invalid.";
      message.hidden = false;
      return;
    }
    const existing = editingId ? getRecord(editingId) : null;
    const iconColor = $("f-icon-color")?.value || "#B9A0FF";

    const record = {
      id: editingId || uid(),
      name,
      icon: $("f-icon").value.trim(),
      iconColor,
      type,
      category,
      subcategory: $("f-subcategory").value.trim(),
      description: $("f-description").value.trim(),
      tags: uniq(getSelectedTags()),
      properties,
      related: uniq(getSelectedRelated()),
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    const nextRecords = existing
      ? records.map(r => r.id === editingId ? record : r)
      : [...records, record];

    const message = $("form-message");
    message.hidden = true;
    message.textContent = "";

    setRecords(nextRecords);

    if (!saveRecords()) {
      setRecords(records);

      message.textContent =
        "The record was not saved. Your previous data remains loaded. " +
        "Your changes are still in the form so you can try again.";

      message.hidden = false;
      return;
    }

    setCurrentId(record.id);
    openRecord(record.id);
  });
}
