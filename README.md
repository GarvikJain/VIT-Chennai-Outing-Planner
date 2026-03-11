# VIT Chennai Pathfinder – Web UI

Interactive web app for finding shortest paths from **VIT Chennai** to destinations using **A\* search**, with a path tree and graph map view.

## Features

- **Backend (Python/Flask)**  
  - Loads graph from CSV (nodes, weighted edges, node dwell times).  
  - Source: **VIT Chennai**; lists all destination nodes.  
  - Generates simple paths to the selected destination; cost = edge weights + node dwell times (source excluded).  
  - A\* with **g(n)** = travel cost + node time, **h(n)** = admissible heuristic (min direct edge to goal).  
  - Optional **mandatory intermediate nodes**; only paths through all of them are considered.  
  - Returns: all paths, best path, total cost, nodes explored, execution time.

- **Frontend**  
  - Dropdown to select **destination**.  
  - Multi-select for **mandatory nodes**.  
  - **Run A\* Search** button.  
  - Table of all paths with cost; **best path highlighted**.  
  - Execution info (cost, nodes explored, time).  
  - **Path tree**: root = VIT Chennai, branches = paths, A\* path in green, others gray; zoom/pan.  
  - **Graph map**: full graph with chosen path highlighted; edge weights and node times in tooltips; zoom/pan.  
  - Export report as text file.

## Folder structure

```
vit_pathfinder_web/
├── backend/
│   ├── app.py           # Flask API
│   └── graph_loader.py   # Graph load, A*, paths, trie/graph data
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── templates/
│   └── index.html
├── requirements.txt
└── README.md
```

The app expects the CSV file **VIT_complete_graph.csv** in the **parent** of `vit_pathfinder_web` (e.g. `24BAI1054/VIT_complete_graph.csv`). You can override with env var `VIT_GRAPH_CSV`.

## How to run

1. **Create and activate a virtual environment (recommended):**
   ```bash
   cd vit_pathfinder_web
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Ensure the CSV is in place:**  
   Put `VIT_complete_graph.csv` in the parent directory of `vit_pathfinder_web` (e.g. `24BAI1054/`), or set:
   ```bash
   set VIT_GRAPH_CSV=C:\path\to\VIT_complete_graph.csv
   ```

4. **Start the server (from `vit_pathfinder_web`):**
   ```bash
   python backend/app.py
   ```
   Or from inside `backend/`:
   ```bash
   cd backend
   python app.py
   ```
   Server runs at **http://127.0.0.1:5000** (or http://0.0.0.0:5000).

5. **Open in browser:**  
   Go to **http://127.0.0.1:5000**. Select a destination, optionally mandatory nodes, then click **Run A\* Search**.

## CSV format

- Columns: `source`, `target`, `distance_km`, `travel_time_minutes`
- Edge weight used: `travel_time_minutes`
- Node “time spent” is not in the CSV; the code uses a default (e.g. 30 min per node, 0 at source). Change this in `graph_loader.py` if you have different values.

## Optional: PDF-style export

Use the **Export report (text summary)** button to download a `.txt` report. For a real PDF, print the page (Ctrl+P) and choose “Save as PDF”.
