(function () {
  function encodeForm(form) {
    const params = new URLSearchParams();
    const data = new FormData(form);

    data.forEach((value, key) => {
      if (typeof value === 'string') params.append(key, value);
    });

    return params.toString();
  }

  function initialiseJobAlertForm(form) {
    const button = form.querySelector('button[type="submit"]');
    const note = form.querySelector('.footer-alert-note');
    const defaultButtonText = button?.textContent || 'Subscribe';
    const defaultNoteText = note?.textContent || '';

    note?.setAttribute('role', 'status');
    note?.setAttribute('aria-live', 'polite');

    form.addEventListener('input', () => {
      if (note && form.dataset.submitting !== 'true') note.textContent = defaultNoteText;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || form.dataset.submitting === 'true') return;

      form.dataset.submitting = 'true';
      if (button) {
        button.disabled = true;
        button.textContent = 'Subscribing...';
      }
      if (note) note.textContent = 'Saving your email securely...';

      try {
        const response = await fetch(form.action || '/job-alerts-success.html', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: encodeForm(form),
          credentials: 'same-origin',
        });

        if (!response.ok) throw new Error(`Job alert submission failed with status ${response.status}`);

        form.reset();
        if (note) note.textContent = "You're subscribed. Your email was added to the Career Unified job-alert list.";
      } catch {
        if (note) note.textContent = "We couldn't save your email. Please try again in a moment.";
      } finally {
        form.dataset.submitting = 'false';
        if (button) {
          button.disabled = false;
          button.textContent = defaultButtonText;
        }
      }
    });
  }

  document.querySelectorAll('form[name="job-alerts"]').forEach(initialiseJobAlertForm);
})();
