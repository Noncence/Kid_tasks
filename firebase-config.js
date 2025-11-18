 // firebase-config.js
  const firebaseConfig = {
    apiKey: "AIzaSyB3t07AWqbh2bSg5gfkI_yrEzD60XqUfsQ",
    authDomain: "kid-tasks-95211.firebaseapp.com",
    projectId: "kid-tasks-95211",
    storageBucket: "kid-tasks-95211.firebasestorage.app",
    messagingSenderId: "1039260161726",
    appId: "1:1039260161726:web:e4e87489dcc0dbe38a30ef"
  };

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();