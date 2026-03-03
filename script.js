/* ============================================================
   File Integrity Monitor — Zero-Knowledge Pure JS Logic
   Runs entirely in browser memory. Not a single byte is saved.
   ============================================================ */

// --------------- Application State in RAM ---------------
let sessionBaselineMap = null; // { "filepath": "sha256_hash" }
let currentDirHandle = null;
let stats = {
    scans: 0,
    alertsTriggered: 0,
    baselineTime: null
};
let scanHistory = []; // Array of { id, time, added, modified, deleted }

// --------------- DOM References ---------------
const $ = (s) => document.querySelector(s);
const dom = {
    statFiles: $('#stat-files'),
    statScans: $('#stat-scans'),
    statAlerts: $('#stat-alerts'),
    statStatus: $('#stat-status'),
    alertFeed: $('#alert-feed'),
    scanHistory: $('#scan-history'),
    fileTableBody: $('#file-table-body'),
    fileCount: $('#file-count'),
    dirInput: $('#dir-input'),
    btnScan: $('#btn-scan'),
    btnSetDir: $('#btn-set-dir'),
    integrityBar: $('#integrity-bar'),
    alertBadge: $('#alert-badge'),
    historyBadge: $('#history-badge'),
    baselineInfo: $('#baseline-info'),
};

// --------------- Toast System ---------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut .3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function setLoading(btn, loading) {
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

// ============================================================
//   NATIVE WEBCRYPTO & FILE SYSTEM API
// ============================================================

async function hashFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function crawlDirectory(dirHandle, path = '') {
    const fileHashes = {};
    for await (const entry of dirHandle.values()) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
            try {
                if (entry.name.startsWith('.')) continue; // skip hidden
                const file = await entry.getFile();
                fileHashes[entryPath] = await hashFile(file);
            } catch (e) { console.warn(`Skipping ${entryPath}`, e); }
        } else if (entry.kind === 'directory') {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const subHashes = await crawlDirectory(entry, entryPath);
            Object.assign(fileHashes, subHashes);
        }
    }
    return fileHashes;
}

// ============================================================
//   IN-MEMORY EXPERT CHANGE DETECTION ENGINE
// ============================================================

function detectChanges(currentHashes, baselineHashes) {
    const added = [];
    const modified = [];
    const deleted = [];

    // Check for Additions and Modifications
    for (const [path, hash] of Object.entries(currentHashes)) {
        if (!baselineHashes.hasOwnProperty(path)) {
            added.push({ path, hash });
        } else if (baselineHashes[path] !== hash) {
            modified.push({ path, hash });
        }
    }

    // Check for Deletions
    for (const [path, hash] of Object.entries(baselineHashes)) {
        if (!currentHashes.hasOwnProperty(path)) {
            deleted.push({ path, hash });
        }
    }

    return { added, modified, deleted, total: added.length + modified.length + deleted.length };
}

// ============================================================
//   UI UPDATERS
// ============================================================

