
"use strict";

export const STORAGE_KEY = "rpg-codex-records-v2";
export const CATALOG_KEY = "rpg-codex-catalogs-v1";
export const SAVED_KEY = "rpg-codex-saved-filters-v1";

export const PROJECTS_KEY = "rpg-codex-projects-v1";
export const ACTIVE_PROJECT_KEY = "rpg-codex-active-project-v1";
export const TRASH_KEY = "rpg-codex-trash-v1";

export function getActiveProjectId() {
  try { return localStorage.getItem(ACTIVE_PROJECT_KEY) || "default"; }
  catch { return "default"; }
}

export function setActiveProjectId(id) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, String(id || "default"));
}

function scopedKey(base) {
  const id = getActiveProjectId();
  return id === "default" ? base : `${base}::${id}`;
}

export function loadProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (error) { console.warn("Could not read projects list", error); }
  const projects = [{ id: "default", name: "My RPG Database", createdAt: new Date().toISOString() }];
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch {}
  return projects;
}

export function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadTrash() {
  try {
    const data = JSON.parse(localStorage.getItem(scopedKey(TRASH_KEY)) || "[]");
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export function saveTrash(items) {
  localStorage.setItem(scopedKey(TRASH_KEY), JSON.stringify(items));
}

export function exportProjectBundle() {
  return {
    format: "rpg-codex-backup", version: 1, exportedAt: new Date().toISOString(),
    projectId: getActiveProjectId(),
    records: JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)) || "[]"),
    catalogs: JSON.parse(localStorage.getItem(scopedKey(CATALOG_KEY)) || '{"tags":[],"properties":[]}'),
    savedFilters: JSON.parse(localStorage.getItem(scopedKey(SAVED_KEY)) || "[]"),
    trash: loadTrash()
  };
}

export function importProjectBundle(bundle, { replace = false } = {}) {
  if (!bundle || bundle.format !== "rpg-codex-backup" || bundle.version !== 1 || !Array.isArray(bundle.records)) {
    throw new Error("This file is not a valid RPG Codex backup.");
  }
  const incoming = bundle.records;
  if (incoming.some(r => !r || typeof r !== "object" || !r.id || !r.name || !r.type)) {
    throw new Error("The backup contains an invalid record.");
  }
  const existing = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)) || "[]");
  let records;
  if (replace) records = incoming;
  else {
    const ids = new Set(existing.map(r => String(r.id)));
    const names = new Set(existing.map(r => `${String(r.type).toLowerCase()}::${String(r.name).toLowerCase()}`));
    records = [...existing];
    incoming.forEach(r => {
      const key = `${String(r.type).toLowerCase()}::${String(r.name).toLowerCase()}`;
      if (ids.has(String(r.id)) || names.has(key)) {
        const copy = { ...r, id: `${r.id}-import-${Math.random().toString(36).slice(2, 7)}` };
        records.push(copy); ids.add(String(copy.id)); names.add(key);
      } else { records.push(r); ids.add(String(r.id)); names.add(key); }
    });
  }
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(records));
  if (bundle.catalogs && typeof bundle.catalogs === "object") {
    const current = JSON.parse(localStorage.getItem(scopedKey(CATALOG_KEY)) || '{"tags":[],"properties":[]}');
    const mergeList = key => {
      const map = new Map((replace ? [] : (current[key] || [])).map(x => [String(x.name).toLowerCase(), x]));
      (bundle.catalogs[key] || []).forEach(x => { if (x && x.name) map.set(String(x.name).toLowerCase(), x); });
      return [...map.values()];
    };
    localStorage.setItem(scopedKey(CATALOG_KEY), JSON.stringify({ tags: mergeList("tags"), properties: mergeList("properties") }));
  }
  if (Array.isArray(bundle.savedFilters)) localStorage.setItem(scopedKey(SAVED_KEY), JSON.stringify(replace ? bundle.savedFilters : [...JSON.parse(localStorage.getItem(scopedKey(SAVED_KEY)) || "[]"), ...bundle.savedFilters]));
  if (Array.isArray(bundle.trash)) saveTrash(replace ? bundle.trash : [...loadTrash(), ...bundle.trash]);
  return records.length;
}

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
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));

    if (raw === null) {
      recordsReadFailed = false;
      return getActiveProjectId() === "default" ? cloneStarter(starter) : [];
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
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(records));
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
    const raw = localStorage.getItem(scopedKey(CATALOG_KEY));

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
    localStorage.setItem(scopedKey(CATALOG_KEY), JSON.stringify(catalogs));
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
    const raw = localStorage.getItem(scopedKey(SAVED_KEY));

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
    localStorage.setItem(scopedKey(SAVED_KEY), JSON.stringify(savedFilters));
    return true;
  } catch (error) {
    console.error("RPG Codex: failed to save filters.", error);

    alert("Could not save filters in this browser.");
    return false;
  }
}
