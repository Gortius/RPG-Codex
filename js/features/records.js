
"use strict";

import { loadTrash, saveTrash } from "../data/storage.js";

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

    if (!record || !confirm(`Move "${record.name}" to the trash? You can restore it later.`)) return;

    const linkedFrom = originalRecords
      .filter(item => item.id !== id && item.related.includes(id))
      .map(item => item.id);

    let originalTrash;
    try {
      originalTrash = loadTrash();
    } catch (error) {
      alert(`${error.message} The record was not deleted.`);
      return;
    }

    const nextTrash = [
      {
        record: { ...record },
        linkedFrom,
        trashedAt: new Date().toISOString()
      },
      ...originalTrash
    ];

    // Persist the recovery copy first. If storage is full, the live record stays intact.
    try {
      saveTrash(nextTrash);
    } catch (error) {
      alert(`Could not move this record to the trash: ${error.message}. The record was not deleted.`);
      return;
    }

    const nextRecords = originalRecords
      .filter(item => item.id !== id)
      .map(item => ({
        ...item,
        related: item.related.filter(relatedId => relatedId !== id)
      }));

    setRecords(nextRecords);
    if (!saveRecords()) {
      setRecords(originalRecords);
      try {
        saveTrash(originalTrash);
      } catch (rollbackError) {
        console.error("Could not roll back the trash after a failed record deletion.", rollbackError);
        alert(
          "The record was not deleted, but its recovery copy remains in the trash. " +
          "You may see a duplicate entry there."
        );
      }
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
