import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { user_id, apikey, secret, pass } = req.body;

  const { data, error } = await supabase
  .from('users')
  .upsert([{ user_id, apikey, pass }], { onConflict: ['user_id'] });
  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ message: 'Thành công' });
}
