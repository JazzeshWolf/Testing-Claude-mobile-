'use strict';

// =========================================================
// CONSTANTS
// =========================================================
const COLS = 10, ROWS = 20;

const TETROMINOES = {
  I: { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#00e5ff', glow: 'rgba(0,229,255,0.6)' },
  O: { shape: [[1,1],[1,1]],                              color: '#ffd740', glow: 'rgba(255,215,64,0.6)' },
  T: { shape: [[0,1,0],[1,1,1],[0,0,0]],                  color: '#aa44ff', glow: 'rgba(170,68,255,0.6)' },
  S: { shape: [[0,1,1],[1,1,0],[0,0,0]],                  color: '#00ff88', glow: 'rgba(0,255,136,0.6)' },
  Z: { shape: [[1,1,0],[0,1,1],[0,0,0]],                  color: '#ff2d78', glow: 'rgba(255,45,120,0.6)' },
  J: { shape: [[1,0,0],[1,1,1],[0,0,0]],                  color: '#448aff', glow: 'rgba(68,138,255,0.6)' },
  L: { shape: [[0,0,1],[1,1,1],[0,0,0]],                  color: '#ff9800', glow: 'rgba(255,152,0,0.6)' },
};
const PIECE_KEYS = Object.keys(TETROMINOES);

const LINE_SCORES = [0, 100, 300, 500, 800];

const DIFFICULTIES = {
  easy:   { speed: 1000, mult: 1,   speedInc: 50,  label: 'EASY',   color: '#00ff88' },
  normal: { speed: 700,  mult: 1.5, speedInc: 65,  label: 'NORMAL', color: '#00e5ff' },
  hard:   { speed: 380,  mult: 2,   speedInc: 30,  label: 'HARD',   color: '#aa44ff' },
  insane: { speed: 180,  mult: 3,   speedInc: 15,  label: 'INSANE', color: '#ff2d78' },
};

// =========================================================
// SOUND ENGINE
// =========================================================
class SoundEngine {
  constructor() {
    this.enabled = true;
    this._ctx = null;
  }
  _getCtx() {
    if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }
  _play(type, freqStart, freqEnd, duration, gainVal = 0.18) {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration / 1000);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration / 1000);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration / 1000 + 0.01);
    } catch (_) {}
  }
  _tone(type, freq, duration, gainVal = 0.15, delay = 0) {
    if (!this.enabled) return;
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = type; osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(gainVal, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration / 1000);
      osc.start(t); osc.stop(t + duration / 1000 + 0.01);
    } catch (_) {}
  }
  rotate()          { this._play('sine',    440, 660, 80, 0.12); }
  move()            { this._play('sine',    320, 340, 40, 0.06); }
  lock()            { this._play('square',  180, 80,  120, 0.14); }
  hardDrop()        { this._play('sawtooth',120, 40,  100, 0.22); }
  uiClick()         { this._play('sine',    600, 500, 60,  0.1); }
  lineClear(count) {
    const notes = [440, 550, 660, 770];
    for (let i = 0; i < count; i++) this._tone('sine', notes[i] || 880, 180, 0.18, i * 0.08);
  }
  levelUp() {
    [330, 440, 550, 660, 880].forEach((f, i) => this._tone('sine', f, 140, 0.2, i * 0.09));
  }
  gameOver() {
    [440, 370, 330, 220].forEach((f, i) => this._tone('square', f, 200, 0.15, i * 0.18));
  }
  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// =========================================================
// HAPTIC ENGINE
// =========================================================
class HapticEngine {
  _vibe(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }
  light()   { this._vibe(10); }
  medium()  { this._vibe(25); }
  heavy()   { this._vibe([30, 10, 30]); }
  success() { this._vibe([10, 20, 10, 20, 40]); }
}

