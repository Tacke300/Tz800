
import requests
import time
import hmac
import base64
import json
from datetime import datetime, timedelta

# ----------- OKX API CREDENTIALS -------------
API_KEY = "YOUR_API_KEY"
API_SECRET = "YOUR_SECRET_KEY"
API_PASSPHRASE = "YOUR_PASSPHRASE"

HEADERS = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": API_KEY,
    "OK-ACCESS-PASSPHRASE": API_PASSPHRASE,
}

BASE_URL = "https://www.okx.com"

# ----------- CẤU HÌNH -----------------------
INVEST_AMOUNT = 100  # Số tiền đầu vào
REAL_INVEST = INVEST_AMOUNT * 0.99  # Số tiền đầu tư thực tế, dùng 99% số tiền đã nhập

# ----------- HÀM TẠO CHỮ KÝ ----------------
def signature(timestamp, method, request_path, body=""):
    message = f"{timestamp}{method}{request_path}{body}"
    mac = hmac.new(API_SECRET.encode(), message.encode(), digestmod="sha256")
    return base64.b64encode(mac.digest()).decode()

def send_request(method, path, body=None, auth=True):
    timestamp = datetime.utcnow().isoformat(timespec='milliseconds') + 'Z'
    body_json = json.dumps(body) if body else ""
    headers = HEADERS.copy()
    if auth:
        headers["OK-ACCESS-TIMESTAMP"] = timestamp
        headers["OK-ACCESS-SIGN"] = signature(timestamp, method, path, body_json)
    url = BASE_URL + path
    response = requests.request(method, url, headers=headers, data=body_json)
    return response.json()

# ----------- LẤY DANH SÁCH COIN ------------
def get_swap_list():
    r = requests.get(BASE_URL + "/api/v5/public/instruments", params={"instType": "SWAP"})
    return [i for i in r.json()["data"] if i["instId"].endswith("USDT-SWAP")]

# ----------- LẤY MAX LEVERAGE -----------------
def get_max_leverage(instId):
    path = f"/api/v5/account/leverage?instId={instId}"
    response = send_request("GET", path)
    max_leverage = response["data"][0]["lever"]
    return float(max_leverage)

# ----------- MỞ LỆNH LONG ----------------------
def place_long_order(instId, invest_amount, max_leverage):
    # Tính số tiền sẽ mở lệnh (thực tế là đầu tư 99% số tiền nhập vào)
    order_amount = invest_amount * max_leverage
    order_data = {
        "instId": instId,
        "tdMode": "cross",  # Margin trading (cross-margin)
        "side": "buy",      # Mua vào (long)
        "ordType": "market",  # Lệnh market
        "sz": order_amount,
        "px": "0",  # Đặt giá là market
    }

    # Đặt lệnh thị trường
    path = "/api/v5/trade/order"
    response = send_request("POST", path, body=order_data)
    if response.get("code") == "0":
        print(f"Đã mở lệnh long: {instId} với {order_amount} USDT")
        return response["data"][0]["ordId"]
    else:
        print("Lỗi khi mở lệnh: ", response)
        return None

# ----------- CẬP NHẬT TP/SL 50% PnL ----------------
def set_take_profit_stop_loss(instId, order_id, entry_price, pnl_target=0.5):
    # Tính toán TP/SL dựa trên PnL target
    tp_price = entry_price * (1 + pnl_target)
    sl_price = entry_price * (1 - pnl_target)

    # Cập nhật TP và SL
    order_data = {
        "instId": instId,
        "ordId": order_id,
        "tp": tp_price,
        "sl": sl_price,
    }

    path = "/api/v5/trade/order"
    response = send_request("POST", path, body=order_data)
    if response.get("code") == "0":
        print(f"Đặt TP/SL thành công: TP={tp_price} SL={sl_price}")
    else:
        print("Lỗi khi cập nhật TP/SL: ", response)

# ----------- KIỂM TRA FUNDING RATE VÀ MỞ LỆNH ----------------
def check_funding_and_place_order():
    swap_list = get_swap_list()

    for inst in swap_list:
        instId = inst["instId"]
        max_leverage = get_max_leverage(instId)

        # Lấy dữ liệu funding rate
        funding_url = f"/api/v5/public/funding-rate?instId={instId}"
        funding_data = send_request("GET", funding_url)

        if not funding_data or funding_data.get("code") != "0":
            print(f"Lỗi khi lấy funding rate cho {instId}")
            continue

        rate = float(funding_data["data"][0]["fundingRate"])

        # Kiểm tra nếu funding rate âm và đủ điều kiện
        if rate < 0 and abs(rate * max_leverage) > 1.3:
            print(f"{instId}: Funding rate = {rate}, Max Leverage = {max_leverage}")
            # Mở lệnh Long
            order_id = place_long_order(instId, REAL_INVEST, max_leverage)

            if order_id:
                # Lấy giá entry price của lệnh để tính TP/SL
                entry_price = float(funding_data["data"][0]["fundingRate"])  # Cần cập nhật lại với giá chính xác khi mở lệnh
                set_take_profit_stop_loss(instId, order_id, entry_price)

        else:
            print(f"{instId}: Funding rate không đủ điều kiện.")

# ----------- LẮP ĐẶT VÒNG LẶP KIỂM TRA ----------------
while True:
    try:
        check_funding_and_place_order()
        print("Chờ 5 phút trước khi kiểm tra lại...")
        time.sleep(300)  # Chờ 5 phút (300 giây)
    except Exception as e:
        print(f"Lỗi khi chạy vòng lặp chính: {e}", flush=True)
        time.sleep(300)
