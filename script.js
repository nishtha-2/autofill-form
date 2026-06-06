// ─────────────────────────────────────────────────────────────────────────────
// script.js  —  Phase 3
// Added: auth guard, user info bar, per-user Firestore path,
//        logout. All Phase 1 + 2 functionality preserved.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Firebase config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCQMR4jvZ7PnpZKyYZoi0E6UNwdhUYzCHM",
  authDomain: "ai-autofill-7df2f.firebaseapp.com",
  projectId: "ai-autofill-7df2f",
  storageBucket: "ai-autofill-7df2f.firebasestorage.app",
  messagingSenderId: "459461217144",
  appId: "1:459461217144:web:c2e11c8c33752cbf1b168d",
  measurementId: "G-XFX0NTX2EF"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);
const auth        = getAuth(firebaseApp);

// Active user reference — set by onAuthStateChanged below
let currentUser = null;

// ─────────────────────────────────────────────────────────────────────────────
// Auth guard: redirect unauthenticated visitors to auth.html
// ─────────────────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
    if (!user) {
        // Not logged in — send to auth page
        window.location.href = "auth.html";
        return;
    }
    currentUser = user;
    renderUserBar(user);
});

// ─────────────────────────────────────────────────────────────────────────────
// User info bar — injects avatar + email + logout button into the header
// ─────────────────────────────────────────────────────────────────────────────

function renderUserBar(user) {
    // Only render once
    if (document.getElementById("user-bar")) return;

    const header = document.querySelector(".app-header");
    if (!header) return;

    // Avatar initial from displayName or email
    const displayName = user.displayName || user.email || "U";
    const initial     = displayName.charAt(0).toUpperCase();

    const bar = document.createElement("div");
    bar.id        = "user-bar";
    bar.className = "user-bar";
    bar.innerHTML = `
        <div class="user-avatar" aria-hidden="true">${initial}</div>
        <span class="user-email" title="${user.email}">${user.displayName || user.email}</span>
        <button class="btn btn--ghost user-logout-btn" onclick="handleLogout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="margin-right:4px">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
        </button>
    `;

    // Insert before the theme toggle button
    const themeBtn = document.getElementById("theme-toggle");
    header.insertBefore(bar, themeBtn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────

async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = "auth.html";
    } catch (err) {
        showNotification("Logout failed. Try again.", "error");
        console.error("Logout error:", err);
    }
}

window.handleLogout = handleLogout;

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

(function applyTheme() {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
})();

function toggleTheme() {
    const html    = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next    = current === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
}

window.toggleTheme = toggleTheme;

// ─────────────────────────────────────────────────────────────────────────────
// Notification banner
// ─────────────────────────────────────────────────────────────────────────────

