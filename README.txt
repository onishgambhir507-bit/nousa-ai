NOUSA AI — FINAL UNIFIED PACKAGE

This package combines the previous NOUSA AI versions into ONE website:
- Chat
- Maths
- EVS
- English
- Hindi
- Art & Craft
- Music Studio
- App Builder
- Image Studio
- Video Studio
- /api/health and /api/status

UPLOAD:
Put index.html and _worker.js directly in the GitHub repository root.

VARIABLES:
1. OPENAI_API_KEY — used for NOUSA AI chat/subjects. Your OpenAI API account must have available API credits.
2. HF_TOKEN — used for Image/Video so media does not consume OpenAI credits.
3. Optional HF_IMAGE_MODEL — defaults to black-forest-labs/FLUX.1-schnell
4. Optional HF_VIDEO_MODEL — defaults to Wan-AI/Wan2.1-T2V-14B

IMPORTANT:
This removes the OpenAI-credit dependency from the media routes, but it does NOT guarantee unlimited free generation. Hugging Face/provider availability and quotas can change. If a video route is unavailable, the website shows the provider error instead of pretending a video was created.
