# Compute costs and free options (research report, 2026-11-14)

> Archived research-agent report for the MTG model brainstorm ([README](../README.md)). Verbatim except the title; claims are as of 2026-11-14 and each cites its source. Not a decision.


Running your own PC is the cheapest per game, but it is not free: at full load it costs €1.20–1.68 a day in electricity, about €36–50 a month if it runs nonstop. Prices are excl. VAT unless marked; add 20% where the provider charges French VAT. Dollars are converted at the ECB rate of 13 Nov 2026 ($1 = €0.905). Hetzner raised prices twice in 2026 and OVH raised its dedicated servers, so older blog figures are out of date.

## 1. Prices

**GPU, per GPU-hour**

| Provider | Consumer GPUs | L4 | A100 80GB | H100 |
|---|---|---|---|---|
| vast.ai, live offers (lowest–median) | 3090 $0.14–0.27; 4090 $0.33–0.47 (interruptible bids from $0.16); 5090 $0.40–0.64 | $0.25–0.67 | SXM $0.31–0.80 | SXM $1.74–2.34 |
| RunPod (community / secure) | 4090 $0.34 / $0.89; 5090 $0.69 / $1.39 | $0.44 / $0.69 | $1.19–1.39 / $2.09–2.19 | $1.99–2.69 / $2.89–4.39 |
| Lambda (rates from 16 Nov) | none | none | A100 40GB $1.99 | $3.79–4.89 |
| TensorDock | 4090 ~$0.35 (search only, unverified) | | | |
| Paperspace | A6000 $1.89 | none | $1.15 only with a 3-year commitment | page inconsistent |
| OVHcloud | none | €0.75 | €2.75 | €2.80 |
| Scaleway (search snippets; page blocked me) | none | €0.75–0.79 | none | PCIe €2.73 |
| Modal | T4 $0.59 | $0.80 | $2.50 | $3.95 |
| Hetzner GEX45 | RTX PRO 4000: €214/month + €209 setup | | | |

RunPod no longer lists spot prices. vast.ai says interruptible is "50%+ cheaper" than on-demand.

**CPU, per vCPU-hour**

| Option | Price | Notes |
|---|---|---|
| AWS spot c6g/c7g.16xlarge (64 ARM cores), Frankfurt and Stockholm | $0.0059–0.0066 | x86 c7i.16xlarge in Paris: $0.0068 |
| Azure spot D32pls_v6 (ARM), Sweden and France | $0.0067–0.0070 | x86 D32as_v5: $0.0085 |
| GCP spot e2-highcpu-32 / c2d-highcpu-32 | $0.0148 / $0.0172 | default region shown on the page |
| Hetzner CX53 (16 shared x86) / CAX41 (16 ARM) | €0.0030 / €0.0042 | capped at €29.99 / €41.49 a month; all marked "currently unavailable" today |
| Hetzner CCX63 (48 dedicated vCPUs) | €0.024 | |
| Hetzner AX41 (Ryzen 3600, 12 threads) | €0.0067 | €59/month, no setup fee |
| Hetzner server auction | ~€0.013 | cheapest is now ~€77/month for an i7-6700; poor value |
| OVH Kimsufi KS-6 (EPYC 7351P, 32 threads) | €0.0017 | €38.99/month; setup fee equals one month unless you prepay 12 months; old, slow cores |
| OVH Public Cloud c3 / d2-8 | €0.0228 / €0.0093 | |
| Scaleway POP2-HC-32C (search snippet) | €0.0266 | |
| Modal | $0.047 per physical core (2 vCPUs) + $0.008 per GiB-hour | |

**Electricity (EDF Tarif Bleu, applicable since 1 Aug 2026, incl. tax):** Base option 20.01 c€/kWh; off-peak (HC) 15.89; Tempo blue-day off-peak 13.56. At 250–350 W, the PC uses 6–8.4 kWh a day, which costs **€1.20–1.68 a day**.

## 2. Free options

