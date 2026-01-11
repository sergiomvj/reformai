
import { GoogleGenAI, Type } from "@google/genai";
import { Task, OptimizationResult } from "../types";

export type OptimizationStrategy = 'fastest' | 'priority' | 'room';

export const optimizeRenovation = async (
  tasks: Task[], 
  strategy: OptimizationStrategy = 'fastest'
): Promise<OptimizationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const strategyDescriptions = {
    fastest: "Foco total em velocidade técnica e dependências lógicas (ex: secagem, infra antes de acabamento).",
    priority: "Priorize as tarefas marcadas como 'Alta' primeiro, respeitando apenas dependências críticas.",
    room: "Agrupe as tarefas para finalizar cômodos inteiros um de cada vez para liberar espaço na casa."
  };

  const prompt = `
    Você é um Mestre de Obras e Engenheiro Civil experiente.
    Recebi uma lista de tarefas para uma reforma.
    Estratégia solicitada: ${strategy.toUpperCase()} - ${strategyDescriptions[strategy]}
    
    Tarefas fornecidas (incluindo prioridade):
    ${JSON.stringify(tasks.map(t => ({ 
      id: t.id, 
      title: t.title, 
      room: t.room, 
      priority: t.priority,
      subTasks: t.subTasks.map(st => st.title)
    })))}
    
    Regras de Otimização:
    1. Organize em fases: Demolição, Infra, Alvenaria, Revestimento, Pintura, Finalização.
    2. Respeite a estratégia ${strategy}.
    3. Para cada tarefa, explique o 'reasoning' (por que ela está nessa ordem).
    
    Responda EXCLUSIVAMENTE em formato JSON.
  `;

  // Using gemini-3-pro-preview for complex reasoning task (construction sequence planning)
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          phases: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                phaseName: { type: Type.STRING },
                order: { type: Type.NUMBER },
                tasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      room: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      category: { type: Type.STRING },
                      sequenceOrder: { type: Type.NUMBER },
                      reasoning: { type: Type.STRING }
                    },
                    required: ["id", "title", "room", "category", "sequenceOrder"]
                  }
                },
                tips: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["phaseName", "order", "tasks", "tips"]
            }
          },
          totalEstimatedDays: { type: Type.NUMBER },
          generalAdvice: { type: Type.STRING }
        },
        required: ["phases", "totalEstimatedDays", "generalAdvice"]
      }
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return result as OptimizationResult;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Erro ao processar a otimização da obra.");
  }
};
