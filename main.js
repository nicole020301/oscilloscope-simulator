import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { OculusHandModel } from "three/examples/jsm/webxr/OculusHandModel.js";

// =============================================================================
//  XR HANDS-ON TRAINING – OSCILLOSCOPE
//  Students learn to operate a digital oscilloscope in an immersive virtual
//  lab without needing access to a physical instrument.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
//  OSCILLOSCOPE STATE  (all parameters the user can change)
// ─────────────────────────────────────────────────────────────────────────────
const TIMEBASE_VALUES = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20]; // ms/div
const VDIV_VALUES     = [0.1, 0.2, 0.5, 1, 2, 5];          // V/div
const TRIGGER_VALUES  = [-3, -2, -1, 0, 1, 2, 3];          // div offset

const oscState = {
  power:          false,           // oscilloscope powered on?
  probeConnected: false,           // probe plugged into CH1?
  waveform:       "sine",         // "sine" | "square" | "triangle"
  frequency:      1000,            // Hz  (signal generator)
  amplitude:      3.0,             // V   (peak)
  timebaseIdx:    3,               // index into TIMEBASE_VALUES  → 1 ms/div
  vdivIdx:        3,               // index into VDIV_VALUES      → 1 V/div
  triggerIdx:     3,               // index into TRIGGER_VALUES   → 0 div
  isRunning:      true,            // RUN vs STOP
  currentStep:    0,               // 0-based tutorial step
};

// Probe grab state (desktop drag-and-plug)
let probeGrabbed = false;
const _probeDragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _probeDragHit   = new THREE.Vector3();

// Tutorial steps: id, title, instruction, which control to highlight
const STEPS = [
  { id: 0, title: "Step 1 – Power On",      desc: "Press the POWER button (top-left) to turn the oscilloscope on.",                    highlight: "power"    },
  { id: 1, title: "Step 2 – Connect Probe", desc: "Press the CH1 BNC port to plug a probe in. The screen will show a live signal.",    highlight: "ch1"      },
  { id: 2, title: "Step 3 – Select Signal", desc: "Use the WAVE buttons to choose Sine, Square, or Triangle input signal.",            highlight: "wave"     },
  { id: 3, title: "Step 4 – Set Timebase",  desc: "Click the TIMEBASE knob to cycle through ms/div values and zoom the waveform.",    highlight: "timebase" },
  { id: 4, title: "Step 5 – Set V/DIV",     desc: "Click the V/DIV knob to scale the voltage axis so the signal fills the screen.",   highlight: "vdiv"     },
  { id: 5, title: "Step 6 – Set Trigger",   desc: "Click the TRIGGER knob to move the trigger level line. Stable display = success!", highlight: "trigger"  },
  { id: 6, title: "Step 7 – Run / Stop",    desc: "Press RUN/STOP to freeze the waveform for inspection. Press again to resume.",     highlight: "runstop"  },
  { id: 7, title: "Complete!",              desc: "You have completed the oscilloscope training. All controls have been operated.",    highlight: ""         },
];

// ─────────────────────────────────────────────────────────────────────────────
//  THREE.JS SCENE
// ─────────────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8eff5);
scene.fog = new THREE.Fog(0xe8eff5, 12, 30);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 1.55, 1.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { requiredFeatures: ["hand-tracking"] }));

// OrbitControls (desktop preview)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 1.05, -0.3);
controls.minDistance = 0.3;
controls.maxDistance = 4;

// ─────────────────────────────────────────────────────────────────────────────
//  LIGHTING
// ─────────────────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 3.0));

const ceiling1 = new THREE.PointLight(0xfff8f0, 3.5, 16);
ceiling1.position.set(0, 3.2, 0);
scene.add(ceiling1);

const ceiling2 = new THREE.PointLight(0xd0e8ff, 2.0, 12);
ceiling2.position.set(0, 3.2, -1);
scene.add(ceiling2);

const benchSpot = new THREE.SpotLight(0xffffff, 3.0, 8, Math.PI / 5, 0.4);
benchSpot.position.set(0, 2.4, 0.2);
benchSpot.target.position.set(0, 1.0, -0.3);
scene.add(benchSpot);
scene.add(benchSpot.target);

// ─────────────────────────────────────────────────────────────────────────────
//  LAB ROOM
// ─────────────────────────────────────────────────────────────────────────────
// Tiled floor (light grey with subtle grid)
{
  const floorCv = document.createElement("canvas"); floorCv.width = 512; floorCv.height = 512;
  const fc = floorCv.getContext("2d");
  fc.fillStyle = "#d4dde6"; fc.fillRect(0, 0, 512, 512);
  fc.strokeStyle = "#b0bcc8"; fc.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    fc.beginPath(); fc.moveTo(i, 0); fc.lineTo(i, 512); fc.stroke();
    fc.beginPath(); fc.moveTo(0, i); fc.lineTo(512, i); fc.stroke();
  }
  const floorTex = new THREE.CanvasTexture(floorCv);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(6, 6);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
}

// Back wall – clinical white
const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 5),
  new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.8 })
);
backWall.position.set(0, 2.5, -3.5);
scene.add(backWall);

// Left wall
const lWall = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 5),
  new THREE.MeshStandardMaterial({ color: 0xf0f3f6, roughness: 0.8 })
);
lWall.rotation.y = Math.PI / 2;
lWall.position.set(-3, 2.5, -0.5);
scene.add(lWall);

// Right wall
const rWall = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 5),
  new THREE.MeshStandardMaterial({ color: 0xf0f3f6, roughness: 0.8 })
);
rWall.rotation.y = -Math.PI / 2;
rWall.position.set(3, 2.5, -0.5);
scene.add(rWall);

// Ceiling
const ceil = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({ color: 0xfafcff, roughness: 1 })
);
ceil.rotation.x = Math.PI / 2;
ceil.position.y = 3.5;
scene.add(ceil);

// Fluorescent ceiling light strips
[[-1.2, 0], [1.2, 0], [0, -1.5]].forEach(([lx, lz]) => {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.02, 1.0),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  strip.position.set(lx, 3.49, lz);
  scene.add(strip);
  const glow = new THREE.PointLight(0xfff8f0, 1.5, 5);
  glow.position.set(lx, 3.3, lz);
  scene.add(glow);
});

