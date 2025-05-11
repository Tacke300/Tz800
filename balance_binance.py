import requests
import time
import hmac
import hashlib
from supabase import create_client

# Kết nối Supabase
url = "https://tramnanrzruzvkehpydl.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0"
supabase = create_client(url, key)

def get_binance_balance(user_id):
    res = supabase.table('users').select('binance_api_key, binance_secret_key').eq('user_id', user_id).execute()
    if not res.data:
        return None

    user = res.data[0]
    api_key = user['binance_api_key']
    secret_key = user['binance_secret_key']

    timestamp = int(time.time() * 1000)
    query = f"timestamp={timestamp}"
    signature = hmac.new(secret_key.encode(), query.encode(), hashlib.sha256).hexdigest()

    headers = {
        'X-MBX-APIKEY': api_key
    }

    url = f"https://api.binance.com/sapi/v1/capital/config/getall?{query}&signature={signature}"
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
        assets = r.json()
        for asset in assets:
            if asset['coin'] == 'USDT':
                usdt_balance = float(asset['free'])
                # Cập nhật Supabase
                supabase.table('users').update({'usdt_binance': usdt_balance}).eq('user_id', user_id).execute()
                return usdt_balance
    return None
