# Usage: python3 scripts/samples/render_guitar.py shared/sound/samples/steel-guitar path/to/GeneralUser-GS.sf2
# Needs numpy and ffmpeg. The .sf2 is not kept in the repo (32 MB).
# Pre-render GeneralUser GS "Steel Guitar" (bank 0, program 25) into one-shot notes.
# Follows the preset's loop, volume envelope and velocity-driven filter sweep, so the
# browser can play finished plucks with no SoundFont engine.
import json, math, os, subprocess, sys, wave
import numpy as np
from sf2 import SF2

SF = sys.argv[2] if len(sys.argv) > 2 else 'GeneralUser-GS.sf2'
OUT = sys.argv[1]
SR = 44100
VEL = 105 / 127

def s16(v): return v - 65536 if v > 32767 else v
def tc(t): return 2 ** (t / 1200)          # timecents -> seconds
def hz(c): return 8.176 * 2 ** (c / 1200)  # absolute cents -> Hz

sf = SF2(SF)
pi = sf.preset(0, 25)
pzones = sf._zones(sf.phdr, 3, sf.pbag, sf.pgen, pi)
pglob = pzones[0]
izones = sf._zones(sf.inst, 1, sf.ibag, sf.igen, 255)
iglob, ilocal = izones[0], izones[1:]
# Velocity -> modEnvToFilterFc amount per preset zone, from the pmod chunk (read earlier).
VEL_FILTER = [6850, 6457, 6063, 5669, 5276, 4882, 4488, 4095, 3701, 2913]

def gen(z, k, default=0):
    return s16(z.get(k, iglob.get(k, default)))

notes = []
for n, z in enumerate(ilocal):
    sh = sf.shdr[z[53]]
    name, start, end, ls, le, rate, root, corr = sf.name(sh[0]), sh[1], sh[2], sh[3], sh[4], sh[5], sh[6], sh[7]
    key = root
    fine = gen(z, 52) + corr
    off = gen(z, 0) + 32768 * gen(z, 4)
    pcm = sf.pcm({'start': start, 'end': end})
    ls_i, le_i = ls - start, le - start
    # Volume envelope (instrument + preset relative gens).
    hold = tc(gen(z, 35, -12000) + gen(z, 39) * (60 - key))
    decay = tc(gen(z, 36, -12000) + s16(pglob.get(36, 0)) + gen(z, 40) * (60 - key))
    # Modulation envelope: instant attack, then linear decay toward the sustain level.
    mdecay = tc(gen(z, 28, -12000) + s16(pglob.get(28, 0)) + gen(z, 32) * (60 - key))
    msus = 1 - (gen(z, 29) + s16(pglob.get(29, 0))) / 1000
    fc0 = gen(z, 8, 13500) + s16(pglob.get(8, 0)) + 5000 * (2 * key / 127 - 1)
    menv_amt = s16(pglob.get(11, 0)) + VEL_FILTER[n] * VEL
    length = 3.5
    N = int(SR * length)
    step = rate / SR * 2 ** (fine / 1200)
    out = np.zeros(N, dtype=np.float64)
    pos = float(off)
    loop_len = le_i - ls_i
    for i in range(N):
        ip = int(pos); fr = pos - ip
        a = pcm[ip]; b = pcm[ip + 1] if ip + 1 < len(pcm) else pcm[ip]
        out[i] = a + (b - a) * fr
        pos += step
        if loop_len > 1 and pos >= le_i:
            pos -= loop_len
        elif pos >= len(pcm) - 2:
            break
    t = np.arange(N) / SR
    db = np.where(t < hold, 0.0, 100.0 * (t - hold) / decay)
    amp = 10 ** (-db / 20)
    menv = np.maximum(msus, 1 - (1 - msus) * t / mdecay) if mdecay > 0 else np.full(N, msus)
    fc = np.clip(hz(fc0 + menv_amt * menv), 20, SR * 0.45)
    # Time-varying 2-pole lowpass (Butterworth Q), coefficients updated every 32 samples.
    y = np.zeros(N); x1 = x2 = y1 = y2 = 0.0
    q = 1 / math.sqrt(2)
    for blk in range(0, N, 32):
        w = 2 * math.pi * fc[blk] / SR
        al = math.sin(w) / (2 * q); cw = math.cos(w)
        b0 = (1 - cw) / 2; b1 = 1 - cw; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al
        b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b0 / a0, a1 / a0, a2 / a0
        for i in range(blk, min(blk + 32, N)):
            x = out[i]
            yy = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
            x2, x1, y2, y1 = x1, x, y1, yy
            y[i] = yy
    y *= amp
    fade = int(SR * 0.4)
    y[-fade:] *= np.linspace(1, 0, fade) ** 2
    notes.append(dict(name=name, root=key, lo=z[43] & 255, hi=z[43] >> 8, data=y))
    print(f'{name}: hold {hold:.2f}s, decay {decay:.1f}s/100dB, filter {hz(fc0):.0f}Hz -> peak {hz(fc0+menv_amt):.0f}Hz', flush=True)

peak = max(np.abs(n['data']).max() for n in notes)
gain = 10 ** (-1 / 20) / peak
os.makedirs(OUT, exist_ok=True)
manifest = []
for n in notes:
    fid = n['name'].split('-')[-1].replace('#', 's')
    wav = f'/tmp/{fid}.wav'
    pcm16 = np.clip(n['data'] * gain, -1, 1)
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((pcm16 * 32767).astype('<i2').tobytes())
    mp3 = os.path.join(OUT, f'{fid}.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '80k', mp3], check=True)
    manifest.append({'file': f'{fid}.mp3', 'root': n['root'], 'lo': n['lo'], 'hi': n['hi']})
json.dump({'name': 'Steel Guitar', 'source': 'GeneralUser GS v2.0.3 by S. Christian Collins (bank 0, program 25)',
           'velocity': 105, 'notes': manifest}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=2)
print('gain', round(gain, 3))
