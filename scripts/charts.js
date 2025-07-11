import { auth, db } from "../firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { checkAuthState } from "./auth.js";
import { fetchPrices, exchangeRate } from "./utils.js";

let accountTrendChart,
  portfolioRatioChart,
  monthlyDividendsChart,
  yearlyAverageDividendsChart;

checkAuthState(loadAllChartData);

async function loadAllChartData(user) {
  if (!user) return;
  try {
    const stocksRef = collection(db, "users", user.uid, "stocks");
    const depositsRef = collection(db, "users", user.uid, "deposits");
    const monthlyAssetsRef = doc(
      db,
      "users",
      user.uid,
      "manualData",
      "monthlyAssets"
    );
    const dividendsRef = collection(db, "users", user.uid, "dividends");

    const [stocksSnap, depositsSnap, monthlyAssetsSnap, dividendsSnap] =
      await Promise.all([
        getDocs(stocksRef),
        getDocs(depositsRef),
        getDoc(monthlyAssetsRef),
        getDocs(dividendsRef),
      ]);

    const stocksData = stocksSnap.docs.map((doc) => doc.data());
    const depositsData = depositsSnap.docs.map((doc) => doc.data());
    const savedMonthlyAssets = monthlyAssetsSnap.exists()
      ? monthlyAssetsSnap.data().assets || []
      : [];
    const dividendsData = dividendsSnap.docs.map((doc) => doc.data());

    const tickers = stocksData.map((s) => s.ticker).filter((t) => t);
    await fetchPrices(tickers.length > 0 ? tickers : ["USD_KRW"]);

    renderAccountTrendChart(
      processDataForAccountTrend(depositsData, savedMonthlyAssets)
    );
    renderPortfolioRatioChart(
      processDataForPortfolioRatio(stocksData, await fetchPrices(tickers))
    );
    renderMonthlyDividendsChart(processDataForMonthlyDividends(dividendsData));
    // ✅ 새로운 월평균 배당금 차트를 그립니다.
    renderYearlyAverageDividendsChart(
      processDataForYearlyAverageDividends(dividendsData)
    );
  } catch (error) {
    console.error("차트 데이터 로딩 실패:", error);
  }
}

// --- 데이터 가공 함수들 ---
function processDataForAccountTrend(deposits, savedAssets) {
  /* 기존과 동일 */
  const monthlyDeposits = {};
  deposits.forEach((d) => {
    const month = d.date.substring(0, 7);
    if (!monthlyDeposits[month]) monthlyDeposits[month] = 0;
    monthlyDeposits[month] += d.amount;
  });
  const sortedAssets = savedAssets.sort((a, b) =>
    a.month.localeCompare(b.month)
  );
  const labels = [],
    totalAssetData = [],
    cumulativeDepositData = [];
  let cumulativeDeposit = 0;
  sortedAssets.forEach((assetData) => {
    const { month, asset } = assetData;
    const monthlyDeposit = monthlyDeposits[month] || 0;
    cumulativeDeposit += monthlyDeposit;
    labels.push(month);
    totalAssetData.push(asset);
    cumulativeDepositData.push(cumulativeDeposit);
  });
  return { labels, totalAssetData, cumulativeDepositData };
}
function processDataForPortfolioRatio(stocks, prices) {
  /* 기존과 동일 */
  const portfolio = {};
  stocks.forEach((stock) => {
    const price = prices[stock.ticker.toUpperCase()] || 0;
    let evaluationAmount = (stock.quantity || 0) * price;
    if (stock.currency === "USD" && exchangeRate) {
      evaluationAmount *= exchangeRate;
    }
    if (!portfolio[stock.name]) {
      portfolio[stock.name] = 0;
    }
    portfolio[stock.name] += evaluationAmount;
  });
  const labels = Object.keys(portfolio);
  const data = Object.values(portfolio);
  return { labels, data };
}
function processDataForMonthlyDividends(dividends) {
  /* 기존과 동일 */
  const monthlyDividends = {};
  dividends.forEach((d) => {
    const month = d.date.substring(0, 7);
    if (!monthlyDividends[month]) {
      monthlyDividends[month] = 0;
    }
    let amountKRW = d.amount || 0;
    if (d.currency === "USD" && exchangeRate) {
      amountKRW *= exchangeRate;
    }
    monthlyDividends[month] += amountKRW;
  });
  const sortedMonths = Object.keys(monthlyDividends).sort();
  const labels = sortedMonths;
  const data = sortedMonths.map((month) => monthlyDividends[month]);
  return { labels, data };
}

