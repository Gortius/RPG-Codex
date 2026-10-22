"use strict";

export const ICON_GROUPS = {
  Combat: ["swords","sword","shield","shield-check","axe","bow-arrow","crosshair","target","flame","bomb","skull","heart","heart-pulse","zap","footprints","hand","fist","hammer","wand-sparkles","circle-dot"],
  Characters: ["user","users","user-round","ghost","bug","bird","cat","dog","rabbit","rat","fish","turtle","snail","bot","crown"],
  Crafting: ["gem","diamond","pickaxe","screwdriver","anvil","wrench","settings","flask-conical","beaker","cooking-pot","package","box","layers","component","nut"],
  World: ["map","map-pin","compass","mountain","trees","tree-pine","flower-2","sprout","waves","cloud","sun","moon","star","castle","tent"],
  Magic: ["sparkles","wand","orbit","atom","circle-help","eye","eye-off","moon-star","sun-moon","rainbow","snowflake","wind","droplets","cloud-lightning","infinity"],
  General: ["file-text","book-open","scroll-text","bookmark","flag","key-round","lock-keyhole","unlock-keyhole","door-open","archive","database","folder","folder-open","search","filter","tag","clock","calendar","check-circle","circle-plus"]
};

export const ICONS = Object.entries(ICON_GROUPS)
  .flatMap(([category, names]) => names.map(name => ({ category, name })));

const DEFAULT_COLOR = "#B9A0FF";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

export function normalizeIconColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : DEFAULT_COLOR;
}

export function iconMarkup(value, fallback = "circle", color = DEFAULT_COLOR) {
  const raw = String(value || "");
  const safeColor = normalizeIconColor(color);
  const style = ` style="color:${safeColor}"`;

  if (raw.startsWith("lucide:")) {
    const name = raw.slice(7).replace(/[^a-z0-9-]/gi, "") || fallback;
    return `<i data-lucide="${name}" class="vector-icon"${style} aria-hidden="true"></i>`;
  }

  if (!raw) {
    return `<i data-lucide="${fallback}" class="vector-icon"${style} aria-hidden="true"></i>`;
  }

  return `<span class="custom-icon"${style} aria-hidden="true">${escapeHTML(raw)}</span>`;
}

export function paintIcons(root = document) {
  try {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({ root });
    }
  } catch (error) {
    console.warn("Icon rendering unavailable", error);
  }
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;

  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const color = l - a * Math.max(
      -1,
      Math.min(k(n) - 3, Math.min(9 - k(n), 1))
    );

    return Math.round(255 * color).toString(16).padStart(2, "0");
  };

  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function hexToHsl(hex) {
  const value = normalizeIconColor(hex).slice(1);
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  if (h < 0) h += 360;

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function mountIconPicker({ $ }) {
  const host = $("icon-picker");
  const search = $("icon-search");
  const field = $("f-icon");
  const mode = $("icon-mode");
  const customSection = $("custom-icon-section");
  const existingSection = $("existing-icon-section");
  const colorInput = $("f-icon-color");
  const colorHex = $("icon-color-hex");
  const hue = $("icon-hue");
  const saturation = $("icon-saturation");
  const lightness = $("icon-lightness");
  const preview = $("icon-preview");

  if (!host || !search || !field) return;

  let selectedColor = normalizeIconColor(colorInput?.value || DEFAULT_COLOR);

  function updatePreview() {
    if (!preview) return;

    const value = field.value.trim();
    const color = normalizeIconColor(selectedColor);

    preview.innerHTML = iconMarkup(value || "lucide:circle", "circle", color);
    preview.style.color = color;
    paintIcons(preview);
  }

  function updateColorControls(color) {
    selectedColor = normalizeIconColor(color);

    if (colorInput) colorInput.value = selectedColor;
    if (colorHex) colorHex.value = selectedColor;

    const hsl = hexToHsl(selectedColor);

    if (hue) hue.value = String(hsl.h);
    if (saturation) saturation.value = String(hsl.s);
    if (lightness) lightness.value = String(hsl.l);

    updatePreview();
    field.dispatchEvent(new Event("iconcolorchange", { bubbles: true }));
  }

  function render() {
    const query = search.value.trim().toLowerCase();

    const icons = ICONS.filter(icon =>
      !query ||
      icon.name.includes(query) ||
      icon.category.toLowerCase().includes(query)
    );

    const groups = Object.keys(ICON_GROUPS).map(category => {
      const items = icons.filter(icon => icon.category === category);
      if (!items.length) return "";

      return `
        <div class="icon-group">
          <strong>${escapeHTML(category)}</strong>
          <div class="icon-group-grid">
            ${items.map(icon => `
              <button
                type="button"
                class="icon-choice ${field.value === `lucide:${icon.name}` ? "selected" : ""}"
                data-icon="${escapeHTML(icon.name)}"
                title="${escapeHTML(`${icon.category}: ${icon.name}`)}"
                aria-label="${escapeHTML(icon.name)}"
              >
                <i data-lucide="${escapeHTML(icon.name)}"></i>
                <small>${escapeHTML(icon.name)}</small>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    host.innerHTML = groups || '<p class="muted">No icons found.</p>';
    paintIcons(host);
  }

  function updateMode() {
    const currentMode = mode?.value || "custom";
    const useExisting = currentMode === "existing";

    if (customSection) customSection.hidden = useExisting;
    if (existingSection) existingSection.hidden = !useExisting;

    field.disabled = false;

    if (useExisting) {
      if (!field.value.startsWith("lucide:")) {
        field.value = "lucide:circle";
      }
    } else if (field.value.startsWith("lucide:")) {
      field.value = "";
    }

    render();
    updatePreview();
  }

  host.addEventListener("click", event => {
    const button = event.target.closest("[data-icon]");
    if (!button) return;

    field.value = `lucide:${button.dataset.icon}`;
    render();
    updatePreview();
  });

  search.addEventListener("input", render);

  field.addEventListener("input", () => {
    render();
    updatePreview();
  });

  mode?.addEventListener("change", updateMode);

  colorInput?.addEventListener("input", () => {
    updateColorControls(colorInput.value);
  });

  colorHex?.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(colorHex.value.trim())) {
      updateColorControls(colorHex.value);
    }
  });

  [hue, saturation, lightness].forEach(control => {
    control?.addEventListener("input", () => {
      updateColorControls(hslToHex(
        Number(hue?.value || 0),
        Number(saturation?.value || 100),
        Number(lightness?.value || 50)
      ));
    });
  });

  field.addEventListener("iconcolorchange", updatePreview);

  updateColorControls(selectedColor);
  updateMode();
}
