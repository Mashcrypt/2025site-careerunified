import { sanityClient } from './sanityClient.js';

let jobs = [];
let views = JSON.parse(localStorage.getItem('jobViews')) || {};

const jobList = document.getElementById('jobList');
const jobPreview = document.getElementById('jobPreview');
const searchInput = document.getElementById('jobSearch');
const categoryFilter = document.getElementById('categoryFilter');

let selectedIndex = null;

async function fetchJobs() {
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
}

function renderJobs() {
  const term = searchInput.value.toLowerCase();
  const cat = categoryFilter.value;

  let filtered = jobs.filter(job => {
    const company = job.company?.name || '';
    return (
      (cat === 'all' || job.category === cat) &&
      (
        job.title.toLowerCase().includes(term) ||
        company.toLowerCase().includes(term) ||
        job.description.toLowerCase().includes(term)
      )
    );
  });

  jobList.innerHTML = '';

  filtered.forEach((job, index) => {
    const li = document.createElement('li');
    li.className = 'job-card';

    li.innerHTML = `
      <h3>${job.title}</h3>
      <p class="company">${job.company?.name || 'Unknown company'}</p>
      <p>${job.location}</p>
      <p>${job.salary || ''}</p>
      <a href="/jobs/${job.slug}" target="_blank">View Job</a>
    `;

    li.onclick = () => showPreview(job);
    jobList.appendChild(li);
  });
}

function showPreview(job) {
  jobPreview.innerHTML = `
    <h2>${job.title}</h2>
    <p>${job.company?.name}</p>
    <p>${job.location}</p>
    <p>${job.salary}</p>
    <p>${job.description}</p>

    <a href="${job.applyLink}" target="_blank">Apply</a>

    <a target="_blank"
       href="https://wa.me/?text=${encodeURIComponent(
         'Apply here: https://careerunified.com/jobs/' + job.slug
       )}">
      Share on WhatsApp
    </a>
  `;
}

fetchJobs();

