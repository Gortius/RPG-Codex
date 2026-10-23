
"use strict";

function num(value) {
  const text = String(value).trim();

  if (!text || !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return null;
  }

  return Number(text);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function conditionMatches(record, condition) {
  if (!condition.property || !condition.value.trim()) {
    return true;
  }

  const properties = safeArray(record.properties);
  const property = properties.find(
    item => item.name === condition.property
  );

  if (!property) return false;

  const a = String(property.value).trim();
  const b = condition.value.trim();
  const na = num(a);
  const nb = num(b);

  if (condition.operator === "contains") {
    return a.toLowerCase().includes(b.toLowerCase());
  }

  if (condition.operator === "=") {
    return na !== null && nb !== null
      ? na === nb
      : a.toLowerCase() === b.toLowerCase();
  }

  if (condition.operator === "!=") {
    return na !== null && nb !== null
      ? na !== nb
      : a.toLowerCase() !== b.toLowerCase();
  }

  if (na === null || nb === null) return false;

  return condition.operator === ">" ? na > nb
    : condition.operator === ">=" ? na >= nb
    : condition.operator === "<" ? na < nb
    : condition.operator === "<=" ? na <= nb
    : true;
}

function getSortInfo(sort) {
  const value = String(sort || "name-asc");

  // Valores usados pelas versões anteriores do aplicativo.
  const legacy = {
    "name": { key: "name", direction: "asc" },
    "name-asc": { key: "name", direction: "asc" },
    "name-desc": { key: "name", direction: "desc" },
    "details": { key: "details", direction: "asc" },
    "details-asc": { key: "details", direction: "asc" },
    "details-desc": { key: "details", direction: "desc" },
    "date": { key: "date", direction: "asc" },
    "oldest": { key: "date", direction: "asc" },
    "newest": { key: "date", direction: "desc" },
    "relations": { key: "relations", direction: "asc" },
    "relations-asc": { key: "relations", direction: "asc" },
    "relations-desc": { key: "relations", direction: "desc" },
    "type": { key: "name", direction: "asc" },
    "category": { key: "name", direction: "asc" }
  };

  if (legacy[value]) return legacy[value];

  const match = value.match(
    /^(name|details|date|relations)-(asc|desc)$/
  );

  if (match) {
    return {
      key: match[1],
      direction: match[2]
    };
  }

  return { key: "name", direction: "asc" };
}

function compareText(a, b) {
  return String(a ?? "").localeCompare(
    String(b ?? ""),
    undefined,
    { sensitivity: "base", numeric: true }
  );
}

function compareRecords(a, b, sort) {
  const { key, direction } = getSortInfo(sort);
  const multiplier = direction === "desc" ? -1 : 1;

  let result = 0;

  if (key === "name") {
    result = compareText(a.name, b.name);
  } else if (key === "details") {
    const countA =
      safeArray(a.properties).length +
      safeArray(a.tags).length;

    const countB =
      safeArray(b.properties).length +
      safeArray(b.tags).length;

    result = countA - countB;
  } else if (key === "date") {
    const dateA = Date.parse(a.createdAt || "") || 0;
    const dateB = Date.parse(b.createdAt || "") || 0;

    result = dateA - dateB;
  } else if (key === "relations") {
    result =
      safeArray(a.related).length -
      safeArray(b.related).length;
  }

  if (result !== 0) {
    return result * multiplier;
  }

  // Para empates, mantém um critério secundário previsível.
  return compareText(a.name, b.name);
}

export function filterRecords(records, filters) {
  const {
    query = "",
    types = [],
    category = "",
    subcategory = "",
    tags = [],
    conditions = [],
    sort = "name-asc"
  } = filters;

  const q = String(query).trim().toLowerCase();

  const list = records.filter(record => {
    const recordTags = safeArray(record.tags);
    const properties = safeArray(record.properties);

    const text = [
      record.name,
      record.type,
      record.category,
      record.subcategory,
      record.description,
      ...recordTags,
      ...properties.map(
        property => property.name + " " + property.value
      )
    ].join(" ").toLowerCase();

    return (
      (!types.length || types.includes(record.type)) &&
      (!category || record.category === category) &&
      (!subcategory || record.subcategory === subcategory) &&
      tags.every(tag => recordTags.includes(tag)) &&
      conditions.every(condition =>
        conditionMatches(record, condition)
      ) &&
      text.includes(q)
    );
  });

  list.sort((a, b) => compareRecords(a, b, sort));

  return list;
}
