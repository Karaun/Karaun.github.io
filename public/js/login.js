(function(){
  const form = document.getElementById('loginForm');
  const usernameEl = document.getElementById('username');
  const passwordEl = document.getElementById('password');
  const rememberEl = document.getElementById('remember');

  // Load remembered
  const remembered = JSON.parse(localStorage.getItem('remember') || 'false');
  const savedUser = localStorage.getItem('username');
  const savedPass = localStorage.getItem('password');
  if (remembered && savedUser && savedPass) {
    usernameEl.value = savedUser;
    passwordEl.value = savedPass;
    rememberEl.checked = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();

    try {
      const base = window.API_BASE || '';
      const res = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) throw new Error('登录失败');
      const user = await res.json();

      if (rememberEl.checked) {
        localStorage.setItem('remember', 'true');
        localStorage.setItem('username', username);
        localStorage.setItem('password', password);
      } else {
        localStorage.setItem('remember', 'false');
        localStorage.removeItem('password');
      }
      localStorage.setItem('user', JSON.stringify(user));
      location.href = '/app.html';
    } catch (err) {
      alert(err.message || '登录失败');
    }
  });
})();
