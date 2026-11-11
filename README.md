# RGD standalone en el navegador de la Quest (sin PC, sin CloudXR)

RGD corriendo 100% en el navegador de la Quest (Three.js + WebXR) — no es una app instalada, es una página
web. Se armó para poder presentarlo en una clase sin llevar la PC con Isaac Sim ni depender de su red.

Repo separado de `isaac-cloudxr-lab` (el repo grande del proyecto) a propósito: acá solo vive el código de
este visor, para que se pueda editar/desplegar sin tocar ni depender de todo lo demás.

## Cómo se controla

- **Realidad mixta (passthrough)**: al entrar se ve el cuarto real detrás del modelo, no un fondo negro.
- **Solo control** (sin manos — se probó hand-tracking y no dibujaba nada, se pasó a esto): apunte con el
  rayo del control a un piso y apriete el gatillo para separarlo; arrástrelo y suéltelo cerca de su fantasma
  gris para que encaje.
- **Los dos gatillos a la vez**, en cualquier parte: mueve, gira (eje vertical) y agranda/achica el edificio
  ENTERO. El edificio se recentra solo frente a usted al entrar en AR, y de nuevo cada vez que la Quest
  recalibra su propio espacio (evento WebXR `XRReferenceSpace.reset`).
- **Panel de capas** y **tarjeta de instrucciones**: Arquitectura / Seguridad y Control / Eléctrico, con la
  arquitectura atenuándose en blanco (con líneas de borde, para que se note la forma) al elegir una capa
  técnica. Son geometría 3D de verdad (planos con textura de canvas), no HTML: el `dom-overlay` del
  navegador de la Quest no traducía el rayo del control en clicks sobre botones HTML. Quedan **fijos en el
  cuarto** (no siguen la cabeza) — se colocan frente a usted una sola vez al entrar, y se pueden agarrar del
  fondo oscuro/la tarjeta y arrastrar a otro lugar con el rayo+gatillo, igual que un piso. (Control de
  Iluminación y Agente Limpio se excluyeron del export: no aportaban nada visible o no se necesitaban para
  esta versión.)

## Arquitectura: código en git, modelo en Vercel Blob

`rgd.glb` (la geometría real del edificio) es dato **confidencial del cliente** y nunca va a git — ni a este
repo ni a ningún otro. Pero si quedara como archivo local junto a `index.html`, un deploy disparado por un
`git push` (que construye solo con lo que hay en el repo) nunca lo tendría. Por eso:

- `index.html` / `main.js` viven en este repo de GitHub, conectado a Vercel → **cada `git push` a `main`
  despliega solo**, sin tocar nada a mano.
- `rgd.glb` se sube aparte a **Vercel Blob** (fuera de git), y `main.js` lo carga por una URL fija
  (`GLB_URL`, al principio del archivo) en vez de un archivo relativo.

Esto significa: cambios al código (gestos, panel, colores) → solo `git push`. Cambios al modelo (otra capa,
otro color, se regeneró `RGD_scene.usda`) → hay que volver a exportar y volver a subir a Blob (ver abajo).

## Archivos

- `export_rgd_gltf.py` — lee `/srv/isaac-shared/RGD/RGD_scene.usda` (la maqueta YA CONSTRUIDA en el repo
  grande, no se toca ni se reconstruye nada acá) y escribe `rgd.glb`: un nodo por piso + uno por su
  fantasma + las capas técnicas que no se excluyeron, con los mismos nombres que usa `rgd_mr_interaction.py`.
- `rgd.glb` — generado por el script de arriba, **nunca se commitea** (ver `.gitignore`); vive local y en
  Vercel Blob, no en git.
- `index.html` / `main.js` — la app (Three.js vía CDN, sin build/npm).
- `.env.local` — token de Vercel Blob (`BLOB_READ_WRITE_TOKEN`), lo crea `vercel blob create-store`;
  tampoco va a git.

## Regenerar y volver a publicar `rgd.glb` (cuando cambia el modelo)

```bash
~/isaacsim/_build/linux-x86_64/release/python.sh export_rgd_gltf.py
```

(primera vez: instala `pygltflib` en el python de Isaac Sim si no está — `numpy`/`pxr` ya vienen).

Después, subirlo a Vercel Blob (pisa el archivo anterior en la misma URL, `--force` para confirmar):

```bash
unset VERCEL_OIDC_TOKEN
export BLOB_READ_WRITE_TOKEN=$(grep BLOB_READ_WRITE_TOKEN .env.local | cut -d= -f2- | tr -d '"')
vercel blob put rgd.glb --access public --pathname rgd.glb --force
```

Si la URL resultante cambia (no debería, mismo `--pathname`), actualizar `GLB_URL` en `main.js` y hacer
`git push` para redesplegar el código.

## Publicar cambios de código

```bash
git add -A && git commit -m "..." && git push
```

Vercel está conectado al repo (`lauths12/rgd-web`): cada push a `main` dispara un deploy solo. La URL fija
para la clase es **https://rgd-sena.vercel.app** (alias — si Vercel asigna un dominio de producción nuevo,
hay que mover el alias con `vercel alias set <deployment> rgd-sena.vercel.app`).

**Importante** si el proyecto es nuevo o se reconecta: Vercel activa "Vercel Authentication" por defecto en
proyectos nuevos, que bloquea el acceso sin login — hay que apagarlo en
Project Settings → Deployment Protection, o el navegador de la Quest no va a poder abrir la página.

## Probar localmente (antes del día de la clase)

El navegador exige servir por http(s) (`file://` no carga los módulos de Three.js):

```bash
python3 -m http.server 8080
```

y abrir `http://localhost:8080/` en Chrome/Edge de escritorio — sin visor se ve una vista previa fija del
modelo (confirma que carga sin errores de consola y que la geometría/colores se ven bien). Para probar los
gestos del control sin visor: extensión de Chrome **Immersive Web Emulator** (de Meta).

## Probar en la Quest real

1. Navegador de la Quest → `rgd-sena.vercel.app`.
2. Tocar **"ENTER AR"**.
3. Si queda lejos, grip de cualquier control para traerlo frente a usted.
4. Rayo + gatillo cerca de un piso para separarlo; dos gatillos a la vez para mover/girar/agrandar todo;
   bajar la mirada para el panel de capas.

## No se toca

Nada del repo grande `isaac-cloudxr-lab` (Isaac Sim, CloudXR, kitchen/civil/urbano/gsplat, el panel de
control) — este repo solo lee `RGD_scene.usda` de ahí para exportar, nunca lo modifica.
