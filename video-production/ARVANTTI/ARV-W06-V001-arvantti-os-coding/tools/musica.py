"""Pista original de la serie Coding, sintetizada (sin servicios externos): pads cálidos, pulso suave,
arpegio ligero y percusión electrónica que entra a la mitad. Uso: python3 -I tools/musica.py <salida.wav>"""
import sys, numpy as np
SR = 44100; BPM = 96; BEAT = 60 / BPM; BAR = 4 * BEAT
BARS = 48; N = int(BARS * BAR * SR) + SR * 4
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
# Am9 - Fmaj7 - C(add9) - G6 , dos compases cada uno
PROG = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 60, 62, 64], [55, 59, 62, 64, 67]]
BASS = [45, 41, 48, 43]
def env(n, a, r):
    e = np.ones(n); ai = int(a * SR); ri = int(r * SR)
    e[:ai] = np.linspace(0, 1, ai); e[-ri:] *= np.linspace(1, 0, ri); return e
def add(sig, start, pan=0.0, g=1.0):
    i = int(start * SR); j = min(N, i + len(sig)); s = sig[: j - i] * g
    L[i:j] += s * (1 - pan) * 0.5 * 2 ** 0.5; R[i:j] += s * (1 + pan) * 0.5 * 2 ** 0.5
rng = np.random.default_rng(7)
def intensity(b):  # 0..1 forma de la pieza
    return min(1, 0.35 + b / 30)
for b in range(0, BARS, 2):
    ch = PROG[(b // 2) % 4]; dur = 2 * BAR + 1.5; n = int(dur * SR); tt = np.arange(n) / SR
    pad = np.zeros(n)
    for k, m in enumerate(ch):
        f = hz(m)
        for det in (-0.07, 0.07):
            ph = rng.random() * 6.28
            pad += np.sin(2 * np.pi * f * (1 + det / 100) * tt + ph) * 0.5 + 0.18 * np.sin(2 * np.pi * 2 * f * tt + ph)
    pad *= env(n, 1.2, 1.6) / len(ch) * 0.32 * (0.8 + 0.4 * intensity(b))
    add(pad, b * BAR, pan=-0.2 if (b // 2) % 2 else 0.2)
    # bajo
    fb = hz(BASS[(b // 2) % 4]); nb = int(2 * BAR * SR); tb = np.arange(nb) / SR
    bass = (np.sin(2 * np.pi * fb * tb) + 0.3 * np.sin(2 * np.pi * 2 * fb * tb)) * env(nb, 0.05, 0.6) * 0.22 * intensity(b)
    add(bass, b * BAR)
# pulso de corcheas (sintetizador suave) y arpegio
for s in range(int(BARS * 8)):
    b = s // 8; ch = PROG[(b // 2) % 4]; ts = s * BEAT / 2
    n = int(0.28 * SR); tt = np.arange(n) / SR
    f = hz(ch[0] + 12)
    pl = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 14) * 0.06 * intensity(b)
    add(pl, ts, pan=0.0)
    if b >= 8 and s % 2 == 0:
        m = ch[[0, 2, 4, 3][(s // 2) % 4]] + 12
        fa = hz(m); na = int(0.6 * SR); ta = np.arange(na) / SR
        ar = (np.sin(2 * np.pi * fa * ta) + 0.25 * np.sin(2 * np.pi * 3 * fa * ta)) * np.exp(-ta * 6) * 0.055 * intensity(b)
        add(ar, ts, pan=0.45 if (s // 2) % 2 else -0.45)
# percusión: bombo suave y hi-hat desde el compás 16; golpes cada 8 compases
for q in range(int(BARS * 4)):
    b = q // 4; tq = q * BEAT
    if b >= 16:
        n = int(0.35 * SR); tt = np.arange(n) / SR
        kick = np.sin(2 * np.pi * (48 + 80 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9) * 0.28
        add(kick, tq)
        nh = int(0.06 * SR); hh = rng.standard_normal(nh) * np.exp(-np.arange(nh) / SR * 80) * 0.025
        add(np.diff(hh, prepend=0), tq + BEAT / 2, pan=0.3)
    if q % 32 == 0 and b >= 8:
        n = int(2.5 * SR); tt = np.arange(n) / SR
        imp = (np.sin(2 * np.pi * 40 * tt) * 0.35 + rng.standard_normal(n) * 0.03) * np.exp(-tt * 2.2)
        add(imp, tq)
# reverberación simple (retardos con realimentación)
def rev(x):
    y = x.copy()
    for d, g in ((0.031, 0.5), (0.047, 0.45), (0.071, 0.4), (0.113, 0.35), (0.173, 0.3)):
        k = int(d * SR); z = np.zeros_like(x)
        for rep in range(1, 6): z[k * rep:] += x[: len(x) - k * rep] * g ** rep
        y += z * 0.35
    return y
L, R = rev(L), rev(R)
fade = int(4 * SR); L[-fade:] *= np.linspace(1, 0, fade); R[-fade:] *= np.linspace(1, 0, fade)
st = np.stack([L, R], 1); st /= np.abs(st).max() * 1.12
import wave
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype("<i2").tobytes())
print(f"{N / SR:.1f} s")
