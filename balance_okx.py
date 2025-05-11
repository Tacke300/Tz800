import requests
import base64
import hmac
import hashlib
from supabase import create_client

# Kết nối Supabase
url = "https://tramnanrzruzvkehpydl.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0"
supabase = create_client(url, key)

def get_timestamp():
    try:
        r = requests.get('https://www.okx.com/api/v5/public/time')
        ts = r.json()['data'][0]['ts']
        return str(int(ts) / 1000)
    except Exception as e:
        print("Lỗi lấy thời gian OKX:", e)
        return None

def sign(message, secret):
    return base64.b64encode(hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()).decode()

def get_okx_balance(user_id):
    # Lấy thông tin API từ Supabase
    res = supabase.table('users').select('apikey, secret, pass').eq('user_id', user_id).execute()
    if not res.data:
        print("Không tìm thấy user.")
        return None

    user = res.data[0]
    api_key = user['apikey']
    api_secret = user['secret']
    passphrase = user['pass']

    timestamp = get_timestamp()
    if not timestamp:
        return None

    method = "GET"
    request_path = "/api/v5/account/balance"
    body = ""
    prehash_string = f"{timestamp}{method}{request_path}{body}"
    signature = sign(prehash_string, api_secret)

    headers = {
        'OK-ACCESS-KEY': api_key,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'Content-Type': 'application/json'
    }

    url = 'https://www.okx.com/api/v5/account/balance'
    r = requests.get(url, headers=headers)

    if r.status_code == 200:
        data = r.json()
        balances = data['data'][0]['details']
        for b in balances:
            if b['ccy'] == 'USDT':
                usdt_balance = float(b['availBal'])
                # Cập nhật vào Supabase
                supabase.table('users').update({'usdt_okx': usdt_balance}).eq('user_id', user_id).execute()
                return usdt_balance
    else:
        print("Lỗi khi gọi OKX API:", r.text)
        return None
