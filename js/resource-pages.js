(() => {
  const toggle = document.querySelector('.resource-nav__toggle')
  const links = document.querySelector('.resource-nav__links')

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('is-open')
      toggle.setAttribute('aria-expanded', String(isOpen))
    })

    links.addEventListener('click', () => {
      links.classList.remove('is-open')
      toggle.setAttribute('aria-expanded', 'false')
    })
  }

  const pageName = document.body.dataset.resourcePage
  if (pageName && typeof window.gtag === 'function') {
    window.gtag('event', 'resource_page_view', {resource_page: pageName})
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-resource-action]')
    if (!link || typeof window.gtag !== 'function') return

    window.gtag('event', 'resource_link_click', {
      resource_page: pageName || 'unknown',
      resource_action: link.dataset.resourceAction,
      destination: link.getAttribute('href') || '',
    })
  })
})()
