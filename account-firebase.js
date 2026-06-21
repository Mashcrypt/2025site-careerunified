<script type="module">
    // Import Firebase modules
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
    import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
    import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

    // Your web app's Firebase configuration
    const firebaseConfig = {
        apiKey: "AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M",
        authDomain: "career-unified.firebaseapp.com",
        projectId: "career-unified",
        storageBucket: "career-unified.firebasestorage.app",
        messagingSenderId: "101656817742",
        appId: "1:101656817742:web:22c9a58a822a714e54931f",
        measurementId: "G-2Z934XRVXT"
    };

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Profile data storage
    let profileData = {
        name: '',
        email: '',
        phone: '',
        location: '',
        employmentStatus: 'employed',
        institutionName: '',
        degreeType: '',
        graduationYear: '',
        fieldOfStudy: '',
        currentJobTitle: '',
        currentCompany: '',
        yearsOfExperience: '',
        desiredJobTitle: '',
        desiredLocation: '',
        industry: '',
        bio: ''
    };

    let currentUser = null;

    // INSTANT LOAD: Check for cached data first
    const cachedProfile = localStorage.getItem('userProfile');
    if (cachedProfile) {
        try {
            profileData = JSON.parse(cachedProfile);
            // Show cached data immediately
            updateProfileView();
            console.log('Loaded cached profile data');
        } catch (e) {
            console.error('Error parsing cached profile:', e);
        }
    }

    // ===============================
// AUTH STATE HANDLER (FINAL)
// ===============================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        console.log('User logged in:', user.email);

        // Load user profile from Firestore
        await loadUserProfile(user.uid);

        // 🔥 Load user's CVs after profile is ready
        loadUserCVs();

    } else {
        console.log('No user logged in, redirecting to login...');

        // Small delay to avoid flicker
        setTimeout(() => {
            window.location.href = "login.html";
        }, 100);
    }
});

    // Load user profile from Firestore
    async function loadUserProfile(userId) {
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Populate profileData with user data
                profileData = {
                    name: userData.name || '',
                    email: userData.email || currentUser.email,
                    phone: userData.phone || '',
                    location: userData.location || '',
                    employmentStatus: userData.employmentStatus || 'employed',
                    institutionName: userData.institutionName || '',
                    degreeType: userData.degreeType || '',
                    graduationYear: userData.graduationYear || '',
                    fieldOfStudy: userData.fieldOfStudy || '',
                    currentJobTitle: userData.currentJobTitle || '',
                    currentCompany: userData.currentCompany || '',
                    yearsOfExperience: userData.yearsOfExperience || '',
                    desiredJobTitle: userData.desiredJobTitle || '',
                    desiredLocation: userData.desiredLocation || '',
                    industry: userData.industry || '',
                    bio: userData.bio || ''
                };
                
                // Cache the profile data for instant loading next time
                localStorage.setItem('userProfile', JSON.stringify(profileData));
                
                console.log('Profile data loaded from Firestore');
                updateProfileView();
            } else {
                // No profile exists yet, use email from auth
                profileData.email = currentUser.email;
                profileData.name = currentUser.displayName || 'User';
                
                // Cache initial data
                localStorage.setItem('userProfile', JSON.stringify(profileData));
                updateProfileView();
            }
        } catch (error) {
            console.error('Error loading profile:', error);
            // Use basic auth data as fallback
            if (currentUser) {
                profileData.email = currentUser.email;
                profileData.name = currentUser.displayName || 'User';
                updateProfileView();
            }
        }
    }
function safeTextValue(value, fallback = '', maxLength = 500) {
    const text = String(value ?? fallback ?? '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<\?(?:php)?[\s\S]*?\?>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
    return text || fallback;
}

function escapeHtml(value) {
    return safeTextValue(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function safeCvUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function attachCvActionHandlers(container) {
    container.querySelectorAll('[data-cv-action]').forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.dataset.cvAction;
            const url = button.dataset.cvUrl || '';
            const name = button.dataset.cvName || 'CV Document';
            const docId = button.dataset.cvId || '';
            const path = button.dataset.cvPath || '';

            if (action === 'view') window.viewCV(url, name);
            if (action === 'download') window.downloadCV(url, name);
            if (action === 'delete') window.deleteCV(docId, path);
        });
    });
}

