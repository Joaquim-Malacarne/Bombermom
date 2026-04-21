'use strict';

// ═══════════════════════════════════════════════════════════
//  renderer.js — Tiles e toda lógica de desenho no canvas
//  Depende de: engine.js (ENG, CT), sprites.js (SPRCC, SPRCC_ME, SPR, prerender)
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

// Estado compartilhado com network.js / main.js
let renderState = null;
let myId        = null;

// ── Tiles pré-renderizados ───────────────────────────────────
const G = ENG.GRID;

function mkWall() {
  const c = document.createElement('canvas'); c.width = c.height = G;
  const x = c.getContext('2d');
  x.fillStyle='#000'; x.fillRect(0,0,G,G);
  x.fillStyle='#141e06'; x.fillRect(1,1,G-2,G-2);
  x.fillStyle='#1a2808'; x.fillRect(3,3,G-6,G-6);
  x.fillStyle='#101804'; x.fillRect(5,5,G-10,G-10);
  x.fillStyle='#080c02';
  [14,30,46].forEach(y => x.fillRect(0,y,G,2));
  [18,36].forEach(xx => x.fillRect(xx,0,2,G));
  return c;
}

function mkSoft() {
  const c = document.createElement('canvas'); c.width = c.height = G;
  const x = c.getContext('2d');
  x.fillStyle='#000'; x.fillRect(0,0,G,G);
  x.fillStyle='#2a1a06'; x.fillRect(1,1,G-2,20);
  x.fillStyle='#1e1204'; x.fillRect(0,23,20,18); x.fillRect(22,23,42,18);
  x.fillStyle='#2a1a06'; x.fillRect(0,43,42,20); x.fillRect(44,43,20,20);
  x.fillStyle='#3a2208';
  x.fillRect(2,2,G-4,18); x.fillRect(1,24,18,16); x.fillRect(23,24,40,16);
  x.fillRect(1,44,40,18); x.fillRect(45,44,18,18);
  x.fillStyle='#4e3010';
  x.fillRect(2,2,G-4,3); x.fillRect(2,2,3,18);
  return c;
}

const wallTile = mkWall();
const softTile = mkSoft();

// ── Ícones e cores de powerup ────────────────────────────────
const PU_ICON = {
  bk:'👟', bu:'💣', fu:'🔥', su:'⚡', rm:'📡',
  iv:'⭐', pg:'🥊', sk:'💀', tw:'⚡', ec:'👻',
  dd:'🐉', ms:'🛡️', me:'✨', sb:'❤️',
};
const PU_COL = {
  bk:'#ff8800', bu:'#ff8800', fu:'#ff4400', su:'#aaff00',
  rm:'#00aaff', iv:'#ffff00', pg:'#ffaaaa', sk:'#cc44ff',
  tw:'#44ccff', ec:'#8888ff', dd:'#ff6600', ms:'#4488ff',
  me:'#ffaa00', sb:'#ff4488',
};

