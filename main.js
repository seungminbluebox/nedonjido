// main.js
import { auth, provider, db } from "./firebase-config.js";
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const loginButton = document.getElementById("login-btn");
if (loginButton) {
  loginButton.addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const userInfoElement = document.getElementById("user-info");
      if (userInfoElement) {
        userInfoElement.innerText = `✅ 로그인됨: ${user.displayName}`;
      }
    } catch (error) {
      console.error("로그인 실패", error);
    }
  });
}
// ✅ 로그아웃 버튼 이벤트 리스너 (새로 추가)
const logoutButton = document.getElementById("logout-btn");
if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    signOut(auth)
      .then(() => {
        alert("로그아웃 되었습니다.");
        window.location.href = "/index.html"; // 로그아웃 후 홈으로 이동
      })
      .catch((error) => {
        console.error("로그아웃 실패", error);
        alert("로그아웃 중 오류가 발생했습니다.");
      });
  });
}
