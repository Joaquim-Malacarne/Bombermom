# 🎮 Regras e Fluxo do Jogo

---

## 🗺 O Mapa

O jogo se passa em uma grade de **13 linhas × 15 colunas** (195 células), onde cada célula mede 64×64 pixels. O mapa é gerado proceduralmente a cada partida usando um PRNG seeded (xorshift32), garantindo que host e guest sempre vejam o mesmo mapa — mesmo sem trocarem a grade inteira.

Existem quatro tipos de célula:

| Tipo | Símbolo | Descrição |
|---|---|---|
| Parede permanente | `▉` | Indestrutível. Nunca pode ser atravessada ou destruída. |
| Caixa destrutível | Soft | Destruída por explosões. Pode soltar um powerup ao ser destruída (40% de chance). |
| Powerup | PU | Item coletável no chão. Coletado ao andar sobre ele. |
| Zona fechada | Shrink | Criada pelo mecanismo de shrink. Causa dano ao jogador que pisar nela. |

**Zonas seguras de spawn:** cada um dos quatro cantos do mapa tem uma área de 2 tiles garantidamente livre de caixas, para que os jogadores não nasçam bloqueados.

---

## 👾 Personagens

Cada jogador escolhe (automaticamente, pela posição) um dos quatro personagens Pokémon disponíveis:

| Índice | Personagem | Cor |
|---|---|---|
| 0 | Pikachu | Amarelo `#F8D000` |
| 1 | Charmander | Laranja `#F07030` |
| 2 | Squirtle | Azul `#4090D8` |
| 3 | Bulbasaur | Verde `#60A860` |

O **host** sempre joga como o personagem 0 (Pikachu), e o **guest** como o personagem 1 (Charmander).

---

## ⏱ Estrutura de uma Partida

### Duração

Cada partida tem duração máxima de **3 minutos (180 segundos)**. Se o tempo esgotar sem que um jogador elimine o outro, a partida termina em **empate**.

### Condição de vitória

A partida termina quando **restar 1 ou nenhum jogador vivo** (contando jogadores em processo de respawn como ainda "vivos"). O sobrevivente é declarado vencedor.

### Vidas

Cada jogador começa com **3 vidas**. Ao perder uma vida, o jogador entra em **respawn** por 2,5 segundos e retorna ao seu canto de origem com **3 segundos de invencibilidade** (pisca na tela). Ao perder a última vida, é eliminado definitivamente.

---

## 🕹 Controles

| Tecla | Ação |
|---|---|
| `↑ ↓ ← →` | Mover o personagem |
| `Espaço` | Plantar uma bomba na posição atual |
| `X` | Detonar todas as bombas remotas (requer powerup REMOTE CTRL) |
| `T` | Disparar Thunder Wave (requer powerup THUNDER) |

O movimento é **baseado em delay**: o personagem só se move novamente após um intervalo mínimo (padrão: 190ms), que pode ser reduzido por powerups de velocidade.

---

## 💣 Sistema de Bombas

### Plantio

O jogador planta uma bomba na célula em que está, desde que:
- Não haja já uma bomba naquela célula.
- O jogador não tenha atingido seu limite de bombas simultâneas (padrão: 1).

### Explosão

Após **3 segundos**, a bomba explode automaticamente, propagando chamas nas 4 direções cardinais (cima, baixo, esquerda, direita) por até **3 células** (padrão). As chamas param ao atingir:
- Uma **parede permanente** (bloqueio total).
- Uma **caixa destrutível** (a caixa é destruída e a chama para).
- Outra **bomba** (reação em cadeia — detona a bomba atingida imediatamente).
- Uma **zona fechada** (bloqueio total).

As chamas duram **360ms** visíveis na tela.

### Reação em cadeia

Uma explosão que atinge outra bomba a detona imediatamente, podendo criar reações em cadeia por todo o mapa.

### Tipos de bomba

