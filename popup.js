// ─────────────────────────────────────────────────────────────────────────────
// popup.js — Extension popup logic
// Phases covered: auth gate, extract → fill pipeline, history, preview tab
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithCredential,
} from "firebase/auth";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    getDocs,
} from "firebase/firestore";

// ── Config — keep in sync with script.js ────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCQMR4jvZ7PnpZKyYZoi0E6UNwdhUYzCHM",
  authDomain: "ai-autofill-7df2f.firebaseapp.com",
  projectId: "ai-autofill-7df2f",
  storageBucket: "ai-autofill-7df2f.firebasestorage.app",
  messagingSenderId: "459461217144",
  appId: "1:459461217144:web:c2e11c8c33752cbf1b168d",
  measurementId: "G-XFX0NTX2EF"
};

// ── IMPORTANT: replace with your deployed Render URL after Phase 7 ──────────
// For local dev keep http://127.0.0.1:5000
const API_BASE = "http://127.0.0.1:5000";

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

let currentUser    = null;
let lastExtracted  = null;   // { data, validations } — last API response

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

(function applyTheme() {
    chrome.storage.local.get("theme", ({ theme }) => {
        document.documentElement.setAttribute("data-theme", theme || "light");
    });
})();

function toggleTheme() {
    const html    = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next    = current === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    chrome.storage.local.set({ theme: next });
}

window.toggleTheme = toggleTheme;

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

function showNotification(message, type = "success") {
    const banner = document.getElementById("notification-banner");
    if (!banner) return;
    banner.textContent   = message;
    banner.className     = `notification ${type}`;
    banner.style.display = "block";
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { banner.style.display = "none"; }, 3000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth state
// ─────────────────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Show auth gate, hide app
        document.getElementById("auth-gate").style.display = "flex";
        document.getElementById("app").style.display       = "none";
        return;
    }

    currentUser = user;

    // Show app, hide auth gate
    document.getElementById("auth-gate").style.display = "none";
    document.getElementById("app").style.display       = "block";

    // Populate user pill
    const initial = (user.displayName || user.email || "U").charAt(0).toUpperCase();
    document.getElementById("user-avatar").textContent = initial;
    document.getElementById("user-name").textContent   = user.displayName || user.email;

    // Restore last extracted from session cache (so preview tab survives popup close/open)
    const cached = await getFromBackground("GET_CACHED");
    if (cached?.data) {
        lastExtracted = cached.data;
        renderPreviewFields(lastExtracted);
    }

    // Load history on open
    loadHistory();

    // Detect current tab URL for the fill-target indicator
    updateFillTarget();
});

// Open auth.html in a new tab (extensions can't do full OAuth inside popup)
function openAuthPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL("auth.html") });
}

window.openAuthPage = openAuthPage;

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────

async function handleLogout() {
    await signOut(auth);
    // Auth state listener above will handle UI update
}

window.handleLogout = handleLogout;

// ─────────────────────────────────────────────────────────────────────────────
// Tab switcher
// ─────────────────────────────────────────────────────────────────────────────

