"""Rough CPU inference timing of transformer encoders of several sizes (numpy + OpenBLAS, float32).

Upper bound for a real runtime (ONNX Runtime, int8, fused kernels are faster). One token = one visible game object
(card on the battlefield, in hand, on the stack, a player...). Prints ms per decision at batch 1 and batch 64.
"""
import time
import numpy as np

rng = np.random.default_rng(0)


def make(d, layers):
    ff = 4 * d
    return [dict(qkv=rng.standard_normal((d, 3 * d), dtype=np.float32) * 0.02,
                 o=rng.standard_normal((d, d), dtype=np.float32) * 0.02,
                 w1=rng.standard_normal((d, ff), dtype=np.float32) * 0.02,
                 w2=rng.standard_normal((ff, d), dtype=np.float32) * 0.02) for _ in range(layers)]


def ln(x):
    m = x.mean(-1, keepdims=True)
    v = x.var(-1, keepdims=True)
    return (x - m) / np.sqrt(v + 1e-5)


def forward(params, x, heads):
    b, t, d = x.shape
    hd = d // heads
    for p in params:
        h = ln(x)
        qkv = h @ p["qkv"]
        q, k, v = np.split(qkv, 3, axis=-1)
        q = q.reshape(b, t, heads, hd).transpose(0, 2, 1, 3)
        k = k.reshape(b, t, heads, hd).transpose(0, 2, 3, 1)
        v = v.reshape(b, t, heads, hd).transpose(0, 2, 1, 3)
        a = (q @ k) / np.sqrt(hd)
        a = np.exp(a - a.max(-1, keepdims=True))
        a /= a.sum(-1, keepdims=True)
        o = (a @ v).transpose(0, 2, 1, 3).reshape(b, t, d)
        x = x + o @ p["o"]
        h = ln(x)
        x = x + np.maximum(h @ p["w1"], 0) @ p["w2"]
    return x


def bench(name, d, layers, tokens, batch, reps):
    params = make(d, layers)
    nparams = sum(v.size for p in params for v in p.values())
    x = rng.standard_normal((batch, tokens, d), dtype=np.float32)
    forward(params, x, max(1, d // 64))
    t0 = time.perf_counter()
    for _ in range(reps):
        forward(params, x, max(1, d // 64))
    dt = (time.perf_counter() - t0) / reps
    print(f"{name:7s} d={d:4d} layers={layers:2d} tokens={tokens:3d} params={nparams/1e6:5.1f}M batch={batch:3d}: "
          f"{dt*1000:8.2f} ms per call, {dt*1000/batch:7.3f} ms per decision")



import sys
cfgs = [("tiny", 128, 2, 128, 1, 50), ("tiny", 128, 2, 128, 16, 10),
        ("small", 256, 4, 128, 1, 20), ("small", 256, 4, 128, 16, 5), ("small", 256, 4, 256, 1, 10),
        ("medium", 512, 6, 128, 1, 10), ("medium", 512, 6, 256, 1, 5), ("medium", 512, 6, 128, 16, 2),
        ("large", 768, 12, 128, 1, 3), ("large", 768, 12, 256, 1, 2)]
for c in cfgs:
    bench(*c); sys.stdout.flush()

