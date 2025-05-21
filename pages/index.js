const axios = require('axios');

const URL = 'https://tz800.duckdns.org';

async function fetchData() {
  try {
    const res = await axios.get(URL);
    console.log('Data length:', res.data.length); // Hoặc xử lý dữ liệu ở đây
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

// Chạy liên tục mỗi 1 phút
setInterval(fetchData, 60 * 1000);

// Chạy ngay lần đầu
fetchData();
