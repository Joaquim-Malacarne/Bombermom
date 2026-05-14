'use strict';

// ═══════════════════════════════════════════════════════════
//  ui.js — Gerenciamento de interface (telas, sidebar, overlays)
//  Depende de: engine.js (ENG), renderer.js (myId, renderState, canvas)
// ═══════════════════════════════════════════════════════════

// ── Navegação entre telas ────────────────────────────────────
function showScr(id) {
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  const ov = document.getElementById('ov');
  if (id) {
    document.getElementById(id)?.classList.add('on');
    ov.classList.remove('hidden');
  } else {
    ov.classList.add('hidden');
  }
}

// ── Status text ──────────────────────────────────────────────
function setSt(el, msg, type = '') {
  const e = document.getElementById(el); if (!e) return;
  e.textContent = msg;
  e.className = 'st' + (type ? ' ' + type : '');
}

// ── Lista de jogadores no lobby ──────────────────────────────
function updateLobby(players) {
  const el = document.getElementById('lplist'); if (!el) return;
  el.innerHTML = '';
  players.forEach(p => {
    const d = document.createElement('div');
    d.className = 'pentry';
    d.innerHTML = `<span class="pdot" style="background:${p.color}"></span>${p.name}${p.id === myId ? ' (você)' : ''}`;
    el.appendChild(d);
  });
}

// ── Tela de game over ────────────────────────────────────────
function showOver(s) {
  const win = s.players?.find(p => p.id === s.winner);
  let title, col;
  if (s.winner === null || s.winner === undefined) {
    title = '💀 EMPATE!'; col = '#888';
  } else if (s.winner === myId) {
    title = '🏆 VOCÊ\nVENCEU!'; col = '#d4a820';
  } else {
    title = `${win?.name || '?'}\nVENCEU!`; col = '#e05030';
  }

  const tt = document.getElementById('otitle');
  tt.textContent = title; tt.style.color = col;
  canvas.className = s.winner === myId ? 'win' : '';

  const pl = document.getElementById('oplist');
  if (pl) {
    pl.innerHTML = '';
    s.players?.forEach(p => {
      const d = document.createElement('div');
      d.className = 'pentry';
      const alive = p.alive || (p.respawnT > 0 && p.lives > 0);
      d.innerHTML = `<span class="pdot" style="background:${p.color}"></span>${p.name} ${p.id === s.winner ? '🏆' : alive ? '' : '💀'} — ${p.lives}♥`;
      pl.appendChild(d);
    });
  }

  document.getElementById('stvote').textContent = '';
  document.getElementById('brst').textContent = '↺ JOGAR DE NOVO';
  document.getElementById('brst').disabled = false;
  document.getElementById('brst').style.display = '';
  showScr('so');
}

// ── Overlay de desconexão ────────────────────────────────────
function showDisconnect(msg) {
  if (typeof tickH !== 'undefined' && tickH) {
    clearInterval(tickH);
    // tickH é gerenciado em network.js, este aviso é visual apenas
  }
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('on'));
  document.getElementById('otitle').textContent = '⚠ DESCONECTADO';
  document.getElementById('otitle').style.color = '#cc4444';
  document.getElementById('oplist').innerHTML =
    `<div class="pentry" style="justify-content:center;color:#cc8888">${msg}</div>`;
  document.getElementById('stvote').textContent = '';
  document.getElementById('brst').style.display = 'none';
  document.getElementById('so').classList.add('on');
  document.getElementById('ov').classList.remove('hidden');
}

// ── Sidebar (timer, jogadores, items) ────────────────────────
function updateSidebar(s) {
  if (!s) return;

  // Timer
  const ms  = Math.max(0, s.timer || 0);
  const m   = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const tel = document.getElementById('tmr');
  tel.textContent = `${m}:${sec.toString().padStart(2,'0')}`;
  tel.className   = ms < 30000 ? 'd' : '';
  document.getElementById('sw').textContent =
    ms <= ENG.SHRINK_START && ms > 0 ? '⚠ FECHANDO' : '';

  // Jogadores
  const sbp = document.getElementById('sbp'); if (!sbp) return;
  sbp.innerHTML = '';
  s.players?.forEach(p => {
    const row = document.createElement('div');
    row.className = 'sbr' + (p.alive ? '' : ' dead');
    row.innerHTML =
      `<span class="pdot" style="background:${p.alive ? p.color : '#222'}"></span>` +
      `<span style="color:${p.alive ? p.color : '#333'};font-size:7px">${(p.name||'?').slice(0,6)}</span>` +
      `<span class="sph">${'♥'.repeat(Math.max(0, Math.min(p.lives,5)))}</span>`;
    sbp.appendChild(row);
  });

  // Items do jogador local
  const me  = s.players?.find(p => p.id === myId);
  const pul = document.getElementById('pul');
  if (pul && me) {
    const items = [];
    if (me.hasBK)    items.push('KICK');
    if (me.hasRM)    items.push('REMOTE');
    if (me.hasPG)    items.push('GLOVES');
    if (me.hasSK)    items.push('SKULL');
    if (me.hasTW)    items.push(`⚡×${me.hasTW}`);
    if (me.isIV)     items.push('★ INVINC');
    if (me.isCloaked)items.push('👻CLOAKED');
    if (me.isDD)     items.push('🐉DRAG');
    if (me.hasMS)    items.push('🛡SHIELD');
    if (me.isME)     items.push('✨MEGA');
    items.push(`💣×${me.numBombs} 🔥×${me.bombSize}`);
    pul.innerHTML = items.join('<br>') || '—';
  }
}

// ── Aplica snapshot de estado vindo da rede ──────────────────
function applyState(s) {
  const oldPhase = renderState?.phase ?? 'lobby';
  renderState = s;
  updateSidebar(s);

  if (s.phase === 'playing' && oldPhase !== 'playing') {
    showScr(null); canvas.className = '';
  }
  if (s.phase === 'gameover' && oldPhase !== 'gameover') {
    showOver(s);
  }
  if (s.phase === 'gameover' && s.votes !== undefined) {
    const total = s.players?.length || 2;
    document.getElementById('stvote').textContent =
      s.votes > 0 ? `VOTOS: ${s.votes}/${total}` : '';
  }
}
