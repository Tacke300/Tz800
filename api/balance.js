import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// KHÔNG dùng NEXT_PUBLIC_ trong API route, hãy dùng biến thường (xem chú thích bên dưới)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'Thiếu user_id' });

  const { data, error } = await supabase
    .from('users')
    .select('apikey, secret, pass')
    .eq('user_id', user_id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Không tìm thấy user' });
  }

  const { apikey, secret, pass } = data;

  console.log("=== Supabase Data ===");
  console.log("APIKEY:", apikey);
  console.log("SECRET:", secret);
  console.log("PASSPHRASE:", pass);

  const timestamp = new Date().toISOString();
  const sign = crypto
    .createHmac('sha256', secret)
    .update(timestamp + 'GET' + '/api/v5/account/balance')
    .digest('base64');

  const resOkx = await fetch('https://www.okx.com/api/v5/account/balance', {
    headers: {
      'OK-ACCESS-KEY': apikey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': pass,
      'Content-Type': 'application/json',
    },
  });

  const raw = await resOkx.text();
  console.log("=== OKX Raw Response ===");
  console.log(raw);

  try {
    const json = JSON.parse(raw);
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: 'Không parse được JSON từ OKX', raw });
  }
}
