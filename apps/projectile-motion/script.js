const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const timeDisplay = document.getElementById("timeDisplay");
const vxDisplay = document.getElementById("vxDisplay");
const vyDisplay = document.getElementById("vyDisplay");
const speedDisplay = document.getElementById("speedDisplay");
const angleDisplay = document.getElementById("angleDisplay");
const maxHeightDisplay = document.getElementById("maxHeightDisplay");
const rangeDisplay = document.getElementById("rangeDisplay");
const totalTimeDisplay = document.getElementById("totalTimeDisplay");

const resetBtn = document.getElementById("resetBtn");
const toggleBtn = document.getElementById("toggleBtn");
const slowMotionCheckbox = document.getElementById("slowMotion");

const heightInput = document.getElementById("heightInput");
const speedInput = document.getElementById("speedInput");
const angleInput = document.getElementById("angleInput");
const massInput = document.getElementById("massInput");
const gravityInput = document.getElementById("gravityInput");

const displayModeRadios = document.querySelectorAll('input[name="displayMode"]');

const W = canvas.width;
const H = canvas.height;

// Drawing margins
const marginLeft = 70;
const marginRight = 40;
const marginTop = 40;
const marginBottom = 70;

// State object
const state = {
  running: false,
  paused: false,
  finished: false,

  t: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,

  x0: 0,
  y0: 5,
  v0: 5,
  angleDeg: 45,
  angleRad: Math.PI / 4,
  mass: 1,
  g: 9.81,

  vx0: 0,
  vy0: 0,

  maxHeight: 0,
  totalTime: 0,
  range: 0,

  displayMode: "velocity",

  trail: []
};

// -------------------------
// Physics setup
// -------------------------
function readInputs() {
  state.y0 = parseFloat(heightInput.value);
  state.v0 = parseFloat(speedInput.value);
  state.angleDeg = parseFloat(angleInput.value);
  state.mass = parseFloat(massInput.value);
  state.g = parseFloat(gravityInput.value);

  if (isNaN(state.y0)) state.y0 = 5;
  if (isNaN(state.v0)) state.v0 = 5;
  if (isNaN(state.angleDeg)) state.angleDeg = 45;
  if (isNaN(state.mass) || state.mass <= 0) state.mass = 1;
  if (isNaN(state.g) || state.g <= 0) state.g = 9.81;

  state.angleRad = state.angleDeg * Math.PI / 180;
  state.vx0 = state.v0 * Math.cos(state.angleRad);
  state.vy0 = state.v0 * Math.sin(state.angleRad);

  state.maxHeight = computeMaxHeight();
  state.totalTime = computeTotalTime();
  state.range = computeRange();
}

function resetSimulation() {
  readInputs();

  state.running = false;
  state.paused = false;
  state.finished = false;

  state.t = 0;
  state.x = 0;
  state.y = state.y0;
  state.vx = state.vx0;
  state.vy = state.vy0;

  state.trail = [{ x: state.x, y: state.y }];

  toggleBtn.textContent = "Start";

  updateReadouts();
  drawScene();
}

function startSimulation() {
  if (state.finished) {
    resetSimulation();
  }

  state.running = true;
  state.paused = false;
  toggleBtn.textContent = "Pause";
}

function pauseSimulation() {
  state.paused = true;
  toggleBtn.textContent = "Resume";
}

function resumeSimulation() {
  state.paused = false;
  toggleBtn.textContent = "Pause";
}

function computeMaxHeight() {
  // max y = y0 + vy0^2 / (2g)
  return state.y0 + (state.vy0 * state.vy0) / (2 * state.g);
}

function computeTotalTime() {
  // y(t) = y0 + vy0*t - 1/2*g*t^2 = 0
  // Solve for positive root
  const a = -0.5 * state.g;
  const b = state.vy0;
  const c = state.y0;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;

  const root1 = (-b + Math.sqrt(discriminant)) / (2 * a);
  const root2 = (-b - Math.sqrt(discriminant)) / (2 * a);

  return Math.max(root1, root2);
}

