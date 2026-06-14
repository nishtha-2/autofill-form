// ─────────────────────────────────────────────────────────────────────────────
// auth.js — Phase 3 — Chrome Extension compatible
// Google Sign-In delegates to background.js via chrome.runtime.sendMessage
// because chrome.identity only works in service workers / extension pages,
// NOT in regular browser tabs (which is what auth.html opens as).
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithCredential,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    updateProfile,
} from "firebase/auth";

// ── Field filling logic ───────────────────────────────────────────────────────



// ── Firebase config — replace with your real values ──────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCQMR4jvZ7PnpZKyYZoi0E6UNwdhUYzCHM",
  authDomain: "ai-autofill-7df2f.firebaseapp.com",
  projectId: "ai-autofill-7df2f",
  storageBucket: "ai-autofill-7df2f.firebasestorage.app",
  messagingSenderId: "459461217144",
  appId: "1:459461217144:web:c2e11c8c33752cbf1b168d",
  measurementId: "G-XFX0NTX2EF"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ─────────────────────────────────────────────────────────────────────────────
// Auth state — if already signed in, show success and close tab
// ─────────────────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
    if (user) {
        showNotification(
            `Signed in as ${user.displayName || user.email}. You can close this tab.`,
            "success"
        );
        // Hide both panels so user sees only the success message
        document.getElementById("panel-login").style.display  = "none";
        document.getElementById("panel-signup").style.display = "none";
        setTimeout(() => window.close(), 2000);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Theme
// ─────────────────────────────────────────────────────────────────────────────

(function applyTheme() {
    try {
        chrome.storage.local.get("theme", ({ theme }) => {
            document.documentElement.setAttribute("data-theme", theme || "light");
        });
    } catch (_) {
        // Fallback for when chrome.storage isn't available
        document.documentElement.setAttribute(
            "data-theme",
            localStorage.getItem("theme") || "light"
        );
    }
})();

function toggleTheme() {
    const html  = document.documentElement;
    const next  = html.getAttribute("data-theme") === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    try {
        chrome.storage.local.set({ theme: next });
    } catch (_) {
        localStorage.setItem("theme", next);
    }
}

window.toggleTheme = toggleTheme;

// ─────────────────────────────────────────────────────────────────────────────
// Tab switcher
// ─────────────────────────────────────────────────────────────────────────────

function switchTab(tab) {
    const isLogin = tab === "login";
    document.getElementById("panel-login").style.display  = isLogin  ? "block" : "none";
    document.getElementById("panel-signup").style.display = !isLogin ? "block" : "none";
    document.getElementById("tab-login").classList.toggle("auth-tab--active",  isLogin);
    document.getElementById("tab-signup").classList.toggle("auth-tab--active", !isLogin);
    document.getElementById("tab-login").setAttribute("aria-selected",  String(isLogin));
    document.getElementById("tab-signup").setAttribute("aria-selected", String(!isLogin));
    clearAllErrors();
}

window.switchTab = switchTab;

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
    banner._t = setTimeout(() => { banner.style.display = "none"; }, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error helpers
// ─────────────────────────────────────────────────────────────────────────────

function setError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
}

function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
}

function clearAllErrors() {
    [
        "login-email-error","login-password-error",
        "signup-name-error","signup-email-error",
        "signup-password-error","signup-confirm-error",
    ].forEach(clearError);
}

function friendlyAuthError(code) {
    const map = {
        "auth/user-not-found":         "No account found with this email.",
        "auth/wrong-password":         "Incorrect password. Try again.",
        "auth/invalid-credential":     "Incorrect email or password.",
        "auth/email-already-in-use":   "An account with this email already exists.",
        "auth/weak-password":          "Password must be at least 6 characters.",
        "auth/invalid-email":          "Please enter a valid email address.",
        "auth/too-many-requests":      "Too many attempts. Please wait a moment.",
        "auth/network-request-failed": "Network error. Check your connection.",
    };
    return map[code] || "Something went wrong. Please try again.";
}

// ─────────────────────────────────────────────────────────────────────────────
// Password strength meter
// ─────────────────────────────────────────────────────────────────────────────

const strengthLabels = ["", "Weak", "Fair", "Good", "Strong", "Excellent"];
const strengthColors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

document.getElementById("signup-password")?.addEventListener("input", (e) => {
    const pw    = e.target.value;
    let score   = 0;
    if (pw.length >= 8)           score++;
    if (pw.length >= 12)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const fill  = document.getElementById("pw-strength-fill");
    const label = document.getElementById("pw-strength-label");
    if (!fill || !label) return;

    fill.style.width           = pw.length === 0 ? "0%" : Math.max(10, (score / 5) * 100) + "%";
    fill.style.backgroundColor = strengthColors[score] || "#ef4444";
    label.textContent          = pw.length === 0 ? "" : (strengthLabels[score] || "Weak");
    label.style.color          = strengthColors[score] || "#ef4444";
});

// ─────────────────────────────────────────────────────────────────────────────
// Password visibility toggle
// ─────────────────────────────────────────────────────────────────────────────

function togglePassword(inputId, btn) {
    const input   = document.getElementById(inputId);
    if (!input) return;
    input.type        = input.type === "text" ? "password" : "text";
    btn.style.opacity = input.type === "password" ? "0.4" : "0.8";
}

window.togglePassword = togglePassword;

