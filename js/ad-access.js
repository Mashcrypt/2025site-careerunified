(function () {
  "use strict";

  const ADSENSE_CLIENT = "ca-pub-6250740445882620";
  const ADSENSE_SCRIPT_ID = "careerUnifiedAdSense";
  const ACTIVE_CACHE_KEY = "careerUnifiedAdFreeAccess";
  const ACTIVE_CACHE_TTL_MS = 5 * 60 * 1000;
  const FIREBASE_APP_SRC = "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js";
  const FIREBASE_AUTH_SRC = "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js";
  const firebaseConfig = {
    apiKey: "AIzaSyAEBbnXPlYYf9jbfgLSzfod3r0i5MOAo9M",
    authDomain: "career-unified.firebaseapp.com",
    projectId: "career-unified",
    storageBucket: "career-unified.appspot.com",
    messagingSenderId: "101656817742",
    appId: "1:101656817742:web:22c9a58a822a714e54931f"
  };

  function setAccessState(state) {
    document.documentElement.dataset.adAccess = state;
  }

  function loadExternalScript(id, src, isReady) {
    if (isReady()) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function getAuth() {
    await loadExternalScript(
      "careerUnifiedFirebaseApp",
      FIREBASE_APP_SRC,
      () => typeof window.firebase !== "undefined"
    );
    await loadExternalScript(
      "careerUnifiedFirebaseAuth",
      FIREBASE_AUTH_SRC,
      () => typeof window.firebase?.auth === "function"
    );

    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(firebaseConfig);
    }

    return window.firebase.auth();
  }

  function resolveCurrentUser(auth) {
    return new Promise((resolve, reject) => {
      let unsubscribe = function () {};
      unsubscribe = auth.onAuthStateChanged(
        (user) => {
          unsubscribe();
          resolve(user);
        },
        (error) => {
          unsubscribe();
          reject(error);
        }
      );
    });
  }

  function readActiveAccessCache(uid) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(ACTIVE_CACHE_KEY) || "null");
      if (
        cached?.uid === uid &&
        cached?.adFree === true &&
        Number(cached.expiresAt) > Date.now()
      ) {
        return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }

  function cacheActiveAccess(uid) {
    try {
      sessionStorage.setItem(
        ACTIVE_CACHE_KEY,
        JSON.stringify({
          uid,
          adFree: true,
          expiresAt: Date.now() + ACTIVE_CACHE_TTL_MS
        })
      );
    } catch (error) {
      // Session storage may be unavailable in strict privacy modes.
    }
  }

  function clearActiveAccessCache() {
    try {
      sessionStorage.removeItem(ACTIVE_CACHE_KEY);
    } catch (error) {
      // Session storage may be unavailable in strict privacy modes.
    }
  }

  function loadAds() {
    if (
      document.getElementById(ADSENSE_SCRIPT_ID) ||
      document.querySelector(`script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]`)
    ) {
      setAccessState("ad-supported");
      return;
    }

    const script = document.createElement("script");
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    document.head.appendChild(script);
    setAccessState("ad-supported");
  }

  async function hasActiveSubscription(user) {
    if (readActiveAccessCache(user.uid)) return true;

    const idToken = await user.getIdToken();
    const response = await fetch("/.netlify/functions/get-billing-status", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`
      },
      credentials: "same-origin"
    });

    if (!response.ok) throw new Error("Billing status could not be verified");

    const billing = await response.json();
    const isActive = billing?.plan !== "free" && billing?.subscriptionStatus === "active";

    if (isActive) {
      cacheActiveAccess(user.uid);
    } else {
      clearActiveAccessCache();
    }

    return isActive;
  }

  async function initialiseAdAccess() {
    setAccessState("checking");

    try {
      const auth = await getAuth();
      const user = await resolveCurrentUser(auth);

      if (!user) {
        clearActiveAccessCache();
        loadAds();
        return;
      }

      if (await hasActiveSubscription(user)) {
        setAccessState("ad-free");
        return;
      }

      loadAds();
    } catch (error) {
      setAccessState("unverified");
    }
  }

  initialiseAdAccess();
})();
