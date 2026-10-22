
"use strict";

export const STORAGE_KEY = "rpg-codex-records-v2";
export const CATALOG_KEY = "rpg-codex-catalogs-v1";
export const SAVED_KEY = "rpg-codex-saved-filters-v1";

// Bloqueiam gravações quando os dados existentes não puderam ser lidos.
let recordsReadFailed = false;
let catalogsReadFailed = false;
let filtersReadFailed = false;

function cloneStarter(starter) {
  return starter.map(record => ({
    ...record,
    tags: Array.isArray(record.tags) ? [...record.tags] : [],
    properties: Array.isArray(record.properties)
      ? record.properties.map(property => ({ ...property }))
      : [],
    related: Array.isArray(record.related) ? [...record.related] : []
  }));
}

export function loadRecords(starter, uid) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      recordsReadFailed = false;
      return cloneStarter(starter);
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      throw new Error("The saved records are not a valid array.");
    }

    const records = data.map(record => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("A saved record has an invalid structure.");
      }

      return {
        id: String(record.id || uid()),
        name: String(record.name || "Untitled"),
        icon: record.icon || "",
        type: record.type || "Item",
        category: record.category || "",
        subcategory: record.subcategory || "",
        createdAt: record.createdAt || "",
        description: record.description || "",
        tags: Array.isArray(record.tags)
          ? record.tags.map(String)
          : [],
        properties: Array.isArray(record.properties)
          ? record.properties.map(property => {
              if (
                !property ||
                typeof property !== "object" ||
                Array.isArray(property)
              ) {
                throw new Error(
                  "A saved property has an invalid structure."
                );
              }

              return {
                name: String(property.name || ""),
                value: String(property.value ?? "")
              };
            })
          : [],
        related: Array.isArray(record.related)
          ? record.related.map(String)
          : []
      };
    });

    recordsReadFailed = false;
    return records;
  } catch (error) {
    recordsReadFailed = true;

    console.error("RPG Codex: failed to load saved records.", error);

    alert(
      "RPG Codex could not read your saved records. " +
      "Example records are being displayed temporarily, " +
      "but saving records has been blocked to protect your existing data. " +
      "Do not clear your browser data. Keep your backup and reload the app " +
      "after investigating the problem."
    );

    return cloneStarter(starter);
  }
}

export function saveRecords(records) {
  if (recordsReadFailed) {
    alert(
      "Records were not saved because the previous data could not be read. " +
      "Reload the app and resolve the loading problem before trying again."
    );

    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.error("RPG Codex: failed to save records.", error);

    alert(
      "Could not save records in this browser. " +
      "Your changes may not have been saved. Check available storage."
    );

    return false;
  }
}

export function mergeCatalog(catalogs, kind, name, type = "") {
  name = String(name || "").trim();
  if (!name) return;

  const found = catalogs[kind].find(
    item => item.name.toLowerCase() === name.toLowerCase()
  );

  if (!found) {
    catalogs[kind].push({
      name,
      types: type ? [type] : []
    });
  } else if (type && !found.types.includes(type)) {
    found.types.push(type);
  }
}

export function syncCatalogs(
  records,
  catalogs,
  defaultTags,
  defaultProperties
) {
  if (
    !catalogs ||
    !Array.isArray(catalogs.tags) ||
    !Array.isArray(catalogs.properties)
  ) {
    catalogs = {
      tags: [],
      properties: []
    };
  }

  records.forEach(record => {
    record.tags.forEach(tag =>
      mergeCatalog(catalogs, "tags", tag, record.type)
    );

    record.properties.forEach(property =>
      mergeCatalog(
        catalogs,
        "properties",
        property.name,
        record.type
      )
    );
  });

  defaultTags.forEach(tag =>
    mergeCatalog(catalogs, "tags", tag)
  );

  defaultProperties.forEach(property =>
    mergeCatalog(catalogs, "properties", property)
  );

  return catalogs;
}

export function loadCatalogs() {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);

    if (raw === null) {
      catalogsReadFailed = false;

      return {
        tags: [],
        properties: []
      };
    }

    const catalogs = JSON.parse(raw);

    if (
      !catalogs ||
      typeof catalogs !== "object" ||
      Array.isArray(catalogs)
    ) {
      throw new Error("The saved catalogs have an invalid structure.");
    }

    if (
      (catalogs.tags !== undefined && !Array.isArray(catalogs.tags)) ||
      (catalogs.properties !== undefined &&
        !Array.isArray(catalogs.properties))
    ) {
      throw new Error("The saved catalog lists are invalid.");
    }

    catalogsReadFailed = false;

    return {
      tags: catalogs.tags || [],
      properties: catalogs.properties || []
    };
  } catch (error) {
    catalogsReadFailed = true;

    console.error("RPG Codex: failed to load catalogs.", error);

    alert(
      "The saved tag/property catalog could not be read. " +
      "Saving the catalog has been blocked to protect its existing data. " +
      "Keep your backup and reload the app after investigating the problem."
    );

    return {
      tags: [],
      properties: []
    };
  }
}

export function saveCatalogs(catalogs) {
  if (catalogsReadFailed) {
    console.warn(
      "RPG Codex: catalog save blocked because loading previously failed."
    );
    return false;
  }

  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalogs));
    return true;
  } catch (error) {
    console.error("RPG Codex: failed to save catalogs.", error);

    alert("Could not save the tag/property catalog in this browser.");
    return false;
  }
}

export function catalogNames(catalogs, kind) {
  return [
    ...new Set(
      catalogs[kind]
        .map(item => String(item.name || "").trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
}

export function loadSavedFilters() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);

    if (raw === null) {
      filtersReadFailed = false;
      return [];
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      throw new Error("The saved filters are not a valid array.");
    }

    filtersReadFailed = false;
    return data;
  } catch (error) {
    filtersReadFailed = true;

    console.error("RPG Codex: failed to load saved filters.", error);

    alert(
      "The saved filters could not be read. " +
      "Saving filters has been blocked to protect their existing data. " +
      "Keep your backup and reload the app after investigating the problem."
    );

    return [];
  }
}

export function persistFilters(savedFilters) {
  if (filtersReadFailed) {
    console.warn(
      "RPG Codex: filter save blocked because loading previously failed."
    );
    return false;
  }

  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedFilters));
    return true;
  } catch (error) {
    console.error("RPG Codex: failed to save filters.", error);

    alert("Could not save filters in this browser.");
    return false;
  }
}
