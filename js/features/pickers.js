
"use strict";

export function createPickerFeatures({
  $,
  esc,
  getRecords,
  getRecord,
  catalogNames,
  mergeCatalog,
  saveCatalogs,
  getEditingId,
  getSelectedTags,
  setSelectedTags,
  getSelectedRelated,
  setSelectedRelated,
  getTagOpen,
  setTagOpen,
  getRelatedOpen,
  setRelatedOpen,
  getTagSearch,
  setTagSearch,
  getRelatedSearch,
  setRelatedSearch,
  getTagCreateOpen,
  setTagCreateOpen
}) {
  function renderPicker(kind) {
    const isTags = kind === "tags";
    const root = $(isTags ? "tag-picker" : "related-picker");
    const open = isTags ? getTagOpen() : getRelatedOpen();
    const search = isTags ? getTagSearch() : getRelatedSearch();
    const selected = isTags ? getSelectedTags() : getSelectedRelated();

    const options = isTags
      ? catalogNames("tags").filter(t =>
          t.toLowerCase().includes(search.toLowerCase())
        )
      : getRecords().filter(r =>
          r.id !== getEditingId() &&
          !selected.includes(r.id) &&
          r.name.toLowerCase().includes(search.toLowerCase())
        );

    const selectedHtml = selected.map(id => {
      const label = isTags
        ? id
        : (getRecord(id)?.name || "Unknown record");

      return `<span class="selected-item">${esc(label)} <button type="button" data-unselect="${esc(id)}" aria-label="Remove ${esc(label)}">×</button></span>`;
    }).join("");

    root.innerHTML = `<button type="button" class="picker-trigger" data-toggle-picker>${isTags ? "Choose tags" : "Choose related records"} <span>${open ? "−" : "+"}</span></button>
${selectedHtml ? `<div class="selected-items">${selectedHtml}</div>` : ""}
${open ? `<div class="picker-menu"><input class="picker-search" placeholder="Search..." value="${esc(search)}">
<div class="picker-options">${options.map(item => {
  const id = isTags ? item : item.id;
  const label = isTags ? item : item.name;
  return `<button type="button" class="picker-option" data-pick="${esc(id)}">${esc(isTags ? "# " : "")}${esc(label)}</button>`;
}).join("") || '<div class="picker-empty">No matches found.</div>'}
${isTags ? '<button type="button" class="picker-option create" data-create-tag>+ Create a new tag</button>' : ""}
${isTags && getTagCreateOpen() ? '<div class="picker-create-form"><input id="new-tag-name" placeholder="New tag name"><button type="button" class="primary" id="confirm-new-tag">Add</button></div>' : ""}
</div></div>` : ""}`;

    root.querySelector("[data-toggle-picker]").onclick = () => {
      if (isTags) {
        setTagOpen(!getTagOpen());
      } else {
        setRelatedOpen(!getRelatedOpen());
      }

      renderPicker(kind);
    };

    root.querySelectorAll("[data-unselect]").forEach(button => {
      button.onclick = () => {
        if (isTags) {
          setSelectedTags(
            getSelectedTags().filter(x => x !== button.dataset.unselect)
          );
        } else {
          setSelectedRelated(
            getSelectedRelated().filter(x => x !== button.dataset.unselect)
          );
        }

        renderPicker(kind);
      };
    });

    root.querySelectorAll("[data-pick]").forEach(button => {
      button.onclick = () => {
        const id = button.dataset.pick;

        if (isTags) {
          const selectedTags = getSelectedTags();

          if (!selectedTags.includes(id)) {
            setSelectedTags([...selectedTags, id]);
          }

          setTagSearch("");
        } else {
          const selectedRelated = getSelectedRelated();

          if (!selectedRelated.includes(id)) {
            setSelectedRelated([...selectedRelated, id]);
          }

          setRelatedSearch("");
        }

        renderPicker(kind);
      };
    });

    const input = root.querySelector(".picker-search");

    if (input) {
      input.oninput = () => {
        if (isTags) {
          setTagSearch(input.value);
        } else {
          setRelatedSearch(input.value);
        }

        const pos = input.selectionStart;
        renderPicker(kind);

        const next = root.querySelector(".picker-search");
        next.focus();
        next.setSelectionRange(pos, pos);
      };
    }

    const createBtn = root.querySelector("[data-create-tag]");

    if (createBtn) {
      createBtn.onclick = () => {
        setTagCreateOpen(true);
        renderPicker(kind);
        $("new-tag-name")?.focus();
      };
    }

    const confirm = root.querySelector("#confirm-new-tag");

    if (confirm) {
      confirm.onclick = () => {
        const name = $("new-tag-name").value.trim();
        if (!name) return;

        mergeCatalog("tags", name, $("f-type").value);

        const selectedTags = getSelectedTags();

        if (!selectedTags.some(
          tag => tag.toLowerCase() === name.toLowerCase()
        )) {
          setSelectedTags([...selectedTags, name]);
        }

        saveCatalogs();
        setTagCreateOpen(false);
        setTagSearch("");
        renderPicker("tags");
      };
    }

    const newTagInput = root.querySelector("#new-tag-name");

    if (newTagInput) {
      newTagInput.onkeydown = event => {
        if (event.key === "Enter") {
          event.preventDefault();
          confirm.click();
        }
      };
    }
  }

  return { renderPicker };
}