// ── LAB BENCH ─────────────────────────────────────────────────────────────────
const BENCH_Y  = 0.90;   // top surface Y
const BENCH_TH = 0.06;   // thickness
// Bench surface – spans full width to hold both panels + oscilloscope
const benchSurface = new THREE.Mesh(
  new THREE.BoxGeometry(3.0, BENCH_TH, 0.80),
  new THREE.MeshStandardMaterial({ color: 0xd8e4ee, roughness: 0.4, metalness: 0.1 })
);
benchSurface.position.set(0, BENCH_Y - BENCH_TH / 2, -0.3);
scene.add(benchSurface);
// Bench legs
const bLegMat = new THREE.MeshStandardMaterial({ color: 0xa8b8c8, roughness: 0.5, metalness: 0.5 });
[[-1.4, -0.05], [1.4, -0.05], [-1.4, -0.65], [1.4, -0.65]].forEach(([lx, lz]) => {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, BENCH_Y - BENCH_TH, 0.05), bLegMat);
  leg.position.set(lx, (BENCH_Y - BENCH_TH) / 2, lz);
  scene.add(leg);
});
// Bench side panels
[-1.42, 1.42].forEach(sx => {
  const side = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, BENCH_Y - BENCH_TH, 0.80),
    new THREE.MeshStandardMaterial({ color: 0xc0cedd, roughness: 0.4 })
  );
  side.position.set(sx, (BENCH_Y - BENCH_TH) / 2, -0.3);
  scene.add(side);
});

// ─────────────────────────────────────────────────────────────────────────────
//  WALL POSTER
// ─────────────────────────────────────────────────────────────────────────────
function makePoster() {
  const W = 800, H = 440;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.fillStyle = "#0a0e1a"; c.fillRect(0, 0, W, H);
  c.strokeStyle = "#00ccff"; c.lineWidth = 5;
  c.strokeRect(8, 8, W - 16, H - 16);

  c.fillStyle = "#00ccff"; c.font = "bold 42px Arial"; c.textAlign = "center";
  c.fillText("XR OSCILLOSCOPE TRAINING", W / 2, 62);

  c.strokeStyle = "#1a2040"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(30, 80); c.lineTo(W - 30, 80); c.stroke();

  c.fillStyle = "#88ccff"; c.font = "22px Arial";
  [
    "A digital oscilloscope displays voltage waveforms over time.",
    "Use it to measure frequency, amplitude, and signal shape.",
    "All lab instruments are virtual — interact safely in XR.",
    "",
    "Timebase (ms/div)  ·  V/DIV  ·  Trigger  ·  RUN/STOP",
  ].forEach((t, i) => c.fillText(t, W / 2, 130 + i * 48));

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })
  );
  mesh.position.set(0, 2.4, -3.48);
  scene.add(mesh);
}
makePoster();

// ─────────────────────────────────────────────────────────────────────────────
//  OSCILLOSCOPE SCREEN DRAWING
// ─────────────────────────────────────────────────────────────────────────────
//  Canvas used for the live screen — updated every frame
const SCREEN_W = 512, SCREEN_H = 320;
const screenCanvas = document.createElement("canvas");
screenCanvas.width = SCREEN_W; screenCanvas.height = SCREEN_H;
const screenCtx = screenCanvas.getContext("2d");
const screenTexture = new THREE.CanvasTexture(screenCanvas);

// Frozen frame buffer for STOP mode
let frozenImageData = null;

function drawScreen(phase) {
  const c = screenCtx;
  const W = SCREEN_W, H = SCREEN_H;

  // Background
  c.fillStyle = "#020d08";
  c.fillRect(0, 0, W, H);

  if (!oscState.power) {
    // Powered-off state – faint glow
    c.fillStyle = "#0a0f0b";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(0,200,100,0.12)";
    c.font = "bold 28px monospace";
    c.textAlign = "center";
    c.fillText("-- POWER OFF --", W / 2, H / 2);
    screenTexture.needsUpdate = true;
    return;
  }

  if (!oscState.probeConnected) {
    // No probe – show flat line with message
    c.fillStyle = "#020d08"; c.fillRect(0, 0, W, H);
    drawGraticule(c, W, H);
    // Flat zero line
    c.strokeStyle = "#00cc66"; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
    c.fillStyle = "rgba(0,220,120,0.7)"; c.font = "bold 16px monospace"; c.textAlign = "center";
    c.fillText("CH1: No probe connected", W / 2, H - 18);
    screenTexture.needsUpdate = true;
    return;
  }

  // STOP mode: render frozen frame
  if (!oscState.isRunning && frozenImageData) {
    c.putImageData(frozenImageData, 0, 0);
    // STOP badge
    c.fillStyle = "rgba(220,30,30,0.9)"; c.roundRect(W - 82, 6, 76, 26, 6); c.fill();
    c.fillStyle = "#fff"; c.font = "bold 14px monospace"; c.textAlign = "center";
    c.fillText("STOP", W - 44, 24);
    screenTexture.needsUpdate = true;
    return;
  }

  drawGraticule(c, W, H);

  // Waveform parameters
  const timebase = TIMEBASE_VALUES[oscState.timebaseIdx]; // ms/div
  const totalTimeMs = timebase * 10;                      // 10 div wide
  const periodMs = 1000 / oscState.frequency;
  const periodsShown = totalTimeMs / periodMs;

  const vdiv = VDIV_VALUES[oscState.vdivIdx];           // V/div
  const totalVoltage = vdiv * 8;                          // 8 div high
  const ampScale = (H / 2) * (oscState.amplitude / (totalVoltage / 2));

  // Waveform trace
  c.strokeStyle = "#00ff88";
  c.lineWidth = 2;
  c.shadowColor = "#00ff88";
  c.shadowBlur = 5;
  c.beginPath();
  for (let px = 0; px <= W; px++) {
    const t = (px / W) * Math.PI * 2 * periodsShown + phase;
    let norm;
    if (oscState.waveform === "sine")     norm = Math.sin(t);
    else if (oscState.waveform === "square")   norm = Math.sign(Math.sin(t));
    else                                        norm = (2 / Math.PI) * Math.asin(Math.sin(t));
    const y = H / 2 - norm * ampScale;
    px === 0 ? c.moveTo(px, y) : c.lineTo(px, y);
  }
  c.stroke();
  c.shadowBlur = 0;

  // Trigger line
  const trigDiv = TRIGGER_VALUES[oscState.triggerIdx];
  const trigY = H / 2 - (trigDiv / 4) * (H / 2);
  c.strokeStyle = "rgba(255,220,0,0.85)";
  c.lineWidth = 1.5;
  c.setLineDash([6, 4]);
  c.beginPath(); c.moveTo(0, trigY); c.lineTo(W, trigY); c.stroke();
  c.setLineDash([]);
  // Trigger arrow
  c.fillStyle = "rgba(255,220,0,0.9)";
  c.beginPath(); c.moveTo(0, trigY); c.lineTo(14, trigY - 6); c.lineTo(14, trigY + 6); c.closePath(); c.fill();

  // Measurements overlay
  c.fillStyle = "rgba(0,220,120,0.85)";
  c.font = "bold 13px monospace";
  c.textAlign = "left";
  const freq = oscState.frequency >= 1000
    ? (oscState.frequency / 1000).toFixed(2) + " kHz"
    : oscState.frequency + " Hz";
  c.fillText(`CH1  ${freq}  Vpp=${(oscState.amplitude * 2).toFixed(1)}V`, 8, 18);
  c.fillText(`Timebase: ${timebase}ms/div   V/div: ${vdiv}V`, 8, H - 18);

  // RUN badge
  c.fillStyle = "rgba(0,180,80,0.9)"; c.roundRect(W - 70, 6, 64, 26, 6); c.fill();
  c.fillStyle = "#fff"; c.font = "bold 14px monospace"; c.textAlign = "center";
  c.fillText("RUN", W - 38, 24);

  // Capture frame for freeze
  frozenImageData = c.getImageData(0, 0, W, H);
  screenTexture.needsUpdate = true;
}

