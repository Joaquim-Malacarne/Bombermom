// ═══════════════════════════════════════════════════════════
//  engine.js  —  BomberMon Game Engine v3
//  Pure game logic. No DOM, no canvas, no PeerJS.
//  Host instantiates GameEngine; guest receives snap() diffs.
// ═══════════════════════════════════════════════════════════

'use strict';

// ── Public constants (shared with renderer) ──────────────────
const ENG = Object.freeze({
  GRID: 64, ROWS: 13, COLS: 15,
  MATCH_TIME:   180_000,
  SHRINK_START:  60_000,
  SHRINK_EVERY:   7_000,
  RESPAWN_MS:     2_500,
  INV_MS:         3_000,
  RHYDON_SPAWN:  50_000,
  RHYDON_RESPAWN:65_000,
  RHYDON_RANGE:      3,   // tiles — how close before it chases
  RHYDON_HP:         4,
});

const CT = Object.freeze({ WALL:'▉', SOFT:1, BOMB:2, PU:3, SHRINK:4 });

const PU = Object.freeze({
  BK:'bk', BU:'bu', FU:'fu', SU:'su', RM:'rm',
  IV:'iv', PG:'pg', SK:'sk', TW:'tw', EC:'ec',
  DD:'dd', MS:'ms', ME:'me', SB:'sb',
});

const PU_NAMES = Object.freeze({
  [PU.BK]:'BOMB KICK',   [PU.BU]:'BOMB UP',     [PU.FU]:'FLAME UP',
  [PU.SU]:'SPEED UP',    [PU.RM]:'REMOTE CTRL',  [PU.IV]:'INVINCIB.',
  [PU.PG]:'PWR GLOVES',  [PU.SK]:'SKULL BOMB',   [PU.TW]:'THUNDER',
  [PU.EC]:'EVASION',     [PU.DD]:'DRAG DANCE',   [PU.MS]:'M.SHIELD',
  [PU.ME]:'MEGA EVOL.',  [PU.SB]:'SITRUS ♥',
});

const PU_WEIGHTS = [
  [PU.BU,14],[PU.FU,14],[PU.SU,12],[PU.BK,9],
  [PU.RM,8],[PU.SB,8],[PU.IV,6],[PU.PG,6],
  [PU.SK,5],[PU.TW,4],[PU.EC,4],[PU.DD,3],[PU.MS,3],[PU.ME,2],
];

const SPAWNS  = Object.freeze([{r:1,c:1},{r:1,c:13},{r:11,c:1},{r:11,c:13}]);
const COLORS  = Object.freeze(['#F8D000','#F07030','#4090D8','#60A860']);

const TEMPLATE = [
  ['▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉'],
  ['▉','x','x', , , , , , , , , ,'x','x','▉'],
  ['▉','x','▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉','x','▉'],
  ['▉','x', , , , , , , , , , , ,'x','▉'],
  ['▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉'],
  ['▉', , , , , , , , , , , , , ,'▉'],
  ['▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉'],
  ['▉', , , , , , , , , , , , , ,'▉'],
  ['▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉'],
  ['▉','x', , , , , , , , , , , ,'x','▉'],
  ['▉','x','▉', ,'▉', ,'▉', ,'▉', ,'▉', ,'▉','x','▉'],
  ['▉','x','x', , , , , , , , , ,'x','x','▉'],
  ['▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉','▉'],
];

// ── Seeded PRNG (xorshift32) ─────────────────────────────────
class RNG {
  constructor(seed) { this.s = ((seed ^ 0xdeadbeef) >>> 0) || 1; }
  next() {
    let s = this.s;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.s = s >>> 0;
    return this.s / 4294967296;
  }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr)  { return arr[this.int(0, arr.length - 1)]; }
  wpick(pairs) {
    const t = pairs.reduce((s,[,w]) => s+w, 0);
    let r = this.next() * t;
    for (const [v,w] of pairs) { r-=w; if(r<=0) return v; }
    return pairs[0][0];
  }
}

// ── GameEngine ───────────────────────────────────────────────
class GameEngine {
  constructor() {
    this.phase   = 'lobby';
    this._bc     = 0;          // entity id counter
    this._votes  = new Set();  // restart votes
    this.players = [];
    this.bombs   = [];
    this.explosions = [];
    this.powerups   = [];
    this.rhydon     = null;
    this.timer      = 0;
    this.shrinkLevel = 0;
    this.shrinkTimer = 0;
    this._rhydonT    = 0;
    this.winner      = undefined;
    this.cells       = [];
    this.seed        = 0;
  }

