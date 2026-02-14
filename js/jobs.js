// ===============================
// JOBS.JS – LIVE SANITY INTEGRATION (FIXED)
// ===============================

import { sanityClient } from './sanityClient.js';

let jobs = [];
let views = JSON.parse(localStorage.getItem('jobViews')) || {};

const jobList = document.getElementById('jobList');
const jobPreview = document.getElementById('jobPreview');
const searchInput = document.getElementById('jobSearch');
const categoryFilter = document.getElementById('categoryFilter');

let selectedIndex = null;

// ===============================
// FETCH JOBS FROM SANITY
// ===============================
async function fetchJobs() {
  try {
    const query = `
      *[_type == "job"] | order(posted desc) {
        _id,
        title,
        "slug": slug.current,
        description,
        location,
        salary,
        applyLink,
        category,
        posted,
        deadline,

        company->{
          name
        }
      }
    `;

    jobs = await sanityClient.fetch(query);
    renderJobs();
  } catch (err) {
    console.error('Sanity fetch error:', err);
    jobList.innerHTML = '<li>Failed to load jobs.</li>';
  }
}

// ===============================
// RENDER JOB LIST
// ===============================
function renderJobs() {
  const term = searchInput.value.toLowerCase();
  const cat = categoryFilter.value;

  let filtered = jobs.filter(job => {
    const companyName = job.company?.name || '';

    const matchCat = cat === 'all' || job.category === cat;
    const matchSearch =
      job.title.toLowerCase().includes(term) ||
      companyName.toLowerCase().includes(term) ||
      job.description.toLowerCase().includes(term);

    return matchCat && matchSearch;
  });

  filtered.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  jobList.innerHTML = '';

  if (!filtered.length) {
    jobList.innerHTML = '<li>No jobs found.</li>';
    return;
  }

  filtered.forEach((job, index) => {
    if (!views[job._id]) views[job._id] = 0;

    const li = document.createElement('li');
    li.className = 'job-card';
    if (index === selectedIndex) li.classList.add('selected');

    li.innerHTML = `
      <h3>${job.title}</h3>
      <p class="company">${job.company?.name || 'Unknown Company'}</p>
      <p class="meta">${job.location}</p>
      <p class="salary">${job.salary || ''}</p>
      <p class="meta">
        Posted: ${job.posted || '—'} • Closing: ${job.deadline || '—'}
      </p>
      <p class="views">${views[job._id]} views</p>
      <a class="job-link" href="/jobs/${job.slug}" target="_blank">
        View Job
      </a>
    `;

    li.onclick = () => {
      selectedIndex = index;
      views[job._id]++;
      localStorage.setItem('jobViews', JSON.stringify(views));
      showPreview(job);
      renderJobs();
    };

    jobList.appendChild(li);
  });
}

// ===============================
// JOB PREVIEW
// ===============================
function showPreview(job) {
  jobPreview.innerHTML = `
    <div class="fade-in">
      <h2>${job.title}</h2>
      <p class="company">${job.company?.name || 'Unknown Company'}</p>
      <p><strong>Location:</strong> ${job.location}</p>
      <p><strong>Salary:</strong> ${job.salary || 'N/A'}</p>
      <p><strong>Posted:</strong> ${job.posted || '—'} |
         <strong>Closing:</strong> ${job.deadline || '—'}</p>

      <div style="white-space:pre-line;margin-top:12px;">
        ${job.description}
      </div>

      <a class="apply-btn" href="${job.applyLink}" target="_blank">
        Apply Now
      </a>

      <a class="share-btn" href="https://wa.me/?text=${encodeURIComponent(
        'Apply here: https://careerunified.com/jobs/' + job.slug
      )}" target="_blank">
        Share on WhatsApp
      </a>
    </div>
  `;
}

// ===============================
// EVENTS
// ===============================
searchInput.addEventListener('input', renderJobs);
categoryFilter.addEventListener('change', renderJobs);
document.getElementById('sortBtn').onclick = renderJobs;

// ===============================
// INIT
// ===============================
fetchJobs();

