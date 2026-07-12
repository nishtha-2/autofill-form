// popup.js — local extension popup logic without Firebase

const API_BASE = "http://127.0.0.1:5001";

let currentUser = null;
let lastExtracted = null;

(function applyTheme() {
    chrome.storage.local.get("theme", ({ theme }) => {
        document.documentElement.setAttribute("data-theme", theme || "light");
    });
})();

function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    chrome.storage.local.set({ theme: next });
}
window.toggleTheme = toggleTheme;

function showNotification(message, type = "success") {
    const banner = document.getElementById("notification-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.className = `notification ${type}`;
    banner.style.display = "block";
    clearTimeout(banner._t);
    banner._t = setTimeout(() => {
        banner.style.display = "none";
    }, 3000);
}

function showAuthGate() {
    const authGate = document.getElementById("auth-gate");
    const app = document.getElementById("app");
    if (authGate) authGate.style.display = "flex";
    if (app) app.style.display = "none";
}

function showApp() {
    const authGate = document.getElementById("auth-gate");
    const app = document.getElementById("app");
    if (authGate) authGate.style.display = "none";
    if (app) app.style.display = "block";
}

function setUser(user) {
    currentUser = user;
    if (!user) {
        showAuthGate();
        return;
    }
    showApp();
    const initial = (user.name || user.email || "U").charAt(0).toUpperCase();
    const avatar = document.getElementById("user-avatar");
    const nameEl = document.getElementById("user-name");
    if (avatar) avatar.textContent = initial;
    if (nameEl) nameEl.textContent = user.name || user.email;
}

function openAuthPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL("auth.html") });
}
window.openAuthPage = openAuthPage;

async function handleLogout() {
    currentUser = null;
    await chrome.storage.local.set({ autofillUser: null });
    setUser(null);
}
window.handleLogout = handleLogout;

function switchTab(tabName) {
    ["extract", "history", "preview"].forEach((t) => {
        const panel = document.getElementById(`tab-${t}`);
        const btn = document.querySelector(`[data-tab="${t}"]`);
        const active = t === tabName;
        if (panel) panel.style.display = active ? "block" : "none";
        if (btn) {
            btn.classList.toggle("tab-btn--active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        }
    });
    if (tabName === "history") loadHistory();
}
window.switchTab = switchTab;

async function updateFillTarget() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) return;
        const url = new URL(tab.url);
        const target = document.getElementById("fill-target-text");
        if (!target) return;
        if (!url.protocol.startsWith("http")) {
            target.textContent = "⚠ Can't fill browser-internal pages";
        } else {
            target.textContent = `Will fill forms on ${url.hostname}`;
        }
    } catch (_) {}
}

