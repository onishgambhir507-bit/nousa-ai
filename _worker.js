export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'NOUSA AI' });
    }

    if (url.pathname === '/api/status') {
      return Response.json({
        worker: true,
        openaiKeyConfigured: !!env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL || 'gpt-5.6-luna'
      });
    }

    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }

      if (!env.OPENAI_API_KEY) {
        return Response.json({
          error: 'OPENAI_API_KEY is not configured in Cloudflare Production secrets.'
        }, { status: 503 });
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'Invalid JSON request.' }, { status: 400 });
      }

      const messages = (Array.isArray(body.messages) ? body.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

      if (!messages.length) {
        return Response.json({ error: 'Please enter a message.' }, { status: 400 });
      }

      const model = env.OPENAI_MODEL || 'gpt-5.6-luna';

      let response;
      try {
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            instructions: 'You are NOUSA AI, a friendly and helpful AI assistant. NOUSA AI stands for Next-Generation Online Utility & Smart AI. Be clear, useful and creative.',
            input: messages,
            max_output_tokens: 1200,
            store: false
          })
        });
      } catch (e) {
        return Response.json({
          error: 'Could not connect to OpenAI.',
          details: e?.message || String(e)
        }, { status: 502 });
      }

      const raw = await response.text();

      if (!response.ok) {
        let details = raw;
        try {
          const err = JSON.parse(raw);
          details = err?.error?.message || raw;
        } catch {}
        return Response.json({
          error: `OpenAI API error (${response.status}).`,
          details: String(details).slice(0, 1000)
        }, { status: 502 });
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return Response.json({
          error: 'OpenAI returned invalid JSON.',
          details: raw.slice(0, 1000)
        }, { status: 502 });
      }

      // The REST API can return text inside output[].content[].text.
      // Do not rely only on the SDK-only output_text convenience property.
      let text = data.output_text || '';
      if (!text && Array.isArray(data.output)) {
        for (const item of data.output) {
          if (Array.isArray(item.content)) {
            for (const part of item.content) {
              if (typeof part.text === 'string') text += part.text;
            }
          }
        }
      }

      if (!text.trim()) {
        return Response.json({
          error: 'OpenAI returned no text.',
          details: JSON.stringify(data).slice(0, 2000)
        }, { status: 502 });
      }

      return Response.json({ text });
    }

    return env.ASSETS.fetch(request);
  }
};
