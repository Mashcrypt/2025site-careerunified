(() => {
  const navigation = document.querySelector('.article-page .main-nav');
  const menuButton = document.getElementById('menuBtn');
  const mobileMenu = document.getElementById('mobileMenu');

  if (!navigation || !menuButton || !mobileMenu) return;

  const menuLinks = [...mobileMenu.querySelectorAll('a')];
  const closeMenu = ({ restoreFocus = false } = {}) => {
    mobileMenu.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open main menu');
    if (restoreFocus) menuButton.focus();
  };
  const openMenu = () => {
    mobileMenu.classList.add('open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Close main menu');
    menuLinks[0]?.focus();
  };

  menuButton.addEventListener('click', () => {
    if (mobileMenu.classList.contains('open')) closeMenu();
    else openMenu();
  });

  menuLinks.forEach((link) => link.addEventListener('click', () => closeMenu()));

  document.addEventListener('click', (event) => {
    if (!mobileMenu.classList.contains('open')) return;
    if (!navigation.contains(event.target) && !mobileMenu.contains(event.target)) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileMenu.classList.contains('open')) {
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key !== 'Tab' || !mobileMenu.classList.contains('open')) return;
    const focusable = [menuButton, ...menuLinks];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();