// Load user's uploaded CVs
async function loadUserCVs() {
    if (!currentUser) return;

    const uploadedSection = document.getElementById('uploadedCVsSection');
    if (!uploadedSection) return;

    try {
        // Import Firestore query functions
        const { collection, query, where, orderBy, getDocs } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

        // Query CVs for current user
        const cvsRef = collection(db, 'cvs');
        const q = query(
            cvsRef, 
            where('userId', '==', currentUser.uid),
            orderBy('uploadedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            uploadedSection.innerHTML = `
                <div class="no-cvs-message">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <h3>No CVs Uploaded Yet</h3>
                    <p>Upload your CV below to get discovered by top employers</p>
                </div>
            `;
            return;
        }

        let cvsHTML = '<h3 style="font-size: 1.25rem; font-weight: 600; color: #111827; margin-bottom: 16px;">Your Uploaded CVs</h3>';

        querySnapshot.forEach((doc) => {
            const cvData = doc.data();
            const uploadDate = cvData.uploadedAt ? new Date(cvData.uploadedAt).toLocaleDateString() : 'Unknown date';
            const cvFileName = safeTextValue(cvData.cvFileName, 'CV Document', 160);
            const cvUrl = safeCvUrl(cvData.cvURL);
            const cvPath = safeTextValue(cvData.cvFilePath, '', 500);
            const cvStatus = cvData.status === 'active' ? 'active' : 'inactive';
            const cvViews = Number.isFinite(Number(cvData.viewCount)) ? Number(cvData.viewCount) : 0;
            
            cvsHTML += `
                <div class="cv-item">
                    <div class="cv-info">
                        <div class="cv-name">
                            <svg style="width: 20px; height: 20px; display: inline-block; margin-right: 8px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                            </svg>
                            ${escapeHtml(cvFileName)}
                        </div>
                        <div class="cv-meta">
                            <span> Uploaded: ${escapeHtml(uploadDate)}</span>
                            <span> Views: ${cvViews}</span>
                            <span style="color: ${cvStatus === 'active' ? '#16a34a' : '#6b7280'};">
                                &bull; ${cvStatus === 'active' ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>
                    <div class="cv-actions">
                        <button class="cv-btn cv-btn-view" data-cv-action="view" data-cv-url="${escapeAttr(cvUrl)}" data-cv-name="${escapeAttr(cvFileName)}">
                            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            View
                        </button>
                        <button class="cv-btn cv-btn-download" data-cv-action="download" data-cv-url="${escapeAttr(cvUrl)}" data-cv-name="${escapeAttr(cvFileName)}">
                            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download
                        </button>
                        <button class="cv-btn cv-btn-delete" data-cv-action="delete" data-cv-id="${escapeAttr(doc.id)}" data-cv-path="${escapeAttr(cvPath)}">
                            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                            Delete
                        </button>
                    </div>
                </div>
            `;
        });

        uploadedSection.innerHTML = cvsHTML;
        attachCvActionHandlers(uploadedSection);

    } catch (error) {
        console.error('Error loading CVs:', error);
        uploadedSection.innerHTML = `
            <div style="background: #fef2f2; border: 1px solid #fca5a5; padding: 16px; border-radius: 8px; color: #991b1b;">
                Error loading your CVs. Please refresh the page.
            </div>
        `;
    }
}

// View CV function
window.viewCV = function(cvURL, fileName) {
    const safeUrl = safeCvUrl(cvURL);
    if (!safeUrl) {
        alert('This CV link is invalid.');
        return;
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById('cvPreviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cvPreviewModal';
        modal.className = 'cv-modal';
        modal.innerHTML = `
            <div class="cv-modal-content">
                <div class="cv-modal-header">
                    <h3></h3>
                    <button class="cv-modal-close" onclick="closeCV()">×</button>
                </div>
                <div class="cv-modal-body">
                    <iframe sandbox="allow-downloads allow-same-origin" referrerpolicy="no-referrer"></iframe>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.querySelector('.cv-modal-header h3').textContent = safeTextValue(fileName, 'CV Document', 160);
    modal.querySelector('iframe').src = safeUrl;

    modal.classList.add('active');
};

// Close CV modal
window.closeCV = function() {
    const modal = document.getElementById('cvPreviewModal');
    if (modal) {
        modal.classList.remove('active');
    }
};

// Download CV function
window.downloadCV = function(cvURL, fileName) {
    const safeUrl = safeCvUrl(cvURL);
    if (!safeUrl) {
        alert('This CV link is invalid.');
        return;
    }

    const link = document.createElement('a');
    link.href = safeUrl;
    link.download = safeTextValue(fileName, 'CV Document', 160);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Delete CV function
window.deleteCV = async function(docId, filePath) {
    if (!confirm('Are you sure you want to delete this CV?')) {
        return;
    }

    try {
        // Import necessary functions
        const { deleteDoc, doc: firestoreDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
        const { getStorage, ref: storageRef, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
        
        const storage = getStorage(app);

        if (!filePath || !filePath.startsWith(`cvs/${currentUser.uid}/`)) {
            throw new Error('Invalid CV path.');
        }

        // Delete from Storage
        const fileRef = storageRef(storage, filePath);
        await deleteObject(fileRef);

        // Delete from Firestore
        await deleteDoc(firestoreDoc(db, 'cvs', docId));

        alert('CV deleted successfully!');
        
        // Reload CVs
        loadUserCVs();

    } catch (error) {
        console.error('Error deleting CV:', error);
        alert('Error deleting CV: ' + error.message);
    }
};

// Call loadUserCVs when user profile is loaded
// Add this after the loadUserProfile function completes
      
    // Sign out function
    window.handleSignOut = async function() {
        if (confirm('Are you sure you want to sign out?')) {
            try {
                // Clear cached profile data
                localStorage.removeItem('userProfile');
                
                await signOut(auth);
                console.log('User signed out successfully');
                // Redirect to home page
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                alert('Error signing out. Please try again.');
            }
        }
    };

    // Tab switching functionality
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    function switchTab(tabName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Hide all content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        // Show selected content
        if (tabName === 'profile') {
            const profileView = document.getElementById('profile-view');
            if (profileView) profileView.classList.remove('hidden');
        } else {
            const tabContent = document.getElementById(tabName + '-content');
            if (tabContent) tabContent.classList.remove('hidden');
        }
    }

    // Toggle edit mode
    window.toggleEditMode = function(isEditing) {
        const profileView = document.getElementById('profile-view');
        const profileEdit = document.getElementById('profile-edit');
        
        if (isEditing) {
            if (profileView) profileView.classList.add('hidden');
            if (profileEdit) profileEdit.classList.remove('hidden');
            loadFormData();
        } else {
            if (profileView) profileView.classList.remove('hidden');
            if (profileEdit) profileEdit.classList.add('hidden');
        }
    };

    // Load form data from profileData
    function loadFormData() {
        const setInputValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        };

        setInputValue('inputName', profileData.name);
        setInputValue('inputEmail', profileData.email);
        setInputValue('inputPhone', profileData.phone);
        setInputValue('inputLocation', profileData.location);
        setInputValue('inputInstitution', profileData.institutionName);
        setInputValue('inputDegree', profileData.degreeType);
        setInputValue('inputField', profileData.fieldOfStudy);
        setInputValue('inputGraduation', profileData.graduationYear);
        setInputValue('inputJobTitle', profileData.currentJobTitle);
        setInputValue('inputCompany', profileData.currentCompany);
        setInputValue('inputExperience', profileData.yearsOfExperience);
        setInputValue('inputIndustry', profileData.industry);
        setInputValue('inputDesiredJob', profileData.desiredJobTitle);
        setInputValue('inputDesiredLocation', profileData.desiredLocation);
        setInputValue('inputBio', profileData.bio);
        
        setEmploymentStatus(profileData.employmentStatus);
    }

    // Set employment status
    window.setEmploymentStatus = function(status) {
        profileData.employmentStatus = status;
        
        // Update button states
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const statusBtn = document.querySelector(`[data-status="${status}"]`);
        if (statusBtn) {
            statusBtn.classList.add('active');
        }

        // Show/hide relevant sections
        const studentSection = document.getElementById('editStudentSection');
        const professionalSection = document.getElementById('editProfessionalSection');
        const careerSection = document.getElementById('editCareerSection');

        if (studentSection) studentSection.classList.add('hidden');
        if (professionalSection) professionalSection.classList.add('hidden');
        if (careerSection) careerSection.classList.add('hidden');

        if (status === 'student') {
            if (studentSection) studentSection.classList.remove('hidden');
            if (careerSection) careerSection.classList.remove('hidden');
        } else if (status === 'employed' || status === 'unemployed') {
            if (professionalSection) professionalSection.classList.remove('hidden');
        } else if (status === 'open-for-job') {
            if (careerSection) careerSection.classList.remove('hidden');
        }
    };

    // Save profile
    window.saveProfile = async function() {
        if (!currentUser) {
            alert('You must be logged in to save your profile.');
            return;
        }

        const getInputValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        // Update profileData with form values
        profileData.name = getInputValue('inputName');
        profileData.phone = getInputValue('inputPhone');
        profileData.location = getInputValue('inputLocation');
        profileData.institutionName = getInputValue('inputInstitution');
        profileData.degreeType = getInputValue('inputDegree');
        profileData.fieldOfStudy = getInputValue('inputField');
        profileData.graduationYear = getInputValue('inputGraduation');
        profileData.currentJobTitle = getInputValue('inputJobTitle');
        profileData.currentCompany = getInputValue('inputCompany');
        profileData.yearsOfExperience = getInputValue('inputExperience');
        profileData.industry = getInputValue('inputIndustry');
        profileData.desiredJobTitle = getInputValue('inputDesiredJob');
        profileData.desiredLocation = getInputValue('inputDesiredLocation');
        profileData.bio = getInputValue('inputBio');

        try {
            // Save to Firestore
            await setDoc(doc(db, 'users', currentUser.uid), {
                ...profileData,
                email: currentUser.email,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Update cache immediately
            localStorage.setItem('userProfile', JSON.stringify(profileData));

            console.log('Profile saved successfully');
            updateProfileView();
            toggleEditMode(false);
            alert('Profile saved successfully!');
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Error saving profile. Please try again.');
        }
    };

    // Update profile view
    function updateProfileView() {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text || 'Not specified';
        };

        // Update basic info
        setText('profileName', profileData.name || 'User');
        setText('profileEmail', profileData.email);
        setText('sidebarUserName', profileData.name || 'User');
        setText('viewPhone', profileData.phone);
        setText('viewLocation', profileData.location);

        // Update avatar initial
        const userAvatarInitialEl = document.getElementById('userAvatarInitial');
        if (userAvatarInitialEl && profileData.name) {
            const initial = profileData.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            userAvatarInitialEl.textContent = initial || 'U';
        }

        // Update employment status text
        const statusText = {
            'employed': 'Currently Employed',
            'unemployed': 'Open for Opportunities',
            'student': 'Student',
            'open-for-job': 'Actively Job Seeking'
        };
        setText('viewEmploymentStatus', statusText[profileData.employmentStatus]);

        // Show/hide sections based on employment status
        const studentInfo = document.getElementById('studentInfo');
        const professionalInfo = document.getElementById('professionalInfo');
        const careerPreferences = document.getElementById('careerPreferences');
        const bioSection = document.getElementById('bioSection');

        if (studentInfo) studentInfo.classList.add('hidden');
        if (professionalInfo) professionalInfo.classList.add('hidden');
        if (careerPreferences) careerPreferences.classList.add('hidden');

        if (profileData.employmentStatus === 'student') {
            if (studentInfo) studentInfo.classList.remove('hidden');
            if (careerPreferences) careerPreferences.classList.remove('hidden');
            
            setText('viewInstitution', profileData.institutionName);
            setText('viewDegree', profileData.degreeType);
            setText('viewField', profileData.fieldOfStudy);
            setText('viewGraduation', profileData.graduationYear);
        }

        if (profileData.employmentStatus === 'employed' || profileData.employmentStatus === 'unemployed') {
            if (professionalInfo) professionalInfo.classList.remove('hidden');
            
            setText('viewJobTitle', profileData.currentJobTitle);
            setText('viewCompany', profileData.currentCompany);
            setText('viewExperience', profileData.yearsOfExperience);
            setText('viewIndustry', profileData.industry);
        }

        if (profileData.employmentStatus === 'open-for-job' || profileData.employmentStatus === 'student') {
            if (careerPreferences) careerPreferences.classList.remove('hidden');
            
            setText('viewDesiredJob', profileData.desiredJobTitle);
            setText('viewDesiredLocation', profileData.desiredLocation);
        }

        // Show/hide bio
        if (profileData.bio && bioSection) {
            bioSection.classList.remove('hidden');
            setText('viewBio', profileData.bio);
        } else if (bioSection) {
            bioSection.classList.add('hidden');
        }
    }
// CV Upload functionality (add this inside your existing script, before the closing tag)
const cvInput = document.getElementById("cvUpload");

if (cvInput) {
    cvInput.addEventListener("change", async (e) => {
        const cvFile = e.target.files[0];
        if (!cvFile) return;

        const user = currentUser; // Use the currentUser from your existing script

        if (!user) {
            alert("Please login first to upload your CV");
            window.location.href = "login.html";
            return;
        }

        const allowedTypes = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ];

        if (!allowedTypes.includes(cvFile.type)) {
            alert("Only PDF and DOCX files are allowed");
            e.target.value = "";
            return;
        }

        if (cvFile.size > 5 * 1024 * 1024) {
            alert("File size must be less than 5MB");
            e.target.value = "";
            return;
        }

        const label = document.querySelector('label[for="cvUpload"]');
        const originalText = label ? label.textContent : "";

        if (label) {
            label.textContent = "Uploading...";
            label.style.pointerEvents = "none";
            label.style.opacity = "0.6";
        }

        try {
            const token = await user.getIdToken();
            const formData = new FormData();
            formData.append("file", cvFile);

            const response = await fetch("/.netlify/functions/upload-profile-cv", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(result?.error || "CV upload failed. Please try again.");
            }

            alert("✅ CV uploaded successfully!");
    e.target.value = "";

    // Reload the CVs list to show the newly uploaded CV
      loadUserCVs();

        } catch (error) {
            console.error("Upload error:", error);
            alert("❌ Error uploading CV: " + error.message);
        } finally {
            if (label) {
                label.textContent = originalText;
                label.style.pointerEvents = "auto";
                label.style.opacity = "1";
            }
        }
    });
}
</script>
