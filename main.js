/**
 * Just Divide — Kid Mode
 * Vanilla JavaScript Implementation
 */

// --- 1. CONFIG & CONSTANTS ---
const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 1024;

const COLOR_CLASSES = ['tile-blue', 'tile-pink', 'tile-orange', 'tile-red', 'tile-purple'];

const DIFFICULTY_CONFIG = {
  1: { name: 'Easy',   pool: [2, 3, 4, 6, 8, 9, 12] },
  2: { name: 'Medium', pool: [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18] },
  3: { name: 'Hard',   pool: [2, 3, 4, 5, 6, 7, 8, 9, 12, 14, 15, 18, 20, 24, 28, 30] }
};

// --- 2. GAME STATE ---
let state = {
  grid: Array(16).fill(null), // 16 cells (null or integer)
  queue: [],                  // 3 upcoming numbers
  keepVal: null,              // Number or null
  score: 0,
  bestScore: parseInt(localStorage.getItem('jd_best_score') || '0', 10),
  level: 1,
  trashUses: 3,
  hintsEnabled: false,
  difficulty: 1,
  timeElapsed: 0,
  timerInterval: null,
  undoStack: []               // Max 10 snapshots
};

// --- 3. DOM ELEMENTS ---
const stageEl         = document.getElementById('game-stage');
const gridEl          = document.getElementById('grid');
const queueEl         = document.getElementById('queue-container');
const keepHolderEl    = document.getElementById('keep-holder');
const keepSlotEl      = document.getElementById('keep-slot');
const trashSlotEl     = document.getElementById('trash-slot');
const trashCountEl    = document.getElementById('trash-count');
const scoreEl         = document.getElementById('score-display');
const bestEl          = document.getElementById('best-display');
const levelEl         = document.getElementById('level-display');
const hintStatusEl    = document.getElementById('hint-status');
const timerEl         = document.getElementById('session-timer');
const modalEl         = document.getElementById('game-over-modal');
const modalScoreEl    = document.getElementById('modal-score');
const modalBestEl     = document.getElementById('modal-best');

// --- 4. VIEWPORT AUTO-SCALING (Safe Scale for 1440x1024) ---
function resizeStage() {
  const windowW = window.innerWidth;
  const windowH = window.innerHeight;
  const scale = Math.min(windowW / DESIGN_WIDTH, windowH / DESIGN_HEIGHT);
  stageEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener('resize', resizeStage);

// --- 5. TILE RENDERING & UTILS ---
function getTileColorClass(num) {
  // Deterministic color assignment based on number value
  return COLOR_CLASSES[num % COLOR_CLASSES.length];
}

function getRandomPoolTile() {
  const pool = DIFFICULTY_CONFIG[state.difficulty].pool;
  return pool[Math.floor(Math.random() * pool.length)];
}

function createTileElement(value, isDraggable = false, source = 'queue') {
  const tile = document.createElement('div');
  tile.className = `tile ${getTileColorClass(value)}`;
  tile.textContent = value;
  tile.dataset.value = value;
  tile.dataset.source = source;

  if (isDraggable) {
    tile.setAttribute('draggable', 'true');
    tile.addEventListener('dragstart', handleDragStart);
    tile.addEventListener('dragend', handleDragEnd);
  }
  return tile;
}

// --- 6. CORE MATH / MERGE LOGIC ---
// Returns neighbor indices: [top, right, bottom, left]
function getNeighbors(index) {
  const row = Math.floor(index / 4);
  const col = index % 4;
  const neighbors = [];
  if (row > 0) neighbors.push(index - 4); // Up
  if (row < 3) neighbors.push(index + 4); // Down
  if (col > 0) neighbors.push(index - 1); // Left
  if (col < 3) neighbors.push(index + 1); // Right
  return neighbors;
}

/**
 * Executes placement and recursive merges according to assignment rules:
 * Rule 1: Equal Tiles -> Both vanish
 * Rule 2: Larger ÷ Smaller is whole number -> Larger becomes result; Smaller vanishes
 * Rule 4: If result is 1 -> Tile vanishes
 */
function evaluatePlacement(targetIdx, placedValue) {
  saveUndoState();

  let currentValue = placedValue;
  state.grid[targetIdx] = currentValue;

  let anyMerged = false;
  let keepChecking = true;

  while (keepChecking) {
    keepChecking = false;
    const neighbors = getNeighbors(targetIdx);

    for (const nIdx of neighbors) {
      const neighborVal = state.grid[nIdx];
      if (neighborVal === null) continue;

      // Case 1: Equal Tiles -> Both Disappear
      if (currentValue === neighborVal) {
        state.score += (currentValue * 2);
        state.grid[targetIdx] = null;
        state.grid[nIdx] = null;
        currentValue = null;
        anyMerged = true;
        break; // Placed tile disappeared, turn resolution complete
      }

      // Case 2: Divisible Tiles
      const larger  = Math.max(currentValue, neighborVal);
      const smaller = Math.min(currentValue, neighborVal);

      if (larger % smaller === 0) {
        const quotient = larger / smaller;
        state.score += larger;

        if (currentValue === larger) {
          // Placed tile was the larger one -> takes quotient; smaller neighbor vanishes
          state.grid[nIdx] = null;
          if (quotient === 1) {
            state.grid[targetIdx] = null;
            currentValue = null;
          } else {
            state.grid[targetIdx] = quotient;
            currentValue = quotient;
          }
        } else {
          // Neighbor was larger -> neighbor becomes quotient; placed tile vanishes
          state.grid[targetIdx] = null;
          currentValue = null;
          if (quotient === 1) {
            state.grid[nIdx] = null;
          } else {
            state.grid[nIdx] = quotient;
          }
        }

        anyMerged = true;
        if (currentValue !== null) {
          // Check subsequent cascade merges on the new quotient
          keepChecking = true;
        }
        break;
      }
    }
  }

  // Update level (1 level per 10 points gained)
  checkLevelUp();
  updateScores();
  renderGrid();
}

// Determines if placing a specific value in a cell creates an immediate valid merge
function canMergeAt(cellIdx, value) {
  if (state.grid[cellIdx] !== null) return false;
  const neighbors = getNeighbors(cellIdx);
  for (const nIdx of neighbors) {
    const nVal = state.grid[nIdx];
    if (nVal !== null) {
      if (value === nVal) return true;
      if (Math.max(value, nVal) % Math.min(value, nVal) === 0) return true;
    }
  }
  return false;
}

// Check if entire board is full and no valid placement can merge
function checkGameOver() {
  const isFull = state.grid.every(v => v !== null);
  if (!isFull) return false;

  const activeTile = state.queue[0];
  for (let i = 0; i < 16; i++) {
    if (canMergeAt(i, activeTile)) return false;
  }
  return true;
}

// --- 7. QUEUE & REPLENISH ---
function initQueue() {
  state.queue = [getRandomPoolTile(), getRandomPoolTile(), getRandomPoolTile()];
  renderQueue();
}

function advanceQueue() {
  state.queue.shift();
  state.queue.push(getRandomPoolTile());
  renderQueue();
  updateHintHighlights();

  if (checkGameOver()) {
    triggerGameOver();
  }
}

// --- 8. STATE PRESERVATION (UNDO & LEVEL) ---
function saveUndoState() {
  const snapshot = {
    grid: [...state.grid],
    queue: [...state.queue],
    keepVal: state.keepVal,
    score: state.score,
    level: state.level,
    trashUses: state.trashUses
  };
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 10) state.undoStack.shift();
}