  // ── Public API ──────────────────────────────────────────────

  /** Start a fresh game with given player definitions */
  init(pdefs, seed) {
    this.seed  = seed;
    this.rng   = new RNG(seed);
    this.cells = this._genMap();
    this.bombs = []; this.explosions = []; this.powerups = [];
    this.timer = ENG.MATCH_TIME;
    this.shrinkTimer = 0; this.shrinkLevel = 0;
    this.rhydon = null; this._rhydonT = ENG.RHYDON_SPAWN;
    this.phase  = 'playing'; this.winner = undefined;
    this._votes.clear();
    this.players = pdefs.map((pd,i) => this._mkPlayer(pd, i));
  }

  /** Restart same players, new map */
  restart() {
    const defs = this.players.map(p => ({id:p.id, name:p.name}));
    this.init(defs, (this.seed * 1664525 + 1013904223) & 0xffffffff);
  }

  /** Vote to restart; returns 'restarted'|'voted' */
  voteRestart(pid) {
    this._votes.add(pid);
    if (this._votes.size >= this.players.length) { this.restart(); return 'restarted'; }
    return 'voted';
  }

  /** Advance simulation by dt ms */
  tick(dt) {
    if (this.phase !== 'playing') return;

    // Timer
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0; this._end(null); return; }

    // Shrink
    if (this.timer <= ENG.SHRINK_START) {
      this.shrinkTimer += dt;
      while (this.shrinkTimer >= ENG.SHRINK_EVERY) { this.shrinkTimer -= ENG.SHRINK_EVERY; this._shrink(); }
    }

    // Rhydon spawn / update
    if (!this.rhydon) { this._rhydonT -= dt; if (this._rhydonT <= 0) this._spawnRhydon(); }
    else this._tickRhydon(dt);

    // Bombs
    for (const b of this.bombs) {
      if (!b.alive) continue;
      if (b.vel) {
        b.velT -= dt;
        if (b.velT <= 0) {
          b.velT = 130;
          const nr=b.r+b.vel.r, nc=b.c+b.vel.c;
          const blocked = nr<0||nr>=ENG.ROWS||nc<0||nc>=ENG.COLS || !!this.cells[nr][nc];
          if (blocked) b.vel = null;
          else { this.cells[b.r][b.c]=null; b.r=nr; b.c=nc; this.cells[nr][nc]=CT.BOMB; }
        }
      }
      if (!b.remote) { b.timer-=dt; if(b.timer<=0) this._blow(b.id); }
    }

    // Explosions
    for (const e of this.explosions) { if(!e.alive)continue; e.timer-=dt; if(e.timer<=0)e.alive=false; }

    // Explosion → player hit
    for (const e of this.explosions) {
      if (!e.alive) continue;
      for (const p of this.players) {
        if (!p.alive||p.isIV||p.invT>0) continue;
        if (p.r===e.r && p.c===e.c) this._hitPlayer(p, e);
      }
    }

    // Rhydon → player
    if (this.rhydon) {
      for (const p of this.players) {
        if (!p.alive||p.isIV||p.invT>0) continue;
        if (p.r===this.rhydon.r && p.c===this.rhydon.c) this._hitPlayer(p, null);
      }
    }

    // Player timers
    for (const p of this.players) {
      if(p.invT>0){ p.invT-=dt; if(p.invT<0)p.invT=0; }
      if(p.isIV)  { p.ivT-=dt; if(p.ivT<=0){p.isIV=false;p.ivT=0;} }
      if(p.isCloaked){ p.cloakT-=dt; if(p.cloakT<=0){p.isCloaked=false;p.cloakT=0;} }
      if(p.isDD){ p.ddT-=dt; if(p.ddT<=0){p.isDD=false;p.ddT=0;} }
      if(p.hasMS){ p.msT-=dt; if(p.msT<=0){p.hasMS=false;p.msT=0;} }
      if(p.isME){ p.meT-=dt; if(p.meT<=0){
        p.isME=false; p.meT=0;
        p.numBombs=Math.max(1,p.numBombs-2);
        p.bombSize=Math.max(3,p.bombSize-2);
      }}
      if(p.thunderCD>0) p.thunderCD-=dt;
      if(!p.alive&&p.lives>0&&p.respawnT>0){ p.respawnT-=dt; if(p.respawnT<=0)this._respawn(p); }
    }

