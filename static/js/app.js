/**
 * VIT Chennai Pathfinder – frontend
 * Fetches destinations, runs A* search, displays paths table, tree and graph viz.
 */

const API = ""; // same origin

let treeNetwork = null;
let graphNetwork = null;
let latestGraphData = null;
let latestAlgorithmResults = [];
let latestBestRoute = null;

function applyTheme(theme) {
  const mode = theme === "dark" ? "dark" : "light";
  document.body.setAttribute("data-theme", mode);
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.textContent = mode === "dark" ? "Light mode" : "Dark mode";
  }
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("vit-pathfinder-theme", next);
  applyTheme(next);
}

// Load destinations and fill dropdowns
async function loadDestinations() {
  const res = await fetch(API + "/api/destinations");
  if (!res.ok) throw new Error("Failed to load destinations");
  const data = await res.json();
  const destSelect = document.getElementById("destination");
  const mandSelect = document.getElementById("mandatory");
  destSelect.innerHTML = '<option value="">-- Select destination --</option>';
  mandSelect.innerHTML = "";
  data.destinations.forEach((name) => {
    const o1 = document.createElement("option");
    o1.value = name;
    o1.textContent = name;
    destSelect.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = name;
    o2.textContent = name;
    mandSelect.appendChild(o2);
  });
  updateMandatorySummary();
  return data;
}

function updateMandatorySummary() {
  const mandSelect = document.getElementById("mandatory");
  const summary = document.getElementById("mandatorySummary");
  if (!mandSelect || !summary) return;

  const selected = Array.from(mandSelect.selectedOptions).map((o) => o.value);
  if (!selected.length) {
    summary.innerHTML = '<span class="mandatory-summary-empty">No mandatory nodes selected</span>';
    return;
  }

  const maxPreview = 8;
  const chips = selected.slice(0, maxPreview)
    .map((node) => '<span class="mandatory-chip">' + escapeHtml(node) + "</span>")
    .join("");
  const extra = selected.length > maxPreview
    ? '<span class="mandatory-summary-empty">+' + (selected.length - maxPreview) + " more</span>"
    : "";
  summary.innerHTML = chips + extra;
}

// Run A* search and update UI
async function runSearch() {
  const destination = document.getElementById("destination").value;
  const mandSelect = document.getElementById("mandatory");
  const mandatory = Array.from(mandSelect.selectedOptions).map((o) => o.value);

  if (!destination) {
    alert("Please select a destination.");
    return;
  }

  document.getElementById("runSearch").disabled = true;
  document.getElementById("execInfo").innerHTML = '<span class="status-loading">Searching... (may take a few seconds)</span>';
  document.getElementById("bestPathBox").innerHTML = "";
  document.getElementById("pathsBody").innerHTML = "";
  document.getElementById("treeContainer").innerHTML = "";
  document.getElementById("graphContainer").innerHTML = "";
  document.getElementById("algoTabs").innerHTML = "";
  document.getElementById("algoPanel").textContent = "Calculating technique outputs...";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 s max wait

  try {
    const res = await fetch(API + "/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, mandatory }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Search failed");
    }
    const data = await res.json();
    renderResults(data);
    renderTree(data.tree_data);
    renderGraph(data.graph_data);
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e.name === "AbortError" ? "Request timed out. Try fewer mandatory nodes or a closer destination." : e.message;
    document.getElementById("execInfo").innerHTML =
      '<span class="status-error">' + escapeHtml(msg) + "</span>";
  } finally {
    document.getElementById("runSearch").disabled = false;
  }
}

const SIX_HRS_MIN = 360;