function computeRange() {
  return state.vx0 * state.totalTime;
}

// -------------------------
// Helpers
// -------------------------
function getSelectedDisplayMode() {
  for (const radio of displayModeRadios) {
    if (radio.checked) return radio.value;
  }
  return "velocity";
}

function worldY(t) {
  return state.y0 + state.vy0 * t - 0.5 * state.g * t * t;
}

function worldX(t) {
  return state.vx0 * t;
}

function clampToGround(y) {
  return y < 0 ? 0 : y;
}

function formatNumber(value, digits = 2) {
  return value.toFixed(digits);
}

function getCurrentSpeed() {
  return Math.sqrt(state.vx * state.vx + state.vy * state.vy);
}

function getCurrentAngleDeg() {
  return Math.atan2(state.vy, state.vx) * 180 / Math.PI;
}

// Scale selection based on motion size
function getWorldBounds() {
  const xMax = Math.max(state.range * 1.15, 10);
  const yMax = Math.max(state.maxHeight * 1.2, state.y0 + 2, 10);
  return { xMax, yMax };
}

function worldToCanvas(x, y) {
  const bounds = getWorldBounds();

  const usableWidth = W - marginLeft - marginRight;
  const usableHeight = H - marginTop - marginBottom;

  const px = marginLeft + (x / bounds.xMax) * usableWidth;
  const py = H - marginBottom - (y / bounds.yMax) * usableHeight;

  return { px, py };
}

// -------------------------
// Readout updates
// -------------------------
function updateReadouts() {
  state.displayMode = getSelectedDisplayMode();

  timeDisplay.textContent = `${formatNumber(state.t, 3)} s`;
  vxDisplay.textContent = `${formatNumber(state.vx, 2)} m/s`;
  vyDisplay.textContent = `${formatNumber(state.vy, 2)} m/s`;
  speedDisplay.textContent = `${formatNumber(getCurrentSpeed(), 2)} m/s`;
  angleDisplay.textContent = `${formatNumber(getCurrentAngleDeg(), 1)}°`;

  maxHeightDisplay.textContent = `${formatNumber(state.maxHeight, 2)} m`;
  rangeDisplay.textContent = `${formatNumber(state.range, 2)} m`;
  totalTimeDisplay.textContent = `${formatNumber(state.totalTime, 2)} s`;
}

// -------------------------
// Drawing
// -------------------------
function drawScene() {
  ctx.clearRect(0, 0, W, H);

  drawBackground();
  drawAxes();
  drawTrajectory();
  drawProjectile();
  drawSelectedDisplay();
}

function drawBackground() {
  // sky / main area
  ctx.fillStyle = "#fffef7";
  ctx.fillRect(0, 0, W, H);

  // ground strip
  ctx.fillStyle = "#d6b37a";
  ctx.fillRect(0, H - marginBottom, W, marginBottom);

  // ground line
  ctx.strokeStyle = "#7c5e2f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - marginBottom);
  ctx.lineTo(W, H - marginBottom);
  ctx.stroke();
}

function drawAxes() {
  const origin = worldToCanvas(0, 0);
  const bounds = getWorldBounds();

  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;

  // x-axis
  ctx.beginPath();
  ctx.moveTo(marginLeft - 10, origin.py);
  ctx.lineTo(W - marginRight + 10, origin.py);
  ctx.stroke();

  // y-axis
  ctx.beginPath();
  ctx.moveTo(origin.px, H - marginBottom + 10);
  ctx.lineTo(origin.px, marginTop - 10);
  ctx.stroke();

  // Arrowheads
  drawArrowHead(W - marginRight + 10, origin.py, 0, "#222");
  drawArrowHead(origin.px, marginTop - 10, -Math.PI / 2, "#222");

  // Tick marks
  drawTicks(bounds);

  // Axis labels
  ctx.fillStyle = "#111";
  ctx.font = "bold 22px Arial";
  ctx.fillText("x", W - marginRight - 6, origin.py + 36);
  ctx.fillText("y", origin.px - 26, marginTop - 12);

  ctx.font = "18px Arial";
  ctx.fillText("(m)", W - marginRight - 8, origin.py + 58);
  ctx.fillText("(m)", origin.px - 44, marginTop + 10);
}

