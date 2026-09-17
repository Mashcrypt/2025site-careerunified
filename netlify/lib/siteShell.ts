type ActiveSection = "jobs" | "bursaries" | "varsities";

function currentPage(activeSection: ActiveSection, section: ActiveSection) {
  return activeSection === section ? ' aria-current="page"' : "";
}

export const SITE_SHELL_STYLES = `
  .site-detail-page .main-nav{z-index:100;position:relative;display:flex;align-items:center;justify-content:space-between;padding:15px 30px;background:#1e3a8a}
  .site-detail-page .main-nav a{text-decoration:none}
  .site-detail-page .logo{color:#fff;font-size:22px;font-weight:700}
  .site-detail-page .nav-links{display:flex;align-items:center;gap:16px}
  .site-detail-page .nav-links a{color:#fff;font-weight:600}
  .site-detail-page .nav-links a:hover{color:#facc15}
  .site-detail-page .nav-links a[aria-current="page"]{color:#facc15}
  .site-detail-page .desktop-nav{display:flex}
  .site-detail-page .mobile-nav,.site-detail-page .mobile-menu{display:none}
  .site-detail-page .desktop-account-btn,.site-detail-page .icon-btn{display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border:0;border-radius:8px;background:transparent;color:#fff;cursor:pointer}
  .site-detail-page .desktop-account-btn:hover,.site-detail-page .icon-btn:hover{background:rgba(255,255,255,.1);color:#fff}
  .site-detail-page .icon-btn svg,.site-detail-page .desktop-account-btn svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .site-detail-page .mobile-logo{color:#fff;font-size:18px;font-weight:700;letter-spacing:0;text-decoration:none}
  .site-detail-page .mobile-menu a[aria-current="page"]{background:#eaf1fb;color:#1e3a8a}
  .site-detail-footer{margin-top:0;padding:42px 20px 28px;background:#1e3a8a;color:#fff}
  .site-detail-footer-inner{display:grid;grid-template-columns:1.1fr 2fr;gap:40px;width:min(1120px,100%);margin:0 auto}
  .site-detail-footer-brand{max-width:360px}
  .site-detail-footer-brand strong{display:block;margin-bottom:10px;font-size:21px}
  .site-detail-footer-brand p{margin:0;color:rgba(255,255,255,.78);font-size:14px}
  .site-detail-footer-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
  .site-detail-footer-links h2{margin:0 0 10px;color:#fff;font-size:15px;letter-spacing:.02em}
  .site-detail-footer-links a{display:block;margin:9px 0;color:#facc15;font-size:14px;font-weight:650;line-height:1.35;text-decoration:none}
  .site-detail-footer-links a:hover{text-decoration:underline}
  .site-detail-footer-bottom{width:min(1120px,100%);margin:28px auto 0;padding-top:20px;border-top:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.82);text-align:center;font-size:13px}
  .job-detail-page .main-nav,.bursary-detail-page .main-nav{background:#fff;border-bottom:1px solid #e5e7eb}
  .job-detail-page .logo,.job-detail-page .nav-links a,.job-detail-page .mobile-logo,.bursary-detail-page .logo,.bursary-detail-page .nav-links a,.bursary-detail-page .mobile-logo{color:#1e3a8a}
  .job-detail-page .nav-links a:hover,.job-detail-page .nav-links a[aria-current="page"],.bursary-detail-page .nav-links a:hover,.bursary-detail-page .nav-links a[aria-current="page"]{color:#2563eb}
  .job-detail-page .desktop-account-btn,.job-detail-page .icon-btn,.bursary-detail-page .desktop-account-btn,.bursary-detail-page .icon-btn{color:#1e3a8a}
  .job-detail-page .desktop-account-btn:hover,.job-detail-page .icon-btn:hover,.bursary-detail-page .desktop-account-btn:hover,.bursary-detail-page .icon-btn:hover{background:#eff6ff;color:#2563eb}
  .job-detail-page .site-detail-footer,.bursary-detail-page .site-detail-footer{background:#fff;color:#1e3a8a;border-top:1px solid #e5e7eb}
  .job-detail-page .site-detail-footer-inner,.bursary-detail-page .site-detail-footer-inner{display:block;width:min(1180px,100%)}
  .job-detail-page .site-detail-footer-main{display:grid;grid-template-columns:minmax(220px,1.15fr) minmax(420px,1.7fr);gap:34px;align-items:start}
  .job-detail-page .site-detail-footer-alerts h2,.job-detail-page .site-detail-footer-column h3{margin:0 0 12px;color:#0f1623}
  .job-detail-page .site-detail-footer-alerts h2{font-family:Georgia,serif;font-size:1.7rem;line-height:1.2}
  .job-detail-page .site-detail-footer-alerts p{margin:0;color:#66738c;line-height:1.65}
  .job-detail-page .site-detail-footer-alert-form{margin-top:18px}
  .job-detail-page .site-detail-footer-alert-form label{display:block;margin-bottom:8px;color:#0f1623;font-weight:600}
  .job-detail-page .site-detail-footer-alert-row{display:flex;gap:8px}
  .job-detail-page .site-detail-footer-alert-row input{min-width:0;flex:1;border:1px solid #d8e0ee;border-radius:999px;padding:12px 14px;background:#fff;color:#0f1623;outline:0}
  .job-detail-page .site-detail-footer-alert-row input::placeholder{color:#98a2b3}
  .job-detail-page .site-detail-footer-alert-row input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.14)}
  .job-detail-page .site-detail-footer-alert-row button{border:0;border-radius:999px;padding:12px 16px;background:#2563eb;color:#fff;cursor:pointer;font-weight:700}
  .job-detail-page .site-detail-footer-alert-row button:hover,.job-detail-page .site-detail-footer-alert-row button:focus-visible{background:#1d4ed8}
  .job-detail-page .site-detail-footer-alert-note{display:block;margin-top:10px;color:#66738c;font-size:.83rem}
  .job-detail-page .site-detail-footer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
  .job-detail-page .site-detail-footer-column h3{font-size:.78rem;letter-spacing:.04em;text-transform:uppercase}
  .job-detail-page .site-detail-footer-column a{display:block;margin:9px 0;color:#66738c;font-size:14px;font-weight:500;line-height:1.35;text-decoration:none}
  .job-detail-page .site-detail-footer-column a:hover,.job-detail-page .site-detail-footer-column a:focus-visible{color:#1d4ed8}
  .job-detail-page .site-detail-footer-socials{display:flex;justify-content:center;gap:18px;width:min(1180px,100%);margin:34px auto 20px;padding-top:24px;border-top:1px solid #e2e8f2}
  .job-detail-page .site-detail-footer-socials a{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border:1px solid #d8e0ee;border-radius:12px;background:#fff;color:#2563eb;font-size:18px;font-weight:700;text-decoration:none}
  .job-detail-page .site-detail-footer-socials svg{width:18px;height:18px;fill:currentColor}
  .job-detail-page .site-detail-footer-socials a:hover{background:#eff6ff;border-color:#bfdbfe;transform:translateY(-2px)}
  .job-detail-page .site-detail-footer-bottom{width:min(1180px,100%);margin:0 auto;padding-top:0;border-top:0;color:#66738c}
  .bursary-detail-page .site-detail-footer-main{display:grid;grid-template-columns:minmax(220px,1.15fr) minmax(420px,1.7fr);gap:34px;align-items:start}
  .bursary-detail-page .site-detail-footer-alerts h2,.bursary-detail-page .site-detail-footer-column h3{margin:0 0 12px;color:#0f1623}
  .bursary-detail-page .site-detail-footer-alerts h2{font-family:Georgia,serif;font-size:1.7rem;line-height:1.2}
  .bursary-detail-page .site-detail-footer-alerts p{margin:0;color:#66738c;line-height:1.65}
  .bursary-detail-page .site-detail-footer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
  .bursary-detail-page .site-detail-footer-column h3{font-size:.78rem;letter-spacing:.04em;text-transform:uppercase}
  .bursary-detail-page .site-detail-footer-column a{display:block;margin:9px 0;color:#66738c;font-size:14px;font-weight:500;line-height:1.35;text-decoration:none}
  .bursary-detail-page .site-detail-footer-column a:hover{color:#1d4ed8}
  .bursary-detail-page .site-detail-footer-socials{display:flex;justify-content:center;gap:18px;width:min(1180px,100%);margin:34px auto 20px;padding-top:24px;border-top:1px solid #e2e8f2}
  .bursary-detail-page .site-detail-footer-socials a{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border:1px solid #d8e0ee;border-radius:12px;background:#fff;color:#2563eb;font-size:18px;font-weight:700;text-decoration:none}
  .bursary-detail-page .site-detail-footer-bottom{width:min(1180px,100%);margin:0 auto;padding-top:0;border-top:0;color:#66738c}
  @media(max-width:1000px){.site-detail-page .nav-links{gap:11px}.site-detail-page .nav-links a{font-size:14px}}
  @media(max-width:900px){
    .site-detail-page .desktop-nav{display:none}
    .site-detail-page .main-nav{padding:12px 16px}
    .site-detail-page .mobile-nav{display:flex;width:100%;align-items:center;justify-content:space-between}
    .site-detail-page .mobile-nav-right{display:flex;align-items:center;gap:8px}
    .site-detail-page .mobile-menu{position:fixed;top:64px;right:0;z-index:9999;width:280px;max-width:calc(100vw - 32px);max-height:calc(100vh - 96px);max-height:calc(100dvh - 96px);margin:16px;padding:8px 0;overflow-y:auto;border-radius:12px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.15)}
    .site-detail-page .mobile-menu a{display:flex;align-items:center;padding:14px 20px;color:#1e3a8a;font-size:15px;font-weight:600;text-decoration:none}
    .site-detail-page .mobile-menu a:hover{background:#f0f7ff}
  }
  @media(max-width:980px){.job-detail-page .site-detail-footer-main,.bursary-detail-page .site-detail-footer-main{grid-template-columns:1fr}.job-detail-page .site-detail-footer-grid,.bursary-detail-page .site-detail-footer-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:800px){.site-detail-footer-inner{grid-template-columns:1fr}.site-detail-footer-links{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:560px){.job-detail-page .site-detail-footer,.bursary-detail-page .site-detail-footer{padding:42px 18px 30px}.job-detail-page .site-detail-footer-grid,.bursary-detail-page .site-detail-footer-grid{grid-template-columns:1fr}.job-detail-page .site-detail-footer-alert-row,.bursary-detail-page .site-detail-footer-alert-row{flex-direction:column}.job-detail-page .site-detail-footer-alert-row button,.bursary-detail-page .site-detail-footer-alert-row button{width:100%}.site-detail-footer-links{grid-template-columns:1fr}.site-detail-footer{padding-inline:16px}}
`;

