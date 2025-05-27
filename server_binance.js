// server.js dieu.1 lay usdt
const express = require('express');
const Binance = require('node-binance-api');
const app = express();
const port = 3000;


app.get('/', (req, res) => {
  res.send('Funding bot is running!');
});
const binance = new Binance().options({
  APIKEY: 'ynfUQ5PxqWQJdwPsAVREudagiF1WEN3HAENgLZIwWC3VrsNnT74wlRwY29hGXZky',
  APISECRET: 'pYTcusasHde67ajzvaOmgmSReqbZ7f0j2uwfR3VaeHai1emhuWRcacmlBCnrRglH'
});

app.get('/balance', async (req, res) => {
  try {
    const account = await binance.futuresAccount();
    const usdtAsset = account.assets.find(asset => asset.asset === 'USDT');
    res.json({ balance: usdtAsset.availableBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

//dieu 3 lay funding 
// server.js (tiếp tục)
const cron = require('node-cron');

let selectedSymbol = null;

cron.schedule('57 * * * *', async () => {
  try {
    const fundingRates = await binance.futuresFundingRate(false, 1000);
    const negativeRates = fundingRates
      .filter(rate => parseFloat(rate.fundingRate) < -0.005)
      .sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
    
    if (negativeRates.length > 0) {
      selectedSymbol = negativeRates[0].symbol;
      console.log(`Selected symbol for trading: ${selectedSymbol}`);
      // Tiếp tục với Điều 4
    } else {
      console.log('No suitable symbol found. Bot will sleep until next check.');
      selectedSymbol = null;
    }
  } catch (error) {
    console.error('Error fetching funding rates:', error);
  }
});


// server.js (tiếp tục) lay lev
async function getMaxLeverage(symbol) {
  try {
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
    const leverageFilter = symbolInfo.filters.find(f => f.filterType === 'LEVERAGE');
    return leverageFilter.maxLeverage;
  } catch (error) {
    console.error('Error fetching max leverage:', error);
    return null;
  }
}

// server.js (tiếp tục) mo short
async function placeShortOrder(symbol) {
  try {
    const account = await binance.futuresAccount();
    const usdtAsset = account.assets.find(asset => asset.asset === 'USDT');
    const balance = parseFloat(usdtAsset.availableBalance);
    const maxLeverage = await getMaxLeverage(symbol);
    const quantity = ((balance * 0.8) * maxLeverage) / await getCurrentPrice(symbol);
    await binance.futuresLeverage(symbol, maxLeverage);
    const order = await binance.futuresMarketSell(symbol, quantity.toFixed(3));
    console.log(`Short order placed for ${symbol} with quantity ${quantity.toFixed(3)}`);

    // Đặt TP/SL và hẹn giờ đóng lệnh sau 3 phút nếu chưa khớp
    setTimeout(async () => {
      const positions = await binance.futuresPositionRisk();
      const position = positions.find(p => p.symbol === symbol);
      if (parseFloat(position.positionAmt) !== 0) {
        await binance.futuresMarketBuy(symbol, Math.abs(parseFloat(position.positionAmt)));
        console.log(`Position closed for ${symbol} after 3 minutes`);
      }
    }, 180000); // 3 phút
  } catch (error) {
    console.error('Error placing short order:', error);
  }
}

async function getCurrentPrice(symbol) {
  const prices = await binance.futuresPrices();
  return parseFloat(prices[symbol]);
}


// server.js (tiếp tục) chay dung
let botRunning = false;

app.get('/start', (req, res) => {
  if (!botRunning) {
    botRunning = true;
    res.send('Bot started');
    // Gọi các hàm cần thiết để bắt đầu bot
  } else {
    res.send('Bot is already running');
  }
});

app.get('/stop', (req, res) => {
  if (botRunning) {
    botRunning = false;
    res.send('Bot stopped');
    // Gọi các hàm cần thiết để dừng bot
  } else {
    res.send('Bot is not running');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
