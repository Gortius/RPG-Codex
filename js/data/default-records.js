"use strict";

export const STARTER_RECORDS = [
  {
    id: "sample-mob",
    name: "Leafling",
    type: "Mob",
    category: "Beginning Hole",
    description: "A small creature found near the entrance.",
    tags: ["Common"],
    properties: [
      { name: "Health", value: "20" },
      { name: "Damage", value: "3" }
    ],
    related: []
  },
  {
    id: "sample-material",
    name: "Vines",
    type: "Material",
    category: "Beginning Hole",
    description: "A basic crafting material gathered from local creatures and plants.",
    tags: ["Craftable"],
    properties: [{ name: "Rarity", value: "Common" }],
    related: []
  },
  {
    id: "sample-item",
    name: "Leaf Bow",
    type: "Item",
    category: "Beginning Hole",
    description: "A simple bow made with materials from the starting area.",
    tags: ["Craftable", "Common"],
    properties: [
      { name: "Damage", value: "5" },
      { name: "Attack Speed", value: "1.0" }
    ],
    related: ["sample-recipe"]
  },
  {
    id: "sample-area",
    name: "Beginning Hole",
    type: "Area",
    category: "Sector 1",
    description: "The player's starting area, featuring a locked door and an early guardian.",
    tags: ["Starting Area"],
    properties: [{ name: "Level", value: "1" }],
    related: ["sample-mob"]
  },
  {
    id: "sample-effect",
    name: "Slowness",
    type: "Effect",
    category: "Debuff",
    description: "Reduces the affected target's movement speed.",
    tags: ["Debuff"],
    properties: [{ name: "Duration", value: "3 seconds" }],
    related: []
  },
  {
    id: "sample-recipe",
    name: "Leaf Bow Recipe",
    type: "Recipe",
    category: "Beginning Hole",
    description: "Crafting recipe for the Leaf Bow.",
    tags: ["Craftable"],
    properties: [{ name: "Material Cost", value: "Vines + Wood" }],
    related: ["sample-item"]
  }
];

let records = [];
let savedFilters = [];
let viewMode = "list";

try {
  viewMode = localStorage.getItem("rpg-codex-view-mode-v1") || "list";
} catch {}

let activeTypes = [];
let activeTags = [];
let conditions = [];
let qualityOnly = false;
let customColumns = 3;

try {
  const storedColumns = Number(
    localStorage.getItem("rpg-codex-custom-columns-v1")
  );

  if (Number.isFinite(storedColumns)) {
    customColumns = Math.max(2, Math.min(6, Math.round(storedColumns)));
  }
} catch {}

let expanded = new Set();

let filtersOpen = false;
let editingId = null;
let currentId = null;

let selectedTags = [];
let selectedRelated = [];

let tagOpen = false;
let relatedOpen = false;
let tagSearch = "";
let relatedSearch = "";
let tagCreateOpen = false;