function drawGraticule(c, W, H) {
  // Major grid (10 × 8 divs)
  c.strokeStyle = "rgba(0,200,100,0.18)";
  c.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const x = (W / 10) * i;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let i = 1; i < 8; i++) {
    const y = (H / 8) * i;
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  // Center lines brighter
  c.strokeStyle = "rgba(0,200,100,0.38)";
  c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
  c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  // Tick marks on center lines
  c.strokeStyle = "rgba(0,220,120,0.55)";
  c.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const x = (W / 10) * i + W / 20;
    c.beginPath(); c.moveTo(x, H / 2 - 4); c.lineTo(x, H / 2 + 4); c.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const y = (H / 8) * i + H / 16;
    c.beginPath(); c.moveTo(W / 2 - 4, y); c.lineTo(W / 2 + 4, y); c.stroke();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUILD OSCILLOSCOPE  (procedural 3D model)
// ─────────────────────────────────────────────────────────────────────────────
const oscGroup = new THREE.Group();
// Sit on bench top – scale 0.72 so effective half-height = 0.24 * 0.72 ≈ 0.173
const OSC_SCALE = 0.72;
oscGroup.scale.setScalar(OSC_SCALE);
oscGroup.position.set(0, BENCH_Y + 0.24 * OSC_SCALE, -0.3);
scene.add(oscGroup);

// Dimensions  (table-scale)
const BW = 0.52, BH = 0.48, BD = 0.40; // body width / height / depth

// ── Body ─────────────────────────────────────────────────────────────────────
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x18202e, roughness: 0.45, metalness: 0.35 });
const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), bodyMat);
oscGroup.add(body);

// Front face trim (darker border strip)
const trim = new THREE.Mesh(
  new THREE.BoxGeometry(BW + 0.002, BH + 0.002, 0.012),
  new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.55 })
);
trim.position.z = BD / 2 - 0.005;
oscGroup.add(trim);

// Bottom rubber feet
[[-BW / 2 + 0.04, -BW / 2 + 0.04], [BW / 2 - 0.04, -BW / 2 + 0.04],
 [-BW / 2 + 0.04,  BW / 2 - 0.04], [BW / 2 - 0.04,  BW / 2 - 0.04]].forEach(([x, z]) => {
  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.008, 8),
    new THREE.MeshStandardMaterial({ color: 0x050508, roughness: 0.9 })
  );
  foot.position.set(x, -BH / 2 - 0.004, z - 0.04);
  oscGroup.add(foot);
});

// ── Screen ───────────────────────────────────────────────────────────────────
const SCREEN_PLANE_W = 0.26, SCREEN_PLANE_H = 0.165;
const screenMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_PLANE_W, SCREEN_PLANE_H),
  new THREE.MeshBasicMaterial({ map: screenTexture })
);
screenMesh.position.set(-0.08, 0.04, BD / 2 + 0.001);
oscGroup.add(screenMesh);

// Screen bezel
const bezel = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_PLANE_W + 0.022, SCREEN_PLANE_H + 0.022),
  new THREE.MeshStandardMaterial({ color: 0x08090e, roughness: 0.6 })
);
bezel.position.set(-0.08, 0.04, BD / 2 + 0.0005);
oscGroup.add(bezel);

// Screen glass glare plane
const glare = new THREE.Mesh(
  new THREE.PlaneGeometry(SCREEN_PLANE_W, SCREEN_PLANE_H),
  new THREE.MeshBasicMaterial({ color: 0x88bbff, transparent: true, opacity: 0.04, depthWrite: false })
);
glare.position.set(-0.08, 0.04, BD / 2 + 0.003);
oscGroup.add(glare);

// ── Brand label ──────────────────────────────────────────────────────────────
function makeLabelTex(text, sub, fgTop, fgSub, bg) {
  const cv = document.createElement("canvas"); cv.width = 400; cv.height = 110;
  const c = cv.getContext("2d");
  c.fillStyle = bg; c.fillRect(0, 0, 400, 110);
  c.fillStyle = fgTop; c.font = "bold 52px Arial"; c.textAlign = "center"; c.fillText(text, 200, 66);
  c.fillStyle = fgSub; c.font = "20px Arial"; c.fillText(sub, 200, 96);
  return new THREE.CanvasTexture(cv);
}
const brandMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.10, 0.028),
  new THREE.MeshBasicMaterial({ map: makeLabelTex("OSCILLO-XR", "Digital Oscilloscope", "#00ddff", "#5599aa", "#0a0e1a"), transparent: true })
);
brandMesh.position.set(-0.08, -0.10, BD / 2 + 0.002);
oscGroup.add(brandMesh);

