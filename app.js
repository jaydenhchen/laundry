import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const garments = [
  { name: "T-shirt", type: "shirt", hex: "#e37862" },
  { name: "Blue shirt", type: "shirt", hex: "#6b90a8" },
  { name: "Socks", type: "socks", hex: "#c7b89d" },
  { name: "Towel", type: "towel", hex: "#e8b85c" },
  { name: "Pants", type: "pants", hex: "#72927d" }
];

const foldPlans = {
  shirt: [
    { id: "left", label: "Fold the glowing left sleeve in", axis: "z", sign: -1 },
    { id: "right", label: "Fold the right sleeve in", axis: "z", sign: 1 },
    { id: "hem", label: "Fold the hem up toward the collar", axis: "x", sign: -1 }
  ],
  pants: [
    { id: "leg", label: "Fold one leg over the other", axis: "z", sign: -1 },
    { id: "short", label: "Fold the legs up", axis: "x", sign: -1 },
    { id: "pack", label: "Fold in half once more", axis: "x", sign: 1 }
  ],
  towel: [
    { id: "left", label: "Fold the left third over", axis: "z", sign: -1 },
    { id: "right", label: "Fold the right third over", axis: "z", sign: 1 },
    { id: "hem", label: "Fold the towel in half", axis: "x", sign: -1 }
  ],
  socks: [
    { id: "pair", label: "Stack the socks together", axis: "z", sign: -1 },
    { id: "cuff", label: "Fold them in half", axis: "x", sign: -1 }
  ]
};

const hamperSlots = [
  [-0.08, 0.42, -0.05],
  [0.08, 0.46, 0.04],
  [-0.03, 0.5, 0.08],
  [0.1, 0.44, -0.08],
  [-0.1, 0.48, 0.05]
];

const shots = {
  overview: { pos: [2.35, 2.15, 3.35], target: [0, 0.62, -0.45] },
  washer: { pos: [0.35, 1.55, 2.25], target: [-0.95, 0.48, -0.45] },
  detergent: { pos: [-0.15, 1.5, 1.2], target: [-1.0, 1.0, -1.05] },
  dryer: { pos: [0.05, 1.45, 1.85], target: [0.82, 0.62, -1.1] },
  lint: { pos: [1.45, 1.0, 1.35], target: [0.82, 0.2, -0.75] },
  table: { pos: [1.88, 2.55, 1.85], target: [1.88, 0.78, 0.28] }
};

const state = {
  loaded: [],
  detergent: false,
  detergentFill: 0,
  washing: false,
  washed: false,
  transferred: false,
  lintClean: false,
  lintCaught: 0,
  lintTotal: 7,
  drying: false,
  dried: false,
  unloaded: false,
  folded: [],
  foldProgress: {},
  foldingName: null,
  sound: false,
  cycleLeft: 0,
  careScore: 100,
  entered: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const hud = {
  progress: $("#header-progress"),
  progressLabel: $("#header-progress-label"),
  promptNumber: $("#prompt-number"),
  promptTitle: $("#prompt-title"),
  promptCopy: $("#prompt-copy"),
  washSettings: $("#wash-settings"),
  drySettings: $("#dry-settings"),
  washCycle: $("#wash-cycle"),
  washTemp: $("#wash-temp"),
  dryLevel: $("#dry-level"),
  dryHeat: $("#dry-heat"),
  action: $("#action-button"),
  hover: $("#hover-label"),
  toast: $("#toast"),
  toastMessage: $("#toast-message"),
  start: $("#start-screen"),
  modal: $("#completion-modal"),
  score: $("#final-score"),
  soundToggle: $("#sound-toggle")
};

const canvas = $("#view");
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.05);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const upAxis = new THREE.Vector3(0, 1, 0);

let scene, camera, renderer, controls;
let washer, dryer, hamper, table, bin, bottle, stream;
let woodMap, wallMap;
const itemMap = new Map();
const lintPieces = [];
const stackMeshes = [];
const tweens = [];
const bubbles = [];
let camGoal = null;
let lastStep = "";
let drag = null;
let hovered = null;
let foldRoot = null;
let pouring = false;
let time = 0;
let foldTimer = 0;

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.62,
    metalness: extra.metalness ?? 0.04,
    ...extra
  });
}

function add(parent, geo, material, x = 0, y = 0, z = 0, extra = {}) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = extra.cast !== false;
  mesh.receiveShadow = extra.receive !== false;
  if (extra.rot) mesh.rotation.set(...extra.rot);
  if (extra.kind) mesh.userData.kind = extra.kind;
  if (extra.scale) mesh.scale.set(...extra.scale);
  parent.add(mesh);
  return mesh;
}

function canvasTex(draw, wrap = 1) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  draw(c.getContext("2d"));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(wrap, wrap);
  tex.anisotropy = 8;
  return tex;
}

