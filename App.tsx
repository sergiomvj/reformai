
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Task, OptimizationResult, Priority, SubTask, HistoryEntry } from './types';
import { optimizeRenovation, OptimizationStrategy } from './services/gemini';
import { HardHat, Plus, Hammer, Trash, CheckCircle, Sparkles, Download, FileSpreadsheet, Edit3, X, TrendingUp, Video, Camera, LogIn, LogOut, History } from './components/Icons';

// --- Utilitários de Banco de Dados (IndexedDB) ---
const DB_NAME = 'MestreObraDB_VFinal';
const TASKS_STORE = 'tasks_store';
const HISTORY_STORE = 'history_store';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 5); // Bumped version for new store
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveTasksToDB = async (tasks: Task[]) => {
  const db = await initDB();
  const tx = db.transaction(TASKS_STORE, 'readwrite');
  const store = tx.objectStore(TASKS_STORE);
  store.clear();
  tasks.forEach(task => store.put(task));
  return new Promise((resolve) => tx.oncomplete = resolve);
};

const saveHistoryToDB = async (history: HistoryEntry[]) => {
  const db = await initDB();
  const tx = db.transaction(HISTORY_STORE, 'readwrite');
  const store = tx.objectStore(HISTORY_STORE);
  store.clear();
  history.forEach(entry => store.put(entry));
  return new Promise((resolve) => tx.oncomplete = resolve);
};

