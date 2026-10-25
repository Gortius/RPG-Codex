/* RPG Codex — searchable, categorized emoji picker.
 * Uses the localized Emojibase dataset (Portuguese) with a small fallback set.
 */

const EMOJI_DATA_BASE = "https://cdn.jsdelivr.net/npm/emojibase-data@18.0.0/pt";
const PAGE_SIZE = 240;
const $ = id => document.getElementById(id);

const FALLBACK_EMOJIS = [
  ["⚔️", "espadas", "arma combate batalha guerra"], ["🛡️", "escudo", "defesa proteção armadura"],
  ["🏹", "arco e flecha", "arma arqueiro distância"], ["🗡️", "adaga", "espada arma furtividade"],
  ["🔱", "tridente", "arma lança água"], ["🔨", "martelo", "arma ferramenta forja"],
  ["🪓", "machado", "arma madeira corte"], ["🏹", "arco", "arma ranger"],
  ["🪄", "varinha mágica", "magia feitiço arcano"], ["🧙", "mago", "personagem magia bruxo"],
  ["🧙‍♀️", "maga", "personagem magia bruxa"], ["🧝", "elfo", "raça fantasia personagem"],
  ["🧛", "vampiro", "criatura monstro morto-vivo"], ["🧟", "zumbi", "monstro morto-vivo"],
  ["👻", "fantasma", "monstro espírito assombração"], ["💀", "caveira", "morte esqueleto monstro"],
  ["🐉", "dragão", "criatura chefe monstro lendário"], ["🐲", "cabeça de dragão", "criatura monstro"],
  ["🐺", "lobo", "animal mob criatura"], ["🦇", "morcego", "animal mob noturno"],
  ["🕷️", "aranha", "animal mob veneno"], ["🐍", "cobra", "animal mob veneno"],
  ["🦂", "escorpião", "animal mob veneno"], ["🦈", "tubarão", "animal mob água"],
  ["🐻", "urso", "animal mob"], ["🦊", "raposa", "animal mob"],
  ["🦴", "osso", "material crafting esqueleto"], ["🪶", "pena", "material crafting ave"],
  ["🪨", "pedra", "material minério mineração"], ["⛏️", "picareta", "ferramenta mineração"],
  ["💎", "gema", "material mineral cristal raro"], ["🔮", "bola de cristal", "magia arcano adivinhação"],
  ["🧿", "amuleto", "magia proteção acessório"], ["📜", "pergaminho", "item receita missão"],
  ["📕", "livro", "item conhecimento receita"], ["🗝️", "chave antiga", "item dungeon porta"],
  ["🧪", "poção", "alquimia consumível cura"], ["⚗️", "alquimia", "poção crafting laboratório"],
  ["🧫", "frasco", "alquimia material"], ["🧰", "caixa de ferramentas", "item ferramenta crafting"],
  ["🎒", "mochila", "inventário equipamento"], ["💰", "saco de dinheiro", "ouro economia moeda"],
  ["🪙", "moeda", "ouro economia dinheiro"], ["👑", "coroa", "rei chefe lendário"],
  ["🏰", "castelo", "área reino fortaleza"], ["🗺️", "mapa", "área exploração mundo"],
  ["🧭", "bússola", "exploração navegação"], ["🚪", "porta", "área dungeon entrada"],
  ["🕳️", "buraco", "caverna passagem dungeon"], ["🌲", "árvore", "floresta natureza madeira"],
  ["🍄", "cogumelo", "material natureza veneno"], ["🌿", "erva", "planta material alquimia"],
  ["🌵", "cacto", "planta deserto material"], ["🌋", "vulcão", "fogo área lava"],
  ["🔥", "fogo", "elemento dano queimadura"], ["💧", "água", "elemento líquido"],
  ["🌊", "onda", "água mar elemento"], ["🌪️", "tornado", "vento elemento"],
  ["⚡", "raio", "eletricidade magia dano"], ["❄️", "gelo", "elemento frio magia"],
  ["☀️", "sol", "luz dia elemento"], ["🌙", "lua", "noite sombra celestial"],
  ["⭐", "estrela", "raro celestial magia"], ["🌌", "galáxia", "espaço celestial"],
  ["☠️", "perigo", "veneno morte caveira"], ["🩸", "sangue", "vida vampiro dano"],
  ["❤️", "vida", "cura coração hp"], ["💚", "cura", "vida poção regeneração"],
  ["💜", "arcano", "magia raro roxo"], ["🌀", "vórtice", "portal magia dimensão"],
  ["🪬", "talismã", "amuleto magia proteção"], ["🔔", "sino", "evento templo"],
  ["🪦", "túmulo", "morte cemitério morto-vivo"], ["🕯️", "vela", "luz templo ritual"],
  ["🧿", "olho místico", "artefato magia proteção"], ["🏆", "troféu", "recompensa conquista"],
  ["🎯", "alvo", "precisão arqueiro crítico"], ["💥", "explosão", "dano impacto fogo"],
  ["💫", "efeito mágico", "magia buff efeito"], ["✨", "brilho", "magia efeito raro"],
  ["🌀", "redemoinho", "vento portal magia"], ["🦋", "borboleta", "natureza criatura"],
  ["🐸", "sapo", "animal mob veneno pântano"], ["🐝", "abelha", "animal mob mel"],
  ["🦌", "cervo", "animal floresta"], ["🐗", "javali", "animal mob"],
  ["🦅", "águia", "animal ave"], ["🐟", "peixe", "animal água"],
  ["🧱", "tijolo", "construção material"], ["🪵", "madeira", "material crafting"],
  ["⚙️", "engrenagem", "mecânica item máquina"], ["🔩", "parafuso", "material crafting"],
  ["🧵", "fio", "material crafting tecido"], ["🪡", "agulha", "ferramenta crafting"],
  ["🥩", "carne", "comida consumível"], ["🍎", "maçã", "comida cura consumível"],
  ["🍯", "mel", "comida material"], ["🍖", "carne assada", "comida consumível"],
  ["🥕", "cenoura", "comida planta"], ["🍷", "poção vermelha", "consumível cura"],
  ["🧭", "exploração", "mapa aventura mundo"], ["🚩", "marcador", "bandeira missão área"],
  ["🔒", "trancado", "bloqueio porta"], ["🔓", "desbloqueado", "chave porta"],
  ["📦", "baú", "loot recompensa item"], ["🎁", "presente", "recompensa loot"],
  ["❓", "desconhecido", "mistério pergunta"], ["❗", "alerta", "missão importante"],
  ["✅", "concluído", "missão sucesso"], ["💠", "cristal", "gema material magia"],
  ["🧡", "fogo", "elemento calor"], ["🩵", "água", "elemento gelo"],
  ["🩷", "cura", "vida coração"], ["🖤", "sombra", "trevas obscuro"],
  ["🤍", "luz", "sagrado cura"], ["☯️", "equilíbrio", "yin yang dualidade"],
  ["♻️", "reciclagem", "reutilização crafting"], ["♾️", "infinito", "arcano eternidade"]
].map(([emoji, name, tags], index) => ({
  id: index,
  emoji,
  name,
  tags: tags.split(/\s+/),
  shortcode: "",
  category: "RPG e aventura",
  search: `${emoji} ${name} ${tags}`
}));

