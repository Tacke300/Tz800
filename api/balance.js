// pages/api/balance.js

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Hàm ký OKX
function sign(timestamp, method, requestPath, body, secretKey) {
  const prehash = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', secretKey)
               .update(prehash)
               .digest('base64');
}

export default async function handler(req, res) {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', user_id)
    .single();

  if (error || !user) return res.status(500).json({ error: 'User not found' });

  const { apikey, secret, pass } = user;

  const timestamp = new Date().toISOString();
  const method = 'GET';
  const requestPath = '/api/v5/account/balance';
  const body = '';
  const signature = sign(timestamp, method, requestPath, body, secret);

  const headers = {
    'OK-ACCESS-KEY': apikey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': pass,
    'Content-Type': 'application/json'
  };

  const okxRes = await fetch(`https://www.okx.com${requestPath}`, {
    method,
    headers
  });

  const okxData = await okxRes.json();
  res.status(200).json(okxData);
}
