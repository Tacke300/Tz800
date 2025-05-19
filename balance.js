const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...'; // Rút gọn vì bảo mật
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

// ==== Lấy số dư từ OKX ====
async function getOkxBalance(userData) {
  try {
    const tsRes = await fetch('https://www.okx.com/api/v5/public/time');
    const tsJson = await tsRes.json();
    const timestamp = tsJson.data[0].ts;

    const prehash = timestamp + 'GET' + '/api/v5/account/balance';
    const signature = crypto
      .createHmac('sha256', userData.secret_okx)
      .update(prehash)
      .digest('base64');

    const res = await fetch('https://www.okx.com/api/v5/account/balance', {
      headers: {
        'OK-ACCESS-KEY': userData.apikey_okx,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': userData.pass_okx,
        'Content-Type': 'application/json',
      },
    });

    const json = await res.json();
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
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = require('crypto')
      .createHmac('sha256', userData.secret_binance)
      .update(query)
      .digest('hex');

    const res = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': userData.apikey_binance,
      },
    });

    const json = await res.json();
    const usdt = json.balances.find((b) => b.asset === 'USDT');
    return usdt?.free || null;
  } catch (e) {
    console.error('Binance Error:', e);
    return null;
  }
}

// ==== Lấy số dư cho user ====
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