function showNotification(message, type = "success") {
    const banner = document.getElementById("notification-banner");
    if (!banner) return;
    banner.textContent   = message;
    banner.className     = `notification ${type}`;
    banner.style.display = "block";
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => { banner.style.display = "none"; }, 3500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Field population + confidence badge
// ─────────────────────────────────────────────────────────────────────────────

function populateField(fieldId, value, confidence, validation) {
    const input = document.getElementById(fieldId);
    if (!input) return;

    const displayValue = Array.isArray(value)
        ? value.join(", ")
        : (value ?? "");

    input.value = displayValue;

    const badge = document.getElementById(`${fieldId}-confidence`);
    if (badge) {
        if (value && (Array.isArray(value) ? value.length : true)) {
            const pct  = Math.round(confidence * 100);
            const tier = pct >= 85 ? "high" : pct >= 60 ? "medium" : "low";
            badge.textContent   = `${pct}%`;
            badge.className     = `confidence-badge ${tier}`;
            badge.style.display = "inline-block";
        } else {
            badge.textContent   = "";
            badge.style.display = "none";
        }
    }

    const errorEl = document.getElementById(`${fieldId}-error`);
    if (errorEl) {
        if (validation && !validation.valid) {
            errorEl.textContent = validation.error;
            input.classList.add("field-invalid");
        } else {
            errorEl.textContent = "";
            input.classList.remove("field-invalid");
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction summary card
// ─────────────────────────────────────────────────────────────────────────────

function renderExtractionSummary(data) {
    const el = document.getElementById("extraction-summary");
    if (!el) return;

    const fields = [
        ["name","Name"],["email","Email"],["phone","Phone"],["location","Location"],
        ["linkedin","LinkedIn"],["github","GitHub"],["dob","DOB"],
        ["company","Company"],["university","University"],["skills","Skills"],
    ];

    const found = fields.filter(([key]) => {
        const v = data[key]?.value;
        return v && (Array.isArray(v) ? v.length > 0 : true);
    });

    const avgConf = found.length
        ? Math.round(
            found.reduce((s, [key]) => s + (data[key]?.confidence ?? 0), 0)
            / found.length * 100
          )
        : 0;

    el.innerHTML = `
        <strong>${found.length} of ${fields.length} fields</strong> extracted
        &nbsp;·&nbsp; avg confidence <strong>${avgConf}%</strong>
        &nbsp;·&nbsp; found: ${found.map(([,label]) => label).join(", ")}
    `;
    el.style.display = "block";
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Extract
// ─────────────────────────────────────────────────────────────────────────────

async function extractData() {
    const text = document.getElementById("userText")?.value.trim();
    if (!text) {
        showNotification("Please paste some text first.", "error");
        return;
    }

    const btn     = document.getElementById("autofill-btn");
    const spinner = document.getElementById("loading-spinner");
    if (btn)     btn.disabled          = true;
    if (spinner) spinner.style.display = "inline-block";

    try {
        const response = await fetch("http://127.0.0.1:5000/extract", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ text }),
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const { data = {}, validations = {} } = await response.json();

        // Original fields
        populateField("name",     data.name?.value,     data.name?.confidence,     validations.name);
        populateField("email",    data.email?.value,    data.email?.confidence,    validations.email);
        populateField("phone",    data.phone?.value,    data.phone?.confidence,    validations.phone);
        populateField("location", data.location?.value, data.location?.confidence, validations.location);

        // Phase 1 fields
        populateField("linkedin",   data.linkedin?.value,   data.linkedin?.confidence,   validations.linkedin);
        populateField("github",     data.github?.value,     data.github?.confidence,     validations.github);
        populateField("dob",        data.dob?.value,        data.dob?.confidence,        validations.dob);
        populateField("company",    data.company?.value,    data.company?.confidence,    validations.company);
        populateField("university", data.university?.value, data.university?.confidence, validations.university);
        populateField("skills",     data.skills?.value,     data.skills?.confidence,     validations.skills);

        renderExtractionSummary(data);
        showNotification("Fields auto-filled successfully!", "success");

    } catch (err) {
        console.error("Extraction error:", err);
        showNotification(`Extraction failed: ${err.message}`, "error");
    } finally {
        if (btn)     btn.disabled          = false;
        if (spinner) spinner.style.display = "none";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Save to Firebase
// Writes to: users/{uid}/entries  (per-user, not a flat global collection)
// ─────────────────────────────────────────────────────────────────────────────

async function saveData() {
    if (!currentUser) {
        showNotification("You must be signed in to save data.", "error");
        return;
    }

    const get = (id) => document.getElementById(id)?.value.trim() || null;

    const payload = {
        name:       get("name"),
        email:      get("email"),
        phone:      get("phone"),
        location:   get("location"),
        linkedin:   get("linkedin"),
        github:     get("github"),
        dob:        get("dob"),
        company:    get("company"),
        university: get("university"),
        skills: get("skills")
            ? get("skills").split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        savedBy:   currentUser.uid,
        timestamp: new Date(),
    };

    try {
        // Path: users/{uid}/entries/{autoId}
        // Each user can only read/write their own sub-collection
        const userEntriesRef = collection(db, "users", currentUser.uid, "entries");
        await addDoc(userEntriesRef, payload);
        showNotification("Saved to your account!", "success");
    } catch (error) {
        console.error("Firebase save error:", error);
        showNotification("Save failed. Check console for details.", "error");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clear form
// ─────────────────────────────────────────────────────────────────────────────

function clearForm() {
    const fields = [
        "name","email","phone","location",
        "linkedin","github","dob","company","university","skills",
    ];

    fields.forEach((field) => {
        const input = document.getElementById(field);
        if (input) input.value = "";

        const badge = document.getElementById(`${field}-confidence`);
        if (badge) { badge.textContent = ""; badge.style.display = "none"; }

        const error = document.getElementById(`${field}-error`);
        if (error) error.textContent = "";
    });

    const userText = document.getElementById("userText");
    if (userText) userText.value = "";

    const summary = document.getElementById("extraction-summary");
    if (summary) { summary.style.display = "none"; summary.innerHTML = ""; }

    showNotification("Form cleared.", "success");
}

// ─────────────────────────────────────────────────────────────────────────────
// Expose to global scope
// ─────────────────────────────────────────────────────────────────────────────

window.extractData  = extractData;
window.saveData     = saveData;
window.clearForm    = clearForm;