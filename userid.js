import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // key của bạn
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Thiếu userId' });
  }

  // Kiểm tra userId đã có chưa
  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (selectError && selectError.code !== 'PGRST116') { // PGRST116 = not found
    return res.status(500).json({ error: 'Lỗi kiểm tra userId', details: selectError.message });
  }

  if (existing) {
    return res.status(200).json({ existed: true, user: existing });
  }

  // Nếu chưa có, insert mới
  const { data, error } = await supabase
    .from('users')
    .insert([{ user_id: userId }]);

  if (error) {
    return res.status(500).json({ error: 'Lỗi thêm user mới', details: error.message });
  }

  return res.status(200).json({ existed: false, user: data });
}