// =========================================================
// FX ENGINE
// =========================================================
class FXEngine {
  constructor(layer, canvas) {
    this._layer  = layer;
    this._canvas = canvas;
  }
  scorePopup(x, y, text, color) {
    const el = document.createElement('div');
    el.className = 'score-popup';
    el.textContent = text;
    el.style.left  = x + 'px';
    el.style.top   = y + 'px';
    el.style.color = color;
    this._layer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }
  lineClearFlash(rows, cellH) {
    rows.forEach(row => {
      const el = document.createElement('div');
      el.className = 'line-flash';
      el.style.top    = (row * cellH) + 'px';
      el.style.height = cellH + 'px';
      this._layer.appendChild(el);
      el.addEventListener('animationend', () => el.remove(), { once: true });
    });
  }
  screenShake() {
    const el = this._canvas.parentElement;
    el.classList.remove('shaking');
    void el.offsetWidth;
    el.classList.add('shaking');
    el.addEventListener('animationend', () => el.classList.remove('shaking'), { once: true });
  }
  levelUpPulse() {
    const el = this._canvas.parentElement;
    el.classList.remove('level-up-anim');
    void el.offsetWidth;
    el.classList.add('level-up-anim');
    el.addEventListener('animationend', () => el.classList.remove('level-up-anim'), { once: true });
  }
  comboFlash() {
    const el = document.getElementById('combo-count');
    if (!el) return;
    el.classList.remove('combo-anim');
    void el.offsetWidth;
    el.classList.add('combo-anim');
    el.addEventListener('animationend', () => el.classList.remove('combo-anim'), { once: true });
  }
}

// =========================================================
// RENDERER
// =========================================================
class Renderer {
  constructor(canvas, cell) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.cell   = cell;
  }
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  drawGrid() {
    const { ctx, cell } = this;
    ctx.strokeStyle = 'rgba(100,120,255,0.035)';
    ctx.lineWidth   = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, ROWS * cell); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(COLS * cell, y * cell); ctx.stroke();
    }
  }
  drawBlock(x, y, color, glow, alpha = 1) {
    const { ctx, cell } = this;
    const px = x * cell, py = y * cell;
    const s  = cell - 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 8; }
    ctx.fillStyle = color;
    ctx.fillRect(px + 0.5, py + 0.5, s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(px + 1, py + 1, s - 2, Math.floor(s * 0.28));
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(px + 1, py + 1, Math.floor(s * 0.18), s - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(px + 1, py + s - Math.floor(s * 0.22), s - 2, Math.floor(s * 0.22));
    ctx.restore();
  }
  drawGhost(x, y, color) {
    const { ctx, cell } = this;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle   = color;
    ctx.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    ctx.restore();
  }
  drawBoard(board) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell) this.drawBlock(c, r, cell.color, cell.glow);
      }
    }
  }
  drawPiece(piece, ghostY) {
    piece.shape.forEach((row, dr) => {
      row.forEach((v, dc) => {
        if (!v) return;
        this.drawGhost(piece.x + dc, ghostY + dr, piece.color);
      });
    });
    piece.shape.forEach((row, dr) => {
      row.forEach((v, dc) => {
        if (!v) return;
        this.drawBlock(piece.x + dc, piece.y + dr, piece.color, piece.glow);
      });
    });
  }
  drawPreview(canvas, piece) {
    if (!piece) return;
    const ctx  = canvas.getContext('2d');
    const cell = Math.floor(Math.min(canvas.width / 4, canvas.height / 4));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!piece) return;
    const shape = piece.shape;
    const rows  = shape.length, cols = shape[0].length;
    const ox    = Math.floor((canvas.width  - cols * cell) / 2);
    const oy    = Math.floor((canvas.height - rows * cell) / 2);
    shape.forEach((row, r) => {
      row.forEach((v, c) => {
        if (!v) return;
        const px = ox + c * cell, py = oy + r * cell, s = cell - 1;
        ctx.save();
        ctx.shadowColor = piece.glow; ctx.shadowBlur = 6;
        ctx.fillStyle   = piece.color;
        ctx.fillRect(px, py, s, s);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(px, py, s, Math.floor(s * 0.28));
        ctx.restore();
      });
    });
  }
}

