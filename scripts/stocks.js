import { auth, db } from "../firebase-config.js";
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { fetchPrices, exchangeRate } from "./utils.js";
import { checkAuthState } from "./auth.js";

let userStocks = [];
let currentUser = null;

checkAuthState(async (user) => {
  currentUser = user;
  const catDocRef = doc(db, "users", user.uid, "categories", "user_categories");
  const docSnap = await getDoc(catDocRef);
  if (docSnap.exists()) {
    userStocks = docSnap.data().stocks || [];
  }
  loadStocks(user);
});

const spinner = document.getElementById("loading-spinner");

// ✅ 헬퍼 함수: 종목명 드롭다운 메뉴를 생성합니다.
function createStockNameDropdown(selectedName = "") {
  const nameSelect = document.createElement("select");
  nameSelect.dataset.key = "name";

  const defaultOption = document.createElement("option");
  defaultOption.textContent = "종목 선택";
  defaultOption.value = "";
  nameSelect.appendChild(defaultOption);

  userStocks.forEach((stock) => {
    const option = document.createElement("option");
    option.textContent = stock.name;
    option.value = stock.name;
    option.dataset.ticker = stock.ticker;
    // 기존에 선택된 값(selectedName)이 있다면, 해당 옵션을 선택 상태로 만듭니다.
    if (stock.name === selectedName) {
      option.selected = true;
    }
    nameSelect.appendChild(option);
  });
  return nameSelect;
}

