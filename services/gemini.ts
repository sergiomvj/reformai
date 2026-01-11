
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
    Você é um Mestre de Obras e Engenheiro Civil experiente.
    Sua tarefa é organizar tarefas de reforma em um cronograma otimizado.
    
    Regras de Otimização:
    1. Organize em fases lógicas: Demolição, Infra, Alvenaria, Revestimento, Pintura, Finalização.
    2. Respeite estritamente a estratégia solicitada.
    3. Para cada tarefa, explique o 'reasoning' (por que ela está nessa ordem).
    
    Você DEVE retornar APENAS um JSON válido seguindo exatamente este esquema:
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
    Estratégia solicitada: ${strategy.toUpperCase()} - ${strategyDescriptions[strategy]}
    
    Tarefas fornecidas (incluindo prioridade e sub-tarefas):
    ${JSON.stringify(tasks.map(t => ({
    id: t.id,
    title: t.title,
    room: t.room,
    priority: t.priority,
    subTasks: t.subTasks.map(st => st.title)
  })))}
    
    Retorne o JSON otimizado.
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
