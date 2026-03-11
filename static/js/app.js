/**
 * VIT Chennai Pathfinder – frontend
 * Fetches destinations, runs A* search, displays paths table, tree and graph viz.
 */

const API = ""; // same origin

let treeNetwork = null;
let graphNetwork = null;

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
  return data;
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
  document.getElementById("execInfo").innerHTML = "Searching... (may take a few seconds)";
  document.getElementById("bestPathBox").innerHTML = "";
  document.getElementById("pathsBody").innerHTML = "";
  document.getElementById("treeContainer").innerHTML = "";
  document.getElementById("graphContainer").innerHTML = "";

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
      '<span style="color:#f85149">' + msg + "</span>";
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
  const within6 = data.paths_within_6hr_count ?? allPaths.filter((p) => p.cost <= SIX_HRS_MIN).length;
  const over6 = data.paths_over_6hr_count ?? allPaths.filter((p) => p.cost > SIX_HRS_MIN).length;

  document.getElementById("execInfo").innerHTML = [
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

  const tbody = document.getElementById("pathsBody");
  tbody.innerHTML = "";
  const bestPathKey = bestPath.join(",");
  allPaths.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const isBest = item.path.join(",") === bestPathKey;
    if (isBest) tr.classList.add("best-row");
    if (item.cost > SIX_HRS_MIN) tr.classList.add("over-6hr");
    tr.innerHTML =
      "<td>" +
      (idx + 1) +
      "</td>" +
      '<td class="path-cells" title="' +
      escapeHtml(item.path.join(" → ")) +
      '">' +
      escapeHtml(item.path.join(" → ")) +
      "</td>" +
      "<td>" +
      item.cost +
      "</td>" +
      "<td>" +
      (isBest ? "✅" : "") +
      "</td>";
    tbody.appendChild(tr);
  });

  render6hrSummary(data.paths_within_6hr, data.paths_over_6hr, within6, over6);
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

// Init
document.addEventListener("DOMContentLoaded", () => {
  loadDestinations().catch((e) => {
    document.getElementById("execInfo").innerHTML =
      '<span style="color:#f85149">Load destinations failed. Is the backend running? ' +
      e.message +
      "</span>";
  });
  document.getElementById("runSearch").addEventListener("click", runSearch);
  document.getElementById("exportPdf").addEventListener("click", exportReport);
});
