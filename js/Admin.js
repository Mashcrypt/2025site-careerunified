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

// ------------------ SIMPLE ADMIN LOGIN ------------------
const DEFAULT_ADMIN = { username: "admin", passwordHash: "a94a8fe5ccb19b0e4eaa2b6e57f1a5c3e7008a1f48efec2c982d9067c3c0c58c" }; // Hash for "test"
let admins = JSON.parse(localStorage.getItem('admins')) || [DEFAULT_ADMIN];

const loginSection = document.getElementById('loginSection');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

function checkLogin() {
  const loggedIn = localStorage.getItem('adminLoggedIn');
  if (loggedIn === 'true') { 
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
  const valid = admins.some(a => a.username === user && a.passwordHash === hashedPass);

  if (valid) {
    localStorage.setItem('adminLoggedIn', 'true');
    localStorage.setItem('currentAdmin', user);
    logAdminActivity('Logged in');
    checkLogin();
  } else {
    loginError.textContent = 'Invalid login details';
  }
});

logoutBtn.addEventListener('click', () => {
  logAdminActivity('Logged out');
  localStorage.removeItem('adminLoggedIn');
  checkLogin();
});

checkLogin();

// ------------------ UNIVERSITIES ------------------
const uniForm = document.getElementById('adminForm');
const uniName = document.getElementById('uniName');
const uniLink = document.getElementById('uniLink');
const uniDeadline = document.getElementById('uniDeadline');
const editIndexInput = document.getElementById('editIndex');
const uniList = document.getElementById('adminUniversityList');
let universities = JSON.parse(localStorage.getItem('universities')) || [];

function saveUniversities() { localStorage.setItem('universities', JSON.stringify(universities)); }
function renderUniversities() {
  uniList.innerHTML = '';
  universities.forEach((u, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${u.name}</strong> (Deadline: ${u.deadline})<br><a href="${u.link}" target="_blank">${u.link}</a><br>
    <button onclick="editUniversity(${i})">Edit</button>
    <button onclick="deleteUniversity(${i})">Delete</button>`;
    uniList.appendChild(li);
  });
}
uniForm.addEventListener('submit', e => {
  e.preventDefault();
  const uni = { name: uniName.value, link: uniLink.value, deadline: uniDeadline.value };
  const i = editIndexInput.value;
  if (i === '') universities.push(uni);
  else { universities[i] = uni; editIndexInput.value = ''; }
  saveUniversities(); renderUniversities(); uniForm.reset();
});
window.editUniversity = i => { 
  uniName.value = universities[i].name; 
  uniLink.value = universities[i].link; 
  uniDeadline.value = universities[i].deadline; 
  editIndexInput.value = i; 
};
window.deleteUniversity = i => { 
  if (confirm('Delete this university?')) { 
    universities.splice(i, 1); 
    saveUniversities(); 
    renderUniversities(); 
  } 
};
renderUniversities();

// ------------------ BURSARIES ------------------
const bursaryForm = document.getElementById('bursaryForm');
const bursaryName = document.getElementById('bursaryName');
const bursaryProvider = document.getElementById('bursaryProvider');
const bursaryLink = document.getElementById('bursaryLink');
const bursaryDeadline = document.getElementById('bursaryDeadline');
const bursaryFaculty = document.getElementById('bursaryFaculty');
const bursaryDescription = document.getElementById('bursaryDescription');
const bursaryEditIndex = document.getElementById('bursaryEditIndex');
const bursaryList = document.getElementById('adminBursaryList');
let bursaries = JSON.parse(localStorage.getItem('bursaries')) || [];

function saveBursaries() { localStorage.setItem('bursaries', JSON.stringify(bursaries)); }
function renderBursaries() {
  bursaryList.innerHTML = '';
  bursaries.forEach((b, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${b.name}</strong> (${b.faculty})<br>Provider: ${b.provider}<br>Deadline: ${b.deadline}<br>
    <a href="${b.link}" target="_blank">${b.link}</a><br>Description: ${b.description}<br>
    <button onclick="editBursary(${i})">Edit</button>
    <button onclick="deleteBursary(${i})">Delete</button>`;
    bursaryList.appendChild(li);
  });
}
bursaryForm.addEventListener('submit', e => {
  e.preventDefault();
  const b = { name: bursaryName.value, provider: bursaryProvider.value, link: bursaryLink.value, deadline: bursaryDeadline.value, faculty: bursaryFaculty.value, description: bursaryDescription.value };
  const i = bursaryEditIndex.value;
  if (i === '') bursaries.push(b);
  else { bursaries[i] = b; bursaryEditIndex.value = ''; }
  saveBursaries(); renderBursaries(); bursaryForm.reset();
});
window.editBursary = i => { 
  const b = bursaries[i]; 
  bursaryName.value = b.name; 
  bursaryProvider.value = b.provider; 
  bursaryLink.value = b.link; 
  bursaryDeadline.value = b.deadline; 
  bursaryFaculty.value = b.faculty; 
  bursaryDescription.value = b.description; 
  bursaryEditIndex.value = i; 
};
window.deleteBursary = i => { 
  if (confirm('Delete this bursary?')) { 
    bursaries.splice(i, 1); 
    saveBursaries(); 
    renderBursaries(); 
  } 
};
renderBursaries();

