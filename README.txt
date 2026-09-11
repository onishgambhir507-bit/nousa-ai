NOUSA AI - OpenAI-independent media package
1. Put index.html and _worker.js in GitHub repository root.
2. In Cloudflare Pages -> Settings -> Variables and Secrets -> Production, add:
   Name: HF_TOKEN
   Value: your Hugging Face User Access Token with Inference Providers permission.
3. Optional:
   HF_IMAGE_MODEL = black-forest-labs/FLUX.1-schnell
   HF_VIDEO_MODEL = your supported text-to-video model/provider.
Important: This removes the dependency on OpenAI credits, but it does NOT make unlimited generation free. Hugging Face currently provides a small monthly free credit allowance to free users; video providers may have separate quotas/pricing.
