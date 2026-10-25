
import {
  loadProjects,
  saveProjects,
  getActiveProjectId,
  setActiveProjectId,
  exportProjectBundle,
  importProjectBundle,
  loadTrash,
  saveTrash,
  STORAGE_KEY,
  CATALOG_KEY,
  SAVED_KEY,
  TRASH_KEY,
  getScopedStorageKey
} from "../data/storage.js";
import { STARTER_RECORDS } from "../data/default-records.js";

const $ = id => document.getElementById(id);

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[char]));

function notify(message, type = "success") {
  let host = $("enhancement-toast");

  if (!host) {
    host = document.createElement("div");
    host.id = "enhancement-toast";
    host.className = "enhancement-toast";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }

  host.textContent = message;
  host.dataset.type = type;
  host.classList.add("visible");

  clearTimeout(host._hideTimer);
  host._hideTimer = setTimeout(() => host.classList.remove("visible"), 3600);
}

let activeModalCleanup = null;

function showModal({ title, description = "", body = "", actions = [] }) {
  activeModalCleanup?.();

  const overlay = document.createElement("div");
  overlay.id = "enhancement-modal";
  overlay.className = "enhancement-modal-overlay";
  overlay.innerHTML = `
    <section class="enhancement-modal" role="dialog" aria-modal="true"
      aria-labelledby="enhancement-modal-title">
      <button type="button" class="enhancement-modal-close"
        aria-label="Close dialog" data-modal-close>×</button>
      <h2 id="enhancement-modal-title">${escapeHTML(title)}</h2>
      ${description ? `<p class="enhancement-modal-description">${escapeHTML(description)}</p>` : ""}
      <div class="enhancement-modal-body">${body}</div>
      <div class="enhancement-modal-actions">
        ${actions.map((action, index) => `
          <button type="button" class="${escapeHTML(action.className || "secondary")}"
            data-modal-action="${index}">${escapeHTML(action.label)}</button>
        `).join("")}
      </div>
    </section>
  `;

  document.body.append(overlay);

  const onKey = event => {
    if (event.key === "Escape") close();
  };

  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if (activeModalCleanup === close) activeModalCleanup = null;
  };

  activeModalCleanup = close;

  overlay.addEventListener("click", event => {
    if (event.target === overlay || event.target.closest("[data-modal-close]")) {
      close();
    }
  });

  overlay.addEventListener("click", event => {
    const button = event.target.closest("[data-modal-action]");
    if (!button) return;

    const action = actions[Number(button.dataset.modalAction)];
    if (!action) return;

    if (action.keepOpen) {
      action.onClick?.(overlay, close);
      return;
    }

    close();
    action.onClick?.(overlay, close);
  });

  document.addEventListener("keydown", onKey);
  overlay.querySelector("[data-modal-close]")?.focus();

  return { overlay, close };
}

