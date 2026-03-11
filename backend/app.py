"""
Flask backend for VIT Chennai Pathfinder Web UI.
Serves graph data, destinations, and A* search results.
"""

import os
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from graph_loader import (
    load_graph_and_times,
    get_destinations,
    path_cost,
    all_simple_paths_to_dest,
    path_visits_all,
    astar_with_explored,
    build_path_trie,
    graph_for_vis,
    SOURCE_NODE,
)

# CSV path: same folder as this file's parent, or env
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
# CSV: prefer 24BAI1054/VIT_complete_graph.csv (parent of vit_pathfinder_web)
CSV_PATH = os.environ.get("VIT_GRAPH_CSV", os.path.join(ROOT, "..", "VIT_complete_graph.csv"))
if not os.path.isfile(CSV_PATH):
    CSV_PATH = os.path.join(ROOT, "VIT_complete_graph.csv")
if not os.path.isfile(CSV_PATH):
    CSV_PATH = os.path.join(BASE, "VIT_complete_graph.csv")

# Paths relative to this file (backend/app.py) so running from any CWD works
_app_dir = os.path.dirname(os.path.abspath(__file__))
app = Flask(
    __name__,
    static_folder=os.path.join(_app_dir, "..", "static"),
    template_folder=os.path.join(_app_dir, "..", "templates"),
)
CORS(app)

# Load graph once at startup
_graph, _node_time, _all_nodes = None, None, None


def get_data():
    global _graph, _node_time, _all_nodes
    if _graph is None:
        _graph, _node_time, _all_nodes = load_graph_and_times(CSV_PATH)
    return _graph, _node_time, _all_nodes


@app.route("/")
def index():
    return send_from_directory(app.template_folder, "index.html")


@app.route("/api/destinations", methods=["GET"])
def api_destinations():
    """Return list of all destination nodes (excluding source)."""
    _, _, all_nodes = get_data()
    dests = get_destinations(all_nodes)
    return jsonify({"destinations": dests, "source": SOURCE_NODE})


@app.route("/api/graph", methods=["GET"])
def api_graph():
    """Return full graph for map view: nodes and edges with weights and node times."""
    graph, node_time, _ = get_data()
    path_set = set()
    data = graph_for_vis(graph, node_time, path_set, max_edges=2000)
    return jsonify(data)


@app.route("/api/search", methods=["POST"])
def api_search():
    """
    Body: { "destination": str, "mandatory": [str] }
    Returns: all_paths (with cost), best_path, total_cost, nodes_explored, execution_ms, tree_data, graph_data.
    """
    graph, node_time, all_nodes = get_data()
    body = request.get_json() or {}
    destination = (body.get("destination") or "").strip()
    mandatory = [m.strip() for m in (body.get("mandatory") or []) if m.strip()]

    if not destination or destination not in all_nodes:
        return jsonify({"error": "Invalid or missing destination"}), 400

    t0 = time.perf_counter()
    # A* first (fast) – always run so we have a best path to show
    best_path, total_cost, nodes_explored = astar_with_explored(
        graph, node_time, SOURCE_NODE, destination, mandatory
    )
    # Start with A* best path so the UI always has at least one path to display
    paths = []
    if best_path and total_cost != float("inf"):
        paths.append({"path": best_path, "cost": round(total_cost, 2)})
    # Optionally add more paths with a short time cap (1 sec) so response is fast
    best_set = set(tuple(best_path) if best_path else ())
    for path in all_simple_paths_to_dest(
        graph, SOURCE_NODE, destination, cutoff=8, max_paths=400, time_limit_sec=1.0
    ):
        if path_visits_all(path, set(mandatory)) and tuple(path) not in best_set:
            cost = path_cost(path, graph, node_time)
            paths.append({"path": path, "cost": round(cost, 2)})
            best_set.add(tuple(path))
    paths.sort(key=lambda x: x["cost"])
    t1 = time.perf_counter()
    execution_ms = round((t1 - t0) * 1000, 2)

    # Paths within 6 hrs (≤360 min) vs over 6 hrs
    SIX_HRS_MIN = 360
    paths_within_6hr = [p for p in paths if p["cost"] <= SIX_HRS_MIN]
    paths_over_6hr = [p for p in paths if p["cost"] > SIX_HRS_MIN]

    best_path_set = set(best_path) if best_path else set()
    tree_data = build_path_trie([p["path"] for p in paths], best_path_set)
    graph_data = graph_for_vis(graph, node_time, best_path_set, max_edges=1500)

    return jsonify({
        "all_paths": paths,
        "best_path": best_path,
        "total_cost": round(total_cost, 2) if total_cost != float("inf") else None,
        "nodes_explored": nodes_explored,
        "execution_ms": execution_ms,
        "paths_within_6hr": paths_within_6hr,
        "paths_over_6hr": paths_over_6hr,
        "paths_within_6hr_count": len(paths_within_6hr),
        "paths_over_6hr_count": len(paths_over_6hr),
        "tree_data": tree_data,
        "graph_data": graph_data,
        "destination": destination,
        "mandatory": mandatory,
    })


if __name__ == "__main__":
    get_data()  # preload
    app.run(host="0.0.0.0", port=5000, debug=True)
