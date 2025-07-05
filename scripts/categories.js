import { auth, db } from "../firebase-config.js";
import { checkAuthState } from "./auth.js";
import {
  doc,
  setDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let userId;

checkAuthState((user) => {
  userId = user.uid;
  loadAllCategories();
});

const CATEGORY_KEYS = {
  SECURITIES: "securities",
  ACCOUNT_TYPES: "accountTypes",
  STOCKS: "stocks",
};

async function loadAllCategories() {
  if (!userId) return;
  const docRef = doc(db, "users", userId, "categories", "user_categories");
  const docSnap = await getDoc(docRef);

  const data = docSnap.exists() ? docSnap.data() : {};
  renderCategories(CATEGORY_KEYS.SECURITIES, data.securities || []);
  renderCategories(CATEGORY_KEYS.ACCOUNT_TYPES, data.accountTypes || []);
  renderCategories(CATEGORY_KEYS.STOCKS, data.stocks || []);
}

function renderCategories(type, items) {
  // ✅ 'accountTypes'의 ID를 'account-types'로 올바르게 수정
  const listId =
    type === CATEGORY_KEYS.ACCOUNT_TYPES
      ? "account-types-list"
      : `${type}-list`;
  const listElement = document.getElementById(listId);
  if (!listElement) return;

  listElement.innerHTML = "";

  items.forEach((item) => {
    const itemEl = document.createElement("div");
    itemEl.className = "category-item";

    const displayText =
      type === CATEGORY_KEYS.STOCKS ? `${item.name} (${item.ticker})` : item;
    const identifier = type === CATEGORY_KEYS.STOCKS ? item.name : item;

    itemEl.textContent = displayText;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-cat-btn";
    deleteBtn.textContent = "x";
    deleteBtn.onclick = () => handleDelete(type, identifier);

    itemEl.appendChild(deleteBtn);
    listElement.appendChild(itemEl);
  });
}

async function handleAdd(type, newItem) {
  if (!newItem || !userId) return;

  const docRef = doc(db, "users", userId, "categories", "user_categories");
  const docSnap = await getDoc(docRef);

  const currentData = docSnap.exists()
    ? docSnap.data()
    : { securities: [], accountTypes: [], stocks: [] };
  const key = type;

  // ✅ currentData[key]가 배열이 아닐 경우, 빈 배열로 초기화해주는 코드 추가
  if (!Array.isArray(currentData[key])) {
    currentData[key] = [];
  }

  const isDuplicate =
    type === CATEGORY_KEYS.STOCKS
      ? currentData[key].some(
          (i) => i.name === newItem.name || i.ticker === newItem.ticker
        )
      : currentData[key].includes(newItem);

  if (!isDuplicate) {
    currentData[key].push(newItem);
    await setDoc(docRef, currentData, { merge: true });
    renderCategories(type, currentData[key]);
  } else {
    alert("이미 존재하는 항목입니다.");
  }
}

async function handleDelete(type, identifier) {
  if (!identifier || !userId) return;
  const docRef = doc(db, "users", userId, "categories", "user_categories");
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const currentData = docSnap.data();
    const key = type;

    if (!Array.isArray(currentData[key])) return; // 삭제할 대상이 없으면 종료

    currentData[key] =
      type === CATEGORY_KEYS.STOCKS
        ? currentData[key].filter((item) => item.name !== identifier)
        : currentData[key].filter((item) => item !== identifier);

    await setDoc(docRef, currentData);
    renderCategories(type, currentData[key]);
  }
}

// 폼 이벤트 리스너 설정 (이하 동일)
function setupFormListener(formId, type, itemCreator) {
  const form = document.getElementById(formId);
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const newItem = itemCreator(e.target);
      if (newItem) {
        handleAdd(type, newItem);
        e.target.reset();
      }
    });
  }
}

setupFormListener("add-securities-form", CATEGORY_KEYS.SECURITIES, (target) =>
  target.querySelector("input").value.trim()
);
setupFormListener(
  "add-account-type-form",
  CATEGORY_KEYS.ACCOUNT_TYPES,
  (target) => target.querySelector("input").value.trim()
);
setupFormListener("add-stock-form", CATEGORY_KEYS.STOCKS, (target) => {
  const name = target.querySelector("#new-stock-name").value.trim();
  const ticker = target
    .querySelector("#new-stock-ticker")
    .value.trim()
    .toUpperCase();
  return name && ticker ? { name, ticker } : null;
});
