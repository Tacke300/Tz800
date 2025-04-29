import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0';

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Only accept POST
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Thiếu userId' });
  }

  try {
    // Kiểm tra xem user_id đã tồn tại chưa
    const { data: existing, error: checkError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', userId)
      .single(); // chỉ lấy 1 bản ghi

    if (checkError && checkError.code !== 'PGRST116') {
      // Lỗi khác ngoài "not found"
      console.error('Lỗi khi kiểm tra user:', checkError);
      return res.status(500).json({ error: 'Lỗi kiểm tra dữ liệu' });
    }

    if (existing) {
      // Nếu đã tồn tại thì không làm gì cả
      return res.status(200).json({ message: 'User đã tồn tại, không cần insert.' });
    }

    // Nếu chưa có thì insert
    const { data, error } = await supabase
      .from('users')
      .upsert([{ user_id: userId }]);

    if (error) {
      console.error('Lỗi insert Supabase:', error);
      return res.status(500).json({ error: 'Lỗi lưu dữ liệu' });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Lỗi server:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}
