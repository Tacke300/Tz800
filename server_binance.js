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
      console.log(`Selected symbol for trading: ${selectedSymbol}`);

      const fundingTime = best.fundingTime; // timestamp in ms
      const now = Date.now();

      const waitTime = fundingTime - now;
      if (waitTime > 0) {
        console.log(`Waiting ${waitTime} ms until funding time`);
        await delay(waitTime);
      }

      // Đợi thêm 0.5 giây để chắc chắn funding được trả
      await delay(500);

      // Mở lệnh short tại đây
      await placeShortOrder(selectedSymbol);

    } else {
      console.log('No suitable symbol found. Bot will sleep until next check.');
      selectedSymbol = null;
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
    const maxLeverage = await getMaxLeverage(symbol);
    const quantity = ((balance * 0.8) * maxLeverage) / await getCurrentPrice(symbol);
    await binance.futuresLeverage(symbol, maxLeverage);
    const order = await binance.futuresMarketSell(symbol, quantity.toFixed(3));
    addLog(`Short order placed for ${symbol} with quantity ${quantity.toFixed(3)}`);

    setTimeout(async () => {
      const positions = await binance.futuresPositionRisk();
      const position = positions.find(p => p.symbol === symbol);
      if (parseFloat(position.positionAmt) !== 0) {
        await binance.futuresMarketBuy(symbol, Math.abs(parseFloat(position.positionAmt)));
        addLog(`Position closed for ${symbol} after 3 minutes`);
      }
    }, 180000); // 3 phút
  } catch (error) {
    addLog('Error placing short order: ' + error.message);
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
