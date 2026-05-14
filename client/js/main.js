'use strict';

// ═══════════════════════════════════════════════════════════
//  main.js — Boot, captura de input e inicialização
//  Depende de: todos os outros módulos
// ═══════════════════════════════════════════════════════════

// ── Input de teclado ─────────────────────────────────────────
const held = {};

document.addEventListener('keydown', e => {
  const managed = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyX','KeyT'];
  if (managed.includes(e.code)) e.preventDefault();
  held[e.code] = true;
  if (renderState?.phase !== 'playing') return;
  if (e.code === 'Space') sendInput({ t: 'B' });
  if (e.code === 'KeyX')  sendInput({ t: 'DETONATE' });
  if (e.code === 'KeyT')  sendInput({ t: 'THUNDER' });
});

document.addEventListener('keyup', e => { held[e.code] = false; });

// Loop de movimento contínuo (teclas seguradas)
setInterval(() => {
  if (renderState?.phase !== 'playing') return;
  if (held['ArrowUp'])    sendInput({ t: 'M', d: 'U' });
  if (held['ArrowDown'])  sendInput({ t: 'M', d: 'D' });
  if (held['ArrowLeft'])  sendInput({ t: 'M', d: 'L' });
  if (held['ArrowRight']) sendInput({ t: 'M', d: 'R' });
}, 30);

// ── Enter nos campos de texto ────────────────────────────────
document.getElementById('inp-n').addEventListener('keydown', e => {
  if (e.key === 'Enter')
    document.getElementById('inp-r').value ? goJoin() : goHost();
});
document.getElementById('inp-r').addEventListener('keydown', e => {
  if (e.key === 'Enter') goJoin();
});
document.getElementById('inp-srv').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('inp-n').focus();
});

// ── Boot ─────────────────────────────────────────────────────
initSprites();
showScr('sm');
render();