| Tipo | Origem | Diferença |
|---|---|---|
| Normal | Padrão | Timer de 3s, tamanho padrão |
| Skull | Powerup Skull Bomb | Timer de 1,8s (explode mais rápido) |
| Mega | Powerup Mega Evolução | +2 no tamanho da explosão |
| Remote | Powerup Remote Ctrl | Não explode por timer — só ao pressionar `X` |

---

## 🔥 Sistema de Dano

### Jogador atingido por explosão

Se um jogador (sem invencibilidade ativa) estiver na mesma célula de uma chama de explosão, ele perde **1 vida**. Ao perder a vida:
- Todos os buffs ativos são removidos (Mega Evolução reverte os bônus).
- Inicia o timer de respawn (2,5s).

### Invencibilidade pós-respawn

Após renascer, o jogador fica invencível por **3 segundos** (efeito de piscar). Durante esse período, explosões e o Rhydon não causam dano.

### M.Shield

Se o jogador tiver o powerup M.Shield ativo, o primeiro hit é absorvido. Ao absorver, o shield se rompe e gera uma pequena explosão de escudo ao redor do jogador.

---

## 📦 Sistema de Powerups

Powerups surgem no chão ao destruir caixas (40% de chance por caixa destruída, ou 65% quando destruídas por Thunder Wave). São coletados automaticamente ao andar sobre eles.

| Código | Nome | Efeito |
|---|---|---|
| `bu` | Bomb Up | +1 bomba simultânea (máx. 8) |
| `fu` | Flame Up | +1 no tamanho da explosão (máx. 10) |
| `su` | Speed Up | -25ms no delay de movimento (mín. 65ms) |
| `bk` | Bomb Kick | Permite chutar bombas ao caminhar em direção a elas |
| `rm` | Remote Ctrl | Bombas plantadas não explodem por timer — detonadas com `X` |
| `iv` | Invincib. | 8 segundos de invencibilidade total |
| `pg` | Pwr Gloves | Bombas são lançadas para frente ao serem plantadas |
| `sk` | Skull Bomb | Bombas explodem em 1,8s em vez de 3s |
| `tw` | Thunder | Ganha 1 carga de Thunder Wave (máx. 3 cargas) |
| `ec` | Evasion | Fica invisível para o Rhydon por 7 segundos |
| `dd` | Drag Dance | Velocidade ×1,9 por 8 segundos |
| `ms` | M.Shield | Absorve 1 hit (dura 15s) |
| `me` | Mega Evol. | +2 bombas e +2 tamanho de explosão por 15s (revertido ao morrer) |
| `sb` | Sitrus ♥ | +1 vida (máx. 5 vidas) |

### Bomb Kick

Com o Bomb Kick, ao tentar se mover para uma célula com bomba, em vez de ser bloqueado o jogador **chuta a bomba** na direção do movimento. A bomba desliza pelo mapa (a cada 130ms avança 1 célula) até colidir com uma parede, caixa ou borda.

### Power Gloves

Com as Power Gloves, ao plantar uma bomba ela é imediatamente **lançada para a direção em que o jogador está virado**, deslizando pelo mapa até colidir com algo.

### Thunder Wave

Ao pressionar `T`, o jogador dispara uma onda de choque a partir da sua posição em **4 direções simultâneas**, atingindo até **7 células** em cada direção. A Thunder Wave:
- Destrói caixas no caminho (65% de chance de dropar powerup).
- Detona bombas que atingir.
- Causa dano a jogadores (sem invencibilidade) que estiverem no alcance.
- É bloqueada por paredes permanentes e zonas de shrink.

Cada carga consome 1 uso. O cooldown entre usos é de 1,5 segundos.

---

## 🦏 Rhydon (Boss do Mapa)

Após **50 segundos** de partida, o **Rhydon** aparece no centro do mapa como um inimigo autônomo.

### Comportamento

O Rhydon alterna entre dois estados:

- **Wander (vagar):** move-se aleatoriamente pelo mapa com inércia (tende a manter a direção). Intervalo entre movimentos: 750ms.
- **Chase (perseguição):** quando um jogador se aproxima a **3 tiles** ou menos (sem contar jogadores com Evasion ativa), o Rhydon entra em modo de perseguição e tenta alcançar o jogador mais próximo. Intervalo entre movimentos: 520ms.