// ─────────────────────────────────────────────────────────────────────────────
//  INTERACTIVE CONTROLS  (knobs + buttons on front panel)
//  Each interactive mesh gets userData: { ctrlType, ... }
// ─────────────────────────────────────────────────────────────────────────────
const interactives = []; // list of { mesh, ctrlType, label }

// Helper: create a round indicator knob
function makeKnob(cx, cy, r1 = 0.018, r2 = 0.022, h = 0.025, color = 0x222233) {
  const g = new THREE.Group();
  const knob = new THREE.Mesh(
    new THREE.CylinderGeometry(r1, r2, h, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7 })
  );
  knob.position.set(cx, cy, BD / 2 + h / 2 + 0.006);
  g.add(knob);
  // Indicator line
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.003, h + 0.002, 0.003),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
  );
  line.position.set(0, 0, r1 * 0.6);
  knob.add(line);
  oscGroup.add(g);
  return knob;
}

// Helper: create canvas-texture button
function makeButton(cx, cy, w, h, label, color, textColor = "#fff", tag = {}) {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
  const c = cv.getContext("2d");
  c.fillStyle = color;
  c.roundRect(4, 4, 248, 120, 14); c.fill();
  c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 2;
  c.roundRect(4, 4, 248, 120, 14); c.stroke();
  c.fillStyle = textColor; c.font = "bold 36px Arial"; c.textAlign = "center";
  c.fillText(label, 128, 76);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, side: THREE.DoubleSide })
  );
  mesh.position.set(cx, cy, BD / 2 + 0.002);
  mesh.userData = { ...tag };
  oscGroup.add(mesh);
  interactives.push({ mesh, ...tag });
  return mesh;
}

// Helper: small knob label
function knobLabel(cx, cy, text) {
  const cv = document.createElement("canvas"); cv.width = 200; cv.height = 60;
  const c = cv.getContext("2d");
  c.fillStyle = "rgba(0,0,0,0)"; c.fillRect(0,0,200,60);
  c.fillStyle = "#7aaacc"; c.font = "bold 22px Arial"; c.textAlign = "center";
  c.fillText(text, 100, 42);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.075, 0.022),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })
  );
  m.position.set(cx, cy, BD / 2 + 0.002);
  oscGroup.add(m);
}

// ── Layout constants (right panel x, rows y) ─────────────────────────────────
const PX = 0.175; // x centre of control panel (right side)
const ROW = (n) => 0.20 - n * 0.070; // rows from top – fits all 7 rows in taller body

// ── POWER button ──────────────────────────────────────────────────────────────
const powerBtn = makeButton(PX, ROW(0), 0.072, 0.042, "PWR", "#1a3a1a", "#44ff88",
  { ctrlType: "power", label: "POWER" });

// ── RUN/STOP button ───────────────────────────────────────────────────────────
const runStopBtn = makeButton(PX, ROW(1), 0.072, 0.036, "RUN", "#1a2a3a", "#44aaff",
  { ctrlType: "runstop", label: "RUN/STOP" });

// ── AUTO button ───────────────────────────────────────────────────────────────
makeButton(PX, ROW(1) - 0.045, 0.072, 0.032, "AUTO", "#2a1a3a", "#cc88ff",
  { ctrlType: "auto", label: "AUTO" });

// ── Waveform select buttons ───────────────────────────────────────────────────
[["∿", "sine"], ["⊓", "square"], ["△", "triangle"]].forEach(([sym, wf], i) => {
  makeButton(PX - 0.025 + i * 0.026, ROW(3) + 0.005, 0.022, 0.030, sym, "#0d1a2a", "#88ccff",
    { ctrlType: "wave", waveform: wf, label: "WAVE:" + wf });
});
knobLabel(PX, ROW(3) - 0.024, "WAVE");

// ── Timebase knob ─────────────────────────────────────────────────────────────
const tbKnob = makeKnob(PX, ROW(4) + 0.01, 0.022, 0.026, 0.028, 0x1a2240);
tbKnob.userData = { ctrlType: "timebase", label: "TIMEBASE" };
interactives.push({ mesh: tbKnob, ctrlType: "timebase", label: "TIMEBASE" });
knobLabel(PX, ROW(4) - 0.032, "TIMEBASE");

// ── V/DIV knob ────────────────────────────────────────────────────────────────
const vdKnob = makeKnob(PX, ROW(5) + 0.01, 0.022, 0.026, 0.028, 0x221a40);
vdKnob.userData = { ctrlType: "vdiv", label: "V/DIV" };
interactives.push({ mesh: vdKnob, ctrlType: "vdiv", label: "V/DIV" });
knobLabel(PX, ROW(5) - 0.032, "V/DIV");

// ── Trigger knob ──────────────────────────────────────────────────────────────
const trigKnob = makeKnob(PX, ROW(6) + 0.01, 0.018, 0.022, 0.024, 0x2a1a1a);
trigKnob.userData = { ctrlType: "trigger", label: "TRIGGER" };
interactives.push({ mesh: trigKnob, ctrlType: "trigger", label: "TRIGGER" });
knobLabel(PX, ROW(6) - 0.028, "TRIG");

// ── CH1 BNC port ──────────────────────────────────────────────────────────────
const ch1Body = new THREE.Mesh(
  new THREE.CylinderGeometry(0.014, 0.014, 0.018, 16),
  new THREE.MeshStandardMaterial({ color: 0xccaa22, roughness: 0.25, metalness: 0.85 })
);
ch1Body.rotation.x = Math.PI / 2;
ch1Body.position.set(-0.16, -0.13, BD / 2 + 0.009);
ch1Body.userData = { ctrlType: "ch1", label: "CH1 INPUT" };
oscGroup.add(ch1Body);
interactives.push({ mesh: ch1Body, ctrlType: "ch1", label: "CH1 INPUT" });
knobLabel(-0.16, -0.152, "CH1");

// Probe (shown / hidden based on connection)
const probeMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.006, 0.007, 0.04, 8),
  new THREE.MeshStandardMaterial({ color: 0x333355, roughness: 0.4 })
);
probeMesh.rotation.x = Math.PI / 2;
probeMesh.position.set(-0.16, -0.13, BD / 2 + 0.032);
probeMesh.visible = false;
oscGroup.add(probeMesh);

// ── Separator lines on front panel ───────────────────────────────────────────
function addSeparator(y) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.002),
    new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.7 })
  );
  m.position.set(PX, y, BD / 2 + 0.001);
  oscGroup.add(m);
}
[ROW(0) - 0.027, ROW(2) + 0.018, ROW(3) - 0.040, ROW(4) - 0.046].forEach(addSeparator);

