"""Cut, level and encode the game's recorded sounds from the downloaded Freesound previews.

    python tools/build-sounds.py <folder of raw previews>

Raw files are named NN_k_<freesound id>.mp3 (see tools/sound-sources.md for where each came from; all CC0).
Each cut is made mono, trimmed, faded, levelled and written to sounds/ as mp3; sounds/manifest.json lists the takes
for each sound name that sound.js asks for. Percussive sounds are levelled by peak, sustained ones by loudness.
"""
import json, os, re, subprocess, sys

RAW = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'sounds')

# name: (kind, level dB, [(freesound id, start, end), ...])   kind 'p' = peak-levelled, 'm' = mean-levelled
CUTS = {
    'door':      ('m', -20, [(764798, 0.85, 3.05), (455852, 0.67, 2.9)]),
    'slam':      ('p', -2,  [(372877, 0.0, 1.1), (444409, 0.0, 0.93)]),
    'thump':     ('p', -4,  [(202106, 0.4, 1.05), (202106, 1.6, 2.3)]),
    'knock':     ('p', -3,  [(865364, 0.25, 0.55), (865364, 0.71, 1.02), (865364, 1.15, 1.47), (865364, 1.58, 1.95),
                             (621234, 0.26, 0.5), (621234, 0.53, 0.8)]),
    'snowstep':  ('p', -5,  [(432285, 0.2, 0.75), (432285, 1.47, 2.25), (432285, 2.94, 3.55), (432285, 4.12, 4.8), (432285, 5.5, 6.22)]),
    'stomach':   ('m', -22, [(447911, 0.0, 2.04), (811274, 0.9, 3.5), (696404, 0.13, 2.9)]),
    'howl':      ('m', -22, [(500646, 1.9, 9.6), (500646, 29.3, 36.2)]),
    'scratch':   ('m', -22, [(521697, 0.69, 2.7), (417537, 4.08, 5.65), (417537, 0.36, 2.3)]),
    'creak':     ('p', -4,  [(506665, 0.0, 1.1), (646696, 0.0, 0.95), (164523, 0.0, 0.7), (248258, 0.29, 1.08)]),
    'scream':    ('m', -15, [(850699, 0.0, 2.7), (673427, 0.0, 2.5), (220814, 0.0, 0.86)]),
    'monster':   ('m', -17, [(416232, 1.9, 3.95), (416232, 5.55, 7.5), (763026, 1.5, 4.2)]),
    'whisper':   ('m', -25, [(234044, 0.58, 3.55), (832739, 0.0, 4.1), (193818, 2.1, 6.2)]),
    'heartbeat': ('p', -5,  [(488827, 0.10, 0.63), (488827, 0.67, 1.24)]),
    'shatter':   ('p', -2,  [(613879, 0.24, 1.85), (660214, 0.0, 2.75)]),
    'sizzle':    ('m', -23, [(630497, 0.2, 3.4)]),
    'stinger':   ('p', -1,  [(867757, 0.76, 2.3), (867757, 3.22, 4.4), (867757, 5.3, 6.5)]),
    'sting':     ('m', -20, [(725225, 0.0, 3.3), (840810, 0.3, 3.8)]),
    'trap':      ('p', -3,  [(752070, 0.0, 1.0), (278203, 0.0, 0.45)]),
    'squeak':    ('p', -6,  [(288941, 0.0, 1.45), (574107, 1.0, 1.52)]),
    'scuttle':   ('p', -7,  [(574107, 0.0, 0.7), (574107, 1.72, 2.82), (574107, 5.14, 5.98)]),
    'hiss':      ('m', -21, [(666290, 0.0, 1.9), (870180, 0.3, 2.4)]),
    'crack':     ('p', -3,  [(753925, 1.8, 2.5), (753925, 3.4, 4.1), (753925, 4.4, 5.1)]),
    'bite':      ('m', -22, [(79243, 0.14, 2.5)]),
    # loops: the whole of a recording made to loop, or a stretch crossfaded into itself
    'fire_loop': ('m', -24, [(813328, 0.0, 35.0)]),
    'wind_loop': ('m', -24, [(638434, 0.0, 20.57)]),
    'drone_loop': ('m', -24, [(865550, 20.0, 64.0)]),
}
LOOPS = {'fire_loop': 0, 'wind_loop': 0, 'drone_loop': 4.0}   # seconds of crossfade to make a seam

def raw(fid):
    for f in os.listdir(RAW):
        if f.endswith(f'_{fid}.mp3'):
            return os.path.join(RAW, f)
    raise SystemExit(f'missing raw file for {fid}')

def measure(path, a, b):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-ss', str(a), '-t', str(b - a), '-i', path, '-ac', '1',
                        '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.search(r'mean_volume: ([-\d.]+)', r).group(1)), float(re.search(r'max_volume: ([-\d.]+)', r).group(1))

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith(('.mp3', '.ogg')):
        os.remove(os.path.join(OUT, f))
manifest, total = {}, 0
for name, (kind, level, cuts) in CUTS.items():
    manifest[name] = []
    for i, (fid, a, b) in enumerate(cuts):
        src = raw(fid)
        mean, peak = measure(src, a, b)
        gain = (level - peak) if kind == 'p' else min(level - mean, -1 - peak)
        d = b - a
        out = f'{name}{i + 1}.' + ('ogg' if name in LOOPS else 'mp3')   # ogg loops have no encoder gap at the seam
        xf = LOOPS.get(name)
        if xf:
            # the last xf seconds faded out over the first xf seconds faded in: the end meets the start
            af = (f'[0:a]aformat=channel_layouts=mono,volume={gain:.1f}dB,asplit[x][y];'
                  f'[x]atrim=0:{xf},afade=t=in:d={xf}[head];[y]atrim={d - xf}:{d},asetpts=PTS-STARTPTS,afade=t=out:d={xf}[tail];'
                  f'[0:a]aformat=channel_layouts=mono,volume={gain:.1f}dB,atrim={xf}:{d - xf},asetpts=PTS-STARTPTS[mid];'
                  f'[head][tail]amix=inputs=2:normalize=0[seam];[mid][seam]concat=n=2:v=0:a=1[o]')
            args = ['-filter_complex', af, '-map', '[o]']
        else:
            fades = '' if name in LOOPS else f',afade=t=in:d=0.004,afade=t=out:st={max(0, d - min(0.12, d * 0.3)):.3f}:d={min(0.12, d * 0.3):.3f}'
            args = ['-ac', '1', '-af', f'volume={gain:.1f}dB{fades},alimiter=limit=0.95']
        codec = ['-codec:a', 'libvorbis', '-q:a', '2'] if name in LOOPS else ['-codec:a', 'libmp3lame', '-q:a', '4']
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(a), '-t', str(d), '-i', src, *args,
                        '-ar', '44100', '-ac', '1', *codec, os.path.join(OUT, out)], check=True)
        total += os.path.getsize(os.path.join(OUT, out))
        manifest[name].append(out)
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print(f'{sum(len(v) for v in manifest.values())} files, {total / 1024:.0f} KB')