### Destruição de obstáculos

O Rhydon **destrói caixas** ao caminhar sobre elas, mas é bloqueado por paredes permanentes, bombas e zonas de shrink.

### Dano ao jogador

Se o Rhydon ocupar a mesma célula que um jogador (sem invencibilidade), o jogador perde **1 vida**.

### HP e morte

O Rhydon tem **4 pontos de vida (HP)**. Cada vez que uma explosão atinge a célula onde ele está, ele perde 1 HP. Ao morrer, ele dropa **até 5 powerups garantidos** ao redor da célula onde caiu, e ressurge após **65 segundos**.

### Evasion

O jogador com o powerup **Evasion** ativo fica invisível para o Rhydon — o Rhydon o ignora completamente durante os 7 segundos do efeito.

---

## 🌀 Shrink (Fechamento do Mapa)

Nos **últimos 60 segundos** de partida, o mapa começa a fechar progressivamente a cada **7 segundos**. As bordas externas do mapa são convertidas em **zonas de shrink** (células vermelhas pulsantes), que causam dano instantâneo a qualquer jogador que pise nelas.

A cada ciclo de shrink, uma camada adicional de bordas é fechada, forçando os jogadores para o centro do mapa. Bombas que estiverem em células de shrink são detonadas imediatamente. Um aviso visual de borda vermelha pulsante aparece na tela quando o shrink está ativo.

---

## 🔄 Fluxo Completo de uma Partida

```
1. LOBBY
   ├── Host cria sala → recebe código de 4 letras
   ├── Guest digita o código e entra
   └── Host clica "INICIAR JOGO"

2. INÍCIO
   ├── Engine inicializa com seed aleatória (baseada em timestamp)
   ├── Mapa gerado proceduralmente
   ├── Jogadores posicionados nos cantos com 3s de invencibilidade
   └── Timer começa: 3:00

3. DURANTE A PARTIDA (loop de 50ms)
   ├── Host executa engine.tick(dt) a cada 50ms
   ├── Estado serializado (snap) e enviado ao guest via WebSocket
   ├── Guest envia inputs de teclado ao servidor → relay ao host
   ├── Host aplica inputs no engine no próximo tick
   │
   ├── Aos 50s → Rhydon aparece
   ├── Aos 2:00 → Shrink começa (a cada 7s fecha uma camada)
   └── Timer decrescente visível na sidebar

4. FIM DE PARTIDA
   ├── Condição: timer zerou (empate) OU apenas 1 jogador restante (vitória)
   ├── Tela de game over exibe vencedor e vidas restantes
   ├── Resultado salvo no banco de dados SQLite (servidor)
   └── Ambos os jogadores podem votar em "JOGAR DE NOVO"

5. RESTART (se ambos votarem)
   ├── Novo mapa gerado (seed derivada da anterior)
   ├── Jogadores voltam aos cantos com 3 vidas
   └── Mesmo cast de personagens, nova partida
```

---

## 🧮 Resumo dos Valores Numéricos

| Parâmetro | Valor |
|---|---|
| Duração da partida | 3 minutos (180s) |
| Vidas iniciais | 3 |
| Tempo de respawn | 2,5 segundos |
| Invencibilidade pós-respawn | 3 segundos |
| Delay de movimento (padrão) | 190ms |
| Delay de movimento (mínimo) | 65ms |
| Timer de bomba (padrão) | 3 segundos |
| Timer de bomba (Skull) | 1,8 segundos |
| Duração das chamas | 360ms |
| Tamanho de explosão (padrão) | 3 células |
| Bombas simultâneas (padrão) | 1 |
| Rhydon — surge após | 50 segundos |
| Rhydon — ressurge após | 65 segundos |
| Rhydon — HP | 4 |
| Rhydon — alcance de chase | 3 tiles |
| Shrink — começa quando restam | 60 segundos |
| Shrink — intervalo entre camadas | 7 segundos |
| Thunder Wave — alcance | 7 células por direção |
| Thunder Wave — cooldown | 1,5 segundos |
