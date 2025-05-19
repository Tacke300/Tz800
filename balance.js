const fetch = require('node-fetch');
const crypto = require('crypto');
const { Telegraf } = require('telegraf');

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // để nguyên key gốc của bạn
const bot = new Telegraf('7648930428:AAFDIISTuWwa-aNmyWgItakI_tMwuTEXNkw');

const userIds = new Set();

// ==== Lấy API Key từ Supabase ====
async function getApiKeys(userId) {
  console.log(`[getApiKeys] Bắt đầu lấy API keys cho userId: ${userId}`);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users?user_id=eq.${userId}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[getApiKeys] Lỗi HTTP khi gọi Supabase: Status ${res.status}, Body: ${text}`);
      return null;
    }
    const data = await res.json();
    if (!data || data.length === 0) {
      console.warn(`[getApiKeys] Không tìm thấy dữ liệu API keys cho userId: ${userId}`);
      return null;
    }
    console.log(`[getApiKeys] Lấy API keys thành công cho userId: ${userId}`);
    return data[0];
  } catch (error) {
    console.error(`[getApiKeys] Lỗi exception khi gọi Supabase: ${error}`);
    return null;
  }
}

// ==== Cập nhật số dư vào Supabase ====
async function updateBalancesInSupabase(userId, okxBalance, binanceBalance) {
  console.log(`[updateBalancesInSupabase] Cập nhật số dư cho userId: ${userId}, OKX: ${okxBalance}, Binance: ${binanceBalance}`);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/users?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        usdt_okx: okxBalance,
        usdt_binance: binanceBalance,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[updateBalancesInSupabase] Lỗi cập nhật Supabase: Status ${res.status}, Body: ${text}`);
    } else {
      console.log(`[updateBalancesInSupabase] Cập nhật Supabase thành công cho userId: ${userId}`);
    }
  } catch (error) {
    console.error(`[updateBalancesInSupabase] Lỗi exception khi cập nhật Supabase: ${error}`);
  }
}

// ==== Lấy số dư từ OKX ====
async function getOkxBalance(userData) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[getOkxBalance] Tạo signature OKX, timestamp: ${timestamp}`);

    const prehash = timestamp + 'GET' + '/api/v5/account/balance';
    const signature = crypto
      .createHmac('sha256', userData.secret_okx)
      .update(prehash)
      .digest('base64');

    console.log('[getOkxBalance] Signature OKX được tạo thành công');

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

    if (!res.ok) {
      const text = await res.text();
      console.error(`[getOkxBalance] Lỗi HTTP OKX: Status ${res.status}, Body: ${text}`);
      return null;
    }

    const json = await res.json();

    if (json.code !== '0') {
      console.error(`[getOkxBalance] OKX API error: code=${json.code}, msg=${json.msg}`);
      return null;
    }

    const balances = json.data[0].details;
    const usdt = balances.find((b) => b.ccy === 'USDT');
    console.log(`[getOkxBalance] Số dư USDT OKX: ${usdt?.availBal || 'Không tìm thấy'}`);
    return usdt?.availBal || null;
  } catch (e) {
    console.error(`[getOkxBalance] Lỗi exception: ${e}`);
    console.log('[getOkxBalance] Response OKX:', JSON.stringify(json, null, 2));
    return null;
  }
}

// ==== Lấy số dư từ Binance ====
async function getBinanceBalance(userData) {
  try {
    console.log('[getBinanceBalance] Bắt đầu lấy thời gian server Binance');

    const timeRes = await fetch('https://api.binance.com/api/v3/time');
    if (!timeRes.ok) {
      const text = await timeRes.text();
      console.error(`[getBinanceBalance] Lỗi lấy thời gian Binance: Status ${timeRes.status}, Body: ${text}`);
      return null;
    }
    const timeData = await timeRes.json();
    const timestamp = timeData.serverTime;
    console.log(`[getBinanceBalance] Thời gian server Binance: ${timestamp}`);

    const query = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', userData.secret_binance)
      .update(query)
      .digest('hex');

    console.log('[getBinanceBalance] Tạo chữ ký Binance thành công');
    

    const res = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: {
        'X-MBX-APIKEY': userData.apikey_binance,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[getBinanceBalance] Lỗi HTTP Binance: Status ${res.status}, Body: ${text}`);
      return null;
    }

    const json = await res.json();

    if (json.code) {
      console.error(`[getBinanceBalance] Binance API error: code=${json.code}, msg=${json.msg || JSON.stringify(json)}`);
      return null;
    }

    const usdt = json.balances.find((b) => b.asset === 'USDT');
    console.log(`[getBinanceBalance] Số dư USDT Binance: ${usdt?.free || 'Không tìm thấy'}`);
    return usdt?.free || null;
  } catch (e) {
    console.error(`[getBinanceBalance] Lỗi exception: ${e}`);
    return null;
  }
}

// ==== Lấy số dư cho user và cập nhật Supabase ====
async function getBalanceForUser(userId) {
  console.log(`[getBalanceForUser] Bắt đầu lấy số dư cho userId: ${userId}`);
  const userData = await getApiKeys(userId);
  if (!userData) {
    console.log(`[getBalanceForUser] Không tìm thấy user data cho userId: ${userId}`);
    return;
  }

  const [okx, binance] = await Promise.all([
    getOkxBalance(userData),
    getBinanceBalance(userData),
  ]);

  console.log(`[getBalanceForUser] Lấy số dư OKX: ${okx}, Binance: ${binance}`);

  // Cập nhật Supabase
  await updateBalancesInSupabase(userId, okx, binance);

  let message = 'Không thể lấy số dư từ các sàn.';
  if (okx && binance) {
    message = `Số dư của bạn:\n- OKX USDT: ${okx}\n- Binance USDT: ${binance}`;
  } else if (okx) {
    message = `Số dư của bạn:\n- OKX USDT: ${okx}\n- Không lấy được số dư Binance`;
  } else if (binance) {
    message = `Số dư của bạn:\n- Binance USDT: ${binance}\n- Không lấy được số dư OKX`;
  }

  try {
    await bot.telegram.sendMessage(userId, message);
    console.log(`[getBalanceForUser] Đã gửi tin nhắn Telegram cho userId: ${userId}`);
  } catch (e) {
    console.error(`[getBalanceForUser] Lỗi gửi tin nhắn Telegram: ${e}`);
  }
}

// ==== Xử lý /start từ Telegram ====
bot.start((ctx) => {
  const userId = ctx.message.chat.id;
  console.log(`[bot.start] User bắt đầu tương tác: ${userId}`);
  userIds.add(userId);
  ctx.reply('Chào bạn! Đang lấy số dư từ OKX và Binance...');
  getBalanceForUser(userId);
});

// ==== Chạy định kỳ mỗi 30 giây ====
setInterval(() => {
  console.log('[Interval] Lấy số dư định kỳ cho tất cả userIds');
  for (const userId of userIds) {
    getBalanceForUser(userId);
  }
}, 30000);


// ==== Khởi động bot ====
bot.launch().then(() => {
  console.log('[bot.launch] Bot đã khởi động thành công');
}).catch((e) => {
  console.error('[bot.launch] Lỗi khi khởi động bot:', e);
});
