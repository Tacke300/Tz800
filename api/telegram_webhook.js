import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xxxxx.supabase.co";
const supabaseKey = "YOUR_SUPABASE_SERVICE_ROLE_KEY";
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

  const { data, error } = await supabase
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
    res.status(200).send("Saved");
  }
};