function drawTicks(bounds) {
  ctx.strokeStyle = "#333";
  ctx.fillStyle = "#111";
  ctx.lineWidth = 1.5;
  ctx.font = "16px Arial";

  const xTickStep = chooseNiceTick(bounds.xMax);
  const yTickStep = chooseNiceTick(bounds.yMax);

  // x ticks
  for (let x = 0; x <= bounds.xMax + 0.0001; x += xTickStep) {
    const p = worldToCanvas(x, 0);
    ctx.beginPath();
    ctx.moveTo(p.px, p.py - 8);
    ctx.lineTo(p.px, p.py + 8);
    ctx.stroke();

    if (x > 0.0001) {
      ctx.fillText(trimTick(x), p.px - 10, p.py + 28);
    }
  }

  // y ticks
  for (let y = 0; y <= bounds.yMax + 0.0001; y += yTickStep) {
    const p = worldToCanvas(0, y);
    ctx.beginPath();
    ctx.moveTo(p.px - 8, p.py);
    ctx.lineTo(p.px + 8, p.py);
    ctx.stroke();

    if (y > 0.0001) {
      ctx.fillText(trimTick(y), p.px - 32, p.py + 6);
    }
  }
}

function chooseNiceTick(maxValue) {
  if (maxValue <= 10) return 1;
  if (maxValue <= 20) return 2;
  if (maxValue <= 50) return 5;
  if (maxValue <= 100) return 10;
  return 20;
}

function trimTick(value) {
  if (Math.abs(value - Math.round(value)) < 1e-9) {
    return String(Math.round(value));
  }
  return value.toFixed(1);
}

function drawTrajectory() {
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  ctx.beginPath();

  let started = false;

  for (let t = 0; t <= state.totalTime; t += state.totalTime / 250 || 0.01) {
    const x = worldX(t);
    const y = worldY(t);

    if (y < 0) break;

    const p = worldToCanvas(x, y);

    if (!started) {
      ctx.moveTo(p.px, p.py);
      started = true;
    } else {
      ctx.lineTo(p.px, p.py);
    }
  }

  ctx.stroke();

  // Draw actual trail
  if (state.trail.length > 1) {
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.beginPath();

    state.trail.forEach((point, index) => {
      const p = worldToCanvas(point.x, point.y);
      if (index === 0) {
        ctx.moveTo(p.px, p.py);
      } else {
        ctx.lineTo(p.px, p.py);
      }
    });

    ctx.stroke();
  }
}

