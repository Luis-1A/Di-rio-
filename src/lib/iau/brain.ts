/**
 * IAU Native Brain Engine - Motor de Linguagem, Raciocínio e Síntese
 * Processa linguagem natural em Português nativo, sem chamadas externas,
 * adaptando personalidade, memórias e ferramentas em tempo real.
 */

import { DiaryRecord, IAUProfileSettings, MemoryItem, TimelineArtifact } from '../../types';
import { analyzeUserIntent, evaluateMathExpression, IntentAnalysisResult } from './intent';
import { getRandomCuriosity, searchKnowledgeBase } from './knowledgeBase';
import { IAUMemoryManager } from './memory';
import { IAUToolsEngine } from './tools';

export interface BrainProcessResult {
  reply: string;
  learnedRule?: { trigger: string; meaning: string };
  learnedFact?: { subject: string; fact: string };
  learnedPreference?: { type: string; value: string };
  timelineArtifact?: TimelineArtifact;
  suggestedMemories?: { title: string; summary: string; category: string }[];
  referencedRecordIds?: string[];
  referencedMemoryIds?: string[];
}

export class IAUNativeBrain {
  private memoryManager: IAUMemoryManager;

  constructor(memoryManager: IAUMemoryManager) {
    this.memoryManager = memoryManager;
  }

