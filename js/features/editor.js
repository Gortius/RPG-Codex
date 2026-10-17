"use strict";

export function createEditorFeatures({
  $,
  uniq,
  DEFAULT_TYPES,
  getRecords,
  getRecord,
  getCurrentId,
  setEditingId,
  setSelectedTags,
  setSelectedRelated,
  setTagOpen,
  setRelatedOpen,
  setTagCreateOpen,
  setTagSearch,
  setRelatedSearch,
  setupSelect,
  renderPropertyRows,
  renderPicker,
  openRecord,
  renderHome
}) {
  function showForm(record = null) {
    setEditingId(record?.id || null);

    setSelectedTags(record ? [...record.tags] : []);

    setSelectedRelated(
      record
        ? record.related
            .filter(id => id !== record.id)
            .filter(id => getRecord(id))
        : []
    );

    setTagOpen(false);
    setRelatedOpen(false);
    setTagCreateOpen(false);
    setTagSearch("");
    setRelatedSearch("");

    $("dashboard").hidden = true;
    $("home").hidden = true;
    $("detail").hidden = true;
    $("editor").hidden = false;

    $("form-title").textContent = record ? "Edit Record" : "New Record";
    $("form-message").hidden = true;

    $("f-name").value = record?.name || "";
    $("f-icon").value = record?.icon || "";
    $("f-subcategory").value = record?.subcategory || "";
    $("f-description").value = record?.description || "";

    $("f-new-type").value = "";
    $("f-new-category").value = "";

    setupSelect(
      "f-type",
      uniq([...DEFAULT_TYPES, ...getRecords().map(r => r.type)]),
      record?.type || "",
      "Choose a type...",
      "f-new-type"
    );

    setupSelect(
      "f-category",
      uniq(getRecords().map(r => r.category)),
      record?.category || "",
      "No category",
      "f-new-category"
    );

    renderPropertyRows(record?.properties || []);
    renderPicker("tags");
    renderPicker("related");

    window.scrollTo(0, 0);
  }

  function cancelForm() {
    const currentId = getCurrentId();

    if (currentId && getRecord(currentId)) {
      openRecord(currentId);
    } else {
      renderHome();
    }
  }

  return {
    showForm,
    cancelForm
  };
}
