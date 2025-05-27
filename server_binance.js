const express = require('express');
const Binance = require('node-binance-api');
const app = express();
const port = 3000;

let logs = []; // Mảng lưu log

function addLog(message) {
  const time = new Date().toLocaleString();
  const logEntry = `[${time}] ${message}`;
  console.log(logEntry);
  logs.push(logEntry);
  // Giữ log tối đa 100 dòng
  if (logs.length > 100) logs.shift();
}

app.get('/', (req, res) => {
  res.send('Funding bot is running!');
});

const binance = new Binance().options({
  APIKEY: 'ynfUQ5PxqqWQJdwPsAVREudagiF1WEN3HAENgLZIwWC3VrsNnT74wlRwY29hGXZky',
  APISECRET: 'pYTcusasHde67ajzvaOmgmSReqbZ7f0j2uwfR3VaeHai1emhuWRcacmlBCnrRglH'
});

app.get('/balance', async (req, res) => {
  try {
    const account = await binance.futuresAccount();
    const usdtAsset = account.assets.find(asset => asset.asset === 'USDT');
    res.json({ balance: usdtAsset.availableBalance });
  } catch (error) {
    addLog('Error in /balance: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static(__dirname)); // Cho phép truy cập toàn bộ thư mục gốc

// Cron job lấy funding


const cron = require('node-cron');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let selectedSymbol = null;

cron.schedule('57 * * * *', async () => {
  try {
    const fundingRates = await binance.futuresFundingRate(false, 1000);
    const negativeRates = fundingRates
      .filter(rate => parseFloat(rate.fundingRate) < -0.005)
      .sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
    
    if (negativeRates.length > 0) {
  const best = negativeRates[0];
  selectedSymbol = best.symbol;

  const fundingTime = best.fundingTime;
  const now = Date.now();
  const waitTime = fundingTime - now;

  addLog(`>>> Chọn được coin: ${selectedSymbol} với funding rate ${best.fundingRate}`);
  if (waitTime > 0) {
    addLog(`>>> Sẽ mở lệnh sau ${(waitTime / 1000).toFixed(1)} giây nữa`);
    await delay(waitTime);
  }

  await delay(500); // Đợi thêm sau funding

  await placeShortOrder(selectedSymbol);

} else {
  addLog('>>> Không có coin sắp tới mở lệnh đâu. Đi uống bia chú em ơi!');
  selectedSymbol = null;
}
    }
  } catch (error) {
    console.error('Error fetching funding rates:', error);
  }
});

async function getMaxLeverage(symbol) {
  try {
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
    const leverageFilter = symbolInfo.filters.find(f => f.filterType === 'LEVERAGE');
    return leverageFilter.maxLeverage;
  } catch (error) {
    addLog('Error fetching max leverage: ' + error.message);
    return null;
  }
}

async function getCurrentPrice(symbol) {
  const prices = await binance.futuresPrices();
  return parseFloat(prices[symbol]);
}

async function placeShortOrder(symbol) {
  try {
    const account = await binance.futuresAccount();
    const usdtAsset = account.assets.find(asset => asset.asset === 'USDT');
    const balance = parseFloat(usdtAsset.availableBalance);

    if (balance < 0.15) {
      addLog(`>>> Êi bơm lúa đi. Không đủ $ mở lệnh kìa ${symbol}. Còn có: ${balance} USDT`);
      return;
    }

    const maxLeverage = await getMaxLeverage(symbol);
    await binance.futuresLeverage(symbol, maxLeverage);

    const price = await getCurrentPrice(symbol);
    const orderValue = balance * 0.8;
    const quantity = (orderValue * maxLeverage) / price;

    const order = await binance.futuresMarketSell(symbol, quantity.toFixed(3));

    addLog(`>>> Đã mở lệnh SHORT ${symbol}`);
    addLog(`- Khối lượng: ${quantity.toFixed(3)}`);
    addLog(`- Đòn bẩy: ${maxLeverage}`);
    addLog(`- Giá vào: ${price}`);
    addLog(`- Giá trị lệnh: ${(quantity * price).toFixed(2)} USDT`);

    const entryPrice = parseFloat(order.avgFillPrice || price);

    setTimeout(async () => {
      const positions = await binance.futuresPositionRisk();
      const position = positions.find(p => p.symbol === symbol);

      if (parseFloat(position.positionAmt) !== 0) {
        const closePrice = await getCurrentPrice(symbol);
        const qtyToClose = Math.abs(parseFloat(position.positionAmt));
        await binance.futuresMarketBuy(symbol, qtyToClose);

        const pnl = ((entryPrice - closePrice) * qtyToClose).toFixed(2);
        const direction = closePrice < entryPrice ? 'TP' : closePrice > entryPrice ? 'SL' : 'Không lời lãi';

        addLog(`>>> Không khớp TP/SL, lệnh đã đóng sau 3 phút:`);
        addLog(`- ${symbol} | Khối lượng: ${qtyToClose} | Đòn bẩy: ${maxLeverage}`);
        addLog(`- Giá vào: ${entryPrice} | Giá ra: ${closePrice}`);
        addLog(`- Kết quả: ${direction}, Lợi nhuận: ${pnl} USDT`);
      }
    }, 180000);

  } catch (error) {
    addLog(`Lỗi khi mở lệnh ${symbol}: ${error.message}`);
  }
}

let botRunning = false;

app.get('/start', (req, res) => {
  if (!botRunning) {
    botRunning = true;
    addLog('Bot started');
    res.send('Bot started');
  } else {
    res.send('Bot is already running');
  }
});

app.get('/stop', (req, res) => {
  if (botRunning) {
    botRunning = false;
    addLog('Bot stopped');
    res.send('Bot stopped');
  } else {
    res.send('Bot is not running');
  }
});

// Route xem log
app.get('/logs', (req, res) => {
  res.json(logs); // Gửi log đúng định dạng JSON để HTML đọc được
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  addLog(`Server started on port ${port}`);
});