export function renderSiteNavigation(activeSection: ActiveSection) {
  return `<nav class="main-nav" aria-label="Main navigation">
    <a href="/" class="logo desktop-nav">Career Unified</a>
    <div class="nav-links desktop-nav">
      <a href="/jobs"${currentPage(activeSection, "jobs")}>Jobs</a>
      <a href="/bursaries"${currentPage(activeSection, "bursaries")}>Bursaries</a>
      <a href="/varsity"${currentPage(activeSection, "varsities")}>Varsities</a>
      <a href="/cv-generator/">Generate CV</a>
      <a href="/z83-filler">Z83 Filler</a>
      <a href="/cv-tips">CV Tips</a>
      <a href="/login.html">Login</a>
      <a href="/account-page.html" class="icon-btn desktop-account-btn" aria-label="My Account" title="My Account">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </a>
    </div>
    <div class="mobile-nav">
      <a href="/" class="mobile-logo">Career Unified</a>
      <div class="mobile-nav-right">
        <a href="/account-page.html" class="icon-btn" aria-label="My Account">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </a>
        <button class="icon-btn" id="menuBtn" type="button" aria-label="Main Menu" aria-controls="mobileMenu" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>
    </div>
  </nav>
  <div class="mobile-menu" id="mobileMenu">
    <a href="/jobs"${currentPage(activeSection, "jobs")}>Jobs</a>
    <a href="/bursaries"${currentPage(activeSection, "bursaries")}>Bursaries</a>
    <a href="/varsity"${currentPage(activeSection, "varsities")}>Varsities</a>
    <a href="/cv-generator/">Generate CV</a>
    <a href="/z83-filler">Z83 Filler</a>
    <a href="/cv-tips">CV Tips</a>
    <a href="/recruiter-dashboard.html">Recruiter Dashboard</a>
    <a href="/saved-items.html">Saved Items</a>
    <a href="/signup.html">Sign Up</a>
    <a href="/login.html">Login</a>
  </div>`;
}

