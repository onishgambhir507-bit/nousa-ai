export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    if (u.pathname === "/api/health") {
      return Response.json({ ok: true, service: "NOUSA AI" });
    }

    if (u.pathname === "/api/status") {
      return Response.json({
        worker: true,
        openaiKeyConfigured: !!env.OPENAI_API_KEY,
        hfTokenConfigured: !!env.HF_TOKEN,
        openaiModel: env.OPENAI_MODEL || "gpt-5.6-luna",
        imageProvider: "Hugging Face Inference Providers (automatic)",
        videoProvider: "Hugging Face Inference Providers (automatic)"
      });
    }

    if (u.pathname === "/api/chat") {
      if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      if (!env.OPENAI_API_KEY) return Response.json({ error: "OPENAI_API_KEY is not configured. Chat needs an OpenAI API key/credits." }, { status: 503 });
      let b;
      try { b = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
      const allowed = ["General", "Maths", "EVS", "English", "Hindi", "Art & Craft"];
      const subject = allowed.includes(b.subject) ? b.subject : "General";
      const messages = (Array.isArray(b.messages) ? b.messages : [])
        .filter(x => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string")
        .slice(-20)
        .map(x => ({ role: x.role, content: x.content.slice(0, 5000) }));
      if (!messages.length) return Response.json({ error: "Please enter a question." }, { status: 400 });
      const instructions = `You are NOUSA AI, a friendly school and creative assistant. Selected subject: ${subject}. Maths: solve step-by-step. EVS: explain clearly with examples. English: grammar, writing, comprehension, vocabulary and literature. Hindi: answer in Hindi when appropriate; grammar, writing, meanings and literature. Art & Craft: materials and safe step-by-step project instructions. General: answer normally.`;
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5.6-luna", instructions, input: messages, max_output_tokens: 1400, store: false })
      });
      const raw = await r.text();
      if (!r.ok) {
        let z = raw; try { z = JSON.parse(raw)?.error?.message || raw; } catch {}
        return Response.json({ error: "OpenAI request failed.", status: r.status, details: String(z).slice(0, 1200) }, { status: 502 });
      }
      let x; try { x = JSON.parse(raw); } catch { return Response.json({ error: "Invalid OpenAI response." }, { status: 502 }); }
      let text = x.output_text || "";
      if (!text && Array.isArray(x.output)) for (const i of x.output) for (const c of i.content || []) if (typeof c.text === "string") text += c.text;
      if (!text) return Response.json({ error: "OpenAI returned no text.", details: JSON.stringify(x).slice(0, 1200) }, { status: 502 });
      return Response.json({ text });
    }

    if (u.pathname !== "/api/image" && u.pathname !== "/api/video") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (!env.HF_TOKEN) return Response.json({ error: "HF_TOKEN is not configured. Add it in Cloudflare Variables & Secrets." }, { status: 503 });

    let b;
    try { b = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
    if (!b.prompt) return Response.json({ error: "Please enter a prompt." }, { status: 400 });
    const prompt = String(b.prompt).slice(0, 2000);

    async function asDataUrl(buf, ct) {
      const a = new Uint8Array(buf); let bin = "";
      for (let i = 0; i < a.length; i += 32768) bin += String.fromCharCode(...a.subarray(i, i + 32768));
      return "data:" + ct + ";base64," + btoa(bin);
    }

    // Hugging Face's official Inference Providers mapping tells us which providers
    // currently serve the selected model and the provider-specific model ID.
    async function getMappings(model) {
      const api = `https://huggingface.co/api/models/${model}?expand[]=inferenceProviderMapping`;
      const r = await fetch(api, { headers: { "Authorization": "Bearer " + env.HF_TOKEN, "Accept": "application/json" } });
      if (!r.ok) throw new Error("Could not retrieve the model's current Hugging Face provider mapping (HTTP " + r.status + ").");
      const j = await r.json();
      const raw = j.inferenceProviderMapping;
      const entries = Array.isArray(raw)
        ? raw
        : Object.entries(raw || {}).map(([provider, value]) => ({ provider, ...(value || {}) }));
      return entries
        .filter(x => x && x.provider && x.providerId && (!x.status || x.status === "live"));
    }

    async function providerCall(provider, providerModelId, payload) {
      // This is the provider-proxy URL shape used by Hugging Face's InferenceClient.
      const url = `https://router.huggingface.co/${provider}/${encodeURI(providerModelId)}`;
      return fetch(url, {
        method: "POST",
        headers: { "Authorization": "Bearer " + env.HF_TOKEN, "Content-Type": "application/json", "Accept": "*/*" },
        body: JSON.stringify(payload)
      });
    }

    async function normalizeMedia(r, type) {
      const raw = await r.arrayBuffer();
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) return { ok: false, status: r.status, details: new TextDecoder().decode(raw).slice(0, 1600) };
      if (ct.startsWith(type + "/")) return { ok: true, url: await asDataUrl(raw, ct) };
      if (ct.includes("json") || ct.startsWith("text/")) {
        let j; try { j = JSON.parse(new TextDecoder().decode(raw)); } catch { return { ok: false, status: 502, details: "Provider returned an unreadable response." }; }
        const candidate = j?.video?.url || j?.image?.url || j?.output?.url || j?.url || (typeof j?.output === "string" ? j.output : null) || (Array.isArray(j?.videos) ? j.videos[0]?.url : null) || (Array.isArray(j?.images) ? j.images[0]?.url : null);
        if (candidate) return { ok: true, url: candidate };
        return { ok: false, status: 502, details: JSON.stringify(j).slice(0, 1600) };
      }
      return { ok: false, status: 502, details: "Unexpected content type: " + ct };
    }

    const isImage = u.pathname === "/api/image";
    const model = isImage ? (env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-dev") : (env.HF_VIDEO_MODEL || "Wan-AI/Wan2.1-T2V-14B");
    let mappings;
    try { mappings = await getMappings(model); } catch (e) {
      return Response.json({ error: "Hugging Face automatic provider lookup failed.", details: String(e) }, { status: 502 });
    }

    // Optional preference from Cloudflare. Otherwise use the live mapping order returned by HF.
    const preferred = (env.HF_IMAGE_PROVIDER || env.HF_VIDEO_PROVIDER || "").trim();
    if (preferred) mappings.sort((a, z) => (a.provider === preferred ? -1 : 0) - (z.provider === preferred ? -1 : 0));

    if (!mappings.length) {
      return Response.json({ error: "No live Hugging Face Inference Provider currently supports this model.", model }, { status: 502 });
    }

    const payload = isImage
      ? { inputs: prompt, parameters: { num_inference_steps: 4 } }
      : { inputs: prompt };
    const type = isImage ? "image" : "video";
    const errors = [];

    for (const m of mappings) {
      try {
        const result = await normalizeMedia(await providerCall(m.provider, m.providerId, payload), type);
        if (result.ok) return Response.json({ type, status: "completed", provider: m.provider, model, url: result.url });
        errors.push(`${m.provider}: ${result.details}`);
      } catch (e) {
        errors.push(`${m.provider}: ${String(e)}`);
      }
    }

    return Response.json({ error: `${type === "image" ? "Image" : "Video"} generation failed on all currently mapped Hugging Face providers.`, model, providersTried: mappings.map(x => x.provider), details: errors.join(" | ") }, { status: 502 });
  }
};
