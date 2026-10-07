# Just Divide — Kid Mode

A math-based educational puzzle game engineered for children aged 7–12 to master division, factors, and multiples.

## 🕹️ Live Demo
- **Playable Vercel URL:** [Deploy link will go here]

## 🛠️ Architecture & Approach
- **Engine / Core:** Vanilla JavaScript (ES6+), semantic HTML5, and CSS3. Zero third-party dependencies or external JS libraries.
- **Responsive Aspect Scaling:** The game calculates scale using `Math.min(window.innerWidth / 1440, window.innerHeight / 1024)` and applies an anchored CSS matrix transform, ensuring crisp visuals on mobile, tablet, and 4K displays.
- **Drag & Drop System:** Uses the native HTML5 Drag and Drop API with synchronized state management to transfer tiles seamlessly across the 4×4 grid, KEEP box, and TRASH slot.
- **Recursive Merge Engine:** Evaluates neighbors orthogonally for equality ($A = B \rightarrow \emptyset$) and whole-number divisibility ($A \div B \in \mathbb{Z}^+$), collapsing 1s and cascading subsequent valid operations.

## 💡 Decisions Made
1. **Fallback Vectors:** Embedded pure SVG vectors for the mascot and visual badges so the game renders with graphics even if external asset files are missing.
2. **State Snapshot History:** Implemented an undo system using an immutable 10-step state snapshot stack for quick recovery without mutations.
3. **Difficulty Scales:** Added number pools (Easy, Medium, Hard) to adjust mathematical challenges for different skill levels.

## 🚀 Challenges & Solutions
- **Handling Multi-step Cascade Merges:** When a tile merges and becomes a new quotient, it might trigger another merge with an adjacent tile. Solved using a `while(keepChecking)` loop that resolves recursively until all touching tiles are in a stable state.
- **Aspect Scaling Drag Artifacts:** In some browsers, CSS scale transforms can offset native drag-ghost images. Handled by passing data transfers cleanly via JSON payloads rather than element clones.

## 🔮 What I Would Improve
- Add Web Audio API synthesized sound effects for tile snaps, pops, and level-ups.
- Add touch gestures for swipe-to-play support on touchscreens.