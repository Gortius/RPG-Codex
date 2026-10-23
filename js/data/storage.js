import { STARTER_RECORDS } from "./default-records.js";

"use strict";

export const STORAGE_KEY = "rpg-codex-records-v2";
export const CATALOG_KEY = "rpg-codex-catalogs-v1";
export const SAVED_KEY = "rpg-codex-saved-filters-v1";

export const PROJECTS_KEY = "rpg-codex-projects-v1";
export const ACTIVE_PROJECT_KEY = "rpg-codex-active-project-v1";
export const TRASH_KEY = "rpg-codex-trash-v1";


export const PROPERTY_VALUE_TYPES = Object.freeze(["number", "percentage", "text", "list"]);
const LIST_ITEM_TYPES = new Set(["text", "number", "percentage", "record", "json"]);

function strictNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text || !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}

function normalizeListItem(item) {
  let type;
  let value;
  if (item && typeof item === "object" && !Array.isArray(item) && LIST_ITEM_TYPES.has(String(item.type || "").toLowerCase())) {
    type = String(item.type).toLowerCase();
    value = item.value;
  } else if (typeof item === "number") {
    type = "number"; value = item;
  } else if (item && typeof item === "object") {
    type = "json"; value = item;
  } else {
    type = "text"; value = String(item ?? "");
  }

  if (type === "number" || type === "percentage") {
    if (value === "" || value === null || value === undefined) value = null;
    else {
      const numeric = strictNumber(value);
      if (numeric === null) throw new Error(`A list item declared as ${type} must contain a valid number.`);
      value = numeric;
    }
  } else if (type === "record") {
    value = String(value ?? "");
  } else if (type === "json") {
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { /* Preserve valid free-form string content. */ }
    }
  } else {
    value = String(value ?? "");
  }
  return { type, value };
}

/**
 * Normalizes both new typed properties and old {name, value} properties.
 * Legacy numeric strings are migrated to numbers; a legacy value ending in %
 * becomes a fraction ("20%" -> 0.2). Other legacy values remain text.
 */
export function normalizeProperty(property) {
  if (!property || typeof property !== "object" || Array.isArray(property)) {
    throw new Error("A saved property has an invalid structure.");
  }
  const name = String(property.name ?? "").trim();
  const rawValue = property.value ?? "";
  let valueType = String(property.valueType ?? "").toLowerCase();
  let value = rawValue;
  const typeWasExplicit = PROPERTY_VALUE_TYPES.includes(valueType);

  if (!typeWasExplicit) {
    if (Array.isArray(rawValue)) valueType = "list";
    else if (typeof rawValue === "number") valueType = "number";
    else {
      const text = String(rawValue ?? "").trim();
      const percent = text.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*%$/);
      if (percent) { valueType = "percentage"; value = Number(percent[1]) / 100; }
      else if (strictNumber(text) !== null) { valueType = "number"; value = Number(text); }
      else valueType = "text";
    }
  }

  if (valueType === "number" || valueType === "percentage") {
    if (value === "" || value === null || value === undefined) value = null;
    else {
      const numeric = strictNumber(value);
      if (numeric === null) throw new Error(`Property “${name || "(unnamed)"}” has a non-numeric value but is typed as ${valueType}.`);
      value = numeric;
    }
  } else if (valueType === "text") {
    value = String(value ?? "");
  } else if (valueType === "list") {
    let items = value;
    if (typeof items === "string") {
      try {
        const parsed = JSON.parse(items);
        items = Array.isArray(parsed) ? parsed : items.split(/\r?\n/).filter(line => line.length > 0);
      } catch {
        items = items.split(/\r?\n/).filter(line => line.length > 0);
      }
    }
    if (!Array.isArray(items)) throw new Error(`List property “${name || "(unnamed)"}” must contain a list of items.`);
    value = items.map(normalizeListItem);
  }

  return { ...property, name, valueType, value };
}

export function getActiveProjectId() {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY) || "default";
  } catch {
    return "default";
  }
}

export function setActiveProjectId(id) {
  localStorage.setItem(ACTIVE_PROJECT_KEY, String(id || "default"));
}

export function getScopedStorageKey(base, projectId = getActiveProjectId()) {
  const id = String(projectId || "default");
  return id === "default" ? base : `${base}::${id}`;
}

