const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';

function out(res,n,x){return res.status(n).json(x)}

function text(d){
  if(typeof d.output_text==='string' && d.output_text.trim()) return d.output_text;
  return (d.output||[])
    .flatMap(i=>i.content||[])
    .filter(x=>x.type==='output_text')
    .map(x=>x.text||'')
    .join('\n');
}

async function ai(instructions,input,useWeb=false){
  if(!process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY ontbreekt op de hosting.');
  const body={model:MODEL,instructions,input};
  if(useWeb){
    body.tools=[{
      type:'web_search',
      search_context_size:'medium',
      user_location:{
        type:'approximate',
        city:'Emmen',
        country:'NL',
        region:'Drenthe',
        timezone:'Europe/Amsterdam'
      }
    }];
  }
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+process.env.OPENAI_API_KEY
    },
    body:JSON.stringify(body)
  });
  const raw=await r.text();
  let d={};
  try{d=JSON.parse(raw)}catch{}
  if(!r.ok) throw Error(d?.error?.message||('OpenAI API gaf HTTP '+r.status+'.'));
  const result=text(d);
  if(!result.trim()) throw Error('OpenAI gaf geen tekst terug.');
  return result;
}

function parse(x){
  let s=String(x||'').trim();
  s=s.replace(/^\s*\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`\s*$/,'').trim();
  try{return JSON.parse(s)}catch{}
  const start=s.indexOf('{');
  const end=s.lastIndexOf('}');
  if(start>=0 && end>start){
    try{return JSON.parse(s.slice(start,end+1))}catch{}
  }
  throw Error('Ongeldige AI-uitvoer: '+s.slice(0,180));
}

export default async function handler(req,res){
  if(req.method!=='POST') return out(res,405,{error:'Gebruik POST.'});
  try{
    const b=req.body||{};

    if(b.action==='analyze'){
      const story=String(b.story||'').trim();
      if(story.length<8) return out(res,400,{error:'Vertel iets meer over de situatie.'});

      const instructions='Je bent OuderHulp. Analyseer eerst de oudervraag, zonder advies of diagnose. Geef ALLEEN één geldig JSON-object, zonder markdown of extra tekst, met precies deze velden: core_question (string), parent_goal (string), topic (string), age (string of null), unknowns (array van strings).';
      const a=parse(await ai(instructions,story,false));

      return out(res,200,{analysis:{
        core_question:String(a.core_question||''),
        parent_goal:String(a.parent_goal||''),
        topic:String(a.topic||''),
        age:a.age==null?null:String(a.age),
        unknowns:Array.isArray(a.unknowns)?a.unknowns.map(String).slice(0,6):[]
      }});
    }

    if(b.action==='answer'){
      const instructions='Je bent OuderHulp, een empathische Nederlandse oudercoach. Geef rustig, praktisch en niet-veroordelend advies. Stel geen diagnose. Geef concrete stappen, een voorbeeldzin en maximaal één vervolgvraag. Bij direct gevaar: adviseer 112. Je hebt een actuele webzoekfunctie. Zoek actief op internet naar relevante en betrouwbare bronnen. Gebruik bij voorkeur Nederlandse officiële of deskundige bronnen zoals overheid, NJi, VeiligheidNL, Thuisarts en vergelijkbare professionele organisaties. Gebruik echte URL\'s uit de webzoekresultaten en verzin geen bronnen. Geef ALLEEN één geldig JSON-object, zonder markdown of extra tekst, met precies deze velden: answer_html (string, alleen veilige tags p,h3,ol,ul,strong,blockquote; geen links, script of style), followup (string of null), sources (array van maximaal 6 objecten met title, url en reason).';

      const input='Verhaal:\n'+String(b.story||'')+
        '\nBegrip:\n'+JSON.stringify(b.analysis||{})+
        '\nGesprek:\n'+JSON.stringify(b.conversation||[]);

      const r=parse(await ai(instructions,input,true));
      r.sources=Array.isArray(r.sources)?r.sources.slice(0,6).filter(s=>s&&s.url).map(s=>({
        title:String(s.title||s.url),
        url:String(s.url),
        reason:String(s.reason||'Relevante bron voor dit advies.')
      })):[];
      r.followup=r.followup?String(r.followup):null;
      r.answer_html=String(r.answer_html||'').replace(/<script[\\s\\S]*?<\\/script>/gi,'');
      return out(res,200,r);
    }

    return out(res,400,{error:'Onbekende actie.'});
  }catch(e){
    console.error('OuderHulp API:',e);
    return out(res,500,{error:e.message||'Er ging iets mis op de server.'});
  }
}
