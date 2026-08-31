/**
 * IAU Intent & NLU Engine
 * Analisa a linguagem do usuário, classifica a intenção,
 * extrai entidades, regras ("X significa Y"), fatos e sentimentos.
 */

export type IAUIntentType =
  | 'GREETING'
  | 'TEACH_RULE'
  | 'TEACH_FACT'
  | 'TEACH_PREFERENCE'
  | 'RECALL_MEMORY'
  | 'SEARCH_DIARY'
  | 'CREATE_RECORD'
  | 'CREATE_TIMELINE'
  | 'EXPLAIN_CONCEPT'
  | 'QUIZ_TEST'
  | 'MATH_CALC'
  | 'TIME_QUERY'
  | 'EMOTIONAL_VENT'
  | 'GENERAL_CHAT';

export interface ExtractedEntity {
  type: 'rule' | 'fact' | 'preference' | 'date' | 'person' | 'math_expr' | 'topic';
  key?: string;
  value?: string;
  raw: string;
}

export interface IntentAnalysisResult {
  intent: IAUIntentType;
  confidence: number;
  entities: ExtractedEntity[];
  sentiment: 'positive' | 'neutral' | 'reflective' | 'distressed' | 'inquisitive';
  extractedRule?: { trigger: string; meaning: string };
  extractedFact?: { subject: string; fact: string };
  extractedPreference?: { type: string; value: string };
  mathExpression?: string;
  searchQuery?: string;
  topic?: string;
}