const loadTasksFromDB = async (): Promise<Task[]> => {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction(TASKS_STORE, 'readonly');
    const store = tx.objectStore(TASKS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
};

const loadHistoryFromDB = async (): Promise<HistoryEntry[]> => {
  const db = await initDB();
  return new Promise((resolve) => {
    const tx = db.transaction(HISTORY_STORE, 'readonly');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });
};

// --- Inteligência de Obra: Modelos de Desmembramento (Sub-tarefas) ---
const SUBTASK_TEMPLATES: Record<string, string[]> = {
  // Pintura
  'Pintura de paredes': ['Forração', 'Lixamento', 'Selador', '1ª Demão', '2ª Demão', 'Retoque'],
  'Pintura de teto': ['Preparação', 'Fundo Preparador', 'Pintura', 'Limpeza de luminárias'],
  'Aplicação de massa corrida': ['Limpeza superfície', '1ª demão massa', 'Lixamento', '2ª demão massa', 'Lixamento fino'],
  // Elétrica
  'Trocar fiação completa': ['Mapeamento', 'Passagem de guias', 'Troca de cabos', 'Conexão disjuntores', 'Testes'],
  'Instalar novos pontos de tomada': ['Corte alvenaria', 'Conduítes', 'Chumbamento caixas', 'Fiação', 'Espelhos'],
  'Trocar luminárias/LEDs': ['Remoção antigas', 'Furação/Suporte', 'Conexão elétrica', 'Fixação'],
  // Hidráulica
  'Trocar encanamento': ['Demolição rastro', 'Instalação tubos', 'Testes de estanqueidade', 'Chumbamento'],
  'Reparo em infiltração': ['Identificação origem', 'Abertura local', 'Impermeabilização', 'Fechamento'],
  'Instalar bacia sanitária': ['Limpeza base', 'Anel de vedação', 'Fixação parafusos', 'Vedação silicone', 'Teste descarga'],
  // Piso
  'Colocação de porcelanato': ['Nivelamento', 'Argamassa', 'Assentamento', 'Uso de niveladores', 'Rejunte'],
  'Instalar piso laminado': ['Manta acústica', 'Encaixe réguas', 'Rodapés', 'Perfis de porta'],
  // Marcenaria/Móveis
  'Instalar móveis planejados': ['Conferência nível', 'Montagem módulos', 'Ajuste portas', 'Puxadores', 'Limpeza'],
  'Montagem de guarda-roupa': ['Base', 'Estrutura lateral', 'Prateleiras', 'Portas/Gavetas'],
  // Estrutural/Geral
  'Demolir alvenaria': ['Proteção área', 'Escoramento (se necessário)', 'Quebra', 'Ensacamento entulho', 'Remoção'],
  'Limpeza pós-obra': ['Remoção entulho fino', 'Limpeza vidros', 'Aspiração pó', 'Brilho revestimentos']
};

const ROOM_SUGGESTIONS = {
  Internos: ['Sala', 'Cozinha', 'Banheiro Social', 'Suíte', 'Quarto 1', 'Quarto 2', 'Closet', 'Corredor', 'Área de Serviço', 'Escritório'],
  Externos: ['Varanda', 'Garagem', 'Jardim', 'Fachada', 'Quintal', 'Telhado', 'Churrasqueira', 'Muro']
};

const TASK_SUGGESTIONS = [
  { category: 'PINTURA', tasks: ['Pintura de paredes', 'Pintura de teto', 'Envernizar portas/janelas', 'Aplicação de massa corrida'] },
  { category: 'ELÉTRICA', tasks: ['Trocar fiação completa', 'Instalar novos pontos de tomada', 'Instalação de chuveiro', 'Trocar luminárias/LEDs'] },
  { category: 'HIDRÁULICA', tasks: ['Trocar encanamento', 'Instalar novas torneiras', 'Reparo em infiltração', 'Instalar bacia sanitária'] },
  { category: 'PISO', tasks: ['Colocação de porcelanato', 'Instalar piso laminado', 'Restauração de taco', 'Nivelamento de contra-piso'] },
  { category: 'JARDINAGEM', tasks: ['Plantio de grama', 'Instalação de irrigação', 'Criação de canteiros', 'Instalação de deck'] },
  { category: 'MARCENARIA', tasks: ['Instalar móveis planejados', 'Montagem de guarda-roupa', 'Instalar prateleiras'] },
  { category: 'ESTRUTURAL', tasks: ['Demolir alvenaria', 'Levantar parede', 'Limpeza pós-obra', 'Troca de esquadrias'] }
];

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingDB, setLoadingDB] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [lang, setLang] = useState('pt-br');
  const [newTask, setNewTask] = useState<{title: string, room: string, description: string, priority: Priority}>({ 
    title: '', room: '', description: '', priority: 'Média' 
  });
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [photoFiles, setPhotoFiles] = useState<string[]>([]);
  const [videoData, setVideoData] = useState<string | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [manualSubTask, setManualSubTask] = useState('');

  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([loadTasksFromDB(), loadHistoryFromDB()]).then(([savedTasks, savedHistory]) => {
      setTasks(savedTasks);
      setHistory(savedHistory.sort((a, b) => b.timestamp - a.timestamp));
      setLoadingDB(false);
    });
  }, []);

  useEffect(() => {
    if (!loadingDB) {
      saveTasksToDB(tasks);
      saveHistoryToDB(history);
    }
  }, [tasks, history, loadingDB]);

  const currentUser = isLoggedIn ? "Mestre" : "Visitante";

  const addHistoryEntry = (type: HistoryEntry['type'], action: string, details: string) => {
    const entry: HistoryEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      user: currentUser,
      type,
      action,
      details
    };
    setHistory(prev => [entry, ...prev].slice(0, 100)); // Keep last 100 entries
  };

  // --- Consolidação e Cálculo de Progresso ---
  const calculateTaskProgress = (task: Task) => {
    if (task.status === 'completed') return 100;
    if (!task.subTasks || task.subTasks.length === 0) return 0;
    const completed = task.subTasks.filter(st => st.completed).length;
    return Math.round((completed / task.subTasks.length) * 100);
  };

  const stats = useMemo(() => {
    const totalCount = tasks.length;
    if (totalCount === 0) return { totalProgress: 0, byRoom: {}, byPriority: { Alta: 0, Média: 0, Baixa: 0 } };

    const totalProgressSum = tasks.reduce((acc, t) => acc + calculateTaskProgress(t), 0);
    const totalProgress = Math.round(totalProgressSum / totalCount);

    const byRoom: Record<string, { total: number, progress: number }> = {};
    const byPriority: Record<string, { total: number, progress: number }> = {
      Alta: { total: 0, progress: 0 },
      Média: { total: 0, progress: 0 },
      Baixa: { total: 0, progress: 0 }
    };

    tasks.forEach(t => {
      const p = calculateTaskProgress(t);
      
      if (!byRoom[t.room]) byRoom[t.room] = { total: 0, progress: 0 };
      byRoom[t.room].total++;
      byRoom[t.room].progress += p;

      byPriority[t.priority].total++;
      byPriority[t.priority].progress += p;
    });

    Object.keys(byRoom).forEach(r => byRoom[r].progress = Math.round(byRoom[r].progress / byRoom[r].total));
    Object.keys(byPriority).forEach(p => {
      if (byPriority[p].total > 0) byPriority[p].progress = Math.round(byPriority[p].progress / byPriority[p].total);
    });

    return { totalProgress, byRoom, byPriority };
  }, [tasks]);

  const addTask = () => {
    if (!newTask.title || !newTask.room) return;
    
    const autoSubTasks = (SUBTASK_TEMPLATES[newTask.title] || []).map(title => ({
      id: Math.random().toString(36).substr(2, 9),
      title,
      completed: false
    }));

    const task: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTask.title,
      room: newTask.room,
      description: newTask.description,
      priority: newTask.priority,
      status: 'pending',
      subTasks: autoSubTasks,
      photos: photoFiles.length > 0 ? [...photoFiles] : undefined,
      videoUrl: videoData || undefined
    };

    setTasks(prev => [...prev, task]);
    addHistoryEntry('creation', 'Nova tarefa adicionada', `${task.title} em ${task.room}`);
    
    setNewTask({ title: '', room: newTask.room, description: '', priority: 'Média' }); 
    setPhotoFiles([]);
    setVideoData(null);
    setSelectedCat(null);
  };

  const toggleSubTask = (taskId: string, subTaskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const subTask = t.subTasks.find(st => st.id === subTaskId);
        const newState = !subTask?.completed;
        const newSubTasks = t.subTasks.map(st => st.id === subTaskId ? { ...st, completed: newState } : st);
        const allDone = newSubTasks.length > 0 && newSubTasks.every(st => st.completed);
        
        addHistoryEntry(
          newState ? 'completion' : 'update', 
          newState ? 'Sub-etapa concluída' : 'Sub-etapa reaberta', 
          `${subTask?.title} - ${t.title} (${t.room})`
        );

        if (allDone && t.status !== 'completed') {
          addHistoryEntry('completion', 'Tarefa finalizada', `${t.title} em ${t.room}`);
        }

        return { ...t, subTasks: newSubTasks, status: allDone ? 'completed' : 'pending' };
      }
      return t;
    }));
  };

  const deleteTask = (taskId: string) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (taskToDelete && confirm(`Remover registro: ${taskToDelete.title}?`)) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
      addHistoryEntry('deletion', 'Tarefa removida', `${taskToDelete.title} em ${taskToDelete.room}`);
    }
  };

  const addManualSubTask = (taskId: string) => {
    if (!manualSubTask) return;
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        addHistoryEntry('update', 'Etapa manual adicionada', `${manualSubTask} para ${t.title}`);
        return {
          ...t,
          subTasks: [...t.subTasks, { id: Math.random().toString(36).substr(2, 9), title: manualSubTask, completed: false }]
        };
      }
      return t;
    }));
    setManualSubTask('');
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessingVideo(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setVideoData(ev.target?.result as string);
        setIsProcessingVideo(false);
      };
      reader.readAsDataURL(file as Blob);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setPhotoFiles(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const target = ev.target as FileReader;
          const importedTasks = JSON.parse(target.result as string);
          if (Array.isArray(importedTasks)) {
            if (confirm(`Deseja importar ${importedTasks.length} tarefas? Isso substituirá sua lista atual.`)) {
              setTasks(importedTasks);
              addHistoryEntry('update', 'Importação de Backup', `${importedTasks.length} tarefas restauradas.`);
            }
          } else {
            alert('Arquivo inválido: Formato de backup não reconhecido.');
          }
        } catch (err) {
          alert('Erro ao ler o arquivo de backup.');
        }
      };
      reader.readAsText(file as Blob);
    }
    if (e.target) e.target.value = '';
  };

  const handleOptimize = async (strategy: OptimizationStrategy) => {
    if (tasks.length === 0) return;
    setOptimizing(true);
    try {
      const optimized = await optimizeRenovation(tasks, strategy);
      setResult(optimized);
      addHistoryEntry('optimization', 'Otimização AI Executada', `Estratégia: ${strategy}`);
    } catch (err) {
      alert("Erro ao otimizar cronograma.");
    } finally {
      setOptimizing(false);
    }
  };

  const toggleLogin = () => {
    if (isLoggedIn) {
      if (confirm('Deseja realmente sair da conta?')) {
        setIsLoggedIn(false);
        addHistoryEntry('update', 'Logout', 'Usuário mestre desconectado.');
      }
    } else {
      setIsLoggedIn(true);
      addHistoryEntry('update', 'Login', 'Usuário mestre conectado.');
      alert('Login realizado com sucesso!');
    }
  };

  if (loadingDB) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <div className="sticky top-0 z-50 shadow-lg">
        {/* Cabeçalho Principal */}
        <header className="bg-slate-900 text-white py-6 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-amber-500 p-2 rounded-xl text-slate-900 shadow-xl"><HardHat className="w-6 h-6" /></div>
              <div>
                <h1 className="text-xl font-heading uppercase tracking-widest leading-none">
                  REFORM<span className="text-amber-500">AI</span>
                </h1>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="h-1.5 w-24 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${stats.totalProgress}%` }}></div>
                  </div>
                  <span className="text-[10px] font-black">{stats.totalProgress}%</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowDashboard(!showDashboard)} 
                title="Alternar Dashboard"
                className={`p-2.5 rounded-xl transition-all ${showDashboard ? 'bg-amber-500 text-slate-900 shadow-lg' : 'bg-slate-800 text-slate-400'}`}
              >
                <TrendingUp className="w-5 h-5" />
              </button>
              
              <input type="file" accept=".json" ref={importInputRef} onChange={handleImport} className="hidden" />
              <button 
                onClick={() => importInputRef.current?.click()} 
                title="Importar Obra (JSON)"
                className="p-2.5 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-amber-500" />
              </button>

              <button 
                onClick={() => {
                  const dataStr = JSON.stringify(tasks, null, 2);
                  const blob = new window.Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(blob as Blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `backup_obra_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
                  link.click();
                }} 
                title="Exportar Obra (JSON)"
                className="p-2.5 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <Download className="w-5 h-5 text-amber-500" />
              </button>
            </div>
          </div>
        </header>

        {/* Barra de Utilitários Inferior */}
        <div className="bg-sky-100 border-b border-sky-200 py-2 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            {/* Seletor de Idiomas */}
            <div className="flex gap-3">
              {['en', 'sp', 'pt-br'].map(l => (
                <button 
                  key={l} 
                  onClick={() => setLang(l)}
                  className={`text-[10px] font-black uppercase transition-colors ${lang === l ? 'text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Botão Entrar / Sign up */}
            <button 
              onClick={toggleLogin} 
              className="flex items-center gap-2 bg-white/80 hover:bg-white px-3 py-1 rounded-full border border-sky-200 shadow-sm transition-all"
            >
              {isLoggedIn ? (
                <>
                  <LogOut className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[10px] font-black text-slate-700 uppercase">Sair</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-[10px] font-black text-slate-700 uppercase">Entrar / Cadastrar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 mt-8 space-y-10">
        
        {/* --- Consolidação de Tarefas (Dashboard) --- */}
        {showDashboard && (
          <section className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-2xl border-b-[10px] border-amber-500 animate-in zoom-in duration-300">
             <div className="flex justify-between items-start mb-8">
                <div>
                   <h2 className="text-amber-500 font-black uppercase tracking-[0.2em] text-[10px] mb-1">Status da Consolidação</h2>
                   <p className="text-3xl font-black uppercase">Painel REFORM<span className="text-amber-500">AI</span></p>
                </div>
                <div className="flex items-center gap-4">
                   <button 
                     onClick={() => setShowHistory(!showHistory)}
                     className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-[10px] font-black uppercase ${showHistory ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-amber-500 hover:bg-slate-700'}`}
                   >
                     <History className="w-4 h-4" /> Log de Obra
                   </button>
                   <div className="text-right">
                      <p className="text-5xl font-black text-amber-500">{stats.totalProgress}%</p>
                      <p className="text-[9px] text-slate-500 uppercase font-black">Execução Total</p>
                   </div>
                </div>
             </div>

             {showHistory ? (
                <div className="animate-in slide-in-from-top-4 duration-300">
                  <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">Histórico de Atividades Recentes</h3>
                  <div className="max-h-80 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                    {history.length > 0 ? history.map(entry => (
                      <div key={entry.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-start gap-4 hover:bg-white/10 transition-all">
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                          entry.type === 'completion' ? 'bg-green-500' : 
                          entry.type === 'creation' ? 'bg-blue-500' : 
                          entry.type === 'optimization' ? 'bg-amber-500' :
                          entry.type === 'deletion' ? 'bg-red-500' : 'bg-slate-400'
                        }`}></div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-black uppercase text-amber-500">{entry.action}</span>
                            <span className="text-[8px] font-bold text-slate-500 uppercase">{new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 font-medium">{entry.details}</p>
                          <div className="mt-2 text-[8px] font-black uppercase text-slate-600 flex items-center gap-1.5">
                            <LogIn className="w-2.5 h-2.5" /> Responsável: {entry.user}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-[10px] text-slate-600 italic py-4">Nenhuma atividade registrada ainda.</p>
                    )}
                  </div>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                   <div className="space-y-6">
                      <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-2">Progresso por Prioridade</h3>
                      {Object.entries(stats.byPriority).map(([p, data]) => (
                         <div key={p} className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-black uppercase">
                               <span className={p === 'Alta' ? 'text-red-400' : p === 'Média' ? 'text-amber-400' : 'text-blue-400'}>{p}</span>
                               <span>{(data as any).progress}%</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                               <div className={`h-full transition-all duration-1000 ${p === 'Alta' ? 'bg-red-500' : p === 'Média' ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(data as any).progress}%` }}></div>
                            </div>
                         </div>
                      ))}
                   </div>

                   <div className="space-y-6">
                      <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-2">Progresso por Cômodo</h3>
                      <div className="max-h-56 overflow-y-auto pr-3 space-y-4 custom-scrollbar">
                         {Object.entries(stats.byRoom).map(([room, data]) => (
                            <div key={room} className="space-y-1">
                               <div className="flex justify-between text-[10px] font-black uppercase">
                                  <span className="text-slate-300 truncate w-32">{room}</span>
                                  <span className="text-amber-500">{(data as any).progress}%</span>
                               </div>
                               <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-500" style={{ width: `${(data as any).progress}%` }}></div>
                               </div>
                            </div>
                         ))}
                         {Object.keys(stats.byRoom).length === 0 && <p className="text-[10px] text-slate-600 italic">Nenhum cômodo ativo.</p>}
                      </div>
                   </div>
                </div>
             )}
          </section>
        )}

        {/* --- Formulário Especialista --- */}
        {!result && (
          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200 space-y-8">
            <div className="flex justify-between items-center">
               <div className="space-y-1">
                  <h2 className="text-xl font-black text-slate-800 uppercase">Novo Registro Técnico</h2>
                  <p className="text-slate-500 text-xs">Selecione a categoria para receber o desmembramento automático.</p>
               </div>
               <button 
                  onClick={() => { 
                    if(confirm('Zerar toda a obra?')) {
                      setTasks([]);
                      addHistoryEntry('deletion', 'Projeto Zerado', 'Todas as tarefas foram apagadas pelo usuário.');
                    }
                  }} 
                  className="p-3 text-slate-200 hover:text-red-500 transition-colors"
                ><Trash className="w-5 h-5"/></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Localização (Cômodo)</label>
                <input 
                  type="text" value={newTask.room} list="rooms-list"
                  onChange={e => setNewTask({...newTask, room: e.target.value})}
                  placeholder="Ex: Cozinha, Suíte..."
                  className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none transition-all font-bold text-slate-800 shadow-inner"
                />
                <datalist id="rooms-list">{Object.values(ROOM_SUGGESTIONS).flat().map(r => <option key={r} value={r}/>)}</datalist>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prioridade Crítica</label>
                <div className="flex gap-2">
                  {(['Alta', 'Média', 'Baixa'] as Priority[]).map(p => (
                    <button 
                      key={p} onClick={() => setNewTask({...newTask, priority: p})}
                      className={`flex-1 py-4 rounded-2xl text-[10px] font-black border-2 transition-all ${newTask.priority === p ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-slate-50 text-slate-400 border-slate-50 hover:border-slate-200'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categorias de Obra</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TASK_SUGGESTIONS.map(cat => (
                  <button 
                    key={cat.category} onClick={() => setSelectedCat(cat.category)}
                    className={`py-3.5 rounded-2xl text-[10px] font-black border-2 transition-all ${selectedCat === cat.category ? 'bg-amber-500 border-amber-600 text-slate-900 shadow-lg shadow-amber-500/20' : 'bg-slate-50 border-slate-50 text-slate-400 hover:bg-slate-100'}`}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>
            </div>

            {selectedCat && (
              <div className="space-y-5 p-6 bg-amber-50 rounded-[2rem] border-2 border-amber-100 animate-in slide-in-from-top-4 duration-300">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Tarefas Especializadas</p>
                <div className="flex flex-wrap gap-2">
                  {TASK_SUGGESTIONS.find(c => c.category === selectedCat)?.tasks.map(t => (
                    <button 
                      key={t} onClick={() => setNewTask({...newTask, title: t})}
                      className={`px-5 py-2.5 rounded-full text-[10px] font-bold border-2 transition-all ${newTask.title === t ? 'bg-amber-500 border-amber-600 shadow-md' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input 
                  type="text" value={newTask.title}
                  onChange={e => setNewTask({...newTask, title: e.target.value})}
                  placeholder="Ou descreva a tarefa personalizada..."
                  className="w-full px-5 py-4 rounded-xl border-2 border-amber-200 outline-none focus:border-amber-500 font-bold text-sm bg-white"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mídias de Referência</label>
                 <div className="grid grid-cols-2 gap-3">
                    <input type="file" accept="video/*" capture="environment" ref={videoInputRef} className="hidden" onChange={handleVideoUpload} />
                    <button 
                       type="button" disabled={isProcessingVideo} onClick={() => videoInputRef.current?.click()}
                       className={`py-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-2 transition-all ${videoData ? 'border-green-400 bg-green-50 text-green-600' : 'border-slate-200 text-slate-400 hover:border-amber-400'}`}
                    >
                       {isProcessingVideo ? <div className="animate-spin h-5 w-5 border-2 border-amber-500 rounded-full border-t-transparent"></div> : <Video className="w-6 h-6" />}
                       <span className="text-[10px] font-black uppercase">Vídeo</span>
                    </button>

                    <input type="file" accept="image/*" multiple capture="environment" ref={photoInputRef} className="hidden" onChange={handlePhotoUpload} />
                    <button 
                       type="button" onClick={() => photoInputRef.current?.click()}
                       className={`py-6 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-2 transition-all ${photoFiles.length > 0 ? 'border-green-400 bg-green-50 text-green-600' : 'border-slate-200 text-slate-400 hover:border-amber-400'}`}
                    >
                       <Camera className="w-6 h-6" />
                       <span className="text-[10px] font-black uppercase">{photoFiles.length > 0 ? `${photoFiles.length} Fotos` : 'Fotos'}</span>
                    </button>
                 </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anotações do Mestre</label>
                <textarea 
                  value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})}
                  placeholder="Instruções específicas sobre o local ou técnica..."
                  className="w-full px-6 py-4 rounded-[2rem] border-2 border-slate-100 outline-none text-sm h-[130px] shadow-inner resize-none font-medium"
                />
              </div>
            </div>

            <button 
              onClick={addTask} disabled={isProcessingVideo}
              className="w-full bg-slate-900 text-white font-black py-6 rounded-[2rem] flex items-center justify-center gap-4 hover:bg-slate-800 transition-all active:scale-[0.98] shadow-2xl uppercase tracking-[0.2em] text-sm"
            >
              <Plus className="w-6 h-6" /> Incorporar Tarefa à Obra
            </button>
          </section>
        )}

        {/* --- Lista de Campo e Execução --- */}
        {tasks.length > 0 && !result && (
          <section className="space-y-8">
            <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 border-l-8 border-amber-500">
              <div>
                <h3 className="text-[10px] font-black uppercase text-amber-500 mb-2 tracking-widest">Engenharia de Cronograma</h3>
                <p className="text-xl font-heading uppercase">Escolha o seu Plano de Ação</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => handleOptimize('fastest')} className="bg-white/10 hover:bg-amber-500 hover:text-slate-900 px-5 py-3 rounded-2xl text-[9px] font-black uppercase transition-all flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Execução Rápida
                </button>
                <button onClick={() => handleOptimize('priority')} className="bg-white/10 hover:bg-amber-500 hover:text-slate-900 px-5 py-3 rounded-2xl text-[9px] font-black uppercase transition-all flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Por Prioridade
                </button>
                <button onClick={() => handleOptimize('room')} className="bg-white/10 hover:bg-amber-500 hover:text-slate-900 px-5 py-3 rounded-2xl text-[9px] font-black uppercase transition-all flex items-center gap-2">
                  <HardHat className="w-4 h-4" /> Por Cômodo
                </button>
              </div>
            </div>

            <div className="grid gap-8">
              {tasks.map(task => {
                const progress = calculateTaskProgress(task);
                return (
                  <div key={task.id} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="p-8">
                      <div className="flex justify-between items-start mb-6">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-black px-2.5 py-1 rounded-full uppercase ${task.priority === 'Alta' ? 'bg-red-100 text-red-600' : task.priority === 'Média' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                              {task.priority}
                            </span>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{task.room}</span>
                          </div>
                          <h4 className="text-2xl font-black text-slate-800 tracking-tight">{task.title}</h4>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-black text-amber-500 leading-none">{progress}%</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Concluído</p>
                        </div>
                      </div>

                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-8">
                        <div className="h-full bg-amber-500 transition-all duration-700 shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${progress}%` }}></div>
                      </div>

                      {/* Checklist Técnico (Desmembramento) */}
                      <div className="bg-slate-50 p-6 rounded-[2rem] space-y-4">
                         <div className="flex justify-between items-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Desmembramento da Atividade</p>
                            <span className="text-[9px] font-bold text-slate-300">FASE EXECUTIVA</span>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {task.subTasks.map(st => (
                               <button 
                                  key={st.id} onClick={() => toggleSubTask(task.id, st.id)}
                                  className={`flex items-center gap-4 p-4 rounded-2xl text-[10px] font-bold text-left transition-all ${st.completed ? 'bg-green-100 text-green-700' : 'bg-white border border-slate-200 text-slate-600 shadow-sm hover:border-amber-300'}`}
                               >
                                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${st.completed ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}>
                                     {st.completed && <CheckCircle className="w-4 h-4 text-white" />}
                                  </div>
                                  {st.title}
                               </button>
                            ))}
                         </div>
                         <div className="flex gap-2 pt-2">
                           <input 
                              type="text" value={manualSubTask} onChange={e => setManualSubTask(e.target.value)}
                              placeholder="Adicionar etapa personalizada..."
                              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-[10px] font-bold outline-none focus:border-amber-500"
                           />
                           <button onClick={() => addManualSubTask(task.id)} className="bg-slate-900 text-white p-2.5 rounded-xl"><Plus className="w-5 h-5"/></button>
                         </div>
                      </div>

                      {/* Galeria de Obra */}
                      {(task.photos || task.videoUrl) && (
                         <div className="mt-8 flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                            {task.videoUrl && (
                               <div className="relative flex-shrink-0 w-24 h-24 bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-100 group">
                                  <video src={task.videoUrl} className="w-full h-full object-cover opacity-50" />
                                  <div className="absolute inset-0 flex items-center justify-center text-amber-500"><Video className="w-8 h-8" /></div>
                                  <div className="absolute bottom-1 left-0 right-0 text-[6px] text-center font-black uppercase text-white/50">VÍDEO REG.</div>
                               </div>
                            )}
                            {task.photos?.map((p, i) => (
                               <img key={i} src={p} className="w-24 h-24 flex-shrink-0 rounded-2xl object-cover border-2 border-slate-100 shadow-sm" alt="Ponto de obra" />
                            ))}
                         </div>
                      )}
                      
                      <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end">
                         <button onClick={() => deleteTask(task.id)} className="text-[9px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest flex items-center gap-2">
                            <Trash className="w-3.5 h-3.5" /> Excluir Registro
                         </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* --- Resultado da IA --- */}
        {optimizing && (
          <div className="py-32 text-center animate-pulse">
            <div className="animate-spin h-16 w-16 border-t-4 border-amber-500 rounded-full mx-auto mb-6"></div>
            <p className="font-black uppercase text-slate-900 tracking-[0.3em] text-xs">REFORM<span className="text-amber-500">AI</span> Estruturando Sequência...</p>
          </div>
        )}

        {result && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 duration-700">
             <div className="bg-slate-900 text-white p-12 rounded-[4rem] border-b-[15px] border-amber-500 shadow-2xl relative overflow-hidden">
                <div className="absolute top-[-40px] right-[-40px] opacity-10 rotate-12 scale-150"><Hammer className="w-64 h-64 text-amber-500" /></div>
                <div className="flex justify-between items-start mb-10">
                   <h2 className="text-4xl font-heading uppercase tracking-widest flex items-center gap-5"><Sparkles className="text-amber-500 w-10 h-10" /> PLANO MESTRE</h2>
                   <button onClick={() => setResult(null)} className="p-4 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X /></button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Janela de Execução</p>
                      <p className="text-6xl font-black text-amber-500">{result.totalEstimatedDays} DIAS</p>
                   </div>
                   <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                      <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3">Diretriz REFORM<span className="text-amber-500">AI</span>:</p>
                      <p className="text-sm text-slate-300 italic leading-relaxed font-medium">"{result.generalAdvice}"</p>
                   </div>
                </div>
             </div>

             <div className="space-y-16">
                {result.phases.map(phase => (
                   <div key={phase.order} className="bg-white rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-900 text-white px-10 py-8 flex justify-between items-center border-b-4 border-amber-500">
                         <h3 className="text-2xl font-heading uppercase tracking-widest">{phase.phaseName}</h3>
                         <div className="bg-amber-500 text-slate-900 px-6 py-2 rounded-full text-[12px] font-black uppercase tracking-widest shadow-2xl">ETAPA {phase.order}</div>
                      </div>
                      <div className="p-10 space-y-10">
                         {phase.tasks.map(t => (
                            <div key={t.id} className="relative pl-14 border-l-4 border-slate-100 pb-10 last:pb-0 group">
                               <div className="absolute left-[-12px] top-0 w-6 h-6 rounded-full bg-white border-4 border-amber-500 group-hover:bg-amber-500 transition-colors shadow-xl"></div>
                               <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                  <div className="space-y-1">
                                     <h4 className="text-xl font-black text-slate-800">{t.title}</h4>
                                     <div className="flex gap-2">
                                        <span className="text-[9px] font-black text-amber-600 uppercase bg-amber-50 px-3 py-1 rounded-lg border border-amber-100">{t.room}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Sparkles className="w-3 h-3"/> {t.category}</span>
                                     </div>
                                  </div>
                                  <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Ordem #{t.sequenceOrder}</span>
                               </div>
                               {t.reasoning && (
                                  <div className="mt-5 p-5 bg-slate-50 rounded-3xl border border-slate-100 flex gap-4">
                                     <div className="text-amber-500 flex-shrink-0"><Hammer className="w-5 h-5" /></div>
                                     <p className="text-[11px] text-slate-500 leading-relaxed italic font-medium">Logística AI: {t.reasoning}</p>
                                  </div>
                                )}
                            </div>
                         ))}
                         <div className="mt-10 p-8 bg-amber-50 rounded-[3rem] border-2 border-amber-100 relative">
                            <div className="absolute top-[-15px] left-10 bg-white px-4 py-1 rounded-full border border-amber-200 text-[8px] font-black text-amber-600 uppercase tracking-widest">Procedimento Técnico</div>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               {phase.tips.map((tip, i) => <li key={i} className="text-[11px] text-amber-900 font-bold flex items-start gap-3 bg-white/50 p-3 rounded-2xl border border-amber-100/50 shadow-sm"><CheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0" /> {tip}</li>)}
                            </ul>
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        )}

        {/* --- Estado Vazio --- */}
        {!tasks.length && !optimizing && !result && (
          <div className="text-center py-32 bg-white rounded-[4rem] border-4 border-dashed border-slate-100 shadow-inner">
            <div className="bg-amber-50 w-28 h-28 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-lg border border-amber-100">
               <Hammer className="w-14 h-14 text-amber-300" />
            </div>
            <h3 className="text-3xl font-black text-slate-900">Mãos à Obra</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto mt-4 leading-relaxed font-medium">
               Comece alimentando o REFORM<span className="text-amber-500">AI</span> com as tarefas de cada cômodo. 
               Nossa inteligência irá consolidar tudo e gerar a sequência mais rápida para sua reforma.
            </p>
          </div>
        )}
      </main>

      {/* --- Footer Status --- */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-5 px-8 flex justify-between items-center z-[40] shadow-2xl">
         <div className="flex gap-8">
            <div className="flex flex-col">
               <span className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{tasks.length} Atividades</span>
               <div className="flex gap-1.5 mt-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-lg shadow-red-500/20" title="Alta"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/20" title="Média"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-lg shadow-blue-500/20" title="Baixa"></div>
               </div>
            </div>
            <div className="w-[1px] h-10 bg-slate-100"></div>
            <div className="flex flex-col">
               <span className="text-[11px] font-black text-amber-500 uppercase tracking-widest">{stats.totalProgress}% Obra</span>
               <div className="h-1.5 w-24 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-amber-500 shadow-lg shadow-amber-500/30" style={{ width: `${stats.totalProgress}%` }}></div>
               </div>
            </div>
         </div>
         <div className="text-right flex flex-col items-end">
            <p className="text-[9px] font-black text-slate-800 uppercase tracking-[0.3em] mb-1">REFORM<span className="text-amber-500">AI</span></p>
            <span className="text-[7px] font-bold text-slate-400 uppercase bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Sync: Local DB V5</span>
         </div>
      </footer>
    </div>
  );
};

export default App;
