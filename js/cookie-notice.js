(function () {
  const STORAGE_KEY = "careerUnifiedCookieConsent";
  const LEGACY_STORAGE_KEY = "cookiesAccepted";
  const ROOT_ID = "careerUnifiedCookieNotice";

  function readConsent() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
      // Keep users who already accepted from seeing the notice again.
      if (localStorage.getItem(LEGACY_STORAGE_KEY) === "true") {
        return {necessary: true, analytics: true, advertising: true, savedAt: new Date().toISOString()};
      }
    } catch (error) {
      // Treat blocked storage as no saved choice and retain this page's controls.
    }
    return null;
  }

  function saveConsent(consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({...consent, savedAt: new Date().toISOString()}));
      localStorage.setItem(LEGACY_STORAGE_KEY, consent.analytics || consent.advertising ? "true" : "false");
    } catch (error) {
      // Storage can fail in strict private browsing modes; still hide for this session.
    }
    document.getElementById(ROOT_ID)?.remove();
  }

  function injectStyles() {
    if (document.getElementById("careerUnifiedCookieNoticeStyles")) return;

    const style = document.createElement("style");
    style.id = "careerUnifiedCookieNoticeStyles";
    style.textContent = `
      .cu-cookie-notice {
        position: fixed;
        left: 50%;
        bottom: 22px;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        gap: 12px;
        width: max-content;
        max-width: calc(100% - 32px);
        min-height: 70px;
        padding: 9px 12px;
        color: #171717;
        background: #fff;
        border: 1px solid #dedede;
        border-radius: 999px;
        box-shadow: 0 7px 20px rgba(0, 0, 0, 0.16), 0 0 0 5px rgba(0, 0, 0, 0.06);
        transform: translateX(-50%);
        font-family: Arial, sans-serif;
      }

      .cu-cookie-notice__cookie {
        display: grid;
        flex: 0 0 42px;
        width: 42px;
        height: 42px;
        place-items: center;
        color: #171717;
        background: #f2f2f2;
        border-radius: 50%;
      }

      .cu-cookie-notice__text {
        margin: 0;
        color: #202020;
        font-size: 15px;
        line-height: 1.4;
      }

      .cu-cookie-notice__text a { display: none; }

      .cu-cookie-notice__settings,
      .cu-cookie-notice__button {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        cursor: pointer;
      }

      .cu-cookie-notice__settings {
        width: 36px;
        padding: 0;
        color: #777;
        background: transparent;
        border: 0;
        border-radius: 50%;
      }

      .cu-cookie-notice__button {
        padding: 0 19px;
        color: #171717;
        background: #fff;
        border: 1px solid #d7d7d7;
        border-radius: 14px;
        font: inherit;
        font-size: 15px;
        font-weight: 500;
        white-space: nowrap;
      }

      .cu-cookie-notice__button:hover { background: #f6f6f6; }

      .cu-cookie-notice__button--accept {
        color: #fff;
        background: #111;
        border-color: #111;
      }

      .cu-cookie-notice__button--accept:hover { background: #303030; }

      .cu-cookie-notice__settings:focus-visible,
      .cu-cookie-notice__button:focus-visible,
      .cu-cookie-notice__preferences button:focus-visible,
      .cu-cookie-notice__preferences input:focus-visible {
        outline: 3px solid #5488ff;
        outline-offset: 2px;
      }

      .cu-cookie-notice__preferences {
        position: absolute;
        right: 118px;
        bottom: calc(100% + 12px);
        width: min(350px, calc(100vw - 36px));
        padding: 18px;
        color: #202020;
        background: #fff;
        border: 1px solid #dedede;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
      }

      .cu-cookie-notice__preferences[hidden] { display: none; }
      .cu-cookie-notice__preferences h2 { margin: 0 0 8px; font-size: 17px; }
      .cu-cookie-notice__preferences p { margin: 0 0 14px; color: #555; font-size: 13px; line-height: 1.45; }
      .cu-cookie-notice__preferences a { color: #333; font-size: 13px; text-underline-offset: 3px; }
      .cu-cookie-notice__preference { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid #eee; font-size: 14px; }
      .cu-cookie-notice__preference input { width: 18px; height: 18px; accent-color: #111; }
      .cu-cookie-notice__preferences button { min-height: 40px; width: 100%; margin-top: 12px; color: white; background: #111; border: 0; border-radius: 10px; font: inherit; font-weight: 600; cursor: pointer; }

      @media (max-width: 600px) {
        .cu-cookie-notice {
          bottom: 14px;
          width: calc(100% - 24px);
          max-width: 440px;
          min-height: 0;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 8px;
          padding: 10px;
          border-radius: 22px;
        }
        .cu-cookie-notice__cookie { width: 36px; height: 36px; flex-basis: 36px; }
        .cu-cookie-notice__text { flex: 1; min-width: 0; font-size: 13px; }
        .cu-cookie-notice__settings { width: 34px; min-height: 38px; }
        .cu-cookie-notice__button { flex: 1 1 calc(50% - 5px); min-height: 42px; padding: 0 12px; font-size: 14px; }
        .cu-cookie-notice__preferences { right: 0; bottom: calc(100% + 12px); }
      }

      @media (prefers-reduced-motion: no-preference) {
        .cu-cookie-notice__preferences { animation: cu-cookie-pop 140ms ease-out; }
        @keyframes cu-cookie-pop { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      }
    `;
    document.head.appendChild(style);
  }

  function showCookieNotice() {
    if (readConsent() || document.getElementById(ROOT_ID)) return;
    injectStyles();

    const notice = document.createElement("section");
    notice.id = ROOT_ID;
    notice.className = "cu-cookie-notice";
    notice.setAttribute("aria-label", "Cookie notice");
    notice.innerHTML = `
      <span class="cu-cookie-notice__cookie" aria-hidden="true">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.4 13.1A8.9 8.9 0 0 1 10.9 3.6a8.95 8.95 0 1 0 9.5 9.5Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9" r=".9" fill="currentColor"/><circle cx="13" cy="7" r=".9" fill="currentColor"/><circle cx="16" cy="12" r=".9" fill="currentColor"/><circle cx="10" cy="15" r=".9" fill="currentColor"/></svg>
      </span>
      <p class="cu-cookie-notice__text">By clicking “Accept”, you agree to the storing of cookies on your device. <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></p>
      <button class="cu-cookie-notice__settings" type="button" aria-label="Cookie settings" aria-expanded="false" title="Cookie settings">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h10M18 7h2M4 17h2m4 0h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="16" cy="7" r="2" fill="white" stroke="currentColor" stroke-width="1.7"/><circle cx="8" cy="17" r="2" fill="white" stroke="currentColor" stroke-width="1.7"/></svg>
      </button>
      <button class="cu-cookie-notice__button cu-cookie-notice__button--reject" type="button">Reject</button>
      <button class="cu-cookie-notice__button cu-cookie-notice__button--accept" type="button">Accept</button>
      <div class="cu-cookie-notice__preferences" role="dialog" aria-label="Cookie preferences" hidden>
        <h2>Cookie preferences</h2>
        <p>Choose which optional cookies Career Unified may store. Necessary cookies are always on.</p>
        <label class="cu-cookie-notice__preference"><span>Necessary</span><input type="checkbox" checked disabled aria-label="Necessary cookies always enabled"></label>
        <label class="cu-cookie-notice__preference"><span>Analytics</span><input class="cu-cookie-notice__analytics" type="checkbox"></label>
        <label class="cu-cookie-notice__preference"><span>Advertising</span><input class="cu-cookie-notice__advertising" type="checkbox"></label>
        <button class="cu-cookie-notice__save" type="button">Save preferences</button>
        <p style="margin:12px 0 0"><a href="/privacy" target="_blank" rel="noopener noreferrer">Read our Privacy Policy</a></p>
      </div>
    `;

    const settingsButton = notice.querySelector(".cu-cookie-notice__settings");
    const preferences = notice.querySelector(".cu-cookie-notice__preferences");
    const togglePreferences = () => {
      const isOpen = preferences.hidden;
      preferences.hidden = !isOpen;
      settingsButton.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) preferences.querySelector("input:not([disabled])")?.focus();
    };

    settingsButton.addEventListener("click", togglePreferences);
    notice.querySelector(".cu-cookie-notice__button--reject")?.addEventListener("click", () => {
      saveConsent({necessary: true, analytics: false, advertising: false});
    });
    notice.querySelector(".cu-cookie-notice__button--accept")?.addEventListener("click", () => {
      saveConsent({necessary: true, analytics: true, advertising: true});
    });
    notice.querySelector(".cu-cookie-notice__save")?.addEventListener("click", () => {
      saveConsent({
        necessary: true,
        analytics: notice.querySelector(".cu-cookie-notice__analytics").checked,
        advertising: notice.querySelector(".cu-cookie-notice__advertising").checked,
      });
    });
    notice.addEventListener("keydown", function onCookieNoticeKeydown(event) {
      if (event.key === "Escape" && !preferences.hidden) {
        preferences.hidden = true;
        settingsButton.setAttribute("aria-expanded", "false");
        settingsButton.focus();
      }
    });

    document.body.appendChild(notice);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showCookieNotice, {once: true});
  } else {
    showCookieNotice();
  }
})();
