const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const metalSelect = document.getElementById("metalSelect");
const wavelengthSlider = document.getElementById("wavelengthSlider");
const intensitySlider = document.getElementById("intensitySlider");
const voltageSlider = document.getElementById("voltageSlider");
const showElectronsCheckbox = document.getElementById("showElectronsCheckbox");

const wavelengthValue = document.getElementById("wavelengthValue");
const intensityValue = document.getElementById("intensityValue");
const voltageValue = document.getElementById("voltageValue");

const photonEnergyDisplay = document.getElementById("photonEnergyDisplay");
const workFunctionDisplay = document.getElementById("workFunctionDisplay");
const thresholdDisplay = document.getElementById("thresholdDisplay");
const keDisplay = document.getElementById("keDisplay");
const currentDisplay = document.getElementById("currentDisplay");

const spectrumPointer = document.getElementById("spectrumPointer");

const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");

/* -------------------------------------------------------
   Approximate work functions in electron volts
------------------------------------------------------- */
const metals = {
  cesium:    { name: "Cesium",    phi: 2.14 },
  potassium: { name: "Potassium", phi: 2.30 },
  sodium:    { name: "Sodium",    phi: 2.28 },
  zinc:      { name: "Zinc",      phi: 4.30 },
  copper:    { name: "Copper",    phi: 4.70 }
};

/* -------------------------------------------------------
   Physical constants / model assumptions
------------------------------------------------------- */
const PHYS = {
  c: 2.998e8,          // m/s
  h: 6.626e-34,        // J·s
  eCharge: 1.602e-19,  // C
  evToJ: 1.602e-19,    // J per eV

  /*
    Assumed maximum optical power actually reaching the metal
    when the intensity slider is at 100%.
    You can adjust this if you want larger or smaller realistic currents.
  */
  maxOpticalPowerW: 1.0e-6, // 1 microwatt

  /*
    Assumed quantum efficiency.
    Example: 0.10 means 10% of above-threshold incident photons
    produce emitted electrons.
  */
  quantumEfficiency: 0.10
};

const state = {
  metalKey: "sodium",
  wavelength: 550,
  intensity: 55,
  voltage: 0,
  showElectrons: true,
  paused: false,
  electrons: [],
  spawnAccumulator: 0,

  collectorHitsThisFrame: 0,
  collectorHitRate: 0,
  displayCurrentUA: 0
};

/* -------------------------------------------------------
   Simulation geometry
------------------------------------------------------- */
const tube = {
  x: 140,
  y: 160,
  w: 620,
  h: 220
};

const emitterPlate = {
  x: tube.x + 40,
  y: tube.y + 22,
  w: 18,
  h: tube.h - 44
};

const collectorPlate = {
  x: tube.x + tube.w - 58,
  y: tube.y + 22,
  w: 18,
  h: tube.h - 44
};

let lastTime = 0;

/* -------------------------------------------------------
   Helper functions
------------------------------------------------------- */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function photonEnergyEV(wavelengthNm) {
  return 1240 / wavelengthNm;
}

function thresholdWavelengthNm(phi) {
  return 1240 / phi;
}

