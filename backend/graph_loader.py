"""
Graph loader and A* search for VIT Chennai pathfinder.
Loads CSV, builds weighted graph and node_time dict, enumerates paths, runs A*.
"""

import csv
import heapq
import itertools
import time as _time
from collections import defaultdict
from collections import deque

SOURCE_NODE = "VIT Chennai"


def load_graph_and_times(csv_path: str):
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
    return sorted(all_nodes - {source})


def path_cost(path, graph, node_time, source=SOURCE_NODE):
    cost = 0.0
    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]
        cost += graph.get(u, {}).get(v, float("inf"))
    for n in path:
        if n != source:
            cost += node_time.get(n, 0.0)
    return cost


def all_simple_paths_to_dest(graph, source, dest, cutoff=10, max_paths=2000, time_limit_sec=None):
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
    return mandatory <= set(path)


def astar_with_explored(graph, node_time, source, dest, mandatory=None):
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
    nodes_explored = set()

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


def bfs_with_explored(graph, node_time, source, dest, mandatory=None):
    mandatory = list(dict.fromkeys(mandatory or []))
    mand_idx = {n: i for i, n in enumerate(mandatory)}
    all_mask = (1 << len(mandatory)) - 1

    start_mask = 0
    if source in mand_idx:
        start_mask |= 1 << mand_idx[source]

    start = (source, start_mask)
    q = deque([start])
    parent = {start: None}
    path_back = {start: [source]}
    explored = set()

    while q:
        u, mask = q.popleft()
        state = (u, mask)
        explored.add(state)
        path_so_far = path_back[state]
        if u == dest and mask == all_mask:
            return path_so_far, path_cost(path_so_far, graph, node_time, source=source), len(explored)
        for v in graph.get(u, {}):
            if v in path_so_far:
                continue
            new_mask = mask | (1 << mand_idx[v] if v in mand_idx else 0)
            nxt = (v, new_mask)
            if nxt in parent:
                continue
            parent[nxt] = state
            path_back[nxt] = path_so_far + [v]
            q.append(nxt)

    return None, float("inf"), len(explored)


def dfs_with_explored(graph, node_time, source, dest, mandatory=None):
    mandatory = list(dict.fromkeys(mandatory or []))
    mand_idx = {n: i for i, n in enumerate(mandatory)}
    all_mask = (1 << len(mandatory)) - 1

    start_mask = 0
    if source in mand_idx:
        start_mask |= 1 << mand_idx[source]

    stack = [(source, start_mask, [source])]
    explored = set()
    seen = set()
    seen.add((source, start_mask))

    while stack:
        u, mask, path_so_far = stack.pop()
        state = (u, mask)
        explored.add(state)
        if u == dest and mask == all_mask:
            return path_so_far, path_cost(path_so_far, graph, node_time, source=source), len(explored)
        neighbors = list(graph.get(u, {}).keys())
        neighbors.reverse()
        for v in neighbors:
            if v in path_so_far:
                continue
            new_mask = mask | (1 << mand_idx[v] if v in mand_idx else 0)
            nxt = (v, new_mask)
            if nxt in seen:
                continue
            seen.add(nxt)
            stack.append((v, new_mask, path_so_far + [v]))

    return None, float("inf"), len(explored)


def dijkstra_with_explored(graph, node_time, source, dest, mandatory=None):
    mandatory = list(dict.fromkeys(mandatory or []))
    mand_idx = {n: i for i, n in enumerate(mandatory)}
    all_mask = (1 << len(mandatory)) - 1

    start_mask = 0
    if source in mand_idx:
        start_mask |= 1 << mand_idx[source]

    start = (source, start_mask)
    dist = {start: 0.0}
    parent = {start: None}
    path_back = {start: [source]}
    heap = [(0.0, start)]
    explored = set()

    while heap:
        g, state = heapq.heappop(heap)
        if g > dist.get(state, float("inf")):
            continue
        u, mask = state
        explored.add(state)
        path_so_far = path_back[state]
        if u == dest and mask == all_mask:
            return path_so_far, g, len(explored)

        for v, w in graph.get(u, {}).items():
            if v in path_so_far:
                continue
            new_mask = mask | (1 << mand_idx[v] if v in mand_idx else 0)
            nxt = (v, new_mask)
            node_cost = node_time.get(v, 0.0) if v != source else 0.0
            new_g = g + w + node_cost
            if new_g < dist.get(nxt, float("inf")):
                dist[nxt] = new_g
                parent[nxt] = state
                path_back[nxt] = path_so_far + [v]
                heapq.heappush(heap, (new_g, nxt))

    return None, float("inf"), len(explored)


