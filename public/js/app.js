(function(){
  const base = window.API_BASE || '';
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) location.href = '/';
  document.getElementById('userInfo').textContent = `您好，${user.displayName || user.username}`;
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('user');
      location.href = '/';
    });
  }

  // Tabs
  const tabs = ['tab-map','tab-collect','tab-list','tab-settings'];
  document.querySelectorAll('nav [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      tabs.forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== target);
      });
      document.querySelectorAll('nav [data-tab]').forEach(b=>b.classList.remove('tab-active'));
      btn.classList.add('tab-active');
      if (target === 'tab-map') map && map.resize();
      if (target === 'tab-list') loadList();
      if (target === 'tab-settings') {loadTiles(); fillSysInfo();}
    });
  });

  // Map
  let map, baseLayers = {}, currentBase = null, customLayer = null;
  let pickMarker = null;
  let infoWindow = null;
  let sampleMarkers = [];

  function initMap(){
    map = new AMap.Map('map', {
      viewMode: '3D',
      zoom: 12,
      center: [116.397389, 39.908722],
    });

    baseLayers.vec = AMap.createDefaultLayer();
    baseLayers.sat = new AMap.TileLayer.Satellite();
    baseLayers.road = new AMap.TileLayer.RoadNet();
    setBase('vec');

    infoWindow = new AMap.InfoWindow({offset: new AMap.Pixel(0, -25)});

    map.on('click', (e)=>{
      const lng = e.lnglat.lng.toFixed(6);
      const lat = e.lnglat.lat.toFixed(6);
      const lonEl = document.getElementById('f_lon');
      const latEl = document.getElementById('f_lat');
      if (lonEl && latEl) { lonEl.value = lng; latEl.value = lat; }
      if (pickMarker) { pickMarker.setMap(null); }
      pickMarker = new AMap.Marker({ position: e.lnglat, map });
    });
  }

  function setBase(type){
    if (currentBase) map.remove(currentBase);
    if (customLayer && type !== 'custom') { map.remove(customLayer); customLayer = null; }
    if (type === 'sat') {
      map.add(baseLayers.sat);
      currentBase = baseLayers.sat;
    } else if (type === 'road') {
      // 采用矢量底图 + 路网覆盖
      map.add(baseLayers.vec);
      map.add(baseLayers.road);
      currentBase = baseLayers.vec;
    } else if (type === 'custom') {
      // 在加载 tiles 列表后由 chooseCustomLayer 调用
      if (customLayer) { map.add(customLayer); currentBase = customLayer; }
      else { map.add(baseLayers.vec); currentBase = baseLayers.vec; }
    } else {
      map.add(baseLayers.vec);
      currentBase = baseLayers.vec;
    }
  }

  async function locate(){
    try {
      const pos = await new Promise((resolve, reject)=>{
        if (!navigator.geolocation) return reject(new Error('浏览器不支持定位'));
        navigator.geolocation.getCurrentPosition(
          p=>resolve(p),
          err=>reject(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
      const lng = pos.coords.longitude;
      const lat = pos.coords.latitude;
      map.setZoomAndCenter(16, [lng, lat]);
      if (pickMarker) pickMarker.setMap(null);
      pickMarker = new AMap.Marker({ position: [lng, lat], map });
      const lonEl = document.getElementById('f_lon');
      const latEl = document.getElementById('f_lat');
      if (lonEl && latEl) { lonEl.value = lng.toFixed(6); latEl.value = lat.toFixed(6); }
    } catch (e) {
      alert('定位失败：' + (e.message || '未知错误'));
    }
  }

  document.getElementById('btnLocate').addEventListener('click', locate);

  const basemapSelect = document.getElementById('basemapSelect');
  basemapSelect.addEventListener('change', async ()=>{
    const v = basemapSelect.value;
    if (v === 'custom') {
      await chooseCustomLayer();
    }
    setBase(v);
  });

  async function chooseCustomLayer(){
    const tiles = await fetch(base + '/api/tiles').then(r=>r.json());
    if (!tiles.length) { alert('请先在设置里添加自定义底图'); basemapSelect.value = 'vec'; return; }
    const names = tiles.map(t=>t.name);
    const pick = prompt('选择自定义底图编号:\n' + names.map((n,i)=>`${i+1}. ${n}`).join('\n'));
    const i = Number(pick) - 1;
    if (isNaN(i) || i<0 || i>=tiles.length) { alert('未选择有效底图'); basemapSelect.value = 'vec'; return; }
    const t = tiles[i];
    if (customLayer) { map.remove(customLayer); customLayer = null; }
    customLayer = new AMap.TileLayer({
      tileUrl: t.urlTemplate,
      zooms: [Number(t.minZoom)||0, Number(t.maxZoom)||20],
      opacity: 1
    });
    map.add(customLayer);
  }

  // Collect form
  document.getElementById('btnUseLocation').addEventListener('click', locate);
  document.getElementById('collectForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('f_name').value.trim();
    const category = document.getElementById('f_category').value.trim();
    const description = document.getElementById('f_desc').value.trim();
    const lon = parseFloat(document.getElementById('f_lon').value);
    const lat = parseFloat(document.getElementById('f_lat').value);
    if (!name || isNaN(lon) || isNaN(lat)) { alert('请填写名称并拾取经纬度'); return; }
    try {
      const res = await fetch('/api/samples', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, category, description, lon, lat })
      });
      if (!res.ok) throw new Error('提交失败');
      await res.json();
      alert('提交成功');
      document.getElementById('collectForm').reset();
      if (pickMarker) { pickMarker.setMap(null); pickMarker = null; }
      loadList(true);
    } catch (e) {
      alert(e.message || '提交失败');
    }
  });

  // List & visualization
  async function loadList(keepMarkers){
    const q = document.getElementById('q').value.trim().toLowerCase();
    const data = await fetch(base + '/api/samples').then(r=>r.json());
    const rows = data.filter(it=>!q || (it.name && it.name.toLowerCase().includes(q)) || (it.category && it.category.toLowerCase().includes(q)));
    const listEl = document.getElementById('list');
    listEl.innerHTML = '';
    rows.forEach(it=>{
      const div = document.createElement('div');
      div.className = 'list-item';
      div.innerHTML = `<div class="flex justify-between items-center">
        <div>
          <div class="font-medium text-slate-800">${it.name} <span class="badge">${it.category||'未分类'}</span></div>
          <div class="text-xs text-slate-500">${it.lon.toFixed(6)}, ${it.lat.toFixed(6)}</div>
          <div class="text-sm text-slate-600 mt-1">${it.description||''}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary" data-act="locate" data-id="${it.id}">定位</button>
          <button class="btn-secondary" data-act="edit" data-id="${it.id}">编辑</button>
          <button class="btn-secondary" data-act="del" data-id="${it.id}">删除</button>
        </div>
      `;
      listEl.appendChild(div);
    });

    // markers
    if (!keepMarkers) {
      sampleMarkers.forEach(m=>m.setMap(null));
      sampleMarkers = [];
    }
    rows.forEach(it=>{
      const marker = new AMap.Marker({ position: [it.lon, it.lat], map });
      marker.on('click', ()=>{
        const html = `<div style="min-width:180px">
          <div style="font-weight:600;margin-bottom:4px">${it.name}</div>
          <div style="color:#475569;font-size:12px">类别：${it.category||'未分类'}</div>
          <div style="color:#475569;font-size:12px">坐标：${it.lon.toFixed(6)}, ${it.lat.toFixed(6)}</div>
          <div style="margin-top:4px;color:#334155;font-size:12px">${it.description||''}</div>
        </div>`;
        infoWindow.setContent(html);
        infoWindow.open(map, marker.getPosition());
      });
      sampleMarkers.push(marker);
    });

    // click locate in list
    listEl.querySelectorAll('[data-act="locate"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        const it = rows.find(x=>x.id===id);
        if (it) {
          map.setZoomAndCenter(16, [it.lon, it.lat]);
        }
      });
    });

    listEl.querySelectorAll('[data-act="edit"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-id');
        const it = rows.find(x=>x.id===id);
        if (!it) return;
        const name = prompt('名称', it.name);
        if (name === null) return;
        const category = prompt('类别', it.category||'');
        if (category === null) return;
        const description = prompt('描述', it.description||'');
        if (description === null) return;
        const res = await fetch(`/api/samples/${id}`, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name, category, description }) });
        if (!res.ok) return alert('更新失败');
        loadList();
      });
    });

    listEl.querySelectorAll('[data-act="del"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-id');
        if (!confirm('确定删除该采集数据吗？')) return;
        const res = await fetch(`/api/samples/${id}`, { method: 'DELETE' });
        if (!res.ok) return alert('删除失败');
        loadList();
      });
    });
  }
  document.getElementById('btnSearch').addEventListener('click', ()=>loadList());

  // Settings: system info & custom tiles
  function fillSysInfo(){
    const el = document.getElementById('sysInfo');
    el.textContent = `UA: ${navigator.userAgent}`;
  }

  async function loadTiles(){
    const list = await fetch('/api/tiles').then(r=>r.json());
    const ul = document.getElementById('tileList');
    ul.innerHTML = '';
    list.forEach(t=>{
      const li = document.createElement('li');
      li.className = 'list-item flex items-center justify-between';
      li.innerHTML = `<div>
        <div class="font-medium text-slate-800">${t.name}</div>
        <div class="text-xs text-slate-500">${t.urlTemplate}</div>
        <div class="text-xs text-slate-500">zooms: ${t.minZoom}-${t.maxZoom}</div>
      </div>
      <button class="btn-secondary" data-del="${t.id}">删除</button>`;
      ul.appendChild(li);
    });
    ul.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-del');
        if (!confirm('确定删除该自定义底图吗？')) return;
        const res = await fetch(base + `/api/tiles/${id}`, { method: 'DELETE' });
        if (!res.ok) return alert('删除失败');
        loadTiles();
      });
    });
  }

  document.getElementById('btnAddTile').addEventListener('click', async ()=>{
    const name = document.getElementById('tile_name').value.trim();
    const urlTemplate = document.getElementById('tile_url').value.trim();
    const minZoom = Number(document.getElementById('tile_min').value||0);
    const maxZoom = Number(document.getElementById('tile_max').value||20);
    if (!name || !urlTemplate) { alert('请填写名称与URL模板'); return; }
    const res = await fetch(base + '/api/tiles', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ name, urlTemplate, minZoom, maxZoom }) });
    if (!res.ok) return alert('添加失败');
    document.getElementById('tile_name').value='';
    document.getElementById('tile_url').value='';
    loadTiles();
    basemapSelect.value = 'custom';
    await chooseCustomLayer();
    setBase('custom');
  });

  document.getElementById('btnReloadTiles').addEventListener('click', loadTiles);

  // boot
  initMap();
  loadList();
})();
