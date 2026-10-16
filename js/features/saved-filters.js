
"use strict";

export function createSavedFiltersFeature({
  $,
  getSavedFilters,
  setSavedFilters,
  uid,
  getFilterState,
  applyFilterState,
  persistFilters,
  renderSavedFilters
}) {
  function saveCurrentFilter() {
    const name = prompt("Name this filter:");

    if (!name || !name.trim()) return;

    const savedFilters = getSavedFilters();
    const normalizedName = name.trim();

    const old = savedFilters.find(
      filter => filter.name.toLowerCase() === normalizedName.toLowerCase()
    );

    const entry = {
      id: old?.id || uid(),
      name: normalizedName,
      state: getFilterState()
    };

    const nextFilters = old
      ? savedFilters.map(filter =>
          filter.id === old.id ? entry : filter
        )
      : [...savedFilters, entry];

    setSavedFilters(nextFilters);

    if (persistFilters()) {
      renderSavedFilters();
      $("saved-filters").value = entry.id;
    }
  }

  function applySelectedFilter() {
    const selectedId = $("saved-filters").value;

    const filter = getSavedFilters().find(
      entry => entry.id === selectedId
    );

    if (filter) {
      applyFilterState(filter.state);
    }
  }

  function deleteSelectedFilter() {
    const selectedId = $("saved-filters").value;

    if (!selectedId) return;

    const filter = getSavedFilters().find(
      entry => entry.id === selectedId
    );

    if (
      filter &&
      confirm(`Delete saved filter "${filter.name}"?`)
    ) {
      setSavedFilters(
        getSavedFilters().filter(entry => entry.id !== selectedId)
      );

      persistFilters();
      renderSavedFilters();
    }
  }

  return {
    saveCurrentFilter,
    applySelectedFilter,
    deleteSelectedFilter
  };
}
