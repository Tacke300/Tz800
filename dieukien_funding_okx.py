
import requests
import time
import asyncio
import websockets
import json
from datetime import datetime

def log(msg):
    timestamp = datetime.utcnow().strftime("[%Y-%m-%d %H:%M:%S] ")
    print(timestamp + msg, flush=True)
    with open("funding_log.txt", "a") as f:
        f.write(timestamp + msg + "\n")

def fetch_instruments():
    url = "https://www.okx.com/api/v5/public/instruments"
    params = {"instType": "SWAP"}
    try:
        res = requests.get(url, params=params)
        res.raise_for_status()
        data = res.json().get("data", [])
        usdt_swap = [d for d in data if d["instId"].endswith("USDT-SWAP")]
        leverage_dict = {d["instId"]: float(d.get("lever", 0)) for d in usdt_swap}
        symbols = list(leverage_dict.keys())
        log(f"Lấy {len(symbols)} coin USDT-SWAP với leverage.")
        return symbols, leverage_dict
    except Exception as e:
        log(f"Lỗi lấy instrument: {e}")
        return [], {}

async def funding_check():
    while True:
        try:
            symbols, leverage_dict = fetch_instruments()
            if not symbols:
                log("Không có symbol nào để theo dõi.")
                await asyncio.sleep(60)
                continue

            ws_url = "wss://ws.okx.com:8443/ws/v5/public"
            async with websockets.connect(ws_url, ping_interval=None) as ws:
                log("Socket OKX đã kết nối.")

                for symbol in symbols:
                    sub_msg = {
                        "op": "subscribe",
                        "args": [{"channel": "funding-rate", "instId": symbol}]
                    }
                    await ws.send(json.dumps(sub_msg))
                    await asyncio.sleep(0.01)

                async def ping_loop():
                    while True:
                        await asyncio.sleep(15)
                        try:
                            pong = {"op": "ping"}
                            await ws.send(json.dumps(pong))
                        except:
                            break

                ping_task = asyncio.create_task(ping_loop())

                while True:
                    message = await ws.recv()
                    msg = json.loads(message)

                    if "data" in msg and "arg" in msg:
                        symbol = msg["arg"]["instId"]
                        data = msg["data"][0]
                        funding = float(data["fundingRate"])
                        lev = leverage_dict.get(symbol, 0)
                        f_lev = funding * lev

                        if funding < 0:
                            if f_lev < -1.3:
                                status = ">> ĐỦ ĐIỀU KIỆN <<"
                            else:
                                status = "Không đủ điều kiện"
                            log_msg = f"{symbol:20} | Rate: {funding:>8.5f} | Lev: {lev:>5} | F*Lev: {f_lev:>8.5f} | {status}"
                        else:
                            log_msg = f"{symbol:20} | Funding dương hoặc 0 -> Bỏ qua"

                        log(log_msg)
        except Exception as e:
            log(f"Lỗi socket: {e} — reconnect sau 10s")
            await asyncio.sleep(10)

# Nếu bạn đang dùng Google Colab, chạy bằng:
try:
    await funding_check()
except Exception as e:
    log(f"Lỗi main: {e}")
