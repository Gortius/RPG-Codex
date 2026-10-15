
"use strict";

function num(value) {
  const text = String(value).trim();

  if (!text || !/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    return null;
  }

  return Number(text);
}

function conditionMatches(record, condition) {
  if (!condition.property || !condition.value.trim()) {
    return true;
  }

  const property = record.properties.find(
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

export function filterRecords(records, filters) {
  const {
    query,
    types,
    category,
    subcategory,
    tags,
    conditions,
    sort
  } = filters;

  const q = query.trim().toLowerCase();

  const list = records.filter(record => {
    const text = [
      record.name,
      record.type,
      record.category,
      record.subcategory,
      record.description,
      ...record.tags,
      ...record.properties.map(
        property => property.name + " " + property.value
      )
    ].join(" ").toLowerCase();

    return (
      (!types.length || types.includes(record.type)) &&
      (!category || record.category === category) &&
      (!subcategory || record.subcategory === subcategory) &&
      tags.every(tag => record.tags.includes(tag)) &&
      conditions.every(condition =>
        conditionMatches(record, condition)
      ) &&
      text.includes(q)
    );
  });

  list.sort((a, b) =>
    sort === "name-desc"
      ? b.name.localeCompare(a.name)
      : sort === "type"
        ? a.type.localeCompare(b.type) ||
          a.name.localeCompare(b.name)
        : sort === "category"
          ? (a.category || "").localeCompare(b.category || "") ||
            a.name.localeCompare(b.name)
          : sort === "newest"
            ? (b.createdAt || "").localeCompare(a.createdAt || "")
            : sort === "oldest"
              ? (a.createdAt || "").localeCompare(b.createdAt || "")
              : a.name.localeCompare(b.name)
  );

  return list;
}
