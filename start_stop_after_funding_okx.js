const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors()); // Cho phép gọi từ trình duyệt khác domain
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/start', (req, res) => {
  const { user_id, usdt } = req.body;
  console.log(`>> START BOT cho user: ${user_id}, vốn: ${usdt} USDT`);
  // TODO: Thêm logic khởi động bot ở đây
  res.send(`Đã khởi động bot cho ${user_id} với ${usdt} USDT`);
});

app.post('/stop', (req, res) => {
  const { user_id } = req.body;
  console.log(`>> STOP BOT cho user: ${user_id}`);
  // TODO: Thêm logic dừng bot ở đây
  res.send(`Đã dừng bot cho ${user_id}`);
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
