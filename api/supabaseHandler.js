import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // Ẩn đi khi public
const supabase = createClient(supabaseUrl, supabaseKey);


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, apikey, secret, pass } = req.body;

  const { error } = await supabase
    .from('users')
    .upsert([{ user_id, apikey, secret, pass }], {
      onConflict: ['user_id']  // Cập nhật nếu user_id đã tồn tại
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
}
