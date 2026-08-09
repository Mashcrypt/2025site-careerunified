(function () {
  const STORAGE_KEY = "cookiesAccepted";
  const ROOT_ID = "careerUnifiedCookieNotice";

  function hasAcceptedCookies() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function acceptCookies() {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch (error) {
      // Storage can fail in strict private browsing modes; still hide for this session.
    }

    const notice = document.getElementById(ROOT_ID);
    if (notice) notice.remove();
  }

  function injectStyles() {
    if (document.getElementById("careerUnifiedCookieNoticeStyles")) return;

    const style = document.createElement("style");
    style.id = "careerUnifiedCookieNoticeStyles";
    style.textContent = `
      .cu-cookie-notice {
        position: fixed;
        left: 50%;
        bottom: 18px;
        z-index: 2147483000;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        width: min(680px, calc(100% - 28px));
        padding: 16px;
        color: #111827;
        background: #ffffff;
        border: 1px solid #dbe3ee;
        border-radius: 8px;
        box-shadow: 0 16px 44px rgba(15, 23, 42, 0.18);
        transform: translateX(-50%);
        font-family: Poppins, Arial, sans-serif;
      }

      .cu-cookie-notice__text {
        margin: 0;
        color: #374151;
        font-size: 13px;
        line-height: 1.55;
      }

      .cu-cookie-notice__text strong {
        color: #1e3a8a;
      }

      .cu-cookie-notice__text a {
        color: #1d4ed8;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .cu-cookie-notice__consent {
        display: block;
        margin-top: 5px;
        color: #4b5563;
      }

      .cu-cookie-notice__button {
        min-height: 40px;
        padding: 9px 16px;
        border: 0;
        border-radius: 6px;
        background: #16a34a;
        color: #ffffff;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }

      .cu-cookie-notice__button:hover,
      .cu-cookie-notice__button:focus-visible {
        background: #15803d;
      }

      @media (max-width: 560px) {
        .cu-cookie-notice {
          grid-template-columns: 1fr;
          bottom: 12px;
          width: calc(100% - 24px);
          padding: 14px;
        }

        .cu-cookie-notice__button {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function showCookieNotice() {
    if (hasAcceptedCookies() || document.getElementById(ROOT_ID)) return;

    injectStyles();

    const notice = document.createElement("section");
    notice.id = ROOT_ID;
    notice.className = "cu-cookie-notice";
    notice.setAttribute("aria-label", "Cookie notice");
    notice.innerHTML = `
      <p class="cu-cookie-notice__text">
        <strong>Career Unified uses cookies</strong> and browser storage to remember preferences,
        improve features, understand site usage, and support advertising on selected content pages.
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Read our Privacy Policy</a>
        <span class="cu-cookie-notice__consent">By clicking &ldquo;Accept&rdquo;, you agree that cookies and similar browser storage may be stored on your device.</span>
      </p>
      <button class="cu-cookie-notice__button" type="button">Accept</button>
    `;

    notice.querySelector("button")?.addEventListener("click", acceptCookies);
    document.body.appendChild(notice);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showCookieNotice, { once: true });
  } else {
    showCookieNotice();
  }
})();