// =========================================================
// INPUT MANAGER
// =========================================================
class InputManager {
  constructor(canvas, handlers) {
    this._h      = handlers;
    this._cell   = 0;
    this._tx = 0; this._ty = 0; this._tt = 0;
    this._fingers = 0;
    this._lpTimer = null;
    this._lpActive = false;
    this._bound = {};

    this._bound.kd = this._onKeyDown.bind(this);
    this._bound.ts = this._onTouchStart.bind(this);
    this._bound.tm = this._onTouchMove.bind(this);
    this._bound.te = this._onTouchEnd.bind(this);

    document.addEventListener('keydown', this._bound.kd);
    canvas.addEventListener('touchstart', this._bound.ts, { passive: false });
    canvas.addEventListener('touchmove',  this._bound.tm, { passive: false });
    canvas.addEventListener('touchend',   this._bound.te, { passive: false });
    canvas.addEventListener('touchcancel',this._bound.te, { passive: false });

    this._canvas = canvas;
  }
  setCell(cell) { this._cell = cell; }
  destroy() {
    document.removeEventListener('keydown', this._bound.kd);
    this._canvas.removeEventListener('touchstart', this._bound.ts);
    this._canvas.removeEventListener('touchmove',  this._bound.tm);
    this._canvas.removeEventListener('touchend',   this._bound.te);
    this._canvas.removeEventListener('touchcancel',this._bound.te);
    if (this._lpTimer) clearTimeout(this._lpTimer);
  }
  _onKeyDown(e) {
    const h = this._h;
    switch (e.code) {
      case 'ArrowLeft':  e.preventDefault(); h.moveLeft();      break;
      case 'ArrowRight': e.preventDefault(); h.moveRight();     break;
      case 'ArrowDown':  e.preventDefault(); h.softDrop();      break;
      case 'ArrowUp':    e.preventDefault(); h.rotate(1);       break;
      case 'Space':      e.preventDefault(); h.hardDrop();      break;
      case 'Enter':      e.preventDefault(); h.hardDrop();      break;
      case 'KeyZ':       e.preventDefault(); h.rotate(-1);      break;
      case 'KeyX':       e.preventDefault(); h.rotate(1);       break;
      case 'KeyC':       e.preventDefault(); h.hold();          break;
      case 'KeyP':       e.preventDefault(); h.pause();         break;
      case 'Escape':     e.preventDefault(); h.pause();         break;
    }
  }
  _onTouchStart(e) {
    e.preventDefault();
    this._fingers = e.touches.length;
    const t = e.touches[0];
    this._tx = t.clientX; this._ty = t.clientY;
    this._tt = Date.now();
    this._lpActive = false;
    if (this._lpTimer) clearTimeout(this._lpTimer);
    this._lpTimer = setTimeout(() => {
      this._lpActive = true;
      this._h.longPressStart && this._h.longPressStart();
    }, 350);
  }
  _onTouchMove(e) {
    e.preventDefault();
    if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
  }
  _onTouchEnd(e) {
    e.preventDefault();
    if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
    if (this._lpActive) {
      this._lpActive = false;
      this._h.longPressEnd && this._h.longPressEnd();
      return;
    }
    const dt  = Date.now() - this._tt;
    const dx  = (e.changedTouches[0]?.clientX ?? this._tx) - this._tx;
    const dy  = (e.changedTouches[0]?.clientY ?? this._ty) - this._ty;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const threshold = this._cell * 0.8;
    if (dt < 250 && adx < threshold && ady < threshold) {
      this._h.rotate(this._fingers >= 2 ? -1 : 1);
      return;
    }
    if (adx > ady) {
      const steps = Math.round(adx / (this._cell || 24));
      for (let i = 0; i < Math.max(1, steps); i++) {
        dx < 0 ? this._h.moveLeft() : this._h.moveRight();
      }
    } else if (ady > threshold) {
      const velocity = ady / Math.max(dt, 1);
      if (velocity > 0.8) this._h.hardDrop();
      else                this._h.softDrop();
    }
  }
}

