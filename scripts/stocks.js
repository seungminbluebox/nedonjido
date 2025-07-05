//  scripts/stocks.js
import { auth, db } from "../firebase-config.js";
// ✅ getDoc을 추가로 import 합니다.
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

let userStocks = []; // ✅ 종목 카테고리 데이터를 저장할 변수
let currentUser = null; // ✅ 현재 사용자 정보를 담을 전역 변수

checkAuthState(async (user) => {
  currentUser = user; // ✅ 로그인 시 전역 변수에 사용자 정보 저장
  const catDocRef = doc(db, "users", user.uid, "categories", "user_categories");
  const docSnap = await getDoc(catDocRef);
  if (docSnap.exists()) {
    userStocks = docSnap.data().stocks || [];
  }
  loadStocks(user);
});
const spinner = document.getElementById("loading-spinner");

async function loadStocks(user) {
  if (!user) return;

  // ✅ 1. 데이터 로딩 시작 -> 스피너 보이기
  spinner.style.display = "block";
  const tbody = document.querySelector("#stock-table tbody");
  tbody.innerHTML = ""; // 기존 테이블 내용 비우기

  try {
    // ✅ 2. 에러 처리를 위해 try 블록으로 감싸기
    const ref = collection(db, "users", user.uid, "stocks");
    const q = query(ref, orderBy("createdAt"));
    const snapshot = await getDocs(q);

    const stockData = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const tickers = stockData.map((s) => s.ticker);

    // ✅ 요청할 티커가 없을 경우, API를 호출하지 않고 함수를 종료합니다.
    if (tickers.length === 0) {
      spinner.style.display = "none"; // 스피너 숨기는 것을 잊지 마세요.
      return;
    }

    const prices = await fetchPrices(tickers);

    for (const data of stockData) {
      const row = document.createElement("tr");

      // 🔹 입력 필드: ticker, name, quantity, avgPrice
      ["ticker", "name", "quantity", "avgPrice"].forEach((key) => {
        const cell = document.createElement("td");
        const input = document.createElement("input");
        let value = data[key];
        if (key === "ticker") {
          value = value.replace(/\.KS$/i, "").replace(/\.KQ$/i, "");
        }
        input.value = value;
        input.type =
          key === "quantity" || key === "avgPrice" ? "number" : "text";
        input.step = "any";
        input.dataset.id = data.id;
        input.dataset.key = key;

        cell.appendChild(input);
        row.appendChild(cell);
      });

      // 🔹 통화 드롭다운
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

      // 🔹 현재가 / 평가액 / 수익률
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

      // 🔹 삭제 버튼
      const delCell = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️";
      delBtn.onclick = () => handleDelete(data.id);
      delCell.appendChild(delBtn);
      row.appendChild(delCell);

      tbody.appendChild(row);
    }
  } catch (error) {
    console.error("데이터 로딩 중 에러 발생:", error);
    alert("데이터를 불러오는 데 실패했습니다. 다시 시도해 주세요.");
  } finally {
    spinner.style.display = "none";
  }
}

document.getElementById("save-all").addEventListener("click", async () => {
  // ✅ 전역 변수인 currentUser를 사용합니다.
  if (!currentUser)
    return alert("사용자 정보가 없습니다. 다시 로그인해주세요.");
  let isAllSaved = true; // ✅ 모든 저장이 성공했는지 확인하는 '깃발'

  const rows = document.querySelectorAll("#stock-table tbody tr");

  for (const row of rows) {
    // ... (for 루프 안의 코드는 그대로)
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
      alert("❗ 모든 항목을 입력해주세요.");
      isAllSaved = false; // ❌ 깃발을 '실패'로 변경
      continue; // 현재 행의 입력이 불완전하면 다음 행으로 넘어갑니다.
    }

    // ✅ 여기서도 currentUser.uid를 사용합니다.
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
      isAllSaved = false; // ❌ 데이터베이스 오류 시에도 '실패'로 변경
    }
  }

  if (isAllSaved) {
    alert("✅ 모든 변경사항이 저장되었습니다!");
    loadStocks(currentUser);
  }
});

// 삭제 핸들러
async function handleDelete(id) {
  if (!currentUser) return;

  if (!confirm("정말 삭제하시겠습니까?")) return;

  const docRef = doc(db, "users", currentUser.uid, "stocks", id);
  await deleteDoc(docRef);

  loadStocks(currentUser);
}

document.getElementById("add-row").addEventListener("click", () => {
  const tbody = document.querySelector("#stock-table tbody");
  const row = document.createElement("tr");
  row.dataset.isNew = "true";

  // 티커, 수량, 평단가 셀 (기존 input 유지)
  const tickerCell = document.createElement("td");
  const tickerInput = document.createElement("input");
  tickerInput.placeholder = "티커";
  tickerInput.dataset.key = "ticker";
  tickerCell.appendChild(tickerInput);

  // ✅ 종목명 셀 (드롭다운으로 변경)
  const nameCell = document.createElement("td");
  const nameSelect = document.createElement("select");
  nameSelect.dataset.key = "name";

  // 드롭다운 기본 옵션
  const defaultOption = document.createElement("option");
  defaultOption.textContent = "종목 선택";
  defaultOption.value = "";
  nameSelect.appendChild(defaultOption);

  // 카테고리에서 불러온 종목들로 옵션 채우기
  userStocks.forEach((stock) => {
    const option = document.createElement("option");
    option.textContent = stock.name;
    option.value = stock.name; // 값은 종목명
    // data-* 속성에 티커 정보를 숨겨둡니다.
    option.dataset.ticker = stock.ticker;
    nameSelect.appendChild(option);
  });
  nameCell.appendChild(nameSelect);

  // ✅ 종목명 선택 시 티커 자동 입력
  nameSelect.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    const ticker = selectedOption.dataset.ticker || "";
    // 같은 행(row)에 있는 티커 input을 찾아서 값을 채워줍니다.
    row.querySelector('input[data-key="ticker"]').value = ticker;
  });

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

  // 생성된 셀들을 행에 추가
  row.appendChild(tickerCell);

  row.appendChild(nameCell); // 종목명 드롭다운
  row.appendChild(quantityCell);
  row.appendChild(avgPriceCell);

  // ... (통화, 현재가, 평가액, 수익률, 삭제 버튼 셀 생성 로직은 기존과 유사하게 추가)

  // 통화 드롭다운
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

  // 빈 셀들
  for (let i = 0; i < 4; i++) {
    row.insertCell();
  }

  tbody.appendChild(row);
});