/* Visible spectrum approximation */
function wavelengthToRGB(wavelength) {
  let r = 0;
  let g = 0;
  let b = 0;

  if (wavelength >= 380 && wavelength < 440) {
    r = -(wavelength - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelength >= 440 && wavelength < 490) {
    r = 0;
    g = (wavelength - 440) / (490 - 440);
    b = 1;
  } else if (wavelength >= 490 && wavelength < 510) {
    r = 0;
    g = 1;
    b = -(wavelength - 510) / (510 - 490);
  } else if (wavelength >= 510 && wavelength < 580) {
    r = (wavelength - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelength >= 580 && wavelength < 645) {
    r = 1;
    g = -(wavelength - 645) / (645 - 580);
    b = 0;
  } else if (wavelength >= 645 && wavelength <= 780) {
    r = 1;
    g = 0;
    b = 0;
  }

  let factor = 1;
  if (wavelength >= 380 && wavelength < 420) {
    factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if (wavelength > 700 && wavelength <= 780) {
    factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  } else if (wavelength < 380 || wavelength > 780) {
    factor = 0.18;
  }

  const gamma = 0.8;

  const to255 = (c) => {
    if (c <= 0) return 0;
    return Math.round(255 * Math.pow(c * factor, gamma));
  };

  return {
    r: to255(r),
    g: to255(g),
    b: to255(b)
  };
}

function rgbString(rgb, alpha = 1) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/*
  Returns the fraction of emitted electrons that should make it
  to the collector, based on the voltage.

  Convention in this app:
  - positive voltage helps electrons
  - negative voltage retards electrons

  We assume emitted electrons have KE values spread roughly from 0 to KE_max.
*/
function collectionFraction(keMax, voltage) {
  if (keMax <= 0) return 0;

  if (voltage >= 0) return 1;

  const barrierEV = -voltage;

  if (barrierEV >= keMax) return 0;

  return clamp((keMax - barrierEV) / keMax, 0, 1);
}

function getPhysics() {
  const metal = metals[state.metalKey];
  const phi = metal.phi;
  const ePhoton = photonEnergyEV(state.wavelength);
  const threshold = thresholdWavelengthNm(phi);
  const keMax = Math.max(0, ePhoton - phi);
  const emissionOccurs = ePhoton >= phi;

  const lambdaM = state.wavelength * 1e-9;
  const frequency = PHYS.c / lambdaM;
  const photonEnergyJ = PHYS.h * frequency;
  const phiJ = phi * PHYS.evToJ;

  const opticalPowerW = (state.intensity / 100) * PHYS.maxOpticalPowerW;

  const collectedFraction = emissionOccurs
    ? collectionFraction(keMax, state.voltage)
    : 0;

  let photonRate = 0;
  let emittedElectronsPerSecond = 0;
  let collectedElectronsPerSecond = 0;
  let targetCurrentA = 0;

  if (emissionOccurs) {
    photonRate = opticalPowerW / photonEnergyJ;

    emittedElectronsPerSecond =
      PHYS.quantumEfficiency * photonRate;

    collectedElectronsPerSecond =
      emittedElectronsPerSecond * collectedFraction;

    targetCurrentA =
      collectedElectronsPerSecond * PHYS.eCharge;
  }

  const targetCurrentUA = targetCurrentA * 1e6;

  /*
    Separate visual emission rate for animation only.
    This is not the real electron count from the current model.
  */
  const emittedRate = emissionOccurs ? (state.intensity / 100) * 12 : 0;

  return {
    phi,
    phiJ,
    ePhoton,
    threshold,
    keMax,
    emissionOccurs,
    emittedRate,

    frequency,
    photonEnergyJ,
    opticalPowerW,
    photonRate,
    collectedFraction,
    emittedElectronsPerSecond,
    collectedElectronsPerSecond,
    targetCurrentA,
    targetCurrentUA
  };
}

function resetCurrentMeter() {
  state.collectorHitsThisFrame = 0;
  state.collectorHitRate = 0;
  state.displayCurrentUA = 0;
}

/* -------------------------------------------------------
   UI updates
------------------------------------------------------- */
function updateControls() {
  const physics = getPhysics();

  wavelengthValue.textContent = state.wavelength;
  intensityValue.textContent = state.intensity;
  voltageValue.textContent = Number(state.voltage).toFixed(2);

  photonEnergyDisplay.textContent = `${physics.ePhoton.toFixed(2)} eV`;
  workFunctionDisplay.textContent = `${physics.phi.toFixed(2)} eV`;
  thresholdDisplay.textContent = `${physics.threshold.toFixed(0)} nm`;
  keDisplay.textContent = `${physics.keMax.toFixed(2)} eV`;
  currentDisplay.textContent = `${state.displayCurrentUA.toFixed(3)} μA`;

  updateSpectrumPointer();
}

function updateDynamicReadouts() {
  currentDisplay.textContent = `${state.displayCurrentUA.toFixed(3)} μA`;
}

function updateSpectrumPointer() {
  const min = Number(wavelengthSlider.min);
  const max = Number(wavelengthSlider.max);
  const fraction = (state.wavelength - min) / (max - min);

  const spectrumBar = document.querySelector(".spectrum-bar");
  if (!spectrumBar) return;

  const rect = spectrumBar.getBoundingClientRect();
  const width = rect.width || wavelengthSlider.getBoundingClientRect().width || 300;

  spectrumPointer.style.left = `${fraction * width}px`;
}

/* -------------------------------------------------------
   Electron logic
------------------------------------------------------- */
function spawnElectrons(dt) {
  const physics = getPhysics();

  if (!physics.emissionOccurs) return;
  if (!state.showElectrons) return;

  state.spawnAccumulator += physics.emittedRate * dt;

  while (state.spawnAccumulator >= 1) {
    state.spawnAccumulator -= 1;

    const startX = emitterPlate.x + emitterPlate.w + 6;

    let startY = null;
    let foundSpot = false;

    for (let tries = 0; tries < 12; tries++) {
      const candidateY = clamp(
        emitterPlate.y + 14 + Math.random() * (emitterPlate.h - 28),
        tube.y + 18,
        tube.y + tube.h - 18
      );

      let tooClose = false;

      for (const e of state.electrons) {
        const dx = e.x - startX;
        const dy = e.y - candidateY;

        if (Math.abs(dx) < 18 && Math.abs(dy) < 12) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        startY = candidateY;
        foundSpot = true;
        break;
      }
    }

    if (!foundSpot) continue;

    const keInitial = Math.random() * physics.keMax;

    const speedScale = 170;
    const vx0 = speedScale * Math.sqrt(Math.max(keInitial, 0));

    state.electrons.push({
      x: startX,
      y: startY,
      vx: vx0,
      vy: (Math.random() - 0.5) * 6,
      ax: 0,
      r: 4,
      alive: true,
      hasTurned: false,
      keInitial: keInitial
    });
  }
}

function updateElectrons(dt) {
  const gapStart = emitterPlate.x + emitterPlate.w + 6;
  const gapEnd = collectorPlate.x - 4;
  const gapDistance = gapEnd - gapStart;

  const SPEED_SCALE = 170;
  const axInGap = (SPEED_SCALE * SPEED_SCALE * state.voltage) / (2 * gapDistance);

  state.collectorHitsThisFrame = 0;

  for (const electron of state.electrons) {
    if (!electron.alive) continue;

    if (electron.x >= gapStart && electron.x <= gapEnd) {
      electron.ax = axInGap;
    } else {
      electron.ax = 0;
    }

    electron.vx += electron.ax * dt;
    electron.x += electron.vx * dt;
    electron.y += electron.vy * dt;

    if (electron.vx < 0) {
      electron.hasTurned = true;
    }

    if (electron.y < tube.y + 14) {
      electron.y = tube.y + 14;
      electron.vy *= -0.25;
    }

    if (electron.y > tube.y + tube.h - 14) {
      electron.y = tube.y + tube.h - 14;
      electron.vy *= -0.25;
    }

    if (electron.x >= gapEnd && electron.vx >= 0) {
      electron.x = gapEnd;
      electron.alive = false;
      state.collectorHitsThisFrame += 1;
      continue;
    }

    if (electron.x <= gapStart && electron.vx < 0) {
      electron.x = gapStart;
      electron.alive = false;
      continue;
    }

    if (electron.x < tube.x - 50 || electron.x > tube.x + tube.w + 50) {
      electron.alive = false;
      continue;
    }
  }

  state.electrons = state.electrons.filter(e => e.alive);

  const instantHitRate = dt > 0 ? state.collectorHitsThisFrame / dt : 0;
  const rateSmoothing = clamp(dt * 6, 0, 1);
  state.collectorHitRate += (instantHitRate - state.collectorHitRate) * rateSmoothing;

  /*
    Current is now driven by the physical current model, not by
    random visual electron arrivals.
  */
  const physics = getPhysics();
  const currentSmoothing = clamp(dt * 4, 0, 1);
  state.displayCurrentUA += (physics.targetCurrentUA - state.displayCurrentUA) * currentSmoothing;
}

/* -------------------------------------------------------
   Drawing
------------------------------------------------------- */
function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#eef3f8");
  grad.addColorStop(1, "#d5e0ea");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawLampAndBeam() {
  const lightRGB = wavelengthToRGB(state.wavelength);

  ctx.lineWidth = 12;
  ctx.strokeStyle = "#92712c";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(640, 72);
  ctx.lineTo(430, 72);
  ctx.stroke();

  ctx.save();
  ctx.translate(390, 72);
  ctx.rotate(-0.78);

  const lampGrad = ctx.createLinearGradient(-10, -35, 30, 35);
  lampGrad.addColorStop(0, "#050608");
  lampGrad.addColorStop(0.5, "#2a2f35");
  lampGrad.addColorStop(1, "#090a0d");

  ctx.fillStyle = lampGrad;
  ctx.fillRect(-18, -60, 36, 80);

  ctx.fillStyle = "#171a1f";
  ctx.beginPath();
  ctx.moveTo(-34, 6);
  ctx.lineTo(34, 6);
  ctx.lineTo(20, 28);
  ctx.lineTo(-20, 28);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#5c636d";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  const alpha = 0.14 + (state.intensity / 100) * 0.18;
  ctx.fillStyle = rgbString(lightRGB, alpha);
  ctx.beginPath();
  ctx.moveTo(384, 102);
  ctx.lineTo(emitterPlate.x + 10, emitterPlate.y + 28);
  ctx.lineTo(emitterPlate.x + 10, emitterPlate.y + emitterPlate.h - 28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = rgbString(lightRGB, alpha + 0.07);
  ctx.beginPath();
  ctx.moveTo(384, 102);
  ctx.lineTo(emitterPlate.x + 10, emitterPlate.y + 82);
  ctx.lineTo(emitterPlate.x + 10, emitterPlate.y + emitterPlate.h - 82);
  ctx.closePath();
  ctx.fill();
}

function drawTube() {
  ctx.save();

  const bodyGrad = ctx.createLinearGradient(tube.x, tube.y, tube.x, tube.y + tube.h);
  bodyGrad.addColorStop(0, "rgba(255,255,255,0.35)");
  bodyGrad.addColorStop(0.5, "rgba(255,255,255,0.10)");
  bodyGrad.addColorStop(1, "rgba(170,190,210,0.18)");

  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = "rgba(40,55,70,0.85)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.roundRect(tube.x, tube.y, tube.w, tube.h, 18);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(40,55,70,0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(tube.x, tube.y + tube.h / 2, 12, tube.h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(tube.x + tube.w, tube.y + tube.h / 2, 12, tube.h / 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.24)";
  ctx.fillRect(tube.x + 18, tube.y + 18, tube.w - 36, 10);

  ctx.restore();
}

function drawPlates() {
  ctx.fillStyle = "#7b5a1e";
  ctx.fillRect(emitterPlate.x, emitterPlate.y, emitterPlate.w, emitterPlate.h);

  ctx.fillStyle = "#c0a25c";
  ctx.fillRect(emitterPlate.x + 2, emitterPlate.y, 5, emitterPlate.h);

  ctx.fillStyle = "#9a7a30";
  ctx.fillRect(collectorPlate.x, collectorPlate.y, collectorPlate.w, collectorPlate.h);

  ctx.fillStyle = "#d0b46b";
  ctx.fillRect(collectorPlate.x + 2, collectorPlate.y, 5, collectorPlate.h);
}

function drawWireCircuit() {
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#9a7d38";

  ctx.beginPath();
  ctx.moveTo(emitterPlate.x, emitterPlate.y + emitterPlate.h / 2);
  ctx.lineTo(54, emitterPlate.y + emitterPlate.h / 2);
  ctx.lineTo(54, 468);
  ctx.lineTo(342, 468);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(collectorPlate.x + collectorPlate.w, collectorPlate.y + collectorPlate.h / 2);
  ctx.lineTo(828, collectorPlate.y + collectorPlate.h / 2);
  ctx.lineTo(828, 468);
  ctx.lineTo(748, 468);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(560, 468);
  ctx.lineTo(748, 468);
  ctx.stroke();

  const batteryX = 342;
  const batteryY = 428;
  const batteryW = 218;
  const batteryH = 72;

  const batteryGrad = ctx.createLinearGradient(batteryX, batteryY, batteryX + batteryW, batteryY);
  batteryGrad.addColorStop(0, "#2b2f34");
  batteryGrad.addColorStop(0.52, "#8f949a");
  batteryGrad.addColorStop(0.53, "#af8f38");
  batteryGrad.addColorStop(1, "#8f7229");

  ctx.fillStyle = batteryGrad;
  ctx.fillRect(batteryX, batteryY, batteryW, batteryH);

  ctx.strokeStyle = "#454c54";
  ctx.lineWidth = 2;
  ctx.strokeRect(batteryX, batteryY, batteryW, batteryH);

  const sliderMinX = batteryX + 32;
  const sliderMaxX = batteryX + 132;
  const frac = (state.voltage - Number(voltageSlider.min)) /
               (Number(voltageSlider.max) - Number(voltageSlider.min));
  const knobX = sliderMinX + frac * (sliderMaxX - sliderMinX);

  ctx.fillStyle = "#30363c";
  ctx.fillRect(sliderMinX, batteryY + 50, sliderMaxX - sliderMinX, 14);

  ctx.fillStyle = "#c5ccd4";
  ctx.fillRect(knobX - 8, batteryY + 44, 16, 26);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "24px Courier New";
  ctx.fillText(`${state.voltage.toFixed(2)} V`, batteryX + 58, batteryY + 38);
}

function drawCurrentMeter() {
  const meterX = 60;
  const meterY = 426;
  const meterW = 180;
  const meterH = 70;

  ctx.fillStyle = "#10151b";
  ctx.fillRect(meterX, meterY, meterW, meterH);
  ctx.strokeStyle = "#3f5163";
  ctx.lineWidth = 2;
  ctx.strokeRect(meterX, meterY, meterW, meterH);

  ctx.fillStyle = "#ffe867";
  ctx.font = "bold 18px Arial";
  ctx.fillText("Current", meterX + 14, meterY + 24);

  ctx.font = "bold 26px Courier New";
  ctx.fillText(`${state.displayCurrentUA.toFixed(3)} μA`, meterX + 14, meterY + 55);
}

function drawLabels() {
  const physics = getPhysics();

  ctx.fillStyle = "#1c2732";
  ctx.fillRect(120, 28, 210, 42);
  ctx.strokeStyle = "#4f667d";
  ctx.strokeRect(120, 28, 210, 42);

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px Arial";
  ctx.fillText(`Emitter Metal: ${metals[state.metalKey].name}`, 135, 55);

  ctx.fillStyle = physics.emissionOccurs ? "#173d16" : "#4a1e1e";
  ctx.fillRect(350, 28, 250, 42);
  ctx.strokeStyle = physics.emissionOccurs ? "#54b04c" : "#d16c6c";
  ctx.strokeRect(350, 28, 250, 42);

  ctx.fillStyle = "#ffffff";
  ctx.font = "17px Arial";
  ctx.fillText(
    physics.emissionOccurs ? "Photoelectrons emitted" : "No emission: above threshold",
    365,
    55
  );
}

function drawElectrons() {
  if (!state.showElectrons) return;

  for (const electron of state.electrons) {
    const movingLeft = electron.hasTurned || electron.vx < 0;

    ctx.beginPath();
    ctx.strokeStyle = movingLeft
      ? "rgba(255, 180, 120, 0.30)"
      : "rgba(126, 211, 255, 0.25)";
    ctx.lineWidth = 2;

    if (movingLeft) {
      ctx.moveTo(electron.x + 10, electron.y);
      ctx.lineTo(electron.x, electron.y);
    } else {
      ctx.moveTo(electron.x - 10, electron.y);
      ctx.lineTo(electron.x, electron.y);
    }
    ctx.stroke();

    const grad = ctx.createRadialGradient(
      electron.x - 1,
      electron.y - 1,
      1,
      electron.x,
      electron.y,
      electron.r + 2
    );

    if (movingLeft) {
      grad.addColorStop(0, "#fff4e8");
      grad.addColorStop(0.25, "#ffd0a6");
      grad.addColorStop(1, "#f28a2e");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, "#bff0ff");
      grad.addColorStop(1, "#3ca6e8");
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(electron.x, electron.y, electron.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = movingLeft ? "#9a4e12" : "#1f5e85";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawScene() {
  drawBackground();
  drawLampAndBeam();
  drawTube();
  drawPlates();
  drawWireCircuit();
  drawCurrentMeter();
  drawLabels();
  drawElectrons();
}

function clearElectronStream() {
  state.electrons = [];
  state.spawnAccumulator = 0;
  resetCurrentMeter();
}

/* -------------------------------------------------------
   Main loop
------------------------------------------------------- */
function animate(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.03);
  lastTime = timestamp;

  if (!state.paused) {
    spawnElectrons(dt);
    updateElectrons(dt);
  }

  updateDynamicReadouts();
  drawScene();
  requestAnimationFrame(animate);
}

/* -------------------------------------------------------
   Event listeners
------------------------------------------------------- */
metalSelect.addEventListener("change", function () {
  state.metalKey = metalSelect.value;
  clearElectronStream();
  updateControls();
});

wavelengthSlider.addEventListener("input", function () {
  state.wavelength = Number(wavelengthSlider.value);
  clearElectronStream();
  updateControls();
});

intensitySlider.addEventListener("input", function () {
  state.intensity = Number(intensitySlider.value);
  updateControls();
});

voltageSlider.addEventListener("input", function () {
  state.voltage = Number(voltageSlider.value);
  updateControls();
});

showElectronsCheckbox.addEventListener("change", function () {
  state.showElectrons = showElectronsCheckbox.checked;
});

pauseBtn.addEventListener("click", function () {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? "Resume" : "Pause";
});

resetBtn.addEventListener("click", function () {
  state.electrons = [];
  state.spawnAccumulator = 0;
  state.paused = false;
  pauseBtn.textContent = "Pause";

  state.metalKey = "sodium";
  state.wavelength = 550;
  state.intensity = 55;
  state.voltage = 0;
  state.showElectrons = true;

  metalSelect.value = state.metalKey;
  wavelengthSlider.value = state.wavelength;
  intensitySlider.value = state.intensity;
  voltageSlider.value = state.voltage;
  showElectronsCheckbox.checked = true;

  resetCurrentMeter();
  updateControls();
});

window.addEventListener("resize", updateSpectrumPointer);

/* -------------------------------------------------------
   Startup
------------------------------------------------------- */
updateControls();
requestAnimationFrame(() => {
  updateSpectrumPointer();
  requestAnimationFrame(animate);
});