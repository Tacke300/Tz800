import time
import schedule
import requests
import base64
import hmac
import hashlib
from supabase import create_client
import telebot

# Kết nối Supabase
url = "https://tramnanrzruzvkehpydl.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0"
supabase = create_client(url, key)

# Cài đặt bot Telegram
telegram_token = '7648930428:AAFDIISTuWwa-aNmyWgItakI_tMwuTEXNkw'  # Thay bằng token bot Telegram của bạn
bot = telebot.TeleBot(telegram_token)


# ==== Hàm lấy thông tin API từ Supabase ====
def get_api_keys_from_supabase(user_id):
    try:
        response = supabase.table("users").select("apikey_okx", "secret_okx", "pass_okx", "apikey_binance", "secret_binance", "pass_binance").eq("user_id", user_id).execute()
        if response.data:
            return response.data[0]
        else:
            print("Không tìm thấy người dùng với user_id:", user_id)
            return None
    except Exception as e:
        print(f"Đã xảy ra lỗi khi lấy thông tin từ Supabase: {e}")
        return None

# ==== Hàm tạo chữ ký HMAC SHA256 (dùng cho OKX) ====
def sign(message, secret):
    return base64.b64encode(
        hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    ).decode()

# ==== Hàm lấy thời gian từ server OKX ====
def get_timestamp():
    try:
        r = requests.get('https://www.okx.com/api/v5/public/time')
        ts = r.json()['data'][0]['ts']
        return str(int(ts) / 1000)
    except Exception as e:
        print("Đã xảy ra lỗi khi lấy thời gian từ server OKX:", e)
        return None

# ==== Hàm lấy số dư OKX ====
def get_okx_balance(user_id):
    print("Bắt đầu lấy số dư từ OKX...")

    # Lấy API Key, Secret từ Supabase
    user_data = get_api_keys_from_supabase(user_id)
    if not user_data:
        return None

    api_key = user_data['apikey_okx']
    api_secret = user_data['secret_okx']
    passphrase = user_data['pass_okx']

    timestamp = get_timestamp()
    if not timestamp:
        print("Không thể lấy thời gian từ server OKX.")
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
    
    response = requests.get("https://www.okx.com/api/v5/account/balance", headers=headers)
    if response.status_code == 200:
        data = response.json()
        balances = data['data'][0]['details']
        usdt_balance = None
        for b in balances:
            if b['ccy'] == 'USDT':
                usdt_balance = b['availBal']
                break
        return usdt_balance
    else:
        print("Lỗi khi lấy thông tin số dư từ OKX:", response.json())
        return None

# ==== Hàm lấy số dư Binance ====
def get_binance_balance(user_id):
    print("Bắt đầu lấy số dư từ Binance...")

    # Lấy API Key, Secret từ Supabase
    user_data = get_api_keys_from_supabase(user_id)
    if not user_data:
        return None

    api_key = user_data['apikey_binance']
    api_secret = user_data['secret_binance']

    # Khởi tạo client Binance
    client = Client(api_key, api_secret)

    try:
        # Lấy số dư tài khoản
        account_info = client.get_account()
        balances = account_info['balances']
        
        # Tìm USDT trong danh sách số dư
        usdt_balance = None
        for balance in balances:
            if balance['asset'] == 'USDT':
                usdt_balance = balance['free']
                break
        return usdt_balance
    except Exception as e:
        print(f"Đã xảy ra lỗi khi lấy số dư từ Binance: {e}")
        return None

# ==== Hàm lấy số dư cho cả OKX và Binance ====
def get_balance_for_user(user_id):
    print(f"Đang lấy số dư cho người dùng {user_id}...")

    # Lấy số dư từ OKX và Binance
    okx_balance = get_okx_balance(user_id)
    binance_balance = get_binance_balance(user_id)

    if okx_balance is not None and binance_balance is not None:
        # Gửi thông tin số dư qua Telegram
        message = f"Số dư của bạn:\n- OKX USDT: {okx_balance}\n- Binance USDT: {binance_balance}"
        bot.send_message(user_id, message)
    else:
        bot.send_message(user_id, "Không thể lấy số dư từ các sàn giao dịch.")

# ==== Lệnh Telegram xử lý khởi tạo cho người dùng ====
@bot.message_handler(commands=['start'])
def handle_start(message):
    user_id = message.chat.id  # Lấy user_id từ Telegram
    print(f"Đã nhận user_id: {user_id} từ Telegram")

    # Gọi hàm lấy số dư từ cả OKX và Binance
    get_balance_for_user(user_id)

    # Trả lời tin nhắn chào mừng
    bot.reply_to(message, "Chào bạn! Đang lấy số dư tài khoản của bạn từ OKX và Binance...")

# ==== Cài đặt lịch để cập nhật mỗi 30 giây ====
schedule.every(30).seconds.do(lambda: get_balance_for_user('user_abc'))  # Thay 'user_abc' bằng user_id thực tế

# ==== Chạy vòng lặp để kiểm tra và thực hiện các tác vụ đã lên lịch ====
while True:
    schedule.run_pending()
    time.sleep(1)
