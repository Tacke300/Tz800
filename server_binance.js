// server.js
const express = require('express');
const bodyParser = require('body-parser');
const Binance = require('node-binance-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.json());

// Supabase config
const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0';
const supabase = createClient(supabaseUrl, supabaseKey);

let runningBotPerUser = {}; // lưu bot đang chạy theo user_id

// Định nghĩa hàm lấy data funding rate và lev, số dư usdt người dùng
async function getUserData(user_id) {
  const { data, error } = await supabase
    .from('users')
    .select('apikey_binance,secret_binance,usdt_binance,pnl_today')
    .eq('user_id', user_id)
    .single();

  if (error || !data) throw new Error('User not found');
  return data;
}

// Lấy funding rate và lev từ Binance (ví dụ)
async function getFundingAndLev(binance) {
  // Lấy funding rate các coin
  const fundingRates = await binance.futuresFundingRate();

  // Lấy info lev từ tài khoản
  const accountInfo = await binance.futuresAccount();

  // Ghép lại funding + lev theo coin
  let coins = {};
  for (let item of fundingRates) {
    if (!coins[item.symbol]) coins[item.symbol] = {};
    coins[item.symbol].fundingRate = parseFloat(item.fundingRate);
  }
  for (let pos of accountInfo.positions) {
    if (coins[pos.symbol]) coins[pos.symbol].leverage = parseInt(pos.leverage);
  }
  return coins;
}

// Lọc coin funding âm nhiều nhất (< -0.005)
function filterFundingCoins(coins) {
  let candidates = [];
  for (const symbol in coins) {
    const c = coins[symbol];
    if (c.fundingRate < -0.005 && c.leverage) {
      candidates.push({symbol, fundingRate: c.fundingRate, leverage: c.leverage});
    }
  }
  candidates.sort((a,b) => a.fundingRate - b.fundingRate);
  return candidates;
}

app.post('/api/start_bot', async (req, res) => {
  const { user_id, botType, lev, tp, sl, amount } = req.body;

  if (runningBotPerUser[user_id]) {
    return res.json({ success: false, message: 'Bạn đang chạy bot khác, dừng nó trước.' });
  }

  try {
    const userData = await getUserData(user_id);
    const binance = new Binance().options({
      APIKEY: userData.apikey_binance,
      APISECRET: userData.secret_binance,
      useServerTime: true,
      test: false,
    });

    // Quét funding và lev
    const coins = await getFundingAndLev(binance);
    const filteredCoins = filterFundingCoins(coins);

    if (filteredCoins.length === 0) {
      return res.json({ success: false, message: 'Không có coin funding âm đủ điều kiện.' });
    }

    const chosenCoin = filteredCoins[0]; // chọn coin âm nhất

    // Khởi chạy bot theo botType
    // Ở đây bạn sẽ viết logic bot_mini, bot_big, bot_set chạy nền
    // tạm gán đang chạy
    runningBotPerUser[user_id] = { botType, chosenCoin, lev, tp, sl, amount, userData };

    // Gửi trạng thái bot đang chạy về frontend sẽ dùng api get /bot_status
    return res.json({ success: true, message: 'Bot đã bắt đầu', chosenCoin });
  } catch (e) {
    return res.json({ success: false, message: e.message });
  }
});

app.post('/api/stop_bot', (req, res) => {
  const { user_id } = req.body;
  if (runningBotPerUser[user_id]) {
    delete runningBotPerUser[user_id];
    return res.json({ success: true, message: 'Đã dừng bot' });
  }
  return res.json({ success: false, message: 'Chưa có bot nào chạy.' });
});

app.get('/api/bot_status', (req, res) => {
  const user_id = req.query.user_id;
  if (runningBotPerUser[user_id]) {
    return res.json({ runningBot: runningBotPerUser[user_id].botType });
  }
  return res.json({ runningBot: null });
});

// Lặp thời gian mỗi x giờ 57 phút thực hiện quét lại

const schedule = require('node-schedule');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Đây chỉ là ví dụ khung, bạn cần hoàn thiện từng bot mini,big,set ở đây

schedule.scheduleJob('*/57 * * * *', async () => {
  // Lặp qua tất cả user chạy bot, quét funding tiếp
  for (const user_id in runningBotPerUser) {
    const botInfo = runningBotPerUser[user_id];
    try {
      const userData = await getUserData(user_id);
      const binance = new Binance().options({
        APIKEY: userData.apikey_binance,
        APISECRET: userData.secret_binance,
        useServerTime: true,
        test: false,
      });

      // Lấy funding + lev
      const coins = await getFundingAndLev(binance);
      const filteredCoins = filterFundingCoins(coins);

      if (filteredCoins.length === 0) {
        // ngủ tiếp, hoặc dừng bot
        continue;
      }

      // Lấy coin âm nhất và so sánh với botInfo.chosenCoin
      const chosenCoin = filteredCoins[0];
      // Mở lệnh future short sau funding 0.5s với thông số theo botType
      // Logic TP/SL và đóng lệnh sau 3 phút nếu chưa khớp
      // Cập nhật pnl_today supabase
      // Cập nhật trạng thái bot

      // TODO: bạn hoàn thiện chi tiết logic mở lệnh, tp, sl, đóng lệnh

    } catch (e) {
      console.error('Lỗi schedule job', e);
    }
  }
});

app.listen(3000, () => {
  console.log('Server chạy port 3000');
});
