const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = '7648930428:AAFDIISTuWwa-aNmyWgItakI_tMwuTEXNkw'; 
const bot = new TelegramBot(TOKEN, { polling: true });

const URL = 'https://tz800.duckdns.org';

let chatId = null;

// Thử đọc chatId từ file nếu đã từng lưu
const CHAT_ID_FILE = './chat_id.txt';
if (fs.existsSync(CHAT_ID_FILE)) {
  chatId = fs.readFileSync(CHAT_ID_FILE, 'utf-8').trim();
  console.log('Loaded chatId:', chatId);
}

// Hàm gọi API và gửi dữ liệu về Telegram
async function fetchData() {
  try {
    const res = await axios.get(URL);
    console.log('Data length:', res.data.length);

    if (chatId) {
      bot.sendMessage(chatId, `Data length: ${res.data.length}`);
    }
  } catch (error) {
    console.error('Error fetching data:', error.message);
    if (chatId) {
      bot.sendMessage(chatId, `Error fetching data: ${error.message}`);
    }
  }
}

// Lắng nghe tin nhắn từ người dùng
bot.on('message', (msg) => {
  if (!chatId) {
    chatId = msg.chat.id.toString();
    fs.writeFileSync(CHAT_ID_FILE, chatId);
    console.log('Saved chatId:', chatId);
  }

  const text = msg.text.toLowerCase();

  if (text === '/start') {
    bot.sendMessage(chatId, 'Bot đã khởi động. Sẽ gửi dữ liệu mỗi phút.');
  } else if (text === '/check') {
    fetchData();
  } else {
    bot.sendMessage(chatId, 'Gửi /start để khởi động hoặc /check để kiểm tra thủ công.');
  }
});

// Chạy fetchData mỗi 1 phút
setInterval(fetchData, 60 * 1000);

// Gọi lần đầu
fetchData();
