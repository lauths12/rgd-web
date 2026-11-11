/* RGD standalone en el navegador de la Quest (ver rgd/web/export_rgd_gltf.py para como se armo rgd.glb, y el
plan "RGD standalone en Meta Quest para presentarlo en una clase", 2026-11-10).

v1 acordado con el usuario: ver la maqueta desde afuera (como hoy en Isaac Sim, NO caminar dentro a escala
real) y poder separar los pisos con el mismo gesto de pellizcar/arrastrar/soltar-cerca-del-fantasma que ya
existe en rgd_mr_interaction.py. Las capas tecnicas + el panel (ver punto 4 mas abajo) se agregaron despues,
en la misma sesion de pruebas en vivo, a pedido del usuario.

2026-11-11, prueba en vivo con el visor real -- dos rondas de ajustes:
  1) no se veian las manos (no habia ningun modelo visible, ni de mano ni de control, solo se usaban como
     puntos invisibles para medir distancia) y se pidio pasar a SOLO control (sin hand-tracking) y a realidad
     mixta (passthrough) en vez de VR opaco -- igual que el resto de este proyecto (kitchen/civil/urbano en
     Isaac Sim ya son AR con passthrough). ARButton (sesion "immersive-ar") en vez de VRButton: en el
     navegador de la Quest esto pide una sesion con passthrough -- se ve el cuarto real detras del modelo, sin
     ningun permiso de camara (es la mezcla de video que ya hace el sistema, no es que la pagina lea pixeles).
     El control ahora tiene su modelo 3D visible (XRControllerModelFactory).
  2) "el modelo queda super lejos... no lo puedo atraer" + "mejora la ux para rotar, engrandar, enchiquitar,
     atraer, panel de control": se agrego recenterModel() (reubica el edificio frente a la camara, por si el
     origen de la sesion XR no cae donde esta parado el usuario -- dispara solo al entrar y con el grip de
     cualquier control) y el gesto de DOS CONTROLES (los dos gatillos apretados a la vez) para mover/girar/
     agrandar-achicar el edificio ENTERO -- mismo concepto que el gesto de dos manos de la maqueta en Isaac
     Sim (rgd_mr_interaction.py), aca con gatillo en vez de pellizco. Un solo gatillo sigue siendo "agarrar un
     piso" (ver onSelectStart/onSelectEnd); si el OTRO gatillo tambien se aprieta, se prefiere el gesto de dos
     manos (igual criterio que en Isaac Sim: "se prefiere el gesto de dos manos" sobre el agarre individual).
     Panel de control: se agrego la caracteristica WebXR "dom-overlay" para que el cartel de texto (#hint) se
     siga viendo DENTRO de la sesion de AR (sin esto, el overlay HTML normal desaparece al entrar en XR).
  3) "no me deja separar los pisos... que salga el rayo del control y de ahi sacar y arrastrar cada piso":
     agarrar un piso por PROXIMIDAD (el control a menos de GRAB_RADIUS del piso) resulto poco practico --
     hay que meter el control fisicamente adentro de una rebanada de ~5-7 cm sin ninguna guia visual de donde
     cae exactamente. Se cambio a RAYO: cada control dibuja una linea hacia adelante (ver `rays` mas abajo) y
     el gatillo agarra el piso que el rayo esta tocando en ese momento (THREE.Raycaster contra floorMeshList,
     ver raycastFloor) -- se puede apuntar desde lejos, no hay que acercar la mano. El arrastre no cambia: se
     sigue usando la posicion del CONTROL (no del punto de impacto) + el offset inicial, asi que el piso se
     mueve junto con el control sin importar a que distancia se hizo el agarre.
  4) "crea un panel de control... mete las capas de electricidad y esas cosas asi como lo teniamos en isaac":
     export_rgd_gltf.py ahora exporta tambien las 4 capas tecnicas (customData.technical_layer, igual criterio
     que find_technical_layers en rgd_mr_interaction.py) como nodos "Tech_<indice>" (arrancan ocultos). Panel
     nuevo: HTML/CSS normal (ver #panel en index.html), visible gracias al "dom-overlay" del punto 2 -- mas
     facil de poner bonito que geometria 3D a mano, y en el navegador de la Quest los botones de dom-overlay
     ya se pueden tocar con el rayo/gatillo del control sin codigo extra. selectLayer(indice|null) prende SOLO
     esa capa tecnica y cambia TODAS las mallas de piso a un material gris muy transparente compartido
     (dimMaterial, guardando el material real de cada malla en userData.origMaterial para restaurarlo al
     volver a "Arquitectura") -- mismo concepto que ARQ_DIM_OPACITY=0.04 en rgd_mr_interaction.py.
  5) "lo de las capas no se puede en realidad virtual, solo en la interfaz plana": el "dom-overlay" se ve
     dentro de AR pero el navegador de la Quest no estaba traduciendo el rayo/gatillo del control en clicks
     sobre esos botones HTML (interaccion de dom-overlay con controles, no con manos, parece no andar bien en
     este navegador) -- el panel HTML (#panel, buildPanel()) queda solo para probarlo con mouse en la vista
     previa de escritorio. El panel REAL para adentro del visor son botones hechos con geometria 3D (un
     THREE.Mesh plano por boton, con el texto/punto de color dibujados en un <canvas> 2D y puestos de textura
     -- mas facil que extruir geometria a mano, igual que se dibuja un boton bonito en HTML) colgados de la
     CAMARA (panelGroup = camera.add(...), por eso `scene.add(camera)` mas abajo: para que Three.js renderice
     los hijos de la camara hace falta que la camara misma sea parte de la escena) -- asi el panel siempre
     queda a tiro, debajo del centro de la vista, sin tener que recentrarlo por separado. Se seleccionan con
     el MISMO rayo/raycaster que ya se usa para los pisos (ver raycastUI), asi que usa el gatillo del
     control -- la misma entrada que ya se sabe que funciona en este visor.
  6) "las instrucciones no deberian salir planas... ventana flotante... con imagen de los controles y que
     hace... cerrar instrucciones un boton": el cartel de texto plano (#hint, dom-overlay) se reemplaza por
     una tarjeta 3D a un lado (ver instructionsGroup/buildInstructionsPanel), con un icono + texto por gesto
     y un boton "Cerrar instrucciones" de geometria 3D de verdad (mismo raycastUI de arriba, no HTML).
  7) "lo del grip no funciona, quitalo": el squeeze (boton de agarre) no disparaba de forma confiable en el
     visor real -- se quito ese gatillo manual (y la fila correspondiente en las instrucciones). El
     recentrado automatico (al entrar y cuando la Quest recalibra su espacio, XRReferenceSpace "reset")
     sigue igual, no dependia del grip. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ARButton } from "three/addons/webxr/ARButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

const RAY_LENGTH = 3; // metros que se dibuja el rayo del control (alcanza de sobra desde donde uno esta parado)
const SNAP_DISTANCE = 0.15; // rgd_layout.SNAP_DISTANCE_M, en el mismo espacio "metros finales/maqueta" que ya trae rgd.glb
const SCALE_MIN = 0.2,
  SCALE_MAX = 5; // limites del gesto de dos manos (achicar/agrandar el edificio entero)

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15161a); // solo para la vista previa de escritorio; en passthrough real se saca (ver sessionstart mas abajo)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 1.5, 0.6); // solo para la vista previa de escritorio antes de "Entrar en AR"; en AR la pose real la maneja el visor
scene.add(camera); // para que Three.js renderice los hijos de la camara (el panel 3D, ver mas abajo)

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(
  ARButton.createButton(renderer, { optionalFeatures: ["local-floor", "dom-overlay"], domOverlay: { root: document.body } })
);
renderer.xr.addEventListener("sessionstart", () => {
  scene.background = null; // deja ver el passthrough real detras del modelo
  pendingRecenter = true; // 2026-11-11: "el modelo queda super lejos, no lo puedo atraer" -- el origen de la
  // sesion XR no necesariamente cae donde esta parado el usuario; se reubica el modelo frente a la camara en
  // vez de confiar en las coordenadas absolutas que trae el .glb (ver recenterModel()/pendingRecenter abajo).
  refSpaceListenerAttached = false; // hay que re-engancharlo cada sesion nueva (ver animation loop)
});
renderer.xr.addEventListener("sessionend", () => {
  scene.background = new THREE.Color(0x15161a); // vuelve al fondo solido para la vista previa de escritorio
});

// 2026-11-11: "si sale lejos porque mi posicion esta mal calibrada, al calibrar deberia salir en frente" --
// WebXR SI tiene un evento estandar para esto: XRReferenceSpace "reset", que dispara cuando el sistema
// recentra el origen de un salto (la Quest tiene su propio recentrado/calibracion de sistema, fuera de
// nuestra app). Engancharlo hace que recenterModel() se dispare solo cada vez que la persona recalibra con
// el sistema, no solo con el grip de nuestro control. getReferenceSpace() no esta listo en el mismo cuadro
// de "sessionstart" (Three.js lo pide de forma asincrona), por eso se reintenta en el loop hasta que exista.
let refSpaceListenerAttached = false;

scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(1.5, 2.5, 1.0);
scene.add(sun);

const root = new THREE.Group(); // en v1 queda fijo en el origen; si mas adelante se quiere mover/girar todo
scene.add(root); // el edificio (como el gesto de dos manos de la maqueta en Isaac Sim), se mueve este grupo.

// 2026-11-11: se probo un suelo/terreno (plano y despues inclinado, ver historial de git) a partir del
// piso NT (Nivel de Terreno) del modelo BIM -- "mejor quita ese suelo jaja": se sacó, no convencio.

const floors = {}; // nombre de piso -> {node, ghost}
const floorMeshList = []; // mallas (hojas) de los pisos reales, para el raycast -- NO incluye fantasmas

// capas tecnicas + panel (2026-11-11: "mete las capas de electricidad y esas cosas asi como lo teniamos en
// isaac") -- mismos colores que rgd_mr_interaction.LayerPanel.COLORS (rojo/amarillo/verde/azul, en ese orden
// fijo por layer_index) y el mismo concepto de "solo una capa tecnica a la vez, arquitectura se atenua
// mientras tanto" (ARQ_DIM_OPACITY=0.04 alla; aca un material compartido gris muy transparente que se le
// pone a TODAS las mallas de piso en vez de sus materiales reales, y se restaura al volver a "Arquitectura").
// 2026-11-11: "la idea era hacerlo mas estetico, no como isaac sim que era mas limitado" -- en vez del boton
// relleno del color plano (lo que SI se parecia al panel original de Isaac Sim), un punto de color + vidrio
// oscuro translucido (ver #panel en index.html): mas parecido a un panel de control "pro" que a un boton de
// juguete. Los colores en RGB (no hex) porque el CSS los usa armados con rgba()/rgb() via variables --r/--g/--b.
const LAYER_COLORS = [
  [217, 38, 38], // rojo: Seguridad y Control
  [242, 191, 26], // amarillo: Control de Iluminacion
  [51, 179, 64], // verde: Agente Limpio
  [38, 115, 230], // azul: Electrico
];
const ARQ_COLOR = [160, 160, 168]; // gris: boton "Arquitectura"
const techLayers = {}; // indice (0..3) -> node
// 2026-11-11: "no quiero que las capas sean tan transparentes sino mas color blanco... no veo cuando lo
// desarmo, como que los bordes, piensa en una forma de verlo" -- con casi 0 opacidad (0.04) el edificio
// practicamente desaparecia. Primer intento: blanco mas opaco PERO con luz (MeshStandardMaterial) para que la
// sombra marcara los bordes -- salio mal ("todo se ve negro, la arqui se ve muy plana"): las versiones
// modernas de Three.js usan intensidades de luz "fisicamente correctas" (unidades reales, lux/lumen) y los
// numeros razonables en el modo viejo (1.3, 1.4) ahi son pricticamente oscuridad total -- ya habia pasado
// algo parecido al reves (demasiado sombreado direccional) con las luces originales, asi que mejor sacar la
// dependencia de luces del todo en vez de seguir ajustando numeros a ciegas sin poder probarlo en vivo.
// Blanco OPACO y SIN LUZ (MeshBasicMaterial, igual criterio que el resto de los materiales) + un overlay de
// BORDES aparte (ver floorMeshList.forEach(...) mas abajo, EdgesGeometry) para la forma/bordes -- asi "verse
// la forma" no depende de ninguna luz ni de ningun numero de intensidad que no se pueda calibrar a ciegas.
const dimMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
let activeLayer = null; // null = "solo arquitectura"

function selectLayer(index) {
  activeLayer = index;
  for (const i in techLayers) techLayers[i].visible = Number(i) === index;
  for (const mesh of floorMeshList) {
    if (index === null) {
      if (mesh.userData.origMaterial) mesh.material = mesh.userData.origMaterial; // vuelve al color real
    } else {
      if (!mesh.userData.origMaterial) mesh.userData.origMaterial = mesh.material; // guarda el real la primera vez
      mesh.material = dimMaterial;
    }
  }
  document.querySelectorAll("#panel button").forEach((b) => b.classList.toggle("active", Number(b.dataset.layer) === (index === null ? -1 : index)));
  refreshPanelVisual();
}

function buildPanel() {
  const panel = document.getElementById("panel");
  const mk = (label, rgb, layerIdx) => {
    const btn = document.createElement("button");
    btn.innerHTML = `<span class="dot"></span><span>${label}</span>`;
    btn.style.setProperty("--r", rgb[0]);
    btn.style.setProperty("--g", rgb[1]);
    btn.style.setProperty("--b", rgb[2]);
    btn.dataset.layer = layerIdx;
    btn.onclick = () => selectLayer(layerIdx === -1 ? null : layerIdx);
    return btn;
  };
  panel.appendChild(mk("Arquitectura", ARQ_COLOR, -1));
  Object.keys(techLayers)
    .sort((a, b) => a - b)
    .forEach((i) => panel.appendChild(mk(techLayers[i].userData.label, LAYER_COLORS[i] || [136, 136, 136], Number(i))));
  selectLayer(null); // marca "Arquitectura" como activa al arrancar
}

// ----- panel 3D (el que de verdad se usa adentro del visor -- ver punto 5 arriba): un plano con textura de
// <canvas> por boton, colgando de la camara.
const panelGroup = new THREE.Group();
panelGroup.position.set(0, -0.28, -0.85); // un poco abajo y adelante: se ve con solo bajar la mirada, no tapa el edificio
camera.add(panelGroup);
const panelButtons = []; // {mesh, label, rgb, layerIdx, canvasW}
const uiButtons = []; // {mesh, onClick} -- TODO objeto 3D tocable (botones del panel + cerrar instrucciones)
const BTN_H = 0.052,
  BTN_GAP = 0.012;
const BTN_FONT = "600 38px system-ui, sans-serif";
const BTN_CANVAS_H = 118;
const PX_PER_M = 360 / 0.16; // misma proporcion que el boton original de 0.16 m / 360 px, para que la altura no cambie

// 2026-11-11: "seguridad y control no cabe en la pastilla, sale seguridad y se corta control" -- el ancho
// del boton era fijo (BTN_W) para todas las etiquetas; una mas larga que "Arquitectura"/"Eléctrico" se
// recortaba. Ahora se MIDE el texto (measureCtx, un canvas 2D aparte solo para medir, nunca se dibuja) y el
// ancho del boton (canvas Y malla 3D) se ajusta a cada etiqueta en vez de ser el mismo para todos.
const measureCtx = document.createElement("canvas").getContext("2d");
measureCtx.font = BTN_FONT;

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvasWidthFor(label) {
  const textW = measureCtx.measureText(label).width;
  return Math.max(300, 74 + textW + 28); // 74 = hueco del punto de color, 28 = margen derecho
}

function makeButtonTexture(label, rgb, active, canvasW) {
  const w = canvasW,
    h = BTN_CANVAS_H;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const [r, g, b] = rgb;
  roundRectPath(ctx, 3, 3, w - 6, h - 6, h / 2 - 3);
  ctx.fillStyle = active ? `rgba(${r},${g},${b},0.3)` : "rgba(30,30,36,0.82)";
  ctx.fill();
  if (active) {
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(46, h / 2, 13, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.shadowColor = `rgb(${r},${g},${b})`;
  ctx.shadowBlur = active ? 18 : 6;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = BTN_FONT;
  ctx.fillStyle = active ? "#ffffff" : "rgba(255,255,255,.8)";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 74, h / 2 + 2);
  return new THREE.CanvasTexture(canvas);
}

function build3DPanel() {
  const items = [{ label: "Arquitectura", rgb: ARQ_COLOR, layerIdx: -1 }];
  Object.keys(techLayers)
    .sort((a, b) => a - b)
    .forEach((i) => items.push({ label: techLayers[i].userData.label, rgb: LAYER_COLORS[i] || [136, 136, 136], layerIdx: Number(i) }));
  items.forEach((it) => (it.canvasW = canvasWidthFor(it.label)));
  const meshWidths = items.map((it) => it.canvasW / PX_PER_M);
  const totalW = meshWidths.reduce((a, w) => a + w, 0) + (items.length - 1) * BTN_GAP;
  let x = -totalW / 2;
  items.forEach((it, k) => {
    const meshW = meshWidths[k];
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(meshW, BTN_H),
      new THREE.MeshBasicMaterial({
        map: makeButtonTexture(it.label, it.rgb, it.layerIdx === -1, it.canvasW),
        transparent: true,
        depthTest: false,
      })
    );
    mesh.position.x = x + meshW / 2;
    x += meshW + BTN_GAP;
    panelGroup.add(mesh);
    panelButtons.push({ mesh, label: it.label, rgb: it.rgb, layerIdx: it.layerIdx, canvasW: it.canvasW });
    uiButtons.push({ mesh, onClick: () => selectLayer(it.layerIdx === -1 ? null : it.layerIdx) });
  });
}

function refreshPanelVisual() {
  const active = activeLayer === null ? -1 : activeLayer;
  panelButtons.forEach((p) => {
    p.mesh.material.map.dispose();
    p.mesh.material.map = makeButtonTexture(p.label, p.rgb, p.layerIdx === active, p.canvasW);
    p.mesh.material.needsUpdate = true;
  });
}

function raycastUI(index) {
  // mismo raycaster que raycastFloor, contra CUALQUIER boton 3D tocable (capas + cerrar instrucciones) --
  // uiButtons se va llenando a medida que se construyen (build3DPanel, buildInstructionsPanel).
  tmpMatrix.identity().extractRotation(controllers[index].matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controllers[index].matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
  const hit = raycaster.intersectObjects(
    uiButtons.filter((b) => b.mesh.parent && b.mesh.parent.visible !== false).map((b) => b.mesh),
    false
  )[0];
  if (!hit) return null;
  return uiButtons.find((b) => b.mesh === hit.object).onClick;
}

// ----- panel de instrucciones (2026-11-11: "las instrucciones no deberian salir planas, deberian salir en
// la realidad virtual, a un lado como ventana flotante... con imagen de los controles y que hace... y luego
// poder darle cerrar instrucciones un boton") -- antes era el cartel de texto plano #hint (dom-overlay);
// ahora es una tarjeta 3D a un lado (no tapa el edificio ni se superpone al panel de capas, que esta abajo),
// con un icono + texto por gesto, y un boton "Cerrar instrucciones" de verdad (geometria 3D tocable con el
// mismo rayo/gatillo, igual criterio que el panel de capas: el dom-overlay HTML no respondia al rayo).
const instructionsGroup = new THREE.Group();
instructionsGroup.position.set(-0.52, 0.08, -0.85); // a un lado (izquierda), mas o menos a la altura de los ojos
camera.add(instructionsGroup);

const INSTRUCTIONS = [
  { icon: "🎯", text: "Apunte con el rayo a un piso y apriete el gatillo para separarlo." },
  { icon: "🤝", text: "Los dos gatillos a la vez: mueva, gire y agrande/achique todo el edificio." },
  { icon: "👇", text: "Baje la mirada: ahí está el panel para elegir una capa técnica." },
];

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function buildInstructionsCardTexture() {
  const W = 480,
    rowH = 128,
    titleH = 70,
    padBottom = 20;
  const H = titleH + INSTRUCTIONS.length * rowH + padBottom;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  roundRectPath(ctx, 3, 3, W - 6, H - 6, 28);
  ctx.fillStyle = "rgba(18,18,24,0.88)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = "700 32px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Cómo usar", 28, titleH / 2 + 4);
  INSTRUCTIONS.forEach((row, i) => {
    const cy = titleH + i * rowH + rowH / 2;
    ctx.beginPath();
    ctx.arc(54, cy, 34, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.textAlign = "center";
    ctx.font = "34px system-ui, sans-serif";
    ctx.fillText(row.icon, 54, cy + 2);
    ctx.textAlign = "left";
    ctx.font = "400 25px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    wrapText(ctx, row.text, 106, cy - 18, W - 106 - 24, 30);
  });
  return new THREE.CanvasTexture(canvas);
}

function buildInstructionsPanel() {
  const tex = buildInstructionsCardTexture();
  const cardW = tex.image.width / PX_PER_M,
    cardH = tex.image.height / PX_PER_M;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(cardW, cardH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
  );
  instructionsGroup.add(card);

  const closeLabel = "Cerrar instrucciones";
  const closeCanvasW = canvasWidthFor(closeLabel);
  const closeMeshW = closeCanvasW / PX_PER_M;
  const closeBtn = new THREE.Mesh(
    new THREE.PlaneGeometry(closeMeshW, BTN_H),
    new THREE.MeshBasicMaterial({
      map: makeButtonTexture(closeLabel, [170, 60, 60], false, closeCanvasW),
      transparent: true,
      depthTest: false,
    })
  );
  closeBtn.position.y = -(cardH / 2 + 0.025 + BTN_H / 2);
  instructionsGroup.add(closeBtn);
  uiButtons.push({ mesh: closeBtn, onClick: () => (instructionsGroup.visible = false) });
}
buildInstructionsPanel(); // no depende del modelo (rgd.glb), se puede armar de una

// 2026-11-11: "no hay forma que se corra automaticamente desde github al commitear?" -- rgd.glb (geometria
// confidencial) nunca puede estar en git, asi que un deploy disparado por git (push) nunca lo tendria si se
// serviera como archivo local junto a index.html. Se sube aparte a Vercel Blob (fuera de git, token propio
// en .env.local -- ver README) y se carga por URL fija: ahora index.html/main.js SI pueden vivir 100% en
// git con deploy automatico en cada push, sin que eso rompa el modelo.
const GLB_URL = "https://igpszmz4fyx8ifwg.public.blob.vercel-storage.com/rgd.glb";

new GLTFLoader().load(
  GLB_URL,
  (gltf) => {
    root.add(gltf.scene);
    // 2026-11-11: "se ve todo re oscuro... no deberia tener luces, todo deberia verse alumbrado" -- el
    // material que trae el glTF (MeshStandardMaterial, con iluminacion PBR) ensombrece cualquier cara que no
    // mire hacia la luz, y no se guardaron normales por vertice (ver export_rgd_gltf.py) asi que esa sombra
    // no es ni siquiera representativa de la forma real. Se cambia cada malla a MeshBasicMaterial (sin luz:
    // el color se ve siempre igual, parejo) -- mismo color/transparencia, solo sin el sombreado direccional.
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        const old = obj.material;
        obj.material = new THREE.MeshBasicMaterial({ color: old.color, transparent: old.transparent, opacity: old.opacity });
      }
    });
    const byName = {};
    gltf.scene.children.forEach((node) => {
      byName[node.name] = node;
      // GLTFLoader copia los "extras" del nodo (ver export_rgd_gltf.py: extras={"visible": bool, ...}) a userData
      node.visible = node.userData.visible !== false;
      if (node.userData.techIndex !== undefined) techLayers[node.userData.techIndex] = node;
    });
    Object.keys(byName).forEach((name) => {
      if (name.endsWith("_ghost")) return;
      const ghost = byName[name + "_ghost"];
      if (!ghost) return;
      const node = byName[name];
      floors[name] = { node, ghost };
      node.traverse((child) => {
        if (child.isMesh) {
          child.userData.floorName = name; // asi raycastFloor() sabe a que piso pertenece lo que toco el rayo
          floorMeshList.push(child);
          // bordes (EdgesGeometry con umbral de angulo: solo las aristas donde la forma real cambia de
          // direccion, no cada triangulo de la malla) -- se ven SIEMPRE, no solo en modo "capa tecnica", para
          // que se note la forma del piso tanto al separarlo como al verlo atenuado en blanco. Cuelga del
          // mesh mismo, asi se mueve solo con el al arrastrar el piso (ver animation loop).
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(child.geometry, 25),
            new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.55 })
          );
          child.add(edges);
        }
      });
    });
    build3DPanel(); // el panel real (adentro del visor); buildPanel() de abajo es solo para probarlo con mouse
    buildPanel();
    // las instrucciones ya se ven en la tarjeta 3D (instructionsGroup); el cartel plano queda solo como
    // confirmacion chica de que el modelo cargo bien (o el error, ver el catch de abajo).
    document.getElementById("hint").textContent = `RGD — maqueta cargada (${Object.keys(floors).length} pisos).`;
  },
  undefined,
  (err) => {
    document.getElementById("hint").textContent = "No se pudo cargar rgd.glb: " + err.message;
  }
);

const controllerModelFactory = new XRControllerModelFactory();
const controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
const controllerGrips = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)];
const rayGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -RAY_LENGTH)]);
const rayMaterial = new THREE.LineBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.8 });
controllers.forEach((c, i) => {
  c.add(new THREE.Line(rayGeometry, rayMaterial)); // el rayo visible, hijo del control: sigue su apuntado solo
  scene.add(c);
  controllerGrips[i].add(controllerModelFactory.createControllerModel(controllerGrips[i])); // el modelo 3D del control, para que se vea donde esta
  scene.add(controllerGrips[i]);
});

const grabbed = {}; // indice de input (0|1) -> {name, offset: Vector3 (mundo)}
const raycaster = new THREE.Raycaster();
const tmpMatrix = new THREE.Matrix4();

function inputPosition(index) {
  return controllers[index].getWorldPosition(new THREE.Vector3());
}

function raycastFloor(index) {
  // mismo truco que el ray de los ejemplos de Three.js/WebXR: la direccion del rayo es el eje -Z local del
  // control (su "targetRaySpace"), llevado a mundo con la ROTACION de su matriz (sin la traslacion).
  tmpMatrix.identity().extractRotation(controllers[index].matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controllers[index].matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix);
  const hit = raycaster.intersectObjects(floorMeshList, false)[0];
  return hit ? hit.object.userData.floorName : null;
}

const triggerDown = [false, false];
let twoHand = null; // null = no activo; si no, {startMid, startDist, startAngle, startPos, startScale, startRotY}

function horizontalAngle(a, b) {
  return Math.atan2(b.x - a.x, b.z - a.z); // angulo en el plano XZ (horizontal) entre los dos controles
}

function startTwoHand() {
  const p0 = inputPosition(0),
    p1 = inputPosition(1);
  twoHand = {
    startMid: p0.clone().add(p1).multiplyScalar(0.5),
    startDist: Math.max(p0.distanceTo(p1), 0.01),
    startAngle: horizontalAngle(p0, p1),
    startPos: root.position.clone(),
    startScale: root.scale.x,
    startRotY: root.rotation.y,
  };
}

function onSelectStart(index) {
  const uiHit = raycastUI(index); // primero la UI (panel de capas, cerrar instrucciones): si se toco un
  if (uiHit) {
    // boton, no cuenta como agarre de piso ni como gatillo "sostenido" (ver mas abajo)
    uiHit();
    return; // ojo: NO se marca triggerDown[index]=true -- tocar la UI no debe disparar el gesto de dos manos
  }
  triggerDown[index] = true;
  if (triggerDown[0] && triggerDown[1]) {
    // los dos gatillos a la vez: se prefiere el gesto de dos manos sobre cualquier agarre de piso individual
    // en curso (mismo criterio que rgd_mr_interaction.py con el pellizco de dos manos en Isaac Sim)
    for (const idx of [0, 1]) delete grabbed[idx]; // se cancela el agarre individual (el piso se queda donde estaba)
    startTwoHand();
    return;
  }
  if (twoHand) return; // ya estamos en el gesto de dos manos por la otra mano: este gatillo no agarra un piso
  const name = raycastFloor(index);
  if (!name) return;
  floors[name].ghost.visible = true;
  const pos = inputPosition(index);
  const floorWorld = floors[name].node.getWorldPosition(new THREE.Vector3());
  grabbed[index] = { name, offset: floorWorld.sub(pos) };
}

function onSelectEnd(index) {
  triggerDown[index] = false;
  if (twoHand) {
    if (!(triggerDown[0] && triggerDown[1])) twoHand = null; // se solto una mano: termina el gesto de dos manos
    return;
  }
  const g = grabbed[index];
  if (!g) return;
  delete grabbed[index];
  const f = floors[g.name];
  if (f.node.position.length() < SNAP_DISTANCE) {
    f.node.position.set(0, 0, 0); // encaja: vuelve a su lugar real exacto
    f.ghost.visible = false;
  }
  // si no encajo se deja donde quedo, con el fantasma visible para ubicarlo despues (igual que en Isaac Sim)
}

controllers.forEach((c, i) => {
  c.addEventListener("selectstart", () => onSelectStart(i));
  c.addEventListener("selectend", () => onSelectEnd(i));
  // 2026-11-11: "lo del grip no funciona, quitalo" -- el squeeze no disparaba de forma confiable en el
  // visor real. El recentrado automatico (al entrar y cuando la Quest recalibra, ver XRReferenceSpace
  // "reset" mas abajo) sigue andando igual; solo se quito este gatillo manual por boton de agarre.
});

let pendingRecenter = false;
const RECENTER_DISTANCE_M = 1.2; // comodo para ver el edificio entero y poder alcanzar los pisos con el control

function recenterModel() {
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  if (camDir.lengthSq() < 1e-6) camDir.set(0, 0, -1); // mirando derecho hacia arriba/abajo: usar un frente por defecto
  camDir.normalize();
  root.position.set(camPos.x + camDir.x * RECENTER_DISTANCE_M, 0, camPos.z + camDir.z * RECENTER_DISTANCE_M);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (!refSpaceListenerAttached && renderer.xr.isPresenting) {
    const refSpace = renderer.xr.getReferenceSpace();
    if (refSpace) {
      refSpace.addEventListener("reset", () => {
        pendingRecenter = true; // la Quest recentro/recalibro el espacio: volver a poner el edificio en frente
      });
      refSpaceListenerAttached = true;
    }
  }
  if (pendingRecenter) {
    recenterModel();
    pendingRecenter = false;
  }
  if (twoHand) {
    const p0 = inputPosition(0),
      p1 = inputPosition(1);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const dist = Math.max(p0.distanceTo(p1), 0.01);
    const angle = horizontalAngle(p0, p1);
    const deltaMid = mid.clone().sub(twoHand.startMid);
    root.position.set(twoHand.startPos.x + deltaMid.x, twoHand.startPos.y + deltaMid.y, twoHand.startPos.z + deltaMid.z);
    root.scale.setScalar(THREE.MathUtils.clamp((twoHand.startScale * dist) / twoHand.startDist, SCALE_MIN, SCALE_MAX));
    root.rotation.y = twoHand.startRotY + (angle - twoHand.startAngle);
  }
  for (const idx in grabbed) {
    const g = grabbed[idx];
    const pos = inputPosition(Number(idx));
    const newWorld = pos.clone().add(g.offset);
    const f = floors[g.name];
    f.node.parent.worldToLocal(newWorld);
    f.node.position.copy(newWorld);
  }
  renderer.render(scene, camera);
});
