
"use strict";

export function createRecordFeatures({
  getRecords,
  setRecords,
  saveRecords,
  renderHome,
  expanded,
  setCurrentId
}) {
  function getRecord(id) {
    return getRecords().find(record => record.id === id);
  }

  function deleteRecord(id) {
    const record = getRecord(id);

    if (
      !record ||
      !confirm(`Delete "${record.name}"? This cannot be undone.`)
    ) {
      return;
    }

    const remaining = getRecords().filter(
      item => item.id !== id
    );

    remaining.forEach(item => {
      item.related = item.related.filter(
        relatedId => relatedId !== id
      );
    });

    setRecords(remaining);
    expanded.delete(id);
    saveRecords();
    setCurrentId(null);
    renderHome();
  }

  return {
    getRecord,
    deleteRecord
  };
}
