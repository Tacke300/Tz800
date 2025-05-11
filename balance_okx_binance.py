from flask import Flask, render_template, request
from balance_okx import get_okx_balance
from balance_binance import get_binance_balance

app = Flask(__name__)

@app.route('/')
def index():
    # Lấy user_id từ query string, mặc định là 'user_abc'
    user_id = request.args.get('user_id', 'user_abc')

    # Lấy số dư OKX và Binance
    okx_balance = get_okx_balance(user_id)
    binance_balance = get_binance_balance(user_id)

    # Hiển thị số dư trên trang web
    return render_template(
        'index.html',
        user_id=user_id,
        okx_balance=okx_balance,
        binance_balance=binance_balance
    )

if __name__ == '__main__':
    app.run(debug=True)