| Option | Limits | Do the terms allow this use? |
|---|---|---|
| Oracle Always Free (Ampere A1) | **Now 1,500 OCPU-hours and 9,000 GB-hours a month = 2 ARM cores and 12 GB**, halved from 4/24 (reported as of 15 Jun 2026). Home region only. Idle instances are reclaimed (under 20% CPU at the 95th percentile over 7 days). 10 TB egress | Yes. A simulation load is never idle. Creation often fails with "Out of host capacity" |
| Modal Starter | **$30 of compute every month**; 10 GPUs and 100 containers at once | Yes. The best recurring free option |
| Kaggle | 12 h per CPU/GPU session, 9 h per TPU session. Weekly GPU quota is unpublished (commonly ~30 h; from secondary sources). P100 or 2×T4; phone verification needed | Yes, ML training is its purpose. Its GPUs are slower than your RX 7800 XT (est.) |
| Lightning AI | 30 credits, once only (5 at sign-up + 25 with a card); they expire after 12 months; "~50 GPU hours" on interruptible machines | Yes, but one-off |
| Google Colab free | At most 12 h per session; GPU not guaranteed | **No.** Free runtimes disallow "chess training" and "running distributed computing workers". Self-play training for a game AI is that category |
| Hugging Face ZeroGPU | 5 min of GPU a day free, 40 min with PRO ($9/month). Gradio Spaces only; 60 s per call by default | No: built for inference demos, not training |
| TPU Research Cloud | "Anyone can express interest"; approval is case by case; quota is "temporary". VMs and storage are billed (described as "generally minimal") | You must share the research publicly (papers, open-source code or blog posts) and give Google feedback. TPUs only (JAX or PyTorch/XLA) |
| Trial credits | GCP $300 over 90 days (no GPUs, no quota increases). AWS $100–200 over 6 months. Azure $200 over 30 days | Yes, except crypto mining. One-off |
| AWS Open Source Credits | Apply by emailed form; reviewed monthly (search only) | Aimed at CI and testing of open-source projects |
| GitHub Actions, public repo | Free standard runners: 4 vCPU / 16 GB, 20 concurrent jobs on the Free plan, 6 h per job | **No.** The terms prohibit "any other activity unrelated to the production, testing, deployment, or publication of the software project" and "Any activity that places a burden on our servers, where that burden is disproportionate to the benefits provided to users". Misuse can lead to account suspension, and that account hosts the fork. A small simulation regression test in CI is fine |

## 3. Worked examples

All per-core comparisons are rough. The 1.4-core figure was measured on your 5800X3D. Cloud x86 vCPUs are hyperthreads, and older ARM cores (Neoverse N1) are slower, so expect ±50% until you benchmark (est.).

**One million Forge games (14,000 core-hours):**

| Option | Cost | Time |
|---|---|---|
| Your PC, electricity only (250 W, 11–16 effective cores) | €44–64 incl. tax | 36–53 days, 24/7 |
| GCP $300 trial, spot VMs | €0, once | Needs ~10 vCPUs for 90 days; whether the default quota allows that is unverified |
| Oracle Always Free | €0 | ~10–16 months (est.) |
| Modal free credit | €0 | ~15–30 months (est.) |
| Hetzner CX53, if it becomes orderable | ~€37 excl. VAT | ~36 days |
| Kimsufi KS-6 | ~€78 excl. VAT (first month + setup) | ~1 month (est.) |
| AWS spot, 64-core ARM instance | €75–84 nominal; ~€105–120 if ARM cores are 0.7× as fast | ~9 days on one instance |

A 10× faster engine divides every line by 10, for example about 4–5 days and €5 on your own PC.

**200 GPU-hours of training.** This counts 200 hours of RX 7800 XT work. I assume the 7800 XT is roughly an RTX 3090 and a 4090 is about 2× faster (est.).

| Option | Cost |
|---|---|
| Your PC (60–70 kWh) | **€12–14**; €8–9.5 if run only on Tempo blue off-peak hours |
| vast.ai RTX 3090, 200 h | €26–48 |
| RTX 4090, ~100 h | €30–43 on-demand; €14–32 on interruptible bids |
| H100, ~40–70 h (est.) | €63–163 |
| Modal free credit | €0. About 37 L4-hours a month, so ~5–6 months |
| Kaggle | €0. About 3–5 months (est.) |

## 4. Caveats

