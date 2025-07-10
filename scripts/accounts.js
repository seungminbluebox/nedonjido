import { auth, db } from "../firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { checkAuthState } from "./auth.js";

let currentUser = null;
const spinner = document.getElementById("loading-spinner");
const accountListEl = document.getElementById("account-list");

checkAuthState(loadAccountData);

async function loadAccountData(user) {
  if (!user) return;
  currentUser = user;
  spinner.style.display = "block";
  accountListEl.innerHTML = "";

  try {
    // 1. 입출금 내역과, 이전에 저장했던 수동 자산 데이터를 가져옵니다.
    const depositsRef = collection(db, "users", currentUser.uid, "deposits");
    const accountAssetsRef = doc(
      db,
      "users",
      currentUser.uid,
      "manualData",
      "accountAssets"
    );

    const [depositsSnap, accountAssetsSnap] = await Promise.all([
      getDocs(depositsRef),
      getDoc(accountAssetsRef),
    ]);

    const depositsData = depositsSnap.docs.map((doc) => doc.data());
    const savedAssetsData = accountAssetsSnap.exists()
      ? accountAssetsSnap.data()
      : {};

    // 2. 입출금 내역을 계좌별로 그룹화하여 '누적 입금액'을 계산합니다.
    const accounts = {};
    depositsData.forEach((deposit) => {
      const accountKey = `${deposit.securities}|${deposit.accountType}`;
      if (!accounts[accountKey]) {
        accounts[accountKey] = {
          securities: deposit.securities,
          accountType: deposit.accountType,
          totalDeposit: 0,
          // 이전에 저장했던 '현재 총 자산' 값을 불러옵니다. 없으면 0으로 시작합니다.
          currentAsset: savedAssetsData[accountKey] || 0,
        };
      }
      accounts[accountKey].totalDeposit += deposit.amount;
    });

    // 3. 계산된 정보를 바탕으로 화면에 카드를 그립니다.
    if (Object.keys(accounts).length === 0) {
      accountListEl.innerHTML =
        "<p>표시할 계좌 실적이 없습니다. 먼저 '입출금 내역'을 등록해주세요.</p>";
    } else {
      for (const key in accounts) {
        const account = accounts[key];
        const card = createAccountCard(key, account);
        accountListEl.appendChild(card);
      }
    }
  } catch (error) {
    console.error("계좌 데이터 로딩 실패:", error);
    accountListEl.innerHTML = "<p>데이터를 불러오는 데 실패했습니다.</p>";
  } finally {
    spinner.style.display = "none";
  }
}

// 계좌 정보 카드 한 개를 만드는 함수
function createAccountCard(key, account) {
  const card = document.createElement("div");
  card.className = "account-card";

  const profit = account.currentAsset - account.totalDeposit;
  const profitRate =
    account.totalDeposit !== 0 ? (profit / account.totalDeposit) * 100 : 0;
  const profitClass =
    profit > 0 ? "profit-positive" : profit < 0 ? "profit-negative" : "";

  card.innerHTML = `
        <div class="account-card-header">
            <h2>${account.securities} - ${account.accountType}</h2>
        </div>
        <div class="account-card-body">
            <div class="account-row">
                <span class="label">현재 총 자산:</span>
                <span class="value">
                    <input type="number" class="current-asset-input" data-key="${key}" value="${
    account.currentAsset
  }" placeholder="금액 입력"> 원
                </span>
            </div>
            <div class="account-row">
                <span class="label">누적 입금액:</span>
                <span class="value">${account.totalDeposit.toLocaleString()} 원</span>
            </div>
            <hr>
            <div class="account-row">
                <span class="label">누적 손익:</span>
                <span class="value ${profitClass}">${profit.toLocaleString()} 원</span>
            </div>
            <div class="account-row">
                <span class="label">누적 수익률:</span>
                <span class="value ${profitClass}">${profitRate.toFixed(
    2
  )}%</span>
            </div>
        </div>
    `;
  return card;
}

// '변경사항 저장' 버튼 (버그 수정 버전)
document.getElementById("save-all").addEventListener("click", async () => {
  if (!currentUser) return;

  const inputs = document.querySelectorAll(".current-asset-input");
  const dataToSave = {};

  inputs.forEach((input) => {
    const key = input.dataset.key;
    const value = parseFloat(input.value) || 0;
    dataToSave[key] = value;
  });

  try {
    const docRef = doc(
      db,
      "users",
      currentUser.uid,
      "manualData",
      "accountAssets"
    );
    await setDoc(docRef, dataToSave);
    alert("✅ 변경사항이 저장되었습니다!");

    // ✅ 'loadDividends'를 올바른 함수 이름인 'loadAccountData'로 수정합니다.
    loadAccountData(currentUser);
  } catch (error) {
    console.error("저장 실패:", error);
    alert("저장에 실패했습니다.");
  }
});
