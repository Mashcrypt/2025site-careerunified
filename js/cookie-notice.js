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
        width: min(270px, calc(100vw - 36px));
        padding: 18px 20px 14px;
        color: #181818;
        background: #fff;
        border: 1px solid #eeeaf2;
        border-radius: 6px;
        box-shadow: 0 12px 34px rgba(36, 20, 48, 0.2);
      }

      .cu-cookie-notice__preferences[hidden] { display: none; }
      .cu-cookie-notice__preferences h2 { margin: 0 0 18px; font-size: 16px; line-height: 1.45; text-align: center; }
      .cu-cookie-notice__intro { margin: 0 0 14px; color: #666; font-size: 12px; line-height: 1.5; }
      .cu-cookie-notice__preference { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 7px 0; font-size: 12px; font-weight: 700; }
      .cu-cookie-notice__switch { position: relative; display: inline-flex; flex: 0 0 48px; width: 48px; height: 26px; margin: 0; }
      .cu-cookie-notice__switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      .cu-cookie-notice__switch-track { position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 6px; color: #fff; background: #4d4d4d; border-radius: 999px; font-size: 10px; transition: background 140ms ease; }
      .cu-cookie-notice__switch-track::after { position: absolute; left: 2px; width: 22px; height: 22px; content: ""; background: #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(0, 0, 0, .2); transition: transform 140ms ease; }
      .cu-cookie-notice__switch input:checked + .cu-cookie-notice__switch-track { justify-content: flex-start; background: #9473a8; }
      .cu-cookie-notice__switch input:checked + .cu-cookie-notice__switch-track::after { transform: translateX(22px); }
      .cu-cookie-notice__switch input:disabled + .cu-cookie-notice__switch-track { background: #ac98bb; cursor: not-allowed; }
      .cu-cookie-notice__switch input:focus-visible + .cu-cookie-notice__switch-track { outline: 3px solid #5488ff; outline-offset: 2px; }
      .cu-cookie-notice__preference-description { display: none; margin: 1px 0 6px; color: #777; font-size: 12px; line-height: 1.5; }
      .cu-cookie-notice__preferences.is-expanded .cu-cookie-notice__preference-description { display: block; }
      .cu-cookie-notice__save { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 36px; margin: 14px auto 0; padding: 0 18px; color: white; background: #583178; border: 0; border-radius: 999px; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
      .cu-cookie-notice__save:hover { background: #472563; }
      .cu-cookie-notice__details-toggle { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 12px auto 0; padding: 4px 8px; color: #583178; background: transparent; border: 0; font: inherit; font-size: 11px; cursor: pointer; }
      .cu-cookie-notice__details-toggle svg { width: 12px; height: 12px; transition: transform 140ms ease; }
      .cu-cookie-notice__preferences.is-expanded .cu-cookie-notice__details-toggle svg { transform: rotate(180deg); }
      .cu-cookie-notice__privacy { display: block; margin: 9px 0 0; text-align: center; }
      .cu-cookie-notice__privacy a { color: #583178; font-size: 11px; text-underline-offset: 3px; }

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
        .cu-cookie-notice__preferences { right: 70px; bottom: calc(100% + 12px); }
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
        <h2>Customise your preferences</h2>
        <p class="cu-cookie-notice__intro">Choose which cookies Career Unified may store on your device.</p>
        <div class="cu-cookie-notice__preference"><span>Necessary</span><label class="cu-cookie-notice__switch"><input type="checkbox" checked disabled aria-label="Necessary cookies always enabled"><span class="cu-cookie-notice__switch-track" aria-hidden="true">✓</span></label></div>
        <p class="cu-cookie-notice__preference-description">These cookies are required for core site features, security, and remembering your consent choice.</p>
        <div class="cu-cookie-notice__preference"><span>Analytics &amp; performance</span><label class="cu-cookie-notice__switch"><input class="cu-cookie-notice__analytics" type="checkbox" aria-label="Allow analytics and performance cookies"><span class="cu-cookie-notice__switch-track" aria-hidden="true">×</span></label></div>
        <p class="cu-cookie-notice__preference-description">These cookies help us understand site usage and improve the Career Unified experience.</p>
        <div class="cu-cookie-notice__preference"><span>Marketing</span><label class="cu-cookie-notice__switch"><input class="cu-cookie-notice__advertising" type="checkbox" aria-label="Allow marketing cookies"><span class="cu-cookie-notice__switch-track" aria-hidden="true">×</span></label></div>
        <p class="cu-cookie-notice__preference-description">These cookies may be used to measure campaigns and provide relevant advertising.</p>
        <button class="cu-cookie-notice__save" type="button">Save preferences <span aria-hidden="true">✓</span></button>
        <button class="cu-cookie-notice__details-toggle" type="button" aria-expanded="false">
          <span>Expand details</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 6 5 5 5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <p class="cu-cookie-notice__privacy"><a href="/privacy" target="_blank" rel="noopener noreferrer">Read our Privacy Policy</a></p>
      </div>
    `;

    const settingsButton = notice.querySelector(".cu-cookie-notice__settings");
    const preferences = notice.querySelector(".cu-cookie-notice__preferences");
    const detailsToggle = notice.querySelector(".cu-cookie-notice__details-toggle");
    const togglePreferences = () => {
      const isOpen = preferences.hidden;
      preferences.hidden = !isOpen;
      settingsButton.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) preferences.querySelector("input:not([disabled])")?.focus();
    };

    settingsButton.addEventListener("click", togglePreferences);
    detailsToggle.addEventListener("click", () => {
      const expanded = preferences.classList.toggle("is-expanded");
      detailsToggle.setAttribute("aria-expanded", String(expanded));
      detailsToggle.querySelector("span").textContent = expanded ? "Hide details" : "Expand details";
    });
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