function makeId(prefix = "p") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupProjects() {
  const switcher = $("project-switcher");
  const manageButton = $("project-manage");
  const backupFile = $("backup-file");
  const trashButton = $("trash-open");

  if (!switcher || !manageButton || !backupFile || !trashButton) return;

  let projects = loadProjects();

  if (!projects.some(project => project.id === getActiveProjectId())) {
    setActiveProjectId("default");
  }

  function refreshProjects() {
    projects = loadProjects();

    switcher.innerHTML = projects.map(project =>
      `<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`
    ).join("");

    switcher.value = getActiveProjectId();
  }

  function activeProject() {
    return loadProjects().find(project => project.id === getActiveProjectId());
  }

  function createProject(name, bundle = null) {
    const cleanName = String(name || "").trim();

    if (!cleanName) {
      notify("Enter a project name.", "error");
      return;
    }

    const previousProjectId = getActiveProjectId();
    const nextProjects = loadProjects();

    if (nextProjects.some(project =>
      project.name.toLowerCase() === cleanName.toLowerCase()
    )) {
      notify("A project with that name already exists.", "error");
      return;
    }

    const id = makeId();

    nextProjects.push({
      id,
      name: cleanName,
      createdAt: new Date().toISOString()
    });

    try {
      saveProjects(nextProjects);
      setActiveProjectId(id);

      if (bundle) {
        importProjectBundle(bundle, { replace: true });
        window.RPGCodexFolders?.importBackupData?.(bundle.folders, { replace: true, records: bundle.records });
      }

      location.reload();
    } catch (error) {
      try {
        saveProjects(loadProjects().filter(project => project.id !== id));
        setActiveProjectId(previousProjectId);
      } catch (rollbackError) {
        console.error("Could not roll back failed project creation.", rollbackError);
      }
      notify(`Could not create project: ${error.message}`, "error");
    }
  }

  function openCreateProject() {
    showModal({
      title: "New project",
      description: "Create an independent database. Your other projects will remain unchanged.",
      body: `
        <label class="enhancement-field-label" for="new-project-name">Project name</label>
        <input id="new-project-name" class="enhancement-text-input"
          maxlength="80" placeholder="e.g. Clades — Reborn" autocomplete="off">
      `,
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Create project",
          className: "primary",
          onClick: modal => createProject(modal.querySelector("#new-project-name")?.value)
        }
      ]
    });

    $("new-project-name")?.focus();
  }

  function openRenameProject() {
    const project = activeProject();
    if (!project) return;

    showModal({
      title: "Rename project",
      body: `
        <label class="enhancement-field-label" for="rename-project-name">Project name</label>
        <input id="rename-project-name" class="enhancement-text-input"
          maxlength="80" value="${escapeHTML(project.name)}" autocomplete="off">
      `,
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Save name",
          className: "primary",
          onClick: modal => {
            const name = modal.querySelector("#rename-project-name")?.value.trim();
            if (!name) {
              notify("Enter a project name.", "error");
              return;
            }

            const next = loadProjects();

            if (next.some(item =>
              item.id !== project.id &&
              item.name.toLowerCase() === name.toLowerCase()
            )) {
              notify("A project with that name already exists.", "error");
              return;
            }

            const target = next.find(item => item.id === project.id);
            if (!target) return;

            target.name = name;
            saveProjects(next);
            refreshProjects();
            notify("Project renamed.");
          }
        }
      ]
    });
  }

  function openDeleteProject() {
    const project = activeProject();
    if (!project) return;

    if (project.id === "default") {
      notify("The original project cannot be deleted.", "error");
      return;
    }

    showModal({
      title: "Delete project?",
      description: `“${project.name}” and its local data will be permanently deleted. Export a backup first if you need to keep it.`,
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Delete project",
          className: "danger",
          onClick: () => {
            [
              STORAGE_KEY,
              CATALOG_KEY,
              SAVED_KEY,
              TRASH_KEY
            ].forEach(key => localStorage.removeItem(`${key}::${project.id}`));
            window.RPGCodexFolders?.deleteProjectData?.(project.id);

            saveProjects(loadProjects().filter(item => item.id !== project.id));
            setActiveProjectId("default");
            location.reload();
          }
        }
      ]
    });
  }

  function exportCurrentProject() {
    try {
      const bundle = exportProjectBundle();
      bundle.folders = window.RPGCodexFolders?.getBackupData?.() || { folders: [], assignments: {} };
      const id = getActiveProjectId();
      const storedRecords = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));

      // Preserve the starter records if the default project has not been saved yet.
      if (storedRecords === null && id === "default") {
        bundle.records = STARTER_RECORDS.map(record => ({
          ...record,
          category: "",
          subcategory: ""
        }));
      }

      downloadJSON(`rpg-codex-${id}-backup.json`, bundle);
      notify("Project backup exported.");
    } catch (error) {
      notify(`Could not create backup: ${error.message}`, "error");
    }
  }

  function openImportPicker() {
    backupFile.value = "";
    backupFile.click();
  }

  function openImportMode(bundle) {
    if (
      !bundle ||
      bundle.format !== "rpg-codex-backup" ||
      bundle.version !== 1 ||
      !Array.isArray(bundle.records)
    ) {
      notify("This file is not a valid RPG Codex backup.", "error");
      return;
    }

    if (bundle.records.some(record =>
      !record || typeof record !== "object" ||
      !record.id || !record.name || !record.type
    )) {
      notify("The backup contains an invalid record.", "error");
      return;
    }

    showModal({
      title: "Import backup",
      description: `${bundle.records.length} records found in this backup. Choose how you want to import them.`,
      body: `
        <div class="enhancement-choice-list">
          <div class="enhancement-choice">
            <strong>Import into current project</strong>
            <p>Add the backup to “${escapeHTML(activeProject()?.name || "Current project")}” or replace its data.</p>
          </div>
          <div class="enhancement-choice">
            <strong>Create a new project</strong>
            <p>Keep the current project untouched and create a separate project from this backup.</p>
          </div>
        </div>
      `,
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Import into current",
          className: "primary",
          onClick: () => chooseCurrentImportMode(bundle)
        },
        {
          label: "Create new project",
          className: "primary",
          onClick: () => createProjectFromBackup(bundle)
        }
      ]
    });
  }

  function chooseCurrentImportMode(bundle) {
    showModal({
      title: "Import into current project",
      description: "Choose whether to replace the current project's data or merge the backup with it.",
      body: `
        <div class="enhancement-choice-list">
          <div class="enhancement-choice">
            <strong>Merge</strong>
            <p>Keep existing records and add records from the backup. Conflicting IDs may be assigned new IDs.</p>
          </div>
          <div class="enhancement-choice">
            <strong>Replace</strong>
            <p>Replace records, catalogs, saved filters and trash with the backup contents.</p>
          </div>
        </div>
      `,
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Merge",
          className: "primary",
          onClick: () => runImport(bundle, false)
        },
        {
          label: "Replace",
          className: "danger",
          onClick: () => {
            showModal({
              title: "Replace project data?",
              description: "This replaces the current project's records, catalogs, saved filters and trash. Export a backup first if you may need the current data.",
              actions: [
                { label: "Go back", className: "secondary" },
                {
                  label: "Replace data",
                  className: "danger",
                  onClick: () => runImport(bundle, true)
                }
              ]
            });
          }
        }
      ]
    });
  }

  function runImport(bundle, replace) {
    try {
      const count = importProjectBundle(bundle, { replace });
      window.RPGCodexFolders?.importBackupData?.(bundle.folders, { replace, records: bundle.records });
      notify(`Import complete: ${count} records in the project.`);
      setTimeout(() => location.reload(), 650);
    } catch (error) {
      notify(`Import failed: ${error.message}`, "error");
    }
  }

  function createProjectFromBackup(bundle) {
    showModal({
      title: "Create project from backup",
      description: "Choose a name for the new project. Your current project will not be overwritten.",
      body: `
        <label class="enhancement-field-label" for="import-project-name">New project name</label>
        <input id="import-project-name" class="enhancement-text-input"
          maxlength="80" value="${escapeHTML(bundle.projectName || "Imported project")}"
          autocomplete="off">
      `,
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Create and import",
          className: "primary",
          onClick: modal => createProject(
            modal.querySelector("#import-project-name")?.value,
            bundle
          )
        }
      ]
    });
  }

  function openProjectsMenu() {
    let menu = $("projects-dropdown");

    if (menu) {
      menu.remove();
      manageButton.setAttribute("aria-expanded", "false");
      return;
    }

    menu = document.createElement("div");
    menu.id = "projects-dropdown";
    menu.className = "projects-dropdown";
    menu.innerHTML = `
      <div class="projects-dropdown-heading">PROJECTS</div>
      <div class="projects-dropdown-current">${escapeHTML(activeProject()?.name || "Current project")}</div>
      <button type="button" data-project-action="new">＋ New project</button>
      <button type="button" data-project-action="rename">✎ Rename current</button>
      <button type="button" data-project-action="delete" class="menu-danger">Delete current project</button>
      <div class="projects-dropdown-divider"></div>
      <button type="button" data-project-action="export">↓ Export backup</button>
      <button type="button" data-project-action="import">↑ Import backup</button>
    `;

    manageButton.insertAdjacentElement("afterend", menu);
    manageButton.setAttribute("aria-expanded", "true");

    menu.addEventListener("click", event => {
      const button = event.target.closest("[data-project-action]");
      if (!button) return;

      const action = button.dataset.projectAction;
      menu.remove();
      manageButton.setAttribute("aria-expanded", "false");

      ({
        new: openCreateProject,
        rename: openRenameProject,
        delete: openDeleteProject,
        export: exportCurrentProject,
        import: openImportPicker
      })[action]?.();
    });
  }

  switcher.onchange = () => {
    if (switcher.value === getActiveProjectId()) return;
    setActiveProjectId(switcher.value);
    location.reload();
  };

  manageButton.onclick = event => {
    event.stopPropagation();
    openProjectsMenu();
  };

  document.addEventListener("click", event => {
    const menu = $("projects-dropdown");
    if (menu && !menu.contains(event.target) && event.target !== manageButton) {
      menu.remove();
      manageButton.setAttribute("aria-expanded", "false");
    }
  });

  backupFile.onchange = async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const bundle = JSON.parse(await file.text());
      openImportMode(bundle);
    } catch (error) {
      notify(`Could not read the backup: ${error.message}`, "error");
    } finally {
      backupFile.value = "";
    }
  };

  function openTrash() {
    let trash;
    try {
      trash = loadTrash();
    } catch (error) {
      notify(error.message, "error");
      return;
    }

    const body = trash.length
      ? `<div class="trash-items">${trash.map((item, index) => `
          <div class="trash-item">
            <div>
              <strong>${escapeHTML(item.record?.name || "Unnamed record")}</strong>
              <small>${escapeHTML(item.record?.type || "Record")}</small>
            </div>
            <button type="button" class="secondary" data-restore-trash="${index}">Restore</button>
          </div>
        `).join("")}</div>`
      : '<p class="muted">The trash is empty.</p>';

    showModal({
      title: `Trash (${trash.length})`,
      description: "Restore a deleted record or permanently empty the trash.",
      body,
      actions: [
        { label: "Close", className: "secondary" },
        ...(trash.length ? [{
          label: "Empty trash",
          className: "danger",
          onClick: () => confirmEmptyTrash()
        }] : [])
      ]
    });

    $("enhancement-modal")?.querySelectorAll("[data-restore-trash]").forEach(button => {
      button.addEventListener("click", () => restoreTrashItem(Number(button.dataset.restoreTrash)));
    });
  }

  function confirmEmptyTrash() {
    showModal({
      title: "Empty trash?",
      description: "All trashed records will be permanently deleted. This cannot be undone.",
      actions: [
        { label: "Cancel", className: "secondary" },
        {
          label: "Empty trash",
          className: "danger",
          onClick: () => {
            try {
              saveTrash([]);
              notify("Trash emptied.");
            } catch (error) {
              notify(`Could not empty trash: ${error.message}`, "error");
            }
          }
        }
      ]
    });
  }

  function restoreTrashItem(index) {
    let trash;
    try {
      trash = loadTrash();
    } catch (error) {
      notify(error.message, "error");
      return;
    }
    const item = trash[index];

    if (!item?.record || typeof item.record !== "object" || Array.isArray(item.record)) {
      notify("This trash entry is invalid.", "error");
      return;
    }

    const projectId = getActiveProjectId();
    const recordsKey = getScopedStorageKey(STORAGE_KEY, projectId);
    const trashKey = getScopedStorageKey(TRASH_KEY, projectId);
    let storedRecords;
    let storedTrash;
    let records;

    // Never fall back to starter records if saved data is corrupt: that could overwrite it.
    try {
      storedRecords = localStorage.getItem(recordsKey);
      storedTrash = localStorage.getItem(trashKey);

      if (storedRecords === null) {
        records = projectId === "default"
          ? STARTER_RECORDS.map(record => ({
              ...record,
              tags: [...(record.tags || [])],
              properties: (record.properties || []).map(property => ({ ...property })),
              related: [...(record.related || [])]
            }))
          : [];
      } else {
        records = JSON.parse(storedRecords);
      }

      if (!Array.isArray(records)) {
        throw new Error("Saved records are not a list.");
      }
      if (records.some(record =>
        !record || typeof record !== "object" || Array.isArray(record) || !record.id
      )) {
        throw new Error("Saved records contain an invalid entry.");
      }
    } catch (error) {
      console.error("Could not safely restore a trashed record.", error);
      notify("Restore stopped because saved data could not be read safely. Your data was not overwritten.", "error");
      return;
    }

    if (records.some(record => String(record.id) === String(item.record.id))) {
      notify("A record with this ID already exists.", "error");
      return;
    }

    const restored = { ...item.record };
    delete restored._trashedAt;
    delete restored._linkedFrom;
    restored.related = Array.isArray(restored.related) ? restored.related.map(String) : [];

    const nextRecords = [...records, restored].map(record => ({
      ...record,
      related: Array.isArray(record.related) ? [...record.related] : []
    }));

    (item.linkedFrom || item.record._linkedFrom || []).forEach(linkedId => {
      const linked = nextRecords.find(record => String(record.id) === String(linkedId));
      if (linked && !linked.related.includes(restored.id)) {
        linked.related.push(restored.id);
      }
    });

    trash.splice(index, 1);

    try {
      localStorage.setItem(recordsKey, JSON.stringify(nextRecords));
      saveTrash(trash);
      notify("Record restored.");
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      // Best-effort rollback so a failed trash write does not leave partial state.
      try {
        if (storedRecords === null) localStorage.removeItem(recordsKey);
        else localStorage.setItem(recordsKey, storedRecords);
        if (storedTrash === null) localStorage.removeItem(trashKey);
        else localStorage.setItem(trashKey, storedTrash);
      } catch (rollbackError) {
        console.error("Could not roll back a failed trash restore.", rollbackError);
      }
      console.error("Could not restore trashed record.", error);
      notify(`Could not restore record: ${error.message}`, "error");
    }
  }

  trashButton.onclick = openTrash;

  refreshProjects();
}

