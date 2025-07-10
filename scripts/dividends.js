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
import { checkAuthState } from "./auth.js";
import { exchangeRate, fetchPrices } from "./utils.js";

// 카테고리 데이터를 저장할 변수
let userStocks = [];
let currentUser = null;

const spinner = document.getElementById("loading-spinner");

// 페이지 시작: 로그인 확인 -> 카테고리 로드 -> 배당 내역 로드
checkAuthState(async (user) => {
  currentUser = user;
  const catDocRef = doc(db, "users", user.uid, "categories", "user_categories");
  const docSnap = await getDoc(catDocRef);
  if (docSnap.exists()) {
    userStocks = docSnap.data().stocks || [];
  }
  loadDividends(user);
});

// dividends.js 파일의 loadDividends 함수를 아래 코드로 교체

async function loadDividends(user) {
  if (!user) return;
  spinner.style.display = "block";
  const tbody = document.querySelector("#stock-table tbody");
  tbody.innerHTML = "";

  const totalKRWEl = document.getElementById("total-krw-dividends");
  const usdAmountEl = document.getElementById("usd-amount");
  const usdToKrwEl = document.getElementById("usd-to-krw-conversion");
  const totalDividendsEl = document.getElementById("total-dividends");

  try {
    const catDocRef = doc(
      db,
      "users",
      user.uid,
      "categories",
      "user_categories"
    );
    const [catSnap, _] = await Promise.all([
      getDoc(catDocRef),
      fetchPrices(["USD_KRW"]),
    ]);
    console.log("환율 정보:", _);

    if (catSnap.exists()) {
      userStocks = catSnap.data().stocks || [];
    }

    const ref = collection(db, "users", user.uid, "dividends");
    const q = query(ref, orderBy("date", "asc"), orderBy("createdAt", "asc"));
    const snapshot = await getDocs(q);

    const dividendsData = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    let totalKRW = 0;
    let totalUSD = 0;

    dividendsData.forEach((data) => {
      const row = createDividendRow(data);
      tbody.appendChild(row);
      const amount = data.amount || 0;
      if (data.currency === "USD") {
        totalUSD += amount;
      } else if (data.currency === "KRW") {
        totalKRW += amount;
      }
    });

    const totalInKRW = totalKRW + totalUSD * (exchangeRate || 0);

    totalKRWEl.textContent = `${Math.round(totalKRW).toLocaleString()} 원`;
    usdAmountEl.textContent = `$ ${totalUSD.toFixed(2).toLocaleString()}`;
    usdToKrwEl.textContent = `(${Math.round(
      totalUSD * (exchangeRate || 0)
    ).toLocaleString()} 원)`;
    totalDividendsEl.textContent = `${Math.round(
      totalInKRW
    ).toLocaleString()} 원`;
  } catch (error) {
    console.error("배당 내역 로딩 실패:", error);
    totalKRWEl.textContent = "오류";
    usdAmountEl.textContent = "오류";
    usdToKrwEl.textContent = ""; // 변환값은 비워둡니다.
    totalDividendsEl.textContent = "오류";
  } finally {
    spinner.style.display = "none";
  }
}

// 테이블의 한 행(row)을 만드는 헬퍼 함수
function createDividendRow(data = {}) {
  const row = document.createElement("tr");

  const dateCell = document.createElement("td");
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = data.date || "";
  dateInput.dataset.key = "date";
  dateInput.dataset.id = data.id || "";
  dateCell.appendChild(dateInput);

  const nameCell = createDropdownCell(
    userStocks.map((s) => s.name),
    data.stockName,
    "stockName",
    data.id
  );

  const amountCell = document.createElement("td");
  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.placeholder = "금액 입력";
  amountInput.value = data.amount || "";
  amountInput.dataset.key = "amount";
  amountInput.dataset.id = data.id || "";
  amountCell.appendChild(amountInput);

  const currencyCell = createDropdownCell(
    ["KRW", "USD"],
    data.currency,
    "currency",
    data.id
  );

  const deleteCell = document.createElement("td");
  if (data.id) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.onclick = () => handleDelete(data.id);
    deleteCell.appendChild(deleteBtn);
  }

  row.appendChild(dateCell);
  row.appendChild(nameCell);
  row.appendChild(amountCell);
  row.appendChild(currencyCell);
  row.appendChild(deleteCell);

  return row;
}

