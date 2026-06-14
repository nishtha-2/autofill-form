// ─────────────────────────────────────────────────────────────────────────────
// content.js — Injected into every page at document_idle
// Responsibilities:
//   1. Listen for FILL_FIELDS message from background.js
//   2. Scan the page for fillable inputs
//   3. Map extracted fields → page inputs using smart heuristic matching
//   4. Inject values + fire synthetic events (so React/Vue/Angular register fills)
//   5. Report back a fill summary
// ─────────────────────────────────────────────────────────────────────────────

// ── Field mapping dictionary ─────────────────────────────────────────────────
// Keys = our field names. Values = arrays of lowercase string signals to match
// against an input's name, id, placeholder, aria-label, or adjacent label text.
// Order matters — first match wins. More specific signals are listed first.

const FIELD_MAP = {
    // Contact
    name: [
        "fullname","full_name","full-name","yourname","your_name",
        "displayname","display_name","name","username","user_name",
        // split-name fallbacks handled separately below
    ],
    first_name: ["firstname","first_name","first-name","fname","given_name","givenname"],
    last_name:  ["lastname","last_name","last-name","lname","surname","family_name"],
    email:      ["email","e-mail","emailaddress","email_address","mail"],
    phone:      [
        "phone","phonenumber","phone_number","phone-number","telephone",
        "tel","mobile","mobilenumber","cell","cellphone","contact",
    ],
    location:   [
        "location","city","address","hometown","country","state",
        "region","zip","postal","postcode",
    ],
    dob:        [
        "dob","dateofbirth","date_of_birth","date-of-birth",
        "birthdate","birth_date","birthday","born",
    ],

    // Professional
    company:    [
        "company","employer","organization","organisation","workplace",
        "current_company","currentcompany","firm","business",
    ],
    university: [
        "university","college","school","institution","education",
        "alma_mater","almamater","degree","qualification",
    ],
    linkedin:   ["linkedin","linkedinurl","linkedin_url","linkedin-url","linkedinprofile"],
    github:     ["github","githuburl","github_url","github-url","githubprofile","repo"],
    skills:     ["skills","expertise","technologies","tech_stack","techstack","competencies"],
};

// ── Utility: normalise a string for matching ─────────────────────────────────
// Strips punctuation/spaces/underscores/hyphens, lowercases.
function norm(str) {
    return (str || "").toLowerCase().replace(/[\s_\-\.]/g, "");
}

// ── Get every readable signal from an input element ──────────────────────────
function getInputSignals(input) {
    const signals = [];

    // Attributes on the element itself
    ["name","id","placeholder","aria-label","autocomplete","data-field","type"].forEach((attr) => {
        const val = input.getAttribute(attr);
        if (val) signals.push(norm(val));
    });

    // Adjacent <label> text — walk up DOM to find a wrapping label
    let el = input;
    for (let i = 0; i < 5; i++) {
        el = el.parentElement;
        if (!el) break;
        const label = el.querySelector("label");
        if (label) { signals.push(norm(label.textContent)); break; }
        if (el.tagName === "LABEL") { signals.push(norm(el.textContent)); break; }
    }

    // Explicit <label for="..."> pointing to this input
    if (input.id) {
        const labelFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (labelFor) signals.push(norm(labelFor.textContent));
    }

    return signals;
}

// ── Core: does this input match a field? ─────────────────────────────────────
function matchField(input, fieldKey) {
    const signals  = getInputSignals(input);
    const patterns = FIELD_MAP[fieldKey] || [];
    return signals.some((sig) => patterns.some((pat) => sig.includes(pat)));
}

// ── Inject a value into an input + fire events React/Vue/Angular need ────────
function injectValue(input, value) {
    if (!value && value !== 0) return false;

    const strValue = String(value);

    // React uses a synthetic event system; we must set the value via
    // the native input value descriptor, then fire both input and change.
    const nativeInputValue = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
    );
    const nativeTextAreaValue = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
    );

    const descriptor = input.tagName === "TEXTAREA"
        ? nativeTextAreaValue
        : nativeInputValue;

    if (descriptor?.set) {
        descriptor.set.call(input, strValue);
    } else {
        input.value = strValue;
    }

    // Fire all three events — covers vanilla JS, jQuery, React, Angular, Vue
    ["input", "change", "blur"].forEach((eventType) => {
        input.dispatchEvent(new Event(eventType, { bubbles: true }));
    });

    // Visual highlight — fades after 1.5s
    input.style.transition = "background-color 0.3s ease";
    input.style.backgroundColor = "rgba(125,42,42,0.10)";
    setTimeout(() => {
        input.style.backgroundColor = "";
    }, 1500);

    return true;
}

