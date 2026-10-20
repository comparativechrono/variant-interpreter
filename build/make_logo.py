#!/usr/bin/env python3
"""Draw the site's logo, assets/img/logo.svg: the small mark (assets/img/mark.svg) at a larger size and with more
detail. A double helix whose strands pass over each other, with its base pairs, above the five classes of the
ACMG/AMP scale (benign to pathogenic) and the pointer on likely pathogenic, as on the mark.

usage: python3 build/make_logo.py      (no packages needed)
"""
import math
# The site's mark (assets/img/mark.svg), drawn larger and with more detail: a double helix whose strands cross and
# whose base pairs show, above the five classes of the ACMG/AMP scale with the pointer on likely pathogenic.
W = 256
x0, x1 = 46, 210          # the helix's extent
cy, amp = 86, 25          # its centre line and amplitude
period = (x1 - x0) / 2    # two full turns
def ya(x): return cy + amp * math.sin(2 * math.pi * (x - x0) / period)
def yb(x): return cy - amp * math.sin(2 * math.pi * (x - x0) / period)
def path(f, xa, xb, step=1.0):
    pts = []
    x = xa
    while x < xb - 1e-9:
        pts.append((x, f(x)))
        x += step
    pts.append((xb, f(xb)))
    d = 'M%.1f %.1f' % pts[0] + ''.join('L%.1f %.1f' % p for p in pts[1:])
    return d
# seen from the side, a strand is in front of the other between one of its turns and the next (cos > 0 for strand A),
# so each strand passes over the other at a crossing: split the strands where they swap, at the peaks and troughs
t2x = lambda t: x0 + t * period / (2 * math.pi)
cuts = [x0] + [t2x(math.pi / 2 + k * math.pi) for k in range(4)] + [x1]
back, front = [], []
for a, b in zip(cuts[:-1], cuts[1:]):
    m = (a + b) / 2
    a_front = math.cos(2 * math.pi * (m - x0) / period) > 0
    (front if a_front else back).append(path(ya, a, b))
    (back if a_front else front).append(path(yb, a, b))
# base pairs: rungs between the strands, kept away from the crossings where the strands meet
rungs = []
n = 15
for k in range(n):
    x = x0 + (k + 0.5) * (x1 - x0) / n
    y1, y2 = ya(x), yb(x)
    if abs(y1 - y2) < 14: continue
    lo, hi = min(y1, y2) + 5, max(y1, y2) - 5
    rungs.append((x, lo, hi))
# the scale: benign to pathogenic
sx0, sx1, sy, sh = 42, 214, 168, 24
cols = ['#1e4f86', '#2f6fa8', '#8a6d1f', '#c4432f', '#9e1b32']
seg_w = (sx1 - sx0) / 5
px = sx0 + seg_w * 3.5            # the pointer: on likely pathogenic, as on the small mark
out = []
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {W}" width="{W}" height="{W}" role="img" aria-labelledby="t">')
out.append('<title id="t">Variant interpreter</title>')
out.append('<defs>')
out.append('<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27838f"/><stop offset="1" stop-color="#175c69"/></linearGradient>')
out.append('<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>')
out.append(f'<clipPath id="bar"><rect x="{sx0}" y="{sy}" width="{sx1 - sx0}" height="{sh}" rx="6"/></clipPath>')
out.append('</defs>')
# the tile, with a soft light from above and a fine inner edge
out.append(f'<rect x="6" y="6" width="{W - 12}" height="{W - 12}" rx="54" fill="url(#tile)"/>')
out.append(f'<rect x="6" y="6" width="{W - 12}" height="{(W - 12) * 0.6:.0f}" rx="54" fill="url(#sheen)"/>')
out.append(f'<rect x="8" y="8" width="{W - 16}" height="{W - 16}" rx="52" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>')
# the helix: the strands behind, the base pairs, the strands in front
out.append('<g fill="none" stroke-linecap="round">')
for d in back: out.append(f'<path d="{d}" stroke="#fff" stroke-opacity=".42" stroke-width="7"/>')
for (x, lo, hi) in rungs:
    mid = (lo + hi) / 2
    # each base pair in two halves, one a little brighter, as two bases meeting
    out.append(f'<path d="M{x:.1f} {lo:.1f}V{mid - 1.5:.1f}" stroke="#fff" stroke-opacity=".55" stroke-width="4"/>')
    out.append(f'<path d="M{x:.1f} {mid + 1.5:.1f}V{hi:.1f}" stroke="#bfe3e8" stroke-opacity=".5" stroke-width="4"/>')
for d in front: out.append(f'<path d="{d}" stroke="#fff" stroke-opacity=".95" stroke-width="7"/>')
out.append('</g>')
# the pointer, reading the class from the evidence above it
out.append(f'<path d="M{px:.1f} {sy - 6}l-11 -17h22z" fill="#fff"/>')
# the scale: five classes, white edges between them and around them
out.append('<g clip-path="url(#bar)">')
for i, c in enumerate(cols):
    out.append(f'<rect x="{sx0 + i * seg_w:.1f}" y="{sy}" width="{seg_w + 0.5:.1f}" height="{sh}" fill="{c}"/>')
out.append(f'<rect x="{sx0}" y="{sy}" width="{sx1 - sx0}" height="{sh / 2:.0f}" fill="#fff" fill-opacity=".1"/>')
out.append('</g>')
for i in range(1, 5):
    x = sx0 + i * seg_w
    out.append(f'<path d="M{x:.1f} {sy}V{sy + sh}" stroke="#fff" stroke-width="2"/>')
out.append(f'<rect x="{sx0}" y="{sy}" width="{sx1 - sx0}" height="{sh}" rx="6" fill="none" stroke="#fff" stroke-width="3.5"/>')
# ticks beneath: the edges of the classes
for i in range(6):
    x = sx0 + i * seg_w
    out.append(f'<path d="M{x:.1f} {sy + sh + 8}v8" stroke="#fff" stroke-opacity=".5" stroke-width="2.5" stroke-linecap="round"/>')
out.append('</svg>')
import os
here = os.path.dirname(os.path.abspath(__file__))
open(os.path.join(here, '..', 'assets', 'img', 'logo.svg'), 'w').write(''.join(out))
print('wrote assets/img/logo.svg,', len(''.join(out)), 'bytes')
