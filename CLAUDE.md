# BomberMon — CLAUDE.md

Resumo técnico do projeto para referência rápida.

---

## O que é

Jogo multiplayer local 1v1 estilo Bomberman com tema Pokémon, rodando no browser via WebSocket. Dois jogadores se conectam a um servidor Python e jogam em tempo real.

---

## Arquitetura

```
Host (browser)          Servidor Python          Guest (browser)
  GameEngine               ws://…:8765             applyState()
  tick() 20x/s    ←──────  relay  ──────→          Renderer
  Renderer                                          Input → server
```

- **Host** roda toda a lógica do jogo (`engine.js`). É a fonte da verdade.
- **Servidor** (`server.py`) é puro relay — não conhece regras de jogo. Só repassa mensagens entre host e guest.
- **Guest** recebe snapshots de estado e envia inputs. Não simula nada.

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `engine.js` | Lógica do jogo (puro JS, sem DOM) |
| `bombermon_ws.html` | Frontend completo (renderer, UI, networking) |
| `server.py` | Servidor WebSocket manual (sem libs externas) |

---

## Fluxo de mensagens

### Fase: lobby
```
Host → CREATE              → Servidor
       CREATED {code}      ← Servidor

Guest → JOIN {code, name}  → Servidor
        JOINED             ← Servidor
        GUEST_JOINED{name} → Host
```

### Fase: playing (loop 50ms)
```
Host: engine.tick(dt) → snap() → send STATE → Servidor → Guest
Guest: input teclado → INPUT {t:'M', d:'U'} → Servidor → Host → engine.input()
```

### Fase: gameover
```
Host: STATE {phase:'gameover'} → relay → Guest
Guest/Host: INPUT {t:'RESTART'} → voteRestart() → novo init()
```

---

## GameEngine (`engine.js`)

### API pública

```js
engine.init(pdefs, seed)   // inicia partida
engine.tick(dt)            // avança simulação (dt em ms)
engine.input(pid, inp)     // processa input de jogador
engine.snap()              // serializa estado para broadcast
engine.restart()           // reinicia com mesmo cast, novo mapa
engine.voteRestart(pid)    // vota reiniciar; retorna 'restarted'|'voted'
```

### Ciclo de um tick (50ms)

1. Decrementa `timer`; se zerou → `_end(null)`
2. Shrink (se `timer <= 60s`) — fecha bordas a cada 7s
3. Rhydon spawn/tick
4. Bombas — move (se com velocidade), detona se timer zerou
5. Explosões — decrementa timer, aplica dano a jogadores
6. Rhydon → colisão com jogador
7. Timers de jogador (invincibilidade, buffs, respawn)
8. Verificação de vitória: `jogadores vivos ≤ 1` → `_end(winner)`
9. Cleanup de entidades mortas
10. `snap()` → `_broadcastState()`

### Constantes importantes (`ENG`)

| Constante | Valor | Descrição |
|---|---|---|
| `GRID` | 64px | Tamanho do tile |
| `ROWS/COLS` | 13×15 | Grade do mapa |
| `MATCH_TIME` | 180 000ms | 3 minutos |
| `SHRINK_START` | 60 000ms | Começa a fechar nos últimos 60s |
| `SHRINK_EVERY` | 7 000ms | Frequência do shrink |
| `RESPAWN_MS` | 2 500ms | Tempo até respawn |
| `INV_MS` | 3 000ms | Invencibilidade pós-respawn |
| `RHYDON_SPAWN` | 50 000ms | Rhydon aparece após 50s |

### Tipos de célula (`CT`)

```js
CT.WALL   = '▉'  // parede permanente
CT.SOFT   = 1    // caixa destrutível
CT.BOMB   = 2    // bomba no chão
CT.PU     = 3    // powerup
CT.SHRINK = 4    // zona fechada (dano)
```

### Inputs reconhecidos

| `inp.t` | Descrição |
|---|---|
| `'M'` + `inp.d:'U/D/L/R'` | Movimento |
| `'B'` | Plantar bomba |
| `'DETONATE'` | Detonar bombas remotas |
| `'THUNDER'` | Disparar thunder wave |
| `'RESTART'` | Votar reiniciar |

### Powerups (`PU`)

| Código | Nome | Efeito |
|---|---|---|
| `bu` | Bomb Up | +1 bomba simultânea |
| `fu` | Flame Up | +1 tamanho de explosão |
| `su` | Speed Up | -25ms moveDelay |
| `bk` | Bomb Kick | Chutar bombas |
| `rm` | Remote Ctrl | Bombas remotas |
| `iv` | Invincib. | 8s invencível |
| `pg` | Pwr Gloves | Lançar bomba p/ frente |
| `sk` | Skull Bomb | Bomba detona em 1.8s |
| `tw` | Thunder | Thunder wave (até 3×) |
| `ec` | Evasion | Invisível pro Rhydon 7s |
| `dd` | Drag Dance | Velocidade ×1.9 por 8s |
| `ms` | M.Shield | Absorve 1 hit (15s) |
| `me` | Mega Evol. | +2 bombas e tamanho por 15s |
| `sb` | Sitrus ♥ | +1 vida (máx 5) |

---

## Servidor Python (`server.py`)

WebSocket implementado **do zero** (sem frameworks), conforme RFC 6455.

### Estrutura de dados

```python
rooms = {
  "ABCD": {"host": WSClient, "guest": WSClient | None}
}
```

### Lógica de relay

- Mensagens `CREATE` e `JOIN` são tratadas pelo servidor.
- **Qualquer outra mensagem** é repassada diretamente ao outro jogador (relay puro).
- Na desconexão: se host sai → sala destruída; se guest sai → slot liberado. O outro recebe `DISCONNECT`.

### Configuração

```python
HOST = "0.0.0.0"
PORT = 8765
```

---

## Frontend (`bombermon_ws.html`)

### URL de servidor configurável

Prioridade: `?server=` na query string → `localStorage` → `localhost:8765`

Para expor externamente (ex: ngrok):
```
?server=abc123.ngrok.io
```
O código auto-detecta se deve usar `ws://` ou `wss://`.

### Teclas

| Tecla | Ação |
|---|---|
| `↑↓←→` | Mover |
| `Space` | Plantar bomba |
| `X` | Detonar remote |
| `T` | Thunder wave |

### Sprites disponíveis

`SPR.pik` (Pikachu), `SPR.cha` (Charmander), `SPR.squ` (Squirtle), `SPR.bul` (Bulbasaur), `SPR.rhy` (Rhydon — boss)

Cada sprite: paleta de 7 cores + grid 16×16 pixels (4px cada → canvas 64px).

---

## Como rodar

```bash
# Servidor
python server.py

# Frontend
# Abrir bombermon_ws.html no browser
# Host clica "Criar Sala", Guest digita o código e clica "Entrar"
```

**Dependências:** Python 3.10+ (só stdlib). Frontend: zero dependências externas (fonte do Google Fonts é opcional).
