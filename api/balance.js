// okx-balance.js

import crypto from 'crypto';
import fetch from 'node-fetch'; // Nếu bạn dùng môi trường cần import fetch

// Hàm ký OKX HMAC SHA256
function sign(timestamp, method, requestPath, body, secretKey) {
  const prehash = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', secretKey)
               .update(prehash)
               .digest('base64');
}

// Hàm lấy số dư tài khoản
async function getBalance(apikey, secret, passphrase) {
  const timestamp = new Date().toISOString();
  const method = 'GET';
  const requestPath = '/api/v5/account/balance';
  const body = '';

  const signature = sign(timestamp, method, requestPath, body, secret);

  const headers = {
    'OK-ACCESS-KEY': apikey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  };

  const response = await fetch(`https://www.okx.com${requestPath}`, {
    method,
    headers
  });

  const data = await response.json();
  return data;
}

// THAY API KEY CỦA BẠN Ở ĐÂY
const apikey = 'YOUR_API_KEY';
const secret = 'YOUR_SECRET';
const passphrase = 'YOUR_PASSPHRASE';

// Gọi thử hàm
getBalance(apikey, secret, passphrase)
  .then(res => console.log('Số dư:', JSON.stringify(res, null, 2)))
  .catch(err => console.error('Lỗi:', err));