function switchTab(tabName) {
    ["extract","history","preview"].forEach((t) => {
        const panel = document.getElementById(`tab-${t}`);
        const btn   = document.querySelector(`[data-tab="${t}"]`);
        const active = t === tabName;
        if (panel) panel.style.display = active ? "block" : "none";
        if (btn)   btn.classList.toggle("tab-btn--active", active);
        if (btn)   btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (tabName === "history") loadHistory();
}

window.switchTab = switchTab;

// ─────────────────────────────────────────────────────────────────────────────
// Fill target indicator: show domain of current active tab
// ─────────────────────────────────────────────────────────────────────────────

async function updateFillTarget() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) return;
        const url = new URL(tab.url);
        // chrome:// and similar pages can't be filled
        if (!url.protocol.startsWith("http")) {
            document.getElementById("fill-target-text").textContent =
                "⚠ Can't fill browser-internal pages";
            return;
        }
        document.getElementById("fill-target-text").textContent =
            `Will fill forms on ${url.hostname}`;
    } catch (_) { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Extract → Fill
// ─────────────────────────────────────────────────────────────────────────────

async function handleExtractAndFill() {
    const text = document.getElementById("userText")?.value.trim();
    if (!text) {
        showNotification("Please paste some text first.", "error");
        return;
    }

    const btn     = document.getElementById("autofill-btn");
    const spinner = document.getElementById("loading-spinner");
    const result  = document.getElementById("fill-result");

    if (btn)     btn.disabled          = true;
    if (spinner) spinner.style.display = "inline-block";
    if (result)  result.style.display  = "none";

    try {
        // ── Step 1: call Flask API ─────────────────────────────────────────
        const response = await fetch(`${API_BASE}/extract`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ text }),
        });

        if (!response.ok) throw new Error(`API error ${response.status}`);

        const json = await response.json();
        const { data = {}, validations = {} } = json;

        lastExtracted = { data, validations };

        // ── Step 2: cache in session so preview tab survives popup close ──
        await sendToBackground({ type: "SAVE_CACHED", data: { data, validations } });

        // ── Step 3: send to background → content script for page fill ─────
        const fillMsg  = await sendToBackground({ type: "FILL_FIELDS", data });
        const summary  = fillMsg?.result?.summary;

        // ── Step 4: update preview tab ────────────────────────────────────
        renderPreviewFields({ data, validations });

        // ── Step 5: show fill result ──────────────────────────────────────
        if (result) {
            if (!fillMsg?.ok && fillMsg?.error) {
                result.innerHTML = `<span class="result-warn">⚠ ${fillMsg.error}</span>`;
            } else if (summary?.filled > 0) {
                result.innerHTML =
                    `<span class="result-ok">✓ Filled <strong>${summary.filled}</strong> field${summary.filled > 1 ? "s" : ""} ` +
                    `on page</span><span class="result-fields">${summary.fields.join(" · ")}</span>`;
            } else {
                result.innerHTML =
                    `<span class="result-warn">No matching fields found — ` +
                    `check Preview to see what was extracted.</span>`;
            }
            result.style.display = "block";
        }

        showNotification("Extraction complete!", "success");

    } catch (err) {
        console.error("[AutoFillAI popup] Extract error:", err);
        showNotification(`Failed: ${err.message}`, "error");
    } finally {
        if (btn)     btn.disabled          = false;
        if (spinner) spinner.style.display = "none";
    }
}

window.handleExtractAndFill = handleExtractAndFill;

// ─────────────────────────────────────────────────────────────────────────────
// Preview tab: render extracted fields as read-only pills
// ─────────────────────────────────────────────────────────────────────────────

const FIELD_LABELS = {
    name:"Name", email:"Email", phone:"Phone", location:"Location",
    dob:"DOB", company:"Company", university:"University",
    linkedin:"LinkedIn", github:"GitHub", skills:"Skills",
};

function renderPreviewFields({ data, validations = {} }) {
    const container = document.getElementById("preview-fields");
    const saveRow   = document.getElementById("preview-save-row");
    if (!container) return;

    const rows = Object.entries(data)
        .filter(([, fd]) => {
            const v = fd?.value;
            return v && (Array.isArray(v) ? v.length > 0 : true);
        })
        .map(([key, fd]) => {
            const value  = Array.isArray(fd.value) ? fd.value.join(", ") : fd.value;
            const pct    = Math.round((fd.confidence ?? 0) * 100);
            const tier   = pct >= 85 ? "high" : pct >= 60 ? "medium" : "low";
            const label  = FIELD_LABELS[key] || key;
            const valid  = validations[key];
            const errMsg = valid && !valid.valid ? `<span class="pv-error">${valid.error}</span>` : "";

            return `
                <div class="pv-row">
                    <span class="pv-label">${label}</span>
                    <span class="pv-value">${escHtml(value)}${errMsg}</span>
                    <span class="confidence-badge ${tier}">${pct}%</span>
                </div>
            `;
        });

    container.innerHTML = rows.length
        ? rows.join("")
        : `<p class="history-empty">Nothing extracted yet.</p>`;

    if (saveRow) saveRow.style.display = rows.length ? "flex" : "none";
}

