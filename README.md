# 💣 BomberMon — P2P Edition

> Trabalho prático de Sistemas Distribuídos  
> Curso de Ciência da Computação

---

## 📋 Sumário

1. [Descrição do Projeto](#-descrição-do-projeto)
2. [Objetivos](#-objetivos)
3. [Arquitetura do Sistema Distribuído](#-arquitetura-do-sistema-distribuído)
4. [Tecnologias Utilizadas](#-tecnologias-utilizadas)
5. [Planejamento e Etapas](#-planejamento-e-etapas)
6. [Componentes Implementados](#-componentes-implementados)
7. [Protocolo de Comunicação](#-protocolo-de-comunicação)
8. [Banco de Dados](#-banco-de-dados)
9. [Criptografia e Segurança](#-criptografia-e-segurança)
10. [DNS](#-dns)
11. [Ataques e Vulnerabilidades](#-ataques-e-vulnerabilidades)
12. [Como Executar](#-como-executar)
13. [Estrutura de Arquivos](#-estrutura-de-arquivos)
14. [Trabalhos Futuros](#-trabalhos-futuros)

---

## 📖 Descrição do Projeto

**BomberMon** é um jogo multiplayer em tempo real para dois jogadores, desenvolvido como estudo prático de sistemas distribuídos. O jogo é inspirado no clássico Bomberman, com temática Pokémon, e utiliza uma arquitetura distribuída baseada em WebSocket para comunicação entre os participantes.

O sistema é composto por três nós distintos: um **servidor de relay** centralizado (Python), um **cliente host** (navegador web) que executa a lógica autoritativa do jogo, e um **cliente guest** (navegador web) que recebe atualizações de estado e envia inputs. Toda a comunicação ocorre em tempo real através do protocolo WebSocket, com suporte a conexões seguras via `wss://`.

---

## 🎯 Objetivos

- Implementar um sistema distribuído funcional com comunicação em tempo real
- Aplicar o modelo **cliente-servidor com relay** para sincronização de estado
- Demonstrar o uso de **WebSocket** como protocolo de comunicação bidirecional
- Implementar **persistência de dados** com banco de dados relacional (SQLite)
- Garantir **segurança na comunicação** através de criptografia TLS (`wss://`)
- Discutir **resiliência**, **consistência** e **vulnerabilidades** em sistemas distribuídos

---

## 🏗 Arquitetura do Sistema Distribuído

O BomberMon adota uma arquitetura **host-relay-guest**, onde a lógica do jogo é executada inteiramente no cliente host (modelo peer-authoritative), e o servidor atua apenas como intermediário de mensagens.

```
┌─────────────────────────────────────────────────────────┐
│                    SISTEMA DISTRIBUÍDO                   │
│                                                          │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────┐ │
│   │    HOST     │      │  SERVIDOR   │      │  GUEST  │ │
│   │  (Browser)  │◄────►│  (Python)   │◄────►│(Browser)│ │
│   │             │      │             │      │         │ │
│   │ GameEngine  │      │ Relay puro  │      │applyState│ │
│   │ tick() 20/s │      │ SQLite DB   │      │Renderer │ │
│   │ Renderer    │      │ WebSocket   │      │Input    │ │
│   └─────────────┘      └─────────────┘      └─────────┘ │
│                                                          │
│   ◄── wss:// (TLS) ──►         ◄── wss:// (TLS) ──►    │
└─────────────────────────────────────────────────────────┘
```

### Modelo de Consistência

O sistema adota consistência **eventual com fonte única de verdade (single source of truth)**. O host executa a simulação e transmite snapshots completos do estado a cada 50ms. O guest nunca simula — apenas renderiza o estado recebido. Isso elimina conflitos de sincronização ao custo de uma latência inerente de até 50ms.

### Fluxo de Dados

```
[Host] engine.tick(dt)
    └─► snap() → JSON
        └─► ws.send(STATE)
            └─► [Servidor] relay
                └─► ws.send(STATE) → [Guest]
                    └─► applyState() → render()

[Guest] tecla pressionada
    └─► ws.send(INPUT)
        └─► [Servidor] relay
            └─► ws.send(INPUT) → [Host]
                └─► engine.input() → próximo tick
```

---

## 🛠 Tecnologias Utilizadas

### Frontend — JavaScript (Vanilla)
- **Sem frameworks** — escolha deliberada para demonstrar domínio dos fundamentos da Web API
- **Canvas 2D API** — renderização do jogo em tempo real com `requestAnimationFrame`
- **WebSocket API nativa** — comunicação bidirecional com o servidor
- **Módulos JS separados** — organização em `engine.js`, `sprites.js`, `renderer.js`, `ui.js`, `network.js`, `main.js`

### Backend — Python (stdlib apenas)
- **`socket`** — servidor TCP raw
- **`threading`** — uma thread por conexão de cliente
- **`hashlib` + `base64`** — handshake WebSocket conforme RFC 6455
- **`sqlite3`** — persistência de partidas e jogadores
- **Sem frameworks externos** — WebSocket implementado manualmente para fins didáticos

### Infraestrutura
- **ngrok** — túnel seguro com TLS para expor o servidor localmente com `wss://`
- **Python `http.server`** — servidor de arquivos estáticos para o frontend

### Justificativa das Escolhas

| Tecnologia | Alternativa considerada | Justificativa |
|---|---|---|
| WebSocket puro | Socket.IO, PeerJS | Demonstra o protocolo em nível baixo, sem abstrações |
| Python stdlib | FastAPI, websockets lib | Zero dependências, implementação didática do RFC 6455 |
| SQLite | PostgreSQL, MongoDB | Escopo local, sem necessidade de servidor de banco externo |
| Canvas 2D | WebGL, Phaser | Controle total, sem overhead de engine de jogo |
| ngrok | VPS com certificado | Solução rápida para demonstração com TLS real |

---

## 📅 Planejamento e Etapas

| Etapa | Descrição | Status |
|---|---|---|
| 1 | Definição da arquitetura e protocolo de mensagens | ✅ Concluído |
| 2 | Implementação do servidor WebSocket (Python) | ✅ Concluído |
| 3 | Implementação do GameEngine (lógica autoritativa) | ✅ Concluído |
| 4 | Sistema de lobby (criar/entrar sala) | ✅ Concluído |
| 5 | Renderer e sprites | ✅ Concluído |
| 6 | Sincronização de estado host → guest | ✅ Concluído |
| 7 | Sistema de input com relay guest → host | ✅ Concluído |
| 8 | Banco de dados SQLite (persistência de partidas) | ✅ Concluído |
| 9 | Criptografia TLS via wss:// (ngrok) | ✅ Concluído |
| 10 | Modularização do código frontend | ✅ Concluído |
| 11 | Documentação | ✅ Concluído |
| 12 | Suporte a mais de 2 jogadores | 🔲 Trabalho futuro |
| 13 | Autenticação de jogadores | 🔲 Trabalho futuro |
| 14 | Certificado TLS próprio (sem ngrok) | 🔲 Trabalho futuro |

---

## ⚙️ Componentes Implementados

### GameEngine (`client/js/engine.js`)
Núcleo da simulação do jogo. Roda exclusivamente no host e é responsável por toda a lógica autoritativa:

- **`init(pdefs, seed)`** — inicializa partida com geração procedural de mapa via PRNG seeded (xorshift32)
- **`tick(dt)`** — avança a simulação em `dt` milissegundos; processa bombas, explosões, jogadores, Rhydon e shrink
- **`input(pid, inp)`** — aplica input de um jogador ao estado atual
- **`snap()`** — serializa o estado completo para broadcast via JSON
- **`voteRestart(pid)`** — sistema de votação para reiniciar partida

```javascript
// Ciclo principal do host (50ms = 20 ticks/segundo)
tickH = setInterval(() => {
    engine.tick(performance.now() - lastT);
    _broadcastState();  // snap() → ws.send(STATE)
}, 50);
```

### Servidor de Relay (`server.py`)
Implementação manual do protocolo WebSocket (RFC 6455) sem bibliotecas externas:

```python
# Handshake WebSocket
accept = base64.b64encode(
    hashlib.sha1((key + WS_MAGIC).encode()).digest()
).decode()
```

O servidor mantém um dicionário de salas em memória e faz relay bidirecional de mensagens. Persiste resultados no SQLite ao receber `MATCH_OVER`.

### Banco de Dados (`bombermon.db`)
Esquema relacional com duas tabelas:

```sql
CREATE TABLE matches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code   TEXT    NOT NULL,
    started_at  TEXT    NOT NULL,
    duration_s  REAL    NOT NULL,
    winner_name TEXT
);

CREATE TABLE match_players (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id    INTEGER NOT NULL REFERENCES matches(id),
    player_name TEXT    NOT NULL,
    lives_left  INTEGER NOT NULL,
    won         INTEGER NOT NULL
);
```

---

## 📡 Protocolo de Comunicação

O protocolo é baseado em mensagens JSON trafegadas sobre WebSocket. Cada mensagem possui um campo `type` que determina seu tratamento.

### Mensagens do Lobby

| Mensagem | Direção | Payload |
|---|---|---|
| `CREATE` | Host → Servidor | `{ name }` |
| `CREATED` | Servidor → Host | `{ code }` |
| `JOIN` | Guest → Servidor | `{ code, name }` |
| `JOINED` | Servidor → Guest | `{}` |
| `GUEST_JOINED` | Servidor → Host | `{ name }` |

### Mensagens de Jogo

| Mensagem | Direção | Descrição |
|---|---|---|
| `STATE` | Host → Servidor → Guest | Snapshot completo do estado (50ms) |
| `INPUT` | Guest → Servidor → Host | Input de teclado `{ t, d? }` |
| `MATCH_START` | Host → Servidor | Registra início no DB |
| `MATCH_OVER` | Host → Servidor | Persiste resultado no DB |
| `DISCONNECT` | Servidor → Outro | Notifica desconexão |

---

## 🗄 Banco de Dados

### Modelo de Consistência
O banco de dados adota consistência **forte** para os dados persistidos, pois as gravações ocorrem apenas ao final de cada partida (evento atômico). Durante a partida, o estado reside exclusivamente na memória do host — uma decisão de projeto que prioriza performance (sem I/O durante o jogo) sobre durabilidade imediata.

### Ciclo de Vida dos Dados
1. **Durante o lobby** — nenhum dado é persistido
2. **Início da partida** — servidor registra `started_at` em memória
3. **Fim da partida** — host envia `MATCH_OVER`; servidor calcula `duration_s` e grava atomicamente nas tabelas `matches` e `match_players`
4. **Restart** — nova partida gera novo registro; o histórico é preservado

### Replicação
O projeto utiliza uma única instância SQLite (sem replicação), o que é adequado ao escopo acadêmico. Em produção, a replicação poderia ser implementada com PostgreSQL + streaming replication ou um banco distribuído como CockroachDB.

---

## 🔐 Criptografia e Segurança

### TLS via wss://
A comunicação entre clientes e servidor é protegida por **TLS (Transport Layer Security)** através do túnel ngrok, que provisiona automaticamente um certificado SSL válido.

```
Cliente (browser)
    └─► wss://frenzy-federal-immodest.ngrok-free.dev
        └─► TLS 1.3 (ngrok edge)
            └─► http://localhost:8765 (servidor local)
```

A detecção automática de protocolo está implementada no cliente:

```javascript
function buildWsUrl(host) {
    if (host.startsWith('ws://') || host.startsWith('wss://')) return host;
    const secure = !host.startsWith('localhost') &&
                   !host.match(/^127\./) &&
                   !host.match(/^192\.168\./);
    return (secure ? 'wss://' : 'ws://') + host;
}
```

### Handshake WebSocket (RFC 6455)
O handshake do protocolo WebSocket utiliza SHA-1 com uma chave mágica (`258EAFA5-E914-47DA-95CA-C5AB0DC85B11`) para validar a conexão:

```python
accept = base64.b64encode(
    hashlib.sha1((key + WS_MAGIC).encode()).digest()
).decode()
```

Isso garante que apenas clientes que entendem o protocolo WebSocket possam estabelecer conexão.

### Evidência de Funcionamento
A conexão `wss://` pode ser verificada nas ferramentas de desenvolvedor do browser (F12 → Network → WS), onde o campo **Request URL** exibe o protocolo seguro e o **Status Code 101** confirma o upgrade bem-sucedido.

---

## 🌐 DNS

O projeto utiliza o sistema DNS de forma prática através do ngrok, que provisiona automaticamente um **subdomínio DNS** público para o servidor local.

### Como Funciona
Ao executar `ngrok http 8765`, o serviço:
1. Registra um subdomínio no DNS do ngrok (ex: `frenzy-federal-immodest.ngrok-free.dev`)
2. Aponta esse domínio para os servidores de borda do ngrok
3. O ngrok estabelece um túnel seguro até `localhost:8765`

```
Resolução DNS:
frenzy-federal-immodest.ngrok-free.dev
    └─► A/CNAME → servidores ngrok (edge)
        └─► túnel → localhost:8765
```

### Papel do DNS no Sistema
Sem DNS, os jogadores precisariam trocar endereços IP manualmente — inviável em redes domésticas com IP dinâmico e NAT. O DNS abstrai o endereçamento IP e torna o sistema acessível por um nome legível, o que é um princípio fundamental de sistemas distribuídos em produção.

Em um cenário de produção real, o DNS seria configurado com um domínio próprio (ex: `bombermon.com`) apontando para o IP fixo do servidor, com registro `A` ou `CNAME` gerenciado via provedores como Cloudflare ou Route 53.

---

## ⚠️ Ataques e Vulnerabilidades

### DDoS (Distributed Denial of Service)
O servidor atual não implementa proteção contra DDoS. Um atacante poderia:
- Abrir milhares de conexões WebSocket simultâneas, esgotando threads e memória
- Enviar mensagens JSON em alta frequência para saturar o processamento

**Mitigações possíveis:**
- Rate limiting por IP (ex: máximo de conexões por segundo)
- Timeout de handshake para conexões inativas
- Uso de um proxy reverso (nginx) na frente do servidor com limitação de conexões

### Interceptação de Mensagens (Man-in-the-Middle)
Sem `wss://`, as mensagens WebSocket trafegam em texto puro e podem ser interceptadas por qualquer nó intermediário na rede. Com a implementação atual via ngrok (`wss://`), o tráfego é criptografado com TLS, tornando a interceptação inviável sem a chave privada do certificado.

### Manipulação de Input
O servidor faz relay de mensagens sem validação de conteúdo. Um guest malicioso poderia enviar inputs forjados (ex: `{t:'B'}` repetidamente para plantar bombas infinitas). A proteção atual está no engine do host, que valida os inputs recebidos (limite de bombas, delay de movimento, etc.), mas um host malicioso poderia enviar snapshots de estado adulterados para o guest.

**Mitigação futura:** Validação de schema das mensagens no servidor antes do relay.

### Enumeração de Salas
Os códigos de sala são sequências de 4 letras maiúsculas (26⁴ = 456.976 combinações). Um atacante poderia tentar entrar em salas alheias por força bruta.

**Mitigação possível:** Rate limiting de tentativas de `JOIN` por IP.

---

## 🚀 Como Executar

### Pré-requisitos
- Python 3.10+
- Navegador moderno (Chrome, Firefox, Edge)
- ngrok (opcional, para acesso externo com wss://)

### Execução Local (mesma rede)

```bash
# Terminal 1 — servidor do jogo
python server.py

# Terminal 2 — servidor de arquivos estáticos
python -m http.server 3000
```

Abre `http://localhost:3000` no browser.

### Execução com Acesso Externo (wss://)

```bash
# Terminal 1
python server.py

# Terminal 2
python -m http.server 3000

# Terminal 3
ngrok http 8765
```

No campo **SERVIDOR** do jogo, coloca o domínio gerado pelo ngrok (ex: `xyz.ngrok-free.dev`).

### Controles

| Tecla | Ação |
|---|---|
| `↑ ↓ ← →` | Mover personagem |
| `Espaço` | Plantar bomba |
| `X` | Detonar bomba remota |
| `T` | Disparar Thunder Wave |

---

## 📁 Estrutura de Arquivos

```
bombermon/
├── index.html              ← entrada do frontend
├── server.py               ← servidor WebSocket + SQLite
├── bombermon.db            ← banco de dados (gerado automaticamente)
├── CLAUDE.md               ← referência técnica do projeto
├── README.md               ← este arquivo
│
├── client/
│   ├── js/
│   │   ├── engine.js       ← lógica autoritativa do jogo
│   │   ├── sprites.js      ← dados de sprite e pré-renderização
│   │   ├── renderer.js     ← desenho no canvas
│   │   ├── ui.js           ← telas, sidebar, overlays
│   │   ├── network.js      ← WebSocket, host/guest, broadcast
│   │   └── main.js         ← boot e captura de input
│   └── assets/             ← sons e recursos futuros
│
├── diagramas/
│   ├── bombermon_arquitetura.svg
│   ├── bombermon_ciclo_engine.svg
│   └── bombermon_sequencia_mensagens.svg
│
└── docs/
    └── documentacao.md
```

---

## 🔲 Trabalhos Futuros

| Funcionalidade | Descrição |
|---|---|
| Suporte a 4 jogadores | Escalar o relay e o engine para até 4 conexões simultâneas |
| Autenticação | Sistema de login com JWT para identificar jogadores entre sessões |
| Certificado TLS próprio | Substituir ngrok por certificado Let's Encrypt num servidor fixo |
| Validação de mensagens | Schema validation no servidor antes do relay (proteção contra input forjado) |
| Rate limiting | Proteção contra DDoS e enumeração de salas |
| Replicação do banco | Migrar para PostgreSQL com replicação para maior disponibilidade |
| Histórico de partidas | Tela in-game mostrando estatísticas persistidas do banco |
| Reconexão automática | Permitir que um jogador reconecte após queda de rede sem perder a partida |
| Modularização do engine | Separar `engine.js` em submódulos (bombs.js, players.js, rhydon.js) |

---

## 👥 Autores

Desenvolvido como trabalho prático da disciplina de **Sistemas Distribuídos**.

---

*Projeto desenvolvido com fins acadêmicos.*