function renderResults(data) {
  const bestPath = data.best_path || [];
  const totalCost = data.total_cost;
  const nodesExplored = data.nodes_explored ?? 0;
  const executionMs = data.execution_ms ?? 0;
  const allPaths = Array.isArray(data.all_paths) ? data.all_paths : [];
  const algorithmResults = Array.isArray(data.algorithm_results) ? data.algorithm_results : [];
  const bestTechnique = data.best_technique || "A*";
  const within6 = data.paths_within_6hr_count ?? allPaths.filter((p) => p.cost <= SIX_HRS_MIN).length;
  const over6 = data.paths_over_6hr_count ?? allPaths.filter((p) => p.cost > SIX_HRS_MIN).length;

  document.getElementById("execInfo").innerHTML = [
    "<strong>Best technique:</strong> " + escapeHtml(bestTechnique),
    "<strong>Total cost:</strong> " + (totalCost != null ? totalCost + " min" : "—"),
    "<strong>Nodes explored (A*):</strong> " + nodesExplored,
    "<strong>Execution:</strong> " + executionMs + " ms",
    "<strong>Paths found:</strong> " + allPaths.length,
    "<strong>Paths ≤ 6 hrs:</strong> " + within6,
    "<strong>Paths &gt; 6 hrs:</strong> " + over6,
  ]
    .map((s) => "<span>" + s + "</span>")
    .join("");

  const bestPathStr = bestPath.length ? bestPath.join(" → ") : "No path found.";
  document.getElementById("bestPathBox").innerHTML =
    '<div class="path-label">Best path (A*)</div><div class="path-value">' +
    escapeHtml(bestPathStr) +
    "</div>";

  latestBestRoute = {
    destination: document.getElementById("destination").value,
    mandatory: data.mandatory || [],
    path: bestPath,
    cost: totalCost,
  };

  const tbody = document.getElementById("pathsBody");
  tbody.innerHTML = "";
  const bestPathKey = bestPath.join(",");
  allPaths.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const isBest = item.path.join(",") === bestPathKey;
    const isOver6 = item.cost > SIX_HRS_MIN;
    if (isBest) tr.classList.add("best-row");
    if (isOver6) tr.classList.add("over-6hr");
    const statusBadge = isOver6
      ? '<span class="time-badge time-badge-over">Over 6 hrs</span>'
      : '<span class="time-badge time-badge-ok">Within 6 hrs</span>';
    tr.innerHTML =
      "<td>" +
      (idx + 1) +
      "</td>" +
      '<td class="path-cells" title="' +
      escapeHtml(item.path.join(" → ")) +
      '">' +
      escapeHtml(item.path.join(" → ")) +
      "</td>" +
      '<td class="' + (isOver6 ? "cost-over" : "") + '">' +
      item.cost +
      "</td>" +
      "<td>" +
      statusBadge +
      "</td>" +
      "<td>" +
      (isBest ? "✅" : "") +
      "</td>";
    tbody.appendChild(tr);
  });

  render6hrSummary(data.paths_within_6hr, data.paths_over_6hr, within6, over6);
  latestAlgorithmResults = algorithmResults;
  latestGraphData = data.graph_data || null;
  renderAlgorithmNavigator(algorithmResults, bestTechnique);
  
  // Render new features
  const mandSelect = document.getElementById("mandatory");
  const mandatory = Array.from(mandSelect.selectedOptions).map((o) => o.value);
  renderWaypointOptimizer(mandatory, bestPath);
  renderCostBreakdown(bestPath, totalCost, data.node_time || {});
  renderAlternativeSuggestions(totalCost || 0, allPaths);
  renderPrintableCard(document.getElementById("destination").value, bestPath, totalCost || 0, mandatory);
}

function renderAlgorithmNavigator(results, bestTechnique) {
  const tabsWrap = document.getElementById("algoTabs");
  const panel = document.getElementById("algoPanel");
  if (!tabsWrap || !panel) return;

  tabsWrap.innerHTML = "";
  if (!Array.isArray(results) || !results.length) {
    panel.textContent = "Technique outputs are not available for this run.";
    renderAlgorithmRanking([]);
    return;
  }

  const ranked = results
    .map((item) => ({ ...item }))
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      if (!a.available && !b.available) return a.name.localeCompare(b.name);
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.execution_ms - b.execution_ms;
    })
    .map((item, idx) => ({ ...item, rank: item.available ? idx + 1 : null }));

  renderAlgorithmRanking(ranked);

  let selected = ranked.find((r) => r.name === bestTechnique && r.available) || ranked.find((r) => r.available) || ranked[0];
  ranked.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "algo-tab";
    if (!item.available) btn.classList.add("unavailable");
    if (item.over_6hr) btn.classList.add("over-limit");
    if (selected && selected.name === item.name) btn.classList.add("active");
    btn.textContent = (item.rank ? "#" + item.rank + " " : "") + item.name;
    btn.addEventListener("click", () => {
      selected = item;
      Array.from(tabsWrap.children).forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      renderAlgorithmPanel(item);
      highlightSelectedAlgorithmPath(item.path || []);
    });
    tabsWrap.appendChild(btn);
  });

  renderAlgorithmPanel(selected);
  highlightSelectedAlgorithmPath((selected && selected.path) || []);
}

