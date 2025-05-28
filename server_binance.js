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
addLog('>>> [Cron] Bắt đầu chạy rồi nè!');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

let selectedSymbol = null;
// cuoi file 555555
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  addLog(`Server started on port ${port}`);
});
// kkkkkkkkk
let botRunning = false; // Cờ điều khiển bot

// Cron chạy mỗi phút nhưng chỉ thực thi khi botRunning = true
cron.schedule('*/1 * * * *', async () => {
  if (!botRunning) {
    addLog('[Cron] Bot đang tắt, không kiểm tra funding.');
    return;
  }

  addLog(`>>> [Cron] Đã tới giờ hoàng đạo kiếm tiền uống bia, đang kiểm tra funding...`);
  //await check_and_execute_funding_strategy();
  try {
    const fundingRates = await binance.futuresFundingRate();
    addLog(`>>> Đã lấy ${fundingRates.length} coin từ API Binance`);
    const negativeRates = fundingRates
      .filter(rate => parseFloat(rate.fundingRate) < -0.0001)
      .sort((a, b) => parseFloat(a.fundingRate) - parseFloat(b.fundingRate));
    
    if (negativeRates.length > 0) {
      const best = negativeRates[0];
      selectedSymbol = best.symbol;

      const fundingTime = best.fundingTime;
      const now = Date.now();
      const waitTime = fundingTime + 500 - now;

      addLog(`>>> Chọn được coin: ${selectedSymbol} với funding rate ${best.fundingRate}`);
      if (waitTime > 0) {
        addLog(`>>> Sẽ mở lệnh sau ${(waitTime / 1000).toFixed(1)} giây nữa`);
        await delay(waitTime);
      }

      await delay(500);
      await placeShortOrder(selectedSymbol);
    } else {
      addLog('>>> Không có coin sắp tới mở lệnh đâu. Đi uống bia chú em ơi!');
      selectedSymbol = null;
    }
  } catch (error) {
    addLog('Lỗi khi kiểm tra funding: ' + error.message);
  }
});
async function getMaxLeverage(symbol) {
  try {
    const leverageInfo = await binance.futuresLeverageBracket(symbol);
    // leverageInfo là mảng, mỗi phần tử có maxLeverage
    // Lấy maxLeverage lớn nhất trong mảng (thường là phần tử đầu)
    if (leverageInfo && leverageInfo.length > 0) {
      return leverageInfo[0].brackets[0].initialLeverage; 
      // hoặc maxLeverage là leverageInfo[0].brackets[0].initialLeverage hoặc leverageInfo[0].maxLeverage (tùy cấu trúc)
    }
    return null;
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
    const capital = balance * 0.8;
    const quantity = (capital * maxLeverage) / price;

    // Mở lệnh SHORT bằng market
    const order = await binance.futuresMarketSell(symbol, quantity.toFixed(3));
    addLog(`>>> Đã mở lệnh SHORT ${symbol}`);
    addLog(`- Khối lượng: ${quantity.toFixed(3)}`);
    addLog(`- Đòn bẩy: ${maxLeverage}`);
    addLog(`- Giá vào: ${price}`);
    addLog(`- Giá trị lệnh: ${(quantity * price).toFixed(2)} USDT`);

    const entryPrice = parseFloat(order.avgFillPrice || price);

    // Tính giá TP và SL (giá trị TP/SL theo leverage trên vốn)
    const tpSlValue = (maxLeverage / 100) * capital; // ví dụ 50% là leverage/100, bạn chỉnh lại nếu cần

    // TP/SL là giá, vì short nên:
    // PnL = (entryPrice - currentPrice) * qty
    // TP khi giá <= entryPrice - tpSlValue/qty
    // SL khi giá >= entryPrice + tpSlValue/qty
    const tpPrice = entryPrice - tpSlValue / quantity;
    const slPrice = entryPrice + tpSlValue / quantity;

    addLog(`>>> Giá TP: ${tpPrice.toFixed(2)}, Giá SL: ${slPrice.toFixed(2)}`);

    let checkCount = 0;
    const maxCheck = 180; // 3 phút = 180 giây

    const checkInterval = setInterval(async () => {
      try {
        checkCount++;
        const currentPrice = await getCurrentPrice(symbol);

        if (currentPrice <= tpPrice) {
          addLog(`>>> Giá đạt TP: ${currentPrice.toFixed(2)}. Đóng lệnh SHORT ${symbol} ngay!`);
          clearInterval(checkInterval);
          await closeShortPosition(symbol);
        } else if (currentPrice >= slPrice) {
          addLog(`>>> Giá đạt SL: ${currentPrice.toFixed(2)}. Đóng lệnh SHORT ${symbol} ngay!`);
          clearInterval(checkInterval);
          await closeShortPosition(symbol);
        } else if (checkCount >= maxCheck) {
          addLog(`>>> Hết thời gian 3 phút. Đóng lệnh SHORT ${symbol}`);
          clearInterval(checkInterval);
          await closeShortPosition(symbol);
        }
      } catch (error) {
        addLog('Lỗi trong check giá: ' + error.message);
      }
    }, 1000);

  } catch (error) {
    addLog('Lỗi mở lệnh short: ' + error.message);
  }
}

async function closeShortPosition(symbol) {
  try {
    const positions = await binance.futuresPositionRisk();
    const position = positions.find(p => p.symbol === symbol);

    if (position && parseFloat(position.positionAmt) !== 0) {
      const closePrice = await getCurrentPrice(symbol);
      const qtyToClose = Math.abs(parseFloat(position.positionAmt));
      await binance.futuresMarketBuy(symbol, qtyToClose);

      const entryPrice = parseFloat(position.entryPrice);
      const pnl = (entryPrice - closePrice) * qtyToClose;

      addLog(`>>> Đã đóng lệnh SHORT ${symbol} tại giá ${closePrice.toFixed(2)}`);
      addLog(`>>> Lợi nhuận: ${pnl.toFixed(2)} USDT`);
    } else {
      addLog('>>> Không có vị thế SHORT để đóng.');
    }
  } catch (error) {
    addLog('Lỗi khi đóng lệnh: ' + error.message);
  }
}


app.get('/start', (req, res) => {
  if (!botRunning) {
    botRunning = true;
    addLog('Bot bắt đầu múa');
    res.send('Bot started');
  } else {
    res.send('Bot is already running');
  }
});

app.get('/stop', (req, res) => {
  if (botRunning) {
    botRunning = false;
    addLog('Bot đã đắp mộ cuộc tình');
    res.send('Bot stopped');
  } else {
    res.send('Bot is not running');
  }
});
app.get('/status', (req, res) => {
  res.json({
    running: botRunning,
    currentSymbol: selectedSymbol,
    logCount: logs.length
  });
});
// Route xem log
app.get('/logs', (req, res) => {
  const htmlLogs = logs.map(log => `<div class="log-entry">${log}</div>`).join('');
  res.send(`
    <html>
      <head>
        <title>Funding Bot Logs</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            background-color: #f9f9f9;
            padding: 30px;
            color: #111;
          }
          h2 {
            color: #111;
            border-bottom: 2px solid #ccc;
            padding-bottom: 5px;
            margin-bottom: 20px;
          }
          .log-entry {
            background: #fff;
            padding: 10px 15px;
            margin: 10px 0;
            border-left: 4px solid #999;
            border-radius: 4px;
            box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            white-space: pre-wrap;
            color: #222;
          }
        </style>
      </head>
      <body>
        <h2>📜 Funding Bot Logs</h2>
        ${htmlLogs}
      </body>
    </html>
  `);
});
