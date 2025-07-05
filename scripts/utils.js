//sripts/utils.js
export let exchangeRate = null;

export async function fetchPrices(symbolsArray) {
  const symbols = symbolsArray.join(",");
  try {
    const res = await fetch(
      `https://fetchyfinance.netlify.app/.netlify/functions/getPrice?symbol=${symbols}`
    );
    const data = await res.json(); // { AAPL: ..., USD_KRW: ... }

    // ✅ 전역 환율 업데이트
    if (data.USD_KRW) {
      exchangeRate = Math.round(data.USD_KRW * 100) / 100;
      // exchangeRate = data.USD_KRW;
    }

    // ✅ 나머지 종목 가격만 대문자로 정리
    const normalized = {};
    for (const key in data) {
      if (key === "USD_KRW") continue;
      normalized[key.toUpperCase()] = data[key];
    }

    return normalized;
  } catch (err) {
    console.error("❌ 가격 정보 로딩 실패:", err);
    return {};
  }
}

export async function updateExchangeRateUI() {
  if (exchangeRate) {
    document.getElementById(
      "exchange-rate"
    ).textContent = `💲1 USD = ${exchangeRate.toLocaleString()} KRW`;
  }
}