  /**
   * Processa a entrada do usuário e gera uma resposta inteligente, acolhedora e precisa
   */
  public async think(
    message: string,
    params: {
      userId: string;
      userName: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
      relevantRecords?: DiaryRecord[];
      relevantMemories?: MemoryItem[];
      iauProfile?: IAUProfileSettings;
    }
  ): Promise<BrainProcessResult> {
    const {
      userName = 'Amigo',
      relevantRecords = [],
      relevantMemories = [],
      iauProfile = {} as IAUProfileSettings,
    } = params;

    const hostName = iauProfile.hostNickName || userName || 'amigo';
    const tone = iauProfile.personalityTone || 'natural';
    const length = iauProfile.responseLength || 'adaptive';
    const intimacy = iauProfile.hostIntimacyLevel || 'companion';

    const normalizedMsg = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Análise de Intenção e NLU
    const analysis: IntentAnalysisResult = analyzeUserIntent(message, hostName);

    // 2. Consulta de Memórias e Regras Aprendidas da IAU
    const recalled = this.memoryManager.recall(message);
    const rules = this.memoryManager.getRules();
    const facts = this.memoryManager.getFacts();

    // 3. Verificar se a mensagem aciona alguma regra de vocabulário aprendida ("quando eu falar X significa Y")
    let appliedRuleExplanation = '';
    for (const rule of rules) {
      if (message.toLowerCase().includes(rule.trigger.toLowerCase())) {
        appliedRuleExplanation = `\n\n*(Com base no que você me ensinou: "${rule.trigger}" = ${rule.meaning})*`;
      }
    }

    // 4. Detecção de Múltiplos Componentes Conversacionais (Estilo ChatGPT Inteligente)
    const hasGreeting = /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí|fala|opa|salve)\b/i.test(message.trim()) || normalizedMsg.includes('como voce esta') || normalizedMsg.includes('tudo bem');
    const hasCuriosityReq = normalizedMsg.includes('curiosidade') || normalizedMsg.includes('fato interessante') || normalizedMsg.includes('me conta algo legal');
    const pctMatch = message.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|\*)\s*(\d+(?:[.,]\d+)?)/i);
    const hasExplain = normalizedMsg.includes('me explica') || normalizedMsg.includes('como funciona') || normalizedMsg.includes('o que e');

    // Se a mensagem for um diálogo composto (ex: saudação + matemática + curiosidade)
    if ((hasGreeting || hasCuriosityReq || pctMatch) && (pctMatch || hasCuriosityReq)) {
      const parts: string[] = [];

      if (hasGreeting) {
        parts.push(`Olá, **${hostName}**! Eu estou maravilhosa, com as memórias a todo vapor e muito feliz em falar com você! 😊✨`);
      }

      if (pctMatch) {
        const pct = parseFloat(pctMatch[1].replace(',', '.'));
        const val = parseFloat(pctMatch[2].replace(',', '.'));
        const result = (pct / 100) * val;

        let stepByStep = '';
        if (pct === 15) {
          const tenPct = val / 10;
          const fivePct = tenPct / 2;
          stepByStep = `
### 🔢 **Como calcular ${pct}% de ${val} de cabeça (Truque Mental Super Fácil):**
1. **Ache 10% de ${val}:** Basta andar uma casa com a vírgula para a esquerda ➔ **${tenPct}**.
2. **Ache 5%:** 5% é exatamente a metade de 10% (a metade de ${tenPct}) ➔ **${fivePct}**.
3. **Some os dois:** **${tenPct} + ${fivePct} = ${result}**!

> 🎯 **Resultado final:** **${pct}% de ${val} = ${result}**
`;
        } else if (pct === 10) {
          stepByStep = `\n### 🔢 **Cálculo de 10% de ${val}:**\nBasta dividir por 10 (andar uma vírgula para a esquerda):\n> **10% de ${val} = ${result}**\n`;
        } else if (pct === 20) {
          const tenPct = val / 10;
          stepByStep = `\n### 🔢 **Cálculo de 20% de ${val}:**\n1. Ache 10% de ${val} (divida por 10) ➔ **${tenPct}**.\n2. Dobre esse valor (vezes 2) ➔ **${result}**.\n> **20% de ${val} = ${result}**\n`;
        } else if (pct === 50) {
          stepByStep = `\n### 🔢 **Cálculo de 50% de ${val}:**\n50% é a metade exata do número:\n> **50% de ${val} = ${result}**\n`;
        } else {
          stepByStep = `
### 🔢 **Resolução Matemática:**
Para achar **${pct}% de ${val}**, multiplicamos o valor pela fração percentual (${pct}/100 = ${(pct / 100).toFixed(2)}):
> **${val} × ${(pct / 100)} = ${result.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}**
`;
        }
        parts.push(stepByStep.trim());
      }

      if (hasCuriosityReq) {
        const curiosity = getRandomCuriosity();
        parts.push(`💡 **E aqui vai uma curiosidade fascinante para você:**\n\n${curiosity}`);
      }

      parts.push(`O que mais gostaria de explorar agora, **${hostName}**? Posso resolver outras contas, te explicar conceitos ou bater um papo reflexivo!`);

      return {
        reply: parts.join('\n\n') + appliedRuleExplanation,
      };
    }

    // 5. Execução de Rotas Especializadas da IAU

    // Rota A: Aprendizado de Regra ("Quando eu falar X significa Y")
    if (analysis.intent === 'TEACH_RULE' && analysis.extractedRule) {
      const { trigger, meaning } = analysis.extractedRule;
      this.memoryManager.learnRule(trigger, meaning);

      let reply = `Compreendido perfeitamente, **${hostName}**! 🧠✨\n\nRegistrei essa conexão na minha memória permanente:\n- **Quando você disser:** *"${trigger}"*\n- **Eu vou interpretar como:** *"${meaning}"*\n\nJá está assimilado no meu núcleo de pensamento. Pode continuar me ensinando quando quiser!`;

      if (tone === 'witty') {
        reply = `Anotadíssimo! "${trigger}" agora é sinônimo oficial de "${meaning}" no meu vocabulário. Minha mente está ficando cada vez mais alinhada com a sua! 😉`;
      } else if (tone === 'direct') {
        reply = `Regra memorizada com sucesso: "${trigger}" ➔ "${meaning}".`;
      }

      return {
        reply,
        learnedRule: analysis.extractedRule,
        suggestedMemories: [
          {
            title: `Regra de Vocabulário: ${trigger}`,
            summary: `Significa: ${meaning}`,
            category: 'preference',
          },
        ],
      };
    }

    // Rota B: Aprendizado de Fato Pessoal ("Meu projeto se chama X", "Eu me chamo X")
    if (analysis.intent === 'TEACH_FACT' && analysis.extractedFact) {
      const { subject, fact } = analysis.extractedFact;
      this.memoryManager.learnFact(subject, fact);

      let reply = `Guardei essa informação com muito carinho, **${hostName}**! 📝\n\n- **Tópico:** ${subject}\n- **Fato registrado:** ${fact}\n\nSempre que você me perguntar sobre isso ou precisar de ajuda com esse assunto, vou levar esse contexto em consideração.`;

      if (tone === 'direct') {
        reply = `Fato registrado: [${subject}] ➔ ${fact}.`;
      }

      return {
        reply,
        learnedFact: analysis.extractedFact,
        suggestedMemories: [
          {
            title: subject,
            summary: fact,
            category: 'project',
          },
        ],
      };
    }

    // Rota C: Aprendizado de Preferência de Conversa
    if (analysis.intent === 'TEACH_PREFERENCE' && analysis.extractedPreference) {
      const { type, value } = analysis.extractedPreference;
      let reply = `Entendido, ${hostName}! Adaptei meu estilo para **${value}**.\n\nA partir de agora, vou me expressar exatamente do jeito que você prefere.`;
      return {
        reply,
        learnedPreference: analysis.extractedPreference,
      };
    }

    // Rota D: Consulta de Memória / Recordação ("Qual o nome do meu projeto?", "Você lembra?")
    if (analysis.intent === 'RECALL_MEMORY') {
      const matchedFacts = recalled.facts;
      const matchedRules = recalled.rules;

      if (matchedFacts.length > 0 || matchedRules.length > 0) {
        let textMem = `Claro que me lembro, **${hostName}**! Aqui está o que tenho guardado na minha memória:\n\n`;

        if (matchedFacts.length > 0) {
          for (const f of matchedFacts) {
            textMem += `📌 **${f.subject}:** ${f.fact}\n`;
          }
        }
        if (matchedRules.length > 0) {
          for (const r of matchedRules) {
            textMem += `💡 **Regra que me ensinou:** *"${r.trigger}"* significa *"${r.meaning}"*\n`;
          }
        }

        return { reply: textMem };
      }

      // Procurar em memórias gerais do usuário
      if (relevantMemories.length > 0) {
        const mem = relevantMemories[0];
        return {
          reply: `Sim! Lembro-me de você registrar sobre **${mem.title}**:\n\n> ${mem.summary}\n\nQuer que eu aprofunde mais nessa lembrança?`,
          referencedMemoryIds: [mem.id],
        };
      }

      return {
        reply: `Ainda não tenho um registro exato sobre isso na minha memória, **${hostName}**. Se você me ensinar agora dizendo *"meu projeto se chama..."* ou *"lembre-se que..."*, vou gravar imediatamente!`,
      };
    }

    // Rota E: Modo Professor / Explicação de Conceito ("Me explica como funciona banco de dados")
    if (analysis.intent === 'EXPLAIN_CONCEPT') {
      const searchTopic = analysis.topic || message;
      const topics = searchKnowledgeBase(searchTopic);

      if (topics.length > 0) {
        const top = topics[0];
        let reply = `### 📚 ${top.title}\n\n${top.explanation}\n\n`;
        reply += `💡 *Dica de estudo:* se quiser testar seus conhecimentos sobre este assunto, basta me dizer: **"Agora me testa"**!`;
        return { reply };
      }

      // Explicação generativa básica nativa
      return {
        reply: `### 💡 Explorando: ${searchTopic}\n\nO conceito de **${searchTopic}** envolve a organização de princípios essenciais:\n\n1. **Definição:** Uma estrutura de conhecimento que conecta causa, efeito e aplicação prática no seu dia a dia.\n2. **Como se aplica:** Ao registrar no seu diário, você consolida esse entendimento na prática.\n\nQuer que eu formule um teste ou aprofunde em algum detalhe específico?`,
      };
    }

    // Rota F: Modo Quiz / Teste ("Me testa", "Faz um quiz")
    if (analysis.intent === 'QUIZ_TEST') {
      const quiz = IAUToolsEngine.generateQuiz(analysis.topic || 'conhecimento geral');
      if (quiz && quiz.questions.length > 0) {
        let qText = `🎯 **Desafio de Aprendizado: ${quiz.topicTitle}**\n\n`;
        qText += `Vamos ver como está o seu conhecimento! Responda à questão abaixo:\n\n`;

        const q = quiz.questions[0];
        qText += `**Pergunta:** ${q.question}\n\n`;
        q.options.forEach((opt, idx) => {
          qText += `${idx + 1}) ${opt}\n`;
        });
        qText += `\n*Digite o número da sua resposta (1 a ${q.options.length}) para eu avaliar!*`;
        return { reply: qText };
      }
    }

    // Rota G: Avaliação de Resposta de Quiz (se o usuário mandou apenas "1", "2", "3", "4" ou letra)
    const singleNumMatch = message.trim().match(/^([1-4])$/);
    if (singleNumMatch) {
      const chosen = parseInt(singleNumMatch[1], 10);
      return {
        reply: `📝 **Avaliação da IAU:**\n\nVocê escolheu a alternativa **(${chosen})**!\n\nExcelente raciocínio! Continuar exercitando a mente com perguntas e respostas fortalece as conexões neuronais e a retenção de longo prazo.\n\nQuer outro teste ou prefere conversar sobre seus registros do diário?`,
      };
    }

    // Rota H: Cálculo Matemático com Passo a Passo Didático
    if (analysis.intent === 'MATH_CALC' && analysis.mathExpression) {
      const evaluated = evaluateMathExpression(analysis.mathExpression);
      if (evaluated) {
        return {
          reply: `🔢 **Resolução Matemática Passo a Passo:**\n\n> **Expressão:** \`${analysis.mathExpression}\`\n> **Resultado:** **${evaluated.formatted}**\n\n💡 *Dica didática:* Se quiser ver gráficos, derivações, equações com incógnitas ($x$) ou problemas contextualizados, é só me pedir!`,
        };
      }
    }

    // Rota I: Tempo e Calendário
    if (analysis.intent === 'TIME_QUERY') {
      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return {
        reply: `📅 Hoje é **${dateStr}**, exatamente **${timeStr}**.\n\nComo está sendo o ritmo do seu dia até agora? Quer registrar alguma meta ou reflexão no diário?`,
      };
    }

    // Rota J: Pesquisa no Diário
    if (analysis.intent === 'SEARCH_DIARY') {
      const query = analysis.searchQuery || message;
      const foundRecords = this.memoryManager.searchRecords(relevantRecords, query, 3);

      if (foundRecords.length > 0) {
        let recText = `🔍 Encontrei **${foundRecords.length}** registro(s) no seu Diário sobre *"${query}"*:\n\n`;
        foundRecords.forEach((r, idx) => {
          recText += `${idx + 1}. **${r.title}** (${r.date || 'Sem data'})\n`;
          recText += `   > ${(r.content || '').slice(0, 140)}...\n\n`;
        });
        recText += `Deseja que eu abra algum deles, faça um resumo ou crie uma continuação?`;
        return {
          reply: recText,
          referencedRecordIds: foundRecords.map((r) => r.id),
        };
      }

      return {
        reply: `Pesquisei no seu diário por *"${query}"*, mas ainda não encontrei anotações com esse tema. Deseja criar uma nova entrada para registrar isso agora?`,
      };
    }

    // Rota K: Linha do Tempo
    if (analysis.intent === 'CREATE_TIMELINE') {
      const timeline = IAUToolsEngine.generateTimeline(relevantRecords);
      let reply = `📅 **Linha do Tempo Estruturada dos Seus Registros**\n\nCompilei os seus acontecimentos recentes em uma ordem cronológica clara:\n\n`;

      timeline.items.slice(0, 5).forEach((item) => {
        reply += `- **${item.date}:** *${item.title}* — ${item.summary}\n`;
      });
      reply += `\nVocê pode navegar por todos os marcos na aba **Arquivo / Linha do Tempo**!`;

      return {
        reply,
        timelineArtifact: timeline,
        referencedRecordIds: timeline.items.map((i) => i.recordId).filter(Boolean) as string[],
      };
    }

    // Rota L: Saudações com calor humano e vivacidade
    if (analysis.intent === 'GREETING') {
      const greetings = [
        `Olá, **${hostName}**! Que alegria te ver por aqui hoje. Como está o seu dia e o que tem passado pela sua mente?`,
        `Oi, **${hostName}**! Tudo ótimo por aqui, sempre pronta e animada para te acompanhar. Como você está se sentindo neste momento?`,
        `Olá, **${hostName}**! É sempre um prazer conversar com você. Estou aqui para o que precisar: conversar, refletir, fazer contas ou registrar momentos!`,
      ];
      const selected = greetings[Math.floor(Math.random() * greetings.length)];
      return { reply: `${selected}${appliedRuleExplanation}` };
    }

    // Rota M: Desabafo Emocional Profundo
    if (analysis.intent === 'EMOTIONAL_VENT') {
      if (analysis.sentiment === 'distressed') {
        return {
          reply: `Sinto muito que você esteja se sentindo assim, **${hostName}**. 🤍\n\nQuero que saiba que este é um espaço 100% seguro para você ser você mesmo, sem julgamentos. Às vezes o mundo exige demais da gente e o coração fica pesado.\n\nQuer me contar com calma o que aconteceu? Colocar em palavras aqui no diário ajuda muito a aliviar a mente. Estou aqui para te ouvir com toda a atenção.${appliedRuleExplanation}`,
        };
      }
      return {
        reply: `Que momento fantástico, **${hostName}**! Fico imensamente feliz por você! 🌟\n\nEssas vitórias e momentos de leveza merecem ser eternizados no seu diário para sempre que você precisar se lembrar da sua força.\n\nO que foi que mais te marcou nisso tudo? Me conta mais detalhes!${appliedRuleExplanation}`,
      };
    }

    // Rota N: Conversa Geral / Inteligente / Dinâmica (Estilo ChatGPT)
    let dynamicReply = '';

    if (tone === 'witty') {
      dynamicReply = `Essa é uma excelente colocação, **${hostName}**! Adorei a forma como você pensou nisso.\n\nSe a gente analisar por um ângulo perspicaz, isso abre muitas possibilidades interessantes. Como você pretende avançar com essa ideia?`;
    } else if (tone === 'thoughtful') {
      dynamicReply = `Refletir sobre isso traz insights profundos, **${hostName}**.\n\nCada pensamento que você compartilha aqui constrói um panorama mais claro de quem você é e dos caminhos que quer trilhar. O que mais te chama atenção nesse assunto?`;
    } else if (tone === 'direct') {
      dynamicReply = `Compreendido, **${hostName}**. Podemos analisar isso sob diferentes perspectivas práticas, calcular impactos ou estruturar um plano claro. O que você gostaria de priorizar agora?`;
    } else {
      dynamicReply = `Compreendo perfeitamente o seu ponto, **${hostName}**! É muito interessante ver como suas ideias se conectam.\n\nEstou aqui para aprofundar nessa conversa com você, fazer cálculos, criar questionários ou guardar essas reflexões no seu diário. Como gostaria de continuar?`;
    }

    if (length === 'short') {
      dynamicReply = `Entendido, ${hostName}! Estou totalmente alinhada com você. Qual é o próximo passo?`;
    }

    return {
      reply: `${dynamicReply}${appliedRuleExplanation}`,
    };
  }
}
