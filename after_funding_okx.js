const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const schedule = require('node-schedule');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.send('OK');
});


// Supabase config
const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYXV0aCIsImlhdCI6MTY5NjAzMzYzNCwiZXhwIjoxOTExNjk5NjM0fQ.2FtKt9gfDUe4Q9zDN6JhPKuvf-v19nAPhFj2wTy6-9k';
const supabase = createClient(supabaseUrl, supabaseKey);

let botRunning = false;
let intervalJob = null;
let investment = 0;

let APIKEY = '';
let APISECRET = '';
let APIPASSPHRASE = '';

// Load API từ Supabase
async function loadApiFromSupabase(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('apikey_okx, secret_okx, pass_okx')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.error('Lỗi load API:', error);
      return false;
    }

    APIKEY = data.apikey_okx;
    APISECRET = data.secret_okx;
    APIPASSPHRASE = data.pass_okx;

    console.log('Đã load API thành công từ Supabase cho user:', userId);
    return true;
  } catch (err) {
    console.error('Lỗi Supabase:', err.message);
    return false;
  }
}

app.post('/start', async (req, res) => {
  console.log('req.body:', req.body); // kiểm tra xem JSON có vào không

  const userId = req.body.user_id;
  const usdt = req.body.usdt;

  console.log('userId:', userId, 'usdt:', usdt);

  if (!userId) return res.send('Thiếu user_id');

  const ok = await loadApiFromSupabase(userId);
  if (!ok) return res.send('Lỗi khi lấy API từ Supabase');

  if (botRunning) return res.send('Bot đã chạy rồi');

  investment = parseFloat(usdt);
  botRunning = true;

  // Có thể cài đặt job chạy bot tại đây nếu cần

  res.send('Bot đã khởi động');
});
// Cuối file:
app.listen(3001, '0.0.0.0', () => {
  console.log('Server đang chạy ở http://0.0.0.0:3001');
});
