
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

const ICONIFY_API_HOSTS = [
  "https://api.iconify.design",
  "https://api.simplesvg.com",
  "https://api.unisvg.com"
];

const iconifyCatalogs = new Map();
const iconifyDefinitionCache = new Map();
const iconifyPendingTargets = new Set();
let iconifyFlushScheduled = false;
let iconifyIntersectionObserver = null;

function isSafeIconifyToken(value) {
  return /^[a-z0-9-]+$/i.test(String(value || ""));
}

async function loadIconifyCatalog(prefix) {
  if (!isSafeIconifyToken(prefix)) throw new Error("Invalid icon collection.");
  if (iconifyCatalogs.has(prefix)) return iconifyCatalogs.get(prefix);

  let lastError = null;
  for (const apiHost of ICONIFY_API_HOSTS) {
    try {
      const response = await fetch(`${apiHost}/collection?prefix=${encodeURIComponent(prefix)}`, { cache: "force-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const categorized = Object.values(data.categories || {}).flat();
      const names = [...new Set([...(data.uncategorized || []), ...categorized])]
        .filter(name => typeof name === "string" && isSafeIconifyToken(name))
        .sort((a, b) => a.localeCompare(b));
      if (!names.length) throw new Error(`The ${prefix} collection returned no icon names.`);
      iconifyCatalogs.set(prefix, names);
      return names;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not load ${prefix} catalog. ${lastError?.message || "Icon service unavailable."}`);
}

function scheduleIconifyFlush() {
  if (iconifyFlushScheduled) return;
  iconifyFlushScheduled = true;
  setTimeout(() => {
    iconifyFlushScheduled = false;
    flushIconifyTargets().catch(error => console.warn("Iconify rendering failed:", error));
  }, 0);
}

function scanIconifyTargets(root) {
  if (!root) return;
  const targets = [];
  if (root instanceof Element && root.matches(".iconify-inline[data-iconify-prefix][data-iconify-name]")) {
    targets.push(root);
  }
  if (root.querySelectorAll) {
    targets.push(...root.querySelectorAll(".iconify-inline[data-iconify-prefix][data-iconify-name]"));
  }

  targets.forEach(target => {
    if (target.dataset.iconifyLoaded === "true" || target.dataset.iconifyFailed === "true" || target.dataset.iconifyQueued) return;
    if (iconifyIntersectionObserver) iconifyIntersectionObserver.observe(target);
    else queueIconifyTarget(target);
  });
}

function queueIconifyTarget(target) {
  if (!target?.isConnected || target.dataset.iconifyLoaded === "true" || target.dataset.iconifyFailed === "true") return;
  target.dataset.iconifyQueued = "true";
  iconifyPendingTargets.add(target);
  scheduleIconifyFlush();
}

function buildRecoloredSVG(body, width = 24, height = 24, left = 0, top = 0) {
  const safeNumber = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  width = safeNumber(width, 24);
  height = safeNumber(height, 24);
  left = Number.isFinite(Number(left)) ? Number(left) : 0;
  top = Number.isFinite(Number(top)) ? Number(top) : 0;

  const parsed = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}">${body}</svg>`,
    "image/svg+xml"
  );
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName.toLowerCase() !== "svg") return null;
  const svg = parsed.documentElement;
  const forbidden = new Set(["script", "style", "foreignobject", "iframe", "object", "embed", "image"]);
  const elements = [svg, ...svg.querySelectorAll("*")];

  for (const element of elements) {
    if (forbidden.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((name === "href" || name.endsWith(":href")) && value && !value.startsWith("#")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style") {
        if (/url\s*\(\s*(?!#)|expression\s*\(|@import/i.test(value)) {
          element.removeAttribute(attribute.name);
          continue;
        }
        const rewritten = value.split(";").map(rule => {
          const colon = rule.indexOf(":");
          if (colon < 0) return rule.trim();
          const property = rule.slice(0, colon).trim().toLowerCase();
          const current = rule.slice(colon + 1).trim();
          if ((property === "fill" || property === "stroke") && current && !/^(none|transparent)$/i.test(current) && !/^url\(\s*#/i.test(current)) {
            return `${property}:currentColor`;
          }
          return `${property}:${current}`;
        }).filter(Boolean).join(";");
        element.setAttribute("style", rewritten);
        continue;
      }
      if (name === "fill" || name === "stroke") {
        if (value && !/^(none|transparent)$/i.test(value) && !/^url\(\s*#/i.test(value)) {
          element.setAttribute(attribute.name, "currentColor");
        }
      }
    }
  }

  svg.setAttribute("width", "1em");
  svg.setAttribute("height", "1em");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("iconify-rendered-svg");
  return document.importNode(svg, true);
}

async function fetchIconifyDefinitions(prefix, names) {
  const missing = names.filter(name => !iconifyDefinitionCache.has(`${prefix}:${name}`));
  if (!missing.length) return;

  const chunks = [];
  for (let index = 0; index < missing.length; index += 40) chunks.push(missing.slice(index, index + 40));

  for (const chunk of chunks) {
    let data = null;
    let lastError = null;
    for (const apiHost of ICONIFY_API_HOSTS) {
      try {
        const iconQuery = chunk.map(name => encodeURIComponent(name)).join(",");
        const response = await fetch(`${apiHost}/${encodeURIComponent(prefix)}.json?icons=${iconQuery}`, { cache: "force-cache" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (!result || !result.icons || typeof result.icons !== "object") throw new Error("Invalid Iconify JSON response");
        data = result.icons;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    for (const name of chunk) {
      const key = `${prefix}:${name}`;
      const definition = data?.[name];
      if (definition && typeof definition.body === "string") {
        iconifyDefinitionCache.set(key, definition);
      } else {
        iconifyDefinitionCache.set(key, null);
      }
    }

    if (!data && lastError) {
      console.warn(`Iconify could not load ${prefix} icons:`, lastError);
    }
  }
}

async function loadSingleIconifySVG(prefix, name) {
  for (const apiHost of ICONIFY_API_HOSTS) {
    try {
      const response = await fetch(`${apiHost}/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`, { cache: "force-cache" });
      if (!response.ok) continue;
      const text = await response.text();
      const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
      const svg = parsed.documentElement;
      if (parsed.querySelector("parsererror") || svg.localName.toLowerCase() !== "svg") continue;
      const viewBox = (svg.getAttribute("viewBox") || "0 0 24 24").trim().split(/[\s,]+/).map(Number);
      if (viewBox.length !== 4 || !viewBox.every(Number.isFinite)) continue;
      const clean = buildRecoloredSVG(svg.innerHTML, viewBox[2], viewBox[3], viewBox[0], viewBox[1]);
      if (clean) return clean;
    } catch {}
  }
  return null;
}

async function flushIconifyTargets() {
  const activeTargets = [...iconifyPendingTargets].filter(target => target.isConnected);
  iconifyPendingTargets.clear();
  activeTargets.forEach(target => { target.dataset.iconifyQueued = "loading"; });
  const groups = new Map();
  activeTargets.forEach(target => {
    const prefix = target.dataset.iconifyPrefix;
    const name = target.dataset.iconifyName;
    if (!isSafeIconifyToken(prefix) || !isSafeIconifyToken(name)) {
      target.dataset.iconifyFailed = "true";
      delete target.dataset.iconifyQueued;
      target.textContent = "◇";
      target.title = "Invalid icon reference";
      return;
    }
    if (!groups.has(prefix)) groups.set(prefix, new Map());
    const group = groups.get(prefix);
    if (!group.has(name)) group.set(name, []);
    group.get(name).push(target);
  });

  for (const [prefix, nameTargets] of groups) {
    const names = [...nameTargets.keys()];
    await fetchIconifyDefinitions(prefix, names);

    for (const name of names) {
      const targets = nameTargets.get(name).filter(target => target.isConnected);
      const definition = iconifyDefinitionCache.get(`${prefix}:${name}`);
      let svg = definition
        ? buildRecoloredSVG(definition.body, definition.width, definition.height, definition.left, definition.top)
        : null;

      if (!svg) svg = await loadSingleIconifySVG(prefix, name);

      targets.forEach(target => {
        target.replaceChildren();
        if (svg) {
          target.append(document.importNode(svg, true));
          target.dataset.iconifyLoaded = "true";
          delete target.dataset.iconifyFailed;
          delete target.dataset.iconifyQueued;
          target.removeAttribute("title");
        } else {
          const fallback = document.createElement("span");
          fallback.className = "iconify-placeholder iconify-placeholder-error";
          fallback.textContent = "◇";
          target.append(fallback);
          target.dataset.iconifyFailed = "true";
          delete target.dataset.iconifyQueued;
          target.title = `Icon not found by Iconify: ${prefix}:${name}`;
          target.setAttribute("aria-label", `Icon not found: ${name.replace(/-/g, " ")}`);
        }
      });
    }
  }
}

if ("IntersectionObserver" in window) {
  iconifyIntersectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      iconifyIntersectionObserver.unobserve(entry.target);
      queueIconifyTarget(entry.target);
    });
  }, { rootMargin: "320px 0px" });
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
  let showAllWhenExpanded = false;
  let pickerBackdrop = null;
  let labNames = [];
  let labCatalogPromise = null;

  function setCaption(text) {
    const caption = $("enhancement-icon-caption");
    if (caption) caption.textContent = text;
  }

  function ensureLabCatalog() {
    if (!labCatalogPromise) {
      labCatalogPromise = loadIconifyCatalog("lucide-lab").then(names => {
        labNames = names;
        if (library === "lucide") renderLucide();
        return names;
      }).catch(error => {
        console.warn("Lucide Lab catalog unavailable; the main Lucide set remains available.", error);
        return [];
      });
    }
    return labCatalogPromise;
  }

  function renderLucide() {
    const query = normalizeIconSearch(search.value);
    if (query !== lastLucideQuery) {
      lastLucideQuery = query;
      lucideVisibleLimit = query ? 240 : 180;
    }

    const coreNames = getLucideNames();
    const coreSet = new Set(coreNames);
    const items = [
      ...coreNames.map(name => ({ name, id: `lucide:${name}`, prefix: "lucide", category: iconCategory(name) })),
      ...labNames.filter(name => !coreSet.has(name)).map(name => ({ name, id: `iconify:lucide-lab:${name}`, prefix: "lucide-lab", category: iconCategory(name) }))
    ].filter(item => iconMatchesSearch(item.name, query));
    items.sort((a, b) => a.name.localeCompare(b.name) || a.prefix.localeCompare(b.prefix));

    const visible = showAllWhenExpanded ? items : items.slice(0, lucideVisibleLimit);
    const groups = new Map();
    visible.forEach(item => {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    });

    host.innerHTML = [...groups.entries()].map(([category, groupItems]) => `
      <div class="icon-group enhancement-icon-group">
        <strong>${escapeHTML(category)}</strong>
        <div class="icon-group-grid">
          ${groupItems.map(item => {
            const visual = item.prefix === "lucide"
              ? `<i data-lucide="${escapeHTML(item.name)}"></i>`
              : `<span class="iconify-inline iconify-picker-icon" data-iconify-prefix="${escapeHTML(item.prefix)}" data-iconify-name="${escapeHTML(item.name)}" aria-hidden="true"><span class="iconify-placeholder">◇</span></span>`;
            return `
              <button type="button"
                class="icon-choice ${field.value === item.id ? "selected" : ""}"
                data-enhanced-icon="${escapeHTML(item.id)}"
                title="${escapeHTML(item.name)}"
                aria-label="${escapeHTML(item.name)}">
                ${visual}
                <small>${escapeHTML(item.name.replace(/-/g, " "))}</small>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    `).join("") || '<p class="muted">No icons found.</p>';

    if (!showAllWhenExpanded && items.length > visible.length) {
      host.insertAdjacentHTML("beforeend", `
        <div class="enhancement-icon-load-more">
          <p class="enhancement-icon-limit">Showing ${visible.length.toLocaleString()} of ${items.length.toLocaleString()} matches.</p>
          <button type="button" data-load-more-lucide>Load 240 more</button>
          <button type="button" data-show-all-lucide>Show all ${items.length.toLocaleString()}</button>
        </div>
      `);
      host.querySelector("[data-load-more-lucide]")?.addEventListener("click", () => {
        const scrollTop = host.scrollTop;
        lucideVisibleLimit = Math.min(items.length, lucideVisibleLimit + 240);
        renderLucide();
        host.scrollTop = scrollTop;
      });
      host.querySelector("[data-show-all-lucide]")?.addEventListener("click", () => {
        const scrollTop = host.scrollTop;
        lucideVisibleLimit = items.length;
        renderLucide();
        host.scrollTop = scrollTop;
      });
    }

    setCaption(`${coreNames.length.toLocaleString()} Lucide icons + ${labNames.length.toLocaleString()} Lab icons · ${items.length.toLocaleString()} matches`);
    window.lucide?.createIcons?.({ root: host });
    scanIconifyTargets(host);

    if (!labCatalogPromise) ensureLabCatalog();
  }

  function renderIconifyResults(prefix, label, matches, totalNames) {
    const query = normalizeIconSearch(search.value);
    if (query !== lastIconifyQuery || prefix !== renderIconifyResults.lastPrefix) {
      lastIconifyQuery = query;
      renderIconifyResults.lastPrefix = prefix;
      iconifyVisibleLimit = query ? 240 : 180;
    }

    const visible = showAllWhenExpanded ? matches : matches.slice(0, iconifyVisibleLimit);
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
              <span class="iconify-inline iconify-picker-icon" data-iconify-prefix="${escapeHTML(prefix)}" data-iconify-name="${escapeHTML(name)}" aria-hidden="true"><span class="iconify-placeholder">◇</span></span>
              <small>${escapeHTML(name.replace(/-/g, " "))}</small>
            </button>
          `).join("")}
        </div>
      </div>
    ` : '<p class="muted">No icons found. Try another word or spelling.</p>';

    if (!showAllWhenExpanded && matches.length > visible.length) {
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

    setCaption(`${totalNames.toLocaleString()} ${label} icons · ${matches.length.toLocaleString()} matches`);
    scanIconifyTargets(host);
  }

  async function searchGameIcons() {
    const prefix = "game-icons";
    const label = "Game Icons (RPG)";
    const query = normalizeIconSearch(search.value);
    const request = ++searchRequest;

    host.innerHTML = '<p class="muted">Loading RPG icon catalog…</p>';
    setCaption("Loading icon names, then loading drawings as they come into view");

    try {
      const names = await loadIconifyCatalog(prefix);
      if (request !== searchRequest || library !== "rpg") return;
      const matches = names.filter(name => iconMatchesSearch(name, query));
      renderIconifyResults(prefix, label, matches, names.length);
    } catch (error) {
      if (request !== searchRequest) return;
      host.innerHTML = '<p class="muted">Could not load the RPG icon catalog. Check your connection and try again.</p>';
      setCaption("Lucide and Lucide Lab are still available.");
      console.warn("RPG icon catalog error:", error);
    }
  }

  function render() {
    if (library === "lucide") {
      searchRequest++;
      renderLucide();
      return;
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchGameIcons, 120);
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
    showAllWhenExpanded = expanded;
    if (expandButton) {
      expandButton.setAttribute("aria-expanded", String(expanded));
      expandButton.textContent = expanded ? "Close selector" : "Expand selector";
    }

    if (expanded) {
      existingSection.setAttribute("role", "dialog");
      existingSection.setAttribute("aria-modal", "true");
      // Expanding is equivalent to choosing "Show all" for the active collection.
      render();
      search.focus();
    } else {
      existingSection.removeAttribute("role");
      existingSection.removeAttribute("aria-modal");
      pickerBackdrop?.remove();
      pickerBackdrop = null;
      render();
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

  host.addEventListener("click", event => {
    const button = event.target.closest("[data-enhanced-icon]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    field.value = button.dataset.enhancedIcon;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    setPickerExpanded(false);
  }, true);

  search.addEventListener("input", render);
  field.addEventListener("input", () => {
    host.querySelectorAll("[data-enhanced-icon]").forEach(button => {
      button.classList.toggle("selected", button.dataset.enhancedIcon === field.value);
    });
  });

  // Convert IDs already saved as literal text by the original icon renderer into inline SVG placeholders.
  function renderSavedIconifyReferences(root) {
    const candidates = [];
    if (root instanceof Element && root.matches(".custom-icon:not([data-iconify-rendered])")) candidates.push(root);
    if (root.querySelectorAll) candidates.push(...root.querySelectorAll(".custom-icon:not([data-iconify-rendered])"));

    candidates.forEach(span => {
      const value = span.textContent.trim();
      const match = value.match(/^iconify:([a-z0-9-]+):([a-z0-9-]+)$/i);
      if (!match) return;
      const prefix = match[1].toLowerCase();
      const name = match[2].toLowerCase();
      span.dataset.iconifyRendered = "true";
      span.replaceChildren();
      const icon = document.createElement("span");
      icon.className = "iconify-inline iconify-record-icon";
      icon.dataset.iconifyPrefix = prefix;
      icon.dataset.iconifyName = name;
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = '<span class="iconify-placeholder">◇</span>';
      span.append(icon);
      scanIconifyTargets(icon);
    });
  }

  renderSavedIconifyReferences(document);
  scanIconifyTargets(document);
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        renderSavedIconifyReferences(node);
        scanIconifyTargets(node);
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
    .iconify-inline { display: inline-flex; align-items: center; justify-content: center; width: 1.1em; height: 1.1em; vertical-align: -0.12em; color: inherit; flex: 0 0 auto; }
    .iconify-inline svg, .iconify-rendered-svg { display: block; width: 100%; height: 100%; overflow: visible; fill: currentColor; color: inherit; }
    .enhancement-icon-group .iconify-picker-icon { width: 24px; height: 24px; color: var(--accent, #B9A0FF); }
    .iconify-placeholder { display: inline-grid; place-items: center; width: 100%; height: 100%; font-size: 1em; line-height: 1; opacity: .62; }
    .iconify-placeholder-error { opacity: .9; }
    .custom-icon .iconify-record-icon { width: 1.1em; height: 1.1em; }
    .enhancement-icon-load-more { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 14px 0; }
    .enhancement-icon-load-more p { flex-basis: 100%; }
    .enhancement-icon-load-more button { padding: 8px 12px; border: 1px solid var(--border, #343442); border-radius: 8px; background: var(--panel, #191922); color: inherit; cursor: pointer; }
    .custom-icon .iconify-placeholder-error { color: #ff8d97; }
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
