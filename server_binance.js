// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Binance = require('node-binance-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const supabaseUrl = 'https://your-supabase-url.supabase.co';
const supabaseKey = 'your-supabase-service-role-key'; // dùng service key để update dữ liệu
const supabase = createClient(supabaseUrl, supabaseKey);

// Global biến trạng thái bot
let botStatus = {
  running: false,
  botType: null,
  currentUserId: null,
  currentOrder: null,
  log: [],
  intervalHandle: null,
};

// Hàm ghi log
function addLog(message) {
  const time = new Date().toLocaleTimeString();
  const logEntry = `[${time}] ${message}`;
  console.log(logEntry);
  botStatus.log.push(logEntry);
  if (botStatus.log.length > 100) botStatus.log.shift(); // giữ log mới nhất 100 dòng
}

// Hàm lấy user data từ Supabase theo user_id
async function getUserData(user_id) {
  const { data, error } = await supabase
    .from('users')
    .select('apikey_binance, secret_binance, usdt_binance, pnl_today')
    .eq('user_id', user_id)
    .single();
  if (error) {
    addLog(`Lỗi lấy user data: ${error.message}`);
    return null;
  }
  return data;
}

// Hàm cập nhật pnl_today vào supabase
async function updatePnl(user_id, pnl) {
  const { error } = await supabase
    .from('users')
    .update({ pnl_today: pnl })
    .eq('user_id', user_id);
  if (error) {
    addLog(`Lỗi cập nhật pnl_today: ${error.message}`);
  } else {
    addLog(`Đã cập nhật pnl_today: ${pnl}`);
  }
}

// Hàm tạo Binance client theo API key/secret user
function createBinanceClient(apiKey, secret) {
  return new Binance().options({
    APIKEY: apiKey,
    APISECRET: secret,
    recvWindow: 60000,
    useServerTime: true,
  });
}

// Hàm lấy danh sách futures symbol có funding rate âm <-0.005
async function getFundingNegSymbols(binance) {
  try {
    const fundingData = await binance.futuresFundingRate(); // lấy funding rate tất cả symbol
    // Lọc funding âm < -0.005
    const filtered = fundingData.filter(f => parseFloat(f.fundingRate) < -0.005);
    if (!filtered.length) return [];
    // Sắp xếp funding âm nhất lên đầu
    filtered.sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
    return filtered;
  } catch (err) {
    addLog(`Lỗi lấy funding rate: ${err.message}`);
    return [];
  }
}

// Hàm chọn coin sắp trả funding nhất trong list
function selectNextFundingCoin(fundingList) {
  const now = Date.now();
  // Tính thời gian đến funding tiếp theo
  fundingList.forEach(f => {
    f.nextFundingTimestamp = new Date(f.fundingTime).getTime();
  });
  // Lọc coin funding sắp đến trong vòng 10 phút (ví dụ)
  const upcoming = fundingList.filter(f => (f.nextFundingTimestamp - now) <= 10 * 60 * 1000 && (f.nextFundingTimestamp - now) > 0);
  if (!upcoming.length) return null;
  // Chọn coin funding âm nhất trong số sắp trả
  upcoming.sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
  return upcoming[0];
}

// Hàm mở lệnh market short theo botType, config số tiền, TP/SL % vốn
async function openShortOrder(binance, symbol, usdtBalance, botType, leverageInput, tpPercentInput, slPercentInput) {
  try {
    // Lấy max leverage từ Binance Futures symbol info
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
    if (!symbolInfo) {
      addLog(`Không tìm thấy thông tin symbol ${symbol}`);
      return null;
    }

    // Cấu hình bot theo loại
    let investPercent, tpPercent, slPercent;
    if (botType === 'bot_mini') {
      investPercent = 0.3;
      if (leverageInput === 20 || leverageInput === 25) {
        tpPercent = slPercent = 0.15;
      } else if (leverageInput === 50) {
        tpPercent = slPercent = 0.2;
      } else if (leverageInput === 75) {
        tpPercent = slPercent = 0.25;
      } else if (leverageInput === 100) {
        tpPercent = slPercent = 0.3;
      } else if (leverageInput === 125) {
        tpPercent = slPercent = 0.35;
      } else {
        tpPercent = slPercent = 0.2; // mặc định
      }
    } else if (botType === 'bot_big') {
      investPercent = 0.9;
      if (leverageInput === 20 || leverageInput === 25) {
        tpPercent = slPercent = 0.3;
      } else if (leverageInput === 50) {
        tpPercent = slPercent = 0.6;
      } else if (leverageInput === 75) {
        tpPercent = slPercent = 0.85;
      } else if (leverageInput === 100) {
        tpPercent = slPercent = 1.2;
      } else if (leverageInput === 125) {
        tpPercent = slPercent = 1.5;
      } else {
        tpPercent = slPercent = 0.6; // mặc định
      }
    } else if (botType === 'bot_set') {
      investPercent = 1.0; // dùng chính xác số tiền người dùng nhập (truyền vào hàm)
      tpPercent = tpPercentInput / 100;
      slPercent = slPercentInput / 100;
    } else {
      addLog('Bot type không hợp lệ');
      return null;
    }

    // Nếu bot_set thì usdtBalance chính là số tiền đầu tư truyền vào, còn bot khác thì tính  %
    const investUSDT = botType === 'bot_set' ? usdtBalance : usdtBalance * investPercent;

    // Đặt leverage (giới hạn <= max leverage)
    let leverage = leverageInput;
    if (leverage > symbolInfo.contractType) leverage = symbolInfo.contractType; // bảo đảm không vượt max leverage (symbolInfo.contractType chỉ ví dụ)
    await binance.futuresLeverage(symbol, leverage);

    // Tính quantity mở lệnh
    const price = (await binance.futuresMarkPrice(symbol)).markPrice;
    const quantity = (investUSDT / price).toFixed(symbolInfo.quantityPrecision);

    addLog(`Mở lệnh SHORT ${symbol} - Qty: ${quantity}, Leverage: ${leverage}, TP: ${tpPercent*100}%, SL: ${slPercent*100}%`);

    // Mở lệnh market short (side SELL)
    const order = await binance.futuresMarketSell(symbol, quantity, { reduceOnly: false });
    addLog(`Lệnh mở SHORT đã đặt, orderId: ${order.orderId}`);

    // TODO: đặt TP/SL (cần check thêm API Binance futures đặt TP/SL lệnh đơn giản)  
    // API Binance không có trực tiếp lệnh TP/SL, phải dùng lệnh stop loss/take profit (stop orders) hoặc tự quản lý bằng bot

    return { orderId: order.orderId, quantity, symbol };
  } catch (err) {
    addLog(`Lỗi mở lệnh SHORT: ${err.message}`);
    return null;
  }
}