// ------------------ CV TIPS ------------------
const cvTipsForm = document.getElementById('cvTipsForm');
const cvTipTitle = document.getElementById('cvTipTitle');
const cvTipContent = document.getElementById('cvTipContent');
const cvTipCategory = document.getElementById('cvTipCategory');
const cvTipEditIndex = document.getElementById('cvTipEditIndex');
const cvTipsListAdmin = document.getElementById('cvTipsListAdmin');
let cvTips = JSON.parse(localStorage.getItem('cvTips')) || [];

function saveCVTips() { localStorage.setItem('cvTips', JSON.stringify(cvTips)); }
function renderCVTips() {
  cvTipsListAdmin.innerHTML = '';
  cvTips.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${c.title}</strong> [${c.category}]<br>${c.content}<br>
    <button onclick="editCVTip(${i})">Edit</button>
    <button onclick="deleteCVTip(${i})">Delete</button>`;
    cvTipsListAdmin.appendChild(li);
  });
}
cvTipsForm.addEventListener('submit', e => {
  e.preventDefault();
  const tip = { title: cvTipTitle.value, content: cvTipContent.value, category: cvTipCategory.value };
  const i = cvTipEditIndex.value;
  if (i === '') cvTips.push(tip);
  else { cvTips[i] = tip; cvTipEditIndex.value = ''; }
  saveCVTips(); renderCVTips(); cvTipsForm.reset();
});
window.editCVTip = i => { 
  const c = cvTips[i]; 
  cvTipTitle.value = c.title; 
  cvTipContent.value = c.content; 
  cvTipCategory.value = c.category; 
  cvTipEditIndex.value = i; 
};
window.deleteCVTip = i => { 
  if (confirm('Delete this tip?')) { 
    cvTips.splice(i, 1); 
    saveCVTips(); 
    renderCVTips(); 
  } 
};
renderCVTips();

// ===============================
// JOBS MANAGEMENT + ANALYTICS
// ===============================

const jobForm = document.getElementById('jobForm');
const jobTitle = document.getElementById('jobTitle');
const jobCompany = document.getElementById('jobCompany');
const jobDesc = document.getElementById('jobDesc');
const jobLocation = document.getElementById('jobLocation');
const jobSalary = document.getElementById('jobSalary');
const jobApplyLink = document.getElementById('jobApplyLink');
const jobPosted = document.getElementById('jobPosted');
const jobDeadline = document.getElementById('jobDeadline');
const jobCategory = document.getElementById('jobCategory');
const jobType = document.getElementById('jobType');
const jobEditIndex = document.getElementById('jobEditIndex');
const adminJobList = document.getElementById('adminJobList');

let jobs = JSON.parse(localStorage.getItem('jobs')) || [];

// Save jobs
function saveJobs() {
  localStorage.setItem('jobs', JSON.stringify(jobs));
}

// Render jobs in admin panel
function renderJobs() {
  adminJobList.innerHTML = '';

  jobs.forEach((job, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${job.title}</strong><br>
      Company: ${job.company}<br>
      Type: ${job.jobType}<br>
      Location: ${job.location}<br>
      Salary: ${job.salary}<br>
      Posted: ${job.posted} | Closing: ${job.deadline}<br>
      Views: <strong>${job.views}</strong><br>
      <a href="${job.applyLink}" target="_blank">Apply Link</a><br><br>

      <button onclick="editJob(${index})">Edit</button>
      <button onclick="deleteJob(${index})">Delete</button>
    `;
    adminJobList.appendChild(li);
  });
}