// ─────────────────────────────────────────────────────────────────────────────
//  PROBE CABLE (decorative BNC cable on bench)
// ─────────────────────────────────────────────────────────────────────────────
const cableMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.8 });
const cablePts = [];
for (let i = 0; i <= 20; i++) {
  const t = i / 20;
  cablePts.push(new THREE.Vector3(
    -0.20 + t * 0.05,
    -BH / 2 - 0.005 + Math.sin(t * Math.PI * 3) * 0.012,
    BD / 2 + 0.01 + t * 0.22
  ));
}
const cableCurve = new THREE.CatmullRomCurve3(cablePts);
const cableMesh = new THREE.Mesh(
  new THREE.TubeGeometry(cableCurve, 30, 0.004, 6, false),
  cableMat
);
oscGroup.add(cableMesh);

// Probe tip (static, part of resting cable)
const probeTip = new THREE.Mesh(
  new THREE.ConeGeometry(0.003, 0.018, 8),
  new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 })
);
probeTip.rotation.x = -Math.PI / 2;
probeTip.position.copy(cablePts[cablePts.length - 1]).add(new THREE.Vector3(0, 0, 0.01));
oscGroup.add(probeTip);

// ── Grabbable probe head ───────────────────────────────────────────────────
// Resting position = just past the cable tip
const PROBE_REST = cablePts[cablePts.length - 1].clone().add(new THREE.Vector3(0, 0, 0.018));

const grabbableProbe = new THREE.Group();
// Handle body
const _gpBody = new THREE.Mesh(
  new THREE.CylinderGeometry(0.007, 0.010, 0.055, 12),
  new THREE.MeshStandardMaterial({ color: 0x1a1a33, roughness: 0.4, metalness: 0.3 })
);
_gpBody.rotation.x = Math.PI / 2;
grabbableProbe.add(_gpBody);
// Gold BNC connector (back end, faces the port)
const _gpBNC = new THREE.Mesh(
  new THREE.CylinderGeometry(0.006, 0.006, 0.014, 10),
  new THREE.MeshStandardMaterial({ color: 0xccaa22, roughness: 0.25, metalness: 0.85 })
);
_gpBNC.rotation.x = Math.PI / 2;
_gpBNC.position.z = -0.035;
grabbableProbe.add(_gpBNC);
// Red tip (front)
const _gpTip = new THREE.Mesh(
  new THREE.ConeGeometry(0.003, 0.018, 8),
  new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.3 })
);
_gpTip.rotation.x = -Math.PI / 2;
_gpTip.position.z = 0.037;
grabbableProbe.add(_gpTip);
// "GRAB" hint label
{
  const cv = document.createElement("canvas"); cv.width = 280; cv.height = 64;
  const c = cv.getContext("2d");
  c.fillStyle = "rgba(0,0,0,0)"; c.fillRect(0, 0, 280, 64);
  c.fillStyle = "#00ddff"; c.font = "bold 24px Arial"; c.textAlign = "center";
  c.fillText("\u25BC GRAB PROBE", 140, 46);
  const grabLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 0.025),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false })
  );
  grabLabel.position.set(0, 0.052, 0);
  grabbableProbe.add(grabLabel);
}
grabbableProbe.position.copy(PROBE_REST);
oscGroup.add(grabbableProbe);
grabbableProbe.userData = { ctrlType: "probe_body", label: "PROBE – click to grab" };
interactives.push({ mesh: grabbableProbe, ctrlType: "probe_body", label: "PROBE – click to grab" });

// ── CH1 snap-target ring (pulses when probe is in hand) ───────────────────
const ch1Ring = new THREE.Mesh(
  new THREE.RingGeometry(0.019, 0.027, 28),
  new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthTest: false })
);
ch1Ring.position.set(-0.16, -0.13, BD / 2 + 0.014);
oscGroup.add(ch1Ring);

// ── CH1 connection LED (small dot above BNC port) ────────────────────────
const ch1LED = new THREE.Mesh(
  new THREE.CircleGeometry(0.005, 12),
  new THREE.MeshBasicMaterial({ color: 0x222222 })
);
ch1LED.position.set(-0.16, -0.103, BD / 2 + 0.002);
oscGroup.add(ch1LED);

// ─────────────────────────────────────────────────────────────────────────────
//  INSTRUCTION BOARDS  (two panels side-by-side, fully above the bench)
//  Panel A → Steps 1-4  (indices 0-3)
//  Panel B → Steps 5-8  (indices 4-7)
// ─────────────────────────────────────────────────────────────────────────────

// Shared panel geometry constants – panels flank the oscilloscope on the bench
const PANEL_W    = 0.58;
const PANEL_H    = 0.60;
const PANEL_Y    = BENCH_Y + 0.32;  // bottom sits on bench top
const PANEL_Z    = -0.3;            // same depth as oscilloscope
const CARD_H     = 0.105;
const CARD_GAP   = 0.115;
const TITLE_Y    =  0.248;
const CARD_TOP_Y =  0.165;

// Helper – build a panel backing + title strip, return the Group
function makePanelBoard(wx, titleText) {
  const grp = new THREE.Group();
  grp.position.set(wx, PANEL_Y, PANEL_Z);
  scene.add(grp);

  // Backing card
  grp.add(new THREE.Mesh(
    new THREE.BoxGeometry(PANEL_W, PANEL_H, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: 0.6 })
  ));

  // Title strip
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 80;
  const c = cv.getContext("2d");
  c.fillStyle = "#003355"; c.fillRect(0, 0, 640, 80);
  c.strokeStyle = "#00aaff"; c.lineWidth = 3; c.strokeRect(3, 3, 634, 74);
  c.fillStyle = "#00ccff"; c.font = "bold 28px Arial"; c.textAlign = "center";
  c.fillText(titleText, 320, 52);
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W - 0.03, 0.062),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true })
  );
  strip.position.set(0, TITLE_Y, 0.008);
  grp.add(strip);

  return grp;
}

const panelA = makePanelBoard(-0.95, "OSCILLOSCOPE GUIDE  1 / 2");
const panelB = makePanelBoard( 0.95, "OSCILLOSCOPE GUIDE  2 / 2");

// ── Per-step cards ────────────────────────────────────────────────────────────
const stepCardMeshes   = [];
const stepCardTextures = [];

