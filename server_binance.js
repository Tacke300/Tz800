const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const Binance = require('node-binance-api');

const app = express();
app.use(express.json());

// Supabase config - thay bằng của bạn
const supabase = createClient(
  'https://tramnanrzruzvkehpydl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'
);

// Quản lý trạng thái bot cho từng user_id
const runningBots = {}; // { user_id: bot_type }

// Helper sleep
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Tạo client Binance cho user
function createBinanceClient(apiKey, apiSecret) {
  return new Binance().options({
    APIKEY: apiKey,
    APISECRET: apiSecret,
    useServerTime: true,
  });
}

// API: lấy trạng thái bot cho user
app.get('/api/bot-status', (req, res) => {
  const user_id = req.query.user_id;
  const runningBot = runningBots[user_id] || null;
  res.json({ runningBot });
});

// API: dừng bot
// Giữ nguyên phần import và khởi tạo như cũ...

// ...

app.post('/api/run-bot', async (req, res) => {
  const { user_id, bot_type, params } = req.body;
  console.log(`[${user_id}] Yêu cầu chạy bot: ${bot_type} với params:`, params);

  if (runningBots[user_id]) {
    console.warn(`[${user_id}] Đã có bot đang chạy: ${runningBots[user_id].bot_type}`);
    return res.json({ error: 'Chỉ được chạy 1 bot cùng lúc. Vui lòng dừng bot hiện tại trước.' });
  }

  runningBots[user_id] = { bot_type, intervalId: null };

  try {
    console.log(`[${user_id}] Lấy thông tin user từ Supabase...`);
    const { data: user, error } = await supabase
      .from('users')
      .select('apikey_binance, secret_binance, usdt_binance, pnl_today')
      .eq('user_id', user_id)
      .single();

    if (error || !user) {
      console.error(`[${user_id}] Lỗi khi lấy user:`, error);
      throw new Error('Không tìm thấy user hoặc lỗi supabase');
    }
    console.log(`[${user_id}] User data lấy được:`, user);

    const binance = createBinanceClient(user.apikey_binance, user.secret_binance);
    console.log(`[${user_id}] Tạo client Binance thành công`);

    const account = await binance.futuresAccount();
    const usdtAsset = account.assets.find(a => a.asset === 'USDT');
    const usdtBalance = usdtAsset ? parseFloat(usdtAsset.walletBalance) : 0;
    console.log(`[${user_id}] Số dư USDT trên Binance Futures: ${usdtBalance}`);

    await supabase.from('users').update({ usdt_binance: usdtBalance }).eq('user_id', user_id);

    const fundings = await binance.futuresFundingRate();
    const posRisk = await binance.futuresPositionRisk();
    console.log(`[${user_id}] Lấy funding và vị thế thành công, tổng funding coin: ${fundings.length}`);

    const negativeFundings = fundings.filter(f => parseFloat(f.fundingRate) < -0.005);
    console.log(`[${user_id}] Coin funding âm < -0.005: ${negativeFundings.length}`);

    if (negativeFundings.length === 0) {
      console.log(`[${user_id}] Không có coin funding âm đủ điều kiện`);
      delete runningBots[user_id];
      return res.json({ message: 'Không có coin funding âm < -0.005' });
    }

    const now = Date.now();
    let candidates = negativeFundings.filter(f => f.fundingTime > now);
    console.log(`[${user_id}] Coin sắp trả funding: ${candidates.length}`);

    if (candidates.length === 0) {
      console.log(`[${user_id}] Chưa tới giờ funding cho coin nào`);
      delete runningBots[user_id];
      return res.json({ message: 'Chưa tới giờ funding cho coin nào cả, bot sẽ ngủ' });
    }

    candidates.sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
    const target = candidates[0];
    const symbol = target.symbol;
    const fundingTime = target.fundingTime;
    const fundingRate = parseFloat(target.fundingRate);

    console.log(`[${user_id}] Chọn coin chạy bot: ${symbol}, fundingRate: ${fundingRate}, fundingTime: ${new Date(fundingTime).toLocaleString()}`);

    let leverage = 20;
    const pos = posRisk.find(p => p.symbol === symbol);
    if (pos && pos.leverage) {
      leverage = parseInt(pos.leverage);
    }
    console.log(`[${user_id}] Leverage hiện tại của ${symbol}: ${leverage}`);

    let investPercent = 0;
    if (bot_type === 'bot_mini') investPercent = 0.3;
    else if (bot_type === 'bot_big') investPercent = 0.9;
    else if (bot_type === 'bot_set' && params?.investAmount) investPercent = params.investAmount / usdtBalance;

    let userLeverage = leverage;
    let tpPercent, slPercent;
    if (bot_type === 'bot_set') {
      userLeverage = Math.min(Math.max(parseInt(params.leverage), 1), 100);
      tpPercent = Math.min(Math.max(parseFloat(params.tpPercent) / 100, 0), 10);
      slPercent = Math.min(Math.max(parseFloat(params.slPercent) / 100, 0), 10);
      investPercent = Math.min(Math.max(parseFloat(params.investAmount) / usdtBalance, 0), 1);
    } else {
      tpPercent = getTpSlPercent(bot_type, userLeverage);
      slPercent = tpPercent;
    }
    console.log(`[${user_id}] Đòn bẩy dùng cho bot: ${userLeverage}, TP%: ${tpPercent}, SL%: ${slPercent}, Tỉ lệ vốn đầu tư: ${investPercent}`);

    await binance.futuresLeverage(symbol, userLeverage);
    console.log(`[${user_id}] Đã set leverage ${userLeverage} cho ${symbol}`);

    const openPosition = async () => {
      const qty = ((usdtBalance * investPercent) / 1) * userLeverage;
      try {
        await binance.futuresMarginType(symbol, 'ISOLATED');
        console.log(`[${user_id}] Đặt margin mode ISOLATED cho ${symbol}`);
        await binance.futuresMarketSell(symbol, qty);
        console.log(`[${user_id}] Mở lệnh SHORT ${symbol} với qty ${qty}`);

        // TODO: Đặt TP/SL

      } catch (error) {
        console.error(`[${user_id}] Lỗi khi mở lệnh SHORT:`, error);
      }
    };

    const delay = fundingTime - Date.now() + 500;
    console.log(`[${user_id}] Delay mở lệnh sau (ms): ${delay}`);

    if (delay > 0) {
      setTimeout(openPosition, delay);
    } else {
      openPosition();
    }

    setTimeout(async () => {
      try {
        const qty = ((usdtBalance * investPercent) / 1) * userLeverage;
        await binance.futuresMarketBuy(symbol, qty);
        console.log(`[${user_id}] Đóng lệnh SHORT ${symbol} sau 3 phút`);
        // TODO: Cập nhật pnl_today supabase

      } catch (e) {
        console.error(`[${user_id}] Lỗi khi đóng lệnh SHORT:`, e);
      }
      delete runningBots[user_id];
      console.log(`[${user_id}] Bot đã kết thúc và xóa khỏi runningBots`);
    }, 3 * 60 * 1000);

    runningBots[user_id].intervalId = setInterval(() => {
      console.log(`[${user_id}] Bot ${bot_type} đang chạy trên coin ${symbol}`);
    }, 60000);

    res.json({ message: `Bot ${bot_type} đã chạy trên coin ${symbol}`, symbol, fundingRate, leverage: userLeverage });
  } catch (error) {
    console.error(`[${user_id}] Lỗi khi chạy bot:`, error);
    delete runningBots[user_id];
    res.json({ error: error.message });
  }
});
