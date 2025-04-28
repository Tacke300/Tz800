// /api/save-telegram-id.js

import { createClient } from "@supabase/supabase-js";

// Thay bằng supabase url và key của bạn
const supabaseUrl = "https://tramnanrzruzvkehpydl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0"; 
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

  try {
    // Kiểm tra xem user đã có trong database chưa
    const { data: existingUser, error: checkError } = await supabase
      .from("telegram_users")
      .select("telegram_id")
      .eq("telegram_id", userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    if (existingUser) {
      // Nếu đã tồn tại
      res.status(200).send("User already exists");
      return;
    }

    // Nếu chưa tồn tại thì insert
    const { error: insertError } = await supabase
      .from("telegram_users")
      .insert([
        {
          telegram_id: userId,
          username,
          first_name,
          last_name,
        },
      ]);

    if (insertError) {
      throw insertError;
    }

    res.status(200).send("Saved new user");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
};