    // Win check
    const can = this.players.filter(p=>p.alive||(p.lives>0&&p.respawnT>0));
    if (can.length<=1) this._end(can[0]?.id??null);

    // Cleanup
    this.bombs      = this.bombs.filter(b=>b.alive);
    this.explosions = this.explosions.filter(e=>e.alive);
  }

  /** Handle player input */
  input(pid, inp) {
    if (inp.t==='RESTART') return this.voteRestart(pid);

    const p = this.players.find(x=>x.id===pid);
    if (!p||!p.alive) return;
    const now = performance.now();

    if (inp.t==='M') {
      const delay = p.isDD ? Math.max(65, p.moveDelay*0.52) : p.moveDelay;
      if (now-p.lastMove < delay) return;
      const DV = {U:{r:-1,c:0},D:{r:1,c:0},L:{r:0,c:-1},R:{r:0,c:1}};
      const dv = DV[inp.d]; if(!dv) return;
      const nr=p.r+dv.r, nc=p.c+dv.c;
      p.facing = {U:'up',D:'down',L:'left',R:'right'}[inp.d];
      if(nr<0||nr>=ENG.ROWS||nc<0||nc>=ENG.COLS) return;

      const cell = this.cells[nr][nc];

      if (cell===CT.BOMB && p.hasBK) {
        // Kick — push bomb in movement direction
        const bm = this.bombs.find(b=>b.alive&&!b.vel&&b.r===nr&&b.c===nc);
        if (bm) { bm.vel={r:dv.r,c:dv.c}; bm.velT=0; }
        p.lastMove=now;
      } else if (!cell||cell===CT.PU) {
        p.r=nr; p.c=nc; p.lastMove=now;
        if (cell===CT.PU) {
          const pu=this.powerups.find(x=>x.r===nr&&x.c===nc);
          if(pu){ this._applyPU(p,pu.type); this.powerups=this.powerups.filter(x=>x!==pu); this.cells[nr][nc]=null; }
        }
      }

    } else if (inp.t==='B') {
      if (this.cells[p.r][p.c]===CT.BOMB) return;
      if (this.bombs.filter(b=>b.alive&&b.ownerId===pid).length >= p.numBombs) return;

      const size = p.isME ? p.bombSize+2 : p.hasSK ? p.bombSize+1 : p.bombSize;
      const bomb = {
        id:`b${this._bc++}`, r:p.r, c:p.c,
        size, ownerId:pid, timer:p.hasSK?1800:3000,
        alive:true, remote:p.hasRM,
        vel:null, velT:0,
        type: p.isME?'mega': p.hasSK?'skull':'normal',
      };
      if (p.hasPG) { bomb.vel=this._fvec(p.facing); bomb.velT=0; } // Power Gloves: throw forward
      this.bombs.push(bomb);
      this.cells[p.r][p.c]=CT.BOMB;

    } else if (inp.t==='DETONATE') {
      if (!p.hasRM) return;
      // Detonate all remote bombs owned by this player
      this.bombs.filter(b=>b.alive&&b.remote&&b.ownerId===pid).forEach(b=>this._blow(b.id));

    } else if (inp.t==='THUNDER') {
      if (!p.hasTW||p.thunderCD>0) return;
      p.hasTW=Math.max(0,p.hasTW-1);
      p.thunderCD = p.hasTW>0 ? 1500 : 0;
      this._thunderWave(p.r, p.c);
    }
  }

  /** Serialize game state for network broadcast */
  snap() {
    return {
      type:'STATE',
      cells: this.cells.map(row=>row?[...row]:[]),
      players: this.players.map(p=>({
        id:p.id, name:p.name, color:p.color, si:p.si,
        r:p.r, c:p.c, lives:p.lives, alive:p.alive,
        invT:p.invT, isIV:p.isIV, isCloaked:p.isCloaked,
        isDD:p.isDD, isME:p.isME, hasMS:p.hasMS,
        hasRM:p.hasRM, hasBK:p.hasBK, hasPG:p.hasPG,
        hasSK:p.hasSK, hasTW:p.hasTW,
        numBombs:p.numBombs, bombSize:p.bombSize,
        facing:p.facing, respawnT:p.respawnT,
      })),
      bombs: this.bombs.filter(b=>b.alive).map(b=>({
        id:b.id, r:b.r, c:b.c, timer:b.timer, remote:b.remote, type:b.type
      })),
      explosions: this.explosions.filter(e=>e.alive).map(e=>({
        id:e.id, r:e.r, c:e.c, dir:e.dir, center:e.center, kind:e.kind
      })),
      powerups: this.powerups.map(pu=>({id:pu.id,r:pu.r,c:pu.c,type:pu.type})),
      rhydon: this.rhydon ? {
        r:this.rhydon.r, c:this.rhydon.c,
        hp:this.rhydon.hp, maxHp:this.rhydon.maxHp,
        facing:this.rhydon.facing, frame:this.rhydon.frame,
        state:this.rhydon.state,
      } : null,
      timer: this.timer,
      shrinkLevel: this.shrinkLevel,
      phase: this.phase,
      winner: this.winner,
      votes: this._votes.size,
    };
  }

  // ── Private helpers ─────────────────────────────────────────

  _mkPlayer(pd, i) {
    return {
      id:pd.id, name:pd.name, color:COLORS[i%4], si:i%4,
      r:SPAWNS[i%4].r, c:SPAWNS[i%4].c,
      lives:3, alive:true, respawnT:0, invT:ENG.INV_MS,
      numBombs:1, bombSize:3, moveDelay:190, facing:'down', lastMove:0,
      hasBK:false, hasRM:false, hasPG:false, hasSK:false, hasTW:0,
      isIV:false, ivT:0, isCloaked:false, cloakT:0,
      isDD:false, ddT:0, hasMS:false, msT:0, isME:false, meT:0,
      thunderCD:0,
    };
  }

  _genMap() {
    const cells=[];
    for(let r=0;r<ENG.ROWS;r++){
      cells[r]=[];
      for(let c=0;c<ENG.COLS;c++){
        const t=TEMPLATE[r][c];
        if(t==='▉') cells[r][c]=CT.WALL;
        else if(!t&&this.rng.next()<0.76) cells[r][c]=CT.SOFT;
        else cells[r][c]=null;
      }
    }
    // Guaranteed clear spawn areas (2-tile safe zone per spawn)
    SPAWNS.forEach(({r,c})=>{
      [[-2,0],[-1,0],[0,0],[1,0],[2,0],[0,-2],[0,-1],[0,1],[0,2],[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc])=>{
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ENG.ROWS&&nc>=0&&nc<ENG.COLS&&cells[nr][nc]!==CT.WALL) cells[nr][nc]=null;
      });
    });
    return cells;
  }

  _fvec(facing) {
    return {up:{r:-1,c:0},down:{r:1,c:0},left:{r:0,c:-1},right:{r:0,c:1}}[facing]||{r:-1,c:0};
  }

  _blow(id) {
    const b=this.bombs.find(x=>x.id===id); if(!b||!b.alive) return;
    b.alive=false;
    if(this.cells[b.r]&&this.cells[b.r][b.c]===CT.BOMB) this.cells[b.r][b.c]=null;

    // Center tile
    this.explosions.push({id:`e${this._bc++}`,r:b.r,c:b.c,dir:{r:0,c:0},center:true,timer:360,alive:true,kind:b.type});

    const dirs=[{r:-1,c:0},{r:1,c:0},{r:0,c:-1},{r:0,c:1}];
    dirs.forEach(dir=>{
      for(let i=1;i<b.size;i++){
        const r=b.r+dir.r*i, c=b.c+dir.c*i;
        if(r<0||r>=ENG.ROWS||c<0||c>=ENG.COLS) break;
        const cell=this.cells[r][c];
        if(cell===CT.WALL||cell===CT.SHRINK) break;

        this.explosions.push({id:`e${this._bc++}`,r,c,dir,center:false,end:i===b.size-1,timer:360,alive:true,kind:b.type});

        if(cell===CT.SOFT){ this.cells[r][c]=null; this._tryPU(r,c,0.40); break; }
        if(cell===CT.BOMB){ const cb=this.bombs.find(x=>x.alive&&x.r===r&&x.c===c); if(cb)this._blow(cb.id); break; }
        if(cell===CT.PU){ this.powerups=this.powerups.filter(x=>!(x.r===r&&x.c===c)); this.cells[r][c]=null; }
        if(cell) break;
      }
    });
  }

  _thunderWave(pr,pc) {
    this.explosions.push({id:`t${this._bc++}`,r:pr,c:pc,dir:{r:0,c:0},center:true,timer:500,alive:true,kind:'thunder'});
    const dirs=[{r:-1,c:0},{r:1,c:0},{r:0,c:-1},{r:0,c:1}];
    dirs.forEach(dir=>{
      for(let i=1;i<=7;i++){
        const r=pr+dir.r*i, c=pc+dir.c*i;
        if(r<0||r>=ENG.ROWS||c<0||c>=ENG.COLS) break;
        const cell=this.cells[r][c];
        if(cell===CT.WALL||cell===CT.SHRINK) break;
        this.explosions.push({id:`t${this._bc++}`,r,c,dir,center:false,timer:500,alive:true,kind:'thunder'});
        if(cell===CT.SOFT){ this.cells[r][c]=null; this._tryPU(r,c,0.65); break; }
        if(cell===CT.BOMB){ const cb=this.bombs.find(x=>x.alive&&x.r===r&&x.c===c); if(cb)this._blow(cb.id); break; }
        if(cell===CT.PU){ this.powerups=this.powerups.filter(x=>!(x.r===r&&x.c===c)); this.cells[r][c]=null; }
        if(cell) break;
      }
    });
  }

  _hitPlayer(p, src) {
    if (p.hasMS) {
      p.hasMS=false; p.msT=0;
      // Small reflected explosion around the shielded player
      [[0,0],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
        const nr=p.r+dr,nc=p.c+dc;
        if(nr>=0&&nr<ENG.ROWS&&nc>=0&&nc<ENG.COLS&&this.cells[nr][nc]!==CT.WALL)
          this.explosions.push({id:`ms${this._bc++}`,r:nr,c:nc,dir:{r:dr,c:dc},center:!dr&&!dc,timer:240,alive:true,kind:'shield'});
      });
    } else {
      this._dmg(p);
    }
  }

  _dmg(p) {
    p.lives--;
    p.alive=false;
    // Strip active buffs on death
    if(p.isME){ p.numBombs=Math.max(1,p.numBombs-2); p.bombSize=Math.max(3,p.bombSize-2); }
    p.isME=false; p.isDD=false; p.isCloaked=false; p.hasMS=false; p.isIV=false;
    if(p.lives>0) p.respawnT=ENG.RESPAWN_MS;
  }

  _respawn(p) {
    const sp=SPAWNS[this.players.indexOf(p)%4];
    let r=sp.r, c=sp.c;
    if(this.cells[r]&&this.cells[r][c]){
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-2,0],[2,0],[0,-2],[0,2]]){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<ENG.ROWS&&nc>=0&&nc<ENG.COLS&&!this.cells[nr][nc]){r=nr;c=nc;break;}
      }
    }
    p.r=r; p.c=c; p.alive=true; p.invT=ENG.INV_MS; p.respawnT=0;
  }

  _shrink() {
    this.shrinkLevel++;
    const sl=this.shrinkLevel; if(sl>6) return;
    for(let r=sl;r<ENG.ROWS-sl;r++){this._shrinkCell(r,sl);this._shrinkCell(r,ENG.COLS-1-sl);}
    for(let c=sl+1;c<ENG.COLS-sl-1;c++){this._shrinkCell(sl,c);this._shrinkCell(ENG.ROWS-1-sl,c);}
  }

  _shrinkCell(r,c) {
    if(!this.cells[r]||this.cells[r][c]===CT.WALL||this.cells[r][c]===CT.SHRINK) return;
    this.players.forEach(p=>{
      if(p.alive&&p.r===r&&p.c===c&&!p.isIV&&p.invT<=0) this._hitPlayer(p,null);
    });
    this.bombs.filter(b=>b.alive&&b.r===r&&b.c===c).forEach(b=>this._blow(b.id));
    this.powerups=this.powerups.filter(x=>!(x.r===r&&x.c===c));
    this.cells[r][c]=CT.SHRINK;
  }

  _tryPU(r,c,chance) {
    if(this.rng.next()<chance){
      const type=this.rng.wpick(PU_WEIGHTS);
      this.powerups.push({id:`pu${this._bc++}`,r,c,type});
      this.cells[r][c]=CT.PU;
    }
  }

  _applyPU(p,type) {
    switch(type){
      case PU.BU: p.numBombs=Math.min(p.numBombs+1,8); break;
      case PU.FU: p.bombSize=Math.min(p.bombSize+1,10); break;
      case PU.SU: p.moveDelay=Math.max(65,p.moveDelay-25); break;
      case PU.BK: p.hasBK=true; break;
      case PU.RM: p.hasRM=true; break;
      case PU.IV: p.isIV=true; p.ivT=8000; break;
      case PU.PG: p.hasPG=true; break;
      case PU.SK: p.hasSK=true; break;
      case PU.TW: p.hasTW=Math.min((p.hasTW||0)+1,3); p.thunderCD=0; break;
      case PU.EC: p.isCloaked=true; p.cloakT=7000; break;
      case PU.DD: p.isDD=true; p.ddT=8000; break;
      case PU.MS: p.hasMS=true; p.msT=15000; break;
      case PU.ME: p.isME=true; p.meT=15000; p.numBombs=Math.min(p.numBombs+2,10); p.bombSize=Math.min(p.bombSize+2,12); break;
      case PU.SB: p.lives=Math.min(p.lives+1,5); break;
    }
  }

  _spawnRhydon() {
    const cands=[];
    for(let r=3;r<10;r++) for(let c=4;c<11;c++) if(!this.cells[r][c]) cands.push({r,c});
    if(!cands.length) return;
    const pos=this.rng.pick(cands);
    this.rhydon={
      r:pos.r,c:pos.c,
      hp:ENG.RHYDON_HP,maxHp:ENG.RHYDON_HP,
      facing:'down', mT:0, mD:750,
      state:'wander', frame:0, fT:0,
      _lastE:null,
    };
  }

  _tickRhydon(dt) {
    const rh=this.rhydon;
    // Animation
    rh.fT+=dt; if(rh.fT>400){rh.frame^=1;rh.fT=0;}
    // Explosion damage
    for(const e of this.explosions){
      if(!e.alive||e.id===rh._lastE) continue;
      if(e.r===rh.r&&e.c===rh.c){rh._lastE=e.id; if(--rh.hp<=0){this._killRhydon();return;}}
    }
    // Find nearest visible player (cloaked = invisible to Rhydon)
    let nearest=null,ndist=Infinity;
    for(const p of this.players){
      if(!p.alive||p.isCloaked) continue;
      const d=Math.abs(p.r-rh.r)+Math.abs(p.c-rh.c);
      if(d<ndist){ndist=d;nearest=p;}
    }
    rh.state=(nearest&&ndist<=ENG.RHYDON_RANGE)?'chase':'wander';
    rh.mD=rh.state==='chase'?520:750;
    rh.mT+=dt; if(rh.mT<rh.mD) return; rh.mT=0;

    const dirs=[{r:-1,c:0},{r:1,c:0},{r:0,c:-1},{r:0,c:1}];
    let dir;
    if(rh.state==='chase'&&nearest){
      const dr=nearest.r-rh.r, dc=nearest.c-rh.c;
      const opts=[];
      if(Math.abs(dr)>=Math.abs(dc)&&dr) opts.push({r:Math.sign(dr),c:0});
      if(dc) opts.push({r:0,c:Math.sign(dc)});
      if(!opts.length&&dr) opts.push({r:Math.sign(dr),c:0});
      if(this.rng.next()>0.72&&opts.length>1) opts.reverse();
      dir=opts[0];
    } else {
      // Wander with inertia
      const fv=this._fvec(rh.facing);
      dir=this.rng.next()<0.6?fv:this.rng.pick(dirs);
    }
    if(!dir) return;
    const nr=rh.r+dir.r, nc=rh.c+dir.c;
    if(nr<0||nr>=ENG.ROWS||nc<0||nc>=ENG.COLS) return;
    const cell=this.cells[nr][nc];
    if(cell===CT.WALL||cell===CT.BOMB||cell===CT.SHRINK) return;
    if(cell===CT.SOFT){this.cells[nr][nc]=null;}
    if(cell===CT.PU){this.powerups=this.powerups.filter(x=>!(x.r===nr&&x.c===nc));this.cells[nr][nc]=null;}
    rh.facing=dir.r<0?'up':dir.r>0?'down':dir.c<0?'left':'right';
    rh.r=nr; rh.c=nc;
  }

  _killRhydon() {
    const {r,c}=this.rhydon;
    // Drop 3 guaranteed powerups
    [[0,0],[-1,0],[0,1],[1,0],[0,-1]].forEach(([dr,dc])=>{
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<ENG.ROWS&&nc>=0&&nc<ENG.COLS&&!this.cells[nr][nc]){
        const t=this.rng.wpick(PU_WEIGHTS);
        this.powerups.push({id:`pu${this._bc++}`,r:nr,c:nc,type:t});
        this.cells[nr][nc]=CT.PU;
      }
    });
    this.rhydon=null;
    this._rhydonT=ENG.RHYDON_RESPAWN;
  }

  _end(wid) { this.phase='gameover'; this.winner=wid; }
}
