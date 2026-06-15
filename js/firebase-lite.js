// Firebase setup for pages that only use authentication and Firestore.
const firebaseConfig = {
  apiKey: "AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M",
  authDomain: "career-unified.firebaseapp.com",
  projectId: "career-unified",
  storageBucket: "career-unified.appspot.com",
  messagingSenderId: "101656817742",
  appId: "1:101656817742:web:22c9a58a822a714e54931f"
};

if (typeof firebase !== "undefined") {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.auth = firebase.auth();
  window.db = firebase.firestore();
} else {
  console.warn("Firebase SDK did not load; account and saved-item features are unavailable.");
}
