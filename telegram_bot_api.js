import { createClient } from "@supabase/supabase-js";
const axios = require("axios");

// Khi nhận được message từ Telegram
await axios.post("https://your-project-name.vercel.app/api/save-telegram-user", message);
const supabaseUrl = "https://tramnanrzruzvkehpydl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0"; // Key của bạn
const supabase = createClient(supabaseUrl, supabaseKey);

export default async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const body = req.body;

  const userId = body.message?.from?.id;
  const username = body.message?.from?.username || null;
  const first_name = body.message?.from?.first_name || null;
  const last_name = body.message?.from?.last_name || null;

  if (!userId) {
    res.status(400).send("No user ID");
    return;
  }

  // Kiểm tra đã có chưa
  const { data: existingUser } = await supabase
    .from("telegram_users")
    .select("id")
    .eq("telegram_id", userId)
    .single();

  if (existingUser) {
    res.status(200).send("User already exists");
    return;
  }

  // Nếu chưa có thì lưu mới
  const { error } = await supabase
    .from("telegram_users")
    .insert([
      {
        telegram_id: userId,
        username,
        first_name,
        last_name,
      },
    ]);

  if (error) {
    console.error(error);
    res.status(500).send("Error saving to database");
  } else {
    res.status(200).send("User saved successfully");
  }
};