// Hàm đóng lệnh market
async function closeOrder(binance, symbol, quantity) {
  try {
    addLog(`Đóng lệnh SHORT ${symbol} - Qty: ${quantity}`);
    const order = await binance.futuresMarketBuy(symbol, quantity, { reduceOnly: true });
    addLog(`Lệnh đóng SHORT đã đặt, orderId: ${order.orderId}`);
    return true;
  }
// Tiếp tục server.js

// Hàm bot chính chạy vòng lặp lấy funding, chọn coin, mở lệnh, đóng lệnh
async function runBot(user_id, botType, leverage, tpPercent, slPercent) {
  if (botStatus.running) {
    addLog('Bot đang chạy rồi, không thể chạy thêm');
    return;
  }
  botStatus.running = true;
  botStatus.botType = botType;
  botStatus.currentUserId = user_id;
  addLog(`Bot START bởi user ${user_id} - Type: ${botType}`);

  const userData = await getUserData(user_id);
  if (!userData) {
    addLog('Không lấy được user data, bot dừng');
    botStatus.running = false;
    return;
  }

  const binance = createBinanceClient(userData.apikey_binance, userData.secret_binance);

  while (botStatus.running) {
    try {
      // Lấy funding âm
      const fundingList = await getFundingNegSymbols(binance);
      if (!fundingList.length) {
        addLog('Không có funding âm đủ điều kiện');
        await sleep(60 * 1000); // đợi 1 phút rồi thử lại
        continue;
      }

      // Chọn coin sắp trả funding nhất
      const coin = selectNextFundingCoin(fundingList);
      if (!coin) {
        addLog('Chưa đến giờ funding tiếp theo');
        await sleep(60 * 1000);
        continue;
      }
      addLog(`Chọn coin funding âm: ${coin.symbol} rate: ${coin.fundingRate}`);

      // Kiểm tra số dư USDT thực tế
      const usdtBalance = userData.usdt_binance || 50; // default 50 USDT nếu chưa có

      // Mở lệnh short theo bot config
      const order = await openShortOrder(binance, coin.symbol, usdtBalance, botType, leverage, tpPercent, slPercent);
      if (!order) {
        addLog('Mở lệnh thất bại, đợi lần sau');
        await sleep(60 * 1000);
        continue;
      }
      botStatus.currentOrder = order;

      // Đợi đến thời điểm funding + 3 phút hoặc có thể 180s để nhận funding rồi đóng lệnh
      addLog(`Đợi 3 phút để nhận funding rồi đóng lệnh`);
      await sleep(3 * 60 * 1000);

      // Đóng lệnh
      await closeOrder(binance, order.symbol, order.quantity);

      // Tính pnl (giả lập, thực tế phải gọi API lấy info tài khoản, ví dụ)
      const pnlSimulated = Math.random() * 1; // giả lập lãi từ 0 đến 1 USDT
      userData.pnl_today = (userData.pnl_today || 0) + pnlSimulated;
      await updatePnl(user_id, userData.pnl_today);
      addLog(`Lợi nhuận giả lập lần này: ${pnlSimulated.toFixed(4)} USDT, Tổng PnL hôm nay: ${userData.pnl_today.toFixed(4)} USDT`);

      // Nghỉ 1 phút rồi tiếp tục vòng lặp
      await sleep(60 * 1000);

    } catch (e) {
      addLog(`Lỗi trong vòng lặp bot: ${e.message}`);
      await sleep(60 * 1000);
    }
  }
  addLog('Bot đã dừng.');
  botStatus.running = false;
  botStatus.botType = null;
  botStatus.currentUserId = null;
  botStatus.currentOrder = null;
}

// Hàm sleep tiện dụng
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// API start bot
app.post('/api/bot/start', async (req, res) => {
  const { user_id, botType, leverage, tpPercent, slPercent } = req.body;
  if (botStatus.running) {
    return res.json({ success: false, message: 'Bot đang chạy rồi' });
  }
  runBot(user_id, botType, leverage, tpPercent, slPercent);
  return res.json({ success: true, message: 'Bot đã bắt đầu' });
});

// API stop bot
app.post('/api/bot/stop', (req, res) => {
  if (!botStatus.running) {
    return res.json({ success: false, message: 'Bot chưa chạy' });
  }
  botStatus.running = false;
  return res.json({ success: true, message: 'Bot đã dừng' });
});

// API lấy trạng thái bot + log
app.get('/api/bot/status', (req, res) => {
  return res.json({
    running: botStatus.running,
    botType: botStatus.botType,
    currentUserId: botStatus.currentUserId,
    currentOrder: botStatus.currentOrder,
    log: botStatus.log,
  });
});

// Server listen
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
