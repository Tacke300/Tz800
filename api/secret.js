import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // key của bạn
const supabase = createClient(supabaseUrl, supabaseKey);


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end(); // Only accept POST
  }

  const { secret } = req.body;
  if (!secret) {
    return res.status(400).json({ error: 'ERROR SECRET' });
  }

  try {
    // Insert vào Supabase
    const { data, error } = await supabase
      .from('users') // Tên table Supabase
      .upsert([{ userId: userId,secret }]);

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
