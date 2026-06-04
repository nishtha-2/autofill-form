// ─────────────────────────────────────────────────────────────────────────────
// script.js  —  Phase 1 enhanced
// Preserves all original functionality; adds new fields + confidence badges
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc }
                            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config (replace placeholders with your real values) ─────────────
const firebaseConfig = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "YOUR_DOMAIN",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_BUCKET",
    messagingSenderId: "YOUR_ID",
    appId:             "YOUR_APP_ID",
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the value of an input field and update its confidence badge.
 *
 * @param {string} fieldId   - id of the <input> element
 * @param {*}      value     - extracted value (string, array, or null)
 * @param {number} confidence - 0.0 – 1.0
 * @param {object} validation - { valid: bool, error: string|null } or undefined
 */
// Load saved theme
const savedTheme = localStorage.getItem("theme");

if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
}
function populateField(fieldId, value, confidence, validation) {
    const input = document.getElementById(fieldId);
    if (!input) return;

    // Arrays (skills) join into a comma-separated string
    const displayValue = Array.isArray(value)
        ? value.join(", ")
        : (value ?? "");

    input.value = displayValue;

    // Confidence badge
    const badge = document.getElementById(`${fieldId}-confidence`);
    if (badge) {
        if (value && (Array.isArray(value) ? value.length : true)) {
            const pct  = Math.round(confidence * 100);
            const tier = pct >= 85 ? "high" : pct >= 60 ? "medium" : "low";
            badge.textContent    = `${pct}%`;
            badge.className      = `confidence-badge ${tier}`;
            badge.style.display  = "inline-block";
        } else {
            badge.textContent   = "";
            badge.style.display = "none";
        }
    }

    // Validation annotation
    const errorEl = document.getElementById(`${fieldId}-error`);
    if (errorEl) {
        if (validation && !validation.valid) {
            errorEl.textContent   = validation.error;
            errorEl.style.display = "block";
            input.classList.add("field-invalid");
        } else {
            errorEl.textContent   = "";
            errorEl.style.display = "none";
            input.classList.remove("field-invalid");
        }
    }
}

/** Show a transient notification banner. */
function showNotification(message, type = "success") {
    let banner = document.getElementById("notification-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "notification-banner";
        document.body.prepend(banner);
    }
    banner.textContent  = message;
    banner.className    = `notification ${type}`;
    banner.style.display = "block";
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => { banner.style.display = "none"; }, 3500);
}
// ─────────────────────────────────────────────────────────────────────────────
// Theme Toggle
// ─────────────────────────────────────────────────────────────────────────────

function toggleTheme() {

    const html = document.documentElement;

    const currentTheme =
        html.getAttribute("data-theme");

    if (currentTheme === "light") {

        html.setAttribute("data-theme", "dark");
        localStorage.setItem("theme", "dark");

    } else {

        html.setAttribute("data-theme", "light");
        localStorage.setItem("theme", "light");
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Clear Form
// ─────────────────────────────────────────────────────────────────────────────

function clearForm() {

    const fields = [
        "name",
        "email",
        "phone",
        "location",
        "linkedin",
        "github",
        "dob",
        "company",
        "university",
        "skills"
    ];

    fields.forEach(field => {

        const input = document.getElementById(field);

        if (input) {
            input.value = "";
        }

        const badge =
            document.getElementById(`${field}-confidence`);

        if (badge) {
            badge.textContent = "";
            badge.style.display = "none";
        }

        const error =
            document.getElementById(`${field}-error`);

        if (error) {
            error.textContent = "";
            error.style.display = "none";
        }
    });

    const userText =
        document.getElementById("userText");

    if (userText) {
        userText.value = "";
    }

    const summary =
        document.getElementById("extraction-summary");

    if (summary) {
        summary.style.display = "none";
        summary.innerHTML = "";
    }

    showNotification("Form cleared successfully.", "success");
}


// ─────────────────────────────────────────────────────────────────────────────
// Core: Extract
// ─────────────────────────────────────────────────────────────────────────────

async function extractData() {
    const text = document.getElementById("userText").value.trim();
    if (!text) {
        showNotification("Please paste some text first.", "error");
        return;
    }

    // Loading state
    const btn = document.getElementById("autofill-btn");
    const spinner = document.getElementById("loading-spinner");
    if (btn)     btn.disabled    = true;
    if (spinner) spinner.style.display = "inline-block";

    try {
        const response = await fetch("http://127.0.0.1:5000/extract", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        const json = await response.json();

        // json.data  = { fieldName: { value, confidence }, … }
        // json.validations = { fieldName: { valid, error }, … }
        const { data = {}, validations = {} } = json;

        // ── Original fields (API contract preserved) ─────────────────────────
        populateField("name",     data.name?.value,     data.name?.confidence,     validations.name);
        populateField("email",    data.email?.value,    data.email?.confidence,    validations.email);
        populateField("phone",    data.phone?.value,    data.phone?.confidence,    validations.phone);
        populateField("location", data.location?.value, data.location?.confidence, validations.location);

        // ── Phase 1 new fields ───────────────────────────────────────────────
        populateField("linkedin",   data.linkedin?.value,   data.linkedin?.confidence,   validations.linkedin);
        populateField("github",     data.github?.value,     data.github?.confidence,     validations.github);
        populateField("dob",        data.dob?.value,        data.dob?.confidence,        validations.dob);
        populateField("company",    data.company?.value,    data.company?.confidence,    validations.company);
        populateField("university", data.university?.value, data.university?.confidence, validations.university);
        populateField("skills",     data.skills?.value,     data.skills?.confidence,     validations.skills);

        showNotification("Fields auto-filled successfully!", "success");

    } catch (err) {
        console.error("Extraction error:", err);
        showNotification(`Extraction failed: ${err.message}`, "error");
    } finally {
        if (btn)     btn.disabled           = false;
        if (spinner) spinner.style.display  = "none";
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Core: Save to Firebase
// ─────────────────────────────────────────────────────────────────────────────

async function saveData() {
    const get = (id) => document.getElementById(id)?.value.trim() || null;

    const payload = {
        // Original fields
        name:     get("name"),
        email:    get("email"),
        phone:    get("phone"),
        location: get("location"),
        // Phase 1 fields
        linkedin:   get("linkedin"),
        github:     get("github"),
        dob:        get("dob"),
        company:    get("company"),
        university: get("university"),
        // Skills stored as array for easier querying in Firestore
        skills: get("skills")
            ? get("skills").split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        timestamp: new Date(),
    };

    try {
        await addDoc(collection(db, "users"), payload);
        showNotification("Data saved successfully!", "success");
    } catch (error) {
        console.error("Firebase save error:", error);
        showNotification("Failed to save data. Check console for details.", "error");
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// Expose to global scope (called from HTML onclick attributes)
// ─────────────────────────────────────────────────────────────────────────────

window.extractData = extractData;
window.saveData    = saveData;
window.toggleTheme = toggleTheme;
window.clearForm   = clearForm;