function renderAlerts(changes) {
    const all = [
        ...changes.added.map(c => ({ ...c, type: 'added' })),
        ...changes.modified.map(c => ({ ...c, type: 'modified' })),
        ...changes.deleted.map(c => ({ ...c, type: 'deleted' })),
    ];

    dom.alertBadge.textContent = all.length;

    if (all.length === 0) {
        dom.alertFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>No changes detected — all files match RAM baseline</p>
      </div>`;
        return;
    }

    dom.alertFeed.innerHTML = all.map(a => `
    <div class="alert-item">
      <div class="alert-dot ${a.type}"></div>
      <div class="alert-content">
        <div class="alert-path">${a.path}</div>
        <div class="alert-meta">
          <span class="alert-type-badge ${a.type}">${a.type.toUpperCase()}</span>
          ${a.type === 'modified' ? `<span>Cryptographic hash mismatch</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderHistory() {
    dom.historyBadge.textContent = scanHistory.length;
    if (scanHistory.length === 0) return;

    // Show newest first
    const reversed = [...scanHistory].reverse();
    dom.scanHistory.innerHTML = reversed.map(h => {
        const isClean = h.changes.total === 0;
        return `
        <div class="timeline-item">
          <div class="timeline-dot ${isClean ? 'clean' : 'alert'}"></div>
          <div class="timeline-content">
            <div class="timeline-title ${isClean ? 'clean' : 'alert'}">
              Scan #${h.id} — ${isClean ? 'Verified Clean' : `${h.changes.total} Breach(es) Detected`}
            </div>
            <div class="timeline-details">
              ${h.time} · Memory scan complete
              ${!isClean ? ` · +${h.changes.added.length} / ~${h.changes.modified.length} / -${h.changes.deleted.length}` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
}

function renderFileTable(map) {
    const entries = Object.entries(map || {});
    dom.fileCount.textContent = entries.length;

    if (entries.length === 0) {
        dom.fileTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">No data in memory</td></tr>`;
        return;
    }

    dom.fileTableBody.innerHTML = entries.map(([path, hash]) => `
      <tr>
        <td class="path-cell">${path}</td>
        <td class="hash-cell" title="${hash}">${hash.substring(0, 20)}…</td>
        <td><span class="status-chip ok">● Tracked in RAM</span></td>
      </tr>
    `).join('');
}

// ============================================================
//   EVENT LISTENERS
// ============================================================

dom.btnSetDir.addEventListener('click', async () => {
    try {
        if (!window.showDirectoryPicker) {
            alert("Your browser does not support the File System Access API. Please use Chrome, Edge, Brave, or Opera.");
            return;
        }

        currentDirHandle = await window.showDirectoryPicker({ mode: 'read' });
        dom.dirInput.value = currentDirHandle.name;
        dom.btnScan.disabled = false;

        // Setup initial RAM baseline
        showToast("Generating secure baseline in memory...", "info");
        setLoading(dom.btnSetDir, true);

        sessionBaselineMap = await crawlDirectory(currentDirHandle);
        const fileCount = Object.keys(sessionBaselineMap).length;

        stats.baselineTime = new Date().toLocaleTimeString();
        dom.statFiles.textContent = fileCount;
        dom.baselineInfo.textContent = `Baseline RAM cache: ${fileCount} files · ${stats.baselineTime}`;
        dom.integrityBar.className = 'integrity-status secure';
        dom.integrityBar.innerHTML = `<span class="status-icon">🛡️</span><span>Tracking ${fileCount} files securely in session memory</span>`;
        dom.statStatus.textContent = 'Secure';

        renderFileTable(sessionBaselineMap);
        showToast(`Baseline established. ${fileCount} files hashed into RAM.`, "success");

    } catch (err) {
        if (err.name !== 'AbortError') showToast("Browser directory access Error.", "error");
    } finally {
        setLoading(dom.btnSetDir, false);
    }
});

dom.btnScan.addEventListener('click', async () => {
    if (!currentDirHandle || !sessionBaselineMap) return;

    setLoading(dom.btnScan, true);

    try {
        showToast("Comparing local files against RAM baseline...", "info");
        stats.scans++;
        dom.statScans.textContent = stats.scans;

        // 1. Compute new hashes from disk
        const currentHashes = await crawlDirectory(currentDirHandle);

        // 2. Diff engine runs locally in memory
        const changes = detectChanges(currentHashes, sessionBaselineMap);

        // 3. Update alerts history arrays
        if (changes.total > 0) stats.alertsTriggered++;
        dom.statAlerts.textContent = stats.alertsTriggered;

        scanHistory.push({
            id: stats.scans,
            time: new Date().toLocaleTimeString(),
            changes: changes
        });

        // 4. Update UI statuses
        renderAlerts(changes);
        renderHistory();

        if (changes.total === 0) {
            showToast("Scan perfectly clean. File integrity intact.", "success");
            dom.integrityBar.className = 'integrity-status secure';
            dom.integrityBar.innerHTML = `<span class="status-icon">🛡️</span><span>File System matches RAM. No breaches.</span>`;
            dom.statStatus.textContent = 'Secure';
        } else {
            showToast(`ALERT: Integrity violation! ${changes.total} file changes isolated.`, "warning");
            dom.integrityBar.className = 'integrity-status breach';
            dom.integrityBar.innerHTML = `<span class="status-icon">🚨</span><span>Data integrity compromised! Check alerts below.</span>`;
            dom.statStatus.textContent = 'Alert!';
        }

    } catch (e) {
        showToast("Scan failed.", "error");
        console.error(e);
    } finally {
        setLoading(dom.btnScan, false);
    }
});