export function loadProjects() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (error) {
    console.warn("Could not read projects list", error);
  }

  const projects = [{
    id: "default",
    name: "My RPG Database",
    createdAt: new Date().toISOString()
  }];

  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {}

  return projects;
}

export function saveProjects(projects) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

let trashReadFailed = false;

export function loadTrash() {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(TRASH_KEY));
    const data = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(data)) {
      throw new Error("The saved trash is not a valid array.");
    }
    if (data.some(item =>
      !item || typeof item !== "object" || Array.isArray(item) ||
      !item.record || typeof item.record !== "object" || Array.isArray(item.record) ||
      !String(item.record.id ?? "").trim() ||
      (item.linkedFrom !== undefined && !Array.isArray(item.linkedFrom))
    )) {
      throw new Error("The saved trash contains an invalid entry.");
    }
    trashReadFailed = false;
    return data;
  } catch (error) {
    trashReadFailed = true;
    console.error("RPG Codex: failed to load trash.", error);
    throw new Error("The trash could not be read safely. Its existing data was preserved.");
  }
}

export function saveTrash(items) {
  if (trashReadFailed) {
    throw new Error("Trash saving is blocked because the existing trash could not be read.");
  }
  if (!Array.isArray(items)) {
    throw new Error("The trash must be saved as a list.");
  }

  const isValidTrashEntry = item =>
    Boolean(
      item && typeof item === "object" && !Array.isArray(item) &&
      item.record && typeof item.record === "object" && !Array.isArray(item.record) &&
      String(item.record.id ?? "").trim() &&
      (item.linkedFrom === undefined || Array.isArray(item.linkedFrom))
    );

  if (!items.every(isValidTrashEntry)) {
    throw new Error("The trash contains an invalid entry.");
  }

  const key = getScopedStorageKey(TRASH_KEY);
  try {
    const currentRaw = localStorage.getItem(key);
    if (currentRaw !== null) {
      const current = JSON.parse(currentRaw);
      if (!Array.isArray(current) || !current.every(isValidTrashEntry)) {
        throw new Error("The existing trash contains invalid data.");
      }
    }
  } catch (error) {
    trashReadFailed = true;
    console.error("RPG Codex: refused to overwrite unreadable trash.", error);
    throw new Error("Trash saving is blocked because the existing trash could not be read safely.");
  }

  localStorage.setItem(key, JSON.stringify(items));
}

export function exportProjectBundle() {
  return {
    format: "rpg-codex-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    projectId: getActiveProjectId(),
    records: JSON.parse(localStorage.getItem(getScopedStorageKey(STORAGE_KEY)) || "[]"),
    catalogs: JSON.parse(
      localStorage.getItem(getScopedStorageKey(CATALOG_KEY)) ||
      '{"tags":[],"properties":[]}'
    ),
    savedFilters: JSON.parse(localStorage.getItem(getScopedStorageKey(SAVED_KEY)) || "[]"),
    trash: loadTrash()
  };
}

function normalizeProjectRecord(record, context = "backup") {
  if (
    !record || typeof record !== "object" || Array.isArray(record) ||
    !String(record.id ?? "").trim() ||
    !String(record.name ?? "").trim() ||
    !String(record.type ?? "").trim()
  ) {
    throw new Error(`The ${context} contains an invalid record.`);
  }

  if (
    (record.tags !== undefined && !Array.isArray(record.tags)) ||
    (record.properties !== undefined && !Array.isArray(record.properties)) ||
    (record.related !== undefined && !Array.isArray(record.related))
  ) {
    throw new Error(`The ${context} contains an invalid tags, properties, or relations list.`);
  }

  if (Array.isArray(record.properties) && record.properties.some(property =>
    !property || typeof property !== "object" || Array.isArray(property)
  )) {
    throw new Error(`The ${context} contains an invalid property.`);
  }

  const iconColor = String(record.iconColor || "");

  return {
    ...record,
    id: String(record.id).trim(),
    name: String(record.name).trim(),
    icon: String(record.icon ?? ""),
    iconColor: /^#[0-9a-f]{6}$/i.test(iconColor)
      ? iconColor.toUpperCase()
      : "#B9A0FF",
    type: String(record.type).trim(),
    category: String(record.category ?? ""),
    subcategory: String(record.subcategory ?? ""),
    createdAt: String(record.createdAt ?? ""),
    description: String(record.description ?? ""),
    tags: Array.isArray(record.tags)
      ? record.tags.map(tag => String(tag ?? ""))
      : [],
    properties: Array.isArray(record.properties)
      ? record.properties.map(normalizeProperty)
      : [],
    related: Array.isArray(record.related)
      ? record.related.map(String)
      : []
  };
}

