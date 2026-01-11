
export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export type Priority = 'Alta' | 'Média' | 'Baixa';

export interface Task {
  id: string;
  title: string;
  description: string;
  room: string;
  priority: Priority;
  status: 'pending' | 'completed';
  subTasks: SubTask[];
  photos?: string[];
  videoUrl?: string;
}

export interface OptimizedTask extends Task {
  category: string;
  sequenceOrder: number;
  reasoning?: string;
}

export interface ConstructionPhase {
  phaseName: string;
  order: number;
  tasks: OptimizedTask[];
  tips: string[];
}

export interface OptimizationResult {
  phases: ConstructionPhase[];
  totalEstimatedDays: number;
  generalAdvice: string;
}
