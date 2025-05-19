// OKX Funding Bot Server (Node.js - Full JS Version)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const schedule = require('node-schedule');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Supabase config
const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0';
const supabase = createClient(supabaseUrl, supabaseKey);

let botRunning = false;
let botInterval = null;
let APIKEY = '';
let APISECRET = '';
let APIPASSPHRASE = '';
let CAPITAL = 0;
const BASE_URL = 'https://www.okx.com';

function getTimestamp() {
  return new Date().toISOString();
}

function signRequest(timestamp, method, path, body = '') {
  const message = timestamp + method + path + body;
  const hmac = crypto.createHmac('sha256', Buffer.from(APISECRET, 'base64'));
  hmac.update(message);
  return hmac.digest('base64');
}

function authHeaders(method, path, body = '') {
  const timestamp = getTimestamp();
  return {
    'OK-ACCESS-KEY': APIKEY,
    'OK-ACCESS-PASSPHRASE': APIPASSPHRASE,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-SIGN': signRequest(timestamp, method, path, body),
    'Content-Type': 'application/json'
  };
}

async function getLeverageMap() {
  const url = `${BASE_URL}/api/v5/public/instruments?instType=SWAP`;
  const res = await axios.get(url);
  const instruments = res.data.data;
  const map = {};
  for (const inst of instruments) {
    const symbol = inst.instId;
    try {
      const path = `/api/v5/account/leverage-info?instId=${symbol}`;
      const headers = authHeaders('GET', path);
      const resLev = await axios.get(BASE_URL + path, { headers });
      const lev = parseFloat(resLev.data.data[0].lever);
      map[symbol] = lev;
    } catch (e) {
      // lỗi lấy leverage thì bỏ qua
    }
  }
  return map;
}

async function getFundingRates() {
  const url = `${BASE_URL}/api/v5/public/funding-rate`;
  const res = await axios.get(url);
  return res.data.data;
}

async function getPrice(symbol) {
  const url = `${BASE_URL}/api/v5/market/ticker?instId=${symbol}`;
  const res = await axios.get(url);
  return parseFloat(res.data.data[0].last);
}

async function placeShortOrder(symbol, leverage, size) {
  const setLevUrl = '/api/v5/account/set-leverage';
  const levBody = JSON.stringify({
    instId: symbol,
    lever: leverage.toString(),
    mgnMode: 'isolated',
    posSide: 'short'
  });
  await axios.post(BASE_URL + setLevUrl, levBody, {
    headers: authHeaders('POST', setLevUrl, levBody)
  });

  const orderUrl = '/api/v5/trade/order';
  const orderBody = JSON.stringify({
    instId: symbol,
    tdMode: 'isolated',
    side: 'sell',
    ordType: 'market',
    sz: size.toString()
  });
  const res = await axios.post(BASE_URL + orderUrl, orderBody, {
    headers: authHeaders('POST', orderUrl, orderBody)
  });
  console.log('Mở SHORT:', res.data);
}

async function closePosition(symbol) {
  const path = '/api/v5/trade/order';
  const body = JSON.stringify({
    instId: symbol,
    tdMode: 'isolated',
    side: 'buy',
    ordType: 'market',
    sz: 'auto' // nếu OKX API không hỗ trợ sz=auto, cần thay bằng số lượng hợp lệ
  });
  const res = await axios.post(BASE_URL + path, body, {
    headers: authHeaders('POST', path, body)
  });
  console.log('Đóng lệnh:', res.data);
}

async function runBotLoop() {
  if (!botRunning) return;

  const now = new Date();
  if (now.getUTCMinutes() === 55 && now.getUTCSeconds() < 5) {
    console.log('== Bắt đầu quét funding ==');
    const levMap = await getLeverageMap();
    const fundingRates = await getFundingRates();

    const candidates = fundingRates
      .map(item => ({
        inst: item.instId,
        rate: parseFloat(item.fundingRate),
        lev: levMap[item.instId] || null
      }))
      .filter(c => c.rate < -0.003 && c.lev);

    if (candidates.length === 0) return;
    candidates.sort((a, b) => a.rate - b.rate);
    const { inst: symbol, rate, lev } = candidates[0];

    // Chờ đến 58 phút UTC
    const waitTo58 = async () => {
      while (new Date().getUTCMinutes() < 58) await new Promise(r => setTimeout(r, 1000));
    };
    await waitTo58();

    console.log(`== ${symbol} funding ${rate} - chuẩn bị vào lệnh ==`);

    const target = new Date();
    target.setUTCMinutes(0, 0, 500);
    target.setUTCHours(target.getUTCHours() + 1);
    while (new Date() < target) await new Promise(r => setTimeout(r, 100));

    const price = await getPrice(symbol);
    const size = (CAPITAL * lev / price).toFixed(3);

    await placeShortOrder(symbol, lev, size);
    await new Promise(r => setTimeout(r, 60000));
    await closePosition(symbol);
  }
}

async function loadApiFromSupabase(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('apikey_okx, secret_okx, pass_okx')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Supabase error:', error);
    return false;
  }

  APIKEY = data.apikey_okx;
  APISECRET = data.secret_okx;
  APIPASSPHRASE = data.pass_okx;
  return true;
}

app.get('/', (req, res) => {
  res.send('OKX Funding Bot Backend');
});

app.post('/start', async (req, res) => {
  const { user_id, usdt } = req.body;
  if (!user_id || !usdt) return res.status(400).send('Thiếu user_id hoặc usdt');

  const ok = await loadApiFromSupabase(user_id);
  if (!ok) return res.status(500).send('Lỗi load API');

  CAPITAL = parseFloat(usdt);
  botRunning = true;

  if (!botInterval) {
    botInterval = setInterval(runBotLoop, 1000);
  }

  console.log(`Bot đã chạy với ${CAPITAL} USDT`);
  res.send('Bot đã khởi động');
});

app.post('/stop', (req, res) => {
  botRunning = false;
  CAPITAL = 0;
  APIKEY = '';
  APISECRET = '';
  APIPASSPHRASE = '';
  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }
  console.log('Bot đã dừng');
  res.send('Bot đã dừng');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server đang chạy tại http://0.0.0.0:${PORT}`);
});
