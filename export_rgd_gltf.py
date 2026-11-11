"""Exporta RGD_scene.usda (la maqueta YA CONSTRUIDA, ver ../build_rgd_stage.py y ../apply_scale.py) a un solo
archivo .glb para la version standalone en el navegador de la Quest (ver rgd/web/, plan: "RGD standalone en
Meta Quest para presentarlo en una clase", 2026-11-10 -- sin PC, sin red que llegue hasta el laboratorio).

Un nodo glTF por grupo de piso (/root/Pisos/PisoNN_<label>) y uno por su fantasma (/root/Ghosts/..._ghost),
con los mismos nombres que ya usa rgd_mr_interaction.py (asi el JS puede buscarlos por nombre). Cada nodo
puede tener varias "primitivas" (una por material, igual que build_rgd_stage.merge_group_meshes fundio las
mallas por material dentro de cada grupo) -- NO se exportan los pisos de nuevo desde el CAD original, se leen
las mallas YA FUNDIDAS que dejo ese script.

Corre con el python de Isaac Sim (tiene pxr); pygltflib se instalo aparte (pip install pygltflib) porque solo
hace falta para este export, no para el resto del proyecto.

Normales: NO se preservan normales por-vertice (igual que en el merge original, ver esa nota en
build_rgd_stage.py) -- el visor (Three.js) las calcula solas con computeVertexNormals() al cargar.
Triangulacion: las caras fundidas pueden ser quads/ngons (vienen del CAD); glTF solo admite triangulos, asi
que cada cara se triangula en abanico desde su primer vertice (razonable: las piezas de este modelo son casi
todas planas)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RGD_DIR = os.path.join(HERE, "..")
sys.path.insert(0, RGD_DIR)

from isaacsim import SimulationApp

app = SimulationApp({"headless": True, "active_gpu": 1})

import numpy as np
import pygltflib
from pxr import Usd, UsdGeom, UsdShade

SCENE = "/srv/isaac-shared/RGD/RGD_scene.usda"
OUT = os.path.join(HERE, "rgd.glb")
EXCLUDED_TECH_INDICES = {1, 2}  # 1=Control de Iluminacion, 2=Agente Limpio (ver nota junto a su uso en main())


def shader_of(material_prim):
    for p in Usd.PrimRange(material_prim):
        if p.IsA(UsdShade.Shader):
            return UsdShade.Shader(p)
    return None


def material_color_opacity(mesh_prim):
    """(r,g,b,a) del material atado a mesh_prim, o gris opaco (0.8,0.8,0.8,1) si no se pudo leer nada --
    mismo criterio de "color generico" que build_rgd_stage.py usa para lo que no tiene color real."""
    mat, _ = UsdShade.MaterialBindingAPI(mesh_prim).ComputeBoundMaterial()
    if not mat:
        return (0.8, 0.8, 0.8, 1.0)
    sh = shader_of(mat.GetPrim())
    if not sh:
        return (0.8, 0.8, 0.8, 1.0)
    col_in = sh.GetInput("diffuseColor")
    col = col_in.Get() if col_in else None
    r, g, b = (col[0], col[1], col[2]) if col is not None else (0.8, 0.8, 0.8)
    op_in = sh.GetInput("opacity")
    op = op_in.Get() if op_in else None
    a = float(op) if op is not None else 1.0
    return (float(r), float(g), float(b), a)


def triangulate(fvc, fvi):
    """fvc: cuenta de vertices por cara. fvi: indices planos. -> lista de (i0,i1,i2) en abanico por cara."""
    tris = []
    off = 0
    for n in fvc:
        face = fvi[off : off + n]
        for k in range(1, n - 1):
            tris.append((face[0], face[k], face[k + 1]))
        off += n
    return tris


def mesh_primitives(group_prim):
    """[(points_world_Nx3_float32, triangles_Mx3_uint32, (r,g,b,a)), ...] -- una entrada por malla fundida
    (una por material) que haya dentro de este grupo (piso o fantasma)."""
    out = []
    for mesh_prim in Usd.PrimRange(group_prim):
        if not mesh_prim.IsA(UsdGeom.Mesh):
            continue
        mesh = UsdGeom.Mesh(mesh_prim)
        pts = mesh.GetPointsAttr().Get()
        fvc = mesh.GetFaceVertexCountsAttr().Get()
        fvi = mesh.GetFaceVertexIndicesAttr().Get()
        if not pts or not fvc or not fvi:
            continue
        xf = mesh.ComputeLocalToWorldTransform(Usd.TimeCode.Default())
        # RGD_scene.usda es Z-up (confirmado: UsdGeom.GetStageUpAxis == "Z"); glTF/Three.js esperan Y-up con
        # la camara mirando hacia -Z. Conversion (x,y,z)_usd -> (x,z,-y)_gltf: la altura (Z) pasa a ser Y
        # (arriba), y la distancia "hacia adelante" (Y, positiva en el USD por como la coloco apply_scale.py)
        # pasa a -Z (negativo = frente a la camara en Three.js/WebXR).
        pts_world = np.array([(p[0], p[2], -p[1]) for p in (xf.Transform(q) for q in pts)], dtype=np.float32)
        tris = np.array(triangulate(fvc, fvi), dtype=np.uint32)
        if tris.size == 0:
            continue
        out.append((pts_world, tris, material_color_opacity(mesh_prim)))
    return out


def discover_groups(stage):
    """[(nombre, prim), ...] para los grupos de piso (customData.floor_group, con hijos, fuera de
    /root/Ghosts), los fantasmas (customData.ghost_for), y las capas tecnicas (customData.technical_layer,
    con layer_index/layer_label) -- mismo criterio que rgd_mr_interaction.find_floor_groups/find_ghosts/
    find_technical_layers, reimplementado chico aca para no importar ese modulo (que arrastra XR/fisica,
    innecesario para un export). Las capas tecnicas se devuelven [(indice, label, prim), ...] en orden fijo
    (0=Seguridad y Control, 1=Control de Iluminacion, 2=Agente Limpio, 3=Electrico -- ver TECH_LAYERS en
    build_rgd_stage.py), que es tambien el orden de los botones del panel."""
    floors, ghosts, tech = [], [], []
    for p in stage.Traverse():
        path = str(p.GetPath())
        if p.GetCustomDataByKey("floor_group") and len(p.GetChildren()) > 0 and not path.startswith("/root/Ghosts/"):
            floors.append((p.GetName(), p))
        if p.GetCustomDataByKey("ghost_for"):
            ghosts.append((p.GetName(), p))
        if p.GetCustomDataByKey("technical_layer"):
            idx = p.GetCustomDataByKey("layer_index") or 0
            label = p.GetCustomDataByKey("layer_label") or p.GetName()
            tech.append((idx, label, p))
    floors.sort(key=lambda t: t[1].GetCustomDataByKey("floor_index") or 0)
    tech.sort(key=lambda t: t[0])
    return floors, ghosts, tech


class GltfBuilder:
    """Un .glb con un nodo por grupo (piso o fantasma), cada uno con varias primitivas (una por material).
    Cachea materiales por color para no duplicar (varios pisos comparten los mismos colores reales)."""

    def __init__(self):
        self.gltf = pygltflib.GLTF2(scenes=[pygltflib.Scene(nodes=[])], scene=0)
        self.blob = bytearray()
        self.mat_cache = {}  # (r,g,b,a) redondeado -> indice de material

    def _material_index(self, rgba):
        key = tuple(round(v, 4) for v in rgba)
        if key in self.mat_cache:
            return self.mat_cache[key]
        idx = len(self.gltf.materials)
        alpha_mode = "BLEND" if key[3] < 0.999 else "OPAQUE"
        self.gltf.materials.append(
            pygltflib.Material(
                pbrMetallicRoughness=pygltflib.PbrMetallicRoughness(baseColorFactor=list(key), metallicFactor=0.1, roughnessFactor=0.7),
                alphaMode=alpha_mode,
                doubleSided=True,
            )
        )
        self.mat_cache[key] = idx
        return idx

    def _add_buffer_view(self, data: bytes, target=None):
        offset = len(self.blob)
        self.blob.extend(data)
        while len(self.blob) % 4:  # alineado a 4 bytes (glTF lo pide)
            self.blob.append(0)
        idx = len(self.gltf.bufferViews)
        self.gltf.bufferViews.append(pygltflib.BufferView(buffer=0, byteOffset=offset, byteLength=len(data), target=target))
        return idx

    def _add_accessor(self, buffer_view, count, comp_type, el_type, mins=None, maxs=None):
        idx = len(self.gltf.accessors)
        self.gltf.accessors.append(
            pygltflib.Accessor(bufferView=buffer_view, componentType=comp_type, count=count, type=el_type, min=mins, max=maxs)
        )
        return idx

    def add_node(self, name, primitives, visible=True, extra=None):
        """primitives: [(points Nx3 float32, tris Mx3 uint32, rgba), ...]. visible=False -> extras.visible=False
        para que el JS arranque ocultandolo (fantasmas y capas tecnicas, que empiezan apagadas). extra: campos
        adicionales para extras (ej. {"label": "Seguridad y Control", "techIndex": 0})."""
        mesh_primitives_out = []
        for pts, tris, rgba in primitives:
            if len(pts) == 0 or len(tris) == 0:
                continue
            pos_bytes = pts.tobytes()
            pos_bv = self._add_buffer_view(pos_bytes, pygltflib.ARRAY_BUFFER)
            pos_acc = self._add_accessor(
                pos_bv, len(pts), pygltflib.FLOAT, "VEC3", mins=pts.min(axis=0).tolist(), maxs=pts.max(axis=0).tolist()
            )
            flat = tris.reshape(-1)
            use_short = flat.max() < 65535 if flat.size else True
            idx_arr = flat.astype(np.uint16 if use_short else np.uint32)
            idx_bytes = idx_arr.tobytes()
            idx_bv = self._add_buffer_view(idx_bytes, pygltflib.ELEMENT_ARRAY_BUFFER)
            idx_acc = self._add_accessor(idx_bv, len(flat), pygltflib.UNSIGNED_SHORT if use_short else pygltflib.UNSIGNED_INT, "SCALAR")
            mesh_primitives_out.append(
                pygltflib.Primitive(attributes=pygltflib.Attributes(POSITION=pos_acc), indices=idx_acc, material=self._material_index(rgba))
            )
        if not mesh_primitives_out:
            return None
        mesh_idx = len(self.gltf.meshes)
        self.gltf.meshes.append(pygltflib.Mesh(primitives=mesh_primitives_out))
        node_idx = len(self.gltf.nodes)
        extras = {"visible": visible, **(extra or {})}
        self.gltf.nodes.append(pygltflib.Node(name=name, mesh=mesh_idx, extras=extras))
        self.gltf.scenes[0].nodes.append(node_idx)
        return node_idx

    def save(self, path):
        self.gltf.set_binary_blob(bytes(self.blob))
        self.gltf.buffers.append(pygltflib.Buffer(byteLength=len(self.blob)))
        self.gltf.save_binary(path)


def main():
    ctx_app = app
    stage = Usd.Stage.Open(SCENE)
    floors, ghosts, tech = discover_groups(stage)
    print(f"pisos: {len(floors)}  fantasmas: {len(ghosts)}  capas tecnicas: {len(tech)}")

    b = GltfBuilder()
    n_tris_total = 0
    for name, prim in floors:
        prims = mesh_primitives(prim)
        n_tris_total += sum(len(t) for _, t, _ in prims)
        b.add_node(name, prims, visible=True)
        print(f"  piso {name}: {len(prims)} sub-mallas")
    for name, prim in ghosts:
        prims = mesh_primitives(prim)
        n_tris_total += sum(len(t) for _, t, _ in prims)
        b.add_node(name, prims, visible=False)  # fantasma: arranca oculto, el JS lo muestra al arrastrar
        print(f"  fantasma {name}: {len(prims)} sub-mallas")
    for idx, label, prim in tech:
        if idx in EXCLUDED_TECH_INDICES:
            # 2026-11-11: "quita la capa de luces que son solo como puntos amarillos" (Control de Iluminacion,
            # indice 1: puntos/marcadores de artefactos de luz, no geometria real reconocible a esta escala) +
            # "quita el de agente limpio" (indice 2, a pedido del usuario, sin razon especifica dada -- se
            # excluye igual que la de arriba). Se excluyen del export (ni entran al .glb ni al panel) en vez
            # de solo ocultarlas -- no hay uso razonable para ellas en esta version.
            print(f"  capa tecnica {label} (Tech_{idx}): excluida a pedido del usuario")
            continue
        prims = mesh_primitives(prim)
        n_tris_total += sum(len(t) for _, t, _ in prims)
        # nombre fijo "Tech_<indice>" (no el label, que tiene espacios/tildes) para que main.js lo busque
        # directo; el label de verdad (para el boton del panel) va en extras.label.
        b.add_node(f"Tech_{idx}", prims, visible=False, extra={"label": label, "techIndex": idx})
        print(f"  capa tecnica {label} (Tech_{idx}): {len(prims)} sub-mallas")

    b.save(OUT)
    size_mb = os.path.getsize(OUT) / (1024 * 1024)
    print(f"OK: {OUT} ({size_mb:.1f} MB, {n_tris_total} triangulos, {len(b.gltf.materials)} materiales)")
    ctx_app.close()


if __name__ == "__main__":
    main()
