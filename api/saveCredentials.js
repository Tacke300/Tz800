import { createClient } from '@supabase/supabase-js';


export default async function handler(req, res) {
  const { userId, apikey, secret, pass } = req.body;

  if (!userId || !apikey || !secret || !pass) {
    return res.status(400).json({ error: 'Thiếu thông tin cần thiết' });
  }

  const { error } = await supabase
    .from('users')
    .upsert([{ id: userId, apikey, secret, pass }]);

  if (error) return res.status(500).json({ error: 'Lỗi lưu thông tin' });
  return res.status(200).json({ message: 'Đã lưu thông tin thành công!' });
}