// ── Loop de render principal ─────────────────────────────────
function render() {
  requestAnimationFrame(render);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#080c02';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!renderState?.cells?.length) {
    ctx.fillStyle = '#1a2808';
    ctx.font = '12px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('AGUARDANDO...', canvas.width/2, canvas.height/2);
    return;
  }

  const s   = renderState;
  const now = Date.now();

  // Grade
  for (let r = 0; r < ENG.ROWS; r++) {
    for (let c = 0; c < ENG.COLS; c++) {
      if (!s.cells[r]) continue;
      const cell = s.cells[r][c];
      if (cell === CT.WALL) {
        ctx.drawImage(wallTile, c*G, r*G);
      } else if (cell === CT.SOFT) {
        ctx.drawImage(softTile, c*G, r*G);
      } else if (cell === CT.SHRINK) {
        ctx.fillStyle = Math.floor(now/220)%2 ? '#380a0a' : '#1e0404';
        ctx.fillRect(c*G, r*G, G, G);
        ctx.strokeStyle = '#660000'; ctx.lineWidth = 2;
        ctx.strokeRect(c*G+1, r*G+1, G-2, G-2);
        ctx.strokeStyle = '#440000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c*G+5, r*G+5);   ctx.lineTo(c*G+G-5, r*G+G-5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(c*G+G-5, r*G+5); ctx.lineTo(c*G+5,   r*G+G-5); ctx.stroke();
      } else {
        ctx.fillStyle = (r+c)%2 ? '#0a1204' : '#0c1606';
        ctx.fillRect(c*G, r*G, G, G);
      }
    }
  }

  s.powerups?.forEach(pu  => drawPU(pu, now));
  s.explosions?.forEach(e => drawExp(e, now));
  s.bombs?.forEach(b      => drawBomb(b, now));
  s.players?.forEach(p    => drawPlayer(p, now));
  if (s.rhydon) drawRhydon(s.rhydon, now);

  // Borda de shrink pulsante
  if (s.timer <= ENG.SHRINK_START && s.timer > 0) {
    ctx.save(); ctx.globalAlpha = 0.35 + 0.2*Math.sin(now/220);
    ctx.fillStyle = '#aa0000';
    [
      [0, 0, canvas.width, 8],
      [0, canvas.height-8, canvas.width, 8],
      [0, 0, 8, canvas.height],
      [canvas.width-8, 0, 8, canvas.height],
    ].forEach(([x,y,w,h]) => ctx.fillRect(x,y,w,h));
    ctx.restore();
  }

  // Overlay de respawn
  const me = s.players?.find(p => p.id === myId);
  if (me && !me.alive && me.respawnT > 0) {
    ctx.save(); ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(canvas.width/2-130, canvas.height/2-32, 260, 65);
    ctx.font = '9px "Press Start 2P"'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe000';
    ctx.fillText(`RESPAWN ${Math.ceil(me.respawnT/1000)}s`, canvas.width/2, canvas.height/2-10);
    ctx.fillStyle = '#7aaa28';
    ctx.fillText(
      `${me.lives} VIDA(S) RESTANTE${me.lives!==1?'S':''}`,
      canvas.width/2, canvas.height/2+16
    );
    ctx.restore();
  }
}

// ── Funções de desenho individuais ───────────────────────────

