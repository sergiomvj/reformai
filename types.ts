
export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export type Priority = 'Alta' | 'Média' | 'Baixa';

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  address?: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  category_id?: string;
  user_id: string;
  title: string;
  description: string;
  room: string;
  priority: Priority;
  status: 'pending' | 'completed';
  category?: string;
  subTasks: SubTask[]; // Voltei para camelCase para manter compatibilidade com o código atual
  photos?: string[];
  video_url?: string;
  created_at?: string;
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

export interface HistoryEntry {
  id: string;
  user_id: string;
  project_id?: string;
  timestamp: number;
  user: string;
  action: string;
  details: string;
  type: 'creation' | 'update' | 'completion' | 'optimization' | 'deletion';
}
