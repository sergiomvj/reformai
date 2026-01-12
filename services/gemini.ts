
import { Task, OptimizationResult } from "../types";

export type OptimizationStrategy = 'fastest' | 'priority' | 'room';

export const optimizeRenovation = async (
  tasks: Task[],
  strategy: OptimizationStrategy = 'fastest'
): Promise<OptimizationResult> => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("API Key não configurada (VITE_OPENROUTER_API_KEY)");
  }

  const strategyDescriptions = {
    fastest: "Foco total em velocidade técnica e dependências lógicas (ex: secagem, infra antes de acabamento).",
    priority: "Priorize as tarefas marcadas como 'Alta' primeiro, respeitando apenas dependências críticas.",
    room: "Agrupe as tarefas para finalizar cômodos inteiros um de cada vez para liberar espaço na casa."
  };

  const systemPrompt = `
    Você é um Mestre de Obras e Engenheiro Civil de elite, especializado em gestão de cronogramas complexos (Lean Construction).
    Sua missão é gerar um plano de ação ultra-otimizado para uma reforma residencial.

    ESTRATÉGIAS DE OTIMIZAÇÃO:
    1. FASTEST (Execução em Lote/Linhagem): 
       - O objetivo é o menor tempo total.
       - Agrupe tarefas por CATEGORIA (ex: toda a hidráulica, depois toda a elétrica) para evitar deslocamento constante de equipes e ferramentas.
       - Respeite a cura de materiais (ex: reboco antes de pintura).
    2. PRIORITY (Foco Crítico):
       - Ataque primeiro as tarefas "Alta" prioridade, desde que seja logicamente possível.
       - Não comece um acabamento prioritário se a infraestrutura base (mesmo não prioritária) não estiver pronta.
    3. ROOM (Célula de Trabalho):
       - Foque em entregar cômodos PRONTOS um por um. 
       - Excelente para reformas com moradores no local. Finalize o Banheiro antes de começar a Cozinha, por exemplo.

    REGRAS TÉCNICAS INVIOLÁVEIS:
    - Ordem Lógica: Demolição -> Hidráulica/Elétrica Bruta -> Alvenaria/Gesso -> Revestimentos (Piso/Parede) -> Pintura -> Instalação de Louças/Metais -> Marcenaria -> Limpeza Fina.
    - Gere fases claras (ex: Fase 1: Preparação e Brutos, Fase 2: Acabamentos úmidos, etc).
    - Para cada tarefa, explique o 'reasoning' técnico (ex: "Instalando piso agora pois a massa corrida do teto já secou e não cairá sujeira").

    A saída DEVE ser APENAS um JSON seguindo este esquema:
    {
      "phases": [
        {
          "phaseName": "string",
          "order": number,
          "tasks": [
            {
              "id": "string",
              "title": "string",
              "room": "string",
              "priority": "string",
              "category": "string",
              "sequenceOrder": number,
              "reasoning": "string"
            }
          ],
          "tips": ["string"]
        }
      ],
      "totalEstimatedDays": number,
      "generalAdvice": "string"
    }
  `;

  const userPrompt = `
    ESTRATÉGIA: ${strategy.toUpperCase()}
    OBJETIVO: ${strategyDescriptions[strategy]}
    
    TAREFAS A ORGANIZAR:
    ${JSON.stringify(tasks.map(t => ({
    id: t.id,
    title: t.title,
    room: t.room,
    priority: t.priority,
    category: t.category || "Geral",
    subTasks: t.subTasks.map(st => st.title)
  })))}
    
    Gere o cronograma otimizado respeitando a técnica construtiva e a estratégia escolhida.
  `;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin, // Identifica a origem para o OpenRouter
        "X-Title": "ReformAI",
      },
      body: JSON.stringify({
        model: import.meta.env.VITE_OPENROUTER_MODEL || "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      console.error("OpenRouter Error:", errData);
      throw new Error(`Erro na API: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("Resposta vazia da IA");
    }

    const result = JSON.parse(content);
    return result as OptimizationResult;

  } catch (error) {
    console.error("Failed to optimize renovation:", error);
    throw new Error("Erro ao processar a otimização da obra via OpenRouter.");
  }
};
