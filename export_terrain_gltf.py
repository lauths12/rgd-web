"""Exporta terrain.glb: relieve real (curvas de nivel) + vias reales alrededor de Bloque RGD, armados por
/srv/isaac-shared/isaac-cloudxr-lab/urbano/fetch_rgd_area.py a partir de datos abiertos de la Secretaria
Distrital de Planeacion de Bogota (ver ese script para de donde sale rgd_terrain_vial.json).

2026-11-11: "la idea es implementarlo bonito... creo que existe mapas de bogota que tiene esa info, es saber
la ubicacion del rgd y tomar ese pedazo y que se vea bonito tipo carretera y asi". Primer intento de encaje:
escala = la MISMA que usa rgd.glb (1/60, rgd_layout.MODEL_SCALE en el repo grande) para que calce de tamano
con el edificio; altura anclada en el punto exacto de RGD (el centro del recorte) contra el piso NT del
edificio (0.978, ver export_rgd_gltf.py/main.js); SIN ninguna rotacion todavia (THETA_DEG=0) porque no hay
ningun dato de orientacion real (norte) en el modelo BIM para saber cual es la correcta -- primer intento a
ojo, se ajusta con feedback en vivo (igual patron que ya se uso para la pendiente del suelo, ver git log).

A diferencia de rgd.glb: esto NO es dato confidencial (es informacion publica de Bogota, CC BY 4.0), asi que
terrain.glb SI puede ir a git -- no hace falta Vercel Blob para este archivo."""
import json
import math
import os

import numpy as np
import pygltflib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "/srv/isaac-shared/isaac-cloudxr-lab/urbano/data_rgd/rgd_terrain_vial.json"
OUT = os.path.join(HERE, "terrain.glb")

SCALE = 1.0 / 60.0  # igual que rgd_layout.MODEL_SCALE, para que el terreno calce de tamano con rgd.glb
GROUND_Y = 0.978  # mismo "nivel de terreno" (piso NT) que ya usa el edificio (ver export_rgd_gltf.py)
THETA_DEG = 0.0  # rotacion sin confirmar (no hay dato de norte real en el modelo BIM) -- primer intento, se
# ajusta con feedback en vivo igual que la pendiente del suelo que se probo antes
TERRAIN_COLOR = (0.33, 0.50, 0.30, 1.0)  # mismo verde ya validado en urbano_layout.TERRAIN_RGB
ROAD_COLOR = (0.22, 0.22, 0.24, 1.0)
ROAD_WIDTH_M = 6.0  # ancho real de una calle secundaria, en metros (antes de escalar)


def make_mapper(elev_at_rgd):
    theta = math.radians(THETA_DEG)
    cos_t, sin_t = math.cos(theta), math.sin(theta)

    def to_local(x, z, elev):
        rx = x * cos_t - z * sin_t
        rz = x * sin_t + z * cos_t
        return (rx * SCALE, (elev - elev_at_rgd) * SCALE + GROUND_Y, -rz * SCALE)

    return to_local


def road_quads(roads, to_local):
    """Cada tramo de via (polilinea) -> una cinta de quads de ROAD_WIDTH_M de ancho, pegada al relieve (cada
    punto ya trae su elevacion real del TIN, ver fetch_rgd_area.py)."""
    pts, tris = [], []
    for line in roads:
        for i in range(len(line) - 1):
            x0, z0, e0 = line[i]
            x1, z1, e1 = line[i + 1]
            dx, dz = x1 - x0, z1 - z0
            length = math.hypot(dx, dz)
            if length < 1e-6:
                continue
            nx, nz = -dz / length, dx / length
            hw = ROAD_WIDTH_M / 2
            corners_raw = [
                (x0 + nx * hw, z0 + nz * hw, e0),
                (x0 - nx * hw, z0 - nz * hw, e0),
                (x1 - nx * hw, z1 - nz * hw, e1),
                (x1 + nx * hw, z1 + nz * hw, e1),
            ]
            base = len(pts)
            for cx, cz, ce in corners_raw:
                pts.append(to_local(cx, cz, ce))
            tris.append((base, base + 1, base + 2))
            tris.append((base, base + 2, base + 3))
    return np.array(pts, dtype=np.float32), np.array(tris, dtype=np.uint32)