function normalizeSavedFilterState(state) {
  const input = state && typeof state === "object" && !Array.isArray(state)
    ? state
    : {};
  const allowedOperators = new Set(["contains", "=", "!=", ">", ">=", "<", "<="]);
  const conditions = Array.isArray(input.conditions)
    ? input.conditions
        .filter(condition => condition && typeof condition === "object" && !Array.isArray(condition))
        .map(condition => ({
          ...condition,
          property: String(condition.property ?? ""),
          operator: allowedOperators.has(String(condition.operator))
            ? String(condition.operator)
            : "contains",
          value: String(condition.value ?? "")
        }))
    : [];

  const sort = String(input.sort || "name-asc");
  const sortDirection = input.sortDirection === "desc" ||
    (!input.sortDirection && /(?:-desc|newest)$/.test(sort))
    ? "desc"
    : "asc";

  return {
    ...input,
    query: String(input.query ?? ""),
    types: Array.isArray(input.types) ? input.types.map(String) : [],
    category: String(input.category ?? ""),
    subcategory: String(input.subcategory ?? ""),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
    sort,
    sortDirection,
    conditions
  };
}

function normalizeIncomingFilters(filters, currentFilters, replace) {
  if (!Array.isArray(filters)) {
    throw new Error("The backup contains invalid saved filters.");
  }

  const reservedIds = new Set(
    (replace ? [] : currentFilters).map(filter => String(filter.id))
  );
  const seenIncomingIds = new Set();

  return filters.map(filter => {
    if (
      !filter || typeof filter !== "object" || Array.isArray(filter) ||
      !String(filter.id ?? "").trim() ||
      !String(filter.name ?? "").trim() ||
      !filter.state || typeof filter.state !== "object" || Array.isArray(filter.state)
    ) {
      throw new Error("The backup contains an invalid saved filter.");
    }

    const sourceId = String(filter.id).trim();
    if (seenIncomingIds.has(sourceId)) {
      throw new Error("The backup contains duplicate saved filter IDs.");
    }
    seenIncomingIds.add(sourceId);

    let targetId = sourceId;
    let attempt = 0;
    while (reservedIds.has(targetId)) {
      attempt++;
      targetId = `${sourceId}-import-${Math.random().toString(36).slice(2, 7)}${attempt > 1 ? `-${attempt}` : ""}`;
    }
    reservedIds.add(targetId);

    return {
      ...filter,
      id: targetId,
      name: String(filter.name).trim(),
      state: normalizeSavedFilterState(filter.state)
    };
  });
}