- **Interruptions:** AWS spot gives 2 minutes' warning; GCP and Azure spot give 30 seconds; a vast.ai interruptible instance stops when someone outbids you. Simulation splits easily, so write game results in small batches. For training, save a checkpoint every few minutes.
- **Data egress:** AWS includes 100 GB a month free, then charges per GB. Hetzner cloud includes 20 TB; Oracle 10 TB; Modal 1 TiB. Compress game records.
- **Setup effort:** new accounts need a card and sometimes quota requests. vast.ai hosts are untrusted third parties. Kimsufi is monthly with a setup fee.
- **ARM for Java:** OpenJDK on ARM is mature, and a pure-Java headless simulation should run unchanged. Benchmark one game per core before committing.
- **ROCm:** the RX 7800 XT is officially supported. AMD's ROCm 7.2.1 Radeon matrix lists it with PyTorch 2.9.1, and the ROCm 10.1.0 matrix lists gfx1101 with PyTorch 2.12–2.14. PyTorch.org's stable 2.15.0 offers a ROCm 10.0 build. Supported operating systems are Ubuntu and RHEL only, so on CachyOS use Arch packages or the `rocm/pytorch` Docker image. Some CUDA-only extensions (flash-attention on RDNA3, for example) lag; plain PyTorch for 10–100M-parameter models is fine.

## 5. Conclusion

**At €0:**
- Run everything on your own PC.
- Add Oracle's 2 free ARM cores, about 60–100k games a month (est.).
- Add Modal's $30 a month, the biggest recurring free compute: about 35–70k games or ~37 L4-hours a month.
- Use the GCP $300 trial once, for roughly a million games.
- Avoid GitHub Actions and Colab free (their terms), and ZeroGPU (unsuitable).
- Kaggle works for training but its GPUs are slower than yours.

**At €2–5 a month:**
- Know the baseline: €2 is 10 kWh, about 40 hours of your PC at full load, which is roughly 31–46k games.
- The same €2 buys about 340–375 vCPU-hours of AWS ARM spot (~24–27k games), or 5–7 hours of an RTX 4090 (up to ~14 h on interruptible bids).
- So paid cloud is worth it only to finish faster (many cores for a few hours), not to save money.
- The best investment is the 10–100× faster engine. It outweighs every pricing difference above.

## Sources (all read 2026-11-14 unless noted)

- Hetzner: https://www.hetzner.com/cloud/cost-optimized/ · https://www.hetzner.com/cloud/general-purpose/ · https://www.hetzner.com/dedicated-rootserver/matrix-ax/ · https://www.hetzner.com/dedicated-rootserver/matrix-gpu/ · auction feed https://www.hetzner.com/_resources/app/data/app/live_data_sb.json · 2026 price rises (search only): https://heise.de/-11333037
- OVH: https://www.ovhcloud.com/fr/public-cloud/prices/ · https://eu.api.ovh.com/1.0/order/catalog/public/eco?ovhSubsidiary=FR
- Scaleway (search snippets; pages returned 403): https://www.scaleway.com/en/pricing/gpu/ · https://www.scaleway.com/en/pricing/virtual-instances/
- AWS: https://website.spot.ec2.aws.a2z.com/spot.js · https://aws.amazon.com/ec2/pricing/on-demand/ · https://aws.amazon.com/free/ · open-source credits (search only): https://aws.amazon.com/blogs/opensource/aws-cloud-credits-for-open-source-projects-affirming-our-commitment
- GCP: https://cloud.google.com/spot-vms/pricing · https://cloud.google.com/free/docs/free-cloud-features
- Azure: https://prices.azure.com/api/retail/prices · trial terms (search only): https://azure.microsoft.com/en-us/pricing/free-trial-faq/
- GPU providers: vast.ai API https://console.vast.ai/api/v0/bundles/ · https://runpod.io/pricing · https://lambda.com/pricing · https://www.paperspace.com/pricing · https://modal.com/pricing · https://lightning.ai/pricing · TensorDock (search only): https://tensordock.com/cloud-gpus
- Hugging Face: https://huggingface.co/docs/hub/spaces-zerogpu · https://huggingface.co/pricing
- Oracle: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm · halving (search only): https://linuxiac.com/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/
- Colab: https://research.google.com/colaboratory/faq.html
- Kaggle, secondary source dated 21 Sep 2026: https://gpuperhour.com/blog/free-cloud-gpus-and-credits
- TPU Research Cloud: https://sites.research.google/trc/about/ · https://sites.research.google/trc/faq/
- GitHub: https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features · https://docs.github.com/en/actions/reference/runners/github-hosted-runners · https://docs.github.com/en/actions/reference/limits
- EDF: https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/Grille_prix_Tarif_Bleu.pdf
- ROCm and PyTorch: https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/native_linux/native_linux_compatibility.html · https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html · https://pytorch.org/get-started/locally/
- Exchange rate (13 Nov 2026): https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml