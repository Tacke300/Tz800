// bot.js
require('dotenv').config();
const fetch = require('node-fetch');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

let isRunning = false;
let botType = null;
let botTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Giả lập chạy bot theo từng loại
async function runMainBot(type, customInput = null) {
  if (isRunning) return;
  isRunning = true;
  botType = type;

  console.log(`[${new Date().toLocaleTimeString()}] Bot ${type} đang chạy...`);

  // 1. Giả lập lấy user từ Supabase
  const user = await getUserInfo(); // giả lập

  // 2. Giả lập quét funding
  const fundingData = await getMockFunding();
  const selectedCoin = fundingData.find(f => f.funding < -0.005 && !f.fundedYet);

  if (!selectedCoin) {
    console.log("Không có coin phù hợp. Bot sẽ ngủ...");
    isRunning = false;
    return;
  }

  console.log(`=> Chọn coin: ${selectedCoin.symbol} funding ${selectedCoin.funding}`);

  // 3. Tính vốn, TP, SL
  const balance = user.usdt_binance;
  let invest = 0;
  let tp = 0;
  let sl = 0;
  const lev = selectedCoin.leverage;

  if (type === 'mini') {
    invest = balance * 0.3;
    tp = getTP(lev, 'mini');
    sl = tp;
  } else if (type === 'big') {
    invest = balance * 0.9;
    tp = getTP(lev, 'big');
    sl = tp;
  } else if (type === 'set' && customInput) {
    invest = Number(customInput.amount);
    tp = Number(customInput.tp);
    sl = Number(customInput.sl);
  }

  console.log(`Mở lệnh SHORT ${selectedCoin.symbol} | đòn bẩy ${lev} | đầu tư $${invest} | TP: ${tp}%, SL: ${sl}%`);

  // 4. Mô phỏng đợi funding 0.5s rồi mở lệnh
  await sleep(500);
  console.log(`Lệnh SHORT ${selectedCoin.symbol} đã mở.`);

  // 5. Giả lập khớp TP/SL hoặc đóng sau 3 phút
  const result = await waitTPorSL(tp, sl);
  console.log(`=> Kết quả: ${result}`);

  // 6. Cập nhật PNL
  const pnl = invest * (result === 'TP' ? tp : result === 'SL' ? -sl : 0) / 100;
  await updatePNL(pnl);
  console.log(`=> Đã cập nhật PNL: ${pnl.toFixed(2)} USDT`);

  isRunning = false;
}

// Các hàm phụ trợ
function getTP(lev, type) {
  if (type === 'mini') {
    if (lev <= 25) return 15;
    if (lev <= 50) return 20;
    if (lev <= 75) return 25;
    if (lev <= 100) return 30;
    return 35;
  } else {
    if (lev <= 25) return 30;
    if (lev <= 50) return 60;
    if (lev <= 75) return 85;
    if (lev <= 100) return 120;
    return 150;
  }
}

async function getUserInfo() {
  // Giả lập gọi Supabase lấy user
  return {
    usdt_binance: 1000
  };
}

async function updatePNL(pnl) {
  // Giả lập cập nhật Supabase
  console.log(`(Supabase) +${pnl.toFixed(2)} USDT vào cột pnl_today`);
}

async function getMockFunding() {
  return [
    { symbol: "BTCUSDT", funding: -0.007, leverage: 20, fundedYet: false },
    { symbol: "ETHUSDT", funding: -0.002, leverage: 50, fundedYet: false },
    { symbol: "XRPUSDT", funding: -0.008, leverage: 75, fundedYet: false }
  ];
}

async function waitTPorSL(tp, sl) {
  await sleep(5000); // giả lập theo dõi
  const rand = Math.random();
  if (rand < 0.3) return 'TP';
  if (rand < 0.6) return 'SL';
  return 'TIMEOUT';
}

function stopMainBot() {
  isRunning = false;
  clearTimeout(botTimer);
  console.log("Bot đã dừng.");
}

function getStatus() {
  return isRunning ? `Đang chạy bot ${botType}` : 'Không có bot nào đang chạy.';
}

module.exports = { runMainBot, stopMainBot, getStatus };
