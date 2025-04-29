import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { user_id, apikey, pass } = req.body;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

  const { data, error } = await supabase
    .from('users')
    .upsert([
      { user_id, apikey, pass }
    ], { onConflict: ['user_id'] });

  if (error) return res.status(500).json({ error });
  return res.status(200).json({ data });
}

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // Rút gọn cho bảo mật
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });
  }

  const { info } = req.body;

  if (!info || !info.user_id) {
    return res.status(400).json({ error: 'Thiếu user_id hoặc dữ liệu info' });
  }

  try {
    // Xóa các dòng cũ có cùng user_id
    await supabase
      .from('users')
      .delete()
      .eq('user_id', info.user_id);

    // Thêm dòng mới
    const { data, error } = await supabase
      .from('users')
      .insert([info]);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Supabase insert thất bại', details: error.message });
    }

    return res.status(200).json({ message: 'Gửi thành công', data });
  } catch (err) {
    console.error('Unknown error:', err);
    return res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
}
