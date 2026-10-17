"use strict";

const TOP = 5;

export function createDashboardFeature({
  $,
  esc,
  iconOf,
  getRecords,
  openRecord,
  showRecordsOfType,
  startNewRecord,
  showRecords
}) {
  function analyze(records) {
    const ids = new Set(records.map(r => r.id));
    const degree = new Map(records.map(r => [r.id, 0]));
    let links = 0;

    records.forEach(r => {
      new Set(r.related).forEach(id => {
        if (id === r.id || !ids.has(id)) return;
        links++;
        degree.set(r.id, degree.get(r.id) + 1);
        degree.set(id, degree.get(id) + 1);
      });
    });

    const byType = new Map();
    const tags = new Set();

    records.forEach(r => {
      byType.set(r.type, (byType.get(r.type) || 0) + 1);
      r.tags.forEach(t => tags.add(t));
    });

    const types = [...byType].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    return { links, degree, tags, types };
  }

  const stat = (value, label) =>
    `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${esc(label)}</div></div>`;

  const recordButton = (r, meta = "") =>
    `<button type="button" class="dash-record" data-open="${esc(r.id)}">
      <span>${esc(iconOf(r))}</span>
      <strong>${esc(r.name)}</strong>
      <span class="muted">${esc(r.type)}</span>
      ${meta ? `<span class="meta">${esc(meta)}</span>` : ""}
    </button>`;

  function attentionGroup(title, list) {
    if (!list.length) return "";

    const shown = list
      .slice(0, TOP)
      .map(r => `<button type="button" class="chip" data-open="${esc(r.id)}">${esc(r.name)}</button>`)
      .join("");

    const more = list.length > TOP
      ? `<span class="muted">+${list.length - TOP} more</span>`
      : "";

    return `<div class="attention-group"><h4>${esc(title)} (${list.length})</h4><div class="tags">${shown}${more}</div></div>`;
  }

  function renderDashboard() {
    const records = getRecords();
    const { links, degree, tags, types } = analyze(records);
    const max = types.length ? types[0][1] : 1;

    const bars = types.length
      ? types.map(([type, count]) =>
          `<button type="button" class="bar-row" data-type="${esc(type)}" title="Show ${esc(type)} records">
            <span>${esc(type)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round((count / max) * 100)}%"></span></span>
            <span class="bar-count">${count}</span>
          </button>`
        ).join("")
      : '<p class="muted">No records yet. Create your first record to see it here.</p>';

    const recent = records
      .filter(r => r.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, TOP);

    const recentHtml = recent.length
      ? recent.map(r => {
          const date = new Date(r.createdAt);
          const meta = isNaN(date) ? "" : date.toLocaleDateString();
          return recordButton(r, meta);
        }).join("")
      : '<p class="muted">Records you create will appear here.</p>';

    const connected = records
      .filter(r => degree.get(r.id) > 0)
      .sort((a, b) =>
        degree.get(b.id) - degree.get(a.id) ||
        a.name.localeCompare(b.name)
      )
      .slice(0, TOP);

    const connectedHtml = connected.length
      ? connected.map(r => {
          const n = degree.get(r.id);
          return recordButton(r, n + (n === 1 ? " link" : " links"));
        }).join("")
      : '<p class="muted">Link records together to see the most connected ones.</p>';

    const noDescription = records.filter(r => !r.description.trim());
    const noProperties = records.filter(r => !r.properties.length);
    const isolated = records.filter(r => degree.get(r.id) === 0);

    const attention =
      attentionGroup("Without description", noDescription) +
      attentionGroup("Without properties", noProperties) +
      attentionGroup("Not linked to any record", isolated);

    $("dashboard-content").innerHTML = `
      <div class="stats-grid">
        ${stat(records.length, "Records")}
        ${stat(types.length, "Types in use")}
        ${stat(tags.size, "Tags")}
        ${stat(links, "Links")}
      </div>
      <div class="toolbar">
        <button id="dash-new" class="primary" type="button">+ New Record</button>
        <button id="dash-all" class="secondary" type="button">Browse all records</button>
      </div>
      <div class="panel"><h3>Records by type</h3>${bars}</div>
      <div class="panel"><h3>Recently added</h3><div class="dash-list">${recentHtml}</div></div>
      <div class="panel"><h3>Most connected</h3><div class="dash-list">${connectedHtml}</div></div>
      <div class="panel"><h3>Needs attention</h3>${attention || '<p class="muted">Every record has a description, properties and at least one link.</p>'}</div>
    `;

    const root = $("dashboard-content");

    root.querySelectorAll("[data-open]").forEach(button => {
      button.onclick = () => openRecord(button.dataset.open);
    });

    root.querySelectorAll("[data-type]").forEach(button => {
      button.onclick = () => showRecordsOfType(button.dataset.type);
    });

    $("dash-new").onclick = startNewRecord;
    $("dash-all").onclick = showRecords;
  }

  function showDashboard() {
    $("home").hidden = true;
    $("detail").hidden = true;
    $("editor").hidden = true;
    $("dashboard").hidden = false;

    renderDashboard();
    window.scrollTo(0, 0);
  }

  // Keeps the navigation highlight in sync: any screen other than the
  // dashboard (list, detail, editor) counts as "Records".
  function syncNav() {
    const onDashboard = !$("dashboard").hidden;

    $("nav-dashboard").classList.toggle("active", onDashboard);
    $("nav-records").classList.toggle("active", !onDashboard);

    $("nav-dashboard").setAttribute("aria-current", onDashboard ? "page" : "false");
    $("nav-records").setAttribute("aria-current", onDashboard ? "false" : "page");
  }

  new MutationObserver(syncNav).observe($("dashboard"), {
    attributes: true,
    attributeFilter: ["hidden"]
  });

  $("nav-dashboard").onclick = showDashboard;
  $("nav-records").onclick = showRecords;

  syncNav();

  return { showDashboard, renderDashboard };
}
