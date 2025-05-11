import os
import requests
import time
import hmac
import base64
import json
from datetime import datetime

# ----------- OKX API CREDENTIALS (dùng biến môi trường để bảo mật) -------------
API_KEY = os.getenv("OKX_API_KEY")
API_SECRET = os.getenv("OKX_API_SECRET")
API_PASSPHRASE = os.getenv("OKX_API_PASSPHRASE")

HEADERS = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": API_KEY,
    "OK-ACCESS-PASSPHRASE": API_PASSPHRASE,
}

BASE_URL = "https://www.okx.com"

# ----------- CẤU HÌNH -----------------------
INVEST_AMOUNT = 100
REAL_INVEST = INVEST_AMOUNT * 0.98

# ----------- GHI LOG -------------------------
def log(msg):
    timestamp = datetime.utcnow().strftime("[%Y-%m-%d %H:%M:%S] ")
    print(timestamp + msg, flush=True)
    with open("funding_bot.log", "a") as f:
        f.write(timestamp + msg + "\n")

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
    order_amount = invest_amount * max_leverage
    order_data = {
        "instId": instId,
        "tdMode": "cross",
        "side": "buy",
        "ordType": "market",
        "sz": str(order_amount),
        "px": "0",
    }
    path = "/api/v5/trade/order"
    response = send_request("POST", path, body=order_data)
    if response.get("code") == "0":
        log(f"Đã mở lệnh long: {instId} với {order_amount} USDT")
        return response["data"][0]["ordId"]
    else:
        log(f"Lỗi khi mở lệnh {instId}: {response}")
        return None

# ----------- LẤY GIÁ KHỚP LỆNH ----------------
def get_latest_fill_price(instId, orderId):
    path = f"/api/v5/trade/fills?ordId={orderId}&instId={instId}"
    fills = send_request("GET", path)
    if fills.get("code") == "0" and fills["data"]:
        return float(fills["data"][0]["fillPx"])
    return None

# ----------- ĐẶT TP/SL 50% ----------------
def set_take_profit_stop_loss(instId, order_id, entry_price, pnl_target=0.5):
    tp_price = round(entry_price * (1 + pnl_target), 4)
    sl_price = round(entry_price * (1 - pnl_target), 4)

    order_data = {
        "instId": instId,
        "ordId": order_id,
        "tpTriggerPx": str(tp_price),
        "tpOrdPx": "-1",
        "slTriggerPx": str(sl_price),
        "slOrdPx": "-1",
    }

    path = "/api/v5/trade/order-algo"
    response = send_request("POST", path, body=order_data)
    if response.get("code") == "0":
        log(f"Đặt TP/SL thành công: TP={tp_price} SL={sl_price}")
    else:
        log(f"Lỗi khi đặt TP/SL: {response}")

# ----------- KIỂM TRA FUNDING & VÀO LỆNH ----------
def check_funding_and_place_order():
    swap_list = get_swap_list()

    for inst in swap_list:
        instId = inst["instId"]
        max_leverage = get_max_leverage(instId)

        # Lấy funding rate
        funding_url = f"/api/v5/public/funding-rate?instId={instId}"
        funding_data = send_request("GET", funding_url)

        if not funding_data or funding_data.get("code") != "0":
            log(f"Lỗi khi lấy funding rate cho {instId}")
            continue

        rate = float(funding_data["data"][0]["fundingRate"])

        # Điều kiện vào lệnh
        if rate < 0 and abs(rate * max_leverage) > 1.3:
            log(f"{instId}: Funding rate = {rate}, Leverage = {max_leverage}")
            order_id = place_long_order(instId, REAL_INVEST, max_leverage)

            if order_id:
                entry_price = get_latest_fill_price(instId, order_id)
                if entry_price:
                    set_take_profit_stop_loss(instId, order_id, entry_price)
                else:
                    log(f"Không lấy được entry price cho {instId}")
        else:
            log(f"{instId}: Funding rate không đủ điều kiện.")

# ----------- VÒNG LẶP CHÍNH ----------------
if __name__ == "__main__":
    while True:
        try:
            check_funding_and_place_order()
            log("Chờ 5 phút trước khi kiểm tra lại...")
            time.sleep(300)
        except Exception as e:
            log(f"Lỗi vòng lặp chính: {e}")
            time.sleep(300)
