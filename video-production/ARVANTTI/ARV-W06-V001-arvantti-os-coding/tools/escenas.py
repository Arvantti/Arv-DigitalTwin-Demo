"""Crea episodios/<ep>/escenas/<nn-id>/script.md a partir del guion aprobado (markdown exportado del documento).
Uso: python3 -I tools/escenas.py <guiones.md>. Cada bloque largo se parte en escenas por la frase con que empieza."""
import os, re, sys

FIRMA = "Arvantti Operating System for AI. La IA bajo tu gobierno."
EPS = {
  "01-coding": [("gancho", "Gancho"), ("dolor", "Dolor"), ("sistema", "Solución"), ("envuelve", "No reemplaza"), ("cli", "Y se prefiere"),
                ("modulos", "Debajo hay"), ("medida", "Y todo se personaliza"), ("martes", "Prueba"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "02-organiza": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("tasks", "Solución"), ("sdd", "SDD es"), ("gobernanza", "Y eso es gobernanza"),
                  ("martes", "Prueba"), ("pedidos", "Ese mismo día"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "03-terminales": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("terminal", "Solución"), ("git", "Todo va integrado"), ("panel", "Desde un solo panel"),
                    ("multi", "Y es multi arnés"), ("coordinadora", "Y en cada proyecto"), ("martes", "Prueba"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "04-recuerda": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("brain", "Solución"), ("mapa", "Y Arvantti OS Coding le suma"), ("cache", "Cada agente recibe"),
                  ("martes", "Prueba"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "05-controla": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("policy", "Solución"), ("hooks", "Los hooks"), ("grants", "El módulo Grants"),
                  ("martes", "Prueba"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "06-protege": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("guardianes", "Solución"), ("conexiones", "Las herramientas externas"),
                 ("martes", "Prueba"), ("variable", "El guardián le deja"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "07-concilio": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("concilio", "Solución"), ("reparto", "Después, en la misma"), ("jerarquia", "Y ves la jerarquía"),
                  ("martes", "Prueba"), ("decision", "En el room de concilio exponen"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "08-flujos": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("flujos", "Solución"), ("inyecta", "Arvantti los inyecta"), ("qa", "Y en esos flujos"),
                ("martes", "Prueba"), ("funcional", "Después, la funcional"), ("figura", "Figura"), ("siguiente", "Cierre")],
  "09-rinde-cuentas": [("recap", "Recap"), ("gancho", "Gancho"), ("dolor", "Dolor"), ("receipts", "Solución"), ("ndjson", "Se guardan en NDJSON"), ("hoja", "Cada agente tiene su hoja"),
                       ("martes", "Prueba"), ("linea", "La línea la escribió"), ("figura", "Figura completa")],
}

md = open(sys.argv[1], encoding="utf8").read()
partes = re.split(r"^## Parte (\d) ", md, flags=re.M)
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
total = 0
for k, (ep, plan) in enumerate(EPS.items()):
    sec = partes[partes.index(str(k + 1)) + 1]
    bloques = {}
    for row in sec.splitlines():
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) == 4 and cells[0] not in ("Bloque", "---"):
            bloques[cells[0]] = cells[2].replace("&#32;", "").replace("\\_", "_").strip()
    out, cur = [], None
    for sid, key in plan:
        if key in bloques:
            out.append([sid, bloques[key]])
        else:  # partir el bloque anterior en la frase indicada
            txt = out[-1][1]
            i = txt.index(key)
            out[-1][1] = txt[:i].strip()
            out.append([sid, txt[i:].strip()])
    out.append(["firma", FIRMA])
    for n, (sid, txt) in enumerate(out, 1):
        d = os.path.join(here, "episodios", ep, "escenas", f"{n:02d}-{sid}")
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "script.md"), "w", encoding="utf8").write(txt + "\n")
        total += len(txt)
    print(ep, len(out), "escenas", sum(len(t) for _, t in out), "caracteres")
print("total", total)
