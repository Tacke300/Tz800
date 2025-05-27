const fetch = require("node-fetch");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// Supabase config - thay bằng của bạn
const SUPABASE_URL = "https://tramnanrzruzvkehpydl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Binance API endpoints
const BINANCE_BASE = "https://fapi.binance.com";

// Tạo header sign cho Binance REST API
function signRequest(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

// Gọi API Binance có ký
async function binanceSignedRequest(path, method, params, apiKey, secret) {
  const timestamp = Date.now();
  let query = new URLSearchParams(params);
  query.append("timestamp", timestamp);
  const queryString = query.toString();
  const signature = signRequest(queryString, secret);
  const url = `${BINANCE_BASE}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method,
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Binance API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Gọi API Binance không ký (public)
async function binancePublicRequest(path) {
  const url = `${BINANCE_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API public error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Lấy user data từ Supabase
async function getUserData(user_id) {
  const { data, error } = await supabase
    .from("users")
    .select("apikey_binance, secret_binance, usdt_binance, pnl_today")
    .eq("user_id", user_id)
    .single();
  if (error || !data) throw new Error("Không tìm thấy user hoặc lỗi Supabase");
  return data;
}

// Lấy danh sách funding rate tất cả coin từ Binance Futures
async function getFundingRates() {
  // API: /fapi/v1/fundingRate?limit=1000
  const rates = await binancePublicRequest("/fapi/v1/fundingRate?limit=1000");
  // Lọc những coin funding rate âm < -0.005
  return rates.filter(r => parseFloat(r.fundingRate) < -0.005);
}

// Lấy leverage hiện tại của symbol của user (Binance không có API get leverage, dùng giả định leverage set từ user)
async function getLeverage(userApiKey, userSecret, symbol) {
  // Binance Futures có API GET /fapi/v1/positionSide/dual - không trả leverage
  // Binance Futures không có API get leverage chính thức, phải lưu leverage user set
  // Ở đây giả định leverage = 20 (hoặc bạn có thể lưu leverage trong Supabase)
  return 20;
}

// Đặt margin mode isolated cho symbol
async function setMarginIsolated(apiKey, secret, symbol) {
  return binanceSignedRequest("/fapi/v1/marginType", "POST", { symbol, marginType: "ISOLATED" }, apiKey, secret);
}

// Đặt leverage cho symbol
async function setLeverage(apiKey, secret, symbol, leverage) {
  return binanceSignedRequest("/fapi/v1/leverage", "POST", { symbol, leverage }, apiKey, secret);
}

// Mở lệnh market SHORT
async function openShort(apiKey, secret, symbol, quantity) {
  return binanceSignedRequest(
    "/fapi/v1/order",
    "POST",
    {
      symbol,
      side: "SELL",
      type: "MARKET",
      quantity,
      positionSide: "SHORT", // Binance Futures dùng PositionSide để phân biệt long/short khi Hedge Mode bật
    },
    apiKey,
    secret
  );
}

// Đóng lệnh SHORT market
async function closeShort(apiKey, secret, symbol, quantity) {
  return binanceSignedRequest(
    "/fapi/v1/order",
    "POST",
    {
      symbol,
      side: "BUY",
      type: "MARKET",
      quantity,
      positionSide: "SHORT",
    },
    apiKey,
    secret
  );
}

// Tính số lượng token để vào lệnh dựa trên vốn USDT và giá hiện tại
async function calcQuantity(apiKey, secret, symbol, usdtAmount) {
  // Lấy giá hiện tại
  const ticker = await binancePublicRequest(`/fapi/v1/ticker/price?symbol=${symbol}`);
  const price = parseFloat(ticker.price);
  if (!price) throw new Error("Lấy giá không thành công");
  // Binance Futures quantity theo số lượng coin, ví dụ BTCUSDT quantity tính = usdtAmount / price
  return (usdtAmount / price).toFixed(3);
}

// Cập nhật pnl_today lên Supabase (cộng dồn)
async function updatePnlToday(user_id, pnl) {
  // Lấy pnl cũ
  const { data, error } = await supabase.from("users").select("pnl_today").eq("user_id", user_id).single();
  if (error) throw new Error("Lỗi cập nhật pnl: " + error.message);
  let newPnl = (data?.pnl_today || 0) + pnl;
  const { error: errUpdate } = await supabase.from("users").update({ pnl_today: newPnl }).eq("user_id", user_id);
  if (errUpdate) throw new Error("Lỗi cập nhật pnl: " + errUpdate.message);
  return newPnl;
}

// Hàm chính chạy bot
async function runBot({ user_id, leverage, tp, sl, amount, botType }) {
  // Lấy user API key, secret, usdt
  const user = await getUserData(user_id);

  // Lấy funding rates âm < -0.005
  const fundingRates = await getFundingRates();

  // Lọc các đồng coin sắp trả funding nhất (ví dụ: lấy funding có time <= now + 15p)
  const now = Date.now();
  const soonFunding = fundingRates.filter(r => r.fundingTime - now <= 15 * 60 * 1000); // 15 phút trước funding

  if (soonFunding.length === 0) {
    return "Chưa có coin nào sắp trả funding âm < -0.005";
  }

  // Lấy đồng coin funding âm nhất
  soonFunding.sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
  const target = soonFunding[0];
  const symbol = target.symbol;

  // Đặt margin mode isolated
  await setMarginIsolated(user.apikey_binance, user.secret_binance, symbol);

  // Tính leverage theo botType nếu bot_mini hoặc bot_big (override leverage, tp, sl, amount)
  if (botType === "bot_mini") {
    leverage = leverage <= 25 ? leverage : 25; // Giới hạn
    amount = user.usdt_binance * 0.3;
    if (leverage <= 25) {
      tp = leverage <= 25 ? (leverage <= 20 ? 15 : 15) : 15;
      sl = tp;
    } else if (leverage === 50) {
      tp = 20;
      sl = 20;
    } else if (leverage === 75) {
      tp = 25;
      sl = 25;
    } else if (leverage === 100) {
      tp = 30;
      sl = 30;
    } else if (leverage === 125) {
      tp = 35;
      sl = 35;
    }
  } else if (botType === "bot_big") {
    leverage = leverage <= 125 ? leverage : 125;
    amount = user.usdt_binance * 0.9;
    if (leverage <= 25) {
      tp = 30;
      sl = 30;
    } else if (leverage === 50) {
      tp = 60;
      sl = 60;
    } else if (leverage === 75) {
      tp = 85;
      sl = 85;
    } else if (leverage === 100) {
      tp = 120;
      sl = 120;
    } else if (leverage === 125) {
      tp = 150;
      sl = 150;
    }
  } else if (botType === "bot_set") {
    // leverage, tp, sl, amount lấy theo input
    if (leverage < 1 || leverage > 100) throw new Error("Leverage nhập phải 1-100");
    if (tp < 1 || tp > 100) throw new Error("TP % vốn phải 1-100");
    if (sl < 1 || sl > 100) throw new Error("SL % vốn phải 1-100");
    if (amount <= 0) throw new Error("Số tiền vào lệnh phải > 0");
  } else {
    throw new Error("Loại bot không hợp lệ");
  }

  // Đặt leverage cho symbol
  await setLeverage(user.apikey_binance, user.secret_binance, symbol, leverage);

  // Tính quantity đặt lệnh
  const quantity = await calcQuantity(user.apikey_binance, user.secret_binance, symbol, amount);

  // Mở lệnh SHORT market
  await openShort(user.apikey_binance, user.secret_binance, symbol, quantity);

  // Chờ 3 phút hoặc chờ TP/SL (phần này cần websocket hoặc kiểm tra liên tục, ở đây tạm sleep 3 phút rồi đóng lệnh)
  await new Promise((r) => setTimeout(r, 180000));

  // Đóng lệnh market
  await closeShort(user.apikey_binance, user.secret_binance, symbol, quantity);

  // Cập nhật pnl_today (chưa có cách tính lợi nhuận chính xác do thiếu websocket, tạm +0)
  await updatePnlToday(user_id, 0);

  return `Đã mở lệnh SHORT ${symbol} với lượng ${quantity}, leverage ${leverage}, TP/SL ${tp}%/${sl}%, vốn đầu tư ${amount} USDT`;
}

module.exports = runBot;
