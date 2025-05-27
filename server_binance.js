import express from 'express';
import { createClient } from '@supabase/supabase-js';
import Binance from 'node-binance-api';

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
app.post('/api/stop-bot', (req, res) => {
  const { user_id } = req.body;
  if (runningBots[user_id]) {
    delete runningBots[user_id];
    return res.json({ message: 'Đã dừng bot thành công' });
  }
  res.json({ message: 'Không có bot nào đang chạy để dừng' });
});

// API: chạy bot (bot_mini, bot_big, bot_set)
app.post('/api/run-bot', async (req, res) => {
  const { user_id, bot_type, params } = req.body;

  if (runningBots[user_id]) {
    return res.json({ error: 'Chỉ được chạy 1 bot cùng lúc. Vui lòng dừng bot hiện tại trước.' });
  }

  runningBots[user_id] = bot_type;
  try {
    // 1. Lấy thông tin user từ supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('apikey_binance, secret_binance, usdt_binance, pnl_today')
      .eq('user_id', user_id)
      .single();
    if (error || !user) throw new Error('Không tìm thấy user hoặc lỗi supabase');

    // 2. Tạo client Binance
    const binance = createBinanceClient(user.apikey_binance, user.secret_binance);

    // 3. Cập nhật số dư USDT thực tế từ Binance và lưu lại supabase
    const account = await binance.futuresAccount();
    const usdtAsset = account.assets.find(a => a.asset === 'USDT');
    const usdtBalance = usdtAsset ? parseFloat(usdtAsset.walletBalance) : 0;
    await supabase.from('users').update({ usdt_binance: usdtBalance }).eq('user_id', user_id);

    // 4. Lấy funding rate hiện tại (limit 100)
    const fundings = await binance.futuresFundingRate();

    // 5. Lọc funding âm < -0.005
    const negativeFundings = fundings.filter(f => parseFloat(f.fundingRate) < -0.005);

    if (negativeFundings.length === 0) {
      delete runningBots[user_id];
      return res.json({ message: 'Không có coin funding âm < -0.005' });
    }

    // 6. Chọn coin sắp tới trả funding có funding âm nhất
    const now = Date.now();
    const candidates = negativeFundings.filter(f => f.fundingTime > now);
    if (candidates.length === 0) {
      delete runningBots[user_id];
      return res.json({ message: 'Chưa tới giờ funding cho coin nào cả, bot sẽ ngủ' });
    }
    candidates.sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
    const target = candidates[0];
    const symbol = target.symbol;
    const fundingTime = target.fundingTime;

    // 7. Lấy leverage hiện tại của symbol (mặc định 20 nếu ko lấy được)
    const posRisk = await binance.futuresPositionRisk();
    let leverage = 20;
    const pos = posRisk.find(p => p.symbol === symbol);
    if (pos && pos.leverage) {
      leverage = parseInt(pos.leverage);
    }

    // 8. Gửi lệnh LONG với thông tin từ params
    const { amount, tp, sl } = params; // params từ frontend

    // Mở lệnh market LONG
    await binance.futuresLeverage(symbol, leverage);
    await binance.futuresMarketBuy(symbol, amount);

    // Cài TP/SL (giả sử lấy giá entry để tính)
    const positions = await binance.futuresPositionRisk();
    const position = positions.find(p => p.symbol === symbol);
    const entryPrice = parseFloat(position.entryPrice);
    const takeProfit = entryPrice * (1 + tp / 100);
    const stopLoss = entryPrice * (1 - sl / 100);

    await binance.futuresSell(symbol, amount, takeProfit, { reduceOnly: true });
    await binance.futuresSell(symbol, amount, stopLoss, { reduceOnly: true, stopPrice: stopLoss });

    return res.json({ message: `Đã mở lệnh LONG ${symbol} với đòn bẩy ${leverage}x` });
  } catch (err) {
    console.error(err);
    delete runningBots[user_id];
    return res.status(500).json({ error: 'Lỗi khi chạy bot: ' + err.message });
  }
  app.listen(3000, () => {
  console.log('Server running on port 3000');
});
});