export function importProjectBundle(bundle, { replace = false } = {}) {
  if (
    !bundle ||
    bundle.format !== "rpg-codex-backup" ||
    bundle.version !== 1 ||
    !Array.isArray(bundle.records)
  ) {
    throw new Error("This file is not a valid RPG Codex backup.");
  }

  // Do not allow importing over data whose existing state failed to load.
  if (recordsReadFailed || catalogsReadFailed || filtersReadFailed || trashReadFailed) {
    throw new Error(
      "Import stopped because some current saved data could not be read safely. " +
      "Reload and resolve the storage problem before importing."
    );
  }

  const incoming = bundle.records.map(record =>
    normalizeProjectRecord(record, "backup")
  );
  const incomingIds = new Set();
  incoming.forEach(record => {
    if (incomingIds.has(record.id)) {
      throw new Error("The backup contains duplicate record IDs.");
    }
    incomingIds.add(record.id);
  });

  if (bundle.catalogs !== undefined && (
    !bundle.catalogs || typeof bundle.catalogs !== "object" || Array.isArray(bundle.catalogs) ||
    (bundle.catalogs.tags !== undefined && !Array.isArray(bundle.catalogs.tags)) ||
    (bundle.catalogs.properties !== undefined && !Array.isArray(bundle.catalogs.properties))
  )) {
    throw new Error("The backup contains invalid catalogs.");
  }
  if (bundle.savedFilters !== undefined && !Array.isArray(bundle.savedFilters)) {
    throw new Error("The backup contains invalid saved filters.");
  }
  if (bundle.trash !== undefined && !Array.isArray(bundle.trash)) {
    throw new Error("The backup contains an invalid trash list.");
  }

  const recordsKey = getScopedStorageKey(STORAGE_KEY);
  const catalogsKey = getScopedStorageKey(CATALOG_KEY);
  const filtersKey = getScopedStorageKey(SAVED_KEY);
  const trashKey = getScopedStorageKey(TRASH_KEY);
  const activeProjectId = getActiveProjectId();
  const existingRaw = localStorage.getItem(recordsKey);
  const existingSource = existingRaw === null && activeProjectId === "default"
    ? STARTER_RECORDS
    : JSON.parse(existingRaw || "[]");

  if (!Array.isArray(existingSource)) {
    throw new Error("The current project's saved records are invalid.");
  }

  const existing = existingSource.map(record =>
    normalizeProjectRecord(record, "current project")
  );
  const existingIds = new Set();
  existing.forEach(record => {
    if (existingIds.has(record.id)) {
      throw new Error("The current project's saved records contain duplicate IDs.");
    }
    existingIds.add(record.id);
  });

  let nextRecords;
  if (replace) {
    nextRecords = incoming.map(record => ({
      ...record,
      related: [...record.related]
    }));
  } else {
    const reservedIds = new Set(existing.map(record => record.id));
    const reservedNames = new Set(existing.map(record =>
      `${record.type.toLowerCase()}::${record.name.toLowerCase()}`
    ));
    const idRemap = new Map();
    const imported = [];

    incoming.forEach(record => {
      const sourceId = record.id;
      const nameKey = `${record.type.toLowerCase()}::${record.name.toLowerCase()}`;
      let targetId = sourceId;
      const conflicts = reservedIds.has(targetId) || reservedNames.has(nameKey);

      if (conflicts) {
        let attempt = 0;
        do {
          attempt++;
          targetId = `${sourceId}-import-${Math.random().toString(36).slice(2, 7)}${attempt > 1 ? `-${attempt}` : ""}`;
        } while (reservedIds.has(targetId) || incomingIds.has(targetId));
      }

      idRemap.set(sourceId, targetId);
      reservedIds.add(targetId);
      reservedNames.add(nameKey);
      imported.push({ ...record, id: targetId });
    });

    const remappedImported = imported.map(record => ({
      ...record,
      related: record.related.map(id => idRemap.get(String(id)) || String(id))
    }));

    nextRecords = [...existing, ...remappedImported];
  }

  const writes = new Map([[recordsKey, JSON.stringify(nextRecords)]]);

  if (bundle.catalogs) {
    const currentRaw = localStorage.getItem(catalogsKey);
    const current = currentRaw === null
      ? { tags: [], properties: [] }
      : JSON.parse(currentRaw);

    if (
      !current || typeof current !== "object" || Array.isArray(current) ||
      (current.tags !== undefined && !Array.isArray(current.tags)) ||
      (current.properties !== undefined && !Array.isArray(current.properties))
    ) {
      throw new Error("The current project's catalogs are invalid.");
    }

    for (const key of ["tags", "properties"]) {
      const list = current[key] || [];
      if (list.some(item =>
        !item || typeof item !== "object" || Array.isArray(item) ||
        !String(item.name ?? "").trim() ||
        (item.types !== undefined && !Array.isArray(item.types))
      )) {
        throw new Error(`The current project's ${key} catalog contains an invalid entry.`);
      }
    }

    const mergeList = key => {
      const source = bundle.catalogs[key] || [];
      const existingList = current[key] || [];
      const map = new Map(
        (replace ? [] : existingList).filter(item => item && item.name).map(item => [
          String(item.name).toLowerCase(), item
        ])
      );

      source.forEach(item => {
        if (
          !item || typeof item !== "object" || Array.isArray(item) ||
          !String(item.name ?? "").trim() ||
          (item.types !== undefined && !Array.isArray(item.types))
        ) {
          throw new Error(`The backup contains an invalid ${key} catalog entry.`);
        }
        map.set(String(item.name).toLowerCase(), {
          ...item,
          name: String(item.name).trim(),
          types: Array.isArray(item.types) ? item.types.map(String) : []
        });
      });

      return [...map.values()];
    };

    writes.set(catalogsKey, JSON.stringify({
      tags: mergeList("tags"),
      properties: mergeList("properties")
    }));
  }

  if (Array.isArray(bundle.savedFilters)) {
    const currentRaw = localStorage.getItem(filtersKey);
    const current = currentRaw === null ? [] : JSON.parse(currentRaw);
    if (!Array.isArray(current)) {
      throw new Error("The current project's saved filters are invalid.");
    }

    const currentFilterIds = new Set();
    current.forEach(filter => {
      if (!filter || typeof filter !== "object" || Array.isArray(filter) || !filter.id) {
        throw new Error("The current project's saved filters contain an invalid entry.");
      }
      const id = String(filter.id);
      if (currentFilterIds.has(id)) {
        throw new Error("The current project's saved filters contain duplicate IDs.");
      }
      currentFilterIds.add(id);
    });

    const importedFilters = normalizeIncomingFilters(bundle.savedFilters, current, replace);
    writes.set(filtersKey, JSON.stringify(
      replace ? importedFilters : [...current, ...importedFilters]
    ));
  }

  if (Array.isArray(bundle.trash)) {
    const currentRaw = localStorage.getItem(trashKey);
    const current = currentRaw === null ? [] : JSON.parse(currentRaw);
    if (!Array.isArray(current)) {
      throw new Error("The current project's trash is invalid.");
    }
    if (current.some(item =>
      !item || typeof item !== "object" || Array.isArray(item) ||
      !item.record || typeof item.record !== "object" || Array.isArray(item.record) ||
      !String(item.record.id ?? "").trim() ||
      (item.linkedFrom !== undefined && !Array.isArray(item.linkedFrom))
    )) {
      throw new Error("The current project's trash contains an invalid entry.");
    }

    if (bundle.trash.some(item =>
      !item || typeof item !== "object" || Array.isArray(item) ||
      !item.record || typeof item.record !== "object" || Array.isArray(item.record) ||
      !String(item.record.id ?? "").trim() ||
      (item.linkedFrom !== undefined && !Array.isArray(item.linkedFrom))
    )) {
      throw new Error("The backup contains an invalid trash entry.");
    }

    writes.set(trashKey, JSON.stringify(
      replace ? bundle.trash : [...current, ...bundle.trash]
    ));
  }

  // localStorage has no multi-key transaction: snapshot affected keys and attempt rollback on failure.
  const previous = new Map();
  writes.forEach((_, key) => previous.set(key, localStorage.getItem(key)));

  try {
    writes.forEach((value, key) => localStorage.setItem(key, value));
  } catch (error) {
    previous.forEach((value, key) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch (rollbackError) {
        console.error("Could not roll back project import", rollbackError);
      }
    });
    throw error;
  }

  return nextRecords.length;
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
      ? record.properties.map(normalizeProperty)
      : [],
    related: Array.isArray(record.related) ? [...record.related] : []
  }));
}

