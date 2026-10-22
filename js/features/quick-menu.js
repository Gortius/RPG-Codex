"use strict";

export function createQuickMenu({
  $,
  showForm,
  setCurrentId,
  bulkActions,
  expanded,
  renderRecords,
  getViewMode,
  setViewMode
}) {
  if ($("quick-menu")) return;

  const menu = document.createElement("aside");
  menu.id = "quick-menu";
  menu.className = "quick-menu";
  menu.setAttribute("aria-label", "Record shortcuts");

  menu.innerHTML = `
    <button type="button" data-action="new"
      title="New record" aria-label="New record">
      <span>＋</span><small>New</small>
    </button>

    <button type="button" data-action="paste"
      title="Paste" aria-label="Paste">
      <span>▣</span><small>Paste</small>
    </button>

    <button type="button" data-action="select"
      title="Selection mode" aria-label="Selection mode">
      <span>☑</span><small>Select</small>
    </button>

    <button type="button" data-action="expand"
      title="Expand or collapse all previews"
      aria-label="Expand or collapse all previews">
      <span>↕</span><small>Details</small>
    </button>

    <div class="quick-menu-divider"></div>

    <button type="button" data-action="list"
      title="List view" aria-label="List view">
      <span>☰</span><small>List</small>
    </button>

    <button type="button" data-action="grid"
      title="Compact grid view" aria-label="Compact grid view">
      <span>▦</span><small>Grid</small>
    </button>
  `;

  document.body.append(menu);

  function updateViewButtons() {
    menu.querySelectorAll("[data-action='list'], [data-action='grid']")
      .forEach(button => {
        button.classList.toggle(
          "active",
          button.dataset.action === getViewMode()
        );
      });
  }

  menu.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    switch (button.dataset.action) {
      case "new":
        setCurrentId(null);
        showForm();
        break;

      case "paste":
        bulkActions.pasteClipboard();
        break;

      case "select":
        bulkActions.startSelectionMode();
        break;

      case "expand": {
        const visibleIds = [
          ...$("records").querySelectorAll("[data-open]")
        ].map(element => element.dataset.open);

        if (!visibleIds.length) return;

        const allExpanded = visibleIds.every(id => expanded.has(id));

        visibleIds.forEach(id => {
          if (allExpanded) {
            expanded.delete(id);
          } else {
            expanded.add(id);
          }
        });

        renderRecords();
        break;
      }

      case "list":
        setViewMode("list");
        renderRecords();
        updateViewButtons();
        break;

      case "grid":
        setViewMode("grid");
        renderRecords();
        updateViewButtons();
        break;
    }
  });

  updateViewButtons();

  return { updateViewButtons };
}