function performUndo() {
  if (state.undoStack.length === 0) return;
  const prev = state.undoStack.pop();
  state.grid = prev.grid;
  state.queue = prev.queue;
  state.keepVal = prev.keepVal;
  state.score = prev.score;
  state.level = prev.level;
  state.trashUses = prev.trashUses;

  updateScores();
  renderGrid();
  renderQueue();
  renderKeep();
  renderTrash();
  updateHintHighlights();
}

function checkLevelUp() {
  const calculatedLevel = Math.floor(state.score / 10) + 1;
  if (calculatedLevel > state.level) {
    state.level = calculatedLevel;
    state.trashUses += 2; // Bonus trash uses on level up
    renderTrash();
  }
  levelEl.textContent = state.level;
}

function updateScores() {
  scoreEl.textContent = state.score;
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem('jd_best_score', state.bestScore);
  }
  bestEl.textContent = state.bestScore;
}

// --- 9. DRAG & DROP SYSTEM ---
let draggedData = null;

function handleDragStart(e) {
  draggedData = {
    value: parseInt(e.target.dataset.value, 10),
    source: e.target.dataset.source
  };
  e.dataTransfer.setData('text/plain', JSON.stringify(draggedData));
  setTimeout(() => e.target.classList.add('dragging'), 0);
  updateHintHighlights();
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedData = null;
  clearHighlights();
}

// Cell Dropping
function handleGridCellDragOver(e) {
  e.preventDefault();
}

function handleGridCellDrop(e) {
  e.preventDefault();
  const cellIdx = parseInt(e.currentTarget.dataset.index, 10);
  if (state.grid[cellIdx] !== null) return; // Cannot place in occupied cell

  if (draggedData) {
    const val = draggedData.value;
    const source = draggedData.source;

    evaluatePlacement(cellIdx, val);

    if (source === 'queue') {
      advanceQueue();
    } else if (source === 'keep') {
      state.keepVal = null;
      renderKeep();
    }
  }
}

// Keep Slot Swapping / Dropping
keepSlotEl.addEventListener('dragover', (e) => e.preventDefault());
keepSlotEl.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!draggedData) return;

  saveUndoState();
  if (draggedData.source === 'queue') {
    const incomingVal = draggedData.value;
    if (state.keepVal === null) {
      state.keepVal = incomingVal;
      advanceQueue();
    } else {
      // Swap KEEP value with active queue head
      const temp = state.keepVal;
      state.keepVal = incomingVal;
      state.queue[0] = temp;
      renderQueue();
    }
    renderKeep();
  }
});

