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
// TAB SWITCHING
// ===============================
const tabs = document.querySelectorAll('.tabs button');
const sections = document.querySelectorAll('section');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    sections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// ===============================
// UTILITY: CREATE / UPDATE / DELETE DOCUMENT
// ===============================
async function createDoc(type, data) {
  return sanityClient.create({ _type: type, ...data });
}

async function updateDoc(type, id, data) {
  return sanityClient.patch(id).set(data).commit();
}

async function deleteDoc(id) {
  return sanityClient.delete(id);
}

// ===============================
// JOBS MANAGEMENT
// ===============================
const jobForm = document.getElementById('jobForm');
const adminJobList = document.getElementById('adminJobList');
let editJobId = null;

async function fetchJobs() {
  try {
    const query = `*[_type == "job"] | order(posted desc)`;
    const jobs = await sanityClient.fetch(query);
    renderJobs(jobs);
  } catch(err) {
    console.error(err);
    adminJobList.innerHTML = '<li>Failed to load jobs from Sanity.</li>';
  }
}

function renderJobs(jobs) {
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
      <a href="${job.applyLink}" target="_blank">Apply Link</a><br>
      <button onclick="editJob('${job._id}')">Edit</button>
      <button onclick="deleteJob('${job._id}')">Delete</button>
    `;
    adminJobList.appendChild(li);
  });
}

jobForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    title: document.getElementById('jobTitle').value,
    company: document.getElementById('jobCompany').value,
    description: document.getElementById('jobDesc').value,
    location: document.getElementById('jobLocation').value,
    salary: document.getElementById('jobSalary').value,
    applyLink: document.getElementById('jobApplyLink').value,
    posted: document.getElementById('jobPosted').value,
    deadline: document.getElementById('jobDeadline').value,
    category: document.getElementById('jobCategory').value,
    jobType: document.getElementById('jobType').value
  };

  if(editJobId) {
    await updateDoc('job', editJobId, data);
    editJobId = null;
  } else {
    await createDoc('job', data);
  }

  jobForm.reset();
  fetchJobs();
});

window.editJob = async id => {
  editJobId = id;
  const job = await sanityClient.getDocument(id);
  document.getElementById('jobTitle').value = job.title;
  document.getElementById('jobCompany').value = job.company;
  document.getElementById('jobDesc').value = job.description;
  document.getElementById('jobLocation').value = job.location;
  document.getElementById('jobSalary').value = job.salary;
  document.getElementById('jobApplyLink').value = job.applyLink;
  document.getElementById('jobPosted').value = job.posted;
  document.getElementById('jobDeadline').value = job.deadline;
  document.getElementById('jobCategory').value = job.category;
  document.getElementById('jobType').value = job.jobType;
};

window.deleteJob = async id => {
  if(confirm('Delete this job?')) {
    await deleteDoc(id);
    fetchJobs();
  }
};

// ===============================
// UNIVERSITIES MANAGEMENT
// ===============================
const uniForm = document.getElementById('uniForm');
const uniList = document.getElementById('adminUniversityList');
let editUniId = null;

async function fetchUnis() {
  const data = await sanityClient.fetch('*[_type=="university"]|order(name asc)');
  renderUnis(data);
}

function renderUnis(unis) {
  uniList.innerHTML = '';
  if(!unis.length) { uniList.innerHTML='<li>No universities found.</li>'; return; }
  unis.forEach(u=>{
    const li = document.createElement('li');
    li.innerHTML = `${u.name} | ${u.link} | ${u.deadline} 
      <button onclick="editUni('${u._id}')">Edit</button>
      <button onclick="deleteUni('${u._id}')">Delete</button>`;
    uniList.appendChild(li);
  });
}

uniForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const data = {
    name: document.getElementById('uniName').value,
    link: document.getElementById('uniLink').value,
    deadline: document.getElementById('uniDeadline').value
  };
  if(editUniId) {
    await updateDoc('university', editUniId, data);
    editUniId=null;
  } else {
    await createDoc('university', data);
  }
  uniForm.reset();
  fetchUnis();
});

window.editUni = async id=>{
  editUniId = id;
  const doc = await sanityClient.getDocument(id);
  document.getElementById('uniName').value = doc.name;
  document.getElementById('uniLink').value = doc.link;
  document.getElementById('uniDeadline').value = doc.deadline;
};

window.deleteUni = async id=>{
  if(confirm('Delete this university?')) {
    await deleteDoc(id);
    fetchUnis();
  }
};

// ===============================
// BURSARIES MANAGEMENT
// ===============================
const bursaryForm = document.getElementById('bursaryForm');
const bursaryList = document.getElementById('adminBursaryList');
let editBursaryId = null;

async function fetchBursaries() {
  const data = await sanityClient.fetch('*[_type=="bursary"]|order(name asc)');
  renderBursaries(data);
}

function renderBursaries(bursaries) {
  bursaryList.innerHTML = '';
  if(!bursaries.length) { bursaryList.innerHTML='<li>No bursaries found.</li>'; return; }
  bursaries.forEach(b=>{
    const li = document.createElement('li');
    li.innerHTML = `${b.name} | ${b.provider} | ${b.link} | ${b.deadline} | ${b.faculty} 
      <button onclick="editBursary('${b._id}')">Edit</button>
      <button onclick="deleteBursary('${b._id}')">Delete</button>`;
    bursaryList.appendChild(li);
  });
}

bursaryForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const data = {
    name: document.getElementById('bursaryName').value,
    provider: document.getElementById('bursaryProvider').value,
    link: document.getElementById('bursaryLink').value,
    deadline: document.getElementById('bursaryDeadline').value,
    faculty: document.getElementById('bursaryFaculty').value,
    description: document.getElementById('bursaryDescription').value
  };
  if(editBursaryId) { await updateDoc('bursary', editBursaryId, data); editBursaryId=null; }
  else { await createDoc('bursary', data); }
  bursaryForm.reset();
  fetchBursaries();
});

window.editBursary = async id=>{
  editBursaryId=id;
  const b = await sanityClient.getDocument(id);
  document.getElementById('bursaryName').value=b.name;
  document.getElementById('bursaryProvider').value=b.provider;
  document.getElementById('bursaryLink').value=b.link;
  document.getElementById('bursaryDeadline').value=b.deadline;
  document.getElementById('bursaryFaculty').value=b.faculty;
  document.getElementById('bursaryDescription').value=b.description;
};

window.deleteBursary = async id=>{
  if(confirm('Delete this bursary?')) { await deleteDoc(id); fetchBursaries(); }
};

// ===============================
// CV TIPS MANAGEMENT
// ===============================
const cvForm = document.getElementById('cvTipsForm');
const cvList = document.getElementById('cvTipsListAdmin');
let editCVId = null;

async function fetchCVTips() {
  const data = await sanityClient.fetch('*[_type=="cvTip"]|order(title asc)');
  renderCVTips(data);
}

function renderCVTips(tips) {
  cvList.innerHTML = '';
  if(!tips.length){ cvList.innerHTML='<li>No CV tips found.</li>'; return; }
  tips.forEach(t=>{
    const li=document.createElement('li');
    li.innerHTML = `${t.title} | ${t.category} | ${t.content}
      <button onclick="editCV('${t._id}')">Edit</button>
      <button onclick="deleteCV('${t._id}')">Delete</button>`;
    cvList.appendChild(li);
  });
}

cvForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const data = {
    title: document.getElementById('cvTipTitle').value,
    category: document.getElementById('cvTipCategory').value,
    content: document.getElementById('cvTipContent').value
  };
  if(editCVId){ await updateDoc('cvTip', editCVId, data); editCVId=null; }
  else { await createDoc('cvTip', data); }
  cvForm.reset();
  fetchCVTips();
});

window.editCV = async id=>{
  editCVId=id;
  const c = await sanityClient.getDocument(id);
  document.getElementById('cvTipTitle').value=c.title;
  document.getElementById('cvTipCategory').value=c.category;
  document.getElementById('cvTipContent').value=c.content;
};

window.deleteCV = async id=>{
  if(confirm('Delete this tip?')){ await deleteDoc(id); fetchCVTips(); }
};

// ===============================
// INITIAL FETCH
// ===============================
fetchJobs();
fetchUnis();
fetchBursaries();
fetchCVTips();



