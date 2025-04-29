import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import axios from 'axios'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function generateHeaders(apiKey, apiSecret, passphrase) {
  const timestamp = Date.now() / 1000
  const method = 'GET'
  const requestPath = '/api/v5/account/balance'

  const prehash = `${timestamp}${method}${requestPath}`
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(prehash)
    .digest('base64')

  return {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp.toString(),
    'OK-ACCESS-PASSPHRASE': passphrase,
  }
}

export default async function handler(req, res) {
  const { user_id } = req.query

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', user_id)
    .single()

  if (error || !users) return res.status(400).json({ error: 'User not found' })

  const { apikey, secret, pass } = users

  const headers = generateHeaders(apikey, secret, pass)

  try {
    const response = await axios.get('https://www.okx.com/api/v5/account/balance', { headers })
    res.status(200).json(response.data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
