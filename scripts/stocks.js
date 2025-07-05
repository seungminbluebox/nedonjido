//  scripts/stocks.js
import { auth, db } from "../firebase-config.js";
import {
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { fetchPrices, updateExchangeRateUI, exchangeRate } from "./utils.js";
const spinner = document.getElementById("loading-spinner");
// 로그인 되어 있다면 바로 불러오기
auth.onAuthStateChanged((user) => {
  if (user) {
    loadStocks();
  } else {
    // ✅ 로그아웃 상태일 때 테이블 비우고 스피너 숨기기
    const tbody = document.querySelector("#stock-table tbody");
    tbody.innerHTML = "";
    spinner.style.display = "none";
  }
});

// scripts/stocks.js

// ... 다른 코드는 그대로 ...

async function loadStocks() {
  const user = auth.currentUser;
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
    const tbody = document.querySelector("#stock-table tbody");
    tbody.innerHTML = "";

    const stockData = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const tickers = stockData.map((s) => s.ticker);
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
    await updateExchangeRateUI();
  } catch (error) {
    console.error("데이터 로딩 중 에러 발생:", error);
    alert("데이터를 불러오는 데 실패했습니다. 다시 시도해 주세요.");
  } finally {
    spinner.style.display = "none";
  }
}

document.getElementById("save-all").addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return alert("로그인이 필요합니다.");

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
      alert("❗ 모든 항목을 입력해주세요.");
      continue;
    }

    const ref = collection(db, "users", user.uid, "stocks");

    if (row.dataset.isNew === "true") {
      await addDoc(ref, {
        ...updateData,
        createdAt: new Date(),
      });
    } else if (id) {
      const docRef = doc(ref, id);
      await updateDoc(docRef, updateData);
    }
  }

  alert("✅ 모든 변경사항이 저장되었습니다!");
  loadStocks(); // 최신 반영
});

// 삭제 핸들러
async function handleDelete(id) {
  const user = auth.currentUser;
  if (!user) return;

  const docRef = doc(db, "users", user.uid, "stocks", id);
  await deleteDoc(docRef);
  if (!confirm("정말 삭제하시겠습니까?")) return;
  loadStocks(); // 다시 불러오기
}
document.getElementById("add-row").addEventListener("click", () => {
  const tbody = document.querySelector("#stock-table tbody");
  const row = document.createElement("tr");

  const inputs = {};
  ["ticker", "name", "quantity", "avgPrice"].forEach((key) => {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.placeholder = key;
    input.type = key === "quantity" || key === "avgPrice" ? "number" : "text";
    input.step = "any";
    input.dataset.key = key; // ✅ 추가
    cell.appendChild(input);
    row.appendChild(cell);
    inputs[key] = input;
  });

  // 통화 드롭다운
  const currencyCell = document.createElement("td");
  const select = document.createElement("select");
  ["", "KRW", "USD"].forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt || "통화 선택";
    select.appendChild(option);
  });
  select.dataset.key = "currency"; // ✅ 여기에 반드시 추가
  currencyCell.appendChild(select);
  row.appendChild(currencyCell);

  // 현재가, 평가액, 수익률 빈 칸
  const currentCell = document.createElement("td");
  const evalCell = document.createElement("td");
  const profitCell = document.createElement("td");

  currentCell.textContent = "-";
  evalCell.textContent = "-";
  profitCell.textContent = "-";

  row.appendChild(currentCell);
  row.appendChild(evalCell);
  row.appendChild(profitCell);
  row.dataset.isNew = "true"; // 새로 추가된 줄 표시

  tbody.appendChild(row);
});
