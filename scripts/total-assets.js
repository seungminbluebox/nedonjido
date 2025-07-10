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
const assetsListTbody = document.querySelector("#total-assets-list tbody");

checkAuthState(loadInitialData);

async function loadInitialData(user) {
  if (!user) return;
  currentUser = user;
  spinner.style.display = "block";
  assetsListTbody.innerHTML = "";

  try {
    const depositsRef = collection(db, "users", currentUser.uid, "deposits");
    const monthlyAssetsRef = doc(
      db,
      "users",
      currentUser.uid,
      "manualData",
      "monthlyAssets"
    );
    const [depositsSnap, monthlyAssetsSnap] = await Promise.all([
      getDocs(depositsRef),
      getDoc(monthlyAssetsRef),
    ]);

    const depositsData = depositsSnap.docs.map((doc) => doc.data());
    // ✅ 월별 자산 데이터를 배열 형태로 관리합니다.
    const savedMonthlyAssets = monthlyAssetsSnap.exists()
      ? monthlyAssetsSnap.data().assets || []
      : [];

    // 월별 데이터를 계산하고 화면에 그립니다.
    calculateAndRender(depositsData, savedMonthlyAssets);
  } catch (error) {
    console.error("월별 자산 데이터 로딩 실패:", error);
    assetsListTbody.innerHTML =
      "<tr><td colspan='9'>데이터를 불러오는 데 실패했습니다.</td></tr>";
  } finally {
    spinner.style.display = "none";
  }
}

// 데이터를 계산하고 화면에 렌더링하는 함수
function calculateAndRender(deposits, savedAssets) {
  assetsListTbody.innerHTML = ""; // 테이블 비우기

  // 입금 내역을 월별로 집계
  const monthlyDeposits = {};
  deposits.forEach((d) => {
    const month = d.date.substring(0, 7); // 'YYYY-MM'
    if (!monthlyDeposits[month]) monthlyDeposits[month] = 0;
    monthlyDeposits[month] += d.amount;
  });

  // 저장된 자산 데이터를 날짜순으로 정렬
  const sortedAssets = savedAssets.sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  let cumulativeDeposit = 0;
  let lastMonthAsset = 0;

  sortedAssets.forEach((assetData) => {
    const { month, asset } = assetData;
    const monthlyDeposit = monthlyDeposits[month] || 0;

    // 이전 달까지의 누적 입금액 계산
    const monthsBefore = Object.keys(monthlyDeposits).filter((m) => m < month);
    cumulativeDeposit =
      monthsBefore.reduce((sum, m) => sum + monthlyDeposits[m], 0) +
      monthlyDeposit;

    const monthlyProfit = asset - lastMonthAsset - monthlyDeposit;
    const beginningOfMonthAsset = lastMonthAsset + monthlyDeposit;
    const monthlyRate =
      beginningOfMonthAsset !== 0
        ? (monthlyProfit / beginningOfMonthAsset) * 100
        : 0;

    const cumulativeProfit = asset - cumulativeDeposit;
    const cumulativeRate =
      cumulativeDeposit !== 0
        ? (cumulativeProfit / cumulativeDeposit) * 100
        : 0;

    const row = createAssetRow({
      month,
      endOfMonthAsset: asset,
      monthlyDeposit,
      monthlyProfit,
      monthlyRate,
      cumulativeDeposit,
      cumulativeProfit,
      cumulativeRate,
    });
    assetsListTbody.appendChild(row);
    lastMonthAsset = asset;
  });
}

// 테이블의 한 행을 만드는 함수
function createAssetRow(data) {
  const row = document.createElement("tr");

  const monthlyProfitClass =
    data.monthlyProfit > 0
      ? "profit-positive"
      : data.monthlyProfit < 0
      ? "profit-negative"
      : "";
  const cumulativeProfitClass =
    data.cumulativeProfit > 0
      ? "profit-positive"
      : data.cumulativeProfit < 0
      ? "profit-negative"
      : "";

  row.innerHTML = `
        <td><input type="month" class="month-input" value="${data.month}" ${
    data.isNew ? "" : "disabled"
  }></td>
        <td><input type="number" class="asset-input" value="${
          data.endOfMonthAsset || ""
        }" placeholder="월말 총자산"></td>
        <td>${(data.monthlyDeposit || 0).toLocaleString()}</td>
        <td class="${monthlyProfitClass}">${Math.round(
    data.monthlyProfit || 0
  ).toLocaleString()}</td>
        <td class="${monthlyProfitClass}">${(data.monthlyRate || 0).toFixed(
    2
  )}%</td>
        <td>${(data.cumulativeDeposit || 0).toLocaleString()}</td>
        <td class="${cumulativeProfitClass}">${Math.round(
    data.cumulativeProfit || 0
  ).toLocaleString()}</td>
        <td class="${cumulativeProfitClass}">${(
    data.cumulativeRate || 0
  ).toFixed(2)}%</td>
        <td><button class="delete-row-btn">🗑️</button></td>
    `;
  // 삭제 버튼에 이벤트 리스너 추가
  row.querySelector(".delete-row-btn").addEventListener("click", () => {
    if (confirm(`'${data.month}' 데이터를 삭제하시겠습니까?`)) {
      row.remove();
    }
  });
  return row;
}

// '새로운 월 추가' 버튼 이벤트
document.getElementById("add-row").addEventListener("click", () => {
  const newRow = createAssetRow({ month: "", isNew: true });
  assetsListTbody.appendChild(newRow);
});

// '저장' 버튼 이벤트
document.getElementById("save-all").addEventListener("click", async () => {
  if (!currentUser) return;

  const rows = assetsListTbody.querySelectorAll("tr");
  const dataToSave = [];
  const monthSet = new Set(); // 월 중복 체크용

  for (const row of rows) {
    const monthInput = row.querySelector(".month-input");
    const assetInput = row.querySelector(".asset-input");

    const month = monthInput.value;
    const asset = parseFloat(assetInput.value) || 0;

    if (!month) {
      alert("❗ '년/월'을 입력해주세요.");
      return;
    }
    if (monthSet.has(month)) {
      alert(`❗ '${month}'이 중복되었습니다. 중복된 월을 삭제해주세요.`);
      return;
    }
    monthSet.add(month);
    dataToSave.push({ month, asset });
  }

  try {
    const docRef = doc(
      db,
      "users",
      currentUser.uid,
      "manualData",
      "monthlyAssets"
    );
    // ✅ 데이터 구조를 배열을 담은 객체 형태로 저장합니다.
    await setDoc(docRef, { assets: dataToSave });
    alert("✅ 변경사항이 저장되었습니다!");
    loadInitialData(currentUser);
  } catch (error) {
    console.error("저장 실패:", error);
    alert("저장에 실패했습니다.");
  }
});