function makeStepCard(step, isActive) {
  const W = 560, H = 175;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d");

  const bg = isActive ? "#0a2040" : "#050c18";
  c.fillStyle = bg; c.roundRect(4, 4, W - 8, H - 8, 10); c.fill();
  c.strokeStyle = isActive ? "#00ccff" : "#1a2a3a";
  c.lineWidth = isActive ? 3 : 1.5;
  c.roundRect(4, 4, W - 8, H - 8, 10); c.stroke();

  // Step number circle
  c.fillStyle = isActive ? "#00aaff" : "#1a3050";
  c.beginPath(); c.arc(38, H / 2, 26, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#fff"; c.font = "bold 24px Arial"; c.textAlign = "center";
  c.fillText(step.id < 7 ? step.id + 1 : "✓", 38, H / 2 + 8);

  // Title
  c.fillStyle = isActive ? "#88ddff" : "#3a6080";
  c.font = `bold ${isActive ? 28 : 24}px Arial`;
  c.textAlign = "left";
  c.fillText(step.title, 74, 44);

  // Description (word-wrap)
  c.fillStyle = isActive ? "#cceeff" : "#2a4060";
  c.font = `${isActive ? 22 : 19}px Arial`;
  const words = step.desc.split(" ");
  let line = "", y = 78, maxW = W - 82;
  for (const w of words) {
    const test = line + w + " ";
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line.trimEnd(), 74, y); line = w + " "; y += 28;
    } else line = test;
  }
  c.fillText(line.trimEnd(), 74, y);

  return new THREE.CanvasTexture(cv);
}

function refreshStepCards() {
  stepCardMeshes.forEach((m, i) => {
    const tex = makeStepCard(STEPS[i], i === oscState.currentStep);
    stepCardTextures[i]?.dispose();
    stepCardTextures[i] = tex;
    m.material.map = tex;
    m.material.needsUpdate = true;
  });
}

STEPS.forEach((step, i) => {
  const tex = makeStepCard(step, i === 0);
  stepCardTextures.push(tex);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W - 0.04, CARD_H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  // Steps 0-3 → panelA, Steps 4-7 → panelB
  const panel     = i < 4 ? panelA : panelB;
  const localIdx  = i % 4;                        // 0,1,2,3 within each panel
  m.position.set(0, CARD_TOP_Y - localIdx * CARD_GAP, 0.008);
  panel.add(m);
  stepCardMeshes.push(m);
});

// ─────────────────────────────────────────────────────────────────────────────
//  HIGHLIGHT GLOW  (outline when hovering or tutorial step matches)
// ─────────────────────────────────────────────────────────────────────────────
const highlightRing = new THREE.Mesh(
  new THREE.RingGeometry(0.028, 0.038, 32),
  new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthTest: false })
);
scene.add(highlightRing);
highlightRing.visible = false;

// ─────────────────────────────────────────────────────────────────────────────
//  FEEDBACK TOAST  (brief confirmation text above oscilloscope)
// ─────────────────────────────────────────────────────────────────────────────
let toastTimer = 0;
const toastCanvas = document.createElement("canvas");
toastCanvas.width = 512; toastCanvas.height = 100;
const toastTex = new THREE.CanvasTexture(toastCanvas);
const toastMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.38, 0.075),
  new THREE.MeshBasicMaterial({ map: toastTex, transparent: true, depthTest: false })
);
toastMesh.position.set(0, BH / 2 + 0.11, BD / 2 + 0.01);
toastMesh.visible = false;
oscGroup.add(toastMesh);

