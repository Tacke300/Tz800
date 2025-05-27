const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { runMainBot, stopMainBot, getStatus } = require('./bot');
require('dotenv').config();

const app = express();
const PORT = 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.get('/start/:type', async (req, res) => {
  const { type } = req.params;
  const { user_id, amount, lev, tp, sl } = req.query;

  if (!user_id) return res.status(400).send('Thiếu user_id');

  const { data, error } = await supabase
    .from('users')
    .select('apikey_binance, secret_binance, usdt_binance')
    .eq('user_id', user_id)
    .single();

  if (error || !data) return res.status(401).send('Không tìm thấy user');

  const input = {
    API_KEY: data.apikey_binance,
    API_SECRET: data.secret_binance,
    usdt: data.usdt_binance,
    amount,
    lev,
    tp,
    sl,
    user_id
  };

  runMainBot(type, input);
  res.send(`Bot ${type} đã khởi động cho user ${user_id}`);
});

app.get('/stop', (req, res) => {
  stopMainBot();
  res.send('Bot đã dừng.');
});

app.get('/status', (req, res) => {
  res.send(getStatus());
});

app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT}`);
});
