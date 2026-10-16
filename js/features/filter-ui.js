
"use strict";

const operators = [
  ["contains", "Contains"],
  ["=", "Equal (=)"],
  ["!=", "Not equal (≠)"],
  [">", "Greater than (>)"],
  [">=", "Greater/equal (≥)"],
  ["<", "Less than (<)"],
  ["<=", "Less/equal (≤)"]
];

export function createFilterUIFeatures({
  $,
  esc,
  uniq,
  defaultTypes,
  getRecords,
  catalogNames,
  getActiveTypes,
  setActiveTypes,
  getActiveTags,
  setActiveTags,
  getConditions,
  getFiltersOpen,
  getSavedFilters,
  renderRecords
}) {
  function renderCategories() {
    const activeTypes = getActiveTypes();
    const records = getRecords();
    const types = uniq([
      ...defaultTypes,
      ...records.map(r => r.type)
    ]);

    $("categories").innerHTML =
      `<button class="category ${!activeTypes.length ? "active" : ""}" data-type="*">All</button>` +
      types.map(t =>
        `<button class="category ${activeTypes.includes(t) ? "active" : ""}" data-type="${esc(t)}">${esc(t)}</button>`
      ).join("");

    $("categories").querySelectorAll("[data-type]").forEach(button => {
      button.onclick = () => {
        const type = button.dataset.type;
        const current = getActiveTypes();

        if (type === "*") {
          setActiveTypes([]);
        } else {
          setActiveTypes(
            current.includes(type)
              ? current.filter(x => x !== type)
              : [...current, type]
          );
        }

        renderCategories();
        renderRecords();
        updateFilterToggle();
      };
    });

    $("filter-hint").textContent = activeTypes.length
      ? "Filtering by: " + activeTypes.join(", ")
      : "Showing all types. Select multiple types to combine filters.";
  }

  function renderFilterTags() {
    const activeTags = getActiveTags();

    $("filter-tags").innerHTML = catalogNames("tags")
      .map(tag =>
        `<button class="filter-chip ${activeTags.includes(tag) ? "active" : ""}" data-tag="${esc(tag)}">${esc(tag)}</button>`
      ).join("");

    $("filter-tags").querySelectorAll("[data-tag]").forEach(button => {
      button.onclick = () => {
        const tag = button.dataset.tag;
        const current = getActiveTags();

        setActiveTags(
          current.includes(tag)
            ? current.filter(x => x !== tag)
            : [...current, tag]
        );

        renderFilterTags();
        renderRecords();
        updateFilterToggle();
      };
    });
  }

  function renderFilterOptions() {
    const categorySelect = $("filter-category");
    const subcategorySelect = $("filter-subcategory");
    const oldCategory = categorySelect.value;
    const oldSubcategory = subcategorySelect.value;
    const records = getRecords();

    const categories = uniq(records.map(r => r.category));

    categorySelect.innerHTML =
      '<option value="">All categories</option>' +
      categories.map(category =>
        `<option>${esc(category)}</option>`
      ).join("");

    categorySelect.value = categories.includes(oldCategory)
      ? oldCategory
      : "";

    const subcategories = uniq(
      records
        .filter(r =>
          !categorySelect.value ||
          r.category === categorySelect.value
        )
        .map(r => r.subcategory)
    );

    subcategorySelect.innerHTML =
      '<option value="">All subcategories</option>' +
      subcategories.map(subcategory =>
        `<option>${esc(subcategory)}</option>`
      ).join("");

    subcategorySelect.value = subcategories.includes(oldSubcategory)
      ? oldSubcategory
      : "";

    renderFilterTags();
  }

  function renderConditionRows() {
    const conditions = getConditions();

    $("property-conditions").innerHTML = conditions.map((condition, index) =>
      `<div class="condition-row" data-i="${index}">
        <select class="prop">
          <option value="">Property...</option>
          ${catalogNames("properties").map(property =>
            `<option value="${esc(property)}" ${property === condition.property ? "selected" : ""}>${esc(property)}</option>`
          ).join("")}
        </select>
        <select class="op">
          ${operators.map(([value, label]) =>
            `<option value="${value}" ${value === condition.operator ? "selected" : ""}>${label}</option>`
          ).join("")}
        </select>
        <input class="val" value="${esc(condition.value)}" placeholder="Value">
        <button class="remove" type="button">×</button>
      </div>`
    ).join("");

    $("property-conditions")
      .querySelectorAll(".condition-row")
      .forEach(row => {
        const index = Number(row.dataset.i);

        row.querySelector(".prop").onchange = event => {
          conditions[index].property = event.target.value;
          renderRecords();
          updateFilterToggle();
        };

        row.querySelector(".op").onchange = event => {
          conditions[index].operator = event.target.value;
          renderRecords();
          updateFilterToggle();
        };

        row.querySelector(".val").oninput = event => {
          conditions[index].value = event.target.value;
          renderRecords();
          updateFilterToggle();
        };

        row.querySelector(".remove").onclick = () => {
          conditions.splice(index, 1);
          renderConditionRows();
          renderRecords();
          updateFilterToggle();
        };
      });
  }

  function renderSavedFilters() {
    const savedFilters = getSavedFilters();

    $("saved-filters").innerHTML =
      '<option value="">Choose a saved filter...</option>' +
      savedFilters.map(filter =>
        `<option value="${esc(filter.id)}">${esc(filter.name)}</option>`
      ).join("");
  }

  function updateFilterToggle() {
    const activeTypes = getActiveTypes();
    const activeTags = getActiveTags();
    const conditions = getConditions();

    const count =
      activeTypes.length +
      activeTags.length +
      ($("filter-category").value ? 1 : 0) +
      ($("filter-subcategory").value ? 1 : 0) +
      conditions.filter(condition =>
        condition.property && condition.value.trim()
      ).length;

    const filtersOpen = getFiltersOpen();

    $("toggle-filters").textContent =
      (filtersOpen ? "Hide filters" : "Show filters") +
      (count ? " · " + count + " active" : "");

    $("advanced-filter-content").hidden = !filtersOpen;
  }

  return {
    renderCategories,
    renderFilterTags,
    renderFilterOptions,
    renderConditionRows,
    renderSavedFilters,
    updateFilterToggle
  };
}
