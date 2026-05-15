"""
BomberMon - Servidor WebSocket Puro
Sem frameworks. Só socket, threading, hashlib, base64, struct, json, sqlite3.

Protocolo WebSocket implementado manualmente conforme RFC 6455.

Fluxo:
  Host  → CREATE          → servidor devolve CREATED {code}
  Guest → JOIN {code}     → servidor notifica host com GUEST_JOINED {name}
  Host  ↔ Guest           → servidor faz relay de qualquer outro tipo de msg
  Host  → GAME_OVER {...} → servidor persiste partida no banco de dados
"""

import socket
import threading
import hashlib
import base64
import struct
import json
import random
import string
import sys
import sqlite3
import time
from pathlib import Path

# ─────────────────────────────────────────────────────────────
#  Configuração
# ─────────────────────────────────────────────────────────────
HOST = "0.0.0.0"
PORT = 8765
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
DB_PATH  = Path("bombermon.db")

# rooms: { "ABCD": {"host": WSClient, "guest": WSClient|None, "started_at": float} }
rooms: dict = {}
rooms_lock = threading.Lock()


# ─────────────────────────────────────────────────────────────
#  Banco de dados (SQLite)
# ─────────────────────────────────────────────────────────────
def db_init():
    """Cria as tabelas se não existirem."""
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS matches (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            room_code   TEXT    NOT NULL,
            started_at  TEXT    NOT NULL,   -- ISO-8601
            duration_s  REAL    NOT NULL,   -- segundos
            winner_name TEXT                -- NULL = empate
        );

        CREATE TABLE IF NOT EXISTS match_players (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id    INTEGER NOT NULL REFERENCES matches(id),
            player_name TEXT    NOT NULL,
            lives_left  INTEGER NOT NULL,
            won         INTEGER NOT NULL    -- 0 ou 1 (booleano)
        );
    """)
    con.commit()
    con.close()
    print(f"[DB] Banco inicializado em {DB_PATH.resolve()}")


def db_save_match(room_code: str, started_at: float, duration_s: float,
                  winner_name: str | None, players: list[dict]):
    """
    Persiste uma partida encerrada.

    players: lista de dicts com chaves 'name', 'lives', 'won'
    """
    started_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(started_at))
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    try:
        cur.execute(
            "INSERT INTO matches (room_code, started_at, duration_s, winner_name) "
            "VALUES (?, ?, ?, ?)",
            (room_code, started_iso, round(duration_s, 2), winner_name)
        )
        match_id = cur.lastrowid
        cur.executemany(
            "INSERT INTO match_players (match_id, player_name, lives_left, won) "
            "VALUES (?, ?, ?, ?)",
            [(match_id, p["name"], p["lives"], 1 if p["won"] else 0) for p in players]
        )
        con.commit()
        print(f"[DB] Partida {room_code} salva (id={match_id}, "
              f"duração={duration_s:.1f}s, vencedor={winner_name!r})")
    except sqlite3.Error as e:
        print(f"[DB] Erro ao salvar partida: {e}")
        con.rollback()
    finally:
        con.close()


# ─────────────────────────────────────────────────────────────
#  WSClient — encapsula um socket com handshake e framing WS
# ─────────────────────────────────────────────────────────────
class WSClient:
    def __init__(self, sock: socket.socket, addr):
        self.sock = sock
        self.addr = addr
        self.room: str | None = None
        self.role: str | None = None   # 'host' | 'guest'
        self._lock = threading.Lock()  # serializa sends concorrentes

    # ── Handshake HTTP → WebSocket ────────────────────────────
    def handshake(self) -> bool:
        # Lê até encontrar o fim dos headers HTTP (\r\n\r\n).
        # Um único recv() não garante receber o request completo,
        # especialmente via ngrok que adiciona headers de forwarding.
        try:
            buf = b""
            while b"\r\n\r\n" not in buf:
                chunk = self.sock.recv(4096)
                if not chunk:
                    return False
                buf += chunk
                if len(buf) > 65536:  # proteção contra requests malformados
                    return False
            raw = buf.decode("utf-8", errors="ignore")
        except OSError:
            return False

        key = None
        for line in raw.split("\r\n"):
            if line.lower().startswith("sec-websocket-key:"):
                key = line.split(":", 1)[1].strip()
                break

        if not key:
            return False

        accept = base64.b64encode(
            hashlib.sha1((key + WS_MAGIC).encode()).digest()
        ).decode()

        resp = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n"
            "\r\n"
        )
        try:
            self.sock.sendall(resp.encode())
        except OSError:
            return False
        return True

    # ── Recebe um frame WebSocket ─────────────────────────────
    def recv_frame(self) -> str | None:
        """
        Lê exatamente um frame de texto do socket.
        Retorna o payload como str, ou None se conexão fechada/erro.
        """
        header = self._recv_exactly(2)
        if header is None:
            return None

        b0, b1 = header[0], header[1]
        opcode = b0 & 0x0F
        masked = bool(b1 & 0x80)
        length = b1 & 0x7F

        if opcode == 8:
            return None

        if length == 126:
            ext = self._recv_exactly(2)
            if ext is None:
                return None
            length = struct.unpack(">H", ext)[0]
        elif length == 127:
            ext = self._recv_exactly(8)
            if ext is None:
                return None
            length = struct.unpack(">Q", ext)[0]

        mask_key = self._recv_exactly(4) if masked else None

        raw_payload = self._recv_exactly(length)
        if raw_payload is None:
            return None

        payload = bytearray(raw_payload)
        if masked and mask_key:
            for i in range(len(payload)):
                payload[i] ^= mask_key[i % 4]

        if opcode == 1:
            return payload.decode("utf-8", errors="ignore")
        return None

    # ── Envia um frame de texto WebSocket ─────────────────────
    def send_text(self, text: str) -> bool:
        payload = text.encode("utf-8")
        n = len(payload)

        frame = bytearray()
        frame.append(0x81)

        if n < 126:
            frame.append(n)
        elif n < 65536:
            frame.append(126)
            frame += struct.pack(">H", n)
        else:
            frame.append(127)
            frame += struct.pack(">Q", n)

        frame += payload

        with self._lock:
            try:
                self.sock.sendall(bytes(frame))
                return True
            except OSError:
                return False

    def _recv_exactly(self, n: int) -> bytes | None:
        buf = bytearray()
        while len(buf) < n:
            try:
                chunk = self.sock.recv(n - len(buf))
            except OSError:
                return None
            if not chunk:
                return None
            buf += chunk
        return bytes(buf)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass

    def __repr__(self):
        return f"<WSClient {self.addr} role={self.role} room={self.room}>"


# ─────────────────────────────────────────────────────────────
#  Lógica de mensagens do BomberMon
# ─────────────────────────────────────────────────────────────
def _gen_code() -> str:
    return "".join(random.choices(string.ascii_uppercase, k=4))


def handle_client(ws: WSClient):
    print(f"[+] Conectado: {ws.addr}")

    if not ws.handshake():
        ws.close()
        print(f"[-] Handshake falhou: {ws.addr}")
        return

    try:
        while True:
            raw = ws.recv_frame()
            if raw is None:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            # ── Host cria sala ────────────────────────────────
            if msg_type == "CREATE":
                with rooms_lock:
                    code = _gen_code()
                    while code in rooms:
                        code = _gen_code()
                    rooms[code] = {"host": ws, "guest": None, "started_at": None}

                ws.role = "host"
                ws.room = code
                ws.send_text(json.dumps({"type": "CREATED", "code": code}))
                print(f"    Sala criada: {code} por {ws.addr}")

            # ── Guest entra na sala ───────────────────────────
            elif msg_type == "JOIN":
                code = msg.get("code", "").upper().strip()
                name = msg.get("name", "Guest")[:12]

                with rooms_lock:
                    room = rooms.get(code)
                    if not room:
                        ws.send_text(json.dumps({
                            "type": "ERROR",
                            "msg": "Sala não encontrada."
                        }))
                        continue
                    if room["guest"] is not None:
                        ws.send_text(json.dumps({
                            "type": "ERROR",
                            "msg": "Sala já está cheia."
                        }))
                        continue
                    room["guest"] = ws
                    host_ws: WSClient = room["host"]

                ws.role = "guest"
                ws.room = code

                ws.send_text(json.dumps({"type": "JOINED"}))
                host_ws.send_text(json.dumps({
                    "type": "GUEST_JOINED",
                    "name": name
                }))
                print(f"    Guest '{name}' entrou na sala {code}")

            # ── Host informa início de partida ────────────────
            elif msg_type == "MATCH_START":
                with rooms_lock:
                    room = rooms.get(ws.room)
                    if room and ws.role == "host":
                        room["started_at"] = time.time()
                        print(f"    Partida {ws.room} iniciada")

            # ── Host informa fim de partida → persiste no DB ──
            elif msg_type == "MATCH_OVER":
                # Esperado:
                # { type: "MATCH_OVER",
                #   winner: "NomeDoVencedor" | null,
                #   players: [ {name, lives, won}, ... ] }
                with rooms_lock:
                    room = rooms.get(ws.room)
                    started_at = room["started_at"] if room else None

                if ws.role == "host" and started_at is not None:
                    duration_s = time.time() - started_at
                    db_save_match(
                        room_code   = ws.room,
                        started_at  = started_at,
                        duration_s  = duration_s,
                        winner_name = msg.get("winner"),
                        players     = msg.get("players", []),
                    )
                    # Reseta o timer para a próxima partida (restart)
                    with rooms_lock:
                        if room:
                            room["started_at"] = None

            # ── Relay: qualquer outra msg vai pro outro jogador ─
            else:
                target: WSClient | None = None
                with rooms_lock:
                    room = rooms.get(ws.room)
                    if room:
                        target = room["guest"] if ws.role == "host" else room["host"]

                if target:
                    target.send_text(raw)

    except Exception as e:
        print(f"[!] Exceção em {ws.addr}: {e}")

    finally:
        _on_disconnect(ws)


def _on_disconnect(ws: WSClient):
    print(f"[-] Desconectado: {ws.addr} (sala={ws.room}, role={ws.role})")

    if not ws.room:
        ws.close()
        return

    with rooms_lock:
        room = rooms.get(ws.room)
        if not room:
            ws.close()
            return

        if ws.role == "host":
            other = room.get("guest")
            del rooms[ws.room]
        else:
            other = room.get("host")
            room["guest"] = None

    if other:
        other.send_text(json.dumps({"type": "DISCONNECT"}))

    ws.close()


# ─────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────
def main():
    db_init()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(16)
    print(f"[*] BomberMon WebSocket Server ouvindo em ws://{HOST}:{PORT}")
    print(f"[*] Aguardando conexões... (Ctrl+C para parar)\n")

    try:
        while True:
            sock, addr = srv.accept()
            ws = WSClient(sock, addr)
            t = threading.Thread(target=handle_client, args=(ws,), daemon=True)
            t.start()
    except KeyboardInterrupt:
        print("\n[*] Servidor encerrado.")
        srv.close()
        sys.exit(0)


if __name__ == "__main__":
    main()