function renderAlgorithmRanking(rankedResults) {
  const wrap = document.getElementById("algoRanking");
  if (!wrap) return;

  if (!rankedResults || !rankedResults.length) {
    wrap.innerHTML = "";
    return;
  }

  const rows = rankedResults.map((item) => {
    return "<tr>" +
      "<td>" + (item.rank ? '<span class="algo-rank-chip">' + item.rank + "</span>" : "-") + "</td>" +
      "<td>" + escapeHtml(item.name) + "</td>" +
      "<td>" + (item.available ? escapeHtml(String(item.cost)) + " min" : "N/A") + "</td>" +
      "<td>" + (item.available ? escapeHtml(String(item.execution_ms)) + " ms" : "N/A") + "</td>" +
      "<td>" + (item.available ? (item.over_6hr ? "Over 6 hrs" : "Within 6 hrs") : "No path") + "</td>" +
      "</tr>";
  }).join("");

  wrap.innerHTML =
    "<h3>Technique Ranking (Best Path First)</h3>" +
    '<table class="algo-ranking-table">' +
    "<thead><tr><th>Rank</th><th>Technique</th><th>Cost</th><th>Time</th><th>Status</th></tr></thead>" +
    "<tbody>" + rows + "</tbody>" +
    "</table>";
}

function renderAlgorithmPanel(item) {
  const panel = document.getElementById("algoPanel");
  if (!panel || !item) return;

  if (!item.available) {
    panel.innerHTML =
      '<div class="algo-panel-name">' + escapeHtml(item.name) + '</div>' +
      '<div class="status-error">No valid path available for this technique and selected constraints.</div>';
    return;
  }

  const pathText = Array.isArray(item.path) && item.path.length ? item.path.join(" → ") : "No path";
  panel.innerHTML =
    '<div class="algo-panel-name">' + escapeHtml(item.name) + '</div>' +
    '<div class="algo-panel-grid">' +
    '<div class="algo-metric"><span class="algo-metric-label">Cost</span><span class="algo-metric-value">' + escapeHtml(String(item.cost)) + ' min</span></div>' +
    '<div class="algo-metric"><span class="algo-metric-label">Time</span><span class="algo-metric-value">' + escapeHtml(String(item.execution_ms)) + ' ms</span></div>' +
    '<div class="algo-metric"><span class="algo-metric-label">Nodes explored</span><span class="algo-metric-value">' + escapeHtml(String(item.nodes_explored)) + '</span></div>' +
    "</div>" +
    '<div class="algo-path">' + escapeHtml(pathText) + "</div>";

  document.getElementById("bestPathBox").innerHTML =
    '<div class="path-label">Selected technique path</div><div class="path-value">' +
    escapeHtml(pathText) +
    "</div>";
}

function highlightSelectedAlgorithmPath(path) {
  if (!latestGraphData || !Array.isArray(path) || !path.length) {
    return;
  }

  const pathNodes = new Set(path);
  const pathEdgeKeys = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    pathEdgeKeys.add(path[i] + "->" + path[i + 1]);
  }

  const graphData = {
    nodes: (latestGraphData.nodes || []).map((n) => ({
      ...n,
      color: pathNodes.has(n.id) ? "#2ecc71" : "#bdc3c7",
    })),
    edges: (latestGraphData.edges || []).map((e) => {
      const onPath = pathEdgeKeys.has(e.from + "->" + e.to);
      return {
        ...e,
        color: onPath ? "#2ecc71" : "#95a5a6",
        width: onPath ? 2 : 0.5,
      };
    }),
  };

  renderGraph(graphData);
}