// ── Main fill function ────────────────────────────────────────────────────────
function fillPageForms(data) {
    // Collect all visible, enabled text-like inputs
    const inputs = Array.from(
        document.querySelectorAll(
            "input:not([type='hidden']):not([type='submit']):not([type='button'])" +
            ":not([type='reset']):not([type='checkbox']):not([type='radio'])" +
            ":not([type='file']):not([type='image'])," +
            "textarea"
        )
    ).filter((el) => {
        // Skip invisible inputs
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && !el.disabled;
    });

    const filled   = [];
    const skipped  = [];

    // Track which inputs have already been filled to avoid double-filling
    const filledInputs = new Set();

    // ── Pass 1: match each field to an input ─────────────────────────────────
    for (const [fieldKey, fieldData] of Object.entries(data)) {
        const value = Array.isArray(fieldData?.value)
            ? fieldData.value.join(", ")
            : fieldData?.value;

        if (!value) continue;

        // Special case: if "name" field not matched and we have first+last split inputs
        if (fieldKey === "name") {
            const firstInput = inputs.find((i) => !filledInputs.has(i) && matchField(i, "first_name"));
            const lastInput  = inputs.find((i) => !filledInputs.has(i) && matchField(i, "last_name"));

            if (firstInput || lastInput) {
                const parts    = value.trim().split(/\s+/);
                const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
                const firstName= parts[0] || "";

                if (firstInput) {
                    injectValue(firstInput, firstName);
                    filledInputs.add(firstInput);
                    filled.push("first_name");
                }
                if (lastInput) {
                    injectValue(lastInput, lastName);
                    filledInputs.add(lastInput);
                    filled.push("last_name");
                }
                continue; // don't also fill a "name" field
            }
        }

        // Normal field matching
        const target = inputs.find((i) => !filledInputs.has(i) && matchField(i, fieldKey));

        if (target) {
            injectValue(target, value);
            filledInputs.add(target);
            filled.push(fieldKey);
        } else {
            skipped.push(fieldKey);
        }
    }

    return {
        filled:  filled.length,
        skipped: skipped.length,
        fields:  filled,
    };
}

// ── Overlay banner: shown on the page after a fill ───────────────────────────
function showPageBanner(summary) {
    // Remove any existing banner
    document.getElementById("autofillai-banner")?.remove();

    const banner = document.createElement("div");
    banner.id = "autofillai-banner";

    const text = summary.filled > 0
        ? `✓ AutoFillAI filled ${summary.filled} field${summary.filled > 1 ? "s" : ""}: ${summary.fields.join(", ")}`
        : "AutoFillAI: No matching fields found on this page.";

    banner.textContent = text;

    Object.assign(banner.style, {
        position:     "fixed",
        bottom:       "20px",
        right:        "20px",
        zIndex:       "2147483647",
        padding:      "10px 16px",
        borderRadius: "8px",
        background:   summary.filled > 0 ? "#fdf6d0" : "#fef2f2",
        color:        summary.filled > 0 ? "#6b4e00" : "#b91c1c",
        border:       `1px solid ${summary.filled > 0 ? "#e8c547" : "#fecaca"}`,
        fontFamily:   "system-ui, sans-serif",
        fontSize:     "13px",
        fontWeight:   "600",
        boxShadow:    "0 4px 16px rgba(0,0,0,0.12)",
        maxWidth:     "380px",
        lineHeight:   "1.4",
        cursor:       "pointer",
    });

    // Click to dismiss
    banner.addEventListener("click", () => banner.remove());

    document.body.appendChild(banner);

    // Auto-dismiss after 4 seconds
    setTimeout(() => banner?.remove(), 4000);
}

// ── Message listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "FILL_FIELDS") return false;

    try {
        const summary = fillPageForms(message.data);
        showPageBanner(summary);
        sendResponse({ ok: true, summary });
    } catch (err) {
        console.error("[AutoFillAI] Fill error:", err);
        sendResponse({ ok: false, error: err.message });
    }

    return false;
});