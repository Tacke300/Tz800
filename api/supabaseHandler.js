import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // Ẩn đi khi public
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });
  }

  const { user_id, ...info } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'Thiếu user_id' });
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .upsert([{ user_id, ...info }], { onConflict: ['user_id'] });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Supabase upsert thất bại' });
    }

    return res.status(200).json({ message: 'Đã cập nhật thành công', data });
  } catch (err) {
    console.error('Unknown error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}
