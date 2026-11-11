# RGD standalone en el navegador de la Quest (sin PC, sin CloudXR)

Versión aparte de RGD para presentarla en una clase sin poder llevar la PC con Isaac Sim ni depender de la
red del laboratorio. Corre 100% en el navegador de la Quest (WebXR + Three.js) — no es una app instalada, es
una página web.

**Alcance de esta versión (v1):** ver la maqueta desde afuera, en realidad mixta (passthrough: se ve el
cuarto real detrás del modelo) y manipularla con el control de Quest (sin manos — se probó con hand-tracking
y no se veía nada dibujado, se pasó a solo control):

- **Apunte con el rayo del control a un piso y apriete el gatillo**: lo separa; arrástrelo y suéltelo cerca
  de su fantasma gris para que encaje (igual que en Isaac Sim, pero apuntando desde lejos en vez de tener
  que acercar el control físicamente a la rebanada del piso).
- **Los dos gatillos a la vez** (en cualquier parte, no hace falta estar cerca de un piso): mueve, gira
  (eje vertical) y agranda/achica el edificio ENTERO — mismo concepto que el gesto de dos manos de la
  maqueta en Isaac Sim, acá con los dos controles.
- **Botón de agarre (grip)** de cualquier control: trae el edificio de nuevo frente a usted (por si quedó
  lejos o quiere reubicarlo rápido).
- **Panel de capas** (siempre colgando debajo de la vista, se ve con solo bajar la mirada): botones
  Arquitectura / Seguridad y Control / Control de Iluminación / Agente Limpio / Eléctrico, con la
  arquitectura atenuándose al elegir una capa técnica — más estético que el panel original de Isaac Sim
  (vidrio oscuro translúcido, punto de color por capa, brillo en la activa). Dentro del visor es geometría
  3D (planos con textura de canvas, colgados de la cámara) apuntable con el mismo rayo/gatillo que los
  pisos — el `dom-overlay` HTML (`#panel`) se probó primero pero el navegador de la Quest no traducía el
  rayo del control en clicks sobre esos botones, así que ese HTML quedó solo para probar con mouse en
  escritorio.

**Nota de tamaño:** con las 4 capas técnicas incluidas, `rgd.glb` pasó de 15.6 MB a **37.9 MB** — tarda más
en cargar la primera vez en la Quest. Pruébelo con tiempo antes de la clase, no la primera vez ese mismo día.

## Archivos

- `export_rgd_gltf.py` — lee `/srv/isaac-shared/RGD/RGD_scene.usda` (la maqueta YA CONSTRUIDA por
  `../build_rgd_stage.py` + `../apply_scale.py`, no se toca ni se reconstruye nada) y escribe `rgd.glb`: un
  nodo por piso + uno por su fantasma, con los mismos nombres que usa `rgd_mr_interaction.py`.
- `rgd.glb` — el archivo exportado (generado, no se edita a mano; se regenera con el script de arriba).
- `index.html` / `main.js` — la app en sí (Three.js vía CDN, sin build/npm: abrir y listo).

## Regenerar `rgd.glb`

Solo hace falta si cambió `RGD_scene.usda` (otra capa, otro color, etc.):

```bash
~/isaacsim/_build/linux-x86_64/release/python.sh export_rgd_gltf.py
```

La primera vez instala `pygltflib` en el python de Isaac Sim si no está (`pip install pygltflib`) —
`numpy` y `pxr` ya vienen con Isaac Sim, no se instaló nada más.

## Probar localmente (en la PC, antes del día de la clase)

El navegador exige que la página se sirva por http(s), no abrirla directo como archivo (`file://` no deja
cargar los módulos de Three.js). Desde esta carpeta:

```bash
python3 -m http.server 8080
```

y abrir `http://localhost:8080/` en Chrome/Edge de escritorio — sin visor se ve una vista previa fija del
modelo (no hay botón "ENTER AR" funcional sin un dispositivo WebXR real, pero confirma que carga sin
errores de consola y que la geometría/colores se ven bien).

Para probar los gestos del control SIN ponerse el visor: instalar la extensión de Chrome **Immersive Web
Emulator** (de Meta) — simula una sesión WebXR con controles en el navegador de escritorio. Con eso se
puede probar agarrar/arrastrar/soltar-y-encajar un piso, y el gesto de dos controles, antes de ir a la Quest.

## Probar en la Quest real

1. Publicar la carpeta en una URL pública (ver abajo) — el navegador de la Quest no puede llegar a
   `localhost` de esta PC.
2. En el navegador de la Quest, abrir esa URL.
3. Tocar **"ENTER AR"** — se ve el cuarto real (passthrough) con el modelo encima.
4. Si queda lejos, apriete el botón de agarre (grip) de cualquier control para traerlo frente a usted.
5. Un gatillo cerca de un piso lo separa (suéltelo cerca del fantasma gris para que encaje). Los dos
   gatillos a la vez, en cualquier parte, mueven/giran/agrandan el edificio entero.

## Publicar (necesita internet general en el lugar de la clase, no acceso a esta PC)

Cualquiera de estas dos, ambas gratis:

- **GitHub Pages**: subir esta carpeta (`index.html`, `main.js`, `rgd.glb`) a un repo de GitHub y activar
  Pages en la rama/carpeta correspondiente. Queda en `https://<usuario>.github.io/<repo>/`.
- **Vercel**: `vercel deploy` apuntando a esta carpeta (sitio estático, no necesita configuración).

Importante: publicarlo y probar que la URL carga bien en el navegador de la Quest **antes** del día de la
clase, no dejarlo para ese mismo momento.

## No se toca

Nada de Isaac Sim/CloudXR, ni el resto del repo (`kitchen/`, `civil/`, `urbano/`, `gsplat/`, `panel/`) — esta
carpeta solo LEE `RGD_scene.usda` para exportar, nunca lo modifica.
