# Video resumen de la serie: une los 8 videos (masters en out/), con el heptágono antes de cada módulo.
# Las aperturas 3-8 sin "Parte N de 8" se renderizan con SIN_PARTE=1 a out/<salida>[-h]-gancho.mp4.
# uso: python3 resumen.py v|h salida.mp4
import json, subprocess, sys
o, salida = sys.argv[1], sys.argv[2]
R = "/home/user/Arv-DigitalTwin-Demo/video-production/ARVANTTI/ARV-W04-V001-serie-modulos/"
H = "-h" if o == "h" else ""
M = {"01-nucleo": ("serie-01-nucleo", "v001" if H else "v004"), "02-integrator": ("serie-02-integrator", "v001" if H else "v002"),
     "03-aps": ("serie-03-aps", "v002" if H else "v003"), "04-cosimulation": ("serie-04-cosimulation", "v002" if H else "v003"),
     "05-fractal": ("serie-05-fractal", "v001"), "06-control-center": ("serie-06-control-center", "v001"),
     "07-dendro-scada": ("serie-07-dendro-scada", "v001"), "08-ai-assistant": ("serie-08-ai-assistant", "v001")}
def T(v): return {s["id"]: s for s in json.load(open(R + f"videos/{v}/tiempos.json"))}
def master(v): n, ver = M[v]; return R + f"out/{n}{H}-{ver}.mp4"
def dur(f): return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]))
segs = []  # (archivo, desde, hasta, fundido_entrada, fundido_salida)
for i, v in enumerate(M):
    t = T(v); m = master(v)
    if i == 0:  # núcleo: completo hasta el heptágono incluido (presenta el sistema)
        segs.append((m, 0, t["cierre"]["start"], False, True)); continue
    segs.append((m, t["modulos"]["start"], t["cierre"]["start"], True, True))  # heptágono con el módulo resaltado
    g = R + f"out/{M[v][0]}{H}-gancho.mp4" if v not in ("02-integrator",) else None
    if g: segs.append((g, 0, t["dolor"]["start"], True, False))
    else: segs.append((m, 0, t["dolor"]["start"], True, False))
    last = v == "08-ai-assistant"
    segs.append((m, t["dolor"]["start"], t["modulos"]["start"], False, not last))
    if last: segs.append((m, t["cierre"]["start"], dur(m), True, False))
IN, FC, CAT = [], "", ""
for k, (f, a, b, fi, fo) in enumerate(segs):
    IN += ["-i", f]; d = b - a
    vf = f"trim={a}:{b},setpts=PTS-STARTPTS,fps=25,format=yuv420p" + (",fade=t=in:st=0:d=0.3" if fi else "") + (f",fade=t=out:st={d-0.3:.3f}:d=0.3" if fo else "")
    af = f"atrim={a}:{b},asetpts=PTS-STARTPTS,aresample=48000" + (",afade=t=in:st=0:d=0.2" if fi else "") + (f",afade=t=out:st={d-0.3:.3f}:d=0.3" if fo else "")
    FC += f"[{k}:v]{vf}[v{k}];[{k}:a]{af}[a{k}];"; CAT += f"[v{k}][a{k}]"
FC += f"{CAT}concat=n={len(segs)}:v=1:a=1[v][a]"
subprocess.run(["ffmpeg", "-v", "error", "-y", *IN, "-filter_complex", FC, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", salida], check=True)
print(salida, dur(salida))
