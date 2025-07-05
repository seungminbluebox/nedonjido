import { fetchPrices, updateExchangeRateUI } from "./utils.js";
await fetchPrices(["USD_KRW"]);
updateExchangeRateUI();