function showToast(text) {
  const c = toastCanvas.getContext("2d");
  c.clearRect(0, 0, 512, 100);
  c.fillStyle = "rgba(0,180,255,0.92)"; c.roundRect(6, 6, 500, 88, 14); c.fill();
  c.fillStyle = "#fff"; c.font = "bold 28px Arial"; c.textAlign = "center";
  c.fillText(text, 256, 58);
  toastTex.needsUpdate = true;
  toastMesh.visible = true;
  toastTimer = 2.0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROBE CONNECT / DISCONNECT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function snapProbeToCH1() {
  probeGrabbed = false;
  oscState.probeConnected = true;
  // Snap probe visually into the BNC port
  grabbableProbe.position.set(-0.16, -0.13, BD / 2 + 0.010);
  ch1Body.material.color.setHex(0x44cc88);
  ch1LED.material.color.setHex(0x44ff88);
  ch1Ring.material.opacity = 0;
  probeMesh.visible  = true;
  cableMesh.visible  = true;
  probeTip.visible   = false;
  document.body.style.cursor = "default";
  showToast("\u2714 Probe connected – CH1");
  advanceStep("ch1");
  playClick();
}

function unplugProbe() {
  oscState.probeConnected = false;
  probeGrabbed = false;
  grabbableProbe.position.copy(PROBE_REST);
  ch1Body.material.color.setHex(0xccaa22);
  ch1LED.material.color.setHex(0x222222);
  probeMesh.visible  = false;
  cableMesh.visible  = true;
  probeTip.visible   = true;
  showToast("Probe disconnected");
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTROL INTERACTION LOGIC
// ─────────────────────────────────────────────────────────────────────────────
function advanceStep(ctrlType) {
  const cur = STEPS[oscState.currentStep];
  if (cur && (cur.highlight === ctrlType || oscState.currentStep === 7)) {
    if (oscState.currentStep < STEPS.length - 1) {
      oscState.currentStep++;
      refreshStepCards();
    }
  }
}

function updateRunStopLabel() {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
  const c = cv.getContext("2d");
  c.fillStyle = oscState.isRunning ? "#1a2a3a" : "#3a1a1a";
  c.roundRect(4, 4, 248, 120, 14); c.fill();
  c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 2;
  c.roundRect(4, 4, 248, 120, 14); c.stroke();
  c.fillStyle = oscState.isRunning ? "#44aaff" : "#ff4444";
  c.font = "bold 36px Arial"; c.textAlign = "center";
  c.fillText(oscState.isRunning ? "RUN" : "STOP", 128, 76);
  runStopBtn.material.map = new THREE.CanvasTexture(cv);
  runStopBtn.material.needsUpdate = true;
}

function handleControl(ctrlType, extra = {}) {
  switch (ctrlType) {
    case "power":
      oscState.power = !oscState.power;
      powerBtn.material.map = makeLabelTex(
        oscState.power ? "ON" : "OFF",
        "",
        oscState.power ? "#44ff88" : "#aa2222",
        "", "#0a120a"
      );
      // Rebuild properly sized button tex
      (() => {
        const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
        const c = cv.getContext("2d");
        c.fillStyle = oscState.power ? "#0a2a0a" : "#2a0a0a";
        c.roundRect(4, 4, 248, 120, 14); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 2; c.roundRect(4, 4, 248, 120, 14); c.stroke();
        c.fillStyle = oscState.power ? "#44ff88" : "#ff4444";
        c.font = "bold 36px Arial"; c.textAlign = "center";
        c.fillText(oscState.power ? "PWR ON" : "PWR", 128, 76);
        powerBtn.material.map = new THREE.CanvasTexture(cv);
        powerBtn.material.needsUpdate = true;
      })();
      showToast(oscState.power ? "Power ON" : "Power OFF");
      advanceStep("power");
      break;

    case "probe_body":
      if (oscState.probeConnected) {
        unplugProbe();
      } else {
        probeGrabbed = !probeGrabbed;
        if (probeGrabbed) {
          showToast("Probe grabbed – move to the CH1 port ▶");
          cableMesh.visible = false;
          probeTip.visible  = false;
          document.body.style.cursor = "grabbing";
        } else {
          grabbableProbe.position.copy(PROBE_REST);
          cableMesh.visible = true;
          probeTip.visible  = true;
          document.body.style.cursor = "default";
          showToast("Probe released");
        }
      }
      break;

    case "ch1":
      // XR / direct BNC-port click
      if (oscState.probeConnected) {
        unplugProbe();
      } else if (probeGrabbed) {
        snapProbeToCH1();
      } else {
        showToast("Grab the probe first, then insert into CH1");
      }
      break;

    case "wave":
      oscState.waveform = extra.waveform;
      showToast("Waveform: " + extra.waveform.charAt(0).toUpperCase() + extra.waveform.slice(1));
      advanceStep("wave");
      break;

    case "timebase": {
      const dir = extra.dir ?? 1;
      oscState.timebaseIdx = (oscState.timebaseIdx + dir + TIMEBASE_VALUES.length) % TIMEBASE_VALUES.length;
      showToast(`Timebase: ${TIMEBASE_VALUES[oscState.timebaseIdx]} ms/div`);
      advanceStep("timebase");
      break;
    }

    case "vdiv": {
      const dir = extra.dir ?? 1;
      oscState.vdivIdx = (oscState.vdivIdx + dir + VDIV_VALUES.length) % VDIV_VALUES.length;
      showToast(`V/DIV: ${VDIV_VALUES[oscState.vdivIdx]} V`);
      advanceStep("vdiv");
      break;
    }

    case "trigger": {
      const dir = extra.dir ?? 1;
      oscState.triggerIdx = (oscState.triggerIdx + dir + TRIGGER_VALUES.length) % TRIGGER_VALUES.length;
      showToast(`Trigger: ${TRIGGER_VALUES[oscState.triggerIdx] >= 0 ? "+" : ""}${TRIGGER_VALUES[oscState.triggerIdx]} div`);
      advanceStep("trigger");
      break;
    }

    case "runstop":
      oscState.isRunning = !oscState.isRunning;
      if (oscState.isRunning) frozenImageData = null;
      updateRunStopLabel();
      showToast(oscState.isRunning ? "Running..." : "STOPPED – waveform frozen");
      advanceStep("runstop");
      break;

    case "auto":
      oscState.timebaseIdx = 3;
      oscState.vdivIdx = 3;
      oscState.triggerIdx = 3;
      oscState.isRunning = true;
      frozenImageData = null;
      updateRunStopLabel();
      showToast("AUTO – settings reset to defaults");
      break;
  }
  // Animate knob rotation
  if (ctrlType === "timebase") { tbKnob.rotation.y += Math.PI / 4; }
  if (ctrlType === "vdiv")    { vdKnob.rotation.y += Math.PI / 4; }
  if (ctrlType === "trigger") { trigKnob.rotation.y += Math.PI / 4; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TUTORIAL HIGHLIGHT ARROW  (points at the active control)
// ─────────────────────────────────────────────────────────────────────────────
//  Map highlight keys → approximate world-space offset from oscGroup
const highlightMap = {
  power:    new THREE.Vector3(PX,  ROW(0),  BD / 2 + 0.04),
  ch1:      new THREE.Vector3(-0.16, -0.13, BD / 2 + 0.04),
  wave:     new THREE.Vector3(PX,  ROW(3) + 0.005, BD / 2 + 0.04),
  timebase: new THREE.Vector3(PX,  ROW(4) + 0.01,  BD / 2 + 0.06),
  vdiv:     new THREE.Vector3(PX,  ROW(5) + 0.01,  BD / 2 + 0.06),
  trigger:  new THREE.Vector3(PX,  ROW(6) + 0.01,  BD / 2 + 0.05),
  runstop:  new THREE.Vector3(PX,  ROW(1),  BD / 2 + 0.04),
};

// ─────────────────────────────────────────────────────────────────────────────
//  AUDIO
// ─────────────────────────────────────────────────────────────────────────────
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
const welcomeAudio = new THREE.Audio(listener);
const clickAudio   = new THREE.Audio(listener);
audioLoader.load("/audio/welcome.mp3", buf => { welcomeAudio.setBuffer(buf); welcomeAudio.setVolume(0.5); });
audioLoader.load("/audio/zoom in.mp3", buf => { clickAudio.setBuffer(buf); clickAudio.setVolume(0.25); });

function playClick() { if (clickAudio.buffer && !clickAudio.isPlaying) clickAudio.play(); }

// ─────────────────────────────────────────────────────────────────────────────
//  XR HAND MODELS + CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────
const hand1 = renderer.xr.getHand(0); scene.add(hand1); hand1.add(new OculusHandModel(hand1));
const hand2 = renderer.xr.getHand(1); scene.add(hand2); hand2.add(new OculusHandModel(hand2));

const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
scene.add(controller1); scene.add(controller2);

// Laser lines
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
const laserMat = new THREE.LineBasicMaterial({ color: 0x44aaff });
const laserLine = new THREE.Line(laserGeo, laserMat);
laserLine.scale.z = 2;
controller1.add(laserLine.clone());
controller2.add(laserLine.clone());

controller1.addEventListener("selectstart", () => onXRSelect(controller1));
controller2.addEventListener("selectstart", () => onXRSelect(controller2));

// ─────────────────────────────────────────────────────────────────────────────
//  RAYCASTER
// ─────────────────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const mouse = new THREE.Vector2();
let hoveredCtrl = null;

// Collect all clickable meshes
function getInteractiveMeshes() {
  return interactives.map(i => i.mesh);
}

function fireRayOnMeshes(meshes) {
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  const hit = hits[0].object;
  // find the matching interactive
  for (const intr of interactives) {
    if (intr.mesh === hit || (hit.parent && intr.mesh === hit.parent)) {
      return intr;
    }
  }
  // fallback: return userData from hit
  if (hit.userData.ctrlType) return { mesh: hit, ...hit.userData };
  return null;
}

function setControllerRay(ctrl) {
  tempMatrix.identity().extractRotation(ctrl.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
}

function onXRSelect(ctrl) {
  setControllerRay(ctrl);
  const intr = fireRayOnMeshes(getInteractiveMeshes());
  if (intr) { playClick(); handleControl(intr.ctrlType, intr); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  XR SESSION
// ─────────────────────────────────────────────────────────────────────────────
renderer.xr.addEventListener("sessionstart", () => {
  if (welcomeAudio.buffer) welcomeAudio.play();
});

// ─────────────────────────────────────────────────────────────────────────────
//  ANIMATION LOOP
// ─────────────────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let wavePhase = 0;

function animate() {
  const dt = clock.getDelta();
  const t  = clock.elapsedTime;

  // Waveform scroll
  if (oscState.power && oscState.isRunning && oscState.probeConnected) {
    wavePhase += dt * 4.0;
  }
  drawScreen(wavePhase);

  // Knob idle oscillation (visual only)
  tbKnob.rotation.y  += Math.sin(t * 0.4) * 0.0005;
  vdKnob.rotation.y  += Math.sin(t * 0.5 + 1) * 0.0005;
  trigKnob.rotation.y += Math.sin(t * 0.3 + 2) * 0.0004;

  // Toast timer
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) { toastMesh.visible = false; }
  }

  // Tutorial highlight ring – pulse the active control
  const curStep = STEPS[oscState.currentStep];
  if (curStep && highlightMap[curStep.highlight]) {
    const localPos = highlightMap[curStep.highlight].clone();
    // Convert from oscGroup local to world
    const worldPos = localPos.clone();
    oscGroup.localToWorld(worldPos);
    highlightRing.position.copy(worldPos);
    highlightRing.visible = true;
    highlightRing.material.opacity = 0.45 + 0.35 * Math.sin(t * 4);
    // Face camera
    highlightRing.lookAt(camera.position);
  } else {
    highlightRing.visible = false;
  }

  // XR controller hover tooltip
  if (renderer.xr.isPresenting) {
    for (const ctrl of [controller1, controller2]) {
      setControllerRay(ctrl);
      const intr = fireRayOnMeshes(getInteractiveMeshes());
      if (intr && intr !== hoveredCtrl) {
        hoveredCtrl = intr;
        showToast(intr.label || intr.ctrlType);
        toastTimer = 1.0;
      } else if (!intr) {
        hoveredCtrl = null;
      }
    }
  }

  // CH1 target ring – pulse green when probe is grabbed
  if (probeGrabbed && !oscState.probeConnected) {
    ch1Ring.material.opacity = 0.45 + 0.4 * Math.sin(t * 9);
  } else {
    ch1Ring.material.opacity = 0;
  }

  if (!renderer.xr.isPresenting) {
    // ── Probe drag: follow mouse on oscilloscope front-face plane ──────────
    if (probeGrabbed && !oscState.probeConnected) {
      const planeAnchor = new THREE.Vector3();
      oscGroup.localToWorld(planeAnchor.set(0, 0, BD / 2 + 0.06));
      _probeDragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), planeAnchor);
      raycaster.setFromCamera(mouse, camera);
      if (raycaster.ray.intersectPlane(_probeDragPlane, _probeDragHit)) {
        const localPos = _probeDragHit.clone();
        oscGroup.worldToLocal(localPos);
        localPos.x = THREE.MathUtils.clamp(localPos.x, -BW / 2 + 0.02, BW / 2 - 0.02);
        localPos.y = THREE.MathUtils.clamp(localPos.y, -BH / 2 + 0.02, BH / 2 - 0.02);
        localPos.z = BD / 2 + 0.022;
        grabbableProbe.position.copy(localPos);
      }
      // Auto-snap when BNC end is near the CH1 port
      const ch1World   = new THREE.Vector3();
      ch1Body.getWorldPosition(ch1World);
      const probeWorld = new THREE.Vector3();
      grabbableProbe.getWorldPosition(probeWorld);
      if (probeWorld.distanceTo(ch1World) < 0.072) {
        snapProbeToCH1();
      }
      document.body.style.cursor = "grabbing";
    } else {
      controls.update();
      // Mouse hover highlight
      raycaster.setFromCamera(mouse, camera);
      const intr = fireRayOnMeshes(getInteractiveMeshes());
      document.body.style.cursor = intr ? "pointer" : "default";
      if (intr) {
        const worldPos = new THREE.Vector3();
        intr.mesh.getWorldPosition(worldPos);
        highlightRing.position.copy(worldPos);
        highlightRing.visible = true;
        highlightRing.material.opacity = 0.55 + 0.3 * Math.sin(t * 5);
        highlightRing.lookAt(camera.position);
      }
    }
  }

  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOUSE EVENTS
// ─────────────────────────────────────────────────────────────────────────────
window.addEventListener("mousemove", e => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener("click", () => {
  if (renderer.xr.isPresenting) return;
  raycaster.setFromCamera(mouse, camera);
  const intr = fireRayOnMeshes(getInteractiveMeshes());
  if (intr) {
    playClick();
    handleControl(intr.ctrlType, intr);
  } else if (probeGrabbed) {
    // Click on empty space → drop probe back to rest
    probeGrabbed = false;
    grabbableProbe.position.copy(PROBE_REST);
    cableMesh.visible = true;
    probeTip.visible  = true;
    document.body.style.cursor = "default";
    showToast("Probe released");
  }
});

window.addEventListener("resize", () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
renderer.setAnimationLoop(animate);
