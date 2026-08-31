/**
 * IAU Memory Manager - Gerenciador de Memória Estruturada e Aprendizado
 * Armazena fatos, preferências, regras ensinadas pelo usuário e sincroniza com Firebase/LocalStorage.
 */

import { DiaryRecord, MemoryItem } from '../../types';

export interface IAURule {
  id: string;
  trigger: string;
  meaning: string;
  createdAt: string;
}

export interface IAUFact {
  id: string;
  subject: string;
  fact: string;
  createdAt: string;
}

const STORAGE_RULES_KEY = 'iau_learned_rules_v1';
const STORAGE_FACTS_KEY = 'iau_learned_facts_v1';

export class IAUMemoryManager {
  private rules: IAURule[] = [];
  private facts: IAUFact[] = [];
  private userId: string;

  constructor(userId: string = 'local_user') {
    this.userId = userId;
    this.loadFromStorage();
  }

  public setUserId(userId: string) {
    this.userId = userId;
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const rawRules = localStorage.getItem(`${STORAGE_RULES_KEY}_${this.userId}`);
      if (rawRules) {
        this.rules = JSON.parse(rawRules);
      }
      const rawFacts = localStorage.getItem(`${STORAGE_FACTS_KEY}_${this.userId}`);
      if (rawFacts) {
        this.facts = JSON.parse(rawFacts);
      }
    } catch (e) {
      console.warn('Erro ao carregar memórias locais da IAU:', e);
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(`${STORAGE_RULES_KEY}_${this.userId}`, JSON.stringify(this.rules));
      localStorage.setItem(`${STORAGE_FACTS_KEY}_${this.userId}`, JSON.stringify(this.facts));
    } catch (e) {
      console.warn('Erro ao persistir memórias locais da IAU:', e);
    }
  }

  /**
   * Ensina uma nova regra à IAU (ex: "quando eu falar X significa Y")
   */
  public learnRule(trigger: string, meaning: string): IAURule {
    const cleanTrigger = trigger.trim().toLowerCase();
    const cleanMeaning = meaning.trim();

    // Substituir se já existir trigger idêntico
    const existingIndex = this.rules.findIndex(
      (r) => r.trigger.toLowerCase() === cleanTrigger
    );

    const newRule: IAURule = {
      id: `rule_${Date.now()}`,
      trigger: cleanTrigger,
      meaning: cleanMeaning,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.rules[existingIndex] = newRule;
    } else {
      this.rules.unshift(newRule);
    }

    this.saveToStorage();
    return newRule;
  }

  /**
   * Ensina um fato pessoal (ex: "meu projeto se chama Diário Pessoal")
   */
  public learnFact(subject: string, fact: string): IAUFact {
    const cleanSubject = subject.trim();
    const cleanFact = fact.trim();

    const existingIndex = this.facts.findIndex(
      (f) => f.subject.toLowerCase() === cleanSubject.toLowerCase()
    );

    const newFact: IAUFact = {
      id: `fact_${Date.now()}`,
      subject: cleanSubject,
      fact: cleanFact,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.facts[existingIndex] = newFact;
    } else {
      this.facts.unshift(newFact);
    }

    this.saveToStorage();
    return newFact;
  }

  /**
   * Retorna todas as regras aprendidas
   */
  public getRules(): IAURule[] {
    return [...this.rules];
  }

  /**
   * Retorna todos os fatos aprendidos
   */
  public getFacts(): IAUFact[] {
    return [...this.facts];
  }

  /**
   * Busca fatos ou regras correspondentes a uma consulta
   */
  public recall(query: string): { rules: IAURule[]; facts: IAUFact[] } {
    const norm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokens = norm.split(/\s+/).filter((t) => t.length > 2);

    const matchedRules = this.rules.filter((r) => {
      const trigNorm = r.trigger.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const meanNorm = r.meaning.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return (
        norm.includes(trigNorm) ||
        tokens.some((t) => trigNorm.includes(t) || meanNorm.includes(t))
      );
    });

    const matchedFacts = this.facts.filter((f) => {
      const subNorm = f.subject.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const factNorm = f.fact.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return (
        norm.includes(subNorm) ||
        tokens.some((t) => subNorm.includes(t) || factNorm.includes(t))
      );
    });

    return { rules: matchedRules, facts: matchedFacts };
  }

  /**
   * Busca registros relevantes no acervo do diário
   */
  public searchRecords(records: DiaryRecord[], query: string, limit: number = 5): DiaryRecord[] {
    if (!records || records.length === 0) return [];
    const active = records.filter((r) => !r.isDeleted);
    const norm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokens = norm.split(/\s+/).filter((t) => t.length > 2);

    if (tokens.length === 0) return [];

    const scored = active.map((rec) => {
      let score = 0;
      const title = (rec.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const content = (rec.content || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const tags = (rec.tags || []).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      for (const t of tokens) {
        if (title.includes(t)) score += 10;
        if (tags.includes(t)) score += 8;
        if (content.includes(t)) score += 4;
      }

      return { record: rec, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.record);
  }

  /**
   * Busca memórias estruturadas do usuário
   */
  public searchMemories(memories: MemoryItem[], query: string, limit: number = 4): MemoryItem[] {
    if (!memories || memories.length === 0) return [];
    const norm = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokens = norm.split(/\s+/).filter((t) => t.length > 2);

    if (tokens.length === 0) return [];

    const scored = memories.map((mem) => {
      let score = 0;
      const title = (mem.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const summary = (mem.summary || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      for (const t of tokens) {
        if (title.includes(t)) score += 10;
        if (summary.includes(t)) score += 6;
      }

      return { memory: mem, score: score * (mem.confidence || 1) };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.memory);
  }
}