/* Full Lucide catalog plus the optional Game Icons RPG collection. */
const FALLBACK_LUCIDE_NAMES = `
activity air-vent alarm-clock album alert-circle alert-triangle anchor aperture archive
arrow-big-down arrow-down arrow-left arrow-right arrow-up at-sign award axe
backpack badge-check ban banana bandage banknote baseline battery beaker bean
bed bell bike binoculars bird bitcoin-blend blocks bluetooth bone book book-open
bookmark bot box boxes brain briefcase brush bug building-2 bus cable cake
calculator calendar camera campfire candy cane castle chart-no-axes check check-circle
chef-hat cherry chevron-down chevron-left chevron-right chevron-up chess-knight circle
circle-check circle-help circle-plus circle-user clipboard clock cloud cloud-lightning
cloud-rain cloud-snow clover code code-2 coffee cog coins compass component computer
cone construction contact copy copyright cpu cross crosshair crown cube cup-soda
database diamond dice-1 dice-5 disc door-open download drama drill droplet droplets
ear earth eclipse egg egg-fried ellipsis ellipsis-vertical equal eye eye-off
factory fan feather fence ferris-wheel file file-code file-cog file-text film filter
fingerprint fire extinguisher fish flag flag-triangle-right flame flashlight flask-conical
flask-round focus folder folder-open footprints fork-knife frame gamepad-2 gauge
gem ghost gift git-branch globe goal grab graduation-cap grid-2x2 hammer hand
hand-coins hand-heart hand-helping handshake hard-drive hat-glasses heading headphones
heart heart-crack heart-handshake heart-pulse helicopter hexagon history home
hourglass house ice-cream image inbox infinity inspection-panel italic key key-round
keyboard lamp land-plot landmark languages laptop layers leaf library life-buoy
lightbulb link list list-check loader lock lock-keyhole magnet mail map map-pin
medal megaphone menu message-circle message-square mic microphone microscope minus
monitor moon moon-star mountain mountain-snow mouse move music network newspaper
nut off option orbit package paintbrush palette panel-top paperclip paw pen pencil
person standing phone pickaxe piggy-bank pill pin pine-tree pizza plane play plug
plus pocket podcast pointer power printer puzzle pyramid radio rainbow rat receipt
recycle redo refresh-cw repeat replace reply rewind ribbon rocket roller scroll
rotate-ccw route rows ruler sailboat satellite save scale scan scan-face school
scissors search send server settings shield shield-alert shield-check ship shirt
shopping-bag shopping-cart shovel shower shrunk signal signature signpost skull
slack smile snowflake sofa sparkles speaker speech spell-check spinner split square
star star-half step-forward stethoscope sticky-note stonecutter stop stopwatch
store sun sun-moon sunrise sunset sword swords syringe table tablet tag tags
target tent terminal test-tube thermometer thumbs-down thumbs-up ticket timer
toggle-left toggle-right tool torch tornado touchpad trees trending-up triangle
trophy truck tv umbrella underline undo unlock unlock-keyhole upload user user-round
user-round-check users utensils vault vector video videogame vinyl vote wallet
wand wand-sparkles warehouse watch waves web-camera wifi wind wine wrench
x x-circle zap zoom-in zoom-out
`.trim().split(/\s+/);

