export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'NOUSA AI' });
    }

    if (url.pathname === '/api/status') {
      return Response.json({
        worker: true,
        openaiKeyConfigured: Boolean(env.OPENAI_API_KEY),
        model: env.OPENAI_MODEL || 'gpt-5.6-luna'
      });
    }

    if (url.pathname === '/api/chat') {
      if (request.method !== 'POST') {
        return Response.json({
          ok: false,
          error: 'Method not allowed. Use POST.'
        }, { status: 405 });
      }

      if (!env.OPENAI_API_KEY) {
        return Response.json({
          ok: false,
          error: 'OPENAI_API_KEY is missing in Cloudflare Production Variables & Secrets.',
          code: 'MISSING_API_KEY'
        }, { status: 503 });
      }

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return Response.json({
          ok: false,
          error: 'The browser sent invalid JSON.',
          code: 'INVALID_JSON',
          details: String(e?.message || e)
        }, { status: 400 });
      }

      const messages = (Array.isArray(body?.messages) ? body.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));

      if (!messages.length) {
        return Response.json({
          ok: false,
          error: 'No message was received.',
          code: 'EMPTY_MESSAGE'
        }, { status: 400 });
      }

      const model = env.OPENAI_MODEL || 'gpt-5.6-luna';

      let response;
      try {
        response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            instructions: 'You are NOUSA AI, a friendly, helpful and creative AI assistant. NOUSA AI stands for Next-Generation Online Utility & Smart AI. Answer clearly and helpfully.',
            input: messages,
            max_output_tokens: 1200,
            store: false
          })
        });
      } catch (e) {
        return Response.json({
          ok: false,
          error: 'Cloudflare could not connect to the OpenAI API.',
          code: 'OPENAI_NETWORK_ERROR',
          details: String(e?.message || e)
        }, { status: 502 });
      }

      const raw = await response.text();

      if (!response.ok) {
        let details = raw;
        try {
          const parsed = JSON.parse(raw);
          details = parsed?.error?.message || parsed?.message || raw;
        } catch {}

        return Response.json({
          ok: false,
          error: `OpenAI API returned HTTP ${response.status}.`,
          code: 'OPENAI_API_ERROR',
          details: String(details).slice(0, 1000)
        }, { status: 502 });
      }

      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return Response.json({
          ok: false,
          error: 'OpenAI returned a response that was not valid JSON.',
          code: 'BAD_OPENAI_RESPONSE',
          details: String(e?.message || e)
        }, { status: 502 });
      }

      const text = data?.output_text || '';
      if (!text) {
        return Response.json({
          ok: false,
          error: 'OpenAI returned no text.',
          code: 'EMPTY_OPENAI_RESPONSE'
        }, { status: 502 });
      }

      return Response.json({ ok: true, text });
    }

    return env.ASSETS.fetch(request);
  }
};
