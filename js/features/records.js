
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

    const linkedFrom = originalRecords.filter(item => item.id !== id && item.related.includes(id)).map(item => item.id);
    const trash = loadTrash();
    trash.unshift({ record: { ...record }, linkedFrom, trashedAt: new Date().toISOString() });
    const nextRecords = originalRecords.filter(item => item.id !== id).map(item => ({
      ...item,
      related: item.related.filter(relatedId => relatedId !== id)
    }));
    setRecords(nextRecords);
    if (!saveRecords()) { setRecords(originalRecords); return; }
    try { saveTrash(trash); } catch (error) { console.error("Could not save trash", error); }
    expanded.delete(id);
    setCurrentId(null);
    renderHome();
  }

  return {
    getRecord,
    deleteRecord
  };
}
