import { auth } from './firebase.js';
import { signInWithEmailAndPassword } from "firebase/auth";

const form = document.getElementById('loginForm');
const message = document.getElementById('loginMessage');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  message.textContent = '';

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    message.style.color = 'green';
    message.textContent = 'Login successful! Redirecting...';
    setTimeout(()=>window.location.href='dashboard.html', 1000);
  } catch (err) {
    message.style.color = 'red';
    message.textContent = err.message;
  }
});
