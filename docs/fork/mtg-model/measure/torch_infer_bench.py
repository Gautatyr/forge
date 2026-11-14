"""Inference speed per decision for transformer encoders of several sizes, CPU and GPU (PyTorch, ROCm or CUDA).

One token = one visible game object. Prints ms per call and ms per decision (call time / batch).
CPU: 1 thread (one game per core) and all threads. GPU: batch 1 (latency, playing against a human) and large
batches (throughput, many self-play games served together), in float32 and bfloat16.
Usage: python3 -I torch_infer_bench.py [--quick]
"""
import sys
import time

import torch
from torch import nn

QUICK = "--quick" in sys.argv
SIZES = [("tiny", 128, 2), ("small", 256, 4), ("medium", 512, 6), ("large", 768, 12)]
TOKENS = 128


def model(d, layers):
    layer = nn.TransformerEncoderLayer(d, max(2, d // 64), 4 * d, dropout=0.0, batch_first=True, norm_first=True)
    return nn.TransformerEncoder(layer, layers, enable_nested_tensor=False).eval()


def timeit(fn, reps, sync=None):
    fn()
    fn()
    if sync:
        sync()
    t0 = time.perf_counter()
    for _ in range(reps):
        fn()
    if sync:
        sync()
    return (time.perf_counter() - t0) / reps


def row(where, name, nparams, batch, dt):
    print(f"{where:22s} {name:6s} {nparams / 1e6:5.1f}M batch={batch:5d}: {dt * 1000:9.3f} ms/call {dt * 1000 / batch:9.4f} ms/decision"
          f"  ({batch / dt:10.0f} decisions/s)", flush=True)


@torch.inference_mode()
def main():
    for name, d, layers in SIZES:
        m = model(d, layers)
        nparams = sum(p.numel() for p in m.parameters())
        for threads in (1, torch.get_num_threads()):
            torch.set_num_threads(threads)
            for batch in ((1,) if threads == 1 else (1, 16)):
                x = torch.randn(batch, TOKENS, d)
                dt = timeit(lambda: m(x), 3 if name == "large" or QUICK else 10)
                row(f"cpu {threads:2d} thread(s)", name, nparams, batch, dt)
        if torch.cuda.is_available():
            for dtype in (torch.float32, torch.bfloat16):
                g = model(d, layers).to("cuda", dtype)
                for batch in (1, 64, 512, 2048):
                    try:
                        x = torch.randn(batch, TOKENS, d, device="cuda", dtype=dtype)
                        dt = timeit(lambda: g(x), 3 if batch >= 512 else 20, torch.cuda.synchronize)
                        row(f"gpu {str(dtype).split('.')[1]}", name, nparams, batch, dt)
                    except torch.OutOfMemoryError:
                        print(f"gpu {dtype} {name} batch={batch}: out of memory", flush=True)
                        torch.cuda.empty_cache()
                del g
                torch.cuda.empty_cache()


main()
