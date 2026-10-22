
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

    const originalFilters = getSavedFilters();
    const normalizedName = name.trim();

    const old = originalFilters.find(
      filter =>
        filter.name.toLowerCase() === normalizedName.toLowerCase()
    );

    const entry = {
      id: old?.id || uid(),
      name: normalizedName,
      state: getFilterState()
    };

    const nextFilters = old
      ? originalFilters.map(filter =>
          filter.id === old.id ? entry : filter
        )
      : [...originalFilters, entry];

    setSavedFilters(nextFilters);

    if (!persistFilters()) {
      setSavedFilters(originalFilters);
      return;
    }

    renderSavedFilters();
    $("saved-filters").value = entry.id;
  }

  function applySelectedFilter() {
    const selectedId = $("saved-filters").value;

    const filter = getSavedFilters().find(
      entry => entry.id === selectedId
    );

    if (filter && filter.state) {
      applyFilterState(filter.state);
    }
  }

  function deleteSelectedFilter() {
    const selectedId = $("saved-filters").value;

    if (!selectedId) return;

    const originalFilters = getSavedFilters();

    const filter = originalFilters.find(
      entry => entry.id === selectedId
    );

    if (
      !filter ||
      !confirm(`Delete saved filter "${filter.name}"?`)
    ) {
      return;
    }

    const nextFilters = originalFilters.filter(
      entry => entry.id !== selectedId
    );

    setSavedFilters(nextFilters);

    if (!persistFilters()) {
      setSavedFilters(originalFilters);
      return;
    }

    renderSavedFilters();
  }

  return {
    saveCurrentFilter,
    applySelectedFilter,
    deleteSelectedFilter
  };
}