function drawPlayer(p, now) {
  if (!p.alive && (!p.respawnT || p.respawnT <= 0)) return;
  const ghost = !p.alive && p.respawnT > 0;
  if ((p.invT > 0 || p.isIV) && Math.floor(now/100)%2 === 0) return;

  const scale = p.isME ? 1.25 : 1.0;
  const x = (p.c + 0.5)*G, y = (p.r + 0.5)*G;
  const sz = G * scale;

  ctx.save();
  if (ghost)       ctx.globalAlpha = 0.28 + 0.18*Math.sin(now/210);
  if (p.isCloaked) ctx.globalAlpha = 0.25 + 0.08*Math.sin(now/180);

  // Efeito M.Shield
  if (p.hasMS && !ghost) {
    ctx.save(); ctx.globalAlpha = 0.5 + 0.2*Math.sin(now/160);
    ctx.strokeStyle = '#4488ff'; ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const a = now/350 + i*Math.PI/3;
      ctx.beginPath();
      ctx.arc(x+Math.cos(a)*(sz/2+10), y+Math.sin(a)*(sz/2+10), 5, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Efeito Drag Dance
  if (p.isDD && !ghost) {
    ctx.save(); ctx.globalAlpha = 0.4;
    for (let i = 0; i < 6; i++) {
      const a = now/200 + i*Math.PI/3;
      const d = sz/2 + 6 + 3*Math.sin(now/130+i);
      ctx.fillStyle = i%2 ? '#ff6000' : '#ff2000';
      ctx.beginPath(); ctx.arc(x+Math.cos(a)*d, y+Math.sin(a)*d, 4, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // Sombra
  ctx.save(); ctx.globalAlpha *= 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y+sz*0.42, sz*0.35, sz*0.1, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  // Sprite
  const sprImg = p.isME ? SPRCC_ME[p.si] : SPRCC[p.si];
  if (sprImg) ctx.drawImage(sprImg, x-sz/2, y-sz/2, sz, sz);

  // Chama do Charmander
  if (p.si === 1 && !ghost) {
    const fl = Math.sin(now/160)*5;
    ctx.save();
    drawFlame(ctx, x+sz*0.22, y-sz*0.52+fl, sz*0.14);
    ctx.restore();
  }

  // Nome
  ctx.save(); ctx.globalAlpha = 1;
  ctx.font = '7px "Press Start 2P"'; ctx.textAlign = 'center';
  const nm  = (p.name||'?').substring(0,7);
  const tw2 = ctx.measureText(nm).width;
  ctx.fillStyle = 'rgba(0,0,0,.75)';
  ctx.fillRect(x-tw2/2-3, y-sz/2-19, tw2+6, 12);
  ctx.fillStyle = p.color;
  ctx.fillText(nm, x, y-sz/2-9);
  ctx.restore();

  // Corações
  ctx.save(); ctx.globalAlpha = 1;
  ctx.font = '11px serif'; ctx.textAlign = 'center';
  const hc = Math.min(p.lives, 5);
  for (let i = 0; i < hc; i++) {
    ctx.fillStyle = '#d02030';
    ctx.fillText('♥', x-(hc-1)*5+i*10, y+sz/2+17);
  }
  ctx.restore();

  ctx.restore();
}

function drawFlame(ctx, x, y, r) {
  const t = Date.now();
  const flicker = [0,2,-2,1,-1][Math.floor(t/100)%5];
  ctx.fillStyle = '#FF4400'; ctx.fillRect(x-r*0.5+flicker, y-r*1.2,  r,    r*1.4);
  ctx.fillStyle = '#FF8800'; ctx.fillRect(x-r*0.3+flicker, y-r*0.9,  r*0.6, r);
  ctx.fillStyle = '#FFCC00'; ctx.fillRect(x-r*0.15+flicker, y-r*0.55, r*0.3, r*0.6);
}

function drawBomb(b, now) {
  const x = (b.c+0.5)*G, y = (b.r+0.5)*G;
  const pulse = Math.sin(now/130) > 0;
  const R = pulse ? G*0.44 : G*0.35;
  const cols = { normal:['#111','#ff5500'], skull:['#220028','#cc00ee'], mega:['#001838','#0066ff'] };
  const [bc, gc] = cols[b.type] || cols.normal;

  ctx.save(); ctx.globalAlpha = 0.2;
  const gg = ctx.createRadialGradient(x,y,0,x,y,R*2.2);
  gg.addColorStop(0, gc); gg.addColorStop(1, 'transparent');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x,y,R*2.2,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#000'; ctx.fillRect(x-R, y-R, R*2, R*2);
  ctx.fillStyle = bc;     ctx.fillRect(x-R+2, y-R+2, R*2-4, R*2-4);
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x-R+2, y-R+2, R-2, R*0.6);

  if (b.remote) {
    ctx.save(); ctx.strokeStyle='#00ccff'; ctx.lineWidth=2;
    ctx.setLineDash([4,4]); ctx.lineDashOffset = Math.floor(now/80)%2*4;
    ctx.strokeRect(x-R-5, y-R-5, R*2+10, R*2+10);
    ctx.restore();
  }

  const fy = pulse ? -G*0.12 : 0;
  const fc = b.type==='skull' ? '#cc00ee' : b.type==='mega' ? '#0066ff' : '#cc8800';
  ctx.strokeStyle = fc; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc((b.c+0.72)*G, (b.r+0.28)*G+fy, 9, Math.PI, -Math.PI/2);
  ctx.stroke();
  if (pulse) {
    const sparks = b.type==='skull' ? '#ff80ff' : b.type==='mega' ? '#80d0ff' : '#ffee00';
    ctx.fillStyle = sparks;
    ctx.fillRect((b.c+0.69)*G-3, (b.r+0.28)*G+fy-14, 7, 7);
  }
}

function drawExp(e, now) {
  const x = e.c*G, y = e.r*G;
  const h = e.dir?.c !== 0, v = e.dir?.r !== 0;
  let c0, c1, c2, c3;
  if      (e.kind==='thunder') { c0='#001060'; c1='#0044c0'; c2='#22aaff'; c3='#ddf4ff'; }
  else if (e.kind==='skull')   { c0='#1c0024'; c1='#7700aa'; c2='#dd44ff'; c3='#ffffff'; }
  else if (e.kind==='mega')    { c0='#001040'; c1='#0050d0'; c2='#2288ff'; c3='#aaddff'; }
  else if (e.kind==='shield')  { c0='#001840'; c1='#2255aa'; c2='#55aaff'; c3='#ffffff'; }
  else                         { c0='#680000'; c1='#b03000'; c2='#ff7000'; c3='#ffdd80'; }

  ctx.fillStyle=c0; ctx.fillRect(x,y,G,G);
  ctx.fillStyle=c1;
  if (e.center||h) ctx.fillRect(x,y+7,G,G-14);
  if (e.center||v) ctx.fillRect(x+7,y,G-14,G);
  ctx.fillStyle=c2;
  if (e.center||h) ctx.fillRect(x,y+15,G,G-30);
  if (e.center||v) ctx.fillRect(x+15,y,G-30,G);
  ctx.fillStyle=c3;
  if (e.center)    ctx.fillRect(x+22,y+22,G-44,G-44);

  if (e.kind==='thunder') {
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=2;
    const cx2=x+G/2, cy2=y+G/2;
    for (let i=0; i<4; i++) {
      const a = now/600 + i*Math.PI/2;
      ctx.beginPath(); ctx.moveTo(cx2,cy2);
      ctx.lineTo(cx2+Math.cos(a)*22, cy2+Math.sin(a)*22); ctx.stroke();
    }
  }
}

function drawPU(pu, now) {
  const cx = pu.c*G+G/2, cy = pu.r*G+G/2;
  const bob = Math.sin(now/400 + pu.r*3 + pu.c)*2.5;
  const col = PU_COL[pu.type] || '#fff';

  ctx.save(); ctx.globalAlpha = 0.25 + 0.12*Math.sin(now/300+pu.r);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, cy+bob, G*0.38, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  const x=pu.c*G+7, y=pu.r*G+7, w=G-14;
  ctx.fillStyle='#0a1404'; ctx.fillRect(x, y+bob, w, w);
  ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(x+1, y+bob+1, w-2, w-2);
  ctx.font='22px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(PU_ICON[pu.type]||'?', cx, cy+bob);
  ctx.textBaseline='alphabetic';
}

function drawRhydon(rh, now) {
  const x = (rh.c+0.5)*G, y = (rh.r+0.5)*G;
  const sz  = G;
  const bob = rh.frame ? 2 : -2;

  ctx.save(); ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y+sz*0.42, sz*0.38, sz*0.1, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.drawImage(prerender(SPR.rhy, null), x-sz*0.55, y-sz*0.55+bob, sz*1.1, sz*1.1);

  if (rh.state === 'chase') {
    ctx.save(); ctx.globalAlpha = 0.5 + 0.3*Math.sin(now/180);
    ctx.strokeStyle='#cc0000'; ctx.lineWidth=2;
    ctx.setLineDash([4,4]);
    ctx.strokeRect(x-sz*0.55, y-sz*0.55+bob, sz*1.1, sz*1.1);
    ctx.restore();
  }

  // Barra de HP
  const bw=G*0.9, bh=6;
  const bx=x-bw/2, by=y-sz*0.65-10;
  ctx.fillStyle='#000'; ctx.fillRect(bx-1, by-1, bw+2, bh+2);
  ctx.fillStyle='#440000'; ctx.fillRect(bx, by, bw, bh);
  const ratio = rh.hp / rh.maxHp;
  ctx.fillStyle = ratio>0.5 ? '#22cc22' : ratio>0.25 ? '#cc8800' : '#cc2222';
  ctx.fillRect(bx, by, bw*ratio, bh);
  ctx.font='7px "Press Start 2P"'; ctx.textAlign='center'; ctx.fillStyle='#fff';
  ctx.fillText('RHYDON', x, by-2);
}
