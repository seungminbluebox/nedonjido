import { fetchPrices } from "./utils.js"; // ✅ fetchPrices를 직접 import

// 페이지가 로드될 때 공통 레이아웃을 삽입하는 함수
async function insertLayout() {
  const sidebarPlaceholder = document.getElementById("sidebar-placeholder");
  if (!sidebarPlaceholder) return;

  try {
    const response = await fetch("/layout/_sidebar.html");
    const sidebarHtml = await response.text();
    sidebarPlaceholder.innerHTML = sidebarHtml;

    // ✅ 레이아웃 삽입 후, 환율 정보를 불러와서 표시하는 로직을 여기에 추가합니다.
    try {
      // fetchPrices는 다른 종목 가격도 가져올 수 있지만, 여기서는 환율만 필요합니다.
      // utils.js에서 exchangeRate 변수가 업데이트됩니다.
      await fetchPrices(["USD_KRW"]);
      const exchangeRateElement = document.getElementById("exchange-rate");
      const exchangeRate = (await import("./utils.js")).exchangeRate;

      if (exchangeRateElement && exchangeRate) {
        exchangeRateElement.textContent = `💲1 USD = ${exchangeRate.toLocaleString()} KRW`;
      }
    } catch (e) {
      console.error("환율 정보 로딩 실패:", e);
      const exchangeRateElement = document.getElementById("exchange-rate");
      if (exchangeRateElement)
        exchangeRateElement.textContent = "환율: 로딩 실패";
    }

    // 현재 페이지 URL을 확인하여 해당하는 메뉴에 'active' 클래스 추가
    const currentPagePath = window.location.pathname;
    const navLinks = sidebarPlaceholder.querySelectorAll("nav a");
    navLinks.forEach((link) => {
      if (link.getAttribute("href") === currentPagePath) {
        link.classList.add("active");
      }
    });

    // ✅ 로그아웃 버튼 기능은 이제 layout.js가 담당하는 것이 더 적절합니다.
    const logoutButton = document.getElementById("logout-btn");
    if (logoutButton) {
      const { auth } = await import("../firebase-config.js");
      const { signOut } = await import(
        "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
      );

      logoutButton.addEventListener("click", () => {
        // 사용자께서 작성하신 확인 창 로직
        if (confirm("정말 로그아웃 하시겠습니까?")) {
          signOut(auth)
            .then(() => {
              // 로그아웃 성공 시 로그인 페이지로 이동합니다.
              window.location.href = "/login.html";
            })
            .catch((error) => {
              console.error("로그아웃 실패", error);
              alert("로그아웃 중 오류가 발생했습니다.");
            });
        }
      });
    }
  } catch (error) {
    console.error("사이드바를 불러오는 데 실패했습니다:", error);
  }
}

document.addEventListener("DOMContentLoaded", insertLayout);
