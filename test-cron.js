const cron = require('node-cron');

console.log('Bắt đầu test cron...');
cron.schedule('* * * * *', () => {
  console.log('Cron đã chạy lúc:', new Date().toLocaleString());
});