// =========================================================
// GAME LOGIC
// =========================================================
class Game {
  constructor(diffKey) {
    this.diff  = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this._bag  = [];
    this.score = 0; this.level = 1; this.lines = 0; this.combo = 0;
    this.heldPiece = null; this.canHold = true;
    this.current = this._spawn();
    this.next    = this._spawn();
    this.dropInterval = this.diff.speed;
  }
  _nextId() {
    if (!this._bag.length) {
      this._bag = [...PIECE_KEYS].sort(() => Math.random() - 0.5);
    }
    return this._bag.shift();
  }
  _spawn(id) {
    const key = id || this._nextId();
    const t   = TETROMINOES[key];
    return { id: key, shape: t.shape.map(r => [...r]), color: t.color, glow: t.glow,
             x: Math.floor((COLS - t.shape[0].length) / 2), y: 0 };
  }
  collides(piece, dx = 0, dy = 0, shape) {
    const s = shape || piece.shape;
    for (let r = 0; r < s.length; r++) {
      for (let c = 0; c < s[r].length; c++) {
        if (!s[r][c]) continue;
        const nx = piece.x + c + dx, ny = piece.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && this.board[ny][nx]) return true;
      }
    }
    return false;
  }
  ghostY() {
    let dy = 0;
    while (!this.collides(this.current, 0, dy + 1)) dy++;
    return this.current.y + dy;
  }
  rotate(dir) {
    const s = this.current.shape;
    const n = s.length;
    let ns = s.map((row, r) => row.map((_, c) => dir === 1 ? s[n - 1 - c][r] : s[c][n - 1 - r]));
    for (const kick of [0, 1, -1, 2, -2]) {
      if (!this.collides(this.current, kick, 0, ns)) {
        this.current.shape = ns;
        this.current.x += kick;
        return true;
      }
    }
    return false;
  }
  move(dx) {
    if (!this.collides(this.current, dx, 0)) {
      this.current.x += dx; return true;
    }
    return false;
  }
  softDrop() {
    if (!this.collides(this.current, 0, 1)) {
      this.current.y++; this.score += 1; return true;
    }
    return false;
  }
  hardDrop() {
    let dropped = 0;
    while (!this.collides(this.current, 0, 1)) {
      this.current.y++; dropped++;
    }
    this.score += dropped * 2;
    return dropped;
  }
  hold() {
    if (!this.canHold) return false;
    const prevHeld = this.heldPiece;
    this.heldPiece = this._spawn(this.current.id);
    this.current   = prevHeld ? this._spawn(prevHeld.id) : this.next;
    if (!prevHeld) this.next = this._spawn();
    this.canHold   = false;
    return true;
  }
  lock() {
    const p = this.current;
    let gameOver = false;
    p.shape.forEach((row, dr) => {
      row.forEach((v, dc) => {
        if (!v) return;
        const ny = p.y + dr;
        if (ny < 0) { gameOver = true; return; }
        this.board[ny][p.x + dc] = { color: p.color, glow: p.glow };
      });
    });
    if (gameOver) return { gameOver: true, cleared: null };
    const cleared = this._clearLines();
    this.current  = this.next;
    this.next     = this._spawn();
    this.canHold  = true;
    if (this.collides(this.current, 0, 0)) return { gameOver: true, cleared };
    return { gameOver: false, cleared };
  }
  _clearLines() {
    const full = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.board[r].every(c => c)) full.push(r);
    }
    if (!full.length) { this.combo = 0; return null; }
    this.combo++;
    const count    = full.length;
    const combo_b  = this.combo > 1 ? (this.combo - 1) * 50 * this.diff.mult : 0;
    const gained   = Math.floor(LINE_SCORES[count] * this.diff.mult * this.level + combo_b);
    this.score    += gained;
    this.lines    += count;
    const oldLevel = this.level;
    this.level     = 1 + Math.floor(this.lines / 10);
    const leveled  = this.level > oldLevel;
    if (leveled) this.dropInterval = Math.max(60, this.diff.speed - (this.level - 1) * this.diff.speedInc);
    full.forEach(r => {
      this.board.splice(r, 1);
      this.board.unshift(Array(COLS).fill(null));
    });
    return { rows: full, count, leveledUp: leveled, combo: this.combo, gained };
  }
}