function drawProjectile() {
  const p = worldToCanvas(state.x, state.y);

  // projectile
  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.arc(p.px, p.py, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#14532d";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSelectedDisplay() {
  const p = worldToCanvas(state.x, state.y);

  if (state.displayMode === "position") {
    drawPositionDisplay(p);
  } else if (state.displayMode === "velocity") {
    drawVelocityDisplay(p);
  } else if (state.displayMode === "acceleration") {
    drawAccelerationDisplay(p);
  } else if (state.displayMode === "force") {
    drawForceDisplay(p);
  } else if (state.displayMode === "energy") {
    drawEnergyDisplay(p);
  }
}

function drawPositionDisplay(p) {
  const groundPoint = worldToCanvas(state.x, 0);
  const originPoint = worldToCanvas(0, 0);

  // horizontal x component
  drawArrow(originPoint.px, originPoint.py - 20, p.px, originPoint.py - 20, "#2563eb", 3);
  // vertical y component
  drawArrow(p.px + 20, groundPoint.py, p.px + 20, p.py, "#9333ea", 3);

  ctx.fillStyle = "#111";
  ctx.font = "18px Arial";
  ctx.fillText(`x = ${formatNumber(state.x, 2)} m`, p.px + 26, originPoint.py - 28);
  ctx.fillText(`y = ${formatNumber(state.y, 2)} m`, p.px + 26, (p.py + groundPoint.py) / 2);
}

function drawVelocityDisplay(p) {
  // -----------------------------------
  // Compute a dynamic scale
  // -----------------------------------
  const speed = Math.sqrt(state.vx * state.vx + state.vy * state.vy);

  const maxArrowLength = 140;   // largest allowed resultant length in pixels
  const minScale = 8;           // keeps small vectors visible

  let scale;
  if (speed < 0.0001) {
    scale = minScale;
  } else {
    scale = Math.min(18, maxArrowLength / speed);
    scale = Math.max(scale, minScale);
  }

  const vxEndX = p.px + state.vx * scale;
  const vxEndY = p.py;

  const vyEndX = p.px;
  const vyEndY = p.py - state.vy * scale;

  const vEndX = p.px + state.vx * scale;
  const vEndY = p.py - state.vy * scale;

  // Draw component vectors and resultant
  drawArrow(p.px, p.py, vxEndX, vxEndY, "#ec4899", 3);
  drawArrow(p.px, p.py, vyEndX, vyEndY, "#8b5cf6", 3);
  drawArrow(p.px, p.py, vEndX, vEndY, "#f59e0b", 4);

  // Label resultant vector
  ctx.fillStyle = "#111";
  ctx.font = "18px Arial";
  ctx.fillText("v", vEndX + 8, vEndY - 8);

  
  
  // -----------------------------------
  // Draw the small angle arc
  // -----------------------------------
  const drawAngle = Math.atan2(-state.vy, state.vx);
  const radius = 30;

  ctx.beginPath();
  ctx.strokeStyle = "#06b6d4";
  ctx.lineWidth = 3;

  if (drawAngle >= 0) {
    ctx.arc(p.px, p.py, radius, 0, drawAngle, false);
  } else {
    ctx.arc(p.px, p.py, radius, 0, drawAngle, true);
  }

  ctx.stroke();

  // -----------------------------------
  // Draw angle label
  // -----------------------------------
  const physicsAngleDeg = Math.atan2(state.vy, state.vx) * 180 / Math.PI;
  const midAngle = drawAngle / 2;
  const labelRadius = radius + 18;

  const labelX = p.px + labelRadius * Math.cos(midAngle);
  const labelY = p.py + labelRadius * Math.sin(midAngle);

  ctx.fillStyle = "#111";
  ctx.font = "16px Arial";
  ctx.fillText(`${physicsAngleDeg.toFixed(1)}°`, labelX, labelY);
}

function drawAccelerationDisplay(p) {
  const magnitude = state.g;
  const maxArrowLength = 110;
  const scale = maxArrowLength / Math.max(magnitude, 0.0001);

  // acceleration is downward
  const endX = p.px;
  const endY = p.py + magnitude * scale;

  drawArrow(p.px, p.py, endX, endY, "#dc2626", 4);

  let labelX = p.px + 18;
  let labelY = p.py + 26;

  if (labelX > W - 180) labelX = p.px - 175;
  if (labelY > H - 20) labelY = p.py - 12;

  ctx.fillStyle = "#111";
  ctx.font = "16px Arial";
  ctx.fillText(`a = ${formatNumber(state.g, 2)} m/s² downward`, labelX, labelY);
}

function drawForceDisplay(p) {
  const weight = state.mass * state.g;
  const maxArrowLength = 110;
  const scale = maxArrowLength / Math.max(weight, 0.0001);

  // force is downward
  const endX = p.px;
  const endY = p.py + weight * scale;

  drawArrow(p.px, p.py, endX, endY, "#0f766e", 4);

  let labelX = p.px + 18;
  let labelY = p.py + 26;

  if (labelX > W - 150) labelX = p.px - 145;
  if (labelY > H - 20) labelY = p.py - 12;

  ctx.fillStyle = "#111";
  ctx.font = "16px Arial";
  ctx.fillText(`F = mg = ${formatNumber(weight, 2)} N`, labelX, labelY);
}

function drawEnergyDisplay(p) {
  const ke = 0.5 * state.mass * getCurrentSpeed() * getCurrentSpeed();
  const pe = state.mass * state.g * state.y;
  const total = ke + pe;

  const boxW = 190;
  const boxH = 84;

  let boxX = p.px + 20;
  let boxY = p.py - 95;

  // keep box inside canvas
  if (boxX + boxW > W - 10) boxX = p.px - boxW - 20;
  if (boxX < 10) boxX = 10;

  if (boxY < 10) boxY = p.py + 20;
  if (boxY + boxH > H - 10) boxY = H - boxH - 10;

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = "#111";
  ctx.font = "16px Arial";
  ctx.fillText(`KE = ${formatNumber(ke, 2)} J`, boxX + 10, boxY + 24);
  ctx.fillText(`PE = ${formatNumber(pe, 2)} J`, boxX + 10, boxY + 46);
  ctx.fillText(`E = ${formatNumber(total, 2)} J`, boxX + 10, boxY + 68);
}
function drawArrow(x1, y1, x2, y2, color, lineWidth = 3) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  const angle = Math.atan2(y2 - y1, x2 - x1);
  drawArrowHead(x2, y2, angle, color);
}

