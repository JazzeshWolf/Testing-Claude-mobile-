'use strict';

const COLS = 10;
const ROWS = 20;

const PIECES = [
  { shape: [[1,1,1,1]],                   color: '#00f0f0' }, // I
  { shape: [[1,1],[1,1]],                  color: '#f0f000' }, // O
  { shape: [[0,1,0],[1,1,1]],              color: '#a000f0' }, // T
  { shape: [[0,1,1],[1,1,0]],              color: '#00f000' }, // S
  { shape: [[1,1,0],[0,1,1]],              color: '#f00000' }, // Z
  { shape: [[1,0,0],[1,1,1]],              color: '#0000f0' }, // J
  { shape: [[0,0,1],[1,1,1]],              color: '#f0a000' }, // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

class Tetris {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.nextCanvas = document.getElementById('next-canvas');
    this.nextCtx = this.nextCanvas.getContext('2d');

    this.cell = 0;
    this.board = [];
    this.piece = null;
    this.nextPiece = null;
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.running = false;
    this.lastTime = 0;
    this.dropCounter = 0;
    this.dropInterval = 800;
    this.animId = null;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindButtons();
    this.bindKeyboard();
    this.bindTouch();
  }

  resize() {
    const vw = Math.min(window.innerWidth, 360) - 16;
    const vh = window.innerHeight - 160;
    const cellByW = Math.floor(vw / COLS);
    const cellByH = Math.floor(vh / ROWS);
    this.cell = Math.max(14, Math.min(cellByW, cellByH));

    this.canvas.width  = COLS * this.cell;
    this.canvas.height = ROWS * this.cell;
    this.nextCanvas.width  = 4 * this.cell;
    this.nextCanvas.height = 2 * this.cell;

    if (!this.running) this.drawIdle();
  }

  drawIdle() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid();
  }

  newPiece() {
    const def = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
      shape: def.shape.map(r => [...r]),
      color: def.color,
      x: Math.floor(COLS / 2) - Math.floor(def.shape[0].length / 2),
      y: 0,
    };
  }

  start() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.dropInterval = 800;
    this.running = true;
    this.updateHUD();
    this.piece = this.newPiece();
    this.nextPiece = this.newPiece();
    this.lastTime = performance.now();
    this.dropCounter = 0;
    if (this.animId) cancelAnimationFrame(this.animId);
    this.loop(this.lastTime);
  }

  loop(timestamp) {
    if (!this.running) return;
    const delta = timestamp - this.lastTime;
    this.lastTime = timestamp;
    this.dropCounter += delta;
    if (this.dropCounter >= this.dropInterval) {
      this.dropCounter = 0;
      this.softDrop();
    }
    this.draw();
    this.animId = requestAnimationFrame(ts => this.loop(ts));
  }

  collides(piece, dx, dy, shape) {
    shape = shape || piece.shape;
    dx = dx || 0;
    dy = dy || 0;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = piece.x + c + dx;
        const ny = piece.y + r + dy;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && this.board[ny][nx]) return true;
      }
    }
    return false;
  }

  rotatePiece() {
    if (!this.running) return;
    const p = this.piece;
    const rows = p.shape.length, cols = p.shape[0].length;
    const rotated = Array.from({ length: cols }, (_, c) =>
      Array.from({ length: rows }, (_, r) => p.shape[rows - 1 - r][c])
    );
    const kicks = [0, 1, -1, 2, -2];
    for (const kick of kicks) {
      if (!this.collides(p, kick, 0, rotated)) {
        p.shape = rotated;
        p.x += kick;
        return;
      }
    }
  }

  lock() {
    const p = this.piece;
    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (!p.shape[r][c]) continue;
        const row = p.y + r;
        if (row < 0) { this.endGame(); return; }
        this.board[row][p.x + c] = p.color;
      }
    }
    this.clearLines();
    this.piece = this.nextPiece;
    this.nextPiece = this.newPiece();
    if (this.collides(this.piece)) this.endGame();
  }

  clearLines() {
    let count = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(cell => cell !== null)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(null));
        count++;
        r++;
      }
    }
    if (!count) return;
    this.lines += count;
    this.score += LINE_SCORES[count] * this.level;
    this.level = Math.floor(this.lines / 10) + 1;
    this.dropInterval = Math.max(80, 800 - (this.level - 1) * 72);
    this.updateHUD();
  }

  moveLeft()  { if (this.running && !this.collides(this.piece, -1)) this.piece.x--; }
  moveRight() { if (this.running && !this.collides(this.piece,  1)) this.piece.x++; }

  softDrop() {
    if (!this.running) return;
    if (!this.collides(this.piece, 0, 1)) {
      this.piece.y++;
    } else {
      this.lock();
    }
  }

  hardDrop() {
    if (!this.running) return;
    while (!this.collides(this.piece, 0, 1)) this.piece.y++;
    this.lock();
    this.dropCounter = 0;
  }

  ghostRow() {
    let g = this.piece.y;
    while (!this.collides(this.piece, 0, g - this.piece.y + 1)) g++;
    return g;
  }

  updateHUD() {
    document.getElementById('score').textContent = this.score;
    document.getElementById('level').textContent = this.level;
    document.getElementById('lines').textContent = this.lines;
  }

  endGame() {
    this.running = false;
    cancelAnimationFrame(this.animId);
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `
      <h1>GAME OVER</h1>
      <p>Score: <strong style="color:#e94560">${this.score}</strong></p>
      <p>Level ${this.level} &nbsp;|&nbsp; ${this.lines} lines</p>
      <button id="start-btn">PLAY AGAIN</button>
    `;
    overlay.classList.add('active');
    document.getElementById('start-btn').addEventListener('click', () => {
      overlay.classList.remove('active');
      this.start();
    });
  }

  drawGrid() {
    const { ctx, cell } = this;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * cell); ctx.lineTo(COLS * cell, r * cell); ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * cell, 0); ctx.lineTo(c * cell, ROWS * cell); ctx.stroke();
    }
  }

  drawBlock(ctx, col, row, color, alpha) {
    const { cell } = this;
    const x = col * cell, y = row * cell;
    ctx.globalAlpha = alpha !== undefined ? alpha : 1;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 1, y + 1, cell - 2, 3);
    ctx.fillRect(x + 1, y + 1, 3, cell - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 1, y + cell - 4, cell - 2, 3);
    ctx.globalAlpha = 1;
  }

  draw() {
    const { ctx, cell } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid();

    // Locked board
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c]) this.drawBlock(ctx, c, r, this.board[r][c]);
      }
    }

    if (!this.piece) return;

    // Ghost piece
    const gy = this.ghostRow();
    if (gy !== this.piece.y) {
      for (let r = 0; r < this.piece.shape.length; r++) {
        for (let c = 0; c < this.piece.shape[r].length; c++) {
          if (this.piece.shape[r][c]) {
            const px = (this.piece.x + c) * cell;
            const py = (gy + r) * cell;
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
          }
        }
      }
    }

    // Active piece
    for (let r = 0; r < this.piece.shape.length; r++) {
      for (let c = 0; c < this.piece.shape[r].length; c++) {
        if (this.piece.shape[r][c]) {
          this.drawBlock(ctx, this.piece.x + c, this.piece.y + r, this.piece.color);
        }
      }
    }

    // Next piece preview
    const nctx = this.nextCtx;
    nctx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    if (this.nextPiece) {
      const offX = Math.floor((4 - this.nextPiece.shape[0].length) / 2);
      const offY = Math.floor((2 - this.nextPiece.shape.length) / 2);
      for (let r = 0; r < this.nextPiece.shape.length; r++) {
        for (let c = 0; c < this.nextPiece.shape[r].length; c++) {
          if (this.nextPiece.shape[r][c]) {
            this.drawBlock(nctx, offX + c, offY + r, this.nextPiece.color);
          }
        }
      }
    }
  }

  bindButtons() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
    };
    on('start-btn',  () => { document.getElementById('overlay').classList.remove('active'); this.start(); });
    on('btn-left',   () => this.moveLeft());
    on('btn-right',  () => this.moveRight());
    on('btn-rotate', () => this.rotatePiece());
    on('btn-down',   () => this.softDrop());
    on('btn-drop',   () => this.hardDrop());
  }

  bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (!this.running) return;
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); this.moveLeft();    break;
        case 'ArrowRight': e.preventDefault(); this.moveRight();   break;
        case 'ArrowDown':  e.preventDefault(); this.softDrop();    break;
        case 'ArrowUp':    e.preventDefault(); this.rotatePiece(); break;
        case ' ':          e.preventDefault(); this.rotatePiece(); break;
        case 'Enter':      e.preventDefault(); this.hardDrop();    break;
      }
    });
  }

  bindTouch() {
    let sx, sy, st;
    const el = this.canvas;

    el.addEventListener('touchstart', e => {
      e.preventDefault();
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    }, { passive: false });

    el.addEventListener('touchend', e => {
      e.preventDefault();
      if (!this.running) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      const dt = Date.now() - st;
      const thresh = this.cell * 1.5;

      if (Math.abs(dx) < thresh && Math.abs(dy) < thresh && dt < 220) {
        this.rotatePiece();
      } else if (Math.abs(dx) > Math.abs(dy)) {
        const steps = Math.max(1, Math.round(Math.abs(dx) / this.cell));
        for (let i = 0; i < steps; i++) dx > 0 ? this.moveRight() : this.moveLeft();
      } else if (dy > thresh) {
        this.hardDrop();
      }
    }, { passive: false });
  }
}

window.addEventListener('DOMContentLoaded', () => { new Tetris(); });