function render6hrSummary(pathsWithin6, pathsOver6, within6, over6) {
  let el = document.getElementById("summary6hr");
  if (!el) {
    el = document.createElement("div");
    el.id = "summary6hr";
    el.className = "summary-6hr";
    document.getElementById("resultsSection").insertBefore(el, document.querySelector(".table-wrap"));
  }
  const withinList = Array.isArray(pathsWithin6) ? pathsWithin6 : [];
  const overList = Array.isArray(pathsOver6) ? pathsOver6 : [];
  const fmt = (p) => escapeHtml(p.path.join(" → ")) + " (" + p.cost + " min)";
  const maxShow = 5;
  const withinStr = withinList.length
    ? " — " + withinList.slice(0, maxShow).map(fmt).join("; ") + (withinList.length > maxShow ? "; +" + (withinList.length - maxShow) + " more" : "")
    : "";
  const overStr = overList.length
    ? " — " + overList.slice(0, maxShow).map(fmt).join("; ") + (overList.length > maxShow ? "; +" + (overList.length - maxShow) + " more" : "")
    : "";
  el.innerHTML =
    '<div class="summary-6hr-row"><span class="summary-label">Paths covered in ≤ 6 hrs:</span> ' + within6 + withinStr + "</div>" +
    '<div class="summary-6hr-row"><span class="summary-label">Paths not covered in 6 hrs:</span> ' + over6 + overStr + "</div>";
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderTree(treeData) {
  if (!treeData || !treeData.nodes || !treeData.nodes.length) return;

  const nodes = new vis.DataSet(
    treeData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      title: n.label,
      color: n.isBest ? "#3fb950" : "#8b949e",
      font: { color: n.isBest ? "#fff" : "#e6edf3" },
    }))
  );
  const edges = new vis.DataSet(
    treeData.edges.map((e) => ({ from: e.from, to: e.to }))
  );

  const container = document.getElementById("treeContainer");
  const data = { nodes, edges };
  const options = {
    layout: {
      hierarchical: {
        direction: "UD",
        sortMethod: "directed",
        nodeSpacing: 120,
        levelSeparation: 100,
      },
    },
    physics: false,
    nodes: { shape: "box", margin: 10 },
    edges: { arrows: "to" },
    interaction: { zoomView: true, dragView: true },
  };
  treeNetwork = new vis.Network(container, data, options);
}

function renderGraph(graphData) {
  if (!graphData || !graphData.nodes || !graphData.nodes.length) return;

  const nodes = new vis.DataSet(
    graphData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      title: n.title,
      color: n.color || "#bdc3c7",
    }))
  );
  const edges = new vis.DataSet(
    graphData.edges.map((e) => ({
      from: e.from,
      to: e.to,
      title: e.title,
      color: e.color || "#95a5a6",
      width: e.color === "#2ecc71" ? 2 : 0.5,
    }))
  );

  const container = document.getElementById("graphContainer");
  const data = { nodes, edges };
  const options = {
    layout: { randomSeed: 42 },
    physics: {
      enabled: true,
      forceAtlas2Based: { gravitationalConstant: -80, centralGravity: 0.01 },
      solver: "forceAtlas2Based",
    },
    nodes: { shape: "dot", size: 12 },
    edges: { arrows: "to" },
    interaction: { zoomView: true, dragView: true },
  };
  graphNetwork = new vis.Network(container, data, options);
}

function exportReport() {
  const exec = document.getElementById("execInfo").innerText;
  const best = document.getElementById("bestPathBox").innerText;
  const table = document.getElementById("pathsTable");
  let rows = "";
  if (table && table.tBodies[0]) {
    for (const tr of table.tBodies[0].rows) {
      rows += tr.innerText.replace(/\t/g, ", ") + "\n";
    }
  }
  const text =
    "VIT Chennai Pathfinder – Report\n\n" +
    "--- Execution ---\n" +
    exec +
    "\n\n--- Best path ---\n" +
    best +
    "\n\n--- All paths ---\n" +
    rows;
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vit-pathfinder-report.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

// Node Search Autocomplete
function initNodeSearch() {
  const input = document.getElementById("nodeSearch");
  const results = document.getElementById("nodeSearchResults");
  const mandSelect = document.getElementById("mandatory");
  
  if (!input) return;
  
  input.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      results.classList.add("hidden");
      return;
    }
    
    const allOptions = Array.from(mandSelect.options).map((o) => o.value);
    const matches = allOptions.filter((option) => 
      option.toLowerCase().includes(query)
    ).slice(0, 8);
    
    if (!matches.length) {
      results.classList.add("hidden");
      return;
    }
    
    results.innerHTML = matches
      .map((match) => '<div class="node-search-item" onclick="addMandatoryNode(\'' + escapeHtml(match) + '\')">' + escapeHtml(match) + '</div>')
      .join("");
    results.classList.remove("hidden");
  });
}

function addMandatoryNode(nodeName) {
  const mandSelect = document.getElementById("mandatory");
  const option = Array.from(mandSelect.options).find((o) => o.value === nodeName);
  if (option) {
    option.selected = true;
    document.getElementById("nodeSearch").value = "";
    document.getElementById("nodeSearchResults").classList.add("hidden");
    updateMandatorySummary();
  }
}