async function loadStocks(user) {
  if (!user) return;
  spinner.style.display = "block";
  const tbody = document.querySelector("#stock-table tbody");
  tbody.innerHTML = "";

  // ✅ 1. 요약 정보를 표시할 HTML 요소들을 가져옵니다. (기존 코드)
  const totalPurchaseEl = document.getElementById("total-purchase");
  const totalEvaluationEl = document.getElementById("total-evaluation");
  const totalProfitLossEl = document.getElementById("total-profit-loss");

  try {
    const ref = collection(db, "users", user.uid, "stocks");
    const q = query(ref, orderBy("createdAt"));
    const snapshot = await getDocs(q);
    const stockData = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // ... (데이터가 없을 때의 처리 코드는 그대로)
    if (stockData.length === 0) {
      totalPurchaseEl.textContent = "0 원";
      totalEvaluationEl.textContent = "0 원";
      totalProfitLossEl.textContent = "0 원 (0.00%)";
      // ✅ 색상 클래스도 초기화합니다.
      totalProfitLossEl.classList.remove("positive", "negative");
      spinner.style.display = "none";
      return;
    }

    const tickers = stockData.map((s) => s.ticker).filter((t) => t);
    const prices = tickers.length > 0 ? await fetchPrices(tickers) : {};

    let totalPurchaseAmount = 0;
    let totalEvaluationAmount = 0;

    for (const data of stockData) {
      // ... (for 루프 안의 행 생성 및 계산 코드는 기존과 동일합니다.)
      const row = document.createElement("tr");
      ["ticker", "name", "quantity", "avgPrice"].forEach((key) => {
        const cell = document.createElement("td");
        if (key === "name") {
          const nameSelect = createStockNameDropdown(data.name);
          nameSelect.dataset.id = data.id;
          nameSelect.addEventListener("change", (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const ticker = selectedOption.dataset.ticker || "";
            row.querySelector('input[data-key="ticker"]').value = ticker;
          });
          cell.appendChild(nameSelect);
        } else {
          const input = document.createElement("input");
          let value = data[key];
          if (key === "ticker" && value) {
            value = value.replace(/\.KS$/i, "").replace(/\.KQ$/i, "");
          }
          if (key === "ticker") {
            input.readOnly = true;
            input.classList.add("readonly-input");
          }
          input.value = value;
          input.type =
            key === "quantity" || key === "avgPrice" ? "number" : "text";
          input.step = "any";
          input.dataset.id = data.id;
          input.dataset.key = key;
          cell.appendChild(input);
        }
        row.appendChild(cell);
      });
      const currencyCell = document.createElement("td");
      const select = document.createElement("select");
      ["KRW", "USD"].forEach((cur) => {
        const opt = document.createElement("option");
        opt.value = cur;
        opt.textContent = cur;
        if (cur === data.currency) opt.selected = true;
        select.appendChild(opt);
      });
      select.dataset.id = data.id;
      select.dataset.key = "currency";
      currencyCell.appendChild(select);
      row.appendChild(currencyCell);
      const currentPriceCell = document.createElement("td");
      const evalCell = document.createElement("td");
      const profitCell = document.createElement("td");
      const currentPrice = prices[data.ticker.toUpperCase()];
      const quantity = parseFloat(data.quantity);
      const avgPrice = parseFloat(data.avgPrice);
      if (currentPrice && quantity && avgPrice) {
        const evalPrice = quantity * currentPrice;
        const rate = ((currentPrice - avgPrice) / avgPrice) * 100;
        if (data.currency === "USD") {
          currentPriceCell.textContent = currentPrice
            .toFixed(2)
            .toLocaleString();
          evalCell.textContent = `$${Math.round(
            evalPrice.toFixed(2)
          )} → ${Math.round(evalPrice * exchangeRate).toLocaleString()}원`;
        } else {
          currentPriceCell.textContent = currentPrice.toLocaleString();
          evalCell.textContent = `${evalPrice.toLocaleString()}원`;
        }
        profitCell.textContent = rate.toFixed(2) + "%";
      } else {
        currentPriceCell.textContent = "-";
        evalCell.textContent = "-";
        profitCell.textContent = "-";
      }
      row.appendChild(currentPriceCell);
      row.appendChild(evalCell);
      row.appendChild(profitCell);
      const delCell = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️";
      delBtn.onclick = () => handleDelete(data.id);
      delCell.appendChild(delBtn);
      row.appendChild(delCell);

      let purchaseAmountKRW = (quantity || 0) * (avgPrice || 0);
      let evaluationAmountKRW = (quantity || 0) * (currentPrice || 0);

      if (data.currency === "USD" && exchangeRate) {
        purchaseAmountKRW *= exchangeRate;
        evaluationAmountKRW *= exchangeRate;
      }

      totalPurchaseAmount += purchaseAmountKRW;
      if (currentPrice) {
        totalEvaluationAmount += evaluationAmountKRW;
      }

      tbody.appendChild(row);
    }

    // ✅ 5. 최종 계산된 값을 화면에 표시하고, 색상을 변경하는 로직을 추가합니다.
    const totalProfitLoss = totalEvaluationAmount - totalPurchaseAmount;
    const totalProfitRate =
      totalPurchaseAmount === 0
        ? 0
        : (totalProfitLoss / totalPurchaseAmount) * 100;

    totalPurchaseEl.textContent = `${Math.round(
      totalPurchaseAmount
    ).toLocaleString()} 원`;
    totalEvaluationEl.textContent = `${Math.round(
      totalEvaluationAmount
    ).toLocaleString()} 원`;
    totalProfitLossEl.textContent = `${Math.round(
      totalProfitLoss
    ).toLocaleString()} 원 (${totalProfitRate.toFixed(2)}%)`;

    // --- 여기에 색상 변경 로직 추가 ---
    totalProfitLossEl.classList.remove("positive", "negative"); // 먼저 기존 색상 클래스 초기화

    if (totalProfitLoss > 0) {
      totalProfitLossEl.classList.add("positive"); // 손익이 +면 'positive' 클래스 추가
    } else if (totalProfitLoss < 0) {
      totalProfitLossEl.classList.add("negative"); // 손익이 -면 'negative' 클래스 추가
    }
    // ------------------------------------
  } catch (error) {
    console.error("데이터 로딩 중 에러 발생:", error);
    totalPurchaseEl.textContent = "오류";
    totalEvaluationEl.textContent = "오류";
    totalProfitLossEl.textContent = "오류";
  } finally {
    spinner.style.display = "none";
  }
}
// ✅ '종목 추가' 함수도 새 헬퍼 함수를 사용하도록 수정
document.getElementById("add-row").addEventListener("click", () => {
  const tbody = document.querySelector("#stock-table tbody");
  const row = document.createElement("tr");
  row.dataset.isNew = "true";

  const tickerCell = document.createElement("td");
  const tickerInput = document.createElement("input");
  tickerInput.placeholder = "티커";
  tickerInput.dataset.key = "ticker";
  tickerInput.readOnly = true;
  tickerInput.classList.add("readonly-input");
  tickerCell.appendChild(tickerInput);

  const nameCell = document.createElement("td");
  // 헬퍼 함수를 호출하여 드롭다운을 만듭니다.
  const nameSelect = createStockNameDropdown();
  nameSelect.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const ticker = selectedOption.dataset.ticker || "";
    row.querySelector('input[data-key="ticker"]').value = ticker;
  });
  nameCell.appendChild(nameSelect);

  // ... (이하 수량, 평단가, 통화, 빈 셀 생성 로직은 기존과 동일)
  const quantityCell = document.createElement("td");
  const quantityInput = document.createElement("input");
  quantityInput.type = "number";
  quantityInput.placeholder = "수량";
  quantityInput.dataset.key = "quantity";
  quantityCell.appendChild(quantityInput);

  const avgPriceCell = document.createElement("td");
  const avgPriceInput = document.createElement("input");
  avgPriceInput.type = "number";
  avgPriceInput.step = "any";
  avgPriceInput.placeholder = "평단가";
  avgPriceInput.dataset.key = "avgPrice";
  avgPriceCell.appendChild(avgPriceInput);

  row.appendChild(tickerCell);
  row.appendChild(nameCell);
  row.appendChild(quantityCell);
  row.appendChild(avgPriceCell);

  const currencyCell = document.createElement("td");
  const select = document.createElement("select");
  ["", "KRW", "USD"].forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt || "통화";
    select.appendChild(option);
  });
  select.dataset.key = "currency";
  currencyCell.appendChild(select);
  row.appendChild(currencyCell);

  for (let i = 0; i < 4; i++) {
    row.insertCell();
  }

  tbody.appendChild(row);
});