def bellman_ford_with_explored(graph, node_time, source, dest, mandatory=None):
    mandatory = list(dict.fromkeys(mandatory or []))
    mand_idx = {n: i for i, n in enumerate(mandatory)}
    all_mask = (1 << len(mandatory)) - 1

    masks = range(1 << len(mandatory))
    states = [(node, mask) for node in graph.keys() for mask in masks]
    edges = []
    for u, neighbors in graph.items():
        for v, w in neighbors.items():
            node_cost = node_time.get(v, 0.0) if v != source else 0.0
            for mask in masks:
                new_mask = mask | (1 << mand_idx[v] if v in mand_idx else 0)
                edges.append(((u, mask), (v, new_mask), w + node_cost))

    start_mask = 0
    if source in mand_idx:
        start_mask |= 1 << mand_idx[source]
    start = (source, start_mask)
    dist = {s: float("inf") for s in states}
    parent = {start: None}
    dist[start] = 0.0

    explored = set()
    for _ in range(max(0, len(states) - 1)):
        changed = False
        for s_from, s_to, w in edges:
            if dist[s_from] == float("inf"):
                continue
            explored.add(s_from)
            cand = dist[s_from] + w
            if cand < dist[s_to]:
                dist[s_to] = cand
                parent[s_to] = s_from
                changed = True
        if not changed:
            break

    goal_state = None
    goal_dist = float("inf")
    for s in states:
        node, mask = s
        if node == dest and mask == all_mask and dist[s] < goal_dist:
            goal_dist = dist[s]
            goal_state = s

    if not goal_state or goal_dist == float("inf"):
        return None, float("inf"), len(explored)

    # FIXED: cycle guard in path reconstruction
    rev = []
    cur = goal_state
    visited_states = set()
    while cur is not None:
        if cur in visited_states:
            break
        visited_states.add(cur)
        rev.append(cur[0])
        cur = parent.get(cur)
    path = list(reversed(rev))
    return path, goal_dist, len(explored)


def floyd_warshall_with_path(graph, node_time, source, dest, mandatory=None):
    mandatory = list(dict.fromkeys(mandatory or []))
    nodes = list(graph.keys())
    n = len(nodes)
    idx = {node: i for i, node in enumerate(nodes)}

    if source not in idx or dest not in idx:
        return None, float("inf"), 0

    inf = float("inf")
    dist = [[inf] * n for _ in range(n)]
    nxt = [[None] * n for _ in range(n)]

    for i in range(n):
        dist[i][i] = 0.0
        nxt[i][i] = i

    for u, neighbors in graph.items():
        iu = idx[u]
        for v, w in neighbors.items():
            iv = idx[v]
            cost = w + (node_time.get(v, 0.0) if v != source else 0.0)
            if cost < dist[iu][iv]:
                dist[iu][iv] = cost
                nxt[iu][iv] = iv

    for k in range(n):
        for i in range(n):
            if dist[i][k] == inf:
                continue
            dik = dist[i][k]
            for j in range(n):
                cand = dik + dist[k][j]
                if cand < dist[i][j]:
                    dist[i][j] = cand
                    nxt[i][j] = nxt[i][k]

    def build_segment(u_node, v_node):
        if u_node not in idx or v_node not in idx:
            return None
        i = idx[u_node]
        j = idx[v_node]
        if nxt[i][j] is None:
            return None
        segment = [u_node]
        while i != j:
            i = nxt[i][j]
            if i is None:
                return None
            segment.append(nodes[i])
            if len(segment) > n + 5:
                return None
        return segment

    def build_via_order(order):
        route_nodes = [source] + list(order) + [dest]
        full = [route_nodes[0]]
        total = 0.0
        for a, b in zip(route_nodes, route_nodes[1:]):
            seg = build_segment(a, b)
            if not seg:
                return None, inf
            total += dist[idx[a]][idx[b]]
            full.extend(seg[1:])
        return full, total

    explored_estimate = n ** 3
    if not mandatory:
        path = build_segment(source, dest)
        if not path:
            return None, float("inf"), explored_estimate
        return path, dist[idx[source]][idx[dest]], explored_estimate

    if len(mandatory) > 7:
        return None, float("inf"), explored_estimate

    best_path, best_cost = None, inf
    for order in itertools.permutations(mandatory):
        path, cost = build_via_order(order)
        if path and cost < best_cost:
            best_path, best_cost = path, cost

    if not best_path:
        return None, float("inf"), explored_estimate
    return best_path, best_cost, explored_estimate


def compare_algorithms(graph, node_time, source, dest, mandatory=None):
    specs = [
        ("A*", astar_with_explored),
        ("BFS", bfs_with_explored),
        ("DFS", dfs_with_explored),
        ("Dijkstra", dijkstra_with_explored),
        ("Bellman-Ford", bellman_ford_with_explored),
        ("Floyd-Warshall", floyd_warshall_with_path),
    ]

    results = []
    for name, fn in specs:
        t0 = _time.perf_counter()
        path, cost, explored = fn(graph, node_time, source, dest, mandatory)
        exec_ms = round((_time.perf_counter() - t0) * 1000, 2)
        available = bool(path) and cost != float("inf")
        results.append({
            "name": name,
            "path": path or [],
            "cost": round(cost, 2) if available else None,
            "execution_ms": exec_ms,
            "nodes_explored": explored,
            "available": available,
            "over_6hr": bool(available and cost > 360),
        })

    available_results = [r for r in results if r["available"]]
    best = None
    if available_results:
        best = min(available_results, key=lambda x: (x["cost"], x["execution_ms"]))
    return results, (best["name"] if best else None)


def build_path_trie(paths, best_path_set, source=SOURCE_NODE):
    nodes_list = []
    edges_list = []
    node_ids = {}
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
            ensure_node(prefix, label, is_best)
            if i > 0:
                prev_prefix = path[:i]
                from_id = node_ids.get(tuple(prev_prefix))
                if from_id:
                    edges_list.append({"from": from_id, "to": node_ids[tuple(prefix)]})

    # FIXED: no side-effect inside list comprehension
    seen = set()
    unique_edges = []
    for e in edges_list:
        key = (e["from"], e["to"])
        if key not in seen:
            seen.add(key)
            unique_edges.append(e)

    return {"nodes": nodes_list, "edges": unique_edges}


def graph_for_vis(graph, node_time, path_set=None, source=SOURCE_NODE, max_edges=800):
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