async function handleExtractAndFill() {
    const text = document.getElementById("userText")?.value.trim();
    if (!text) {
        showNotification("Please paste some text first.", "error");
        return;
    }

    const btn = document.getElementById("autofill-btn");
    const spinner = document.getElementById("loading-spinner");
    const result = document.getElementById("fill-result");

    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = "inline-block";
    if (result) result.style.display = "none";

    try {
        const response = await fetch(`${API_BASE}/extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) throw new Error(`API error ${response.status}`);
        const json = await response.json();
        const { data = {}, validations = {} } = json;

        lastExtracted = { data, validations };
        await chrome.storage.session.set({ lastExtracted: { data, validations } });

        const fillMsg = await sendToBackground({ type: "FILL_FIELDS", data });
        const summary = fillMsg?.result?.summary;

        renderPreviewFields({ data, validations });

        if (result) {
            if (!fillMsg?.ok && fillMsg?.error) {
                result.innerHTML = `<span class="result-warn">⚠ ${fillMsg.error}</span>`;
            } else if (summary?.filled > 0) {
                result.innerHTML = `<span class="result-ok">✓ Filled <strong>${summary.filled}</strong> field${summary.filled > 1 ? "s" : ""} on page</span><span class="result-fields">${summary.fields.join(" · ")}</span>`;
            } else {
                result.innerHTML = `<span class="result-warn">No matching fields found — check Preview to see what was extracted.</span>`;
            }
            result.style.display = "block";
        }

        showNotification("Extraction complete!", "success");
    } catch (err) {
        console.error(err);
        showNotification(`Failed: ${err.message}`, "error");
    } finally {
        if (btn) btn.disabled = false;
        if (spinner) spinner.style.display = "none";
    }
}
window.handleExtractAndFill = handleExtractAndFill;

const FIELD_LABELS = {
    name: "Name",
    email: "Email",
    phone: "Phone",
    location: "Location",
    dob: "DOB",
    company: "Company",
    university: "University",
    linkedin: "LinkedIn",
    github: "GitHub",
    skills: "Skills",
};

function renderPreviewFields({ data, validations = {} }) {
    const container = document.getElementById("preview-fields");
    const saveRow = document.getElementById("preview-save-row");
    if (!container) return;

    const rows = Object.entries(data)
        .filter(([, fd]) => {
            const v = fd?.value;
            return v && (Array.isArray(v) ? v.length > 0 : true);
        })
        .map(([key, fd]) => {
            const value = Array.isArray(fd.value) ? fd.value.join(", ") : fd.value;
            const pct = Math.round((fd.confidence ?? 0) * 100);
            const tier = pct >= 85 ? "high" : pct >= 60 ? "medium" : "low";
            const label = FIELD_LABELS[key] || key;
            const valid = validations[key];
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
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function saveFromPreview() {
    if (!currentUser) {
        showNotification("Not signed in.", "error");
        return;
    }
    if (!lastExtracted?.data) {
        showNotification("Nothing to save.", "error");
        return;
    }

    const flat = {};
    for (const [key, fd] of Object.entries(lastExtracted.data)) {
        flat[key] = Array.isArray(fd?.value) ? fd.value : (fd?.value ?? null);
    }

    const history = await getHistory();
    history.unshift({ ...flat, savedBy: currentUser.email, timestamp: new Date().toISOString() });
    const trimmed = history.slice(0, 10);
    await chrome.storage.local.set({ autofillHistory: trimmed });
    showNotification("Saved locally!", "success");
    loadHistory();
}
window.saveFromPreview = saveFromPreview;

async function getHistory() {
    return new Promise((resolve) => {
        chrome.storage.local.get("autofillHistory", ({ autofillHistory }) => {
            resolve(Array.isArray(autofillHistory) ? autofillHistory : []);
        });
    });
}

async function loadHistory() {
    const container = document.getElementById("history-list");
    if (!container) return;
    const history = await getHistory();

    if (!history.length) {
        container.innerHTML = `<div class="history-empty">No saved entries yet.</div>`;
        return;
    }

    container.innerHTML = "";
    history.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "history-card";
        card.addEventListener("click", () => fillFromHistory(entry));
        card.innerHTML = `
            <div class="hc-name">${escHtml(entry.name || "—")}</div>
            <div class="hc-meta">
                <span>${escHtml(entry.email || "")}</span>
                <span class="hc-time">${timeAgo(new Date(entry.timestamp || Date.now()))}</span>
            </div>
            ${entry.company ? `<div class="hc-badge">${escHtml(entry.company)}</div>` : ""}
        `;
        container.appendChild(card);
    });
}

async function fillFromHistory(entry) {
    const data = {};
    const keys = ["name", "email", "phone", "location", "dob", "company", "university", "linkedin", "github", "skills"];
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

function sendToBackground(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else {
                resolve(response ?? { ok: false });
            }
        });
    });
}

async function getFromBackground(type) {
    return sendToBackground({ type });
}

function timeAgo(date) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;
    return date.toLocaleDateString();
}

async function initPopup() {
    chrome.storage.local.get(["autofillUser", "theme"], async ({ autofillUser, theme }) => {
        if (theme) document.documentElement.setAttribute("data-theme", theme);
        if (autofillUser) {
            setUser(autofillUser);
        } else {
            setUser(null);
        }
        await updateFillTarget();
        await loadHistory();
        const cached = await getFromBackground("GET_CACHED");
        if (cached?.data) {
            lastExtracted = cached.data;
            renderPreviewFields(cached.data);
        }
    });
}

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
    document.querySelector('[data-tab="extract"]')?.addEventListener("click", () => switchTab("extract"));
    document.querySelector('[data-tab="history"]')?.addEventListener("click", () => switchTab("history"));
    document.querySelector('[data-tab="preview"]')?.addEventListener("click", () => switchTab("preview"));
    document.getElementById("open-auth-btn")?.addEventListener("click", openAuthPage);
    document.getElementById("logout-btn")?.addEventListener("click", handleLogout);
    document.getElementById("autofill-btn")?.addEventListener("click", handleExtractAndFill);
    document.querySelector("#preview-save-row .btn")?.addEventListener("click", saveFromPreview);
    initPopup();
});
