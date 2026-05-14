'use strict';

// ═══════════════════════════════════════════════════════════
//  network.js — WebSocket, lógica de host/guest, broadcast
//  Depende de: engine.js (GameEngine), ui.js (applyState, showDisconnect, etc.)
// ═══════════════════════════════════════════════════════════

// ── Configuração de servidor ─────────────────────────────────
const DEFAULT_SRV = 'localhost:8765';
const LS_KEY      = 'bombermon_server';

function getSrvInput() {
  return document.getElementById('inp-srv').value.trim() || DEFAULT_SRV;
}

function buildWsUrl(host) {
  if (host.startsWith('ws://') || host.startsWith('wss://')) return host;
  const secure = !host.startsWith('localhost') &&
                 !host.match(/^127\./) &&
                 !host.match(/^192\.168\./);
  return (secure ? 'wss://' : 'ws://') + host;
}

function resetSrv() {
  document.getElementById('inp-srv').value = DEFAULT_SRV;
  localStorage.removeItem(LS_KEY);
}

// Inicializa campo com ?server= ou localStorage ou default
(function initSrvField() {
  const params      = new URLSearchParams(window.location.search);
  const fromUrl     = params.get('server');
  const fromStorage = localStorage.getItem(LS_KEY);
  document.getElementById('inp-srv').value = fromUrl || fromStorage || DEFAULT_SRV;
})();

// ── Estado de rede ───────────────────────────────────────────
let isHost     = false;
let ws         = null;
let engine     = null;
let tickH      = null;
let roomCode   = null;
let _guestName = 'Guest';

function _makeWs() {
  const srv = getSrvInput();
  if (srv !== DEFAULT_SRV) localStorage.setItem(LS_KEY, srv);
  else localStorage.removeItem(LS_KEY);
  return new WebSocket(buildWsUrl(srv));
}

// ── Criar sala (host) ────────────────────────────────────────
function goHost() {
  const name = (document.getElementById('inp-n').value.trim() || 'Host').slice(0, 12);
  setSt('stm', 'Criando sala...', 'w');
  isHost = true;
  myId   = 0;

  ws = _makeWs();
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'CREATE', name }));
  ws.onmessage = (e) => { try { _handleMsg(JSON.parse(e.data)); } catch {} };
  ws.onerror   = ()  => setSt('stm', 'Erro ao conectar. Verifique o endereço do servidor.', 'err');
  ws.onclose   = ()  => {
    if (renderState?.phase === 'playing') showDisconnect('Conexão com o servidor encerrada.');
  };
}

// ── Entrar na sala (guest) ───────────────────────────────────
function goJoin() {
  const name = (document.getElementById('inp-n').value.trim() || 'Guest').slice(0, 12);
  const code = document.getElementById('inp-r').value.trim().toUpperCase();
  if (code.length !== 4) { setSt('stm', 'Código deve ter 4 letras.', 'err'); return; }

  isHost   = false;
  myId     = 1;
  roomCode = code;
  showScr('sj');
  setSt('stj', 'Conectando ao servidor...', 'w');

  ws = _makeWs();
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'JOIN', code, name }));
  ws.onmessage = (e) => { try { _handleMsg(JSON.parse(e.data)); } catch {} };
  ws.onerror   = ()  => setSt('stj', 'Erro ao conectar. Verifique o endereço do servidor.', 'err');
  ws.onclose   = ()  => {
    if (renderState?.phase === 'playing') showDisconnect('Conexão com o servidor encerrada.');
  };
}

// ── Roteador de mensagens recebidas ─────────────────────────
function _handleMsg(msg) {
  if (isHost) {
    switch (msg.type) {
      case 'CREATED': {
        roomCode = msg.code;
        const hostName = document.getElementById('inp-n').value.trim() || 'Host';
        document.getElementById('rctxt').textContent = roomCode;
        const srv = getSrvInput();
        document.getElementById('share-link').textContent = srv;
        showScr('sl');
        updateLobby([{ id: 0, name: hostName, color: COLORS[0] }]);
        setSt('stl', 'Aguardando jogador...', 'w');
        break;
      }
      case 'GUEST_JOINED': {
        _guestName = msg.name || 'Guest';
        const hostName = document.getElementById('inp-n').value.trim() || 'Host';
        updateLobby([
          { id: 0, name: hostName,   color: COLORS[0] },
          { id: 1, name: _guestName, color: COLORS[1] },
        ]);
        setSt('stl', 'Pronto! Pode iniciar.', 'ok');
        document.getElementById('bstart').style.display = 'block';
        break;
      }
      case 'INPUT': {
        if (!engine || engine.phase !== 'playing') return;
        const result = engine.input(msg.pid, msg.data);
        if (result === 'restarted' || result === 'voted') _broadcastState();
        break;
      }
      case 'DISCONNECT':
        showDisconnect('O outro jogador desconectou.');
        break;
    }

  } else {
    switch (msg.type) {
      case 'JOINED':
        setSt('stj', 'Conectado! Aguardando host iniciar...', 'ok');
        break;
      case 'STATE':
        applyState(msg);
        break;
      case 'ERROR':
        setSt('stj', msg.msg || 'Erro.', 'err');
        break;
      case 'DISCONNECT':
        showDisconnect('O host desconectou.');
        break;
    }
  }
}

// ── Iniciar partida (host) ───────────────────────────────────
function hostStart() {
  if (!isHost) return;
  const hostName = document.getElementById('inp-n').value.trim() || 'Host';
  const pdefs    = [{ id: 0, name: hostName }, { id: 1, name: _guestName }];
  const seed     = Date.now() & 0xffffff;

  engine = new GameEngine();
  engine.init(pdefs, seed);

  // Notifica servidor do início (para registrar horário no DB)
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ type: 'MATCH_START' }));

  if (tickH) clearInterval(tickH);
  let lastT = performance.now();

  tickH = setInterval(() => {
    if (!engine || engine.phase !== 'playing') return;
    const now = performance.now();
    engine.tick(now - lastT);
    lastT = now;
    _broadcastState();
    if (engine.phase === 'gameover') {
      clearInterval(tickH);
      tickH = null;
      _sendMatchOver();
    }
  }, 50);

  _broadcastState();
}

// ── Broadcast do snapshot de estado ─────────────────────────
function _broadcastState() {
  const s = engine.snap();
  applyState(s);
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify(s));
}

// ── Notifica servidor do resultado final ─────────────────────
function _sendMatchOver() {
  if (!engine || !ws || ws.readyState !== WebSocket.OPEN) return;
  const s      = engine.snap();
  const winner = s.players?.find(p => p.id === s.winner);
  ws.send(JSON.stringify({
    type:    'MATCH_OVER',
    winner:  winner?.name ?? null,
    players: s.players.map(p => ({
      name:  p.name,
      lives: p.lives,
      won:   p.id === s.winner,
    })),
  }));
}

// ── Envio de input ───────────────────────────────────────────
function sendInput(data) {
  if (isHost) {
    const result = engine?.input(myId, data);
    if (result === 'restarted' || result === 'voted') _broadcastState();
  } else {
    if (ws && ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'INPUT', pid: myId, data }));
  }
}

// ── Votar reiniciar ──────────────────────────────────────────
function voteRestart() {
  sendInput({ t: 'RESTART' });
  const btn = document.getElementById('brst');
  btn.textContent = 'VOTANDO...';
  btn.disabled    = true;
}
