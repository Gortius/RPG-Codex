"use strict";

export const ICON_GROUPS = {
  Combat: ["swords","sword","shield","shield-check","axe","bow-arrow","crosshair","target","flame","bomb","skull","heart","heart-pulse","zap","footprints","hand","fist","hammer","wand-sparkles","circle-dot"],
  Characters: ["user","users","user-round","ghost","bug","bird","cat","dog","rabbit","rat","fish","turtle","snail","bot","crown"],
  Crafting: ["gem","diamond","pickaxe","screwdriver","anvil","wrench","settings","flask-conical","beaker","cooking-pot","package","box","layers","component","nut"],
  World: ["map","map-pin","compass","mountain","trees","tree-pine","flower-2","sprout","waves","cloud","sun","moon","star","castle","tent"],
  Magic: ["sparkles","wand","orbit","atom","circle-help","eye","eye-off","moon-star","sun-moon","rainbow","snowflake","wind","droplets","cloud-lightning","infinity"],
  General: ["file-text","book-open","scroll-text","bookmark","flag","key-round","lock-keyhole","unlock-keyhole","door-open","archive","database","folder","folder-open","search","filter","tag","clock","calendar","check-circle","circle-plus"]
};

export const ICONS = Object.entries(ICON_GROUPS).flatMap(([category, names]) => names.map(name => ({ category, name })));

export function iconMarkup(value, fallback = "circle") {
  const raw = String(value || "");
  if (raw.startsWith("lucide:")) {
    const name = raw.slice(7).replace(/[^a-z0-9-]/gi, "") || fallback;
    return `<i data-lucide="${name}" class="vector-icon" aria-hidden="true"></i>`;
  }
  if (!raw) return `<i data-lucide="${fallback}" class="vector-icon" aria-hidden="true"></i>`;
  return raw.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export function paintIcons(root = document) {
  try { if (window.lucide?.createIcons) window.lucide.createIcons({ root }); } catch (error) { console.warn("Icon rendering unavailable", error); }
}

export function mountIconPicker({ $ }) {
  const host = $("icon-picker");
  const search = $("icon-search");
  const field = $("f-icon");
  if (!host || !search || !field) return;
  function render() {
    const q = search.value.trim().toLowerCase();
    const icons = ICONS.filter(icon => !q || icon.name.includes(q) || icon.category.toLowerCase().includes(q));
    const groups = Object.keys(ICON_GROUPS).map(category => {
      const items = icons.filter(icon => icon.category === category);
      if (!items.length) return "";
      return `<div class="icon-group"><strong>${category}</strong><div class="icon-group-grid">${items.map(icon => `<button type="button" class="icon-choice ${field.value === `lucide:${icon.name}` ? "selected" : ""}" data-icon="${icon.name}" title="${icon.category}: ${icon.name}" aria-label="${icon.name}"><i data-lucide="${icon.name}"></i><small>${icon.name}</small></button>`).join("")}</div></div>`;
    }).join("");
    host.innerHTML = groups || '<p class="muted">No icons found.</p>';
    paintIcons(host);
  }
  host.addEventListener("click", event => {
    const button = event.target.closest("[data-icon]");
    if (!button) return;
    field.value = `lucide:${button.dataset.icon}`;
    render();
  });
  search.addEventListener("input", render);
  field.addEventListener("input", render);
  render();
}
