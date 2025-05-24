const supabase = window.supabase.createClient(
  'https://tramnanrzruzvkehpydl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYW1uYW5yenJ1enZrZWhweWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NTM1NTMsImV4cCI6MjA2MTMyOTU1M30.L0Ytkxi80AbYjkjpDfGyQtfyfqjfHLF98OrVce9Hi-0'
);

// Tải reg.html khi cần đăng ký
function showRegister() {
  fetch('html/reg.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('popup-container').innerHTML = html;
    });
}

function hideRegister() {
  document.getElementById('register-popup').remove();
}

async function register() {
  const userId = document.getElementById('reg-username').value.trim();
  const pass = document.getElementById('reg-password').value;
  const repass = document.getElementById('reg-repassword').value;

  if (!userId || !pass || pass !== repass) {
    alert('Vui lòng kiểm tra lại thông tin');
    return;
  }

  const { data, error } = await supabase
    .from('users')
    .insert([{ user_id: userId, password: pass }]);

  if (error) {
    alert('Đăng ký thất bại: ' + error.message);
  } else {
    alert('Tạo tài khoản thành công');
    hideRegister();
  }
}

async function login() {
  const userId = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .eq('password', pass);

  if (error || !data || data.length === 0) {
    alert('Sai thông tin đăng nhập');
  } else {
    window.location.href = 'fundingbot.html';  // Chuyển đến bot
  }
}