export function loadRecords(starter, uid) {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));

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
      if (
        (record.tags !== undefined && !Array.isArray(record.tags)) ||
        (record.properties !== undefined && !Array.isArray(record.properties)) ||
        (record.related !== undefined && !Array.isArray(record.related))
      ) {
        throw new Error("A saved record contains an invalid tags, properties, or relations list.");
      }

      return {
        id: String(record.id || uid()),
        name: String(record.name || "Untitled"),
        icon: record.icon || "",
        iconColor: /^#[0-9a-f]{6}$/i.test(String(record.iconColor || ""))
          ? String(record.iconColor).toUpperCase()
          : "#B9A0FF",
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
                throw new Error("A saved property has an invalid structure.");
              }

              return normalizeProperty(property);
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
    localStorage.setItem(getScopedStorageKey(STORAGE_KEY), JSON.stringify(records));
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
      mergeCatalog(catalogs, "properties", property.name, record.type)
    );
  });

  defaultTags.forEach(tag => mergeCatalog(catalogs, "tags", tag));
  defaultProperties.forEach(property =>
    mergeCatalog(catalogs, "properties", property)
  );

  return catalogs;
}

export function loadCatalogs() {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(CATALOG_KEY));

    if (raw === null) {
      catalogsReadFailed = false;
      return { tags: [], properties: [] };
    }

    const catalogs = JSON.parse(raw);

    if (!catalogs || typeof catalogs !== "object" || Array.isArray(catalogs)) {
      throw new Error("The saved catalogs have an invalid structure.");
    }

    if (
      (catalogs.tags !== undefined && !Array.isArray(catalogs.tags)) ||
      (catalogs.properties !== undefined &&
        !Array.isArray(catalogs.properties))
    ) {
      throw new Error("The saved catalog lists are invalid.");
    }

    const normalizeEntries = (items, label) => {
      const source = items || [];
      if (!Array.isArray(source)) {
        throw new Error(`The saved ${label} catalog is not a list.`);
      }

      return source.map(item => {
        if (
          !item || typeof item !== "object" || Array.isArray(item) ||
          !String(item.name ?? "").trim()
        ) {
          throw new Error(`The saved ${label} catalog contains an invalid entry.`);
        }

        if (item.types !== undefined && !Array.isArray(item.types)) {
          throw new Error(`The saved ${label} catalog contains invalid type metadata.`);
        }

        return {
          ...item,
          name: String(item.name).trim(),
          types: Array.isArray(item.types) ? item.types.map(String) : []
        };
      });
    };

    const normalized = {
      tags: normalizeEntries(catalogs.tags, "tag"),
      properties: normalizeEntries(catalogs.properties, "property")
    };

    catalogsReadFailed = false;
    return normalized;
  } catch (error) {
    catalogsReadFailed = true;

    console.error("RPG Codex: failed to load catalogs.", error);

    alert(
      "The saved tag/property catalog could not be read. " +
      "Saving the catalog has been blocked to protect its existing data. " +
      "Keep your backup and reload the app after investigating the problem."
    );

    return { tags: [], properties: [] };
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
    if (!catalogs || typeof catalogs !== "object" || Array.isArray(catalogs)) {
      throw new Error("The catalog data is invalid.");
    }

    const normalizeEntries = (items, label) => {
      if (!Array.isArray(items)) {
        throw new Error(`The ${label} catalog must be a list.`);
      }
      return items.map(item => {
        if (
          !item || typeof item !== "object" || Array.isArray(item) ||
          !String(item.name ?? "").trim()
        ) {
          throw new Error(`The ${label} catalog contains an invalid entry.`);
        }
        return {
          ...item,
          name: String(item.name).trim(),
          types: Array.isArray(item.types) ? item.types.map(String) : []
        };
      });
    };

    const normalized = {
      tags: normalizeEntries(catalogs.tags, "tag"),
      properties: normalizeEntries(catalogs.properties, "property")
    };
    localStorage.setItem(getScopedStorageKey(CATALOG_KEY), JSON.stringify(normalized));
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
    const raw = localStorage.getItem(getScopedStorageKey(SAVED_KEY));

    if (raw === null) {
      filtersReadFailed = false;
      return [];
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      throw new Error("The saved filters are not a valid array.");
    }

    const ids = new Set();
    const normalized = data.map(filter => {
      if (
        !filter || typeof filter !== "object" || Array.isArray(filter) ||
        !String(filter.id ?? "").trim() ||
        !String(filter.name ?? "").trim() ||
        !filter.state || typeof filter.state !== "object" || Array.isArray(filter.state)
      ) {
        throw new Error("A saved filter has an invalid structure.");
      }

      const id = String(filter.id).trim();
      if (ids.has(id)) {
        throw new Error("The saved filters contain duplicate IDs.");
      }
      ids.add(id);

      return {
        ...filter,
        id,
        name: String(filter.name).trim(),
        state: normalizeSavedFilterState(filter.state)
      };
    });

    filtersReadFailed = false;
    return normalized;
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
    localStorage.setItem(getScopedStorageKey(SAVED_KEY), JSON.stringify(savedFilters));
    return true;
  } catch (error) {
    console.error("RPG Codex: failed to save filters.", error);
    alert("Could not save filters in this browser.");
    return false;
  }
}
