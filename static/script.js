/* ============================================================
   File Integrity Monitor — Client-Side Logic
   ============================================================ */

const API = {
    scan: () => fetch('/api/scan', { method: 'POST' }).then(r => r.json()),
    baseline: () => fetch('/api/baseline', { method: 'POST' }).then(r => r.json()),
    getBase: () => fetch('/api/baseline').then(r => r.json()),
    stats: () => fetch('/api/stats').then(r => r.json()),
    history: () => fetch('/api/history').then(r => r.json()),
    getConf: () => fetch('/api/config').then(r => r.json()),
    setConf: (dir) => fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitored_dir: dir }),
    }).then(r => r.json()),
};

// --------------- DOM References ---------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

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
    btnBaseline: $('#btn-baseline'),
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

// --------------- Animated Counter ---------------
function animateValue(el, end, duration = 600) {
    const start = parseInt(el.textContent) || 0;
    if (start === end) return;
    const range = end - start;
    const startTime = performance.now();
    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.round(start + range * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// --------------- Loading State ---------------
function setLoading(btn, loading) {
    if (loading) {
        btn.classList.add('loading');
    } else {
        btn.classList.remove('loading');
    }
}

// --------------- Render Stats ---------------
async function refreshStats() {
    try {
        const s = await API.stats();
        animateValue(dom.statFiles, s.baseline_files);
        animateValue(dom.statScans, s.total_scans);
        animateValue(dom.statAlerts, s.total_alerts);

        // Status text
        if (!s.has_baseline) {
            dom.statStatus.textContent = 'No Baseline';
            setIntegrityBar('unknown', '🔘', 'No baseline set — click "Set Baseline" to begin monitoring');
        } else if (s.last_status === 'clean') {
            dom.statStatus.textContent = 'Secure';
            setIntegrityBar('secure', '🛡️', 'All files match the baseline — integrity verified');
        } else if (s.last_status === 'alert') {
            dom.statStatus.textContent = 'Alert!';
            setIntegrityBar('breach', '🚨', 'File integrity changes detected — review alerts below');
        } else {
            dom.statStatus.textContent = 'Pending';
            setIntegrityBar('unknown', '🔘', 'Run a scan to check file integrity');
        }

        // Baseline info
        if (s.baseline_time) {
            const d = new Date(s.baseline_time);
            dom.baselineInfo.textContent = `Baseline: ${s.baseline_files} files · ${d.toLocaleString()}`;
        } else {
            dom.baselineInfo.textContent = 'No baseline set';
        }
    } catch (e) {
        console.error('Stats error:', e);
    }
}

function setIntegrityBar(cls, icon, text) {
    dom.integrityBar.className = `integrity-status ${cls}`;
    dom.integrityBar.innerHTML = `<span class="status-icon">${icon}</span><span>${text}</span>`;
}

// --------------- Render Alert Feed ---------------
function renderAlerts(changes) {
    if (!changes) return;
    const all = [
        ...changes.added.map(c => ({ ...c, type: 'added' })),
        ...changes.modified.map(c => ({ ...c, type: 'modified' })),
        ...changes.deleted.map(c => ({ ...c, type: 'deleted' })),
    ];

    if (all.length === 0) {
        dom.alertFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <p>No changes detected — all files intact</p>
      </div>`;
        dom.alertBadge.textContent = '0';
        return;
    }

    dom.alertBadge.textContent = all.length;
    dom.alertFeed.innerHTML = all.map(a => `
    <div class="alert-item">
      <div class="alert-dot ${a.type}"></div>
      <div class="alert-content">
        <div class="alert-path">${escHtml(a.path)}</div>
        <div class="alert-meta">
          <span class="alert-type-badge ${a.type}">${a.type}</span>
          ${a.type === 'modified' ? `<span>Hash changed</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// --------------- Render Scan History ---------------
async function refreshHistory() {
    try {
        const history = await API.history();
        dom.historyBadge.textContent = history.length;

        if (history.length === 0) {
            dom.scanHistory.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>No scans yet — run your first scan</p>
        </div>`;
            return;
        }

        dom.scanHistory.innerHTML = history.map(h => {
            const d = new Date(h.timestamp);
            const time = d.toLocaleTimeString();
            return `
        <div class="timeline-item">
          <div class="timeline-dot ${h.status}"></div>
          <div class="timeline-content">
            <div class="timeline-title ${h.status}">
              Scan #${h.id} — ${h.status === 'clean' ? 'All Clear' : `${h.total_changes} Change${h.total_changes > 1 ? 's' : ''}`}
            </div>
            <div class="timeline-details">
              ${time} · ${h.files_scanned} files scanned
              ${h.total_changes > 0 ? ` · +${h.changes.added.length} / ~${h.changes.modified.length} / -${h.changes.deleted.length}` : ''}
            </div>
          </div>
        </div>`;
        }).join('');
    } catch (e) {
        console.error('History error:', e);
    }
}

// --------------- Render File Table ---------------
async function refreshFileTable() {
    try {
        const base = await API.getBase();
        const entries = Object.entries(base.entries || {});

        dom.fileCount.textContent = entries.length;

        if (entries.length === 0) {
            dom.fileTableBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align:center; padding:32px; color: var(--text-muted);">
            No baseline files — set a baseline first
          </td>
        </tr>`;
            return;
        }

        dom.fileTableBody.innerHTML = entries.map(([path, hash]) => `
      <tr>
        <td class="path-cell">${escHtml(path)}</td>
        <td class="hash-cell" title="${hash}">${hash.substring(0, 16)}…</td>
        <td><span class="status-chip ok">● Tracked</span></td>
      </tr>
    `).join('');
    } catch (e) {
        console.error('File table error:', e);
    }
}

// --------------- Event Handlers ---------------
dom.btnScan.addEventListener('click', async () => {
    setLoading(dom.btnScan, true);
    try {
        const result = await API.scan();
        if (result.error) {
            showToast(result.error, 'error');
            return;
        }
        renderAlerts(result.changes);
        if (result.total_changes === 0) {
            showToast('Scan complete — no changes detected', 'success');
        } else {
            showToast(`Scan complete — ${result.total_changes} change(s) found!`, 'warning');
        }
        await refreshStats();
        await refreshHistory();
        await refreshFileTable();
    } catch (e) {
        showToast('Scan failed — check connection', 'error');
    } finally {
        setLoading(dom.btnScan, false);
    }
});

dom.btnBaseline.addEventListener('click', async () => {
    setLoading(dom.btnBaseline, true);
    try {
        const result = await API.baseline();
        if (result.error) {
            showToast(result.error, 'error');
            return;
        }
        showToast(`Baseline saved — ${result.files} files recorded`, 'success');
        // Clear alerts since baseline is fresh
        dom.alertFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <p>Baseline set — run a scan to check for changes</p>
      </div>`;
        dom.alertBadge.textContent = '0';
        await refreshStats();
        await refreshFileTable();
    } catch (e) {
        showToast('Failed to save baseline', 'error');
    } finally {
        setLoading(dom.btnBaseline, false);
    }
});

dom.btnSetDir.addEventListener('click', async () => {
    const dir = dom.dirInput.value.trim();
    if (!dir) {
        showToast('Please enter a directory path', 'warning');
        return;
    }
    setLoading(dom.btnSetDir, true);
    try {
        const result = await API.setConf(dir);
        if (result.error) {
            showToast(result.error, 'error');
            return;
        }
        showToast(`Now monitoring: ${result.monitored_dir}`, 'success');
        dom.alertFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>Directory changed — set a new baseline</p>
      </div>`;
        dom.alertBadge.textContent = '0';
        await refreshStats();
        await refreshHistory();
        await refreshFileTable();
    } catch (e) {
        showToast('Failed to update directory', 'error');
    } finally {
        setLoading(dom.btnSetDir, false);
    }
});

// --------------- Utility ---------------
function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --------------- Init ---------------
async function init() {
    try {
        const conf = await API.getConf();
        dom.dirInput.value = conf.monitored_dir || '';
    } catch (e) { /* ignore */ }

    await refreshStats();
    await refreshHistory();
    await refreshFileTable();
}

document.addEventListener('DOMContentLoaded', init);
