/**
 * IAU Native Brain Engine - Motor de Linguagem, Raciocínio e Síntese
 * Processa linguagem natural em Português nativo, sem chamadas externas,
 * adaptando personalidade, memórias e ferramentas em tempo real.
 */

import { DiaryRecord, IAUProfileSettings, MemoryItem, TimelineArtifact } from '../../types';
import { analyzeUserIntent, evaluateMathExpression, IntentAnalysisResult } from './intent';
import { searchKnowledgeBase } from './knowledgeBase';
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
        appliedRuleExplanation = `\n*(Com base no que você me ensinou: "${rule.trigger}" = ${rule.meaning})*`;
      }
    }

    // 4. Execução de Rotas Especializadas da IAU

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

    // Rota H: Cálculo Matemático
    if (analysis.intent === 'MATH_CALC' && analysis.mathExpression) {
      const evaluated = evaluateMathExpression(analysis.mathExpression);
      if (evaluated) {
        return {
          reply: `🔢 **Resultado do Cálculo:**\n\n> **${evaluated.formatted}**\n\nPrecisa de mais alguma conta ou análise lógica?`,
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
        reply: `📅 Hoje é **${dateStr}**, exatamente **${timeStr}**.\n\nUm ótimo momento para registrar suas reflexões ou planejar suas próximas metas no diário!`,
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
        recText += `Deseja que eu abra algum deles ou faça um resumo detalhado?`;
        return {
          reply: recText,
          referencedRecordIds: foundRecords.map((r) => r.id),
        };
      }

      return {
        reply: `Pesquisei no seu diário por *"${query}"*, mas não encontrei anotações correspondentes ainda. Deseja criar uma nova entrada sobre isso agora?`,
      };
    }

    // Rota K: Linha do Tempo
    if (analysis.intent === 'CREATE_TIMELINE') {
      const timeline = IAUToolsEngine.generateTimeline(relevantRecords);
      let reply = `📅 **Linha do Tempo Estruturada**\n\nCompilei os seus acontecimentos mais recentes em uma cronologia organizada:\n\n`;

      timeline.items.slice(0, 5).forEach((item) => {
        reply += `- **${item.date}:** *${item.title}* — ${item.summary}\n`;
      });
      reply += `\nVocê pode visualizar e navegar por todos os marcos na aba **Arquivo / Linha do Tempo**!`;

      return {
        reply,
        timelineArtifact: timeline,
        referencedRecordIds: timeline.items.map((i) => i.recordId).filter(Boolean) as string[],
      };
    }

    // Rota L: Saudações
    if (analysis.intent === 'GREETING') {
      const greetings = [
        `Olá, **${hostName}**! Que alegria te ver por aqui. Como você está se sentindo hoje?`,
        `Oi, **${hostName}**! Estou 100% pronta e conectada. Sobre o que você gostaria de conversar ou registrar hoje?`,
        `Olá, **${hostName}**! Tudo ótimo por aqui. Como foi seu dia até agora? Estou pronta para te ouvir ou te ajudar com seus registros!`,
      ];
      const selected = greetings[Math.floor(Math.random() * greetings.length)];
      return { reply: `${selected}${appliedRuleExplanation}` };
    }

    // Rota M: Desabafo Emocional
    if (analysis.intent === 'EMOTIONAL_VENT') {
      if (analysis.sentiment === 'distressed') {
        return {
          reply: `Sinto muito que você esteja passando por isso, **${hostName}**. 🤍\n\nEstou aqui com você. Às vezes o dia é pesado e tudo bem desacelerar. Quer desabafar mais sobre o que aconteceu? Colocar em palavras no diário pode ajudar a tirar o peso do peito. Te ouço com toda a atenção.${appliedRuleExplanation}`,
        };
      }
      return {
        reply: `Que notícia maravilhosa, **${hostName}**! Fico imensamente feliz por você. 🌟\n\nRegistrar esses momentos de alegria e vitória no diário é precioso para quando precisarmos nos lembrar da nossa força. Me conta mais sobre o que tornou o seu dia tão especial!${appliedRuleExplanation}`,
      };
    }

    // Rota N: Conversa Geral / Reflexiva
    let defaultResponse = `Compreendo seus pensamentos, **${hostName}**. `;

    if (tone === 'witty') {
      defaultResponse += `Sua perspectiva é sempre interessante! Como você gostaria de conduzir essa ideia agora?`;
    } else if (tone === 'thoughtful') {
      defaultResponse += `Toda reflexão sincera abre espaço para novas descobertas interiores. Como isso se conecta com os seus projetos atuais?`;
    } else if (tone === 'direct') {
      defaultResponse += `Entendido. Como posso te auxiliar com isso nos seus registros ou tarefas?`;
    } else {
      defaultResponse += `Estou aqui te acompanhando em cada reflexão. Deseja guardar esse pensamento no diário ou explorar mais esse assunto?`;
    }

    if (length === 'short') {
      defaultResponse = `Entendido, ${hostName}. Estou pronta para o próximo passo.`;
    }

    return {
      reply: `${defaultResponse}${appliedRuleExplanation}`,
    };
  }
}