export function analyzeUserIntent(input: string, userName: string = 'Usuário'): IntentAnalysisResult {
  const text = (input || '').trim();
  const lower = text.toLowerCase();
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Detectar regra explícita de aprendizado: "quando eu falar X significa Y" / "quando eu disser X, quer dizer Y"
  const ruleMatch =
    text.match(/quando\s+eu\s+(?:falar|disser|escrever|mandar)\s+["'“]?([^"'”,\n]+)["'“]?[,\s]+(?:significa|quer dizer|trate como|e)\s+["'“]?([^"'”\n.]+)/i) ||
    text.match(/trate\s+["'“]?([^"'”]+)["'“]?\s+como\s+["'“]?([^"'”\n.]+)/i);

  if (ruleMatch) {
    const trigger = ruleMatch[1].trim();
    const meaning = ruleMatch[2].trim();
    return {
      intent: 'TEACH_RULE',
      confidence: 0.98,
      entities: [
        { type: 'rule', key: trigger, value: meaning, raw: ruleMatch[0] },
      ],
      sentiment: 'neutral',
      extractedRule: { trigger, meaning },
    };
  }

  // 2. Detectar fatos pessoais: "meu projeto se chama X", "eu me chamo X", "minha meta é X"
  const factMatch =
    text.match(/(?:meu|minha)\s+([a-zA-Záàâãéèêíïóôõöúçñ\s]{3,20})\s+(?:se chama|e|foi batizado de|tem o nome de)\s+["'“]?([^"'”\n.]+)/i) ||
    text.match(/eu\s+(?:me chamo|sou|moro em|trabalho com|nasci em|tenho)\s+["'“]?([^"'”\n.]+)/i) ||
    text.match(/lembre-se\s+que\s+([^.\n]+)/i);

  if (factMatch) {
    const subject = factMatch[1]?.trim() || 'Fato pessoal';
    const fact = factMatch[2]?.trim() || factMatch[1]?.trim() || text;
    return {
      intent: 'TEACH_FACT',
      confidence: 0.95,
      entities: [{ type: 'fact', key: subject, value: fact, raw: text }],
      sentiment: 'neutral',
      extractedFact: { subject, fact },
    };
  }

  // 3. Detectar preferências de comportamento da IAU
  if (
    normalized.includes('gosto de respostas curtas') ||
    normalized.includes('seja mais curta') ||
    normalized.includes('seja direto') ||
    normalized.includes('respostas breves') ||
    normalized.includes('seja mais descontraida') ||
    normalized.includes('fale com humor') ||
    normalized.includes('fale de forma informal') ||
    normalized.includes('seja mais formal') ||
    normalized.includes('seja mais carinhosa') ||
    normalized.includes('seja mais reflexiva')
  ) {
    let prefType = 'tone';
    let prefVal = 'natural';
    if (normalized.includes('curta') || normalized.includes('breve') || normalized.includes('direto')) {
      prefType = 'length';
      prefVal = 'short';
    } else if (normalized.includes('descontraida') || normalized.includes('humor') || normalized.includes('informal')) {
      prefType = 'tone';
      prefVal = 'witty';
    } else if (normalized.includes('carinhosa') || normalized.includes('afetuosa')) {
      prefType = 'tone';
      prefVal = 'empathetic';
    } else if (normalized.includes('formal') || normalized.includes('respeitosa')) {
      prefType = 'tone';
      prefVal = 'direct';
    } else if (normalized.includes('reflexiva')) {
      prefType = 'tone';
      prefVal = 'thoughtful';
    }

    return {
      intent: 'TEACH_PREFERENCE',
      confidence: 0.96,
      entities: [{ type: 'preference', key: prefType, value: prefVal, raw: text }],
      sentiment: 'positive',
      extractedPreference: { type: prefType, value: prefVal },
    };
  }

  // 4. Teste / Quiz: "me testa", "faz um quiz", "me faz perguntas"
  if (
    normalized.match(/\b(me testa|me teste|faca um quiz|faz um quiz|quero um quiz|me faca perguntas|me avalie|teste meus conhecimentos)\b/i)
  ) {
    const topicMatch = text.match(/(?:sobre|de)\s+([a-zA-Záàâãéèêíïóôõöúçñ\s]+)/i);
    const topic = topicMatch ? topicMatch[1].trim() : 'conhecimento geral';
    return {
      intent: 'QUIZ_TEST',
      confidence: 0.98,
      entities: [{ type: 'topic', value: topic, raw: text }],
      sentiment: 'inquisitive',
      topic,
    };
  }

  // 5. Explicar conceito / Ensinar o usuário: "me explica X", "o que é X?", "como funciona X"
  const explainMatch =
    text.match(/(?:me\s+)?(?:explica|ensina|conte|diga)\s+(?:como funciona|o que e|sobre)\s+([^?.\n]+)/i) ||
    text.match(/^o que\s+(?:e|significa|quer dizer)\s+([^?.\n]+)/i) ||
    text.match(/^como\s+(?:funciona|ocorre|acontece)\s+([^?.\n]+)/i);

  if (explainMatch) {
    const topic = explainMatch[1]?.trim() || '';
    return {
      intent: 'EXPLAIN_CONCEPT',
      confidence: 0.92,
      entities: [{ type: 'topic', value: topic, raw: text }],
      sentiment: 'inquisitive',
      topic,
    };
  }

  // 6. Consultar Memória / Lembrança: "qual é o nome do...", "você lembra do...", "o que eu te disse sobre..."
  if (
    normalized.includes('qual o nome do') ||
    normalized.includes('qual e o nome') ||
    normalized.includes('voce lembra') ||
    normalized.includes('lembra do') ||
    normalized.includes('lembra de') ||
    normalized.includes('o que eu te falei') ||
    normalized.includes('o que eu disse')
  ) {
    return {
      intent: 'RECALL_MEMORY',
      confidence: 0.94,
      entities: [{ type: 'topic', raw: text }],
      sentiment: 'inquisitive',
      searchQuery: text,
    };
  }

  // 7. Pesquisa no Diário / Registros
  if (
    normalized.includes('procura no meu diario') ||
    normalized.includes('ache o registro') ||
    normalized.includes('procura meus registros') ||
    normalized.includes('o que escrevi ontem') ||
    normalized.includes('o que escrevi semana passada') ||
    normalized.includes('ache a foto') ||
    normalized.includes('ache o audio') ||
    normalized.includes('procura sobre')
  ) {
    const queryTerm = text.replace(/procura(r)?|ache|meus registros|no meu di[aá]rio|sobre/gi, '').trim();
    return {
      intent: 'SEARCH_DIARY',
      confidence: 0.9,
      entities: [{ type: 'topic', raw: queryTerm }],
      sentiment: 'inquisitive',
      searchQuery: queryTerm || text,
    };
  }

  // 8. Criar Registro / Anotar no diário
  if (
    normalized.startsWith('cria um registro') ||
    normalized.startsWith('anota no meu diario') ||
    normalized.startsWith('anota no diario') ||
    normalized.startsWith('guarda esse pensamento') ||
    normalized.startsWith('registra no diario')
  ) {
    const content = text.replace(/^(cria um registro|anota no meu di[aá]rio|anota no di[aá]rio|guarda esse pensamento|registra no di[aá]rio)( que|:)?\s*/i, '').trim();
    return {
      intent: 'CREATE_RECORD',
      confidence: 0.95,
      entities: [{ type: 'fact', raw: content }],
      sentiment: 'reflective',
    };
  }

  // 9. Linha do tempo
  if (
    normalized.includes('linha do tempo') ||
    normalized.includes('resumo dos meus acontecimentos') ||
    normalized.includes('cronologia') ||
    normalized.includes('acontecimentos deste mes')
  ) {
    return {
      intent: 'CREATE_TIMELINE',
      confidence: 0.95,
      entities: [{ type: 'topic', raw: text }],
      sentiment: 'inquisitive',
    };
  }

  // 10. Cálculos matemáticos diretos: "quanto é 15 * 8", "25 + 40", "calcula 10% de 200"
  const mathMatch = text.match(/(?:quanto\s+[eé]|calcula|calcule|conta)?\s*([\d.,\s+\-*/%^()xX÷]+)(?:\?)?$/);
  if (mathMatch && mathMatch[1] && mathMatch[1].replace(/[^0-9]/g, '').length >= 1 && /[+\-*/%^xX÷]/.test(mathMatch[1])) {
    const expr = mathMatch[1].trim();
    return {
      intent: 'MATH_CALC',
      confidence: 0.96,
      entities: [{ type: 'math_expr', raw: expr }],
      sentiment: 'neutral',
      mathExpression: expr,
    };
  }

  // 11. Horário / Tempo
  if (
    normalized.includes('que dia e hoje') ||
    normalized.includes('que horas sao') ||
    normalized.includes('qual a data') ||
    normalized.includes('dia da semana')
  ) {
    return {
      intent: 'TIME_QUERY',
      confidence: 0.99,
      entities: [{ type: 'date', raw: text }],
      sentiment: 'neutral',
    };
  }

  // 12. Saudações cotidianas
  if (
    /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|fala|opa|salve|tudo bem|tudo bom|como vai)\b/i.test(text) &&
    text.split(/\s+/).length <= 4
  ) {
    return {
      intent: 'GREETING',
      confidence: 0.99,
      entities: [],
      sentiment: 'positive',
    };
  }

  // 13. Desabafo emocional
  if (
    normalized.includes('estou triste') ||
    normalized.includes('estou cansado') ||
    normalized.includes('dia dificil') ||
    normalized.includes('me sinto sozinho') ||
    normalized.includes('ansioso') ||
    normalized.includes('angustiado') ||
    normalized.includes('estou muito feliz') ||
    normalized.includes('dia maravilhoso') ||
    normalized.includes('muito empolgado')
  ) {
    const isSad = normalized.includes('triste') || normalized.includes('cansado') || normalized.includes('dificil') || normalized.includes('ansioso') || normalized.includes('sozinho');
    return {
      intent: 'EMOTIONAL_VENT',
      confidence: 0.94,
      entities: [],
      sentiment: isSad ? 'distressed' : 'positive',
    };
  }

  // Padrão Geral
  return {
    intent: 'GENERAL_CHAT',
    confidence: 0.75,
    entities: [],
    sentiment: 'neutral',
  };
}

/**
 * Avalia expressões matemáticas básicas de forma segura
 */
export function evaluateMathExpression(expr: string): { result: number; formatted: string } | null {
  try {
    let clean = expr
      .replace(/x/gi, '*')
      .replace(/÷/g, '/')
      .replace(/,/g, '.')
      .replace(/\s+/g, '');

    // Tratar porcentagem como "15% de 200" ou "15% * 200"
    const pctMatch = clean.match(/(\d+(?:\.\d+)?)%(?:de|\*)?(\d+(?:\.\d+)?)/i);
    if (pctMatch) {
      const p = parseFloat(pctMatch[1]);
      const v = parseFloat(pctMatch[2]);
      const res = (p / 100) * v;
      return { result: res, formatted: `${p}% de ${v} = ${res}` };
    }

    // Apenas caracteres matemáticos permitidos
    if (!/^[\d.+\-*/()]+$/.test(clean)) {
      return null;
    }

    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${clean})`);
    const val = fn();
    if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
      return {
        result: val,
        formatted: `${expr} = ${val.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}
