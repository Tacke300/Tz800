const axios = require('axios');

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { message } = req.body;

    if (message) {
      const chatId = message.chat.id;
      const text = message.text;

      try {
        await axios.post(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `You said: ${text}`
        });

        return res.status(200).send('Message sent');
      } catch (error) {
        console.error('Error sending message:', error.response ? error.response.data : error.message);
        return res.status(500).send('Error sending message');
      }
    } else {
      return res.status(400).send('No message found');
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
https://api.telegram.org/bot<7648930428:AAFDIISTuWwa-aNmyWgItakI_tMwuTEXNkw>/setWebhook?url=https://tz800.vercel.app/api/webhook
