const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const schedule = require('node-schedule');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

let botRunning = false;
let investment = 0;
let intervalJob1 = null;
let intervalJob2 = null;

// Supabase config
const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co'; // <== thay URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // <== dùng service key để đọc full
const supabase = createClient(supabaseUrl, supabaseKey);

// Thông tin API OKX mặc định (sẽ bị ghi đè sau khi lấy từ Supabase)
let OKX_API_KEY = '';
let OKX_SECRET_KEY = '';
let OKX_PASSPHRASE = '';
let CURRENT_USER_ID = '';

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

async function getFundingRates() {
  const res = await axios.get('https://www.okx.com/api/v5/public/funding-rate?instType=SWAP');
  return res.data.data;
}

async function getMaxLeverage(instId) {
  try {
    const res = await axios.get(`https://www.okx.com/api/v5/account/leverage-info?instId=${instId}`);
    return parseInt(res.data.data[0].longLeverage);
  } catch (err) {
    console.error('Lỗi lấy leverage:', err.message);
    return null;
  }
}

async function placeRealOrder(symbol, leverage, usdt) {
  console.log(`User ${CURRENT_USER_ID} vào lệnh ${symbol} với ${usdt}$, leverage ${leverage}`);
  // Chỗ này sẽ dùng OKX_API_KEY... để gửi lệnh thực
}

async function runBotLogic() {
  const now = new Date();
  const hour = now.getUTCHours() + 7;

  if (hour === 7) return;

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

function startBot() {
  intervalJob1 = schedule.scheduleJob('55 * * * *', runBotLogic);
  intervalJob2 = schedule.scheduleJob('58 * * * *', runBotLogic);
}

function stopBot() {
  if (intervalJob1) intervalJob1.cancel();
  if (intervalJob2) intervalJob2.cancel();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/start', async (req, res) => {
  const userId = req.body.user_id;
  investment = parseFloat(req.body.usdt);

  if (!userId) return res.send('Thiếu user_id');

  const ok = await loadUserKeys(userId);
  if (!ok) return res.send('Không tìm thấy user trong Supabase');

  if (botRunning) return res.send('Bot đã chạy rồi');
  botRunning = true;
  startBot();
  res.send('Bot đã khởi động cho user_id ' + userId);
});

app.post('/stop', (req, res) => {
  if (!botRunning) return res.send('Bot chưa chạy');
  botRunning = false;
  stopBot();
  res.send('Bot đã dừng');
});

app.listen(3000, () => {
  console.log('Bot OKX chạy ở http://localhost:3000');
});
