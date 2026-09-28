const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function send(res, status, data) {
  res.status(status).json(data);
}

function getText(data) {
  if (data && typeof data.output_text === 'string') return data.output_text;
  if (!data || !Array.isArray(data.output)) return '';
  var result = '';
  data.output.forEach(function(item) {
    if (!item || !Array.isArray(item.content)) return;
    item.content.forEach(function(part) {
      if (part && part.type === 'output_text' && typeof part.text === 'string') {
        result += part.text;
      }
    });
  });
  return result;
}

async function askOpenAI(instructions, input, web) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY ontbreekt op Vercel.');
  }

  var body = {
    model: MODEL,
    instructions: instructions,
    input: input
  };

  if (web) {
    body.tools = [{ type: 'web_search' }];
  }

  var response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify(body)
  });

  var raw = await response.text();
  var data;

  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error('OpenAI gaf geen JSON terug (HTTP ' + response.status + ').');
  }

  if (!response.ok) {
    throw new Error(
      data && data.error && data.error.message
        ? data.error.message
        : 'OpenAI API-fout HTTP ' + response.status
    );
  }

  var output = getText(data);
  if (!output) throw new Error('OpenAI gaf geen tekst terug.');
  return output;
}

function parseJson(value) {
  var text = String(value || '').trim();

  if (text.indexOf('```') === 0) {
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }

  try {
    return JSON.parse(text);
  } catch (e) {}

  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.substring(start, end + 1));
    } catch (e) {}
  }

  throw new Error('Ongeldige AI-uitvoer: ' + text.substring(0, 160));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Gebruik POST.' });
  }

  try {
    var body = req.body || {};

    if (body.action === 'analyze') {
      var story = String(body.story || '').trim();

      if (story.length < 8) {
        return send(res, 400, { error: 'Vertel iets meer over de situatie.' });
      }

      var analysisText = await askOpenAI(
        'Je bent OuderHulp. Analyseer alleen de vraag van de ouder. Geef geen advies en stel geen diagnose. Geef uitsluitend geldig JSON met de velden core_question, parent_goal, topic, age en unknowns. age mag null zijn. unknowns is een array van strings.',
        story,
        false
      );

      var analysis = parseJson(analysisText);

      return send(res, 200, {
        analysis: {
          core_question: String(analysis.core_question || ''),
          parent_goal: String(analysis.parent_goal || ''),
          topic: String(analysis.topic || ''),
          age: analysis.age == null ? null : String(analysis.age),
          unknowns: Array.isArray(analysis.unknowns)
            ? analysis.unknowns.map(String).slice(0, 6)
            : []
        }
      });
    }

    if (body.action === 'answer') {
      var prompt = 'Je bent OuderHulp, een empathische Nederlandse oudercoach. Geef rustig, praktisch en niet-veroordelend advies. Stel geen diagnose. Geef concrete stappen, een voorbeeldzin en maximaal één vervolgvraag. Bij direct gevaar: adviseer 112. Zoek actief met de actuele webzoekfunctie naar betrouwbare informatie. Gebruik bij voorkeur Nederlandse officiële of deskundige bronnen. Geef uitsluitend geldig JSON met answer_html, followup en sources. answer_html mag alleen p,h3,ol,ul,strong en blockquote bevatten. sources bevat maximaal 6 objecten met title, url en reason. Gebruik alleen echte URLs uit je zoekresultaten.';

      var input =
        'Verhaal:\n' + String(body.story || '') +
        '\nBegrip:\n' + JSON.stringify(body.analysis || {}) +
        '\nGesprek:\n' + JSON.stringify(body.conversation || []);

      var answerText = await askOpenAI(prompt, input, true);
      var answer = parseJson(answerText);

      answer.sources = Array.isArray(answer.sources)
        ? answer.sources.slice(0, 6).filter(function(s) {
            return s && s.url;
          }).map(function(s) {
            return {
              title: String(s.title || s.url),
              url: String(s.url),
              reason: String(s.reason || 'Relevante bron.')
            };
          })
        : [];

      answer.followup = answer.followup ? String(answer.followup) : null;
      answer.answer_html = String(answer.answer_html || '')
        .replace(/<script[\\s\\S]*?<\\/script>/gi, '');

      return send(res, 200, answer);
    }

    return send(res, 400, { error: 'Onbekende actie.' });
  } catch (error) {
    console.error('OuderHulp API error:', error);
    return send(res, 500, {
      error: error && error.message
        ? error.message
        : 'De serverfunctie is vastgelopen.'
    });
  }
}
