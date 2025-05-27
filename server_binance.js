// server.js
const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const { runMainBot, stopMainBot, getStatus } = require('./bot');

app.get('/start', async (req, res) => {
  const type = req.query.type;
  if (type === 'set') {
    const { lev, tp, sl, amount } = req.query;
    await runMainBot('set', { lev, tp, sl, amount });
  } else {
    await runMainBot(type);
  }
  res.send(`Đã chạy bot ${type}`);
});

app.get('/stop', (req, res) => {
  stopMainBot();
  res.send('Đã dừng bot.');
});

app.get('/status', (req, res) => {
  res.send(getStatus());
});

app.listen(port, () => {
  console.log(`Bot server đang chạy tại http://localhost:${port}`);
});
