const express = require('express');
const app = express();
app.use(express.json());

const TOKEN = ' 7648930428:AAFDIISTuWwa-aNmyWgItakI_tMwuTEXNkw'; // <-- thay YOUR_BOT_TOKEN bằng token của bạn

app.post('/', (req, res) => {
  const message = req.body.message;
  if (message) {
    const chatId = message.chat.id;
    const text = 'Xin chào từ bot Vercel!';
    
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  }
  res.send('ok');
});

app.get('/', (req, res) => {
  res.send('Bot is running.');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});