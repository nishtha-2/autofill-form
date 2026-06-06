// ─────────────────────────────────────────────────────────────────────────────
// auth.js  —  Phase 3
// Handles: Sign Up, Login, Google Sign-In, Logout, Forgot Password,
//          auth state persistence, and redirect guard.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    sendPasswordResetEmail,
    onAuthStateChanged,
    signOut,
    updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Firebase config (same object as script.js — keep them in sync) ───────────

const firebaseConfig = {
  apiKey: "AIzaSyCQMR4jvZ7PnpZKyYZoi0E6UNwdhUYzCHM",
  authDomain: "ai-autofill-7df2f.firebaseapp.com",
  projectId: "ai-autofill-7df2f",
  storageBucket: "ai-autofill-7df2f.firebasestorage.app",
  messagingSenderId: "459461217144",
  appId: "1:459461217144:web:c2e11c8c33752cbf1b168d",
  measurementId: "G-XFX0NTX2EF"
};


const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// ─────────────────────────────────────────────────────────────────────────────
// Auth state guard
// If the user is already logged in when visiting auth.html, redirect to app.
// ─────────────────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
    if (user) {
        // Already authenticated — go straight to the app
        window.location.href = "index.html";
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Theme (mirrors script.js so auth page respects saved preference)
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
// Tab switcher
// ─────────────────────────────────────────────────────────────────────────────

function switchTab(tab) {
    const isLogin = tab === "login";

    document.getElementById("panel-login").style.display  = isLogin  ? "block" : "none";
    document.getElementById("panel-signup").style.display = !isLogin ? "block" : "none";

    document.getElementById("tab-login").classList.toggle("auth-tab--active",  isLogin);
    document.getElementById("tab-signup").classList.toggle("auth-tab--active", !isLogin);

    document.getElementById("tab-login").setAttribute("aria-selected",  isLogin  ? "true" : "false");
    document.getElementById("tab-signup").setAttribute("aria-selected", !isLogin ? "true" : "false");

    clearAllErrors();
}

window.switchTab = switchTab;

// ─────────────────────────────────────────────────────────────────────────────
// Notification banner
// ─────────────────────────────────────────────────────────────────────────────

function showNotification(message, type = "success") {
    const banner = document.getElementById("notification-banner");
    if (!banner) return;
    banner.textContent  = message;
    banner.className    = `notification ${type}`;
    banner.style.display = "block";
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { banner.style.display = "none"; }, 4000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Field error helpers
// ─────────────────────────────────────────────────────────────────────────────

function setError(id, message) {
    const el = document.getElementById(id);
    if (el) el.textContent = message;
}

function clearError(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
}

function clearAllErrors() {
    ["login-email-error","login-password-error",
     "signup-name-error","signup-email-error",
     "signup-password-error","signup-confirm-error"]
        .forEach(clearError);
}

// Map Firebase auth error codes → readable messages
function friendlyAuthError(code) {
    const map = {
        "auth/user-not-found":       "No account found with this email.",
        "auth/wrong-password":       "Incorrect password. Try again.",
        "auth/invalid-credential":   "Incorrect email or password.",
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/weak-password":        "Password must be at least 6 characters.",
        "auth/invalid-email":        "Please enter a valid email address.",
        "auth/popup-closed-by-user": "Google sign-in was cancelled.",
        "auth/too-many-requests":    "Too many attempts. Please wait a moment.",
        "auth/network-request-failed": "Network error. Check your connection.",
    };
    return map[code] || "Something went wrong. Please try again.";
}

// ─────────────────────────────────────────────────────────────────────────────
// Password strength meter (signup page)
// ─────────────────────────────────────────────────────────────────────────────

function getPasswordStrength(pw) {
    let score = 0;
    if (pw.length >= 8)                  score++;
    if (pw.length >= 12)                 score++;
    if (/[A-Z]/.test(pw))               score++;
    if (/[0-9]/.test(pw))               score++;
    if (/[^A-Za-z0-9]/.test(pw))        score++;
    return score; // 0-5
}

const strengthLabels = ["", "Weak", "Fair", "Good", "Strong", "Excellent"];
const strengthColors = ["", "#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"];

document.getElementById("signup-password")?.addEventListener("input", (e) => {
    const pw    = e.target.value;
    const score = getPasswordStrength(pw);
    const fill  = document.getElementById("pw-strength-fill");
    const label = document.getElementById("pw-strength-label");
    if (!fill || !label) return;

    const pct = pw.length === 0 ? 0 : Math.max(10, (score / 5) * 100);
    fill.style.width            = pct + "%";
    fill.style.backgroundColor  = strengthColors[score] || "#ef4444";
    label.textContent           = pw.length === 0 ? "" : strengthLabels[score] || "Weak";
    label.style.color           = strengthColors[score] || "#ef4444";
});

// ─────────────────────────────────────────────────────────────────────────────
// Password visibility toggle
// ─────────────────────────────────────────────────────────────────────────────

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isText       = input.type === "text";
    input.type         = isText ? "password" : "text";
    btn.style.opacity  = isText ? "0.4" : "0.8";
}

window.togglePassword = togglePassword;

// ─────────────────────────────────────────────────────────────────────────────
// Loading state helpers
// ─────────────────────────────────────────────────────────────────────────────

function setLoading(btnId, spinnerId, loading) {
    const btn     = document.getElementById(btnId);
    const spinner = document.getElementById(spinnerId);
    if (btn)     btn.disabled         = loading;
    if (spinner) spinner.style.display = loading ? "inline-block" : "none";
}

// ─────────────────────────────────────────────────────────────────────────────
// Handle: Login
// ─────────────────────────────────────────────────────────────────────────────

async function handleLogin() {
    clearAllErrors();
    const email    = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;

    // Client-side validation
    let valid = true;
    if (!email)    { setError("login-email-error",    "Email is required.");    valid = false; }
    if (!password) { setError("login-password-error", "Password is required."); valid = false; }
    if (!valid) return;

    setLoading("login-btn", "login-spinner", true);

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle redirect once user is set
    } catch (err) {
        setError("login-password-error", friendlyAuthError(err.code));
    } finally {
        setLoading("login-btn", "login-spinner", false);
    }
}

window.handleLogin = handleLogin;

// Allow Enter key to submit login
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

    // Client-side validation
    let valid = true;
    if (!name)                   { setError("signup-name-error",     "Name is required.");             valid = false; }
    if (!email)                  { setError("signup-email-error",    "Email is required.");            valid = false; }
    if (!password)               { setError("signup-password-error", "Password is required.");         valid = false; }
    if (password && password.length < 8) {
                                   setError("signup-password-error", "Minimum 8 characters.");         valid = false; }
    if (password !== confirm)    { setError("signup-confirm-error",  "Passwords do not match.");       valid = false; }
    if (!valid) return;

    setLoading("signup-btn", "signup-spinner", true);

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Set display name immediately after account creation
        await updateProfile(cred.user, { displayName: name });
        // onAuthStateChanged redirect fires once profile is updated
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
// ─────────────────────────────────────────────────────────────────────────────

async function handleGoogleSignIn() {
    clearAllErrors();
    try {
        await signInWithPopup(auth, provider);
        // Redirect handled by onAuthStateChanged
    } catch (err) {
        showNotification(friendlyAuthError(err.code), "error");
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