// auth.js — lightweight local auth for the extension

(function applyTheme() {
    try {
        chrome.storage.local.get("theme", ({ theme }) => {
            document.documentElement.setAttribute("data-theme", theme || "light");
        });
    } catch (_) {
        document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "light");
    }
})();

function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    try {
        chrome.storage.local.set({ theme: next });
    } catch (_) {
        localStorage.setItem("theme", next);
    }
}
window.toggleTheme = toggleTheme;

function showNotification(message, type = "success") {
    const banner = document.getElementById("notification-banner");
    if (!banner) return;
    banner.textContent = message;
    banner.className = `notification ${type}`;
    banner.style.display = "block";
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { banner.style.display = "none"; }, 3000);
}

function saveUser(name, email) {
    const user = { name, email };
    chrome.storage.local.set({ autofillUser: user });
    showNotification(`Signed in as ${name || email}`, "success");
    setTimeout(() => window.close(), 800);
}

function handleLogin() {
    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;
    if (!email || !password) {
        showNotification("Please enter email and password.", "error");
        return;
    }
    saveUser(email.split("@")?.[0] || email, email);
}
window.handleLogin = handleLogin;

function handleSignUp() {
    const name = document.getElementById("signup-name")?.value.trim();
    const email = document.getElementById("signup-email")?.value.trim();
    const password = document.getElementById("signup-password")?.value;
    const confirm = document.getElementById("signup-confirm")?.value;

    if (!name || !email || !password || password !== confirm) {
        showNotification("Please fill in the form correctly.", "error");
        return;
    }
    saveUser(name, email);
}
window.handleSignUp = handleSignUp;

function handleGoogleSignIn() {
    saveUser("Google User", "google-user@example.com");
}
window.handleGoogleSignIn = handleGoogleSignIn;

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === "text" ? "password" : "text";
    btn.style.opacity = input.type === "password" ? "0.4" : "0.8";
}
window.togglePassword = togglePassword;

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);
    document.getElementById("login-btn")?.addEventListener("click", handleLogin);
    document.getElementById("signup-btn")?.addEventListener("click", handleSignUp);
    document.getElementById("google-login-btn")?.addEventListener("click", handleGoogleSignIn);
    document.getElementById("google-signup-btn")?.addEventListener("click", handleGoogleSignIn);
    document.getElementById("login-password-toggle")?.addEventListener("click", function () {
        togglePassword("login-password", this);
    });
    document.getElementById("signup-password-toggle")?.addEventListener("click", function () {
        togglePassword("signup-password", this);
    });
    document.getElementById("signup-confirm-toggle")?.addEventListener("click", function () {
        togglePassword("signup-confirm", this);
    });
});
