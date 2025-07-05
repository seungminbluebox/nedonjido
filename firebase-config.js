// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 아래는 실제로 Firebase 콘솔에서 받은 정보로 바꿔줘
const firebaseConfig = {
  apiKey: "AIzaSyC4T97moeF7H5Cn_xB7wBtArDOOOGyJgPk",
  authDomain: "nedonjido-40365.firebaseapp.com",
  projectId: "nedonjido-40365",
  storageBucket: "nedonjido-40365.firebasestorage.app",
  messagingSenderId: "802488721742",
  appId: "1:802488721742:web:0643582d064c9c7ae2be1f",
  measurementId: "G-1GH1DQQCLS",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, provider, db };
