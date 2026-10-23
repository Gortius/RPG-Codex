"use strict";

import {
  loadCatalogs as loadStoredCatalogs,
  saveCatalogs as saveStoredCatalogs,
  syncCatalogs as syncStoredCatalogs,
  mergeCatalog as mergeStoredCatalog,
  catalogNames as getStoredCatalogNames
} from "../data/storage.js?v=20261023-r5";

export function createCatalogFeatures({
  getRecords,
  defaultTags,
  defaultProperties
}) {
  let catalogs = {
    tags: [],
    properties: []
  };

  function syncCatalogs() {
    syncStoredCatalogs(
      getRecords(),
      catalogs,
      defaultTags,
      defaultProperties
    );
  }

  function mergeCatalog(kind, name, type) {
    mergeStoredCatalog(catalogs, kind, name, type);
  }

  function loadCatalogs() {
    catalogs = loadStoredCatalogs();
    syncCatalogs();
    saveCatalogs();
  }

  function saveCatalogs() {
    return saveStoredCatalogs(catalogs);
  }

  function catalogNames(kind) {
    syncCatalogs();
    return getStoredCatalogNames(catalogs, kind);
  }

  return {
    syncCatalogs,
    mergeCatalog,
    loadCatalogs,
    saveCatalogs,
    catalogNames
  };
}
