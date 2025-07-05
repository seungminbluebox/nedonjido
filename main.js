// main.js
import { auth, provider, db } from "./firebase-config.js";
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.getElementById("login-btn").addEventListener("click", async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    document.getElementById(
      "user-info"
    ).innerText = `✅ 로그인됨: ${user.displayName}`;
  } catch (error) {
    console.error("로그인 실패", error);
  }
});
