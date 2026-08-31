/**
 * IAU Knowledge Base - Base de Conhecimento e Linguagem Portuguesa
 * Contém o léxico fundamental, regras gramaticais, educação básica,
 * raciocínio matemático, lógica, ciências e inteligência emocional.
 */

export interface KnowledgeTopic {
  id: string;
  category: 'gramatica' | 'matematica' | 'ciencias' | 'filosofia' | 'diario' | 'tecnologia' | 'emocional';
  keywords: string[];
  title: string;
  summary: string;
  explanation: string;
  quizQuestions?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  }[];
}

export const IAU_BASIC_EDUCATION_DATABASE: KnowledgeTopic[] = [
  // 1. Gramática e Língua Portuguesa
  {
    id: 'gramatica_classes',
    category: 'gramatica',
    keywords: ['gramatica', 'substantivo', 'verbo', 'adjetivo', 'pronome', 'adverbio', 'lingua portuguesa', 'classes gramaticais'],
    title: 'Classes Gramaticais da Língua Portuguesa',
    summary: 'As 10 classes de palavras que estruturam o idioma português.',
    explanation: `A Língua Portuguesa possui 10 classes gramaticais fundamentais:
1. **Substantivo**: Dá nome aos seres, objetos, sentimentos e lugares (ex: *diário*, *amor*, *IAU*).
2. **Verbo**: Expressa ações, estados ou fenômenos da natureza (ex: *escrever*, *lembrar*, *chover*).
3. **Adjetivo**: Caracteriza ou qualifica o substantivo (ex: *sincero*, *brilhante*, *calmo*).
4. **Pronome**: Substitui ou acompanha o nome (ex: *eu*, *você*, *meu*, *aquele*).
5. **Advérbio**: Modifica verbos, adjetivos ou outros advérbios indicando tempo, modo ou lugar (ex: *hoje*, *rapidamente*, *aqui*).
6. **Preposição**: Liga palavras estabelecendo relação (ex: *de*, *para*, *com*, *em*).
7. **Conjunção**: Conecta orações ou termos semelhantes (ex: *e*, *mas*, *porque*, *embora*).
8. **Artigo**: Define ou indefine o substantivo (ex: *o*, *a*, *um*, *uma*).
9. **Numeral**: Indica quantidade ou ordem (ex: *primeiro*, *dois*, *dobro*).
10. **Interjeição**: Expressa emoções e sentimentos súbitos (ex: *uau!*, *ah!*, *olá!*).`,
    quizQuestions: [
      {
        question: 'Qual classe gramatical indica uma ação, estado ou fenômeno da natureza?',
        options: ['Substantivo', 'Adjetivo', 'Verbo', 'Advérbio'],
        correctAnswer: 2,
        explanation: 'O verbo é a classe responsável por flexionar em tempo e pessoa para indicar ações e estados.',
      },
      {
        question: 'Na frase "Escrevi calmamente no meu diário", a palavra "calmamente" é:',
        options: ['Adjetivo', 'Advérbio de modo', 'Substantivo', 'Pronome'],
        correctAnswer: 1,
        explanation: '"Calmamente" é um advérbio que indica o modo como a ação de escrever foi realizada.',
      },
    ],
  },
  {
    id: 'gramatica_pontuacao',
    category: 'gramatica',
    keywords: ['pontuacao', 'virgula', 'ponto', 'interrogacao', 'exclamacao', 'dois pontos', 'aspas', 'travessao'],
    title: 'Sinais de Pontuação e Expressividade',
    summary: 'Como pontuar corretamente para transmitir clareza, ritmo e emoção.',
    explanation: `A pontuação organiza o pensamento escrito:
- **Ponto final (.)**: Encerra um período declarativo completo.
- **Vírgula (,)**: Marca pausas breves, separa itens de uma lista, vocativos e orações explicativas. *Nunca separa o sujeito do predicado direto*.
- **Ponto e vírgula (;)**: Separa itens longos ou orações coordenadas com certa independência.
- **Dois-pontos (:)**: Anuncia uma citação, enumeração ou explicação detalhada.
- **Travessão (—)**: Indica a fala de interlocutores ou destaca termos importantes.
- **Ponto de Interrogação (?)**: Formula perguntas diretas.
- **Ponto de Exclamação (!)**: Demonstra surpresa, ênfase, ordem ou entusiasmo.`,
    quizQuestions: [
      {
        question: 'Qual sinal deve ser usado para introduzir uma enumeração explicativa?',
        options: ['Ponto e vírgula', 'Dois-pontos', 'Ponto final', 'Aspas'],
        correctAnswer: 1,
        explanation: 'Os dois-pontos servem exatamente para anunciar explicações, enumerações ou falas.',
      },
    ],
  },

  // 2. Banco de Dados e Tecnologia
  {
    id: 'tec_banco_dados',
    category: 'tecnologia',
    keywords: ['banco de dados', 'database', 'sql', 'nosql', 'firestore', 'tabelas', 'documentos', 'persistência', 'firebase'],
    title: 'Como Funcionam os Bancos de Dados',
    summary: 'Estruturas de armazenamento seguro, organização e consulta de dados.',
    explanation: `Um **banco de dados** é um sistema organizado para armazenar, gerenciar e recuperar informações com segurança e velocidade.
Eles se dividem principalmente em:
1. **Relacionais (SQL)**: Organizam dados em tabelas com linhas e colunas fixas interligadas por chaves (ex: PostgreSQL, MySQL, SQLite).
2. **Não Relacionais (NoSQL / Documentos)**: Guardam dados em formato flexível (JSON/documentos), ideais para diários, perfis e mensagens (ex: Firestore, MongoDB).
3. **Persistência Local**: Mecanismos como IndexedDB e LocalStorage guardam dados diretamente no navegador do usuário, permitindo funcionamento offline total.`,
    quizQuestions: [
      {
        question: 'Qual a principal vantagem de um banco de dados NoSQL baseado em documentos como o Firestore?',
        options: [
          'Exigir esquemas rígidos e tabelas imutáveis',
          'Flexibilidade para armazenar objetos JSON dinâmicos e sincronização em tempo real',
          'Funcionar apenas em disquetes',
          'Não permitir pesquisas',
        ],
        correctAnswer: 1,
        explanation: 'Bancos de documentos NoSQL permitem salvar estruturas ricas em JSON com alta escalabilidade e sincronização instantânea.',
      },
    ],
  },
  {
    id: 'tec_inteligencia_artificial',
    category: 'tecnologia',
    keywords: ['inteligencia artificial', 'ia', 'iau', 'algoritmo', 'nlu', 'machine learning', 'como funciona ia', 'cerebro digital'],
    title: 'Fundamentos da Inteligência Artificial e da IAU',
    summary: 'Como uma IA processa texto, aprende padrões, armazena memórias e toma decisões.',
    explanation: `A Inteligência Artificial (e a IAU no seu Diário Pessoal) opera através de 4 pilares:
1. **Percepção e NLU (Compreensão de Linguagem)**: Decomposição do texto em tokens, identificação de intenções (desabafo, busca, aprendizado, ordem) e sentimentos.
2. **Memória Estruturada**: Separação de fatos do usuário, preferências de convivência e regras aprendidas.
3. **Raciocínio Lógico & Decisão**: Avaliação de quais ferramentas usar (pesquisar no diário, criar memórias, gerar reflexões).
4. **Geração de Linguagem**: Síntese de respostas calorosas, gramaticalmente corretas e contextualmente alinhadas com o perfil do usuário.`,
  },

  // 3. Matemática e Lógica
  {
    id: 'mat_fundamentos',
    category: 'matematica',
    keywords: ['matematica', 'calculo', 'aritmetica', 'porcentagem', 'soma', 'multiplicacao', 'divisao', 'subtracao', 'logica'],
    title: 'Matemática Básica e Raciocínio Lógico',
    summary: 'Operações fundamentais, frações, proporções e porcentagens aplicadas.',
    explanation: `A matemática é a linguagem dos padrões e das quantidades:
- **Operações Básicas**: Adição (+), Subtração (-), Multiplicação (× ou *) e Divisão (÷ ou /).
- **Ordem de Precedência (PEMDAS)**: Parênteses → Expoentes → Multiplicação/Divisão → Adição/Subtração.
- **Porcentagem (%)**: Razão com base 100. Exemplo: 20% de 150 = (20 ÷ 100) × 150 = 30.
- **Média Aritmética**: Soma de todos os valores dividida pelo número total de termos.`,
    quizQuestions: [
      {
        question: 'Quanto é 20 + 5 * 2?',
        options: ['50', '30', '25', '40'],
        correctAnswer: 1,
        explanation: 'Pela ordem de precedência, a multiplicação (5 * 2 = 10) é resolvida primeiro, somando-se depois 20 = 30.',
      },
      {
        question: 'Quanto é 15% de 200?',
        options: ['15', '20', '30', '35'],
        correctAnswer: 2,
        explanation: '(15 / 100) * 200 = 0.15 * 200 = 30.',
      },
    ],
  },

  // 4. Ciências Naturais e o Tempo
  {
    id: 'cien_tempo_universo',
    category: 'ciencias',
    keywords: ['tempo', 'calendario', 'ano bissexto', 'estacoes do ano', 'sol', 'terra', 'lua', 'ciencias'],
    title: 'O Tempo, Calendário e Movimentos da Terra',
    summary: 'Como medimos os dias, meses, anos e as fases do tempo.',
    explanation: `A contagem do tempo baseia-se nos ciclos celestes:
- **Rotação da Terra**: Giro completo sobre seu próprio eixo (duração: ~24 horas = 1 dia).
- **Translação da Terra**: Órbita completa ao redor do Sol (duração: ~365 dias e 6 horas = 1 ano).
- **Ano Bissexto**: A cada 4 anos, acumulam-se as 6 horas extras (4 × 6 = 24h = 1 dia), adicionando o dia 29 de fevereiro.
- **Estações do Ano**: Causadas pela inclinação de 23,5° do eixo da Terra durante o movimento de translação (Primavera, Verão, Outono e Inverno).`,
    quizQuestions: [
      {
        question: 'Por que o ano bissexto existe?',
        options: [
          'Porque a Lua muda de fase a cada 4 anos',
          'Para compensar as ~6 horas extras que a Terra leva além dos 365 dias para dar a volta ao redor do Sol',
          'Por decisão puramente política sem relação astronômica',
          'Porque o mês de fevereiro era muito curto',
        ],
        correctAnswer: 1,
        explanation: 'A Terra leva aproximadamente 365,2422 dias para completar a órbita, gerando 1 dia extra a cada 4 anos.',
      },
    ],
  },

  // 5. Diário Pessoal e Inteligência Emocional
  {
    id: 'emocional_autoconhecimento',
    category: 'emocional',
    keywords: ['diario', 'autoconhecimento', 'emocoes', 'desabafo', 'saude mental', 'reflexao', 'habitos', 'sentimentos'],
    title: 'A Importância do Diário e do Registro Pessoal',
    summary: 'Como escrever e registrar sua vida organiza a mente e fortalece o bem-estar.',
    explanation: `Manter um diário pessoal é uma das práticas mais transformadoras para a clareza mental:
1. **Alívio Emocional (Catarse)**: Escrever desabafos reduz a carga de ansiedade ao externalizar pensamentos turbulentos.
2. **Reconhecimento de Padrões**: Reler anotações passadas permite perceber ciclos de humor, gatilhos de estresse e conquistas esquecidas.
3. **Memória de Longo Prazo**: Momentos preciosos e detalhes do cotidiano não se perdem no tempo.
4. **Presença e Gratidão**: Tomar alguns minutos diários para pausar e refletir ancora a consciência no presente.`,
  },
];

/**
 * Busca de tópico de conhecimento básico por palavras-chave
 */
export function searchKnowledgeBase(query: string): KnowledgeTopic[] {
  const normQuery = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tokens = normQuery.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return [];

  const scored: { topic: KnowledgeTopic; score: number }[] = [];

  for (const topic of IAU_BASIC_EDUCATION_DATABASE) {
    let score = 0;
    const titleNorm = topic.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const summaryNorm = topic.summary.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const explanationNorm = topic.explanation.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const kwNorm = topic.keywords.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const token of tokens) {
      if (kwNorm.includes(token)) score += 10;
      if (titleNorm.includes(token)) score += 8;
      if (summaryNorm.includes(token)) score += 4;
      if (explanationNorm.includes(token)) score += 2;
    }

    if (score >= 4) {
      scored.push({ topic, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.topic);
}
