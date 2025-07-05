import { auth, provider } from "../firebase-config.js";
import {
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const loginButton = document.getElementById("login-btn");

// 로그인 버튼 클릭 시 팝업 실행
if (loginButton) {
  loginButton.addEventListener("click", () => {
    signInWithPopup(auth, provider)
      .then((result) => {
        // 로그인 성공 시 메인 페이지(index.html)로 이동
        window.location.href = "/index.html";
      })
      .catch((error) => {
        console.error("로그인 실패:", error);
        alert("로그인 중 오류가 발생했습니다.");
      });
  });
}

// 로그인 상태를 감지하는 함수 (모든 페이지에서 사용)
export function checkAuthState(onLoggedIn) {
  onAuthStateChanged(auth, (user) => {
    // 현재 페이지가 로그인 페이지라면 아무것도 하지 않습니다.
    if (window.location.pathname.includes("login.html")) {
      return;
    }

    if (user) {
      // ✅ onLoggedIn이 존재하고, 실제로 '함수' 타입일 때만 실행합니다.
      if (onLoggedIn && typeof onLoggedIn === "function") {
        onLoggedIn(user);
      }
    } else {
      // 로그인하지 않은 사용자는 로그인 페이지로 강제 이동합니다.
      window.location.href = "/login.html";
    }
  });
}