let picker;
let openButton;
let iconField;
let iconMode;
let allEmojis = [];
let categoryNames = ["RPG e aventura"];
let activeCategory = "__all__";
let visibleLimit = PAGE_SIZE;
let datasetPromise = null;
let datasetIsFallback = false;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function nativeEmoji(item) {
  return item?.unicode || item?.emoji || "";
}

function labelForGroup(groupId, messages) {
  const group = (messages?.groups || []).find(item => Number(item.order) === Number(groupId));
  return group?.message || "Outros";
}

function normalizeEmojiEntry(entry, category, id, inheritedTags = []) {
  const character = nativeEmoji(entry);
  if (!character) return null;
  const name = entry.annotation || entry.name || "Emoji";
  const tags = [...new Set([...(entry.tags || []), ...inheritedTags])];
  const shortcode = Array.isArray(entry.shortcodes) ? entry.shortcodes.join(" ") : "";
  return {
    id,
    emoji: character,
    name,
    tags,
    shortcode,
    category,
    search: normalizeSearch([character, name, ...tags, shortcode, category].join(" "))
  };
}

async function loadEmojiDataset() {
  if (datasetPromise) return datasetPromise;

  datasetPromise = (async () => {
    try {
      const [emojiResponse, messageResponse] = await Promise.all([
        fetch(`${EMOJI_DATA_BASE}/compact.json`, { cache: "force-cache" }),
        fetch(`${EMOJI_DATA_BASE}/messages.json`, { cache: "force-cache" })
      ]);
      if (!emojiResponse.ok || !messageResponse.ok) {
        throw new Error("A base de emojis não respondeu corretamente.");
      }

      const [dataset, messages] = await Promise.all([
        emojiResponse.json(),
        messageResponse.json()
      ]);

      if (!Array.isArray(dataset) || dataset.length < 500) {
        throw new Error("A base de emojis recebida está incompleta.");
      }

      const next = [];
      for (const entry of dataset) {
        const category = labelForGroup(entry.group, messages);
        const base = normalizeEmojiEntry(entry, category, next.length);
        if (base) next.push(base);

        // The dataset nests skin-tone variants under the original emoji.
        for (const skin of (Array.isArray(entry.skins) ? entry.skins : [])) {
          const variant = normalizeEmojiEntry(
            skin,
            category,
            next.length,
            entry.tags || []
          );
          if (variant) next.push(variant);
        }
      }

      if (next.length < 500) throw new Error("A base de emojis não pôde ser interpretada.");

      allEmojis = next;
      categoryNames = [...new Set(next.map(item => item.category))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      datasetIsFallback = false;
    } catch (error) {
      console.warn("RPG Codex emoji dataset could not be loaded; using fallback emojis.", error);
      allEmojis = FALLBACK_EMOJIS;
      categoryNames = ["RPG e aventura"];
      datasetIsFallback = true;
    }

    renderCategories();
    renderGrid();
    return allEmojis;
  })();

  return datasetPromise;
}

function createPicker() {
  const layer = document.createElement("div");
  layer.id = "emoji-picker-layer";
  layer.className = "emoji-picker-layer";
  layer.hidden = true;
  layer.innerHTML = `
    <section class="emoji-picker-dialog" role="dialog" aria-modal="true"
      aria-labelledby="emoji-picker-title" aria-describedby="emoji-picker-description" tabindex="-1">
      <header class="emoji-picker-header">
        <div>
          <p class="emoji-picker-eyebrow">RPG CODEX · ÍCONES</p>
          <h2 id="emoji-picker-title">Escolher emoji</h2>
          <p id="emoji-picker-description">Explore a biblioteca ou pesquise por nome, significado ou palavra relacionada.</p>
        </div>
        <button class="emoji-picker-close" type="button" data-emoji-close aria-label="Fechar seletor de emojis" title="Fechar">×</button>
      </header>
      <div class="emoji-picker-toolbar">
        <label class="emoji-picker-search-wrap" for="emoji-picker-search">
          <span aria-hidden="true">⌕</span>
          <input id="emoji-picker-search" type="search" autocomplete="off"
            placeholder="Buscar: dragão, veneno, planta, espada…" aria-label="Buscar emojis por nome ou palavra-chave">
        </label>
        <button class="secondary emoji-picker-clear" type="button" data-emoji-clear>Limpar</button>
      </div>
      <nav id="emoji-picker-categories" class="emoji-picker-categories" aria-label="Categorias de emoji"></nav>
      <div id="emoji-picker-status" class="emoji-picker-status" role="status" aria-live="polite">Carregando emojis…</div>
      <div id="emoji-picker-results" class="emoji-picker-results"></div>
      <div class="emoji-picker-load-row">
        <button class="secondary" type="button" data-emoji-load-more hidden>Carregar mais</button>
      </div>
      <footer class="emoji-picker-footer">
        <span>Selecione um emoji para usá-lo como ícone do registro.</span>
        <button type="button" class="secondary" data-emoji-close>Cancelar</button>
      </footer>
    </section>
  `;
  document.body.append(layer);
  return layer;
}

function renderCategories() {
  const host = $("emoji-picker-categories");
  if (!host) return;
  const hasAll = allEmojis.length > 0;
  const categoryButtons = [
    `<button type="button" class="emoji-category-chip ${activeCategory === "__all__" ? "active" : ""}"
      data-emoji-category="__all__" aria-pressed="${activeCategory === "__all__"}">Todos</button>`
  ];

  for (const category of categoryNames) {
    const count = allEmojis.filter(item => item.category === category).length;
    if (!count) continue;
    categoryButtons.push(
      `<button type="button" class="emoji-category-chip ${activeCategory === category ? "active" : ""}"
        data-emoji-category="${escapeHTML(category)}" aria-pressed="${activeCategory === category}">${escapeHTML(category)}</button>`
    );
  }
  host.innerHTML = hasAll ? categoryButtons.join("") : "";
}

function getFilteredEmojis() {
  const query = normalizeSearch($("emoji-picker-search")?.value || "");
  return allEmojis.filter(item => {
    const matchesCategory = activeCategory === "__all__" || item.category === activeCategory;
    const matchesQuery = !query || item.search.includes(query);
    return matchesCategory && matchesQuery;
  });
}

function renderGrid() {
  const host = $("emoji-picker-results");
  const status = $("emoji-picker-status");
  const loadMore = picker?.querySelector("[data-emoji-load-more]");
  if (!host || !status || !loadMore) return;

  const matches = getFilteredEmojis();
  const visible = matches.slice(0, visibleLimit);

  if (!allEmojis.length) {
    host.innerHTML = "";
    status.textContent = "Carregando emojis…";
    loadMore.hidden = true;
    return;
  }

  const groups = new Map();
  for (const item of visible) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }

  host.innerHTML = [...groups.entries()].map(([category, items]) => `
    <section class="emoji-results-group" aria-label="${escapeHTML(category)}">
      <h3>${escapeHTML(category)}</h3>
      <div class="emoji-results-grid">
        ${items.map(item => `
          <button type="button" class="emoji-choice" data-emoji-index="${item.id}"
            title="${escapeHTML(item.name)}" aria-label="${escapeHTML(`${item.emoji}, ${item.name}`)}">
            <span class="emoji-choice-glyph" aria-hidden="true">${item.emoji}</span>
            <span class="emoji-choice-name">${escapeHTML(item.name)}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `).join("") || `<p class="emoji-picker-empty">Nenhum emoji encontrado. Experimente outra palavra ou categoria.</p>`;

  const remaining = Math.max(0, matches.length - visible.length);
  status.textContent = datasetIsFallback
    ? `Exibindo a lista básica de emergência (${matches.length} emojis). Não foi possível carregar a biblioteca completa.`
    : `Mostrando ${visible.length.toLocaleString("pt-BR")} de ${matches.length.toLocaleString("pt-BR")} emojis encontrados · ${allEmojis.length.toLocaleString("pt-BR")} no total`;

  loadMore.hidden = remaining === 0;
  loadMore.textContent = remaining
    ? `Carregar mais ${Math.min(PAGE_SIZE, remaining).toLocaleString("pt-BR")} (${remaining.toLocaleString("pt-BR")} restantes)`
    : "Todos os resultados foram exibidos";
}

function openPicker() {
  picker.hidden = false;
  document.body.classList.add("emoji-picker-open");
  openButton?.setAttribute("aria-expanded", "true");
  const search = $("emoji-picker-search");
  if (search) search.value = "";
  activeCategory = "__all__";
  visibleLimit = PAGE_SIZE;
  renderCategories();
  renderGrid();
  requestAnimationFrame(() => search?.focus());
  loadEmojiDataset();
}

function closePicker() {
  if (!picker || picker.hidden) return;
  picker.hidden = true;
  document.body.classList.remove("emoji-picker-open");
  openButton?.setAttribute("aria-expanded", "false");
  openButton?.focus();
}

function chooseEmoji(item) {
  if (!item || !iconField) return;

  // Choosing an emoji switches back to the custom-emoji/text mode first.
  if (iconMode && iconMode.value !== "custom") {
    iconMode.value = "custom";
    iconMode.dispatchEvent(new Event("change", { bubbles: true }));
  }

  iconField.value = item.emoji;
  iconField.dispatchEvent(new Event("input", { bubbles: true }));
  iconField.dispatchEvent(new Event("change", { bubbles: true }));
  closePicker();
}

function installEvents() {
  openButton?.addEventListener("click", openPicker);
  picker.addEventListener("click", event => {
    if (event.target === picker || event.target.closest("[data-emoji-close]")) {
      closePicker();
      return;
    }

    const categoryButton = event.target.closest("[data-emoji-category]");
    if (categoryButton) {
      activeCategory = categoryButton.dataset.emojiCategory;
      visibleLimit = PAGE_SIZE;
      renderCategories();
      renderGrid();
      return;
    }

    const emojiButton = event.target.closest("[data-emoji-index]");
    if (emojiButton) {
      chooseEmoji(allEmojis[Number(emojiButton.dataset.emojiIndex)]);
      return;
    }

    if (event.target.closest("[data-emoji-load-more]")) {
      visibleLimit += PAGE_SIZE;
      renderGrid();
      return;
    }

    if (event.target.closest("[data-emoji-clear]")) {
      const search = $("emoji-picker-search");
      if (search) search.value = "";
      activeCategory = "__all__";
      visibleLimit = PAGE_SIZE;
      renderCategories();
      renderGrid();
      search?.focus();
    }
  });

  $("emoji-picker-search")?.addEventListener("input", () => {
    visibleLimit = PAGE_SIZE;
    renderGrid();
  });

  document.addEventListener("keydown", event => {
    if (picker.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return;
    }

    // Keep keyboard focus inside the modal while it is open.
    if (event.key === "Tab") {
      const focusable = [...picker.querySelectorAll('button:not([hidden]), input:not([disabled])')]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

function initEmojiPicker() {
  iconField = $("f-icon");
  iconMode = $("icon-mode");
  const customSection = $("custom-icon-section");
  if (!iconField || !customSection) return;

  openButton = $("open-emoji-picker");
  if (!openButton) {
    openButton = document.createElement("button");
    openButton.id = "open-emoji-picker";
    openButton.className = "secondary emoji-picker-open-button";
    openButton.type = "button";
    openButton.textContent = "😀 Buscar emojis";
    iconField.insertAdjacentElement("afterend", openButton);
  } else {
    openButton.classList.add("emoji-picker-open-button");
  }

  openButton.setAttribute("aria-haspopup", "dialog");
  openButton.setAttribute("aria-controls", "emoji-picker-layer");
  openButton.setAttribute("aria-expanded", "false");

  picker = createPicker();
  installEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEmojiPicker, { once: true });
} else {
  initEmojiPicker();
}
