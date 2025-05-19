const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const schedule = require('node-schedule');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

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
  console.log('Nhận request /start', req.body);  // thêm log này
  const userId = req.body.user_id;
  investment = parseFloat(req.body.usdt);

  if (!userId) return res.send('Thiếu user_id');

  const ok = await loadApiFromSupabase(userId);
  if (!ok) return res.send('Lỗi khi lấy API từ Supabase');

  if (botRunning) return res.send('Bot đã chạy rồi');

  botRunning = true;
  // Gọi hàm startBot gốc của bạn ở đây
  res.send('Bot đã khởi động');
});
// Các route và logic gốc KHÔNG BỊ ĐỤNG VÀO
// (Phần này bạn có thể dán tiếp các hàm gốc như startBot, stopBot, logic OKX, lệnh funding...)

// Cuối file:
app.listen(PORT, () => {
  console.log(`Server đang chạy ở http://localhost:${PORT}`);
});
