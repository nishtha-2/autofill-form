// ─────────────────────────────────────────────────────────────────────────────
// background.js — Service Worker (Manifest V3)
// Responsibilities:
//   1. Message bus: relay FILL_FIELDS from popup → content script in active tab
//   2. Cache last extracted data in chrome.storage.session (cleared on browser close)
//   3. Handle extension install / update lifecycle
// ─────────────────────────────────────────────────────────────────────────────

// ── Install / Update lifecycle ───────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
        console.log("[AutoFillAI] Extension installed.");
    }
    if (reason === "update") {
        console.log("[AutoFillAI] Extension updated.");
    }
});

// ── Message listener ─────────────────────────────────────────────────────────
//
// Messages popup.js sends to background:
//   { type: "FILL_FIELDS",  data: { name, email, … } }  → relay to content.js
//   { type: "GET_CACHED",                              }  → return last data
//   { type: "SAVE_CACHED",  data: { … }               }  → persist last data
//
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // ── Relay fill instruction to the active tab's content script ────────────
    if (message.type === "FILL_FIELDS") {
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({
                    active:        true,
                    currentWindow: true,
                });

                if (!tab?.id) {
                    sendResponse({ ok: false, error: "No active tab found." });
                    return;
                }

                chrome.tabs.sendMessage(
                    tab.id,
                    { type: "FILL_FIELDS", data: message.data },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            sendResponse({
                                ok: false,
                                error: chrome.runtime.lastError.message || "Could not reach content script.",
                            });
                            return;
                        }
                        sendResponse({ ok: true, result: response });
                    }
                );

            } catch (err) {
                console.warn("[AutoFillAI] Could not reach content script:", err.message);
                sendResponse({
                    ok: false,
                    error: "Cannot fill this page. Try a regular website.",
                });
            }
        })();

        return true;
    }

    // ── Google OAuth ───────────────────────────────────────────────────────
    if (message.type === "GOOGLE_AUTH") {
        (async () => {
            try {
                const redirectUri = chrome.identity.getRedirectURL();

                const authUrl =
                    "https://accounts.google.com/o/oauth2/v2/auth" +
                    "?client_id=" + encodeURIComponent(
                        "459461217144-j8m496eqs1v0gvsbh5qmuug87c35k3pe.apps.googleusercontent.com"
                    ) +
                    "&response_type=id_token" +
                    "&redirect_uri=" + encodeURIComponent(redirectUri) +
                    "&scope=" + encodeURIComponent("openid email profile") +
                    "&prompt=select_account";

                chrome.identity.launchWebAuthFlow(
                    {
                        url: authUrl,
                        interactive: true
                    },
                    (responseUrl) => {
                        if (chrome.runtime.lastError) {
                            sendResponse({
                                ok: false,
                                error: chrome.runtime.lastError.message,
                            });
                            return;
                        }

                        const hash = new URL(responseUrl).hash.substring(1);
                        const params = new URLSearchParams(hash);
                        const idToken = params.get("id_token");

                        if (!idToken) {
                            sendResponse({
                                ok: false,
                                error: "No ID token returned.",
                            });
                            return;
                        }

                        sendResponse({ ok: true, idToken });
                    }
                );
            } catch (err) {
                sendResponse({ ok: false, error: err.message });
            }
        })();

        return true;
    }

    // ── Cache last extracted payload (used by popup on re-open) ─────────────
    if (message.type === "SAVE_CACHED") {
        chrome.storage.session.set({ lastExtracted: message.data });
        sendResponse({ ok: true });
        return false;
    }

    // ── Return cached payload ────────────────────────────────────────────────
    if (message.type === "GET_CACHED") {
        chrome.storage.session.get("lastExtracted", (result) => {
            sendResponse({ ok: true, data: result.lastExtracted || null });
        });
        return true;
    }
});