function escHtml(str) {
    return String(str)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Save from Preview tab → Firestore
// ─────────────────────────────────────────────────────────────────────────────

async function saveFromPreview() {
    if (!currentUser) { showNotification("Not signed in.", "error"); return; }
    if (!lastExtracted?.data) { showNotification("Nothing to save.", "error"); return; }

    const flat = {};
    for (const [key, fd] of Object.entries(lastExtracted.data)) {
        flat[key] = Array.isArray(fd?.value) ? fd.value : (fd?.value ?? null);
    }

    try {
        const ref = collection(db, "users", currentUser.uid, "entries");
        await addDoc(ref, { ...flat, savedBy: currentUser.uid, timestamp: new Date() });
        showNotification("Saved to Firebase!", "success");
        loadHistory();
    } catch (err) {
        console.error(err);
        showNotification("Save failed.", "error");
    }
}

window.saveFromPreview = saveFromPreview;

// ─────────────────────────────────────────────────────────────────────────────
// History tab: load last 10 entries from Firestore
// ─────────────────────────────────────────────────────────────────────────────

async function loadHistory() {
    if (!currentUser) return;

    const container = document.getElementById("history-list");
    if (!container) return;

    container.innerHTML = `<div class="history-empty">Loading…</div>`;

    try {
        const ref  = collection(db, "users", currentUser.uid, "entries");
        const q    = query(ref, orderBy("timestamp", "desc"), limit(10));
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = `<div class="history-empty">No saved entries yet.</div>`;
            return;
        }

        container.innerHTML = snap.docs.map((doc) => {
            const d   = doc.data();
            const ts  = d.timestamp?.toDate?.() ?? new Date();
            const ago = timeAgo(ts);

            return `
                <div class="history-card" onclick="fillFromHistory(${escHtml(JSON.stringify(d))})">
                    <div class="hc-name">${escHtml(d.name || "—")}</div>
                    <div class="hc-meta">
                        <span>${escHtml(d.email || "")}</span>
                        <span class="hc-time">${ago}</span>
                    </div>
                    ${d.company ? `<div class="hc-badge">${escHtml(d.company)}</div>` : ""}
                </div>
            `;
        }).join("");

    } catch (err) {
        container.innerHTML = `<div class="history-empty">Failed to load history.</div>`;
        console.error(err);
    }
}

// Re-fill the page from a history entry (wrap flat values back into {value} shape)
async function fillFromHistory(entry) {
    if (!entry) return;

    // Rebuild the data shape content.js expects: { fieldKey: { value } }
    const data = {};
    const keys = ["name","email","phone","location","dob","company","university","linkedin","github","skills"];
    keys.forEach((k) => {
        if (entry[k]) data[k] = { value: entry[k], confidence: 1.0 };
    });

    const fillMsg = await sendToBackground({ type: "FILL_FIELDS", data });
    const summary = fillMsg?.result?.summary;

    if (summary?.filled > 0) {
        showNotification(`Filled ${summary.filled} fields from history`, "success");
    } else {
        showNotification(fillMsg?.error || "No matching fields found", "error");
    }
}

window.fillFromHistory = fillFromHistory;

// ─────────────────────────────────────────────────────────────────────────────
// Background messaging helper
// ─────────────────────────────────────────────────────────────────────────────

function sendToBackground(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            resolve(response ?? { ok: false });
        });
    });
}

async function getFromBackground(type) {
    return sendToBackground({ type });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: human-readable timestamp
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(date) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60)          return "just now";
    if (secs < 3600)        return `${Math.floor(secs/60)}m ago`;
    if (secs < 86400)       return `${Math.floor(secs/3600)}h ago`;
    if (secs < 86400 * 7)   return `${Math.floor(secs/86400)}d ago`;
    return date.toLocaleDateString();
}