// Waypoint Optimizer
function renderWaypointOptimizer(mandatoryNodes, path) {
  const output = document.getElementById("waypointOutput");
  if (!output) return;
  
  if (!mandatoryNodes || !mandatoryNodes.length) {
    output.textContent = "No mandatory nodes selected.";
    return;
  }
  
  if (!path || !path.length) {
    output.textContent = "Run a search to see the optimal waypoint order.";
    return;
  }
  
  const waypointOrder = path.filter((node) => mandatoryNodes.includes(node));
  if (!waypointOrder.length) {
    output.textContent = "No mandatory nodes in the selected path.";
    return;
  }
  
  const html = '<ul class="waypoint-list">' +
    waypointOrder.map((node, idx) => 
      '<li class="waypoint-item"><span class="waypoint-rank">' + (idx + 1) + '</span>' + escapeHtml(node) + '</li>'
    ).join("") +
    '</ul>';
  
  output.innerHTML = html;
}

// Cost Breakdown
function renderCostBreakdown(path, totalCost, nodeTime) {
  const output = document.getElementById("costBreakdown");
  if (!output || !path || !path.length || totalCost == null) {
    if (output) output.textContent = "No route selected.";
    return;
  }
  
  let visitCost = 0.0;
  for (const node of path) {
    if (node !== path[0]) {
      visitCost += (nodeTime && nodeTime[node]) || 30.0;
    }
  }

  const total = Number(totalCost) || 0;
  const travelCost = Math.max(0, total - visitCost);

  if (total <= 0) {
    output.textContent = "Cost breakdown unavailable for this route.";
    return;
  }

  const travelPct = total ? Math.round((travelCost / total) * 100) : 0;
  const visitPct = 100 - travelPct;
  
  const html = '<div class="cost-bars">' +
    '<div class="cost-bar cost-bar-travel" style="flex: ' + travelPct + '; background: rgba(11, 110, 153, ' + (0.2 + travelPct/500) + ');">' +
    '<strong>' + travelPct + '%</strong>' +
    '<small>Travel<br>' + Math.round(travelCost) + ' min</small>' +
    '</div>' +
    '<div class="cost-bar cost-bar-visit" style="flex: ' + visitPct + '; background: rgba(31, 157, 85, ' + (0.2 + visitPct/500) + ');">' +
    '<strong>' + visitPct + '%</strong>' +
    '<small>Visit<br>' + Math.round(visitCost) + ' min</small>' +
    '</div>' +
    '</div>';
  
  if (output) output.innerHTML = html;
}

// Alternative Route Suggestions
function renderAlternativeSuggestions(currentCost, allPaths) {
  const output = document.getElementById("alternatives");
  if (!output) return;
  
  if (!allPaths || !allPaths.length) {
    output.textContent = "Run a search to see alternative suggestions.";
    return;
  }
  
  const alternatives = allPaths.filter((p) => p.cost > currentCost && p.cost < currentCost + 60).slice(0, 3);
  
  if (!alternatives.length) {
    const bestAlternative = allPaths.find((p) => p.cost < currentCost);
    if (bestAlternative) {
      output.innerHTML = '<div class="alternative-item">✓ Your current route is optimal!</div>';
    } else {
      output.textContent = "No alternative routes available.";
    }
    return;
  }
  
  const html = '<ul class="alternatives-list">' +
    alternatives.map((alt) => {
      const diff = Math.round(alt.cost - currentCost);
      return '<li class="alternative-item"><strong>+' + diff + ' min</strong>: ' + escapeHtml(alt.path.slice(0, 3).join(" → ")) + '...</li>';
    }).join("") +
    '</ul>';
  
  output.innerHTML = html;
}

// Route History & Favorites
function loadRouteHistory() {
  const saved = localStorage.getItem("vit-pathfinder-history");
  return saved ? JSON.parse(saved) : [];
}

function saveRoute(destination, mandatory, path, cost) {
  const history = loadRouteHistory();
  const route = {
    id: Date.now(),
    destination,
    mandatory: Array.isArray(mandatory) ? mandatory : [],
    path: Array.isArray(path) ? path : [],
    cost,
    timestamp: new Date().toLocaleString(),
  };
  history.unshift(route);
  localStorage.setItem("vit-pathfinder-history", JSON.stringify(history.slice(0, 20)));
  renderRouteHistory();
}

