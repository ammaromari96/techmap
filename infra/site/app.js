(async function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });

  // Load companies (random placement requested)
  const API_BASE = (window.__TECHMAP_API__ || '/api');
  const payload = await fetch(API_BASE.replace(/\/$/, '') + '/companies').then(r => r.json());
  const companies = (Array.isArray(payload) ? payload : (payload && payload.data) || [])
    .filter(c => c && c.name);

  // World config (full green background)
  const TILE = 28;
  const MARGIN = 3;
  const N = companies.length;
  const SPREAD = 18; // larger => more spread out
  const base = Math.max(160, Math.ceil(Math.sqrt(N * SPREAD)));
  const WORLD_W = Math.min(480, base);
  const WORLD_H = Math.min(360, Math.max(140, Math.round(base * 0.75)));
  const worldPxW = WORLD_W * TILE;
  const worldPxH = WORLD_H * TILE;

  // Random placement without overlap
  const cellKey = (x,y) => `${x},${y}`;
  const byCell = new Map();
  const points = [];
  const taken = new Set();
  function placeRandom() {
    for (let i = 0; i < 2000; i++) {
      const x = MARGIN + (Math.random() * (WORLD_W - 2*MARGIN)) | 0;
      const y = MARGIN + (Math.random() * (WORLD_H - 2*MARGIN)) | 0;
      const k = cellKey(x,y);
      if (!taken.has(k)) return { x, y, k };
    }
    return null;
  }
  for (const c of companies) {
    const spot = placeRandom();
    if (!spot) break;
    taken.add(spot.k);
    const p = { x: spot.x, y: spot.y, data: c };
    points.push(p);
    byCell.set(spot.k, [p]);
  }

  // Player
  let player = { x: Math.floor(WORLD_W/2), y: Math.floor(WORLD_H/2), fx: 0, fy: 0, color: '#ffd35a', moving: false, moveStart: 0, fromX: 0, fromY: 0, toX: 0, toY: 0 };
  player.fromX = player.toX = player.x; player.fromY = player.toY = player.y;
  let cam = { x: 0, y: 0 };

  // Controls (D‑Pad only)
  const keyQueue = [];

  // Dialog
  const dialog = document.getElementById('dialog');
  const dialogName = document.getElementById('dialog-name');
  const dialogText = document.getElementById('dialog-text');
  const dialogLinks = document.getElementById('dialog-links');
  const dialogClose = document.getElementById('dialog-close');
  const closeDialog = () => dialog.classList.add('hidden');
  dialogClose.addEventListener('click', closeDialog);
  // Simple typewriter effect for dialog text
  let typeTimer = null;
  function typeText(el, text, speed = 18) {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
    el.textContent = '';
    let i = 0;
    typeTimer = setInterval(() => {
      el.textContent += text[i++] || '';
      if (i > text.length) { clearInterval(typeTimer); typeTimer = null; }
    }, speed);
  }

  function openDialogForGroup(group) {
    if (!group || group.length === 0) return;
    if (group.length === 1) openDialogSingle(group[0].data);
    else {
      dialogName.textContent = `${group.length} companies here`;
      typeText(dialogText, 'Pick a company to explore:');
      dialogLinks.innerHTML = '';
      for (const p of group) {
        const a = document.createElement('a'); a.href = '#'; a.textContent = p.data.name || 'Unknown';
        a.addEventListener('click', (e) => { e.preventDefault(); openDialogSingle(p.data); });
        dialogLinks.appendChild(a);
      }
      dialog.classList.remove('hidden');
    }
  }
  function openDialogSingle(comp) {
    dialogName.textContent = comp.name || 'Unknown';
    const lines = [];
    lines.push(comp.description || 'No description available.');
    if (comp.founded) lines.push(`Founded: ${comp.founded}`);
    if (comp.employees) lines.push(`Size: ${comp.employees}`);
    typeText(dialogText, lines.join('\n'));
    dialogLinks.innerHTML = '';
    if (comp.website) addLink('Website', comp.website);
    if (comp.linkedin) addLink('LinkedIn', comp.linkedin);
    if (comp.crunchbase) addLink('Crunchbase', comp.crunchbase);
    dialog.classList.remove('hidden');
  }
  function addLink(text, href) { const a = document.createElement('a'); a.href = href; a.textContent = text; a.target = '_blank'; dialogLinks.appendChild(a); }

  // On‑screen D‑Pad
  const gamepad = document.getElementById('gamepad');
  const dpadBtns = gamepad.querySelectorAll('.dpad .btn');
  const abBtns = gamepad.querySelectorAll('.ab .btn');
  let holdTimer = null, repeatTimer = null;
  function dpadPress(dir) {
    const map = { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' };
    keyQueue.push(map[dir]);
  }
  function startHold(dir) {
    dpadPress(dir);
    holdTimer = setTimeout(() => { repeatTimer = setInterval(() => dpadPress(dir), 120); }, 220);
  }
  function endHold() { clearTimeout(holdTimer); clearInterval(repeatTimer); holdTimer = repeatTimer = null; }
  dpadBtns.forEach(btn => {
    const dir = btn.dataset.dir;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); startHold(dir); btn.setPointerCapture(e.pointerId); });
    btn.addEventListener('pointerup',   e => { e.preventDefault(); endHold(); });
    btn.addEventListener('pointercancel', endHold);
    btn.addEventListener('lostpointercapture', endHold);
  });
  abBtns.forEach(btn => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (act === 'interact') {
        const k = cellKey(player.x, player.y);
        const group = byCell.get(k);
        if (group && group.length) openDialogForGroup(group);
      } else if (act === 'cancel') {
        closeDialog();
      }
    });
  });

  // Movement & camera
  const STEP_MS = 140;
  function canStep(nx, ny) { return nx >= 0 && nx < WORLD_W && ny >= 0 && ny < WORLD_H; }
  function enqueueStep(dx, dy, now) {
    if (player.moving) return;
    const nx = player.x + dx, ny = player.y + dy;
    if (!canStep(nx, ny)) return;
    player.moving = true; player.moveStart = now; player.fromX = player.x; player.fromY = player.y; player.toX = nx; player.toY = ny;
  }

  // Draw
  function drawPixelRect(x, y, w, h, fill, stroke) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(x+0.5, y+0.5, w-1, h-1); }
  }
  function drawBackground() {
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const tx1 = Math.min(WORLD_W, Math.ceil((cam.x + W) / TILE));
    const ty1 = Math.min(WORLD_H, Math.ceil((cam.y + H) / TILE));
    for (let gy = ty0; gy < ty1; gy++) {
      for (let gx = tx0; gx < tx1; gx++) {
        const px = gx * TILE - cam.x;
        const py = gy * TILE - cam.y;
        // full green grass variants
        const seed = ((gx*928371 + gy*1237) ^ 0x9e3779b9) >>> 0;
        const r = (seed % 7);
        const c = r < 2 ? '#103428' : r < 5 ? '#0f3d2c' : '#0b2c21';
        drawPixelRect(px, py, TILE, TILE, c, null);
      }
    }
  }
  function drawHouse(px, py) { drawPixelRect(px+4, py+12, TILE*2-8, TILE-12, '#4c3a4f', '#111'); drawPixelRect(px+2, py+2, TILE*2-4, 14, '#d15a5a', '#111'); drawPixelRect(px+TILE-4, py+TILE+2, 6, 6, '#ffd35a', null); }
  function drawCompanies() {
    for (const p of points) {
      const px = Math.round(p.x * TILE - cam.x); const py = Math.round(p.y * TILE - cam.y);
      if (px+TILE*2 < 0 || py+TILE*2 < 0 || px >= W || py >= H) continue;
      drawHouse(px - TILE/2, py - TILE/2);
    }
  }
  function drawPlayer() {
    const px = Math.round(player.x * TILE + player.fx - cam.x); const py = Math.round(player.y * TILE + player.fy - cam.y);
    drawPixelRect(px+8, py+6, TILE-16, TILE-12, '#ffd35a', '#000');
    drawPixelRect(px+TILE/2-2, py+TILE-6, 6, 4, '#000', null);
  }

  function update(now) {
    if (!player.moving && keyQueue.length) {
      const k = keyQueue.shift();
      if (k === 'arrowleft') enqueueStep(-1, 0, now);
      if (k === 'arrowright') enqueueStep(1, 0, now);
      if (k === 'arrowup') enqueueStep(0, -1, now);
      if (k === 'arrowdown') enqueueStep(0, 1, now);
    }
    if (player.moving) {
      const t = Math.min(1, (now - player.moveStart) / STEP_MS);
      player.fx = Math.round((player.toX - player.fromX) * t * TILE);
      player.fy = Math.round((player.toY - player.fromY) * t * TILE);
      if (t >= 1) { player.x = player.toX; player.y = player.toY; player.fx = 0; player.fy = 0; player.moving = false; }
    }
    cam.x = player.x * TILE + player.fx - W/2 + TILE/2; cam.y = player.y * TILE + player.fy - H/2 + TILE/2;
    cam.x = Math.round(Math.max(0, Math.min(worldPxW - W, cam.x)));
    cam.y = Math.round(Math.max(0, Math.min(worldPxH - H, cam.y)));
  }
  function loop(now) { update(now); ctx.clearRect(0,0,W,H); drawBackground(); drawCompanies(); drawPlayer(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