// 드롭다운 셀을 만드는 헬퍼 함수
function createDropdownCell(options, selectedValue, key, id) {
  const cell = document.createElement("td");
  const select = document.createElement("select");
  select.dataset.key = key;
  select.dataset.id = id || "";

  const defaultOption = document.createElement("option");
  defaultOption.textContent = "선택";
  defaultOption.value = "";
  select.appendChild(defaultOption);

  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    if (opt === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  cell.appendChild(select);
  return cell;
}

// '새 내역 추가' 버튼 클릭 이벤트
document.getElementById("add-row").addEventListener("click", () => {
  const tbody = document.querySelector("#stock-table tbody");
  const newRow = createDividendRow();
  newRow.dataset.isNew = "true";
  tbody.appendChild(newRow);
});

// '변경사항 저장' 버튼 (버그 수정 버전)
document.getElementById("save-all").addEventListener("click", async () => {
  if (!currentUser) return alert("로그인이 필요합니다.");

  const promises = [];
  const rows = document.querySelectorAll("#stock-table tbody tr");
  let hasInvalidRow = false;

  for (const row of rows) {
    const updateData = {};
    let id = null;

    row.querySelectorAll("input, select").forEach((el) => {
      const key = el.dataset.key;
      id = id || el.dataset.id;
      if (el.type === "number") {
        updateData[key] = parseFloat(el.value);
      } else {
        updateData[key] = el.value.trim();
      }
    });

    const isRowEmpty =
      !updateData.date &&
      !updateData.stockName &&
      !updateData.currency &&
      isNaN(updateData.amount);

    // ✅ 만약 완전히 빈 행이라면, 조용히 다음 행으로 건너뜁니다.
    if (isRowEmpty) {
      hasInvalidRow = true;
      break; // 즉시 반복 중단
    }

    const isRowValid =
      updateData.date &&
      updateData.stockName &&
      updateData.currency &&
      !isNaN(updateData.amount) &&
      updateData.amount !== 0;

    if (!isRowValid) {
      hasInvalidRow = true;
      break;
    }

    const ref = collection(db, "users", currentUser.uid, "dividends");
    if (row.dataset.isNew === "true") {
      updateData.createdAt = new Date();
      updateData.amount = updateData.amount || 0;
      promises.push(addDoc(ref, updateData));
    } else if (id) {
      const docRef = doc(ref, id);
      updateData.amount = updateData.amount || 0;
      promises.push(updateDoc(docRef, updateData));
    }
  }

  if (hasInvalidRow) {
    alert(
      "❗ 내용이 있는 행은 배당일, 종목명, 세후 배당금(0 제외), 통화를 모두 입력해야 합니다."
    );
    return;
  }

  if (promises.length === 0) {
    return;
  }

  try {
    await Promise.all(promises);
    alert("✅ 모든 변경사항이 저장되었습니다.");
  } catch (error) {
    console.error("배당 내역 저장 실패:", error);
    alert("데이터 저장 중 오류가 발생했습니다.");
  } finally {
    loadDividends(currentUser);
  }
});
async function handleDelete(id) {
  if (!currentUser || !id) return;
  if (!confirm("정말 이 내역을 삭제하시겠습니까?")) return;

  try {
    const docRef = doc(db, "users", currentUser.uid, "dividends", id);
    await deleteDoc(docRef);
    alert("✅ 배당 내역이 삭제되었습니다.");
    loadDividends(currentUser);
  } catch (error) {
    console.error("배당 내역 삭제 실패:", error);
    alert("배당 내역 삭제 중 오류가 발생했습니다.");
  }
}
