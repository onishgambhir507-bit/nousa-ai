const OPENAI = 'https://api.openai.com';

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}
  });
}

async function openai(request, env, path, init={}) {
  if (!env.OPENAI_API_KEY) return json({error:'OPENAI_API_KEY is not configured in Cloudflare.'},503);
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${env.OPENAI_API_KEY}`);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') headers.set('Content-Type','application/json');
  return fetch(OPENAI + path, {...init, headers});
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);

    if (u.pathname === '/api/health') return json({ok:true, service:'NOUSA AI'});
    if (u.pathname === '/api/status') return json({worker:true, openaiKeyConfigured:!!env.OPENAI_API_KEY, chatModel:env.OPENAI_MODEL||'gpt-5.6-luna', imageModel:env.OPENAI_IMAGE_MODEL||'gpt-image-2', videoModel:env.OPENAI_VIDEO_MODEL||'sora-2'});

    if (u.pathname === '/api/chat') {
      if (request.method !== 'POST') return json({error:'Method not allowed'},405);
      let b; try { b=await request.json(); } catch { return json({error:'Invalid JSON.'},400); }
      const messages=(Array.isArray(b.messages)?b.messages:[]).filter(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').slice(-20).map(m=>({role:m.role,content:m.content.slice(0,4000)}));
      if (!messages.length) return json({error:'Please enter a message.'},400);
      const r=await openai(request,env,'/v1/responses',{method:'POST',body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-5.6-luna',instructions:'You are NOUSA AI, a friendly and helpful AI assistant. NOUSA AI stands for Next-Generation Online Utility & Smart AI.',input:messages,max_output_tokens:1200,store:false})});
      const raw=await r.text();
      if(!r.ok) return json({error:'OpenAI chat error',status:r.status,details:raw.slice(0,1200)},502);
      let x; try{x=JSON.parse(raw)}catch{return json({error:'Invalid OpenAI response',details:raw.slice(0,500)},502)}
      let text=x.output_text||'';
      if(!text && Array.isArray(x.output)) for(const item of x.output){ if(Array.isArray(item.content)) for(const c of item.content){ if(typeof c.text==='string') text+=c.text; }}
      if(!text) return json({error:'OpenAI returned no text.',raw:JSON.stringify(x).slice(0,1500)},502);
      return json({text});
    }

    if (u.pathname === '/api/image') {
      if (request.method !== 'POST') return json({error:'Method not allowed'},405);
      let b; try {b=await request.json();} catch {return json({error:'Invalid JSON.'},400);}
      const prompt=String(b.prompt||'').trim();
      if(!prompt) return json({error:'Enter an image prompt.'},400);
      const r=await openai(request,env,'/v1/images/generations',{method:'POST',body:JSON.stringify({model:env.OPENAI_IMAGE_MODEL||'gpt-image-2',prompt:prompt.slice(0,4000),size:b.size||'1024x1024',quality:b.quality||'medium',output_format:'png'})});
      const raw=await r.text();
      if(!r.ok) return json({error:'OpenAI image error',status:r.status,details:raw.slice(0,1500)},502);
      let x;try{x=JSON.parse(raw)}catch{return json({error:'Invalid image response',details:raw.slice(0,500)},502)}
      const item=x.data?.[0];
      if(!item?.b64_json) return json({error:'Image API returned no image data.',raw:JSON.stringify(x).slice(0,1500)},502);
      return json({image:`data:image/png;base64,${item.b64_json}`});
    }

    if (u.pathname === '/api/video') {
      if (request.method !== 'POST') return json({error:'Method not allowed'},405);
      let b; try {b=await request.json();} catch {return json({error:'Invalid JSON.'},400);}
      const prompt=String(b.prompt||'').trim();
      if(!prompt) return json({error:'Enter a video prompt.'},400);
      const body={model:env.OPENAI_VIDEO_MODEL||'sora-2',prompt:prompt.slice(0,4000),size:b.size||'1280x720',seconds:String(b.seconds||8)};
      const r=await openai(request,env,'/v1/videos',{method:'POST',body:JSON.stringify(body)});
      const raw=await r.text();
      if(!r.ok) return json({error:'OpenAI video error',status:r.status,details:raw.slice(0,1800)},502);
      let x;try{x=JSON.parse(raw)}catch{return json({error:'Invalid video response',details:raw.slice(0,500)},502)}
      return json({id:x.id,status:x.status||'queued',progress:x.progress||0});
    }

    const vm=u.pathname.match(/^\/api\/video\/([^/]+)$/);
    if(vm && request.method==='GET'){
      const r=await openai(request,env,`/v1/videos/${encodeURIComponent(vm[1])}`,{method:'GET'});
      const raw=await r.text();
      if(!r.ok) return json({error:'OpenAI video status error',status:r.status,details:raw.slice(0,1500)},502);
      return new Response(raw,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }

    const cm=u.pathname.match(/^\/api\/video\/([^/]+)\/content$/);
    if(cm && request.method==='GET'){
      const r=await openai(request,env,`/v1/videos/${encodeURIComponent(cm[1])}/content`,{method:'GET'});
      if(!r.ok){const raw=await r.text();return json({error:'OpenAI video download error',status:r.status,details:raw.slice(0,1500)},502);}
      const h=new Headers(r.headers); h.set('Cache-Control','no-store');
      return new Response(r.body,{status:r.status,headers:h});
    }

    return env.ASSETS.fetch(request);
  }
};
