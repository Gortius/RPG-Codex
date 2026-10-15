"use strict";

export const STORAGE_KEY = "rpg-codex-records-v2";
export const CATALOG_KEY = "rpg-codex-catalogs-v1";
export const SAVED_KEY = "rpg-codex-saved-filters-v1";

export function loadRecords(starter, uid) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw === null) {
      return starter.map(r => ({
        ...r,
        tags: [...r.tags],
        properties: r.properties.map(p => ({ ...p })),
        related: [...r.related]
      }));
    }

    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw Error("Invalid data");

    return data.map(r => ({
      id: String(r.id || uid()),
      name: String(r.name || "Untitled"),
      icon: r.icon || "",
      type: r.type || "Item",
      category: r.category || "",
      subcategory: r.subcategory || "",
      createdAt: r.createdAt || "",
      description: r.description || "",
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      properties: Array.isArray(r.properties)
        ? r.properties.map(p => ({
            name: String(p.name || ""),
            value: String(p.value || "")
          }))
        : [],
      related: Array.isArray(r.related)
        ? r.related.map(String)
        : []
    }));
  } catch (e) {
    console.error(e);
    return starter.map(r => ({
      ...r,
      tags: [...r.tags],
      properties: r.properties.map(p => ({ ...p })),
      related: [...r.related]
    }));
  }
}

export function saveRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (e) {
    alert("Could not save data in this browser.");
    return false;
  }
}

export function mergeCatalog(catalogs, kind, name, type = "") {
  name = String(name || "").trim();
  if (!name) return;

  let found = catalogs[kind].find(
    x => x.name.toLowerCase() === name.toLowerCase()
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
    catalogs.tags = [];
    catalogs.properties = [];
  }

  records.forEach(r => {
    r.tags.forEach(t => mergeCatalog(catalogs, "tags", t, r.type));
    r.properties.forEach(p =>
      mergeCatalog(catalogs, "properties", p.name, r.type)
    );
  });

  defaultTags.forEach(t => mergeCatalog(catalogs, "tags", t));
  defaultProperties.forEach(p =>
    mergeCatalog(catalogs, "properties", p)
  );

  return catalogs;
}

export function loadCatalogs() {
  try {
    const c = JSON.parse(localStorage.getItem(CATALOG_KEY) || "{}");

    return {
      tags: Array.isArray(c.tags) ? c.tags : [],
      properties: Array.isArray(c.properties) ? c.properties : []
    };
  } catch {
    return { tags: [], properties: [] };
  }
}

export function saveCatalogs(catalogs) {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalogs));
  } catch {}
}

export function catalogNames(catalogs, kind) {
  return [
    ...new Set(
      catalogs[kind]
        .map(x => String(x.name || "").trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
}

export function loadSavedFilters() {
  try {
    const data = JSON.parse(
      localStorage.getItem(SAVED_KEY) || "[]"
    );

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function persistFilters(savedFilters) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(savedFilters));
    return true;
  } catch {
    alert("Could not save filters.");
    return false;
  }
}