function renderRouteHistory() {
  const wrap = document.getElementById("routeHistory");
  if (!wrap) return;
  
  const history = loadRouteHistory();
  if (!history.length) {
    wrap.innerHTML = "<p>No saved routes yet.</p>";
    return;
  }
  
  wrap.innerHTML = history.map((route) => 
    '<div class="history-item">' +
    '<div class="history-item-info">' +
    '<div class="history-item-dest">' + escapeHtml(route.destination) + '</div>' +
    '<div class="history-item-cost">' + route.cost + ' min | ' + (route.mandatory && route.mandatory.length ? route.mandatory.length + ' stops' : 'No stops') + ' | ' + route.timestamp + '</div>' +
    '</div>' +
    '<button type="button" class="btn-secondary btn-small" onclick="loadSavedRoute(' + route.id + ')">Load</button>' +
    '</div>'
  ).join("");
}

function loadSavedRoute(routeId) {
  const history = loadRouteHistory();
  const route = history.find((r) => r.id === routeId);
  if (!route) return;
  
  document.getElementById("destination").value = route.destination;
  const mandSelect = document.getElementById("mandatory");
  Array.from(mandSelect.options).forEach((o) => {
    o.selected = route.mandatory && route.mandatory.includes(o.value);
  });
  updateMandatorySummary();
}

function clearRouteHistory() {
  localStorage.removeItem("vit-pathfinder-history");
  renderRouteHistory();
}

// Printable Route Card
function renderPrintableCard(destination, path, cost, mandatory) {
  const card = document.getElementById("printableCard");
  if (!card) return;
  
  if (!path || !path.length) {
    card.textContent = "Select a route to generate a printable card.";
    return;
  }
  
  const html = '<h3>Route Details</h3>' +
    '<div class="card-row"><span class="card-label">Destination:</span><span class="card-value">' + escapeHtml(destination) + '</span></div>' +
    '<div class="card-row"><span class="card-label">Total Cost:</span><span class="card-value">' + Math.round(cost) + ' minutes</span></div>' +
    '<div class="card-row"><span class="card-label">Stops:</span><span class="card-value">' + (path.length - 1) + '</span></div>' +
    '<h3>Full Route</h3>' +
    '<div class="card-path">' + escapeHtml(path.join(" → ")) + '</div>' +
    (mandatory && mandatory.length ? '<h3>Mandatory Stops Visited</h3><div class="card-path">' + escapeHtml(mandatory.join(", ")) + '</div>' : '');
  
  card.innerHTML = html;
}

// Keyboard Shortcuts
function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "Enter") {
        e.preventDefault();
        runSearch();
      } else if (e.key === "s") {
        e.preventDefault();
        if (document.getElementById("saveRoute")) {
          document.getElementById("saveRoute").click();
        }
      }
    }
    if (e.key === "Escape") {
      document.getElementById("nodeSearchResults").classList.add("hidden");
      document.getElementById("nodeSearch").value = "";
    }
  });
}

// Copy to Clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Copied to clipboard!");
  }).catch(() => {
    alert("Failed to copy. Try manually selecting the text.");
  });
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  const storedTheme = localStorage.getItem("vit-pathfinder-theme") || "light";
  applyTheme(storedTheme);

  loadDestinations().catch((e) => {
    document.getElementById("execInfo").innerHTML =
      '<span class="status-error">Load destinations failed. Is the backend running? ' +
      escapeHtml(e.message) +
      "</span>";
  });
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("mandatory").addEventListener("change", updateMandatorySummary);
  document.getElementById("runSearch").addEventListener("click", runSearch);
  
  // New feature initializations
  initNodeSearch();
  initKeyboardShortcuts();
  renderRouteHistory();
  
  // Save route button
  const saveBtn = document.getElementById("saveRoute");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (latestBestRoute && Array.isArray(latestBestRoute.path) && latestBestRoute.path.length) {
        saveRoute(
          latestBestRoute.destination,
          latestBestRoute.mandatory,
          latestBestRoute.path,
          latestBestRoute.cost
        );
        alert("Route saved!");
      } else {
        alert("Please run a search first to save a route.");
      }
    });
  }

  const clearBtn = document.getElementById("clearHistory");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const history = loadRouteHistory();
      if (!history.length) {
        alert("History is already empty.");
        return;
      }
      const ok = window.confirm("Clear all saved routes from history?");
      if (!ok) return;
      clearRouteHistory();
    });
  }
  
  // Print button
  const printBtn = document.getElementById("printRoute");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      window.print();
    });
  }
  
  document.getElementById("exportPdf").addEventListener("click", exportReport);
  updateMandatorySummary();
});
