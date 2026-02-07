// js/firebase.js
// Browser compatible Firebase setup for Career Unified

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M",
  authDomain: "career-unified.firebaseapp.com",
  projectId: "career-unified",
  storageBucket: "career-unified.appspot.com",
  messagingSenderId: "101656817742",
  appId: "1:101656817742:web:22c9a58a822a714e54931f"
};

// Initialize Firebase only once
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Make services available globally
window.auth = firebase.auth();
window.db = firebase.firestore();
window.storage = firebase.storage();

console.log("🔥 Firebase initialized");