// ✅ 새로운 월평균 배당금 데이터 가공 함수
function processDataForYearlyAverageDividends(dividends) {
  const yearlyDividends = {};
  dividends.forEach((d) => {
    const year = d.date.substring(0, 4); // 'YYYY'
    if (!yearlyDividends[year]) {
      yearlyDividends[year] = 0;
    }
    let amountKRW = d.amount || 0;
    if (d.currency === "USD" && exchangeRate) {
      amountKRW *= exchangeRate;
    }
    yearlyDividends[year] += amountKRW;
  });
  const sortedYears = Object.keys(yearlyDividends).sort();
  const labels = sortedYears;
  // 연도별 총배당금을 12로 나누어 월평균을 계산합니다.
  const data = sortedYears.map((year) => yearlyDividends[year] / 12);
  return { labels, data };
}

// --- 차트 렌더링 함수들 ---
function renderAccountTrendChart(chartData) {
  /* 기존과 동일 */
  const ctx = document.getElementById("account-trend-chart").getContext("2d");
  if (accountTrendChart) accountTrendChart.destroy();
  accountTrendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "계좌 총액",
          data: chartData.totalAssetData,
          borderColor: "rgba(231, 76, 60, 1)",
          backgroundColor: "rgba(231, 76, 60, 0.2)",
          fill: true,
          tension: 0.1,
        },
        {
          label: "누적 입금액",
          data: chartData.cumulativeDepositData,
          borderColor: "rgba(52, 152, 219, 1)",
          backgroundColor: "rgba(52, 152, 219, 0.2)",
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: {
            callback: (value) => value.toLocaleString() + " 원",
            font: { size: 25 }, // ✅ y축 눈금 폰트 크기
          },
        },
        x: { ticks: { font: { size: 25 } } }, // ✅ x축 눈금 폰트 크기
      },
      plugins: {
        legend: { labels: { font: { size: 14 } } },
        tooltip: {
          titleFont: { size: 25 }, // 툴팁 제목 폰트
          bodyFont: { size: 25 }, // 툴팁 본문 폰트
        },
      },
    },
  });
}
function renderPortfolioRatioChart(chartData) {
  /* 기존과 동일 */
  const ctx = document.getElementById("portfolio-ratio-chart").getContext("2d");
  if (portfolioRatioChart) portfolioRatioChart.destroy();
  portfolioRatioChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "포트폴리오 비율",
          data: chartData.data,
          backgroundColor: [
            "rgba(255, 99, 132, 0.8)",
            "rgba(54, 162, 235, 0.8)",
            "rgba(255, 206, 86, 0.8)",
            "rgba(75, 192, 192, 0.8)",
            "rgba(153, 102, 255, 0.8)",
            "rgba(255, 159, 64, 0.8)",
            "rgba(46, 204, 113, 0.8)",
            "rgba(241, 196, 15, 0.8)",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { font: { size: 25 } }, // ✅ 범례 폰트 크기
        },
        tooltip: {
          titleFont: { size: 25 }, // 툴팁 제목 폰트
          bodyFont: { size: 25 }, // 툴팁 본문 폰트
        },
      },
    },
  });
}
function renderMonthlyDividendsChart(chartData) {
  const ctx = document
    .getElementById("monthly-dividends-chart")
    .getContext("2d");
  if (monthlyDividendsChart) monthlyDividendsChart.destroy();
  monthlyDividendsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "월별 배당금 (원화 환산)",
          data: chartData.data,
          backgroundColor: "rgba(26, 188, 156, 0.7)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false, // ✅ 크기 조정을 위해 추가
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => value.toLocaleString() + " 원",
            font: { size: 25 }, // ✅ y축 눈금 폰트 크기
          },
        },
        x: { ticks: { font: { size: 25 } } }, // ✅ x축 눈금 폰트 크기
      },
      plugins: {
        legend: { labels: { font: { size: 25 } } }, // ✅ 범례 폰트 크기
        tooltip: {
          titleFont: { size: 25 }, // 툴팁 제목 폰트
          bodyFont: { size: 25 }, // 툴팁 본문 폰트
        },
      },
    },
  });
}

// ✅ 새로운 월평균 배당금 차트 렌더링 함수
function renderYearlyAverageDividendsChart(chartData) {
  const ctx = document
    .getElementById("yearly-average-dividends-chart")
    .getContext("2d");
  if (yearlyAverageDividendsChart) yearlyAverageDividendsChart.destroy();
  yearlyAverageDividendsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: "월평균 배당금 (원화 환산)",
          data: chartData.data,
          backgroundColor: "rgba(142, 68, 173, 0.7)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => value.toLocaleString() + " 원",
            font: { size: 25 }, // ✅ y축 눈금 폰트 크기
          },
        },
        x: { ticks: { font: { size: 25 } } }, // ✅ x축 눈금 폰트 크기
      },
      plugins: {
        legend: { labels: { font: { size: 25 } } }, // ✅ 범례 폰트 크기
        tooltip: {
          titleFont: { size: 25 }, // 툴팁 제목 폰트
          bodyFont: { size: 25 }, // 툴팁 본문 폰트
        },
      },
    },
  });
}
