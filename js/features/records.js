
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
    const originalRecords = getRecords();
    const record = originalRecords.find(item => item.id === id);

    if (
      !record ||
      !confirm(`Delete "${record.name}"? This cannot be undone.`)
    ) {
      return;
    }

    // Build the next state without mutating the original records.
    const nextRecords = originalRecords
      .filter(item => item.id !== id)
      .map(item => ({
        ...item,
        related: item.related.filter(relatedId => relatedId !== id)
      }));

    setRecords(nextRecords);

    // Restore the original state if persistence fails.
    if (!saveRecords()) {
      setRecords(originalRecords);
      return;
    }

    expanded.delete(id);
    setCurrentId(null);
    renderHome();
  }

  return {
    getRecord,
    deleteRecord
  };
}