function drawArrowHead(x, y, angle, color) {
  const headLength = 12;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - headLength * Math.cos(angle - Math.PI / 6),
    y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x - headLength * Math.cos(angle + Math.PI / 6),
    y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

// -------------------------
// Animation
// -------------------------
let lastTimestamp = null;

function animate(timestamp) {
  if (lastTimestamp === null) {
    lastTimestamp = timestamp;
  }

  const dtMs = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  let dt = dtMs / 1000;

  if (slowMotionCheckbox.checked) {
    dt *= 0.25;
  }

  if (state.running && !state.paused && !state.finished) {
    state.t += dt;

    state.x = worldX(state.t);
    state.y = worldY(state.t);
    state.vx = state.vx0;
    state.vy = state.vy0 - state.g * state.t;

    if (state.y <= 0) {
      state.y = 0;
      state.t = state.totalTime;
      state.x = state.range;
      state.vx = state.vx0;
      state.vy = state.vy0 - state.g * state.t;

      state.finished = true;
      state.running = false;
      state.paused = false;
      toggleBtn.textContent = "Start";
    }

    state.trail.push({ x: state.x, y: state.y });
  }

  updateReadouts();
  drawScene();

  requestAnimationFrame(animate);
}

// -------------------------
// Events
// -------------------------
resetBtn.addEventListener("click", () => {
  resetSimulation();
});

toggleBtn.addEventListener("click", () => {
  if (!state.running && !state.finished) {
    startSimulation();
  } else if (state.running && !state.paused) {
    pauseSimulation();
  } else if (state.running && state.paused) {
    resumeSimulation();
  } else if (state.finished) {
    resetSimulation();
    startSimulation();
  }
});

displayModeRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    state.displayMode = getSelectedDisplayMode();
    drawScene();
  });
});

[heightInput, speedInput, angleInput, massInput, gravityInput].forEach(input => {
  input.addEventListener("change", () => {
    if (!state.running || state.finished) {
      resetSimulation();
    }
  });
});

// -------------------------
// Initialize
// -------------------------
resetSimulation();
requestAnimationFrame(animate);