// ... (save-all, handleDelete 함수는 기존과 동일)
document.getElementById("save-all").addEventListener("click", async () => {
  if (!currentUser)
    return alert("사용자 정보가 없습니다. 다시 로그인해주세요.");

  let isAllSaved = true;

  const rows = document.querySelectorAll("#stock-table tbody tr");

  for (const row of rows) {
    const inputs = row.querySelectorAll("input, select");
    const updateData = {};
    let id = null;

    inputs.forEach((el) => {
      const key = el.dataset.key;
      const value = el.value;
      if (el.dataset.id) id = el.dataset.id;

      if (key === "quantity" || key === "avgPrice") {
        updateData[key] = parseFloat(value);
      } else if (key === "ticker") {
        let ticker = value.trim().toUpperCase();
        const currency = row.querySelector('select[data-key="currency"]').value;
        if (/^\d{6}$/.test(ticker) && currency === "KRW") {
          ticker += ".KS";
        }
        updateData[key] = ticker;
      } else {
        updateData[key] = value.trim();
      }
    });

    if (
      !updateData.ticker ||
      !updateData.name ||
      !updateData.quantity ||
      !updateData.avgPrice ||
      !updateData.currency
    ) {
      const allValues = Object.values(updateData).filter(
        (v) => v !== "" && v !== 0 && !isNaN(v)
      );
      if (allValues.length >= 0) {
        alert("❗ 모든 항목을 입력해주세요.");
        isAllSaved = false;
        break;
      }
      continue;
    }

    const ref = collection(db, "users", currentUser.uid, "stocks");
    try {
      if (row.dataset.isNew === "true") {
        await addDoc(ref, { ...updateData, createdAt: new Date() });
      } else if (id) {
        const docRef = doc(ref, id);
        await updateDoc(docRef, updateData);
      }
    } catch (error) {
      console.error("저장 중 오류 발생:", error);
      alert("데이터 저장에 실패했습니다.");
      isAllSaved = false;
    }
  }

  if (isAllSaved) {
    alert("✅ 모든 변경사항이 저장되었습니다!");
    loadStocks(currentUser);
  }
});

async function handleDelete(id) {
  if (!currentUser) return;
  if (!confirm("정말 삭제하시겠습니까?")) return;
  const docRef = doc(db, "users", currentUser.uid, "stocks", id);
  await deleteDoc(docRef);
  loadStocks(currentUser);
}
