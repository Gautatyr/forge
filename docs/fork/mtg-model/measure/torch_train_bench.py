"""Training throughput (samples per second) on the GPU for the same transformer sizes as torch_infer_bench.py:
forward + backward + AdamW step, bfloat16 autocast, 128 tokens per sample, a pooled policy/value head.
Usage: python3 -I torch_train_bench.py
"""
import time

import torch
from torch import nn

SIZES = [("tiny", 128, 2), ("small", 256, 4), ("medium", 512, 6), ("large", 768, 12)]
TOKENS, BATCH = 128, 256


class Net(nn.Module):
    def __init__(self, d, layers):
        super().__init__()
        layer = nn.TransformerEncoderLayer(d, max(2, d // 64), 4 * d, dropout=0.0, batch_first=True, norm_first=True)
        self.body = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.policy = nn.Linear(d, 1)  # scores each token as a candidate action
        self.value = nn.Linear(d, 1)

    def forward(self, x):
        h = self.body(x)
        return self.policy(h).squeeze(-1), self.value(h.mean(1)).squeeze(-1)


def main():
    dev = "cuda"
    for name, d, layers in SIZES:
        net = Net(d, layers).to(dev)
        opt = torch.optim.AdamW(net.parameters(), lr=1e-4)
        x = torch.randn(BATCH, TOKENS, d, device=dev)
        target = torch.randint(0, TOKENS, (BATCH,), device=dev)
        ret = torch.randn(BATCH, device=dev)

        def step():
            with torch.autocast(dev, dtype=torch.bfloat16):
                logits, v = net(x)
                loss = nn.functional.cross_entropy(logits.float(), target) + (v.float() - ret).pow(2).mean()
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()

        for _ in range(3):
            step()
        torch.cuda.synchronize()
        reps = 5 if name == "large" else 20
        t0 = time.perf_counter()
        for _ in range(reps):
            step()
        torch.cuda.synchronize()
        dt = (time.perf_counter() - t0) / reps
        nparams = sum(p.numel() for p in net.parameters())
        print(f"train {name:6s} {nparams / 1e6:5.1f}M batch={BATCH}: {dt * 1000:8.1f} ms/step, {BATCH / dt:8.0f} samples/s", flush=True)
        del net, opt, x
        torch.cuda.empty_cache()


main()
