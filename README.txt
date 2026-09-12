NOUSA AI - FINAL MEDIA PROVIDER FIX

Upload these files directly to the root of your GitHub repository:
- index.html
- _worker.js
- README.txt (optional)

Cloudflare Variables & Secrets:
- OPENAI_API_KEY = your OpenAI API key (for Chat/subjects)
- HF_TOKEN = your Hugging Face token with "Make calls to Inference Providers" permission

Media:
- Image Studio uses Hugging Face Inference Providers (Together first, Fal fallback)
- Video Studio uses Hugging Face Inference Providers (Novita first, Fal/Replicate fallback)
- Default image model: black-forest-labs/FLUX.1-schnell
- Default video model: Wan-AI/Wan2.1-T2V-14B

No API keys are included in this ZIP.
After upload, redeploy Cloudflare Pages and check /api/status.
Note: Hugging Face Inference Providers may have usage limits/credits; this is not unlimited free generation.
