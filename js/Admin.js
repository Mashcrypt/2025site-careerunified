// ===============================
// SANITY CLIENT
// ===============================
import { sanityClient } from './sanityClient.js';

// ===============================
// PASSWORD HASHING (SHA-256)
// ===============================
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ===============================
// ADMIN ACTIVITY LOGGING
// ===============================
function logAdminActivity(action) {
  const logs = JSON.parse(localStorage.getItem('adminLogs')) || [];
  const currentAdmin = localStorage.getItem('currentAdmin') || 'admin';

  logs.unshift({
    admin: currentAdmin,
    action,
    time: new Date().toLocaleString()
  });

  localStorage.setItem('adminLogs', JSON.stringify(logs.slice(0, 200)));
}

// ===============================
// ADMIN LOGIN
// ===============================
const DEFAULT_ADMIN = {
  username: "admin",
  passwordHash: "a94a8fe5ccb19b0e4eaa2b6e57f1a5c3e7008a1f48efec2c982d9067c3c0c58c" // "test"
};

let admins = JSON.parse(localStorage.getItem('admins')) || [DEFAULT_ADMIN];

const loginSection = document.getElementById('loginSection');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

function checkLogin() {
  if (localStorage.getItem('adminLoggedIn') === 'true') {
    loginSection.style.display = 'none';
    adminPanel.style.display = 'block';
  } else {
    loginSection.style.display = 'block';
    adminPanel.style.display = 'none';
  }
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();

  const user = document.getElementById('adminUser').value;
  const pass = document.getElementById('adminPass').value;
  const hashedPass = await hashPassword(pass);

  const valid = admins.some(
    a => a.username === user && a.passwordHash === hashedPass
  );

  if (!valid) {
    loginError.textContent = 'Invalid login details';
    return;
  }

  localStorage.setItem('adminLoggedIn', 'true');
  localStorage.setItem('currentAdmin', user);
  logAdminActivity('Logged in');
  checkLogin();
});

logoutBtn.addEventListener('click', () => {
  logAdminActivity('Logged out');
  localStorage.removeItem('adminLoggedIn');
  checkLogin();
});

checkLogin();

// ===============================
// JOBS – LIVE FROM SANITY
// ===============================
const adminJobList = document.getElementById('adminJobList');
let jobs = [];

async function fetchJobsFromSanity() {
  try {
    const query = `
      *[_type == "job"] | order(posted desc) {
        _id,
        title,
        company,
        description,
        location,
        salary,
        applyLink,
        posted,
        deadline,
        category,
        jobType
      }
    `;
    jobs = await sanityClient.fetch(query);
    renderJobs();
  } catch (err) {
    console.error(err);
    adminJobList.innerHTML = '<li>Failed to load jobs from Sanity.</li>';
  }
}

function renderJobs() {
  adminJobList.innerHTML = '';

  if (!jobs.length) {
    adminJobList.innerHTML = '<li>No jobs found.</li>';
    return;
  }

  jobs.forEach(job => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${job.title}</strong><br>
      Company: ${job.company}<br>
      Type: ${job.jobType}<br>
      Location: ${job.location}<br>
      Salary: ${job.salary || 'N/A'}<br>
      Posted: ${job.posted || 'N/A'} | Closing: ${job.deadline || 'N/A'}<br>
      <a href="${job.applyLink}" target="_blank">Apply Link</a><br><br>

      <em>Edit & delete jobs using Sanity Studio</em><br>
      <button onclick="openSanityStudio()">Open Sanity Studio</button>
    `;
    adminJobList.appendChild(li);
  });
}

window.openSanityStudio = () => {
  window.open('https://YOUR-SANITY-STUDIO-URL.netlify.app', '_blank');
};

// Load jobs on page load
fetchJobsFromSanity();

// ===============================
// ADMIN ACCOUNT MANAGEMENT
// ===============================
const adminAccountForm = document.getElementById('adminAccountForm');
const newAdminUser = document.getElementById('newAdminUser');
const newAdminPass = document.getElementById('newAdminPass');
const adminListEl = document.getElementById('adminList');

function renderAdmins() {
  adminListEl.innerHTML = '';
  admins.forEach((a, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${a.username}</strong>
      <button onclick="deleteAdmin(${i})">Delete</button>
    `;
    adminListEl.appendChild(li);
  });
}

adminAccountForm.addEventListener('submit', async e => {
  e.preventDefault();

  const hashedPass = await hashPassword(newAdminPass.value);
  admins.push({ username: newAdminUser.value, passwordHash: hashedPass });

  localStorage.setItem('admins', JSON.stringify(admins));
  logAdminActivity(`Added admin: ${newAdminUser.value}`);

  renderAdmins();
  adminAccountForm.reset();
});

window.deleteAdmin = index => {
  if (admins[index].username === DEFAULT_ADMIN.username) {
    alert('Default admin cannot be deleted.');
    return;
  }

  if (confirm('Delete this admin?')) {
    logAdminActivity(`Deleted admin: ${admins[index].username}`);
    admins.splice(index, 1);
    localStorage.setItem('admins', JSON.stringify(admins));
    renderAdmins();
  }
};

renderAdmins();

