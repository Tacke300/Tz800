const fetch = require('node-fetch');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // để nguyên key gốc của bạn
const bot = new Telegraf('7648930428:AAFDIISTuWwa-aNmyWgItakI_tMwuTEXNkw');

const userIds = new Set();

// ==== Lấy API Key từ Supabase ====
async function getApiKeys(userId) {
  const res = await fetch(`${supabaseUrl}/rest/v1/users?user_id=eq.${userId}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  return data[0];
}

// ==== Cập nhật số dư USDT vào Supabase ====
async function updateBalancesInSupabase(userId, usdtOkx, usdtBinance) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/users?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        usdt_okx: usdtOkx,
        usdt_binance: usdtBinance,
      }),
    });
  } catch (e) {
    console.error('Lỗi cập nhật Supabase:', e);
  }
}

// ==== Lấy số dư từ OKX ====
async function getOkxBalance(userData) {
  try {
    const timestamp = new Date().toISOString();

    const prehash = timestamp + 'GET' + '/api/v5/account/balance';
    const signature = crypto
      .createHmac('sha256', userData.secret_okx)
      .update(prehash)
      .digest('base64');

    const res = await fetch('https://www.okx.com/api/v5/account/balance', {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': userData.apikey_okx,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': userData.pass_okx,
        'Content-Type': 'application/json',
      },
    });

    const json = await res.json();
    if (json.code !== '0') {
      console.error('OKX API error:', json.msg);
      return null;
    }

    const balances = json.data[0].details;
    const usdt = balances.find((b) => b.ccy === 'USDT');
    return usdt?.availBal || null;
  } catch (e) {
    console.error('OKX Error:', e);
    return null;
  }
}

// ==== Lấy số dư từ Binance ====
async function getBinanceBalance(userData) {
  try {
    const timeRes = await fetch('https://api.binance.com/api/v3/time');
    const timeData = await timeRes.json();
    const timestamp = timeData.serverTime;

    const query = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', userData.secret_binance)
      .update(query)
      .digest('hex');

    const res = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': userData.apikey_binance,
      },
    });

    const json = await res.json();

    if (json.code) {
      console.error('Binance API error:', json.msg || json);
      return null;
    }

    const usdt = json.balances.find((b) => b.asset === 'USDT');
    return usdt?.free || null;
  } catch (e) {
    console.error('Binance Error:', e);
    return null;
  }
}

// ==== Lấy số dư cho user và cập nhật Supabase ====
async function getBalanceForUser(userId) {
  const userData = await getApiKeys(userId);
  if (!userData) {
    console.log(`Không tìm thấy user ${userId}`);
    return;
  }

  const [okx, binance] = await Promise.all([
    getOkxBalance(userData),
    getBinanceBalance(userData),
  ]);

  // Cập nhật số dư vào Supabase
  await updateBalancesInSupabase(userId, okx, binance);

  let message = 'Không thể lấy số dư từ các sàn.';
  if (okx && binance) {
    message = `Số dư của bạn:\n- OKX USDT: ${okx}\n- Binance USDT: ${binance}`;
  }

  await bot.telegram.sendMessage(userId, message);
}

// ==== Xử lý /start từ Telegram ====
bot.start((ctx) => {
  const userId = ctx.message.chat.id;
  userIds.add(userId);
  ctx.reply('Chào bạn! Đang lấy số dư từ OKX và Binance...');
  getBalanceForUser(userId);
});

// ==== Chạy định kỳ mỗi 30 giây ====
setInterval(() => {
  for (const userId of userIds) {
    getBalanceForUser(userId);
  }
}, 30000);

// ==== Khởi động bot ====
bot.launch();
