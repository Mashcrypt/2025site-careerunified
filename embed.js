(function () {
  'use strict';
  var script = document.currentScript;
  var params = new URL(script && script.src, document.baseURI).searchParams;
  var slug = params.get('slug');
  var groupBy = params.get('group_by') || 'none';
  var container = document.getElementById('careerUnifiedOpeningsContainer');
  if (!container || !slug) return;
  var scriptUrl = new URL(script.src, document.baseURI);
  var origin = scriptUrl.origin;
  var careerOrigin = /localhost$|127\.0\.0\.1$/.test(scriptUrl.hostname) ? scriptUrl.protocol + '//' + slug + '.localhost' + (scriptUrl.port ? ':' + scriptUrl.port : '') : scriptUrl.protocol + '//' + slug + '.' + scriptUrl.hostname.replace(/^www\./, '');
  var style = document.createElement('style');
  style.textContent = '.cu-widget{font:14px system-ui,-apple-system,Segoe UI,sans-serif;color:#14213d}.cu-widget *{box-sizing:border-box}.cu-widget-heading{margin:0 0 16px;font-size:24px}.cu-widget-group{margin:22px 0 8px;font-size:14px;color:#667085}.cu-widget-job{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 0;border-bottom:1px solid #dce5f2}.cu-widget-job h3{margin:0 0 6px;font-size:17px}.cu-widget-meta{margin:0;color:#667085;line-height:1.5}.cu-widget-link{display:inline-block;padding:9px 14px;border-radius:5px;background:#0d47ff;color:#fff;text-decoration:none;font-weight:700;white-space:nowrap}.cu-widget-state{padding:18px 0;color:#667085}@media(max-width:560px){.cu-widget-job{display:block}.cu-widget-link{margin-top:12px}}';
  document.head.appendChild(style);
  var root = document.createElement('div'); root.className = 'cu-widget'; container.replaceChildren(root);
  var heading = document.createElement('h2'); heading.className = 'cu-widget-heading'; heading.textContent = 'Open positions'; root.appendChild(heading);
  var state = document.createElement('p'); state.className = 'cu-widget-state'; state.textContent = 'Loading open positions...'; root.appendChild(state);
  fetch(origin + '/api/companies/' + encodeURIComponent(slug) + '/jobs', {headers:{Accept:'application/json'}})
    .then(function (response) { return response.json().then(function (payload) { if (!response.ok) throw new Error(payload.error || 'Jobs are unavailable.'); return payload; }); })
    .then(function (payload) {
      var jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      root.removeChild(state);
      if (!jobs.length) { var empty = document.createElement('p'); empty.className = 'cu-widget-state'; empty.textContent = 'There are no open positions right now.'; root.appendChild(empty); return; }
      var groups = {};
      jobs.forEach(function (job) { var group = groupBy === 'department' ? (job.category || 'Other') : groupBy === 'location' ? (job.location || 'Other') : ''; (groups[group] || (groups[group] = [])).push(job); });
      Object.keys(groups).forEach(function (group) {
        if (group) { var label = document.createElement('h3'); label.className = 'cu-widget-group'; label.textContent = group; root.appendChild(label); }
        groups[group].forEach(function (job) {
          var item = document.createElement('article'); item.className = 'cu-widget-job';
          var copy = document.createElement('div'); var title = document.createElement('h3'); title.textContent = job.title || 'Open position';
          var meta = document.createElement('p'); meta.className = 'cu-widget-meta'; meta.textContent = [job.location, job.type, job.deadline ? 'Closes ' + job.deadline : 'Open until filled'].filter(Boolean).join(' • '); copy.append(title, meta);
          var link = document.createElement('a'); link.className = 'cu-widget-link'; link.textContent = 'View role'; link.href = careerOrigin + '/?job=' + encodeURIComponent(job.slug || job.id); link.target = '_blank'; link.rel = 'noopener'; item.append(copy, link); root.appendChild(item);
        });
      });
    })
    .catch(function (error) { state.textContent = error.message || 'Jobs are temporarily unavailable.'; });
}());