function makeTextures() {
  woodMap = canvasTex((ctx) => {
    ctx.fillStyle = "#c39963";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 30; i += 1) {
      ctx.strokeStyle = `rgba(92, 52, 18, ${0.08 + Math.random() * 0.12})`;
      ctx.lineWidth = 2 + Math.random() * 4;
      const x = i * 9 + Math.random() * 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 10, 90, x - 8, 170, x + 6, 256);
      ctx.stroke();
    }
  }, 7);
  wallMap = canvasTex((ctx) => {
    ctx.fillStyle = "#efe7d6";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i += 1) {
      ctx.fillStyle = `rgba(180, 160, 130, ${Math.random() * 0.07})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
  }, 3);
}

function makeDisplay() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), new THREE.MeshBasicMaterial({ map: tex }));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { ctx, tex, mesh, canvas: c };
}

function paintDisplay(disp, line1, line2, glow = false) {
  const { ctx, canvas: c, tex } = disp;
  ctx.fillStyle = glow ? "#073326" : "#121916";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = glow ? "#8dffc0" : "#8fcfb0";
  ctx.font = "700 34px sans-serif";
  ctx.fillText(line1, 14, 42);
  ctx.fillStyle = "#9db5a8";
  ctx.font = "600 20px sans-serif";
  ctx.fillText(line2, 14, 74);
  tex.needsUpdate = true;
}

function makeBottle() {
  const g = new THREE.Group();
  g.userData.kind = "bottle";
  add(g, new THREE.CylinderGeometry(0.032, 0.038, 0.15, 18), mat("#2f8f70", { roughness: 0.35 }), 0, 0.075, 0);
  add(g, new THREE.CylinderGeometry(0.012, 0.015, 0.04, 12), mat("#246b50"), 0, 0.17, 0);
  add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.02, 12), mat("#e8c15a"), 0, 0.2, 0);
  g.userData.mouth = new THREE.Vector3(0, 0.22, 0);
  return g;
}

function makeAppliance(kind) {
  const isWasher = kind === "washer";
  const root = new THREE.Group();
  root.userData.kind = kind;
  const bodyCol = isWasher ? "#f4f1ea" : "#ebe6db";
  const bodyMat = mat(bodyCol, { roughness: 0.38, metalness: 0.08 });
  add(root, new THREE.BoxGeometry(0.78, 0.98, 0.42), bodyMat, 0, 0.53, -0.09);
  add(root, new THREE.BoxGeometry(0.78, 0.24, 0.24), bodyMat, 0, 0.94, 0.2);
  add(root, new THREE.BoxGeometry(0.78, 0.26, 0.24), bodyMat, 0, 0.15, 0.2);
  add(root, new THREE.BoxGeometry(0.16, 0.5, 0.24), bodyMat, -0.31, 0.52, 0.2);
  add(root, new THREE.BoxGeometry(0.16, 0.5, 0.24), bodyMat, 0.31, 0.52, 0.2);
  const hole = document.createElement("canvas");
  hole.width = 256;
  hole.height = 256;
  const hctx = hole.getContext("2d");
  hctx.fillStyle = "#fff";
  hctx.fillRect(0, 0, 256, 256);
  hctx.fillStyle = "#000";
  hctx.beginPath();
  hctx.arc(128, 128, 86, 0, Math.PI * 2);
  hctx.fill();
  const holeTex = new THREE.CanvasTexture(hole);
  const frontMat = mat(bodyCol, { roughness: 0.38, metalness: 0.08, alphaMap: holeTex, alphaTest: 0.5, transparent: true });
  add(root, new THREE.PlaneGeometry(0.78, 0.98), frontMat, 0, 0.53, 0.332, { cast: false });
  add(root, new THREE.BoxGeometry(0.8, 0.06, 0.66), mat("#ddd8ce", { roughness: 0.4 }), 0, 1.05, 0);
  add(root, new THREE.BoxGeometry(0.74, 0.09, 0.14), mat("#2a3330"), 0, 1.08, 0.22);

  const display = makeDisplay();
  display.mesh.position.set(-0.18, 1.085, 0.3);
  root.add(display.mesh);
  root.userData.display = display;
  paintDisplay(display, isWasher ? "WASHER" : "DRYER", "Standby");

  const btnColor = isWasher ? "#3d8f72" : "#d08a3a";
  const btn = add(
    root,
    new THREE.CylinderGeometry(0.036, 0.036, 0.02, 24),
    mat(btnColor, { emissive: btnColor, emissiveIntensity: 0.35, roughness: 0.3 }),
    0.28,
    1.085,
    0.3,
    { rot: [Math.PI / 2, 0, 0], kind: isWasher ? "wash-start" : "dry-start" }
  );
  btn.material.userData.baseIntensity = 0.35;
  root.userData.startBtn = btn;

  const knobM = mat("#d7d3ca", { metalness: 0.2 });
  add(root, new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16), knobM, 0.08, 1.09, 0.3, { rot: [Math.PI / 2, 0, 0] });
  add(root, new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16), knobM.clone(), 0.16, 1.09, 0.3, { rot: [Math.PI / 2, 0, 0] });

  const door = new THREE.Group();
  const hingeX = isWasher ? 0.3 : -0.3;
  const glassX = isWasher ? -0.3 : 0.3;
  door.position.set(hingeX, 0.52, 0.325);
  door.userData.kind = isWasher ? "washer-door" : "dryer-door";
  door.userData.open = false;
  add(door, new THREE.TorusGeometry(0.255, 0.028, 12, 40), mat("#d5d0c6", { metalness: 0.4, roughness: 0.25 }), glassX, 0, 0);
  add(
    door,
    new THREE.CircleGeometry(0.235, 40),
    mat(isWasher ? "#8ebfd0" : "#7a9aab", { transparent: true, opacity: 0.38, roughness: 0.06, metalness: 0.2 }),
    glassX,
    0,
    0.01,
    { cast: false }
  );
  add(door, new THREE.BoxGeometry(0.018, 0.11, 0.03), mat("#8a8680", { metalness: 0.5 }), isWasher ? -0.03 : 0.03, 0, 0.02);
  root.add(door);
  root.userData.door = door;

  add(
    root,
    new THREE.CylinderGeometry(0.245, 0.245, 0.42, 32, 1, true),
    mat("#171c20", { side: THREE.BackSide, roughness: 0.85 }),
    0,
    0.52,
    0.04,
    { rot: [Math.PI / 2, 0, 0], cast: false }
  );
  add(root, new THREE.CircleGeometry(0.245, 32), mat("#101417"), 0, 0.52, -0.16, { cast: false });
  add(root, new THREE.BoxGeometry(0.72, 0.86, 0.1), mat("#2c3338"), 0, 0.54, -0.24, { cast: false });

  if (isWasher) {
    const water = add(
      root,
      new THREE.CircleGeometry(0.22, 32),
      mat("#4ea7c8", { transparent: true, opacity: 0, roughness: 0.15 }),
      0,
      0.37,
      0.04,
      { rot: [-Math.PI / 2, 0, 0], cast: false }
    );
    root.userData.water = water;
    const lamp = new THREE.PointLight(0x66d0ff, 0, 1.4);
    lamp.position.set(0, 0.52, 0.05);
    root.add(lamp);
    root.userData.lamp = lamp;
    for (let i = 0; i < 10; i += 1) {
      const b = add(root, new THREE.SphereGeometry(0.012, 8, 8), mat("#d9f4ff", { transparent: true, opacity: 0 }), 0, 0.4, 0.05, { cast: false });
      b.userData.phase = i * 0.7;
      bubbles.push(b);
    }
  } else {
    const glow = add(
      root,
      new THREE.CircleGeometry(0.22, 32),
      mat("#e39a48", { emissive: "#e39a48", emissiveIntensity: 0, transparent: true, opacity: 0.55 }),
      0,
      0.52,
      -0.15,
      { cast: false }
    );
    glow.material.userData.baseIntensity = 0;
    root.userData.glow = glow;
    const lamp = new THREE.PointLight(0xffb060, 0, 1.4);
    lamp.position.set(0, 0.52, 0.05);
    root.add(lamp);
    root.userData.lamp = lamp;
  }

  for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) {
    add(root, new THREE.CylinderGeometry(0.03, 0.038, 0.05, 10), mat("#3a3a3a"), x, 0.025, z);
  }

  if (isWasher) {
    const drawer = new THREE.Group();
    drawer.position.set(-0.22, 0.97, 0.08);
    drawer.userData.kind = "detergent-drawer";
    drawer.userData.open = false;
    add(drawer, new THREE.BoxGeometry(0.34, 0.07, 0.36), mat("#d8d3c9"));
    add(drawer, new THREE.BoxGeometry(0.35, 0.08, 0.02), mat("#b9b3a8"), 0, 0, 0.19);
    const cup = add(drawer, new THREE.CylinderGeometry(0.046, 0.04, 0.07, 20), mat("#eef6f1", { transparent: true, opacity: 0.5, roughness: 0.2 }), -0.07, 0.065, 0.02, { kind: "cup" });
    const fill = add(drawer, new THREE.CylinderGeometry(0.04, 0.035, 0.07, 20), mat("#2f8f70", { roughness: 0.25 }), -0.07, 0.03, 0.02, { cast: false });
    fill.scale.y = 0.02;
    root.add(drawer);
    root.userData.drawer = drawer;
    root.userData.cup = cup;
    root.userData.fill = fill;
    bottle = makeBottle();
    bottle.position.set(0.09, 0.045, 0.01);
    drawer.add(bottle);
  } else {
    const trap = new THREE.Group();
    trap.position.set(0, 0.13, 0.22);
    trap.userData.kind = "lint-trap";
    trap.userData.open = false;
    add(trap, new THREE.BoxGeometry(0.4, 0.04, 0.34), mat("#cfc6b0"));
    add(trap, new THREE.BoxGeometry(0.34, 0.008, 0.3), mat("#e8d7b5", { roughness: 0.9 }), 0, 0.024, 0);
    add(trap, new THREE.BoxGeometry(0.41, 0.015, 0.02), mat("#b7ad96"), 0, 0, 0.18);
    root.add(trap);
    root.userData.trap = trap;
  }
  return root;
}

function makeGarment(info) {
  const root = new THREE.Group();
  root.userData.kind = "garment";
  root.userData.name = info.name;
  root.userData.type = info.type;
  root.userData.hex = info.hex;
  const hit = add(root, new THREE.SphereGeometry(0.2, 10, 8), mat("#ffffff", { transparent: true, opacity: 0, depthWrite: false }), 0, 0.02, 0, { cast: false, receive: false });
  hit.raycast = THREE.Mesh.prototype.raycast;
  const fabric = () => mat(info.hex, { roughness: 0.88 });
  if (info.type === "shirt") {
    add(root, new THREE.BoxGeometry(0.16, 0.04, 0.2), fabric());
    add(root, new THREE.BoxGeometry(0.11, 0.035, 0.07), fabric(), -0.12, 0, 0.04, { rot: [0, 0, 0.45] });
    add(root, new THREE.BoxGeometry(0.11, 0.035, 0.07), fabric(), 0.12, 0, 0.04, { rot: [0, 0, -0.45] });
    add(root, new THREE.TorusGeometry(0.028, 0.008, 8, 16, Math.PI), fabric(), 0, 0.02, -0.08, { rot: [Math.PI / 2, 0, 0] });
  } else if (info.type === "pants") {
    add(root, new THREE.BoxGeometry(0.16, 0.04, 0.08), fabric(), 0, 0, -0.05);
    add(root, new THREE.BoxGeometry(0.07, 0.035, 0.2), fabric(), -0.045, 0, 0.07);
    add(root, new THREE.BoxGeometry(0.07, 0.035, 0.2), fabric(), 0.045, 0, 0.07);
  } else if (info.type === "socks") {
    add(root, new THREE.CapsuleGeometry(0.024, 0.1, 6, 10), fabric(), -0.04, 0.02, 0);
    add(root, new THREE.SphereGeometry(0.028, 10, 8), fabric(), -0.04, 0.01, 0.07, { scale: [1, 0.7, 1.35] });
    add(root, new THREE.CapsuleGeometry(0.024, 0.1, 6, 10), fabric(), 0.045, 0.02, 0.01, { rot: [0, 0, 0.25] });
  } else {
    add(root, new THREE.BoxGeometry(0.2, 0.028, 0.14), fabric());
    add(root, new THREE.BoxGeometry(0.018, 0.03, 0.14), mat("#fff6d8"), -0.05, 0, 0);
    add(root, new THREE.BoxGeometry(0.018, 0.03, 0.14), mat("#fff6d8"), 0.04, 0, 0);
  }
  return root;
}

function makeFoldable(info) {
  const root = new THREE.Group();
  root.userData.kind = "foldable";
  const fabric = () => mat(info.hex, { roughness: 0.82, side: THREE.DoubleSide });
  const flap = (id, axis, sign, x, y, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.userData.kind = "fold-flap";
    pivot.userData.flapId = id;
    pivot.userData.axis = axis;
    pivot.userData.sign = sign;
    root.add(pivot);
    return pivot;
  };
  if (info.type === "shirt" || info.type === "towel") {
    add(root, new THREE.BoxGeometry(0.2, 0.016, 0.24), fabric());
    const left = flap("left", "z", -1, -0.1, 0, 0);
    add(left, new THREE.BoxGeometry(0.14, 0.014, 0.18), fabric(), -0.07, 0.003, 0.02);
    const right = flap("right", "z", 1, 0.1, 0, 0);
    add(right, new THREE.BoxGeometry(0.14, 0.014, 0.18), fabric(), 0.07, 0.003, 0.02);
    const hem = flap("hem", "x", -1, 0, 0, 0.12);
    add(hem, new THREE.BoxGeometry(0.2, 0.014, 0.16), fabric(), 0, 0.004, 0.08);
  } else if (info.type === "pants") {
    add(root, new THREE.BoxGeometry(0.18, 0.016, 0.1), fabric(), 0, 0, -0.07);
    add(root, new THREE.BoxGeometry(0.08, 0.014, 0.24), fabric(), -0.05, 0, 0.08);
    const leg = flap("leg", "z", -1, 0, 0, 0.08);
    add(leg, new THREE.BoxGeometry(0.08, 0.014, 0.24), fabric(), 0.05, 0.003, 0);
    const short = flap("short", "x", -1, 0, 0, 0.1);
    add(short, new THREE.BoxGeometry(0.18, 0.014, 0.14), fabric(), 0, 0.005, 0.07);
    const pack = flap("pack", "x", 1, 0, 0, -0.02);
    add(pack, new THREE.BoxGeometry(0.18, 0.014, 0.1), fabric(), 0, 0.007, -0.05);
  } else {
    add(root, new THREE.CapsuleGeometry(0.032, 0.14, 6, 12), fabric(), -0.05, 0.03, 0, { rot: [Math.PI / 2, 0, 0] });
    const pair = flap("pair", "z", -1, 0, 0, 0);
    add(pair, new THREE.CapsuleGeometry(0.032, 0.14, 6, 12), fabric(), 0.05, 0.032, 0, { rot: [Math.PI / 2, 0, 0] });
    const cuff = flap("cuff", "x", -1, 0, 0, 0.09);
    add(cuff, new THREE.BoxGeometry(0.14, 0.02, 0.1), fabric(), 0, 0.02, 0.05);
  }
  return root;
}

function makeRoom() {
  const room = new THREE.Group();
  const floor = add(room, new THREE.PlaneGeometry(7.2, 5.6), mat("#c39963", { map: woodMap, roughness: 0.72 }), 0, 0, -0.3, { rot: [-Math.PI / 2, 0, 0], cast: false });
  floor.receiveShadow = true;
  add(room, new THREE.BoxGeometry(7.2, 2.6, 0.08), mat("#efe7d6", { map: wallMap, roughness: 0.9 }), 0, 1.3, -2.28, { cast: false });
  add(room, new THREE.BoxGeometry(0.08, 2.6, 5.6), mat("#efe7d6", { map: wallMap, roughness: 0.9 }), -3.55, 1.3, -0.3, { cast: false });
  add(room, new THREE.BoxGeometry(0.08, 2.6, 5.6), mat("#efe7d6", { map: wallMap, roughness: 0.9 }), 3.55, 1.3, -0.3, { cast: false });
  add(room, new THREE.BoxGeometry(7.2, 0.08, 0.08), mat("#d9d0c0"), 0, 0.04, -2.24, { cast: false });
  const windowGlass = add(room, new THREE.PlaneGeometry(1.24, 0.96), new THREE.MeshBasicMaterial({ color: 0x9ec5e8 }), 0.35, 1.55, -2.23, { cast: false });
  windowGlass.receiveShadow = false;
  add(room, new THREE.BoxGeometry(1.32, 0.05, 0.06), mat("#f7f2e6"), 0.35, 2.05, -2.22);
  add(room, new THREE.BoxGeometry(1.32, 0.05, 0.06), mat("#f7f2e6"), 0.35, 1.05, -2.22);
  add(room, new THREE.BoxGeometry(0.05, 1.05, 0.06), mat("#f7f2e6"), -0.27, 1.55, -2.22);
  add(room, new THREE.BoxGeometry(0.05, 1.05, 0.06), mat("#f7f2e6"), 0.97, 1.55, -2.22);
  add(room, new THREE.CircleGeometry(0.9, 28), mat("#7f9a88", { roughness: 0.95 }), 0.05, 0.01, 0.35, { rot: [-Math.PI / 2, 0, 0], cast: false, scale: [1.4, 0.9, 1] });
  return room;
}

function makeHamper() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.29, 0.24, 0.4, 22, 1, true), mat("#c9a36c", { roughness: 0.85 }), 0, 0.22, 0, { cast: false });
  add(g, new THREE.CircleGeometry(0.24, 22), mat("#b38b55"), 0, 0.03, 0, { rot: [-Math.PI / 2, 0, 0] });
  add(g, new THREE.TorusGeometry(0.29, 0.016, 8, 24), mat("#a67c45"), 0, 0.42, 0, { rot: [Math.PI / 2, 0, 0] });
  g.position.set(-1.72, 0, 0.55);
  g.userData.kind = "hamper";
  g.traverse((ch) => {
    if (ch.isMesh) ch.userData.kind = "hamper";
  });
  return g;
}

function makeTable() {
  const g = new THREE.Group();
  const top = add(g, new THREE.BoxGeometry(1.85, 0.05, 0.9), mat("#b88850", { map: woodMap, roughness: 0.55 }), 0, 0.74, 0, { kind: "table" });
  top.material.map = woodMap.clone();
  top.material.map.repeat.set(2.4, 1.2);
  for (const [x, z] of [[-0.8, -0.36], [0.8, -0.36], [-0.8, 0.36], [0.8, 0.36]]) {
    add(g, new THREE.BoxGeometry(0.06, 0.72, 0.06), mat("#9a7040"), x, 0.36, z);
  }
  g.position.set(1.88, 0, 0.28);
  return g;
}

function makeBin() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.13, 0.11, 0.3, 18), mat("#2c3330", { roughness: 0.5 }), 0, 0.15, 0, { kind: "bin" });
  add(g, new THREE.TorusGeometry(0.13, 0.012, 8, 18), mat("#1a1f1d"), 0, 0.3, 0, { rot: [Math.PI / 2, 0, 0] });
  g.position.set(1.62, 0, -0.48);
  return g;
}

function makePlant() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.09, 0.07, 0.13, 12), mat("#b56b4a"), 0, 0.065, 0);
  const leaf = mat("#3f7a55");
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    add(g, new THREE.SphereGeometry(0.075, 10, 8), leaf, Math.cos(a) * 0.07, 0.2 + (i % 3) * 0.05, Math.sin(a) * 0.07);
  }
  g.position.set(-2.2, 0, -1.55);
  return g;
}

function makeShelf() {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.7, 0.04, 0.22), mat("#c9a36c"), 0, 1.35, 0);
  add(g, new THREE.BoxGeometry(0.12, 0.18, 0.1), mat("#3d8f72"), -0.2, 1.46, 0);
  add(g, new THREE.BoxGeometry(0.1, 0.16, 0.1), mat("#6b90a8"), 0, 1.45, 0);
  add(g, new THREE.BoxGeometry(0.14, 0.12, 0.1), mat("#e8b85c"), 0.2, 1.43, 0);
  g.position.set(2.2, 0, -2.05);
  return g;
}

function drumCenter(machine) {
  machine.getWorldPosition(tmp);
  tmp.y += 0.52;
  tmp.z += 0.04;
  return tmp.clone();
}

function pileInDrum(machine, place) {
  const c = drumCenter(machine);
  garments.forEach((g, i) => {
    const rec = itemMap.get(g.name);
    if (rec.place !== place) return;
    rec.mesh.position.set(c.x + (i - 2) * 0.03, c.y - 0.07, c.z);
    rec.mesh.rotation.set(0.15 * (i - 2), 0.4 * i, 0.1);
    rec.mesh.scale.setScalar(0.55);
  });
}

function tableSlot(index, count = 5) {
  const n = Math.max(count, 1);
  const span = n <= 1 ? 0 : 1.05;
  const x = n <= 1 ? 0 : -span / 2 + (span / (n - 1)) * index;
  return new THREE.Vector3(table.position.x + x, 0.79, table.position.z + 0.02);
}

function setPickable(mesh, on) {
  mesh.traverse((ch) => {
    if (ch.isMesh) ch.raycast = on ? THREE.Mesh.prototype.raycast : () => {};
  });
}

function waitingClothes() {
  return garments.filter((g) => {
    const rec = itemMap.get(g.name);
    return rec && rec.place === "table" && g.name !== state.foldingName && !state.folded.includes(g.name);
  });
}

function arrangeTableClothes() {
  const waiting = waitingClothes();
  if (state.foldingName) {
    waiting.forEach((g, i) => {
      const rec = itemMap.get(g.name);
      rec.mesh.visible = true;
      rec.mesh.scale.setScalar(0.62);
      rec.mesh.position.set(table.position.x - 0.7, 0.79 + i * 0.038, table.position.z - 0.22);
      rec.mesh.rotation.set(0, 0.4, 0);
      setPickable(rec.mesh, false);
    });
    return;
  }
  waiting.forEach((g, i) => {
    const rec = itemMap.get(g.name);
    rec.mesh.visible = true;
    rec.mesh.scale.setScalar(1);
    rec.mesh.position.copy(tableSlot(i, waiting.length));
    rec.mesh.rotation.set(0, (i - (waiting.length - 1) / 2) * 0.1, 0);
    setPickable(rec.mesh, true);
  });
}

function hamperPos(index) {
  const s = hamperSlots[index];
  return new THREE.Vector3(hamper.position.x + s[0], s[1], hamper.position.z + s[2]);
}

function setWet(mesh, wet) {
  mesh.traverse((ch) => {
    if (!ch.material || !ch.material.color) return;
    if (!ch.material.userData.baseColor) ch.material.userData.baseColor = ch.material.color.clone();
    ch.material.color.copy(ch.material.userData.baseColor);
    if (wet) ch.material.color.offsetHSL(0.02, 0.05, -0.1);
    ch.material.roughness = wet ? 0.32 : 0.88;
  });
}

function spawnLint() {
  lintPieces.forEach((p) => p.removeFromParent());
  lintPieces.length = 0;
  const trap = dryer.userData.trap;
  const colors = ["#c4b08a", "#9d8a6c", "#b7a27c", "#7f97a8", "#d59a8c", "#c4b08a", "#b7a27c"];
  for (let i = 0; i < 7; i += 1) {
    const stringy = i === 1 || i === 5;
    const geo = stringy
      ? new THREE.CapsuleGeometry(0.008, 0.08, 4, 8)
      : new THREE.SphereGeometry(0.02 + (i % 3) * 0.006, 10, 8);
    const piece = add(trap, geo, mat(colors[i], { roughness: 0.95 }), ((i % 3) - 1) * 0.09, 0.04, ((i % 4) - 1.5) * 0.055, { kind: "lint" });
    piece.userData.id = i;
    piece.rotation.set(Math.random(), Math.random() * 2, Math.random());
    lintPieces.push(piece);
  }
  state.lintCaught = 0;
}

function playTone(freq = 520, duration = 0.08) {
  if (!state.sound) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.05, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
  osc.addEventListener("ended", () => ctx.close());
}

function showToast(message) {
  hud.toastMessage.textContent = message;
  hud.toast.classList.add("visible");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => hud.toast.classList.remove("visible"), 2100);
}

function currentStep() {
  if (state.loaded.length < garments.length) return "load";
  if (!state.detergent) return "detergent";
  if (!state.washed) return "wash";
  if (!state.transferred) return "transfer";
  if (!state.lintClean) return "lint";
  if (!state.dried) return "dry";
  if (!state.unloaded) return "unload";
  if (state.folded.length < garments.length) return "fold";
  return "complete";
}

function progressValue() {
  return Math.round(
    (state.loaded.length / 5) * 15 +
      (state.detergent ? 10 : (state.detergentFill / 100) * 10) +
      (state.washed ? 20 : 0) +
      (state.transferred ? 10 : 0) +
      (state.lintClean ? 10 : (state.lintCaught / 7) * 10) +
      (state.dried ? 20 : 0) +
      (state.folded.length / 5) * 15
  );
}

const prompts = {
  load: ["01", "Load the drum", "Grab each dirty item from the hamper and drop it in the washer."],
  detergent: ["02", "Pour detergent", "Open the drawer, grab the green bottle, and hold it over the cup."],
  wash: ["03", "Start the wash", "Set the cycle, then press the green button on the washer."],
  transfer: ["04", "Move the load", "Open the washer and drop the wet clothes into the dryer."],
  lint: ["05", "Pick the lint", "Pull the trap, grab every clump, and drop it in the bin."],
  dry: ["06", "Start the dryer", "Medium heat is safest. Press the dryer start button."],
  unload: ["07", "Unload", "Grab the dry load and drop it on the folding table."],
  fold: ["08", "Fold by hand", "Click one piece — the others slide aside so you can fold the glowing flaps."],
  complete: ["09", "All done", "A complete load, ready to put away."]
};

function syncHUD() {
  const step = currentStep();
  const p = progressValue();
  hud.progress.style.width = `${p}%`;
  hud.progressLabel.textContent = `${p}%`;
  const [num, title, copy] = prompts[step];
  hud.promptNumber.textContent = num;
  hud.promptTitle.textContent = title;
  hud.promptCopy.textContent = copy;
  hud.washSettings.hidden = step !== "wash";
  hud.drySettings.hidden = step !== "dry";

  const complete = {
    load: state.loaded.length === 5,
    detergent: state.detergent,
    wash: state.washed,
    lint: state.lintClean,
    dry: state.dried,
    fold: state.folded.length === 5
  };
  const active = step === "transfer" ? "lint" : step === "unload" ? "fold" : step;
  $$(".checklist-item").forEach((el) => {
    const task = el.dataset.task;
    el.classList.toggle("complete", Boolean(complete[task]));
    el.classList.toggle("active", task === active && !complete[task]);
  });
  $('[data-task="fold"] small').textContent = `${state.folded.length} of 5 folded`;

  const labels = {
    load: washer.userData.door.userData.open ? "Drop clothes in the drum" : "Open washer door",
    detergent: !washer.userData.drawer.userData.open
      ? "Open detergent drawer"
      : state.detergentFill >= 92
        ? "Close drawer"
        : "Pour to the fill line",
    wash: state.washing ? "Washing…" : "Start wash cycle",
    transfer: "Move load to dryer",
    lint: !dryer.userData.trap.userData.open
      ? "Pull lint trap"
      : state.lintCaught >= 7
        ? "Slide trap back in"
        : `Pick lint (${7 - state.lintCaught} left)`,
    dry: state.drying ? "Drying…" : "Start dry cycle",
    unload: "Unload onto table",
    fold: "Click a garment to fold",
    complete: "Load complete"
  };
  hud.action.textContent = labels[step];
  document.documentElement.dataset.step = step;
  document.documentElement.dataset.loaded = String(state.loaded.length);
  document.documentElement.dataset.ready = "1";
  hud.action.disabled =
    (step === "wash" && (state.washing || !state.detergent)) ||
    (step === "dry" && (state.drying || !state.lintClean)) ||
    step === "fold" ||
    step === "complete" ||
    (step === "load" && washer.userData.door.userData.open) ||
    (step === "detergent" && washer.userData.drawer.userData.open && state.detergentFill < 92) ||
    (step === "lint" && dryer.userData.trap.userData.open && state.lintCaught < 7);

  if (step !== lastStep && state.entered) {
    lastStep = step;
    const map = {
      load: "washer",
      detergent: "detergent",
      wash: "washer",
      transfer: "dryer",
      lint: "lint",
      dry: "dryer",
      unload: "table",
      fold: "table",
      complete: "overview"
    };
    frameShot(map[step]);
  }
}

function frameShot(name) {
  const s = shots[name] || shots.overview;
  camGoal = {
    pos: new THREE.Vector3(...s.pos),
    target: new THREE.Vector3(...s.target)
  };
}

function fly(mesh, target, duration, onDone) {
  tweens.push({
    mesh,
    from: mesh.position.clone(),
    to: target.clone(),
    t: 0,
    duration,
    onDone
  });
}

function setPointer(e) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function pick(e, skip) {
  setPointer(e);
  const hits = raycaster.intersectObjects(scene.children, true);
  let fallback = null;
  for (const hit of hits) {
    let obj = hit.object;
    while (obj) {
      if (skip && isChildOf(obj, skip)) {
        obj = obj.parent;
        continue;
      }
      if (obj.userData && obj.userData.kind) {
        const kind = obj.userData.kind;
        if (foldRoot && (kind === "garment" || kind === "table" || kind === "hamper" || kind === "bin")) {
          obj = obj.parent;
          continue;
        }
        if (foldRoot && kind === "foldable") {
          if (!fallback) fallback = { hit, object: obj };
          obj = obj.parent;
          continue;
        }
        return { hit, object: obj };
      }
      obj = obj.parent;
    }
  }
  return fallback;
}

function isChildOf(obj, root) {
  let p = obj;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

function planePoint(e, y = 1.02) {
  setPointer(e);
  dragPlane.constant = -y;
  const out = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(dragPlane, out)) {
    raycaster.ray.at(2.2, out);
  }
  return out;
}

function highlight(obj, on) {
  if (!obj) return;
  obj.traverse((ch) => {
    const mats = ch.material ? [].concat(ch.material) : [];
    mats.forEach((m) => {
      if (!m || !m.emissive) return;
      if (m.userData.baseEmissive === undefined) {
        m.userData.baseEmissive = m.emissive.clone();
        m.userData.baseIntensity = m.emissiveIntensity || 0;
      }
      if (on) {
        m.emissive.setHex(0x5a3a10);
        m.emissiveIntensity = 0.5;
      } else {
        m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseIntensity || 0;
      }
    });
  });
}

function hoverLabel(text, e) {
  if (!text) {
    hud.hover.hidden = true;
    return;
  }
  hud.hover.hidden = false;
  hud.hover.textContent = text;
  hud.hover.style.left = `${e.clientX}px`;
  hud.hover.style.top = `${e.clientY}px`;
}

function loadNextFromHamper() {
  const next = garments.find((g) => itemMap.get(g.name).place === "hamper");
  if (next) loadGarment(next.name);
}

function kindLabel(kind, obj) {
  const names = {
    garment: obj.userData.name,
    hamper: "Dirty hamper",
    bottle: "Detergent bottle",
    lint: "Lint clump",
    "washer-door": "Washer door",
    "dryer-door": "Dryer door",
    "detergent-drawer": "Detergent drawer",
    "wash-start": "Start wash",
    "dry-start": "Start dry",
    "lint-trap": "Lint trap",
    bin: "Lint bin",
    cup: "Detergent cup",
    "fold-flap": "Fold here",
    foldable: "Fold here",
    table: "Folding table"
  };
  return names[kind] || "";
}

function loadGarment(name) {
  if (state.washing || state.washed) return;
  if (state.loaded.includes(name)) return;
  const item = itemMap.get(name);
  state.loaded.push(name);
  item.place = "washer";
  washer.userData.door.userData.open = true;
  const c = drumCenter(washer);
  const i = state.loaded.length;
  fly(item.mesh, new THREE.Vector3(c.x + (i - 3) * 0.04, c.y - 0.04, c.z), 0.45, () => {
    item.mesh.scale.setScalar(0.55);
    setWet(item.mesh, false);
  });
  playTone(380 + i * 30, 0.07);
  if (state.loaded.length === 5) showToast("Washer loaded — open the detergent drawer");
  syncHUD();
}

function openDrawer() {
  if (state.loaded.length < 5) {
    showToast("Load the washer first");
    return;
  }
  if (state.washed) return;
  washer.userData.drawer.userData.open = true;
  frameShot("detergent");
  playTone(420, 0.08);
  syncHUD();
}

function closeDrawer() {
  if (state.detergentFill >= 92 && !state.detergent) {
    state.detergent = true;
    showToast("One cap poured — drawer closed");
    playTone(560, 0.1);
  }
  washer.userData.drawer.userData.open = false;
  if (bottle.parent !== washer.userData.drawer) {
    washer.userData.drawer.attach(bottle);
    bottle.position.set(0.09, 0.045, 0.01);
    bottle.rotation.set(0, 0, 0);
  }
  pouring = false;
  syncHUD();
}

function updateFill() {
  const fill = washer.userData.fill;
  const amt = state.detergentFill / 100;
  fill.scale.y = Math.max(0.02, amt);
  fill.position.y = 0.03 + amt * 0.02;
}

function startWash() {
  if (state.washing || state.washed) return;
  if (state.loaded.length < 5) return showToast("Load all the clothes first");
  if (!state.detergent) return showToast("Pour detergent first");
  washer.userData.door.userData.open = false;
  washer.userData.drawer.userData.open = false;
  state.washing = true;
  state.cycleLeft = 8;
  if (hud.washCycle.value !== "normal" || hud.washTemp.value !== "warm") state.careScore -= 8;
  playTone(430, 0.12);
  showToast("Wash cycle started");
  syncHUD();
}

function transferLoad() {
  if (!state.washed || state.transferred) return;
  dryer.userData.door.userData.open = true;
  washer.userData.door.userData.open = true;
  const c = drumCenter(dryer);
  garments.forEach((g, i) => {
    const item = itemMap.get(g.name);
    item.place = "dryer";
    setWet(item.mesh, true);
    fly(item.mesh, new THREE.Vector3(c.x + (i - 2) * 0.04, c.y - 0.03, c.z), 0.5, () => {
      item.mesh.scale.setScalar(0.55);
    });
  });
  state.transferred = true;
  playTone(490, 0.09);
  showToast("Load transferred — pull the lint trap");
  syncHUD();
}

function openTrap() {
  if (!state.transferred) return showToast("Move the load to the dryer first");
  if (state.drying || state.dried) return;
  dryer.userData.trap.userData.open = true;
  if (!lintPieces.length) spawnLint();
  frameShot("lint");
  playTone(390, 0.08);
  syncHUD();
}

function closeTrap() {
  if (state.lintCaught >= 7 && !state.lintClean) {
    state.lintClean = true;
    showToast("Lint gone — airflow restored");
    playTone(580, 0.08);
  }
  dryer.userData.trap.userData.open = false;
  syncHUD();
}

function catchLint(piece) {
  state.lintCaught += 1;
  piece.removeFromParent();
  const idx = lintPieces.indexOf(piece);
  if (idx >= 0) lintPieces.splice(idx, 1);
  playTone(500 + state.lintCaught * 40, 0.07);
  if (state.lintCaught >= 7) showToast("Screen is clear — slide the trap back in");
  syncHUD();
}

function startDry() {
  if (state.drying || state.dried) return;
  if (!state.transferred) return showToast("Move the load first");
  if (!state.lintClean) return showToast("Clean the lint trap first");
  dryer.userData.door.userData.open = false;
  dryer.userData.trap.userData.open = false;
  state.drying = true;
  state.cycleLeft = 7;
  if (hud.dryLevel.value !== "normal" || hud.dryHeat.value !== "medium") state.careScore -= 8;
  playTone(360, 0.12);
  showToast("Dry cycle started");
  syncHUD();
}

function unloadToTable() {
  if (!state.dried || state.unloaded) return;
  dryer.userData.door.userData.open = true;
  garments.forEach((g, i) => {
    const item = itemMap.get(g.name);
    item.place = "table";
    setWet(item.mesh, false);
    item.mesh.scale.setScalar(1);
    setPickable(item.mesh, true);
    const dest = tableSlot(i, garments.length);
    fly(item.mesh, dest, 0.55, () => {
      item.mesh.rotation.set(0, (i - 2) * 0.1, 0);
    });
  });
  state.unloaded = true;
  playTone(470, 0.08);
  showToast("Warm and dry — click one piece to fold it");
  syncHUD();
}

function beginFold(name) {
  if (!state.unloaded || state.folded.includes(name)) return;
  const info = garments.find((g) => g.name === name);
  const item = itemMap.get(name);
  state.foldingName = name;
  if (state.foldProgress[name] == null) state.foldProgress[name] = 0;
  if (foldRoot) foldRoot.removeFromParent();
  foldRoot = makeFoldable(info);
  foldRoot.position.set(table.position.x + 0.08, 0.86, table.position.z + 0.04);
  scene.add(foldRoot);
  item.mesh.visible = false;
  setPickable(item.mesh, false);
  arrangeTableClothes();
  frameShot("table");
  playTone(450, 0.07);
  showToast(foldPlans[info.type][state.foldProgress[name]].label);
  syncHUD();
}

function currentFoldFlap() {
  let current = null;
  foldRoot?.traverse((ch) => {
    if (!current && ch.userData.kind === "fold-flap" && ch.userData.current) current = ch;
  });
  return current;
}

function doFold(flap) {
  const name = state.foldingName;
  if (!name) return;
  const info = garments.find((g) => g.name === name);
  const plan = foldPlans[info.type];
  const stepIndex = state.foldProgress[name] || 0;
  if (stepIndex >= plan.length) return;
  if (flap.userData.flapId !== plan[stepIndex].id) {
    showToast("Fold the glowing part first");
    return;
  }
  flap.userData.folding = true;
  playTone(430 + stepIndex * 50, 0.08);
  state.foldProgress[name] = stepIndex + 1;
  if (state.foldProgress[name] >= plan.length) {
    clearTimeout(foldTimer);
    foldTimer = setTimeout(() => completeFold(info), 700);
  } else {
    showToast(plan[state.foldProgress[name]].label);
  }
}

function completeFold(info) {
  if (state.foldingName !== info.name) return;
  if (state.folded.includes(info.name)) return;
  state.folded.push(info.name);
  const item = itemMap.get(info.name);
  item.place = "stack";
  if (foldRoot) {
    foldRoot.removeFromParent();
    foldRoot = null;
  }
  item.mesh.visible = false;
  const pile = add(
    scene,
    new THREE.BoxGeometry(0.18, 0.03, 0.13),
    mat(info.hex),
    table.position.x + 0.72,
    0.775 + (state.folded.length - 1) * 0.032,
    table.position.z - 0.28
  );
  stackMeshes.push(pile);
  state.foldingName = null;
  arrangeTableClothes();
  showToast(`${info.name} folded`);
  syncHUD();
  if (state.folded.length === 5) finishGame();
}

function finishGame() {
  hud.score.textContent = String(state.careScore);
  setTimeout(() => {
    hud.modal.hidden = false;
    playTone(620, 0.12);
    setTimeout(() => playTone(780, 0.12), 140);
  }, 400);
}

function hudAction() {
  const step = currentStep();
  if (step === "load") washer.userData.door.userData.open = true;
  else if (step === "detergent") {
    if (!washer.userData.drawer.userData.open) openDrawer();
    else closeDrawer();
  } else if (step === "wash") startWash();
  else if (step === "transfer") transferLoad();
  else if (step === "lint") {
    if (!dryer.userData.trap.userData.open) openTrap();
    else closeTrap();
  } else if (step === "dry") startDry();
  else if (step === "unload") unloadToTable();
  syncHUD();
}

function onPointerDown(e) {
  if (!state.entered) return;
  if (e.button && e.button !== 0) return;
  const found = pick(e);
  document.documentElement.dataset.pick = found ? found.object.userData.kind + ":" + (found.object.userData.name || "") : "none";
  if (!found) return;
  const obj = found.object;
  const kind = obj.userData.kind;
  const draggable = kind === "garment" || kind === "bottle" || kind === "lint";
  if (kind === "garment") {
    const rec = itemMap.get(obj.userData.name);
    if (!rec) return;
    if (rec.place === "washer" && (state.washing || !state.washed)) return;
    if (rec.place === "dryer" && (state.drying || !state.dried)) return;
    if (rec.place === "stack") return;
    if (state.foldingName) return;
  }
  if (kind === "bottle" && (state.detergent || state.washed)) return;
  if (kind === "lint" && state.lintClean) return;
  drag = {
    object: obj,
    kind,
    x: e.clientX,
    y: e.clientY,
    moved: false,
    draggable
  };
  if (draggable) {
    controls.enabled = false;
    if (kind === "bottle" && bottle.parent !== scene) scene.attach(bottle);
    if (kind === "lint" && obj.parent !== scene) scene.attach(obj);
    if (kind === "garment") scene.attach(obj);
  }
}

function onPointerMove(e) {
  if (!state.entered) return;
  if (drag && drag.draggable) {
    const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (dist > 5) drag.moved = true;
    const y = drag.kind === "lint" ? 0.55 : drag.kind === "bottle" ? 1.15 : 1.05;
    const p = planePoint(e, y);
    drag.object.position.copy(p);
    if (drag.kind === "bottle") {
      washer.userData.cup.getWorldPosition(tmp2);
      pouring = p.distanceTo(tmp2) < 0.16;
      drag.object.rotation.z = pouring ? -1.05 : 0;
    }
    canvas.style.cursor = "grabbing";
    return;
  }
  const found = pick(e);
  if (hovered && hovered !== found?.object) highlight(hovered, false);
  hovered = found?.object || null;
  if (hovered && !hovered.userData.folding) highlight(hovered, true);
  const label = hovered ? kindLabel(hovered.userData.kind, hovered) : "";
  hoverLabel(label, e);
  const kind = hovered?.userData.kind;
  canvas.style.cursor = kind && ["garment", "hamper", "bottle", "lint", "washer-door", "dryer-door", "detergent-drawer", "wash-start", "dry-start", "lint-trap", "fold-flap", "foldable"].includes(kind)
    ? "pointer"
    : "default";
}

function onPointerUp(e) {
  if (!drag) return;
  const obj = drag.object;
  const kind = drag.kind;
  const moved = drag.moved;
  const target = pick(e, obj);
  controls.enabled = true;
  canvas.style.cursor = "default";

  if (kind === "garment") {
    const rec = itemMap.get(obj.userData.name);
    const over = target?.object.userData.kind;
    if ((over === "washer" || over === "washer-door" || over === "cup" || over === "detergent-drawer") && rec.place === "hamper") {
      loadGarment(obj.userData.name);
    } else if ((over === "dryer" || over === "dryer-door") && state.washed && !state.transferred) {
      transferLoad();
    } else if ((over === "table" || over === "dryer" || over === "dryer-door") && state.dried && !state.unloaded && rec.place === "dryer") {
      unloadToTable();
    } else if (!moved && rec.place === "hamper") {
      loadGarment(obj.userData.name);
    } else if (!moved && rec.place === "table") {
      beginFold(obj.userData.name);
    } else if (!moved && rec.place === "washer" && state.washed && !state.transferred) {
      transferLoad();
    } else if (!moved && rec.place === "dryer" && state.dried && !state.unloaded) {
      unloadToTable();
    } else if (rec.place === "hamper") {
      const index = garments.findIndex((g) => g.name === obj.userData.name);
      fly(obj, hamperPos(index), 0.25);
    }
  } else if (kind === "bottle") {
    pouring = false;
    obj.rotation.z = 0;
    if (state.detergentFill < 92) {
      washer.userData.drawer.attach(obj);
      obj.position.set(0.09, 0.045, 0.01);
    }
  } else if (kind === "lint") {
    const over = target?.object.userData.kind;
    if (over === "bin") catchLint(obj);
    else {
      dryer.userData.trap.attach(obj);
      obj.position.set(((obj.userData.id % 3) - 1) * 0.09, 0.04, ((obj.userData.id % 4) - 1.5) * 0.055);
    }
  } else if (kind === "hamper" && !moved && !state.washed) {
    loadNextFromHamper();
  } else if (!moved) {
    handleClick(obj);
  }
  drag = null;
}

function handleClick(obj) {
  const kind = obj.userData.kind;
  if (kind === "washer-door") washer.userData.door.userData.open = !washer.userData.door.userData.open;
  else if (kind === "dryer-door") dryer.userData.door.userData.open = !dryer.userData.door.userData.open;
  else if (kind === "detergent-drawer") {
    if (washer.userData.drawer.userData.open) closeDrawer();
    else openDrawer();
  } else if (kind === "lint-trap") {
    if (dryer.userData.trap.userData.open) closeTrap();
    else openTrap();
  } else if (kind === "wash-start") startWash();
  else if (kind === "dry-start") startDry();
  else if (kind === "fold-flap") doFold(obj);
  else if (kind === "foldable") {
    const current = currentFoldFlap();
    if (current) doFold(current);
  } else if (kind === "garment" && itemMap.get(obj.userData.name)?.place === "table") beginFold(obj.userData.name);
  else if (kind === "hamper") loadNextFromHamper();
  syncHUD();
}

function placeClothesInHamper() {
  garments.forEach((g, i) => {
    const rec = itemMap.get(g.name);
    rec.place = "hamper";
    rec.mesh.visible = true;
    rec.mesh.scale.setScalar(1);
    rec.mesh.position.copy(hamperPos(i));
    rec.mesh.rotation.set(0.2 * (i - 2), 0.4 * i, 0.15 * (i % 3));
    setWet(rec.mesh, false);
    setPickable(rec.mesh, true);
    scene.add(rec.mesh);
  });
}

function resetGame() {
  clearTimeout(foldTimer);
  tweens.length = 0;
  Object.assign(state, {
    loaded: [],
    detergent: false,
    detergentFill: 0,
    washing: false,
    washed: false,
    transferred: false,
    lintClean: false,
    lintCaught: 0,
    drying: false,
    dried: false,
    unloaded: false,
    folded: [],
    foldProgress: {},
    foldingName: null,
    cycleLeft: 0,
    careScore: 100
  });
  lastStep = "";
  if (foldRoot) {
    foldRoot.removeFromParent();
    foldRoot = null;
  }
  stackMeshes.forEach((m) => m.removeFromParent());
  stackMeshes.length = 0;
  lintPieces.forEach((p) => p.removeFromParent());
  lintPieces.length = 0;
  washer.userData.door.userData.open = false;
  dryer.userData.door.userData.open = false;
  washer.userData.drawer.userData.open = false;
  dryer.userData.trap.userData.open = false;
  if (bottle.parent !== washer.userData.drawer) washer.userData.drawer.attach(bottle);
  bottle.position.set(0.09, 0.045, 0.01);
  bottle.rotation.set(0, 0, 0);
  updateFill();
  placeClothesInHamper();
  hud.modal.hidden = true;
  hud.washCycle.value = "normal";
  hud.washTemp.value = "warm";
  hud.dryLevel.value = "normal";
  hud.dryHeat.value = "medium";
  paintDisplay(washer.userData.display, "WASHER", "Standby");
  paintDisplay(dryer.userData.display, "DRYER", "Standby");
  frameShot("overview");
  syncHUD();
}

function formatTime(seconds) {
  return `0:${String(Math.max(0, Math.ceil(seconds))).padStart(2, "0")}`;
}

function updateMachines(dt) {
  const wd = washer.userData.door;
  wd.rotation.y += ((wd.userData.open ? 2.05 : 0) - wd.rotation.y) * Math.min(1, dt * 6);
  const dd = dryer.userData.door;
  dd.rotation.y += ((dd.userData.open ? -2.05 : 0) - dd.rotation.y) * Math.min(1, dt * 6);
  const drawer = washer.userData.drawer;
  drawer.position.z += ((drawer.userData.open ? 0.34 : 0.08) - drawer.position.z) * Math.min(1, dt * 5);
  const trap = dryer.userData.trap;
  trap.position.z += ((trap.userData.open ? 0.52 : 0.22) - trap.position.z) * Math.min(1, dt * 5);

  const water = washer.userData.water;
  const wOp = state.washing ? 0.45 : 0;
  water.material.opacity += (wOp - water.material.opacity) * dt * 3;
  washer.userData.lamp.intensity += ((state.washing ? 1.2 : 0) - washer.userData.lamp.intensity) * dt * 3;
  dryer.userData.lamp.intensity += ((state.drying ? 1.1 : 0) - dryer.userData.lamp.intensity) * dt * 3;
  dryer.userData.glow.material.emissiveIntensity += ((state.drying ? 0.8 : 0) - dryer.userData.glow.material.emissiveIntensity) * dt * 3;

  bubbles.forEach((b, i) => {
    if (!state.washing) {
      b.material.opacity = 0;
      return;
    }
    const phase = (time * 0.7 + b.userData.phase) % 2.2;
    b.position.set(Math.cos(i + time) * 0.12, 0.38 + phase * 0.12, 0.04 + Math.sin(i + time * 0.8) * 0.08);
    b.material.opacity = phase < 1.6 ? 0.55 : 0;
  });

  if (state.washing || state.drying) {
    state.cycleLeft -= dt;
    const machine = state.washing ? washer : dryer;
    paintDisplay(machine.userData.display, formatTime(state.cycleLeft), state.washing ? "Washing" : "Drying", true);
    const host = state.washing ? washer : dryer;
    const c = drumCenter(host);
    garments.forEach((g, i) => {
      const rec = itemMap.get(g.name);
      if (rec.place !== (state.washing ? "washer" : "dryer")) return;
      const a = time * 3.1 + i * 1.25;
      rec.mesh.position.set(c.x + Math.cos(a) * 0.1, c.y + Math.sin(a) * 0.08, c.z + Math.sin(a * 0.8) * 0.07);
      rec.mesh.rotation.set(a, a * 0.6, a * 0.4);
      rec.mesh.scale.setScalar(0.55);
    });
    if (state.cycleLeft <= 0) {
      if (state.washing) {
        state.washing = false;
        state.washed = true;
        washer.userData.door.userData.open = true;
        paintDisplay(washer.userData.display, "DONE", "Move load");
        showToast("Wash complete — move it to the dryer");
        playTone(660, 0.12);
        pileInDrum(washer, "washer");
      } else {
        state.drying = false;
        state.dried = true;
        dryer.userData.door.userData.open = true;
        paintDisplay(dryer.userData.display, "DONE", "Unload");
        garments.forEach((g) => setWet(itemMap.get(g.name).mesh, false));
        showToast("Dry cycle complete — unload to the table");
        playTone(820, 0.16);
        pileInDrum(dryer, "dryer");
      }
      syncHUD();
    }
  }

  if (pouring && drag?.kind === "bottle" && state.detergentFill < 100 && washer.userData.drawer.userData.open) {
    state.detergentFill = Math.min(100, state.detergentFill + dt * 38);
    updateFill();
    if (state.detergentFill >= 92) syncHUD();
  }

  stream.visible = Boolean(pouring && drag?.kind === "bottle");
  if (stream.visible) {
    bottle.getWorldPosition(tmp);
    tmp.y += 0.18;
    washer.userData.cup.getWorldPosition(tmp2);
    const dir = tmp2.clone().sub(tmp);
    const len = Math.max(0.02, dir.length());
    stream.position.copy(tmp).addScaledVector(dir, 0.5);
    stream.scale.set(1, len, 1);
    stream.quaternion.setFromUnitVectors(upAxis, dir.normalize());
  }

  if (foldRoot) {
    const name = state.foldingName;
    const info = garments.find((g) => g.name === name);
    const plan = foldPlans[info.type];
    const stepIndex = state.foldProgress[name] || 0;
    foldRoot.traverse((ch) => {
      if (ch.userData.kind !== "fold-flap") return;
      const idx = plan.findIndex((s) => s.id === ch.userData.flapId);
      ch.userData.current = idx === stepIndex;
      if (ch.userData.folding || idx < stepIndex) {
        const axis = ch.userData.axis;
        const goal = ch.userData.sign * Math.PI * 0.96;
        ch.rotation[axis] += (goal - ch.rotation[axis]) * Math.min(1, dt * 7);
      }
      ch.traverse((mesh) => {
        if (!mesh.material || !mesh.material.emissive) return;
        if (ch.userData.current) {
          mesh.material.emissive.setHex(0xc9a227);
          mesh.material.emissiveIntensity = 0.45 + Math.sin(time * 6) * 0.25;
        } else if (idx >= stepIndex) {
          mesh.material.emissive.setHex(0x000000);
          mesh.material.emissiveIntensity = 0;
        }
      });
    });
  }
}

function updateCamera(dt) {
  if (!camGoal) return;
  camera.position.lerp(camGoal.pos, 1 - Math.pow(0.0002, dt));
  controls.target.lerp(camGoal.target, 1 - Math.pow(0.0002, dt));
  if (camera.position.distanceTo(camGoal.pos) < 0.04) camGoal = null;
}

function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  for (let i = tweens.length - 1; i >= 0; i -= 1) {
    const tw = tweens[i];
    tw.t += dt;
    const u = Math.min(1, tw.t / tw.duration);
    const e = 1 - (1 - u) * (1 - u);
    tw.mesh.position.lerpVectors(tw.from, tw.to, e);
    tw.mesh.position.y += Math.sin(u * Math.PI) * 0.28;
    if (u >= 1) {
      tw.mesh.position.copy(tw.to);
      tweens.splice(i, 1);
      tw.onDone?.();
    }
  }
  updateMachines(dt);
  updateCamera(dt);
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    $("#webgl-error").hidden = false;
    return;
  }
  if (!renderer.getContext()) {
    $("#webgl-error").hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9c8c2);
  scene.fog = new THREE.Fog(0xb9c8c2, 9, 18);

  camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.08, 40);
  camera.position.set(2.35, 2.15, 3.35);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 1.3;
  controls.maxDistance = 7.5;
  controls.target.set(0, 0.62, -0.45);
  controls.enabled = false;

  makeTextures();
  scene.add(new THREE.HemisphereLight(0xfff3dd, 0x3e4a42, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d2, 1.4);
  sun.position.set(-2.2, 4.2, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 14;
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  scene.add(sun);
  const windowLight = new THREE.PointLight(0xa6d0ff, 1.1, 10);
  windowLight.position.set(0.4, 1.7, -1.9);
  scene.add(windowLight);
  const fill = new THREE.PointLight(0xffe6c2, 0.35, 8);
  fill.position.set(1.5, 1.8, 1.2);
  scene.add(fill);

  scene.add(makeRoom());
  hamper = makeHamper();
  table = makeTable();
  bin = makeBin();
  washer = makeAppliance("washer");
  dryer = makeAppliance("dryer");
  washer.position.set(-0.82, 0, -1.35);
  dryer.position.set(0.82, 0, -1.35);
  scene.add(hamper, table, bin, washer, dryer, makePlant(), makeShelf());

  stream = add(scene, new THREE.CylinderGeometry(0.008, 0.012, 1, 8), mat("#3aa37f", { transparent: true, opacity: 0.75 }), 0, -9, 0, { cast: false });
  stream.visible = false;

  garments.forEach((g) => {
    const mesh = makeGarment(g);
    itemMap.set(g.name, { mesh, place: "hamper", info: g });
  });
  placeClothesInHamper();

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);
  hud.action.addEventListener("click", hudAction);
  $("#reset-button").addEventListener("click", resetGame);
  $("#play-again").addEventListener("click", () => {
    hud.modal.hidden = true;
    resetGame();
  });
  $("#view-button").addEventListener("click", () => {
    lastStep = "";
    syncHUD();
  });
  hud.soundToggle.addEventListener("click", () => {
    state.sound = !state.sound;
    hud.soundToggle.innerHTML = `<svg><use href="#icon-${state.sound ? "sound" : "muted"}"></use></svg>`;
    hud.soundToggle.setAttribute("aria-label", `Turn sound ${state.sound ? "off" : "on"}`);
    if (state.sound) playTone(540, 0.08);
  });
  $("#enter-button").addEventListener("click", () => {
    state.entered = true;
    hud.start.hidden = true;
    controls.enabled = true;
    frameShot("washer");
    lastStep = "";
    syncHUD();
    playTone(480, 0.1);
  });

  window.__game = {
    state, itemMap, loadGarment, startWash, startDry, transferLoad, unloadToTable,
    openDrawer, closeDrawer, openTrap, closeTrap, beginFold, doFold, catchLint, resetGame, currentStep, syncHUD
  };
  document.documentElement.dataset.ready = "1";
  syncHUD();
  renderer.setAnimationLoop(tick);
}

init();
