"""
File Integrity Monitor — Backend
=================================
Monitors a target directory, computes SHA-256 hashes for every file,
and detects additions, modifications, and deletions between scans.

Tech: Python · Flask · hashlib · os
"""

import hashlib
import json
import os
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASELINE_FILE = os.path.join(BASE_DIR, "baseline.json")

# In-memory state
state = {
    "monitored_dir": os.path.join(BASE_DIR, "sample_data"),
    "baseline": {},          # {relative_path: sha256_hex}
    "baseline_time": None,
    "history": [],           # list of scan result dicts
    "total_scans": 0,
    "total_alerts": 0,
}

# ---------------------------------------------------------------------------
# Core engine
# ---------------------------------------------------------------------------

def sha256_of_file(filepath: str) -> str:
    """Return the SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def scan_directory(directory: str) -> dict:
    """Walk *directory* recursively and return {relative_path: sha256}."""
    file_hashes = {}
    directory = os.path.abspath(directory)
    for root, _dirs, files in os.walk(directory):
        for fname in files:
            full_path = os.path.join(root, fname)
            rel_path = os.path.relpath(full_path, directory)
            try:
                file_hashes[rel_path] = sha256_of_file(full_path)
            except (PermissionError, OSError):
                file_hashes[rel_path] = "ERROR"
    return file_hashes


def detect_changes(baseline: dict, current: dict) -> dict:
    """Compare *baseline* against *current* scan and return categorised changes."""
    added, modified, deleted = [], [], []

    for path, cur_hash in current.items():
        if path not in baseline:
            added.append({"path": path, "hash": cur_hash})
        elif baseline[path] != cur_hash:
            modified.append({
                "path": path,
                "old_hash": baseline[path],
                "new_hash": cur_hash,
            })

    for path in baseline:
        if path not in current:
            deleted.append({"path": path, "old_hash": baseline[path]})

    return {"added": added, "modified": modified, "deleted": deleted}

# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def save_baseline_to_disk():
    data = {
        "monitored_dir": state["monitored_dir"],
        "baseline": state["baseline"],
        "baseline_time": state["baseline_time"],
    }
    with open(BASELINE_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_baseline_from_disk():
    if os.path.exists(BASELINE_FILE):
        with open(BASELINE_FILE) as f:
            data = json.load(f)
        state["baseline"] = data.get("baseline", {})
        state["baseline_time"] = data.get("baseline_time")
        state["monitored_dir"] = data.get("monitored_dir", state["monitored_dir"])

# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/scan", methods=["POST"])
def api_scan():
    """Run a scan, compare against baseline, return changes."""
    mon_dir = state["monitored_dir"]
    if not os.path.isdir(mon_dir):
        return jsonify({"error": f"Directory not found: {mon_dir}"}), 400

    current = scan_directory(mon_dir)
    changes = detect_changes(state["baseline"], current)

    total_changes = len(changes["added"]) + len(changes["modified"]) + len(changes["deleted"])
    state["total_scans"] += 1
    state["total_alerts"] += total_changes

    scan_record = {
        "id": state["total_scans"],
        "timestamp": datetime.now().isoformat(),
        "files_scanned": len(current),
        "changes": changes,
        "total_changes": total_changes,
        "status": "clean" if total_changes == 0 else "alert",
    }
    state["history"].insert(0, scan_record)
    # Keep last 50 scans
    state["history"] = state["history"][:50]

    return jsonify(scan_record)


@app.route("/api/baseline", methods=["POST"])
def api_set_baseline():
    """Save the current directory state as the baseline."""
    mon_dir = state["monitored_dir"]
    if not os.path.isdir(mon_dir):
        return jsonify({"error": f"Directory not found: {mon_dir}"}), 400

    current = scan_directory(mon_dir)
    state["baseline"] = current
    state["baseline_time"] = datetime.now().isoformat()
    save_baseline_to_disk()

    return jsonify({
        "message": "Baseline saved",
        "files": len(current),
        "timestamp": state["baseline_time"],
    })


@app.route("/api/baseline", methods=["GET"])
def api_get_baseline():
    """Return current baseline metadata."""
    return jsonify({
        "files": len(state["baseline"]),
        "timestamp": state["baseline_time"],
        "directory": state["monitored_dir"],
        "entries": state["baseline"],
    })


@app.route("/api/history", methods=["GET"])
def api_history():
    """Return scan history."""
    return jsonify(state["history"])


@app.route("/api/stats", methods=["GET"])
def api_stats():
    """Dashboard summary stats."""
    has_baseline = len(state["baseline"]) > 0
    last_scan = state["history"][0]["timestamp"] if state["history"] else None
    last_status = state["history"][0]["status"] if state["history"] else "no_scan"

    return jsonify({
        "monitored_dir": state["monitored_dir"],
        "baseline_files": len(state["baseline"]),
        "baseline_time": state["baseline_time"],
        "total_scans": state["total_scans"],
        "total_alerts": state["total_alerts"],
        "last_scan": last_scan,
        "last_status": last_status,
        "has_baseline": has_baseline,
    })


@app.route("/api/config", methods=["GET"])
def api_get_config():
    return jsonify({"monitored_dir": state["monitored_dir"]})


@app.route("/api/config", methods=["POST"])
def api_set_config():
    data = request.get_json(force=True)
    new_dir = data.get("monitored_dir", "").strip()
    if not new_dir:
        return jsonify({"error": "monitored_dir is required"}), 400
    if not os.path.isdir(new_dir):
        return jsonify({"error": f"Directory not found: {new_dir}"}), 400
    state["monitored_dir"] = os.path.abspath(new_dir)
    # Reset baseline when directory changes
    state["baseline"] = {}
    state["baseline_time"] = None
    state["history"] = []
    state["total_scans"] = 0
    state["total_alerts"] = 0
    return jsonify({"message": "Config updated", "monitored_dir": state["monitored_dir"]})


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    load_baseline_from_disk()
    print("\n🛡️  File Integrity Monitor")
    print(f"   Monitoring : {state['monitored_dir']}")
    print(f"   Dashboard  : http://localhost:5050\n")
    app.run(host="0.0.0.0", port=5050, debug=True)
