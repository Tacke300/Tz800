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

// Hàm load API từ Supabase
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

// (Phần còn lại là code gốc của bạn không đổi)