// ─────────────────────────────────────────────────────────────────────────────
// Loading state helpers
// ─────────────────────────────────────────────────────────────────────────────

function setLoading(btnId, spinnerId, loading) {
    const btn     = document.getElementById(btnId);
    const spinner = document.getElementById(spinnerId);
    if (btn)     btn.disabled          = loading;
    if (spinner) spinner.style.display = loading ? "inline-block" : "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle: Email/Password Login
// ─────────────────────────────────────────────────────────────────────────────

async function handleLogin() {
    clearAllErrors();
    const email    = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;

    let valid = true;
    if (!email)    { setError("login-email-error",    "Email is required.");    valid = false; }
    if (!password) { setError("login-password-error", "Password is required."); valid = false; }
    if (!valid) return;

    setLoading("login-btn", "login-spinner", true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged above handles success UI + window.close()
    } catch (err) {
        setError("login-password-error", friendlyAuthError(err.code));
    } finally {
        setLoading("login-btn", "login-spinner", false);
    }
}

window.handleLogin = handleLogin;

document.getElementById("login-password")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
});

// ─────────────────────────────────────────────────────────────────────────────
// Handle: Sign Up
// ─────────────────────────────────────────────────────────────────────────────

async function handleSignUp() {
    clearAllErrors();
    const name     = document.getElementById("signup-name")?.value.trim();
    const email    = document.getElementById("signup-email")?.value.trim();
    const password = document.getElementById("signup-password")?.value;
    const confirm  = document.getElementById("signup-confirm")?.value;

    let valid = true;
    if (!name)                           { setError("signup-name-error",     "Name is required.");       valid = false; }
    if (!email)                          { setError("signup-email-error",    "Email is required.");      valid = false; }
    if (!password)                       { setError("signup-password-error", "Password is required.");   valid = false; }
    if (password && password.length < 8) { setError("signup-password-error", "Minimum 8 characters.");  valid = false; }
    if (password !== confirm)            { setError("signup-confirm-error",  "Passwords do not match."); valid = false; }
    if (!valid) return;

    setLoading("signup-btn", "signup-spinner", true);
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        // onAuthStateChanged handles success UI + window.close()
    } catch (err) {
        const target = err.code === "auth/email-already-in-use"
            ? "signup-email-error"
            : "signup-password-error";
        setError(target, friendlyAuthError(err.code));
    } finally {
        setLoading("signup-btn", "signup-spinner", false);
    }
}

window.handleSignUp = handleSignUp;

// ─────────────────────────────────────────────────────────────────────────────
// Handle: Google Sign-In
// Sends GOOGLE_AUTH to background.js → background calls chrome.identity
// → returns id_token → we sign into Firebase here
// ─────────────────────────────────────────────────────────────────────────────

async function handleGoogleSignIn() {
    clearAllErrors();
    showNotification("Opening Google sign-in…", "success");

    try {
        // Ask the service worker to run chrome.identity.launchWebAuthFlow
        const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "GOOGLE_AUTH" }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });

        if (!result?.ok) {
            throw new Error(result?.error || "Google auth failed.");
        }

        // Sign into Firebase using the id_token returned by background.js
        const credential = GoogleAuthProvider.credential(result.idToken);
        await signInWithCredential(auth, credential);
        // onAuthStateChanged handles success UI + window.close()

    } catch (err) {
        console.error("[AutoFillAI] Google sign-in error:", err.message);
        showNotification(err.message || "Google sign-in failed.", "error");
    }
}

window.handleGoogleSignIn = handleGoogleSignIn;

// ─────────────────────────────────────────────────────────────────────────────
// Handle: Forgot Password
// ─────────────────────────────────────────────────────────────────────────────

async function handleForgotPassword() {
    const email = document.getElementById("login-email")?.value.trim();
    if (!email) {
        setError("login-email-error", "Enter your email above first.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showNotification(`Reset email sent to ${email}`, "success");
    } catch (err) {
        setError("login-email-error", friendlyAuthError(err.code));
    }
}

window.handleForgotPassword = handleForgotPassword;
document.addEventListener("DOMContentLoaded", () => {

    document
        .getElementById("theme-toggle")
        ?.addEventListener("click", toggleTheme);

    document
        .getElementById("tab-login")
        ?.addEventListener("click", () => switchTab("login"));

    document
        .getElementById("tab-signup")
        ?.addEventListener("click", () => switchTab("signup"));

    document
        .getElementById("forgot-password-btn")
        ?.addEventListener("click", handleForgotPassword);

    document
        .getElementById("login-password-toggle")
        ?.addEventListener("click", function () {
            togglePassword("login-password", this);
        });

    document
        .getElementById("signup-password-toggle")
        ?.addEventListener("click", function () {
            togglePassword("signup-password", this);
        });

    document
        .getElementById("signup-confirm-toggle")
        ?.addEventListener("click", function () {
            togglePassword("signup-confirm", this);
        });

    document
        .getElementById("login-btn")
        ?.addEventListener("click", handleLogin);

    document
        .getElementById("signup-btn")
        ?.addEventListener("click", handleSignUp);

    document
        .getElementById("google-login-btn")
        ?.addEventListener("click", handleGoogleSignIn);

    document
        .getElementById("google-signup-btn")
        ?.addEventListener("click", handleGoogleSignIn);

});