// =========================================================
// APP CONTROLLER
// =========================================================
class App {
  constructor() {
    this._sound   = new SoundEngine();
    this._haptic  = new HapticEngine();
    this._hiscore = parseInt(localStorage.getItem('tetris-hiscore') || '0', 10);
    this._selectedDiff = null;
    this._game    = null;
    this._renderer= null;
    this._fx      = null;
    this._input   = null;
    this._raf     = null;
    this._lastTs  = 0;
    this._dropAcc = 0;
    this._paused  = false;
    this._softDropping = false;

    this._initUI();
    this._initGameControls();
    this._updateMenuHiscore();
  }

  _initUI() {
    document.getElementById('btn-play').addEventListener('click',  () => { this._sound.uiClick(); this._showScreen('screen-difficulty'); });
    document.getElementById('btn-sound').addEventListener('click', () => { const on = this._sound.toggle(); document.getElementById('btn-sound').textContent = on ? '🔊' : '🔇'; this._sound.uiClick(); });
    document.getElementById('btn-back').addEventListener('click', () => { this._sound.uiClick(); this._showScreen('screen-menu'); });
    document.querySelectorAll('.diff-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.diff-card').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-pressed','false'); });
        card.classList.add('selected'); card.setAttribute('aria-pressed','true');
        this._selectedDiff = card.dataset.diff;
        document.getElementById('btn-start').disabled = false;
        this._sound.uiClick(); this._haptic.light();
      });
    });
    document.getElementById('btn-start').addEventListener('click', () => {
      if (!this._selectedDiff) return;
      this._sound.uiClick();
      this._startGame(this._selectedDiff);
    });
    document.getElementById('btn-pause').addEventListener('click', () => this._togglePause());
    document.getElementById('btn-resume').addEventListener('click',     () => { this._sound.uiClick(); this._togglePause(); });
    document.getElementById('btn-restart').addEventListener('click',    () => { this._sound.uiClick(); this._startGame(this._selectedDiff); });
    document.getElementById('btn-pause-menu').addEventListener('click', () => { this._sound.uiClick(); this._stopLoop(); this._showScreen('screen-menu'); this._hideOverlay('overlay-pause'); });
    document.getElementById('btn-play-again').addEventListener('click', () => { this._sound.uiClick(); this._startGame(this._selectedDiff); });
    document.getElementById('btn-go-menu').addEventListener('click',    () => { this._sound.uiClick(); this._showScreen('screen-menu'); this._hideOverlay('overlay-gameover'); });
  }

  _initGameControls() {
    const makeDAS = (fn) => {
      let dasTimer = null, dasInterval = null;
      const start = () => {
        fn();
        dasTimer = setTimeout(() => { dasInterval = setInterval(fn, 55); }, 170);
      };
      const stop = () => { clearTimeout(dasTimer); clearInterval(dasInterval); };
      return { start, stop };
    };
    const left  = makeDAS(() => { if (this._game && !this._paused) { if (this._game.move(-1))  { this._sound.move(); this._haptic.light(); } } });
    const right = makeDAS(() => { if (this._game && !this._paused) { if (this._game.move( 1))  { this._sound.move(); this._haptic.light(); } } });
    const bind = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      const onDown = (e) => { e.preventDefault(); el.classList.add('pressed'); down(); };
      const onUp   = (e) => { e.preventDefault(); el.classList.remove('pressed'); up && up(); };
      el.addEventListener('pointerdown',  onDown);
      el.addEventListener('pointerup',    onUp);
      el.addEventListener('pointerleave', onUp);
      el.addEventListener('pointercancel',onUp);
    };
    bind('ctrl-left',   left.start,  left.stop);
    bind('ctrl-right',  right.start, right.stop);
    bind('ctrl-rotate', () => { if (this._game && !this._paused) { if (this._game.rotate(1)) { this._sound.rotate(); this._haptic.light(); } } }, null);
    bind('ctrl-soft',
      () => { if (this._game && !this._paused) this._softDropping = true; },
      () => { this._softDropping = false; }
    );
    bind('ctrl-hard',   () => { if (this._game && !this._paused) this._doHardDrop(); }, null);
  }

  _showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active', 'screen-enter');
    });
    const el = document.getElementById(id);
    el.classList.add('active');
    void el.offsetWidth;
    el.classList.add('screen-enter');
  }

  _showOverlay(id)  { document.getElementById(id).classList.remove('hidden'); }
  _hideOverlay(id)  { document.getElementById(id).classList.add('hidden'); }

  _updateMenuHiscore() {
    document.getElementById('menu-hiscore').textContent = this._hiscore.toLocaleString();
  }

  _startGame(diffKey) {
    this._stopLoop();
    this._hideOverlay('overlay-pause');
    this._hideOverlay('overlay-gameover');
    this._showScreen('screen-game');

    this._selectedDiff = diffKey;
    const diff = DIFFICULTIES[diffKey];
    document.getElementById('diff-label').textContent  = diff.label;
    document.getElementById('diff-label').style.color  = diff.color;
    document.getElementById('hud-best').textContent    = this._hiscore.toLocaleString();

    this._game         = new Game(diffKey);
    this._paused       = false;
    this._softDropping = false;

    // Double RAF: wait for screen transition + safe-area layout to fully settle
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const sideW     = 56;
      const gameArea  = document.querySelector('.game-area');
      const boardWrap = document.getElementById('board-wrap');
      // Read directly from game-area — already accounts for topbar, safe areas, controls
      const availW    = gameArea.clientWidth  - sideW * 2;
      const availH    = gameArea.clientHeight - 8;
      const cell      = Math.max(14, Math.min(Math.floor(availH / ROWS), Math.floor(availW / COLS)));

      const cw = cell * COLS, ch = cell * ROWS;
      const canvas = document.getElementById('canvas-main');
      canvas.width  = cw; canvas.height = ch;
      boardWrap.style.width  = cw + 'px';
      boardWrap.style.height = ch + 'px';

      this._renderer = new Renderer(canvas, cell);
      this._fx       = new FXEngine(document.getElementById('fx-layer'), canvas);
      this._input    = new InputManager(canvas, {
        moveLeft:       () => { if (this._paused) return; if (this._game.move(-1)) { this._sound.move(); this._haptic.light(); } },
        moveRight:      () => { if (this._paused) return; if (this._game.move( 1)) { this._sound.move(); this._haptic.light(); } },
        softDrop:       () => { if (this._paused) return; this._softDropping = true; },
        hardDrop:       () => { if (this._paused) return; this._doHardDrop(); },
        rotate:         (d) => { if (this._paused) return; if (this._game.rotate(d)) { this._sound.rotate(); this._haptic.light(); } },
        hold:           () => { if (this._paused) return; if (this._game.hold()) { this._sound.uiClick(); this._haptic.light(); this._renderPreviews(); } },
        pause:          () => this._togglePause(),
        longPressStart: () => { if (!this._paused) this._softDropping = true; },
        longPressEnd:   () => { this._softDropping = false; },
      });
      this._input.setCell(cell);

      this._renderPreviews();
      this._updateHUD();
      this._dropAcc = 0;
      this._lastTs  = performance.now();
      this._raf     = requestAnimationFrame(ts => this._loop(ts));
    }));
  }

  _loop(ts) {
    if (!this._paused) {
      const dt = ts - this._lastTs;
      this._dropAcc += dt;
      // Soft drop = 2x normal gravity (never faster than 80ms)
      const interval = this._softDropping ? Math.max(this._game.dropInterval / 2, 80) : this._game.dropInterval;
      while (this._dropAcc >= interval) {
        this._dropAcc -= interval;
        const fell = this._game.softDrop();
        if (!fell) { this._softDropping = false; this._doLock(); return; }
      }
    }
    this._lastTs = ts;
    this._draw();
    this._raf = requestAnimationFrame(ts2 => this._loop(ts2));
  }

  _doHardDrop() {
    const dropped = this._game.hardDrop();
    this._sound.hardDrop();
    this._haptic.heavy();
    if (dropped > 4) {
      const cell = this._renderer.cell;
      this._fx.scorePopup(this._renderer.canvas.width / 2, this._game.current.y * cell, '+' + (dropped * 2), '#ffd740');
    }
    this._doLock();
  }

  _doLock() {
    const { gameOver, cleared } = this._game.lock();
    this._sound.lock();
    this._haptic.medium();
    if (cleared) {
      const cell = this._renderer.cell;
      this._fx.lineClearFlash(cleared.rows, cell);
      this._sound.lineClear(cleared.count);
      if (cleared.count === 4) {
        this._fx.screenShake();
        this._haptic.success();
      }
      if (cleared.leveledUp) {
        this._fx.levelUpPulse();
        this._sound.levelUp();
        this._haptic.success();
      }
      if (cleared.combo > 1) {
        this._fx.comboFlash();
        const cx = this._renderer.canvas.width / 2;
        const cy = this._renderer.canvas.height / 2;
        this._fx.scorePopup(cx, cy, 'x' + cleared.combo + ' COMBO!', '#ffd740');
      }
      this._fx.scorePopup(
        this._renderer.canvas.width / 2,
        Math.max(0, (cleared.rows[0] || 0) * cell - 20),
        '+' + cleared.gained.toLocaleString(),
        '#00ff88'
      );
      if (this._game.score > this._hiscore) {
        this._hiscore = this._game.score;
        localStorage.setItem('tetris-hiscore', this._hiscore);
      }
    }
    this._updateHUD();
    this._renderPreviews();
    if (gameOver) { this._endGame(); return; }
    this._raf = requestAnimationFrame(ts => this._loop(ts));
  }

  _draw() {
    const r = this._renderer, g = this._game;
    r.clear();
    r.drawGrid();
    r.drawBoard(g.board);
    r.drawPiece(g.current, g.ghostY());
  }

  _renderPreviews() {
    const r = this._renderer, g = this._game;
    r.drawPreview(document.getElementById('canvas-next'), g.next);
    r.drawPreview(document.getElementById('canvas-hold'), g.heldPiece);
  }

  _updateHUD() {
    const g = this._game;
    document.getElementById('hud-score').textContent = g.score.toLocaleString();
    document.getElementById('hud-level').textContent = g.level;
    document.getElementById('hud-lines').textContent = g.lines;
    document.getElementById('combo-count').textContent = g.combo;
    if (g.score > this._hiscore) {
      this._hiscore = g.score;
      localStorage.setItem('tetris-hiscore', this._hiscore);
      document.getElementById('hud-best').textContent = this._hiscore.toLocaleString();
    }
  }

  _togglePause() {
    this._paused = !this._paused;
    if (this._paused) {
      this._sound.uiClick();
      const g = this._game;
      document.getElementById('pause-score').textContent = g.score.toLocaleString();
      document.getElementById('pause-level').textContent = g.level;
      document.getElementById('pause-lines').textContent = g.lines;
      this._showOverlay('overlay-pause');
    } else {
      this._hideOverlay('overlay-pause');
      this._lastTs = performance.now();
    }
  }

  _endGame() {
    this._stopLoop();
    this._sound.gameOver();
    this._haptic.heavy();
    const g = this._game;
    const isNewBest = g.score >= this._hiscore && g.score > 0;
    if (isNewBest) {
      this._hiscore = g.score;
      localStorage.setItem('tetris-hiscore', this._hiscore);
    }
    document.getElementById('go-score').textContent = g.score.toLocaleString();
    document.getElementById('go-best').textContent  = this._hiscore.toLocaleString();
    document.getElementById('go-level').textContent = g.level;
    document.getElementById('go-lines').textContent = g.lines;
    const badge = document.getElementById('new-best-badge');
    isNewBest ? badge.classList.remove('hidden') : badge.classList.add('hidden');
    this._updateMenuHiscore();
    this._showOverlay('overlay-gameover');
  }

  _stopLoop() {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this._input) { this._input.destroy(); this._input = null; }
  }
}

// =========================================================
// BOOT
// =========================================================
window.addEventListener('DOMContentLoaded', () => { window._app = new App(); });