class GltfBuilder:
    """Version chica del builder de export_rgd_gltf.py: un nodo por malla, un material plano cada uno."""

    def __init__(self):
        self.gltf = pygltflib.GLTF2(scenes=[pygltflib.Scene(nodes=[])], scene=0)
        self.blob = bytearray()

    def _add_buffer_view(self, data, target=None):
        offset = len(self.blob)
        self.blob.extend(data)
        while len(self.blob) % 4:
            self.blob.append(0)
        idx = len(self.gltf.bufferViews)
        self.gltf.bufferViews.append(pygltflib.BufferView(buffer=0, byteOffset=offset, byteLength=len(data), target=target))
        return idx

    def add_node(self, name, points, tris, rgba):
        if len(points) == 0 or len(tris) == 0:
            return
        pos_bv = self._add_buffer_view(points.tobytes(), pygltflib.ARRAY_BUFFER)
        pos_acc = len(self.gltf.accessors)
        self.gltf.accessors.append(
            pygltflib.Accessor(
                bufferView=pos_bv, componentType=pygltflib.FLOAT, count=len(points), type="VEC3",
                min=points.min(axis=0).tolist(), max=points.max(axis=0).tolist(),
            )
        )
        flat = tris.reshape(-1)
        idx_bv = self._add_buffer_view(flat.astype(np.uint32).tobytes(), pygltflib.ELEMENT_ARRAY_BUFFER)
        idx_acc = len(self.gltf.accessors)
        self.gltf.accessors.append(pygltflib.Accessor(bufferView=idx_bv, componentType=pygltflib.UNSIGNED_INT, count=len(flat), type="SCALAR"))
        mat_idx = len(self.gltf.materials)
        self.gltf.materials.append(pygltflib.Material(pbrMetallicRoughness=pygltflib.PbrMetallicRoughness(baseColorFactor=list(rgba)), doubleSided=True))
        mesh_idx = len(self.gltf.meshes)
        self.gltf.meshes.append(pygltflib.Mesh(primitives=[pygltflib.Primitive(attributes=pygltflib.Attributes(POSITION=pos_acc), indices=idx_acc, material=mat_idx)]))
        node_idx = len(self.gltf.nodes)
        self.gltf.nodes.append(pygltflib.Node(name=name, mesh=mesh_idx))
        self.gltf.scenes[0].nodes.append(node_idx)

    def save(self, path):
        self.gltf.set_binary_blob(bytes(self.blob))
        self.gltf.buffers.append(pygltflib.Buffer(byteLength=len(self.blob)))
        self.gltf.save_binary(path)


def main():
    with open(SRC, "r", encoding="utf-8") as f:
        data = json.load(f)
    to_local = make_mapper(data["elev_at_rgd_m"])

    b = GltfBuilder()

    terrain_pts, terrain_tris = [], []
    for tri in data["triangles"]:
        base = len(terrain_pts)
        for x, z, e in tri:
            terrain_pts.append(to_local(x, z, e))
        terrain_tris.append((base, base + 1, base + 2))
    b.add_node("Terreno", np.array(terrain_pts, dtype=np.float32), np.array(terrain_tris, dtype=np.uint32), TERRAIN_COLOR)
    print(f"terreno: {len(terrain_tris)} triangulos")

    road_pts, road_tris = road_quads(data["roads"], to_local)
    b.add_node("Vias", road_pts, road_tris, ROAD_COLOR)
    print(f"vias: {len(road_tris)} triangulos")

    b.save(OUT)
    print(f"OK: {OUT} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
