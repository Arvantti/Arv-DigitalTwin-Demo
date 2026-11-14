#!/usr/bin/env python3
"""Difumina en un clip las palabras propias de la planta de plásticos.

Uso: ocultar.py <fuente.mp4> <ss> <dur> <x,y,w,h> <ancho_salida> <salida.mp4>

Corta el recorte de la fuente a resolución completa, lee cada cuadro con OCR
(tesseract, español), busca las palabras de PATRON y difumina la línea entera
donde aparecen. Las cajas se extienden unos cuadros antes y después para que
no parpadeen cuando el OCR falla en un cuadro. Luego escala al ancho pedido.
"""
import hashlib, json, os, re, subprocess, sys, tempfile
os.environ["OMP_THREAD_LIMIT"] = "1"  # un hilo por tesseract; el paralelismo va por cuadros
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageFilter

PATRON = re.compile(r"mold|inyec|pl[aá]stic|resina|purga|fusi[oó]n|cubierto|desechab|balde|papeler|pedal|palanca|changeover|catalog", re.I)
FPS = 25
VECINOS = 2  # cuadros antes y después en que se mantiene cada caja


def ocr(png):
    # Se lee al doble de tamaño para no perder la letra pequeña; las cajas vuelven a escala 1.
    big = png[:-4] + "-x2.png"
    im = Image.open(png)
    im.resize((im.width * 2, im.height * 2), Image.LANCZOS).save(big)
    cajas = []
    # Dos lecturas: por bloques (psm 3) y texto suelto (psm 11); cada una encuentra líneas que la otra pierde.
    for psm in ("3", "11"):
        out = subprocess.run(["tesseract", big, "-", "-l", "spa", "--psm", psm, "tsv"], capture_output=True, text=True).stdout
        lineas, marcadas = {}, set()
        for f in out.splitlines()[1:]:
            c = f.split("\t")
            if len(c) < 12 or not c[11].strip():
                continue
            k = (c[2], c[3], c[4])
            x, y, w, h = (int(v) // 2 for v in c[6:10])
            lineas.setdefault(k, []).append((x, y, x + w, y + h))
            if PATRON.search(c[11]):
                marcadas.add(k)
        for k in marcadas:
            bs = lineas[k]
            cajas.append((min(b[0] for b in bs) - 8, min(b[1] for b in bs) - 6, max(b[2] for b in bs) + 8, max(b[3] for b in bs) + 6))
    os.remove(big)
    return cajas


def main():
    fuente, ss, dur, crop, ancho, salida = sys.argv[1:7]
    x0, y0, w0, h0 = map(int, crop.split(","))
    # Se lee un margen extra alrededor del recorte para reconocer también las líneas cortadas por el borde.
    M = 48
    x, y = max(0, x0 - M), max(0, y0 - M)
    w, h = min(1920, x0 + w0 + M) - x, min(1080, y0 + h0 + M) - y
    tmp = tempfile.mkdtemp(prefix="ocultar-")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", ss, "-t", dur, "-i", fuente, "-vf", f"crop={w}:{h}:{x}:{y},fps={FPS}", os.path.join(tmp, "f%04d.png")], check=True)
    cuadros = sorted(f for f in os.listdir(tmp) if f.endswith(".png") and "-x2" not in f)
    # El OCR se guarda por fuente+tramo+recorte, así la versión vertical y la horizontal lo comparten.
    cache = os.path.join(os.path.dirname(os.path.abspath(salida)), "ocr-" + hashlib.md5(f"{fuente}|{ss}|{dur}|{crop}|{PATRON.pattern}|x2|psm311|m48".encode()).hexdigest()[:12] + ".json")
    if os.path.exists(cache):
        cajas = json.load(open(cache))
    else:
        with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
            cajas = list(ex.map(lambda f: ocr(os.path.join(tmp, f)), cuadros))
        json.dump(cajas, open(cache, "w"))
    n = len(cuadros)
    for i, f in enumerate(cuadros):
        todas = [b for j in range(max(0, i - VECINOS), min(n, i + VECINOS + 1)) for b in cajas[j]]
        if not todas:
            continue
        p = os.path.join(tmp, f)
        im = Image.open(p).convert("RGB")
        for b in todas:
            b = (max(0, b[0]), max(0, b[1]), min(w, b[2]), min(h, b[3]))
            if b[2] <= b[0] or b[3] <= b[1]:
                continue
            im.paste(im.crop(b).filter(ImageFilter.GaussianBlur(9)), b[:2])
        im.save(p)
    hh = round(h0 * int(ancho) / w0 / 2) * 2
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"), "-vf", f"crop={w0}:{h0}:{x0 - x}:{y0 - y},scale={ancho}:{hh}:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "slow", salida], check=True)
    marcados = sum(1 for c in cajas if c)
    print(f"ocultar: {marcados}/{n} cuadros con palabras difuminadas -> {salida}")
    subprocess.run(["rm", "-rf", tmp])


if __name__ == "__main__":
    main()