export function renderSiteFooter() {
  return `<footer class="site-detail-footer">
    <div class="site-detail-footer-inner">
      <div class="site-detail-footer-main">
        <section class="site-detail-footer-alerts" aria-label="Job Alerts">
          <h2>Job Alerts</h2>
          <p>Get new jobs, bursaries, and career tips sent to your inbox.</p>
          <form class="site-detail-footer-alert-form" name="job-alerts" action="/job-alerts-success.html" method="POST" data-netlify="true" netlify-honeypot="bot-field">
            <input type="hidden" name="form-name" value="job-alerts">
            <p hidden><label>Leave this field empty <input name="bot-field"></label></p>
            <label for="detailFooterJobAlertEmail">Email address</label>
            <div class="site-detail-footer-alert-row"><input id="detailFooterJobAlertEmail" type="email" name="email" placeholder="you@example.com" required><button type="submit">Subscribe</button></div>
            <span class="site-detail-footer-alert-note">No spam. Just useful opportunities and preparation tips.</span>
          </form>
        </section>
        <nav class="site-detail-footer-grid" aria-label="Footer navigation">
          <div class="site-detail-footer-column"><h3>Opportunities</h3><a href="/jobs">Jobs</a><a href="/bursaries">Bursaries</a><a href="/varsity">Varsities</a><a href="/saved-items.html">Saved Items</a></div>
          <div class="site-detail-footer-column"><h3>Career Tools</h3><a href="/cv-generator/">Generate CV</a><a href="/cv-generator/?tab=ai">AI Tailor</a><a href="/cv-tips">CV Tips</a><a href="/cv-tips#interview-prep">Interview Prep</a><a href="/z83-filler">Z83 Filler</a></div>
          <div class="site-detail-footer-column"><h3>Company</h3><a href="/about-us">About Us</a><a href="/contact-us">Contact Us</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms &amp; Conditions</a><a href="/paia-manual">PAIA</a></div>
        </nav>
      </div>
      <div class="site-detail-footer-socials"><a href="https://whatsapp.com/channel/0029Vb7j7C7GJP89qB7k6e3i" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Channel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.7 11.7 0 0 0 12.1 0C5.6 0 .4 5.2.4 11.7c0 2.1.5 4.1 1.6 5.9L.3 23.8l6.3-1.6a11.7 11.7 0 0 0 5.5 1.4h.1c6.4 0 11.7-5.2 11.7-11.7 0-3.1-1.2-6.1-3.4-8.4ZM12.1 21.6h-.1c-1.7 0-3.3-.5-4.8-1.3l-.3-.2-3.7.9 1-3.6-.2-.4a9.8 9.8 0 1 1 8.1 4.6Zm5.4-7.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.8 1.1-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.6.1-.2.1-.4 0-.6 0-.2-.7-1.6-.9-2.1-.2-.5-.5-.4-.7-.4h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.1 3.3 5.2 4.6 1.9.8 2.7.9 3.7.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.1-1.4-.2-.2-.4-.3-.7-.4Z"/></svg></a><a href="https://www.linkedin.com/company/career-unified" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">in</a></div>
      <div class="site-detail-footer-bottom">&copy; 2026 Career Unified. All rights reserved.</div>
    </div>
  </footer>`;
}

export function renderSiteNavigationScript() {
  return `<script>
    (() => {
      const menuButton = document.getElementById('menuBtn');
      const mobileMenu = document.getElementById('mobileMenu');
      const setMenuOpen = (open) => {
        if (!menuButton || !mobileMenu) return;
        mobileMenu.style.display = open ? 'block' : 'none';
        menuButton.setAttribute('aria-expanded', String(open));
      };

      menuButton?.addEventListener('click', (event) => {
        event.stopPropagation();
        setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
      });
      document.addEventListener('click', (event) => {
        if (mobileMenu && !mobileMenu.contains(event.target) && event.target !== menuButton) {
          setMenuOpen(false);
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setMenuOpen(false);
      });
      window.addEventListener('resize', () => {
        if (window.innerWidth > 900) setMenuOpen(false);
      });
    })();
  </script>`;
}
