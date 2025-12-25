(function(){
  const form = document.getElementById('regForm');
  const u = document.getElementById('r_username');
  const p = document.getElementById('r_password');
  const d = document.getElementById('r_display');

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const username = u.value.trim();
    const password = p.value.trim();
    const displayName = d.value.trim();
    if (!username || !password) { alert('请输入用户名与密码'); return; }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName })
      });
      if (res.status === 409) { alert('用户名已存在'); return; }
      if (!res.ok) throw new Error('注册失败');
      alert('注册成功，请登录');
      location.href = '/';
    } catch (err) {
      alert(err.message || '注册失败');
    }
  });
})();