// Save / Update job
jobForm.addEventListener('submit', e => {
  e.preventDefault();

  const jobData = {
    title: jobTitle.value,
    company: jobCompany.value,
    description: jobDesc.value,
    location: jobLocation.value,
    salary: jobSalary.value,
    applyLink: jobApplyLink.value,
    posted: jobPosted.value,
    deadline: jobDeadline.value,
    category: jobCategory.value,
    jobType: jobType.value,
    views: 0 // analytics counter
  };

  const index = jobEditIndex.value;

  if (index === '') {
    jobs.push(jobData);
  } else {
    jobData.views = jobs[index].views; // preserve analytics
    jobs[index] = jobData;
    jobEditIndex.value = '';
  }

  saveJobs();
  renderJobs();
  jobForm.reset();
});

// Edit job
window.editJob = index => {
  const job = jobs[index];
  jobTitle.value = job.title;
  jobCompany.value = job.company;
  jobDesc.value = job.description;
  jobLocation.value = job.location;
  jobSalary.value = job.salary;
  jobApplyLink.value = job.applyLink;
  jobPosted.value = job.posted;
  jobDeadline.value = job.deadline;
  jobCategory.value = job.category;
  jobType.value = job.jobType;
  jobEditIndex.value = index;
};

// Delete job
window.deleteJob = index => {
  if (confirm('Delete this job?')) {
    jobs.splice(index, 1);
    saveJobs();
    renderJobs();
  }
};

// Initial render
renderJobs();

// ------------------ ADMIN MANAGEMENT ------------------
const adminAccountForm = document.getElementById('adminAccountForm');
const newAdminUser = document.getElementById('newAdminUser');
const newAdminPass = document.getElementById('newAdminPass');
const adminListEl = document.getElementById('adminList');

function renderAdmins() {
  adminListEl.innerHTML = '';
  admins.forEach((a, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${a.username}</strong> <button onclick="deleteAdmin(${i})">Delete</button>`;
    adminListEl.appendChild(li);
  });
}

adminAccountForm.addEventListener('submit', async e => {
  e.preventDefault();
  const hashedPass = await hashPassword(newAdminPass.value);
  admins.push({ username: newAdminUser.value, passwordHash: hashedPass });
  logAdminActivity(`Added admin: ${newAdminUser.value}`); // Log activity
  localStorage.setItem('admins', JSON.stringify(admins));
  renderAdmins();
  adminAccountForm.reset();
});

window.deleteAdmin = i => {
  if (admins[i].username === DEFAULT_ADMIN.username) {
    alert('Default admin cannot be deleted.');
    return;
  }
  if (confirm('Delete this admin?')) {
    logAdminActivity(`Deleted admin: ${admins[i].username}`); // Log activity
    admins.splice(i, 1);
    localStorage.setItem('admins', JSON.stringify(admins));
    renderAdmins();
  }
};

renderAdmins();
