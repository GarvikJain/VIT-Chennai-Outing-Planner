"""
Graph loader and A* search for VIT Chennai pathfinder.
Loads CSV, builds weighted graph and node_time dict, enumerates paths, runs A*.
"""

import csv
import heapq
from collections import defaultdict

SOURCE_NODE = "VIT Chennai"


def load_graph_and_times(csv_path: str):
    """
    Read CSV: source, target, distance_km, travel_time_minutes.
    Returns:
      - graph: dict[u][v] = edge weight (travel_time_minutes)
      - node_time: dict[node] = minutes spent at node (default 30, source 0)
      - all_nodes: set of node names
    """
    graph = defaultdict(dict)
    all_nodes = set()

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            u = row["source"].strip()
            v = row["target"].strip()
            w = float(row["travel_time_minutes"])
            graph[u][v] = w
            all_nodes.add(u)
            all_nodes.add(v)

    for n in all_nodes:
        if n not in graph:
            graph[n] = {}

    default_visit_minutes = 30.0
    node_time = {n: default_visit_minutes for n in all_nodes}
    node_time[SOURCE_NODE] = 0.0

    return dict(graph), node_time, all_nodes


def get_destinations(all_nodes, source=SOURCE_NODE):
    """Return sorted list of all nodes except source."""
    return sorted(all_nodes - {source})


def path_cost(path, graph, node_time, source=SOURCE_NODE):
    """
    Total cost = sum(edge weights) + sum(node_time for each node excluding source).
    """
    cost = 0.0
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        cost += graph.get(u, {}).get(v, float("inf"))
    for n in path:
        if n != source:
            cost += node_time.get(n, 0.0)
    return cost


def all_simple_paths_to_dest(graph, source, dest, cutoff=10, max_paths=2000, time_limit_sec=None):
    """
    Generate simple paths from source to dest (DFS). Yields path lists.
    cutoff: max path length; max_paths: stop after this many.
    time_limit_sec: stop after this many seconds (avoids hanging).
    """
    import time as _time
    t0 = _time.perf_counter()
    if source == dest:
        yield [source]
        return
    count = 0
    stack = [(source, [source], {source})]
    while stack and count < max_paths:
        if time_limit_sec and (_time.perf_counter() - t0) > time_limit_sec:
            return
        u, path, visited = stack.pop()
        for v in graph.get(u, {}):
            if v in visited:
                continue
            if v == dest:
                yield path + [v]
                count += 1
                continue
            if len(path) + 1 > cutoff:
                continue
            stack.append((v, path + [v], visited | {v}))
    return


def path_visits_all(path, mandatory):
    """True if path contains every mandatory node."""
    return mandatory <= set(path)


def astar_with_explored(graph, node_time, source, dest, mandatory=None):
    """
    A* from source to dest.
    g(n) = path cost (edges + node times, source excluded).
    h(n) = min direct edge to dest (admissible).
    Returns: (best_path, total_cost, nodes_explored_count).
    If mandatory is set, goal only when at dest and all mandatory visited.
    """
    mandatory = set(mandatory or [])
    min_to_dest = {}
    for u, neighbors in graph.items():
        if dest in neighbors:
            min_to_dest[u] = min(min_to_dest.get(u, float("inf")), neighbors[dest])
    min_to_dest.setdefault(dest, 0.0)

    def h(n):
        return min_to_dest.get(n, 0.0)

    start_state = (source, frozenset())
    g_score = {start_state: 0.0}
    path_back = {start_state: [source]}
    open_heap = [(0.0 + h(source), 0.0, start_state)]
    nodes_explored = set()  # (node, mand_vis) we pop

    while open_heap:
        f, g, (u, mand_vis) = heapq.heappop(open_heap)
        nodes_explored.add((u, mand_vis))
        path_so_far = path_back[(u, mand_vis)]

        if u == dest and (mandatory <= mand_vis):
            return path_so_far, g, len(nodes_explored)

        if g > g_score.get((u, mand_vis), float("inf")):
            continue

        for v, w in graph.get(u, {}).items():
            if v in path_so_far:
                continue
            edge_cost = w
            node_cost = node_time.get(v, 0.0) if v != source else 0.0
            new_g = g + edge_cost + node_cost
            new_mand = mand_vis | ({v} if v in mandatory else set())
            new_state = (v, frozenset(new_mand))
            if new_g < g_score.get(new_state, float("inf")):
                g_score[new_state] = new_g
                path_back[new_state] = path_so_far + [v]
                heapq.heappush(open_heap, (new_g + h(v), new_g, new_state))

    return None, float("inf"), len(nodes_explored)


def build_path_trie(paths, best_path_set, source=SOURCE_NODE):
    """
    Build a trie of path prefixes for tree visualization.
    Returns: { "nodes": [ {id, label, isBest, pathFromRoot} ], "edges": [ {from, to, weight?} ] }
    best_path_set = set of nodes in the best (A*) path for highlighting.
    """
    nodes_list = []
    edges_list = []
    node_ids = {}  # (path_prefix_tuple) -> id string
    _counter = [0]

    def next_id():
        _counter[0] += 1
        return "t_" + str(_counter[0])

    def ensure_node(path_prefix, label, is_best):
        key = tuple(path_prefix)
        if key not in node_ids:
            nid = next_id()
            node_ids[key] = nid
            nodes_list.append({
                "id": nid,
                "label": (label[:40] + "...") if len(label) > 40 else label,
                "isBest": is_best,
            })
        return node_ids[key]

    for path in paths:
        for i in range(len(path)):
            prefix = path[: i + 1]
            label = path[i]
            is_best = path[i] in best_path_set
            nid = ensure_node(prefix, label, is_best)
            if i > 0:
                prev_prefix = path[:i]
                from_id = node_ids.get(tuple(prev_prefix))
                if from_id:
                    edges_list.append({"from": from_id, "to": nid})
    seen = set()
    unique_edges = [e for e in edges_list if (e["from"], e["to"]) not in seen and not seen.add((e["from"], e["to"]))]
    return {"nodes": nodes_list, "edges": unique_edges}


def graph_for_vis(graph, node_time, path_set=None, source=SOURCE_NODE, max_edges=800):
    """
    Build nodes and edges for vis-network graph view.
    path_set: set of node names on the chosen path (to highlight).
    Returns: { "nodes": [ {id, label, title, color?} ], "edges": [ {from, to, weight, title} ] }
    """
    path_set = path_set or set()
    nodes_list = []
    edges_list = []
    for u, neighbors in graph.items():
        nodes_list.append({
            "id": u,
            "label": u[:25] + "..." if len(u) > 25 else u,
            "title": f"{u}\nTime at node: {node_time.get(u, 0)} min",
            "color": "#2ecc71" if u in path_set else "#bdc3c7",
        })
        for v, w in neighbors.items():
            if len(edges_list) >= max_edges:
                break
            on_path = u in path_set and v in path_set
            edges_list.append({
                "from": u,
                "to": v,
                "weight": w,
                "title": f"{w:.1f} min",
                "color": "#2ecc71" if on_path else "#95a5a6",
            })
        if len(edges_list) >= max_edges:
            break
    return {"nodes": nodes_list, "edges": edges_list}
