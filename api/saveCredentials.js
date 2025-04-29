import { supabase } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });
  }

  const { userId, apikey, secret, pass } = req.body;

  if (!userId || !apikey || !secret || !pass) {
    return res.status(400).json({ error: 'Thiếu thông tin cần thiết' });
  }

  const { error } = await supabase
    .from('users')
    .upsert([{ id: userId, apikey, secret, pass }]);

  if (error) {
    return res.status(500).json({ error: 'Lỗi Supabase: ' + error.message });
  }

  return res.status(200).json({ message: 'Lưu thành công!' });
}