function toKebabCase(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function getLucideNames() {
  const definitions = window.lucide?.icons;

  const names = definitions && typeof definitions === "object"
    ? Object.keys(definitions).map(toKebabCase)
    : FALLBACK_LUCIDE_NAMES;

  return [...new Set(names)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function iconCategory(name) {
  const categories = [
    ["Combat", /sword|shield|axe|bow|target|crosshair|skull|bomb|spear|dagger|hammer|fist|swords|spear|shield|heart-pulse/],
    ["Magic & Effects", /wand|spark|flame|fire|zap|lightning|wind|snow|droplet|moon|sun|atom|orbit|rainbow|ghost|eye|star|sparkles/],
    ["Creatures", /bug|bird|cat|dog|fish|horse|rabbit|rat|snail|turtle|paw|bone|squirrel|worm|shell/],
    ["Crafting & Items", /gem|diamond|pickaxe|anvil|wrench|flask|beaker|package|box|layers|nut|cooking|hammer|shovel|key|chest|backpack/],
    ["World & Exploration", /map|compass|mountain|tree|forest|flower|sprout|waves|cloud|castle|tent|ship|door|house|route|footprints|globe/],
    ["People", /user|users|person|crown|hat|graduation|ghost|bot|hand|accessibility/]
  ];

  return categories.find(([, pattern]) => pattern.test(name))?.[0] || "General";
}

// Add common Portuguese search terms to icon names without changing the saved icon IDs.
const ICON_SEARCH_ALIASES = {
  sword: ["espada", "arma", "armas", "ataque", "dano"],
  shield: ["escudo", "defesa", "armadura", "protecao"],
  heart: ["vida", "cura", "saude", "hp", "coracao"],
  flame: ["fogo", "chama", "incendio"],
  fire: ["fogo", "chama", "incendio"],
  dragon: ["dragao", "draconico"],
  skull: ["caveira", "cranio", "morte"],
  ghost: ["fantasma", "espirito"],
  leaf: ["folha", "planta", "natureza"],
  tree: ["arvore", "floresta"],
  potion: ["pocao", "frasco", "alquimia"],
  flask: ["pocao", "frasco", "alquimia"],
  vial: ["pocao", "frasco", "alquimia"],
  gem: ["gema", "cristal", "mineral"],
  crystal: ["cristal", "gema"],
  bow: ["arco", "flecha", "arqueiro"],
  arrow: ["flecha", "projetil"],
  book: ["livro", "grimorio", "magia"],
  moon: ["lua", "noite"],
  star: ["estrela", "espaco", "astral"],
  sun: ["sol", "luz", "dia"],
  map: ["mapa", "exploracao"],
  chest: ["bau", "tesouro", "loot"],
  coin: ["moeda", "ouro", "dinheiro"],
  wolf: ["lobo", "fera"],
  spider: ["aranha", "inseto"],
  snake: ["cobra", "serpente"],
  bee: ["abelha", "inseto"],
  flower: ["flor", "planta"],
  water: ["agua", "gota"],
  droplet: ["agua", "gota"],
  wind: ["vento", "ar"],
  lightning: ["raio", "relampago", "eletricidade"],
  castle: ["castelo", "fortaleza"],
  mountain: ["montanha", "pedra"],
  food: ["comida", "alimento", "cozinha"],
  fish: ["peixe", "pesca"],
  bug: ["inseto", "criatura", "mob"]
};

function normalizeIconSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function iconSearchText(name) {
  const normalizedName = normalizeIconSearch(name.replace(/-/g, " "));
  const aliases = Object.entries(ICON_SEARCH_ALIASES)
    .filter(([key]) => normalizedName.includes(key))
    .flatMap(([, values]) => values);
  return normalizeIconSearch(`${normalizedName} ${iconCategory(name)} ${aliases.join(" ")}`);
}

function iconMatchesSearch(name, query) {
  if (!query) return true;
  const searchable = iconSearchText(name);
  return query.split(" ").every(term => searchable.includes(term));
}

const ICONIFY_IMAGE_HOSTS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com"
];

function iconifyImageURL(prefix, name, color = "#B9A0FF", hostIndex = 0) {
  const safePrefix = /^[a-z0-9-]+$/i.test(prefix) ? prefix : "game-icons";
  const safeName = /^[a-z0-9-]+$/i.test(name) ? name : "unknown";
  const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#B9A0FF";
  const host = ICONIFY_IMAGE_HOSTS[Math.max(0, Math.min(ICONIFY_IMAGE_HOSTS.length - 1, hostIndex))];
  return `${host}/${encodeURIComponent(safePrefix)}/${encodeURIComponent(safeName)}.svg?color=${encodeURIComponent(safeColor)}`;
}

function wireIconifyImageFallbacks(root) {
  if (!root) return;
  const images = [];
  if (root instanceof HTMLImageElement && root.matches("[data-iconify-prefix][data-iconify-name]")) {
    images.push(root);
  }
  if (root.querySelectorAll) {
    images.push(...root.querySelectorAll("img[data-iconify-prefix][data-iconify-name]"));
  }

  images.forEach(image => {
    if (image.dataset.iconifyFallbackBound === "true") return;
    image.dataset.iconifyFallbackBound = "true";
    image.dataset.iconifyHostIndex = image.dataset.iconifyHostIndex || "0";

    image.addEventListener("error", () => {
      const prefix = image.dataset.iconifyPrefix;
      const name = image.dataset.iconifyName;
      const color = image.dataset.iconifyColor || "#B9A0FF";
      const currentHost = Number(image.dataset.iconifyHostIndex || "0");

      if (currentHost + 1 < ICONIFY_IMAGE_HOSTS.length) {
        image.dataset.iconifyHostIndex = String(currentHost + 1);
        image.src = iconifyImageURL(prefix, name, color, currentHost + 1);
        return;
      }

      const fallback = document.createElement("span");
      fallback.className = "iconify-icon-fallback";
      fallback.textContent = "◇";
      fallback.title = `${name.replace(/-/g, " ")} (icon could not be loaded)`;
      fallback.setAttribute("aria-label", fallback.title);
      image.replaceWith(fallback);
    });
  });
}

function setupExpandedIconPicker() {
  const host = $("icon-picker");
  const search = $("icon-search");
  const field = $("f-icon");
  const existingSection = $("existing-icon-section");

  if (!host || !search || !field || !existingSection) return;

  search.placeholder = "Search by name or concept: sword, dragon, cura…";
  search.setAttribute("aria-label", "Search the icon library");

  const controls = document.createElement("div");
  controls.className = "enhancement-icon-toolbar";
  controls.innerHTML = `
    <div class="enhancement-icon-tabs" role="tablist" aria-label="Icon collection">
      <button type="button" class="active" data-icon-library="lucide" role="tab" aria-selected="true">Lucide</button>
      <button type="button" data-icon-library="lab" role="tab" aria-selected="false">Lucide Lab</button>
      <button type="button" data-icon-library="rpg" role="tab" aria-selected="false">Game Icons (RPG)</button>
      <button type="button" class="enhancement-icon-expand" data-expand-icon-picker aria-expanded="false">Expand selector</button>
    </div>
    <p class="enhancement-icon-caption" id="enhancement-icon-caption"></p>
  `;

  host.insertAdjacentElement("beforebegin", controls);

  let library = "lucide";
  let searchRequest = 0;
  let searchTimer = null;
  let lucideVisibleLimit = 180;
  let lastLucideQuery = null;
  let iconifyVisibleLimit = 180;
  let lastIconifyQuery = null;
  const iconifyCatalogs = new Map();
  let pickerBackdrop = null;

  function setCaption(text) {
    const caption = $("enhancement-icon-caption");
    if (caption) caption.textContent = text;
  }

  function renderLucide() {
    const query = normalizeIconSearch(search.value);
    if (query !== lastLucideQuery) {
      lastLucideQuery = query;
      lucideVisibleLimit = query ? 240 : 180;
    }
    const allNames = getLucideNames();
    const matches = allNames.filter(name => iconMatchesSearch(name, query));
    const visible = matches.slice(0, lucideVisibleLimit);
    const groups = new Map();

    visible.forEach(name => {
      const category = iconCategory(name);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(name);
    });

    host.innerHTML = [...groups.entries()].map(([category, names]) => `
      <div class="icon-group enhancement-icon-group">
        <strong>${escapeHTML(category)}</strong>
        <div class="icon-group-grid">
          ${names.map(name => `
            <button type="button"
              class="icon-choice ${field.value === `lucide:${name}` ? "selected" : ""}"
              data-enhanced-icon="lucide:${escapeHTML(name)}"
              title="${escapeHTML(name)}"
              aria-label="${escapeHTML(name)}">
              <i data-lucide="${escapeHTML(name)}"></i>
              <small>${escapeHTML(name)}</small>
            </button>
          `).join("")}
        </div>
      </div>
    `).join("") || '<p class="muted">No icons found.</p>';

    if (matches.length > visible.length) {
      host.insertAdjacentHTML("beforeend", `
        <div class="enhancement-icon-load-more">
          <p class="enhancement-icon-limit">Showing ${visible.length.toLocaleString()} of ${matches.length.toLocaleString()} matches.</p>
          <button type="button" data-load-more-lucide>Load 240 more</button>
          <button type="button" data-show-all-lucide>Show all ${matches.length.toLocaleString()}</button>
        </div>
      `);
      host.querySelector("[data-load-more-lucide]")?.addEventListener("click", () => {
        const scrollTop = host.scrollTop;
        lucideVisibleLimit = Math.min(matches.length, lucideVisibleLimit + 240);
        renderLucide();
        host.scrollTop = scrollTop;
      });
      host.querySelector("[data-show-all-lucide]")?.addEventListener("click", () => {
        const scrollTop = host.scrollTop;
        lucideVisibleLimit = matches.length;
        renderLucide();
        host.scrollTop = scrollTop;
      });
    }

    setCaption(`${allNames.length.toLocaleString()} Lucide icons available · ${matches.length.toLocaleString()} matches`);
    window.lucide?.createIcons?.({ root: host });
  }

  async function loadIconifyCatalog(prefix) {
    if (iconifyCatalogs.has(prefix)) return iconifyCatalogs.get(prefix);

    let data = null;
    let lastError = null;

    for (const apiHost of ICONIFY_IMAGE_HOSTS) {
      try {
        const response = await fetch(`${apiHost}/collection?prefix=${encodeURIComponent(prefix)}`);
        if (!response.ok) throw new Error(`${apiHost} returned HTTP ${response.status}.`);
        data = await response.json();
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!data) {
      throw new Error(`Could not load ${prefix} icon names. ${lastError?.message || "Icon service unavailable."}`);
    }

    const categorized = Object.values(data.categories || {}).flat();
    const names = [...new Set([...(data.uncategorized || []), ...categorized])]
      .filter(name => typeof name === "string" && /^[a-z0-9-]+$/i.test(name))
      .sort((a, b) => a.localeCompare(b));
    if (!names.length) throw new Error(`The ${prefix} icon list was empty.`);
    iconifyCatalogs.set(prefix, names);
    return names;
  }

  function renderIconifyResults(prefix, label, matches, totalNames) {
    const query = normalizeIconSearch(search.value);
    if (query !== lastIconifyQuery || prefix !== renderIconifyResults.lastPrefix) {
      lastIconifyQuery = query;
      renderIconifyResults.lastPrefix = prefix;
      iconifyVisibleLimit = query ? 240 : 180;
    }
    const visible = matches.slice(0, iconifyVisibleLimit);
    host.innerHTML = visible.length ? `
      <div class="icon-group enhancement-icon-group">
        <strong>${escapeHTML(label)}</strong>
        <div class="icon-group-grid">
          ${visible.map(name => `
            <button type="button"
              class="icon-choice ${field.value === `iconify:${prefix}:${name}` ? "selected" : ""}"
              data-enhanced-icon="iconify:${prefix}:${escapeHTML(name)}"
              title="${escapeHTML(name)}"
              aria-label="${escapeHTML(name)}">
              <img class="iconify-picker-image"
                data-iconify-prefix="${escapeHTML(prefix)}"
                data-iconify-name="${escapeHTML(name)}"
                data-iconify-color="#B9A0FF"
                data-iconify-host-index="0"
                src="${escapeHTML(iconifyImageURL(prefix, name, "#B9A0FF"))}"
                alt="" loading="lazy">
              <small>${escapeHTML(name.replace(/-/g, " "))}</small>
            </button>
          `).join("")}
        </div>
      </div>
    ` : '<p class="muted">No icons found. Try another word or spelling.</p>';

    wireIconifyImageFallbacks(host);

    if (matches.length > visible.length) {
      host.insertAdjacentHTML("beforeend", `
        <div class="enhancement-icon-load-more">
          <p class="enhancement-icon-limit">Showing ${visible.length.toLocaleString()} of ${matches.length.toLocaleString()} matching icons.</p>
          <button type="button" data-load-more-iconify>Load 240 more</button>
          <button type="button" data-show-all-iconify>Show all ${matches.length.toLocaleString()}</button>
        </div>
      `);
      host.querySelector("[data-load-more-iconify]")?.addEventListener("click", () => {
        const scrollTop = host.scrollTop;
        iconifyVisibleLimit = Math.min(matches.length, iconifyVisibleLimit + 240);
        renderIconifyResults(prefix, label, matches, totalNames);
        host.scrollTop = scrollTop;
      });
      host.querySelector("[data-show-all-iconify]")?.addEventListener("click", () => {
        const scrollTop = host.scrollTop;
        iconifyVisibleLimit = matches.length;
        renderIconifyResults(prefix, label, matches, totalNames);
        host.scrollTop = scrollTop;
      });
    }

    setCaption(`${totalNames.toLocaleString()} ${label} icons available · ${matches.length.toLocaleString()} matches`);
  }

  async function searchGameIcons() {
    const prefix = library === "lab" ? "lucide-lab" : "game-icons";
    const label = library === "lab" ? "Lucide Lab" : "Game Icons (RPG)";
    const query = normalizeIconSearch(search.value);
    const request = ++searchRequest;

    host.innerHTML = `<p class="muted">Loading ${escapeHTML(label)}…</p>`;
    setCaption("Loading the icon catalog");

    try {
      const names = await loadIconifyCatalog(prefix);
      if (request !== searchRequest) return;
      const matches = names.filter(name => iconMatchesSearch(name, query));
      renderIconifyResults(prefix, label, matches, names.length);
    } catch (error) {
      if (request !== searchRequest) return;
      host.innerHTML = `<p class="muted">Could not load ${escapeHTML(label)}. Check your connection and try again.</p>`;
      setCaption("Lucide icons remain available through the loaded library.");
    }
  }

  function render() {
    if (library === "lucide") {
      searchRequest++;
      renderLucide();
      return;
    }

    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchGameIcons, 180);
  }

  controls.addEventListener("click", event => {
    const button = event.target.closest("[data-icon-library]");
    if (!button) return;

    library = button.dataset.iconLibrary;
    controls.querySelectorAll("[data-icon-library]").forEach(tab => {
      const active = tab === button;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    render();
  });

  const expandButton = controls.querySelector("[data-expand-icon-picker]");

  function setPickerExpanded(expanded) {
    if (expanded && !pickerBackdrop) {
      pickerBackdrop = document.createElement("div");
      pickerBackdrop.className = "icon-picker-fullscreen-backdrop";
      pickerBackdrop.setAttribute("aria-hidden", "true");
      pickerBackdrop.addEventListener("click", () => setPickerExpanded(false));
      document.body.append(pickerBackdrop);
    }

    existingSection.classList.toggle("icon-picker-expanded", expanded);
    if (expandButton) {
      expandButton.setAttribute("aria-expanded", String(expanded));
      expandButton.textContent = expanded ? "Close selector" : "Expand selector";
    }

    if (expanded) {
      existingSection.setAttribute("role", "dialog");
      existingSection.setAttribute("aria-modal", "true");
      search.focus();
    } else {
      existingSection.removeAttribute("role");
      existingSection.removeAttribute("aria-modal");
      pickerBackdrop?.remove();
      pickerBackdrop = null;
    }
  }

  expandButton?.addEventListener("click", () => {
    setPickerExpanded(!existingSection.classList.contains("icon-picker-expanded"));
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && existingSection.classList.contains("icon-picker-expanded")) {
      setPickerExpanded(false);
    }
  });
  $("icon-mode")?.addEventListener("change", event => {
    if (event.target.value !== "existing") setPickerExpanded(false);
  });

  // Capture the selection before the original 100-icon picker handles the click.
  host.addEventListener("click", event => {
    const button = event.target.closest("[data-enhanced-icon]");
    if (!button) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    field.value = button.dataset.enhancedIcon;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    setPickerExpanded(false);
    render();
  }, true);

  search.addEventListener("input", render);

  field.addEventListener("input", () => {
    if (library === "lucide") renderLucide();
    else {
      host.querySelectorAll("[data-enhanced-icon]").forEach(button => {
        button.classList.toggle("selected", button.dataset.enhancedIcon === field.value);
      });
    }
  });

  // Render only new Game Icons spans instead of rescanning the whole document
  // after every unrelated DOM mutation.
  function renderGameIconsWithin(root) {
    const candidates = [];
    if (root instanceof Element && root.matches(".custom-icon:not([data-iconify-rendered])")) {
      candidates.push(root);
    }
    if (root.querySelectorAll) {
      candidates.push(...root.querySelectorAll(".custom-icon:not([data-iconify-rendered])"));
    }

    candidates.forEach(span => {
      const value = span.textContent.trim();
      const match = value.match(/^iconify:(game-icons|lucide-lab):([a-z0-9-]+)$/i);
      if (!match) return;

      const colorMatch = span.getAttribute("style")?.match(/color:\s*(#[0-9a-f]{6})/i);
      const color = colorMatch?.[1] || "#B9A0FF";
      const image = document.createElement("img");
      image.alt = "";
      image.className = "game-icon-image";
      image.dataset.iconifyPrefix = match[1].toLowerCase();
      image.dataset.iconifyName = match[2].toLowerCase();
      image.dataset.iconifyColor = color;
      image.dataset.iconifyHostIndex = "0";
      image.src = iconifyImageURL(match[1], match[2], color);

      span.dataset.iconifyRendered = "true";
      span.textContent = "";
      span.append(image);
      wireIconifyImageFallbacks(image);
    });
  }

  renderGameIconsWithin(document);
  wireIconifyImageFallbacks(document);
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          renderGameIconsWithin(node);
          wireIconifyImageFallbacks(node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  render();
}

function addEnhancementStyles() {
  if ($("enhancement-styles")) return;

  const style = document.createElement("style");
  style.id = "enhancement-styles";
  style.textContent = `
    .header-tools { position: relative; }
    #project-manage[aria-expanded="true"] { border-color: var(--accent, #B9A0FF); }
    .projects-dropdown {
      position: absolute; z-index: 1000; top: calc(100% + 8px); right: 0;
      width: min(290px, calc(100vw - 28px)); padding: 10px;
      background: var(--panel, #191922); color: var(--text, #f4f4f7);
      border: 1px solid var(--border, #343442); border-radius: 14px;
      box-shadow: 0 18px 50px #0005;
    }
    .projects-dropdown-heading { padding: 8px 10px 4px; font-size: 11px; letter-spacing: .12em; color: var(--muted, #aaa); font-weight: 700; }
    .projects-dropdown-current { padding: 4px 10px 12px; font-weight: 700; overflow-wrap: anywhere; }
    .projects-dropdown button { display: block; width: 100%; text-align: left; padding: 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
    .projects-dropdown button:hover { background: var(--hover, #292936); }
    .projects-dropdown .menu-danger { color: #ff8d97; }
    .projects-dropdown-divider { height: 1px; background: var(--border, #343442); margin: 7px 0; }
    .enhancement-modal-overlay { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 18px; background: #080810aa; backdrop-filter: blur(4px); }
    .enhancement-modal { position: relative; width: min(500px, 100%); max-height: min(85vh, 760px); overflow: auto; padding: 26px; border: 1px solid var(--border, #343442); border-radius: 18px; background: var(--panel, #191922); color: var(--text, #f4f4f7); box-shadow: 0 24px 80px #0007; }
    .enhancement-modal h2 { margin: 0 36px 10px 0; font-size: 1.35rem; }
    .enhancement-modal-description { margin: 0 0 18px; color: var(--muted, #aaa); line-height: 1.55; }
    .enhancement-modal-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border: 0; border-radius: 9px; background: transparent; color: inherit; font-size: 26px; cursor: pointer; }
    .enhancement-modal-close:hover { background: var(--hover, #292936); }
    .enhancement-modal-body { margin: 12px 0 20px; }
    .enhancement-modal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
    .enhancement-modal-actions button { min-height: 40px; }
    .enhancement-field-label { display: block; margin-bottom: 8px; font-weight: 650; }
    .enhancement-text-input { width: 100%; padding: 12px; border: 1px solid var(--border, #343442); border-radius: 10px; background: var(--bg, #111119); color: inherit; }
    .enhancement-choice-list { display: grid; gap: 10px; }
    .enhancement-choice { padding: 13px; border: 1px solid var(--border, #343442); border-radius: 12px; }
    .enhancement-choice p { margin: 5px 0 0; color: var(--muted, #aaa); line-height: 1.45; }
    .enhancement-toast { position: fixed; z-index: 3000; left: 50%; bottom: 22px; transform: translate(-50%, 12px); max-width: calc(100vw - 28px); padding: 12px 16px; border-radius: 12px; background: #242430; color: #fff; box-shadow: 0 8px 32px #0005; opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; }
    .enhancement-toast.visible { opacity: 1; transform: translate(-50%, 0); }
    .enhancement-toast[data-type="error"] { background: #702e3b; }
    .trash-items { display: grid; gap: 8px; }
    .trash-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border, #343442); }
    .trash-item strong, .trash-item small { display: block; overflow-wrap: anywhere; }
    .trash-item small { margin-top: 3px; color: var(--muted, #aaa); }
    .enhancement-icon-toolbar { margin: 10px 0; }
    .enhancement-icon-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .enhancement-icon-tabs button { padding: 8px 13px; border: 1px solid var(--border, #343442); border-radius: 9px; background: transparent; color: inherit; cursor: pointer; }
    .enhancement-icon-tabs button.active { border-color: var(--accent, #B9A0FF); background: color-mix(in srgb, var(--accent, #B9A0FF) 15%, transparent); }
    .enhancement-icon-caption, .enhancement-icon-limit { margin: 8px 0; color: var(--muted, #aaa); font-size: 12px; }
    .enhancement-icon-group { margin-bottom: 18px; }
    .enhancement-icon-group .icon-group-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); }
    .enhancement-icon-group .icon-choice { min-width: 0; overflow: hidden; }
    .enhancement-icon-group .icon-choice img { width: 23px; height: 23px; object-fit: contain; }
    .enhancement-icon-group .icon-choice .iconify-icon-fallback { display: grid; place-items: center; width: 23px; height: 23px; font-size: 22px; line-height: 1; opacity: .8; }
    .game-icon-image { display: inline-block; width: 1.1em; height: 1.1em; vertical-align: middle; object-fit: contain; }
    .custom-icon img { width: 1em; height: 1em; object-fit: contain; vertical-align: -0.12em; }
    .custom-icon .iconify-icon-fallback { display: inline-grid; place-items: center; width: 1.1em; height: 1.1em; vertical-align: middle; font-size: 1em; line-height: 1; }
    .enhancement-icon-tabs { align-items: center; }
    .enhancement-icon-tabs .enhancement-icon-expand { margin-left: auto; }
    .enhancement-icon-load-more { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; padding: 14px 8px; margin: 10px 0; border-top: 1px solid var(--border, #343442); }
    .enhancement-icon-load-more .enhancement-icon-limit { flex: 1 1 100%; text-align: center; }
    .enhancement-icon-load-more button { padding: 9px 12px; border: 1px solid var(--border, #343442); border-radius: 9px; background: var(--panel, #191922); color: var(--text, #f4f4f7); cursor: pointer; }
    .enhancement-icon-load-more button:hover { border-color: var(--accent, #B9A0FF); color: var(--accent, #B9A0FF); }
    .icon-picker-fullscreen-backdrop { position: fixed; inset: 0; z-index: 2400; background: rgba(5,5,8,.76); backdrop-filter: blur(3px); }
    #existing-icon-section.icon-picker-expanded { position: fixed !important; inset: 12px; z-index: 2401; display: flex !important; flex-direction: column; gap: 10px; width: auto; max-width: none; margin: 0; padding: 17px; border: 1px solid var(--border, #343442); border-radius: 14px; background: var(--panel, #191922); box-shadow: 0 24px 80px rgba(0,0,0,.55); overflow: hidden; }
    #existing-icon-section.icon-picker-expanded > label { flex: 0 0 auto; }
    #existing-icon-section.icon-picker-expanded #icon-search { width: 100%; max-width: none; flex: 0 0 auto; }
    #existing-icon-section.icon-picker-expanded .enhancement-icon-toolbar { flex: 0 0 auto; }
    #existing-icon-section.icon-picker-expanded #icon-picker { display: block; flex: 1; min-height: 0; max-height: none; overflow: auto; }
    @media (max-width: 600px) {
      .enhancement-modal { padding: 22px 17px; }
      .enhancement-modal-actions { justify-content: stretch; }
      .enhancement-modal-actions button { flex: 1 1 auto; }
      .projects-dropdown { right: -4px; }
      #existing-icon-section.icon-picker-expanded { inset: 5px; padding: 10px; border-radius: 11px; }
      .enhancement-icon-tabs .enhancement-icon-expand { margin-left: 0; flex: 1 1 100%; }
    }
  `;

  document.head.append(style);
}

addEnhancementStyles();
setupProjects();
setupExpandedIconPicker();
