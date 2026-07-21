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
  @media(max-width:800px){.site-detail-footer-inner{grid-template-columns:1fr}.site-detail-footer-links{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:560px){.site-detail-footer-links{grid-template-columns:1fr}.site-detail-footer{padding-inline:16px}}
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
    <a href="/recruiter-apply.html">Apply as Recruiter</a>
    <a href="/saved-items.html">Saved Items</a>
    <a href="/signup.html">Sign Up</a>
    <a href="/login.html">Login</a>
  </div>`;
}

export function renderSiteFooter() {
  return `<footer class="site-detail-footer">
    <div class="site-detail-footer-inner">
      <div class="site-detail-footer-brand">
        <strong>Career Unified</strong>
        <p>Jobs, bursaries, university application information and practical career tools for South Africans.</p>
      </div>
      <nav class="site-detail-footer-links" aria-label="Footer navigation">
        <div><h2>Opportunities</h2><a href="/jobs">Jobs</a><a href="/bursaries">Bursaries</a><a href="/varsity">Varsities</a></div>
        <div><h2>Career tools</h2><a href="/cv-generator/">Generate CV</a><a href="/z83-filler">Z83 Filler</a><a href="/cv-tips">CV Tips</a></div>
        <div><h2>Company</h2><a href="/about-us">About Us</a><a href="/contact-us">Contact Us</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></div>
      </nav>
    </div>
    <div class="site-detail-footer-bottom">&copy; 2026 Career Unified. All rights reserved.</div>
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