// Trash Slot Dropping
trashSlotEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  trashSlotEl.classList.add('drag-hover');
});
trashSlotEl.addEventListener('dragleave', () => {
  trashSlotEl.classList.remove('drag-hover');
});
trashSlotEl.addEventListener('drop', (e) => {
  e.preventDefault();
  trashSlotEl.classList.remove('drag-hover');
  if (!draggedData || state.trashUses <= 0) return;

  saveUndoState();
  state.trashUses--;
  renderTrash();

  if (draggedData.source === 'queue') {
    advanceQueue();
  } else if (draggedData.source === 'keep') {
    state.keepVal = null;
    renderKeep();
  }
});

// --- 10. RENDERING FUNCTIONS ---
function renderGrid() {
  gridEl.innerHTML = '';
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset.index = i;

    cell.addEventListener('dragover', handleGridCellDragOver);
    cell.addEventListener('drop', handleGridCellDrop);

    const val = state.grid[i];
    if (val !== null) {
      const tile = createTileElement(val, false, 'grid');
      cell.appendChild(tile);
    }
    gridEl.appendChild(cell);
  }
}

function renderQueue() {
  queueEl.innerHTML = '';
  state.queue.forEach((val, idx) => {
    const isDraggable = (idx === 0);
    const tile = createTileElement(val, isDraggable, 'queue');
    tile.classList.add(`queue-tile-${idx}`);
    queueEl.appendChild(tile);
  });
}

function renderKeep() {
  keepHolderEl.innerHTML = '';
  if (state.keepVal !== null) {
    const tile = createTileElement(state.keepVal, true, 'keep');
    keepHolderEl.appendChild(tile);
  }
}

function renderTrash() {
  trashCountEl.textContent = state.trashUses;
}

// --- 11. HINT HIGHLIGHTS ---
function updateHintHighlights() {
  clearHighlights();
  if (!state.hintsEnabled) return;

  const currentVal = draggedData ? draggedData.value : state.queue[0];
  if (currentVal === undefined) return;

  const cells = gridEl.querySelectorAll('.grid-cell');
  cells.forEach(cell => {
    const idx = parseInt(cell.dataset.index, 10);
    if (canMergeAt(idx, currentVal)) {
      cell.classList.add('highlight-target');
    }
  });
}

function clearHighlights() {
  const cells = gridEl.querySelectorAll('.grid-cell');
  cells.forEach(c => c.classList.remove('highlight-target'));
}

// --- 12. TIMER & MODAL ---
function startTimer() {
  clearInterval(state.timerInterval);
  state.timeElapsed = 0;
  state.timerInterval = setInterval(() => {
    state.timeElapsed++;
    const mins = String(Math.floor(state.timeElapsed / 60)).padStart(2, '0');
    const secs = String(state.timeElapsed % 60).padStart(2, '0');
    timerEl.textContent = `⏱️ Time: ${mins}:${secs}`;
  }, 1000);
}

function triggerGameOver() {
  clearInterval(state.timerInterval);
  modalScoreEl.textContent = state.score;
  modalBestEl.textContent = state.bestScore;
  modalEl.classList.remove('hidden');
}

// --- 13. RESTART & INITIALIZATION ---
function initGame() {
  state.grid = Array(16).fill(null);
  state.keepVal = null;
  state.score = 0;
  state.level = 1;
  state.trashUses = 3;
  state.undoStack = [];
  modalEl.classList.add('hidden');

  updateScores();
  levelEl.textContent = state.level;
  renderGrid();
  initQueue();
  renderKeep();
  renderTrash();
  startTimer();
  resizeStage();
}

// --- 14. EVENT LISTENERS & SHORTCUTS ---
document.getElementById('btn-undo').addEventListener('click', performUndo);
document.getElementById('btn-restart').addEventListener('click', initGame);
document.getElementById('btn-play-again').addEventListener('click', initGame);

const hintsBtn = document.getElementById('btn-hints');
hintsBtn.addEventListener('click', () => {
  state.hintsEnabled = !state.hintsEnabled;
  hintStatusEl.textContent = state.hintsEnabled ? 'ON' : 'OFF';
  updateHintHighlights();
});

// Difficulty switch buttons
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    state.difficulty = parseInt(e.target.dataset.diff, 10);
    initGame();
  });
});

// Keyboard controls: Z, R, G, 1, 2, 3
window.addEventListener('keydown', (e) => {
  if (e.key === 'z' || e.key === 'Z') performUndo();
  if (e.key === 'r' || e.key === 'R') initGame();
  if (e.key === 'g' || e.key === 'G') hintsBtn.click();
  if (['1', '2', '3'].includes(e.key)) {
    const target = document.querySelector(`.diff-btn[data-diff="${e.key}"]`);
    if (target) target.click();
  }
});

// Start game
initGame();