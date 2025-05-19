const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const schedule = require('node-schedule');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Supabase config (thay bằng của bạn)
const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0';
const supabase = createClient(supabaseUrl, supabaseKey);

let botRunning = false;
let investment = 0;
let intervalJob1 = null;
let intervalJob2 = null;

let OKX_API_KEY = '';
let OKX_SECRET_KEY = '';
let OKX_PASSPHRASE = '';
let CURRENT_USER_ID = '';

// Hàm load API keys từ Supabase
async function loadUserKeys(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('apikey_okx, secret_okx, pass_okx')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Không tìm thấy user hoặc lỗi Supabase:', error);
    return false;
  }

  OKX_API_KEY = data.apikey_okx;
  OKX_SECRET_KEY = data.secret_okx;
  OKX_PASSPHRASE = data.pass_okx;
  CURRENT_USER_ID = userId;

  console.log('Đã load API OKX cho user:', userId);
  return true;
}

// Tạo chữ ký OKX
function getOKXSignature(timestamp, method, requestPath, body = '') {
  const prehash = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac('sha256', OKX_SECRET_KEY).update(prehash).digest('base64');
}

// Gửi lệnh lên OKX
async function sendOKXOrder(order) {
  const timestamp = new Date().toISOString();
  const method = 'POST';
  const requestPath = '/api/v5/trade/order';
  const body = JSON.stringify(order);
  const sign = getOKXSignature(timestamp, method, requestPath, body);

  try {
    const res = await axios.post(
      'https://www.okx.com' + requestPath,
      order,
      {
        headers: {
          'OK-ACCESS-KEY': OKX_API_KEY,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': timestamp,
          'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
          'Content-Type': 'application/json'
        }
      }
    );
    if (res.data.code === '0') {
      console.log('Order thành công:', order.side, order.instId, 'size:', order.sz);
    } else {
      console.error('Order lỗi:', res.data);
    }
    return res.data;
  } catch (error) {
    console.error('Lỗi khi gửi order:', error.message);
  }
}

// Lấy funding rates OKX
async function getFundingRates() {
  const res = await axios.get('https://www.okx.com/api/v5/public/funding-rate?instType=SWAP');
  return res.data.data;
}

// Lấy leverage tối đa 1 symbol
async function getMaxLeverage(instId) {
  try {
    const res = await axios.get(`https://www.okx.com/api/v5/account/leverage-info?instId=${instId}`);
    return parseInt(res.data.data[0].longLeverage);
  } catch (err) {
    console.error('Lỗi lấy leverage:', err.message);
    return null;
  }
}

// Đặt lệnh thật với TP/SL 30% vốn đầu tư
async function placeRealOrder(symbol, leverage, usdt) {
  console.log(`User ${CURRENT_USER_ID} vào lệnh ${symbol} với ${usdt}$, leverage ${leverage}`);

  // Lấy giá thị trường hiện tại
  const ticker = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`);
  const entryPrice = parseFloat(ticker.data.data[0].last);

  // Tính size
  const size = ((usdt * leverage) / entryPrice).toFixed(4);

  // Lợi nhuận kỳ vọng 30% vốn thật
  const profitTarget = usdt * 0.3;
  const priceChange = profitTarget / size;

  // Giá TP và SL (cho LONG)
  const tpPrice = (entryPrice + priceChange).toFixed(2);
  const slPrice = (entryPrice - priceChange).toFixed(2);

  // Mở lệnh market LONG
  await sendOKXOrder({
    instId: symbol,
    tdMode: 'isolated',
    side: 'buy',
    ordType: 'market',
    sz: size,
    lever: leverage.toString()
  });

  // Đặt TP limit sell (reduceOnly)
  await sendOKXOrder({
    instId: symbol,
    tdMode: 'isolated',
    side: 'sell',
    ordType: 'limit',
    sz: size,
    px: tpPrice,
    reduceOnly: true
  });

  // Đặt SL stop-market sell (reduceOnly)
  await sendOKXOrder({
    instId: symbol,
    tdMode: 'isolated',
    side: 'sell',
    ordType: 'trigger',
    sz: size,
    triggerPx: slPrice,
    ordPx: '-1',
    reduceOnly: true,
    triggerType: 'down'
  });

  console.log(`Đã đặt TP ở ${tpPrice}$ và SL ở ${slPrice}$ cho lệnh ${symbol}`);
}

// Logic bot chính
async function runBotLogic() {
  const now = new Date();
  const hour = (now.getUTCHours() + 7) % 24;

  if (hour === 7) return; // Bỏ giờ 7h sáng

  const list = await getFundingRates();
  const candidates = list.filter(c => parseFloat(c.fundingRate) <= -0.003);

  if (candidates.length === 0) return;

  const top = candidates.sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate))[0];

  setTimeout(async () => {
    const maxLev = await getMaxLeverage(top.instId);
    if (!maxLev) return;
    await placeRealOrder(top.instId, maxLev, investment);
  }, 3000);
}

// Start bot (2 lần mỗi giờ: phút 55 và 58)
function startBot() {
  intervalJob1 = schedule.scheduleJob('55 * * * *', runBotLogic);
  intervalJob2 = schedule.scheduleJob('58 * * * *', runBotLogic);
  console.log('Bot đã được khởi động');
}

// Dừng bot
function stopBot() {
  if (intervalJob1) intervalJob1.cancel();
  if (intervalJob2) intervalJob2.cancel();
  console.log('Bot đã dừng');
}

// Route homepage (nếu có file index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route start bot
app.post('/start', async (req, res) => {
  const userId = req.body.user_id;
  investment = parseFloat(req.body.usdt);

  if (!userId) return res.send('Thiếu user_id');

  const ok = await loadUserKeys(userId);
  if (!ok) return res.send('Không tìm thấy user trong Supabase');

  if (botRunning) return res.send('Bot đã chạy rồi');

  botRunning = true;
  startBot();

  console.log(`>> START BOT cho user: ${userId}, vốn: ${investment} USDT`);
  res.send(`Bot đã khởi động cho user_id ${userId}`);
});

// Route stop bot
app.post('/stop', (req, res) => {
  if (!botRunning) return res.send('Bot chưa chạy');

  botRunning = false;
  stopBot();

  console.log(`>> STOP BOT`);
  res.send('Bot đã dừng');
});

app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
