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

// 카테고리 데이터를 저장할 변수
let securitiesCategories = [];
let accountTypeCategories = [];
let currentUser = null;

const spinner = document.getElementById("loading-spinner");

// 페이지 시작: 로그인 확인 -> 카테고리 로드 -> 입출금 내역 로드
checkAuthState(async (user) => {
  currentUser = user;
  const catDocRef = doc(db, "users", user.uid, "categories", "user_categories");
  const docSnap = await getDoc(catDocRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    securitiesCategories = data.securities || [];
    accountTypeCategories = data.accountTypes || [];
  }
  loadDeposits(user);
});

// 입출금 내역을 불러와 테이블에 그리는 함수
async function loadDeposits(user) {
  if (!user) return;
  spinner.style.display = "block";
  const tbody = document.querySelector("#stock-table tbody");
  tbody.innerHTML = "";

  try {
    const ref = collection(db, "users", user.uid, "deposits");

    // ✅ 정렬 기준을 'date' 필드의 오름차순('asc')으로 변경합니다.
    // 만약 날짜가 같다면, 먼저 생성된(createdAt) 항목이 위로 오도록 2차 정렬을 추가하여 안정성을 높입니다.
    const q = query(ref, orderBy("date", "asc"), orderBy("createdAt", "asc"));

    const snapshot = await getDocs(q);

    // ❌ 데이터베이스에서 직접 정렬하므로, JS에서의 추가 정렬 코드는 삭제합니다.

    snapshot.docs.forEach((doc) => {
      const data = { id: doc.id, ...doc.data() };
      const row = createDepositRow(data);
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error("입출금 내역 로딩 실패:", error);
  } finally {
    spinner.style.display = "none";
  }
}

// 테이블의 한 행(row)을 만드는 헬퍼 함수 (수정 없음)
function createDepositRow(data = {}) {
  const row = document.createElement("tr");
  const dateCell = document.createElement("td");
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = data.date || "";
  dateInput.dataset.key = "date";
  dateInput.dataset.id = data.id || "";
  dateCell.appendChild(dateInput);
  const securitiesCell = createDropdownCell(
    securitiesCategories,
    data.securities,
    "securities",
    data.id
  );
  const accountTypeCell = createDropdownCell(
    accountTypeCategories,
    data.accountType,
    "accountType",
    data.id
  );
  const amountCell = document.createElement("td");
  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.placeholder = "출금은 마이너스(-)로 입력";
  amountInput.value = data.amount || "";
  amountInput.dataset.key = "amount";
  amountInput.dataset.id = data.id || "";
  amountCell.appendChild(amountInput);
  const noteCell = document.createElement("td");
  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.placeholder = "내용";
  noteInput.value = data.note || "";
  noteInput.dataset.key = "note";
  noteInput.dataset.id = data.id || "";
  noteCell.appendChild(noteInput);
  const deleteCell = document.createElement("td");
  if (data.id) {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.onclick = () => handleDelete(data.id);
    deleteCell.appendChild(deleteBtn);
  }
  row.appendChild(dateCell);
  row.appendChild(securitiesCell);
  row.appendChild(accountTypeCell);
  row.appendChild(amountCell);
  row.appendChild(noteCell);
  row.appendChild(deleteCell);
  return row;
}

// 드롭다운 셀을 만드는 헬퍼 함수 (수정 없음)
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

// '새 내역 추가' 버튼 클릭 이벤트 (수정 없음)
document.getElementById("add-row").addEventListener("click", () => {
  const tbody = document.querySelector("#stock-table tbody");
  const newRow = createDepositRow();
  newRow.dataset.isNew = "true";
  tbody.appendChild(newRow);
});

// '변경사항 저장' 버튼 (최종 수정 버전)
document.getElementById("save-all").addEventListener("click", async () => {
  if (!currentUser) return alert("로그인이 필요합니다.");

  const promises = [];
  const rows = document.querySelectorAll("#stock-table tbody tr");
  let hasInvalidRow = false;

  for (const row of rows) {
    const updateData = {};
    let id = null;

    // 1. 각 행의 데이터를 정확하게 수집합니다.
    row.querySelectorAll("input, select").forEach((el) => {
      const key = el.dataset.key;
      id = id || el.dataset.id;
      if (el.type === "number") {
        // ✅ 빈 숫자 입력칸은 0이 아닌 '숫자가 아님(NaN)'으로 처리합니다.
        updateData[key] = parseFloat(el.value);
      } else {
        updateData[key] = el.value.trim();
      }
    });

    // 2. 이 행이 진짜로 비어있는지 확인합니다.
    const isRowEmpty =
      !updateData.date &&
      !updateData.securities &&
      !updateData.accountType &&
      isNaN(updateData.amount) && // ✅ 금액이 숫자가 아닐 때(비어있을 때)를 확인
      !updateData.note;

    // 만약 완전히 빈 행이라면, 조용히 건너뜁니다.
    if (isRowEmpty) {
      hasInvalidRow = true; // 유효하지 않은 행을 발견하면 플래그 설정
      break; // 즉시 반복 중단
    }

    // 3. 내용이 조금이라도 있는 행이 유효한지 확인합니다.
    const isRowValid =
      updateData.date &&
      updateData.securities &&
      updateData.accountType &&
      !isNaN(updateData.amount) && // ✅ 금액이 숫자이고,
      updateData.amount !== 0; // 0이 아닐 때만 유효

    if (!isRowValid) {
      hasInvalidRow = true; // 유효하지 않은 행을 발견하면 플래그 설정
      break; // 즉시 반복 중단
    }

    // 4. 유효한 행이라면 저장할 작업(Promise)으로 만듭니다.
    const ref = collection(db, "users", currentUser.uid, "deposits");
    if (row.dataset.isNew === "true") {
      updateData.createdAt = new Date();
      // ✅ DB에 저장할 땐 NaN을 0으로 바꿔서 저장합니다.
      updateData.amount = updateData.amount || 0;
      promises.push(addDoc(ref, updateData));
    } else if (id) {
      const docRef = doc(ref, id);
      updateData.amount = updateData.amount || 0;
      promises.push(updateDoc(docRef, updateData));
    }
  }

  // 5. 유효하지 않은 행이 있었다면, 전체 저장을 멈추고 알립니다.
  if (hasInvalidRow) {
    alert(
      "❗ 내용이 있는 행은 날짜, 증권사, 계좌 종류, 금액(0 제외)을 모두 입력해야 합니다."
    );
    return;
  }

  // 6. 저장할 작업이 하나도 없다면 (모든 행이 비어있었다면) 조용히 종료합니다.
  if (promises.length === 0) {
    return;
  }

  // 7. 모든 유효한 작업을 한꺼번에 실행하고, 성공 시에만 메시지를 보여줍니다.
  try {
    await Promise.all(promises);
    alert("✅ 모든 변경사항이 저장되었습니다.");
  } catch (error) {
    console.error("저장 중 오류 발생:", error);
    alert("데이터 저장 중 오류가 발생했습니다.");
  } finally {
    loadDeposits(currentUser);
  }
});
// 삭제 핸들러 (수정 없음)
async function handleDelete(id) {
  if (!currentUser || !id) return;
  if (!confirm("정말 이 내역을 삭제하시겠습니까?")) return;

  try {
    const docRef = doc(db, "users", currentUser.uid, "deposits", id);
    await deleteDoc(docRef);
    loadDeposits(currentUser);
  } catch (error) {
    console.error("삭제 실패:", error);
  }
}
