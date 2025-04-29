import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tramnanrzruzvkehpydl.supabase.co '; // <-- Thay URL Supabase của bạn
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'; // <-- Thay Anon Key của bạn
const supabase = createClient(supabaseUrl, supabaseKey);


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { info } = req.body;

  if (!info) {
    return res.status(400).json({ error: 'Missing info' });
  }

  const { data, error } = await supabase
    .from('messages')
    .insert([{ info }]);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ message: 'Data inserted successfully', data });
}
