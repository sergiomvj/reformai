
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Task, OptimizationResult, Priority, SubTask, HistoryEntry, Project, Category } from './types';
import { translations, Language } from './translations';
import { supabase } from './services/supabaseClient';

import { optimizeRenovation, OptimizationStrategy } from './services/gemini';
import { HardHat, Plus, Hammer, Trash, CheckCircle, Sparkles, Download, FileSpreadsheet, Edit3, X, TrendingUp, Video, Camera, LogIn, LogOut, History, Building, Upload } from './components/Icons';

// --- Inteligência de Obra: Modelos de Desmembramento (Sub-tarefas) ---
const SUBTASK_TEMPLATES: Record<string, string[]> = {
  'Pintura de paredes': ['Forração', 'Lixamento', 'Selador', '1ª Demão', '2ª Demão', 'Retoque'],
  'Pintura de teto': ['Preparação', 'Fundo Preparador', 'Pintura', 'Limpeza de luminárias'],
  'Aplicação de massa corrida': ['Limpeza superfície', '1ª demão massa', 'Lixamento', '2ª demão massa', 'Lixamento fino'],
  'Trocar fiação completa': ['Mapeamento', 'Passagem de guias', 'Troca de cabos', 'Conexão disjuntores', 'Testes'],
  'Instalar novos pontos de tomada': ['Corte alvenaria', 'Conduítes', 'Chumbamento caixas', 'Fiação', 'Espelhos'],
  'Trocar luminárias/LEDs': ['Remoção antigas', 'Furação/Suporte', 'Conexão elétrica', 'Fixação'],
  'Trocar encanamento': ['Demolição rastro', 'Instalação tubos', 'Testes de estanqueidade', 'Chumbamento'],
  'Reparo em infiltração': ['Identificação origem', 'Abertura local', 'Impermeabilização', 'Fechamento'],
  'Instalar bacia sanitária': ['Limpeza base', 'Anel de vedação', 'Fixação parafusos', 'Vedação silicone', 'Teste descarga'],
  'Colocação de porcelanato': ['Nivelamento', 'Argamassa', 'Assentamento', 'Uso de niveladores', 'Rejunte'],
  'Instalar piso laminado': ['Manta acústica', 'Encaixe réguas', 'Rodapés', 'Perfis de porta'],
  'Instalar móveis planejados': ['Conferência nível', 'Montagem módulos', 'Ajuste portas', 'Puxadores', 'Limpeza'],
  'Montagem de guarda-roupa': ['Base', 'Estrutura lateral', 'Prateleiras', 'Portas/Gavetas'],
  'Demolir alvenaria': ['Proteção área', 'Escoramento (se necessário)', 'Quebra', 'Ensacamento entulho', 'Remoção'],
  'Limpeza pós-obra': ['Remoção entulho fino', 'Limpeza vidros', 'Aspiração pó', 'Brilho revestimentos']
};

const ROOM_SUGGESTIONS = {
  Internos: ['Sala', 'Cozinha', 'Banheiro Social', 'Suíte', 'Quarto 1', 'Quarto 1', 'Closet', 'Corredor', 'Área de Serviço', 'Escritório'],
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
  const [session, setSession] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Language>('pt-br');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const [newTask, setNewTask] = useState<{ title: string, room: string, description: string, priority: Priority }>({
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
  const [currentStrategy, setCurrentStrategy] = useState<OptimizationStrategy | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // --- Auth & Session ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadProjects();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadProjects();
      else {
        setProjects([]);
        setCurrentProject(null);
        setTasks([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
    if (error) alert(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPass });
    if (error) alert(error.message);
    else alert(translations[lang]['loginSignup'] + ": Check your email!");
    setLoading(false);
  };

  const handleLogout = async () => {
    if (confirm(translations[lang].confirmLogout)) {
      await supabase.auth.signOut();
    }
  };

  const loadProjects = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setProjects(data);
      if (data.length > 0 && !currentProject) {
        setCurrentProject(data[0]);
      }
    }
    setLoading(false);
  };

  const createProject = async () => {
    if (!newProjectName || !session?.user) return;
    const { data, error } = await supabase.from('projects').insert([
      { name: newProjectName, user_id: session.user.id }
    ]).select();

    if (!error && data) {
      setProjects([data[0], ...projects]);
      setCurrentProject(data[0]);
      setNewProjectName('');
      setShowProjectModal(false);
      addHistoryEntry('creation', translations[lang].newProject, newProjectName, data[0].id);
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm("Excluir esta obra? Esta ação é irreversível e apagará todas as tarefas associadas.")) return;
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (!error) {
      setProjects(projects.filter(p => p.id !== projectId));
      if (currentProject?.id === projectId) {
        setCurrentProject(projects.find(p => p.id !== projectId) || null);
      }
    }
  };

  const exportProject = () => {
    if (!currentProject) return;
    const dataStr = JSON.stringify(tasks, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reformai_backup_${currentProject.name.toLowerCase().replace(/\s/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject || !session?.user) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const importedTasks = JSON.parse(ev.target?.result as string) as Task[];
        if (!Array.isArray(importedTasks)) throw new Error("Invalid format");

        const tasksToInsert = importedTasks.map(t => ({
          title: t.title,
          room: t.room,
          priority: t.priority,
          sub_tasks: t.subTasks || [],
          description: t.description || '',
          category: t.category || 'Geral',
          user_id: session.user.id,
          project_id: currentProject.id
        }));

        const { error } = await supabase.from('tasks').insert(tasksToInsert);
        if (error) throw error;

        loadProjectData(currentProject.id);
        alert(translations[lang].backupImported + ": " + tasksToInsert.length + " " + translations[lang].tasksRestored);
        setShowProjectModal(false);
      } catch (err) {
        alert("Erro ao importar arquivo. Verifique o formato.");
      }
    };
    reader.readAsText(file);
  };

  // --- Load Data by Project ---
  useEffect(() => {
    if (currentProject) {
      loadProjectData(currentProject.id);
    }
  }, [currentProject]);

  const loadProjectData = async (projectId: string) => {
    setLoading(true);
    const [tasksRes, historyRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('project_id', projectId),
      supabase.from('history_entries').select('*').eq('project_id', projectId).order('created_timestamp', { ascending: false })
    ]);

    if (!tasksRes.error) {
      const mappedTasks = tasksRes.data.map(t => ({
        ...t,
        subTasks: t.sub_tasks || []
      }));
      setTasks(mappedTasks);
    }
    if (!historyRes.error) setHistory(historyRes.data);
    setLoading(false);
  };

  const addHistoryEntry = async (type: HistoryEntry['type'], action: string, details: string, projectId?: string) => {
    if (!session?.user) return;
    const pId = projectId || currentProject?.id;
    if (!pId) return;

    const entry = {
      user_id: session.user.id,
      project_id: pId,
      timestamp: Date.now(),
      created_timestamp: Date.now(),
      user: session.user.email?.split('@')[0] || 'User',
      type,
      action,
      details
    };

    const { data, error } = await supabase.from('history_entries').insert([entry]).select();
    if (!error && data) {
      setHistory(prev => [data[0], ...prev].slice(0, 100));
    }
  };

  // --- Task Operations ---
  const addTask = async () => {
    if (!newTask.title || !newTask.room || !currentProject || !session?.user) return;

    const autoSubTasks = (SUBTASK_TEMPLATES[newTask.title] || []).map(title => ({
      id: Math.random().toString(36).substr(2, 9),
      title,
      completed: false
    }));

    const taskData = {
      project_id: currentProject.id,
      user_id: session.user.id,
      title: newTask.title,
      room: newTask.room,
      description: newTask.description,
      priority: newTask.priority,
      status: 'pending',
      category: selectedCat || 'Geral',
      sub_tasks: autoSubTasks,
      photos: photoFiles.length > 0 ? [...photoFiles] : [],
      video_url: videoData || null
    };

    const { data, error } = await supabase.from('tasks').insert([taskData]).select();

    if (!error && data) {
      const savedTask = { ...data[0], subTasks: data[0].sub_tasks };
      setTasks(prev => [...prev, savedTask]);
      addHistoryEntry('creation', translations[lang].newTaskAdded, `${newTask.title} em ${newTask.room}`);

      setNewTask({ title: '', room: newTask.room, description: '', priority: 'Média' });
      setPhotoFiles([]);
      setVideoData(null);
      setSelectedCat(null);
    } else {
      alert("Erro ao salvar tarefa: " + (error?.message || "Unknown error"));
    }
  };

  const toggleSubTask = async (taskId: string, subTaskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const subTask = task.subTasks.find(st => st.id === subTaskId);
    const newState = !subTask?.completed;
    const newSubTasks = task.subTasks.map(st => st.id === subTaskId ? { ...st, completed: newState } : st);
    const allDone = newSubTasks.length > 0 && newSubTasks.every(st => st.completed);

    const { error } = await supabase.from('tasks').update({
      sub_tasks: newSubTasks,
      status: allDone ? 'completed' : 'pending'
    }).eq('id', taskId);

    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subTasks: newSubTasks, status: allDone ? 'completed' : 'pending' } : t));

      addHistoryEntry(
        newState ? 'completion' : 'update',
        newState ? translations[lang].subTaskCompleted : translations[lang].subTaskReopened,
        `${subTask?.title} - ${task.title} (${task.room})`
      );

      if (allDone && task.status !== 'completed') {
        addHistoryEntry('completion', translations[lang].taskFinished, `${task.title} em ${task.room}`);
      }
    }
  };

  const deleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (taskToDelete && confirm(`${translations[lang].deleteRecord}: ${taskToDelete.title}?`)) {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (!error) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        addHistoryEntry('deletion', translations[lang].taskRemoved, `${taskToDelete.title} em ${taskToDelete.room}`);
      }
    }
  };

  const addManualSubTask = async (taskId: string) => {
    if (!manualSubTask) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const newSubTasks = [...task.subTasks, { id: Math.random().toString(36).substr(2, 9), title: manualSubTask, completed: false }];

    const { error } = await supabase.from('tasks').update({ sub_tasks: newSubTasks }).eq('id', taskId);

    if (!error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subTasks: newSubTasks } : t));
      addHistoryEntry('update', translations[lang].manualStepAdded, `${manualSubTask} para ${task.title}`);
      setManualSubTask('');
    }
  };

  // --- Stats & Memo ---
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
      if (byPriority[t.priority]) {
        byPriority[t.priority].total++;
        byPriority[t.priority].progress += p;
      }
    });

    Object.keys(byRoom).forEach(r => byRoom[r].progress = Math.round(byRoom[r].progress / byRoom[r].total));
    Object.keys(byPriority).forEach(p => {
      if (byPriority[p].total > 0) byPriority[p].progress = Math.round(byPriority[p].progress / byPriority[p].total);
    });

    return { totalProgress, byRoom, byPriority };
  }, [tasks]);

  // --- Handlers ---
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

  const handleOptimize = async (strategy: OptimizationStrategy) => {
    if (tasks.length === 0) return;
    setOptimizing(true);
    setCurrentStrategy(strategy);
    try {
      const optimized = await optimizeRenovation(tasks, strategy);
      setResult(optimized);
      addHistoryEntry('optimization', translations[lang].aiOptimizationExecuted, `Estratégia: ${strategy}`);
    } catch (err) {
      alert("Erro ao otimizar cronograma.");
    } finally {
      setOptimizing(false);
    }
  };

  // --- Renders ---
  if (loading && !session) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-spin h-12 w-12 border-4 border-amber-500 rounded-full border-t-transparent"></div>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-10 shadow-2xl animate-in zoom-in duration-300">
        <div className="text-center mb-6 md:mb-8">
          <div className="bg-amber-500 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-900 shadow-xl">
            <HardHat className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-widest text-slate-800">
            REFORM<span className="text-amber-500">AI</span>
          </h1>
          <p className="text-slate-400 text-[10px] md:text-xs font-bold mt-1.5 md:mt-2 uppercase tracking-widest">
            {isRegistering ? translations[lang].signUp : translations[lang].login}
          </p>
        </div>

        <form onSubmit={isRegistering ? handleSignUp : handleLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].email}</label>
            <input
              type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none transition-all font-bold text-slate-800 bg-slate-50 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].password}</label>
            <input
              type="password" required value={authPass} onChange={e => setAuthPass(e.target.value)}
              className="w-full px-5 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none transition-all font-bold text-slate-800 bg-slate-50 text-sm"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-slate-900 text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl hover:bg-slate-800 transition-all shadow-xl uppercase tracking-widest mt-4 flex items-center justify-center text-xs md:text-sm"
          >
            {loading ? <div className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent"></div> : (isRegistering ? translations[lang].signUp : translations[lang].login)}
          </button>
        </form>

        <button
          onClick={() => setIsRegistering(!isRegistering)}
          className="w-full mt-6 text-[9px] md:text-[10px] font-black text-slate-400 uppercase hover:text-amber-500 transition-colors"
        >
          {isRegistering ? translations[lang].alreadyHaveAccount : translations[lang].dontHaveAccount}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Modais */}
      {showProjectModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase">{translations[lang].newProject}</h3>
              <button onClick={() => setShowProjectModal(false)}><X className="text-slate-300 w-5 h-5 md:w-6 md:h-6" /></button>
            </div>
            <div className="space-y-4 mb-4 md:mb-6 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar border-b border-slate-100 pb-4">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{translations[lang].existingProjects || 'Projetos Atuais'}</p>
              {projects.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-700 text-[11px] md:text-xs truncate max-w-[150px]">{p.name}</span>
                  <button onClick={() => deleteProject(p.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-50">
              <p className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{translations[lang].backupRestore}</p>
              <div className="flex gap-2">
                <button
                  onClick={exportProject}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all text-[9px] uppercase tracking-widest"
                >
                  <Download className="w-3.5 h-3.5" /> {translations[lang].exportProject}
                </button>
                <div className="flex-1 relative">
                  <input
                    type="file" accept=".json" onChange={handleImport}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <button
                    className="w-full h-full flex items-center justify-center gap-2 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-all text-[9px] uppercase tracking-widest"
                  >
                    <Upload className="w-3.5 h-3.5" /> {translations[lang].importProject}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <p className="text-[9px] md:text-[10px] font-black text-amber-600 uppercase tracking-widest">{translations[lang].addNewProject || 'Novo Projeto'}</p>
              <input
                type="text" placeholder={translations[lang].projectName} value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                className="w-full px-5 py-3 md:py-4 rounded-xl md:rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none font-bold text-sm"
              />
              <button onClick={createProject} className="w-full bg-amber-500 text-slate-900 font-black py-3.5 md:py-4 rounded-xl md:rounded-2xl hover:bg-amber-400 transition-all uppercase tracking-widest text-xs md:text-sm">
                {translations[lang].create}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-50 shadow-lg">
        {/* Cabeçalho Principal */}
        <header className="bg-slate-900 text-white py-4 md:py-6 px-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-4">
              <div className="bg-amber-500 p-1.5 md:p-2 rounded-xl text-slate-900 shadow-xl"><HardHat className="w-5 h-5 md:w-6 md:h-6" /></div>
              <div>
                <h1 className="text-lg md:text-xl font-heading uppercase tracking-widest leading-none">
                  REFORM<span className="text-amber-500">AI</span>
                </h1>
                <div className="flex items-center gap-2 mt-1 md:mt-1.5">
                  <div className="h-1 w-16 md:w-24 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${stats.totalProgress}%` }}></div>
                  </div>
                  <span className="text-[8px] md:text-[10px] font-black">{stats.totalProgress}%</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDashboard(!showDashboard)}
                className={`p-2 md:p-2.5 rounded-xl transition-all ${showDashboard ? 'bg-amber-500 text-slate-900 shadow-lg' : 'bg-slate-800 text-slate-400'}`}
              >
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              <button
                onClick={handleLogout}
                className="p-2 md:p-2.5 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors"
              >
                <LogOut className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
              </button>
            </div>
          </div>
        </header>

        {/* Barra de Seleção de Obra */}
        <div className="bg-amber-500 py-2 md:py-3 px-4 border-b border-amber-600">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth flex-1">
              <button
                onClick={() => setShowProjectModal(true)}
                className="flex-shrink-0 bg-slate-900 text-white p-2 rounded-lg"
              >
                <Plus className="w-4 h-4" />
              </button>
              <div className="flex gap-2">
                {projects.map(p => (
                  <button
                    key={p.id} onClick={() => setCurrentProject(p)}
                    className={`flex-shrink-0 px-3 md:px-4 py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase transition-all ${currentProject?.id === p.id ? 'bg-slate-900 text-white shadow-xl scale-105' : 'bg-amber-400 text-amber-900 hover:bg-amber-300'}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              {['en', 'sp', 'pt-br'].map(l => (
                <button
                  key={l} onClick={() => setLang(l as Language)}
                  className={`text-[9px] md:text-[10px] font-black uppercase transition-colors flex-shrink-0 ${lang === l ? 'text-slate-900' : 'text-amber-800 hover:text-slate-900'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!currentProject ? (
        <div className="max-w-4xl mx-auto px-4 mt-20 text-center animate-in fade-in duration-700">
          <Building className="w-20 h-20 text-slate-200 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-slate-300 uppercase italic tracking-widest">{translations[lang].selectProject}</h2>
          <button
            onClick={() => setShowProjectModal(true)}
            className="mt-8 bg-amber-500 text-slate-900 px-8 py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl hover:bg-amber-400 transition-all"
          >
            {translations[lang].newProject}
          </button>
        </div>
      ) : (
        <main className="max-w-4xl mx-auto px-4 mt-8 space-y-10">
          {/* Dashboard Component */}
          {showDashboard && (
            <section className="bg-slate-900 text-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border-b-[6px] md:border-b-[10px] border-amber-500 animate-in zoom-in duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-8">
                <div>
                  <h2 className="text-amber-500 font-black uppercase tracking-[0.2em] text-[8px] md:text-[10px] mb-1">{translations[lang].consolidationStatus}</h2>
                  <p className="text-2xl md:text-3xl font-black uppercase">{translations[lang].panelTitle}<span className="text-amber-500">AI</span></p>
                  <p className="text-[9px] md:text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest opacity-60">{currentProject.name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 md:gap-4 w-full sm:w-auto">
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={`flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 px-3 md:px-4 py-2 rounded-xl transition-all text-[9px] md:text-[10px] font-black uppercase ${showHistory ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-amber-500 hover:bg-slate-700'}`}
                  >
                    <History className="w-3.5 h-3.5 md:w-4 md:h-4" /> {translations[lang].workLog}
                  </button>

                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={exportProject}
                      className="flex-1 sm:flex-none p-2 bg-slate-800 text-amber-500 rounded-xl hover:bg-slate-700 transition-all"
                      title={translations[lang].exportProject}
                    >
                      <Download className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <div className="flex-1 sm:flex-none relative">
                      <input
                        type="file" accept=".json" onChange={handleImport}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <button
                        className="w-full h-full p-2 bg-slate-800 text-amber-500 rounded-xl hover:bg-slate-700 transition-all"
                        title={translations[lang].importProject}
                      >
                        <Upload className="w-4 h-4 md:w-5 md:h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 hidden xs:block">
                    <p className="text-4xl md:text-5xl font-black text-amber-500 leading-none">{stats.totalProgress}%</p>
                    <p className="text-[8px] md:text-[9px] text-slate-500 uppercase font-black tracking-tighter">{translations[lang].totalExecution}</p>
                  </div>
                </div>
              </div>

              {showHistory ? (
                <div className="animate-in slide-in-from-top-4 duration-300">
                  <h3 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-2 mb-4">{translations[lang].historyRecent}</h3>
                  <div className="max-h-60 md:max-h-80 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                    {history.length > 0 ? history.map(entry => (
                      <div key={entry.id} className="bg-white/5 border border-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl flex items-start gap-3 md:gap-4 hover:bg-white/10 transition-all">
                        <div className={`mt-1 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full flex-shrink-0 ${entry.type === 'completion' ? 'bg-green-500' :
                          entry.type === 'creation' ? 'bg-blue-500' :
                            entry.type === 'optimization' ? 'bg-amber-500' :
                              entry.type === 'deletion' ? 'bg-red-500' : 'bg-slate-400'
                          }`}></div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] md:text-[10px] font-black uppercase text-amber-500">{entry.action}</span>
                            <span className="text-[7px] md:text-[8px] font-bold text-slate-500 uppercase">{new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-[10px] md:text-[11px] text-slate-300 font-medium leading-tight">{entry.details}</p>
                        </div>
                      </div>
                    )) : (
                      <p className="text-[9px] md:text-[10px] text-slate-600 italic py-4">{translations[lang].noHistory}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
                  <div className="space-y-5 md:space-y-6">
                    <h3 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-2">{translations[lang].progressByPriority}</h3>
                    {Object.entries(stats.byPriority).map(([p, data]) => (
                      <div key={p} className="space-y-1 md:space-y-1.5">
                        <div className="flex justify-between text-[9px] md:text-[10px] font-black uppercase">
                          <span className={p === 'Alta' ? 'text-red-400' : p === 'Média' ? 'text-amber-400' : 'text-blue-400'}>{p === 'Alta' ? translations[lang].high : p === 'Média' ? translations[lang].medium : translations[lang].low}</span>
                          <span>{(data as any).progress}%</span>
                        </div>
                        <div className="h-1.5 md:h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-1000 ${p === 'Alta' ? 'bg-red-500' : p === 'Média' ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${(data as any).progress}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-5 md:space-y-6 mt-4 md:mt-0">
                    <h3 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-white/10 pb-2">{translations[lang].progressByRoom}</h3>
                    <div className="max-h-48 md:max-h-56 overflow-y-auto pr-3 space-y-4 custom-scrollbar">
                      {Object.entries(stats.byRoom).map(([room, data]) => (
                        <div key={room} className="space-y-1">
                          <div className="flex justify-between text-[9px] md:text-[10px] font-black uppercase">
                            <span className="text-slate-300 truncate w-32 md:w-40">{room}</span>
                            <span className="text-amber-500">{(data as any).progress}%</span>
                          </div>
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500" style={{ width: `${(data as any).progress}%` }}></div>
                          </div>
                        </div>
                      ))}
                      {Object.keys(stats.byRoom).length === 0 && <p className="text-[9px] md:text-[10px] text-slate-600 italic">{translations[lang].noActiveRoom}</p>}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Form and List components (adapted from original code to use currentProject) */}
          {!result && (
            <section className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-5 md:p-8 shadow-sm border border-slate-200 space-y-6 md:space-y-8">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase">{translations[lang].newTechnicalRecord}</h2>
                  <p className="text-slate-500 text-[10px] md:text-xs">{translations[lang].selectCategory}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-2">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].locationRoom}</label>
                  <input
                    type="text" value={newTask.room} list="rooms-list"
                    onChange={e => setNewTask({ ...newTask, room: e.target.value })}
                    placeholder={translations[lang].roomPlaceholder}
                    className="w-full px-5 md:px-6 py-3 md:py-4 rounded-xl md:rounded-2xl border-2 border-slate-100 focus:border-amber-500 outline-none transition-all font-bold text-slate-800 shadow-inner text-sm"
                  />
                  <datalist id="rooms-list">{Object.values(ROOM_SUGGESTIONS).flat().map(r => <option key={r} value={r} />)}</datalist>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].criticalPriority}</label>
                  <div className="flex gap-2">
                    {(['Alta', 'Média', 'Baixa'] as Priority[]).map(p => (
                      <button
                        key={p} onClick={() => setNewTask({ ...newTask, priority: p })}
                        className={`flex-1 py-3 md:py-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black border-2 transition-all ${newTask.priority === p ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-slate-50 text-slate-400 border-slate-50 hover:border-slate-200'}`}
                      >
                        {p === 'Alta' ? translations[lang].high : p === 'Média' ? translations[lang].medium : translations[lang].low}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].workCategories}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {TASK_SUGGESTIONS.map(cat => (
                    <button
                      key={cat.category} onClick={() => setSelectedCat(cat.category)}
                      className={`py-2.5 md:py-3.5 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-black border-2 transition-all ${selectedCat === cat.category ? 'bg-amber-500 border-amber-600 text-slate-900 shadow-lg' : 'bg-slate-50 border-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                      {cat.category}
                    </button>
                  ))}
                </div>
              </div>

              {selectedCat && (
                <div className="space-y-4 p-5 md:p-6 bg-amber-50 rounded-[1.5rem] md:rounded-[2rem] border-2 border-amber-100 animate-in slide-in-from-top-4 duration-300">
                  <p className="text-[9px] md:text-[10px] font-black text-amber-600 uppercase tracking-widest">{translations[lang].specializedTasks}</p>
                  <div className="flex flex-wrap gap-2">
                    {TASK_SUGGESTIONS.find(c => c.category === selectedCat)?.tasks.map(t => (
                      <button
                        key={t} onClick={() => setNewTask({ ...newTask, title: t })}
                        className={`px-4 md:px-5 py-2 md:py-2.5 rounded-full text-[9px] md:text-[10px] font-bold border-2 transition-all ${newTask.title === t ? 'bg-amber-500 border-amber-600 shadow-md' : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text" value={newTask.title}
                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder={translations[lang].customTaskPlaceholder}
                    className="w-full px-5 py-3 md:py-4 rounded-xl border-2 border-amber-200 outline-none focus:border-amber-500 font-bold text-sm bg-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-3">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].mediaReference}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="file" accept="video/*" capture="environment" ref={videoInputRef} className="hidden" onChange={handleVideoUpload} />
                    <button
                      type="button" disabled={isProcessingVideo} onClick={() => videoInputRef.current?.click()}
                      className={`py-4 md:py-6 border-2 border-dashed rounded-[1.5rem] md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 transition-all ${videoData ? 'border-green-400 bg-green-50 text-green-600' : 'border-slate-200 text-slate-400 hover:border-amber-400'}`}
                    >
                      {isProcessingVideo ? <div className="animate-spin h-4 w-4 md:h-5 md:w-5 border-2 border-amber-500 rounded-full border-t-transparent"></div> : <Video className="w-5 h-5 md:w-6 md:h-6" />}
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-center">{translations[lang].video}</span>
                    </button>

                    <input type="file" accept="image/*" multiple capture="environment" ref={photoInputRef} className="hidden" onChange={handlePhotoUpload} />
                    <button
                      type="button" onClick={() => photoInputRef.current?.click()}
                      className={`py-4 md:py-6 border-2 border-dashed rounded-[1.5rem] md:rounded-[2rem] flex flex-col items-center justify-center gap-1 md:gap-2 transition-all ${photoFiles.length > 0 ? 'border-green-400 bg-green-50 text-green-600' : 'border-slate-200 text-slate-400 hover:border-amber-400'}`}
                    >
                      <Camera className="w-5 h-5 md:w-6 md:h-6" />
                      <span className="text-[8px] md:text-[10px] font-black uppercase text-center">{photoFiles.length > 0 ? `${photoFiles.length} ${translations[lang].photos}` : translations[lang].photos}</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{translations[lang].masterNotes}</label>
                  <textarea
                    value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder={translations[lang].notesPlaceholder}
                    className="w-full px-5 md:px-6 py-3 md:py-4 rounded-[1.5rem] md:rounded-[2rem] border-2 border-slate-100 outline-none text-xs md:text-sm h-[100px] md:h-[130px] shadow-inner resize-none font-medium"
                  />
                </div>
              </div>

              <button
                onClick={addTask} disabled={isProcessingVideo || loading}
                className="w-full bg-slate-900 text-white font-black py-4 md:py-6 rounded-2xl md:rounded-[2rem] flex items-center justify-center gap-3 md:gap-4 hover:bg-slate-800 transition-all active:scale-[0.98] shadow-2xl uppercase tracking-[0.2em] text-xs md:text-sm"
              >
                <Plus className="w-5 h-5 md:w-6 md:h-6" /> {translations[lang].incorporateTask}
              </button>
            </section>
          )}

          {tasks.length > 0 && !result && (
            <section className="space-y-6 md:space-y-8">
              <div className="bg-slate-900 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] text-white shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6 border-l-8 border-amber-500">
                <div className="text-center md:text-left">
                  <h3 className="text-[9px] md:text-[10px] font-black uppercase text-amber-500 mb-2 tracking-widest">{translations[lang].scheduleEngineering}</h3>
                  <p className="text-lg md:text-xl font-heading uppercase">{translations[lang].chooseActionPlan}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button onClick={() => handleOptimize('fastest')} className="flex-1 md:flex-none bg-white/10 hover:bg-amber-500 hover:text-slate-900 px-4 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-[8px] md:text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" /> {translations[lang].fastestExecution}
                  </button>
                  <button onClick={() => handleOptimize('priority')} className="flex-1 md:flex-none bg-white/10 hover:bg-amber-500 hover:text-slate-900 px-4 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-[8px] md:text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" /> {translations[lang].byPriority}
                  </button>
                  <button onClick={() => handleOptimize('room')} className="flex-1 md:flex-none bg-white/10 hover:bg-amber-500 hover:text-slate-900 px-4 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-[8px] md:text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <HardHat className="w-3.5 h-3.5 md:w-4 md:h-4" /> {translations[lang].byRoom}
                  </button>
                </div>
              </div>

              <div className="grid gap-8">
                {tasks.map(task => {
                  const progress = calculateTaskProgress(task);
                  return (
                    <div key={task.id} className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="p-6 md:p-8">
                        <div className="flex justify-between items-start mb-6">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[7px] md:text-[8px] font-black px-2 md:px-2.5 py-1 rounded-full uppercase ${task.priority === 'Alta' ? 'bg-red-100 text-red-600' : task.priority === 'Média' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                {task.priority === 'Alta' ? translations[lang].high : task.priority === 'Média' ? translations[lang].medium : translations[lang].low}
                              </span>
                              <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[100px]">{task.room}</span>
                            </div>
                            <h4 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight leading-tight">{task.title}</h4>
                          </div>
                          <div className="text-right flex-shrink-0 ml-4">
                            <p className="text-2xl md:text-3xl font-black text-amber-500 leading-none">{progress}%</p>
                            <p className="text-[7px] md:text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{translations[lang].completed}</p>
                          </div>
                        </div>

                        <div className="h-1.5 md:h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-8">
                          <div className="h-full bg-amber-500 transition-all duration-700" style={{ width: `${progress}%` }}></div>
                        </div>

                        <div className="bg-slate-50 p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] space-y-4">
                          <div className="flex justify-between items-center">
                            <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">{translations[lang].activityBreakdown}</p>
                            <span className="text-[8px] md:text-[9px] font-bold text-slate-300 hidden sm:inline">{translations[lang].executivePhase}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                            {task.subTasks.map(st => (
                              <button
                                key={st.id} onClick={() => toggleSubTask(task.id, st.id)}
                                className={`flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl text-[9px] md:text-[10px] font-bold text-left transition-all ${st.completed ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white border border-slate-200 text-slate-600 shadow-sm hover:border-amber-300'}`}
                              >
                                <div className={`w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 flex items-center justify-center transition-colors flex-shrink-0 ${st.completed ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}>
                                  {st.completed && <CheckCircle className="w-3 h-3 md:w-4 md:h-4 text-white" />}
                                </div>
                                <span className="truncate">{st.title}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-2">
                            <input
                              type="text" value={manualSubTask} onChange={e => setManualSubTask(e.target.value)}
                              placeholder={translations[lang].addCustomStep}
                              className="flex-1 px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl border border-slate-200 text-[9px] md:text-[10px] font-bold outline-none focus:border-amber-500"
                            />
                            <button onClick={() => addManualSubTask(task.id)} className="bg-slate-900 text-white p-2 md:p-2.5 rounded-lg md:rounded-xl"><Plus className="w-4 h-4 md:w-5 md:h-5" /></button>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 md:pt-6 border-t border-slate-100 flex justify-end">
                          <button onClick={() => deleteTask(task.id)} className="text-[8px] md:text-[9px] font-black text-slate-300 hover:text-red-500 uppercase tracking-widest flex items-center gap-2 transition-colors">
                            <Trash className="w-3 h-3 md:w-3.5 md:h-3.5" /> {translations[lang].deleteRecord}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {optimizing && (
            <div className="py-32 text-center animate-pulse">
              <div className="animate-spin h-16 w-16 border-t-4 border-amber-500 rounded-full mx-auto mb-6"></div>
              <p className="font-black uppercase text-slate-900 tracking-[0.3em] text-xs">REFORM<span className="text-amber-500">AI</span> {translations[lang].structuringSequence}</p>
            </div>
          )}

          {result && (
            <div className="space-y-8 md:space-y-12 animate-in slide-in-from-bottom-6 duration-700">
              <div className="bg-slate-900 text-white p-6 md:p-12 rounded-[2.5rem] md:rounded-[4rem] border-b-[8px] md:border-b-[15px] border-amber-500 shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-start mb-6 md:mb-10">
                  <div className="space-y-2">
                    <h2 className="text-2xl md:text-4xl font-heading uppercase tracking-widest flex items-center gap-3 md:gap-5"><Sparkles className="text-amber-500 w-6 h-6 md:w-10 md:h-10" /> {translations[lang].masterPlan}</h2>
                    {currentStrategy && (
                      <div className="inline-flex items-center gap-2 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
                        <span className="text-[8px] md:text-[10px] font-black uppercase text-amber-500">{translations[lang].activeStrategy}:</span>
                        <span className="text-[8px] md:text-[10px] font-black uppercase text-white">
                          {currentStrategy === 'fastest' ? translations[lang].fastestExecution :
                            currentStrategy === 'priority' ? translations[lang].byPriority :
                              translations[lang].byRoom}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setResult(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all text-[9px] font-black uppercase"
                  >
                    <X className="w-4 h-4" /> {translations[lang].backToTasks}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                  <div className="bg-white/5 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] border border-white/10 text-center md:text-left">
                    <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 md:mb-2">{translations[lang].executionWindow}</p>
                    <p className="text-4xl md:text-6xl font-black text-amber-500">{result.totalEstimatedDays} {translations[lang].days}</p>
                  </div>
                  <div className="bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/10">
                    <p className="text-[9px] md:text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 md:mb-3">{translations[lang].directive}:</p>
                    <p className="text-[11px] md:text-sm text-slate-300 italic leading-relaxed font-medium">"{result.generalAdvice}"</p>
                  </div>
                </div>
              </div>

              <div className="space-y-8 md:space-y-16">
                {result.phases.map(phase => (
                  <div key={phase.order} className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-900 text-white px-6 md:px-10 py-5 md:py-8 flex justify-between items-center border-b-4 border-amber-500">
                      <h3 className="text-lg md:text-2xl font-heading uppercase tracking-widest">{phase.phaseName}</h3>
                      <div className="bg-amber-500 text-slate-900 px-4 md:px-6 py-1.5 md:py-2 rounded-full text-[9px] md:text-[12px] font-black uppercase tracking-widest shadow-2xl">{translations[lang].step} {phase.order}</div>
                    </div>
                    <div className="p-6 md:p-10 space-y-8 md:space-y-10">
                      {phase.tasks.map(t => (
                        <div key={t.id} className="relative pl-8 md:pl-14 border-l-2 md:border-l-4 border-slate-100 pb-8 md:pb-10 last:pb-0 group">
                          <div className="absolute left-[-7px] md:left-[-12px] top-0 w-3 md:w-6 h-3 md:h-6 rounded-full bg-white border-2 md:border-4 border-amber-500 group-hover:bg-amber-500 transition-colors shadow-lg"></div>
                          <div className="flex flex-col md:flex-row justify-between items-start gap-2 md:gap-4">
                            <div className="space-y-1">
                              <h4 className="text-lg md:text-xl font-black text-slate-800 leading-tight">{t.title}</h4>
                              <div className="flex flex-wrap gap-2">
                                <span className="text-[7px] md:text-[9px] font-black text-amber-600 uppercase bg-amber-50 px-2 md:px-3 py-1 rounded-lg border border-amber-100">{t.room}</span>
                                <span className="text-[7px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Sparkles className="w-2.5 h-2.5 md:w-3 md:h-3" /> {t.category}</span>
                              </div>
                            </div>
                            <span className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-widest">{translations[lang].order} {t.sequenceOrder}</span>
                          </div>
                          {t.reasoning && (
                            <div className="mt-4 md:mt-5 p-4 md:p-5 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-100 flex gap-3 md:gap-4">
                              <div className="text-amber-500 flex-shrink-0"><Hammer className="w-4 h-4 md:w-5 md:h-5" /></div>
                              <p className="text-[10px] md:text-[11px] text-slate-500 leading-relaxed italic font-medium">{translations[lang].logisticsAI}: {t.reasoning}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!tasks.length && !optimizing && !result && (
            <div className="text-center py-32 bg-white rounded-[4rem] border-4 border-dashed border-slate-100 shadow-inner">
              <div className="bg-amber-50 w-28 h-28 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-lg border border-amber-100">
                <Hammer className="w-14 h-14 text-amber-300" />
              </div>
              <h3 className="text-3xl font-black text-slate-900">{translations[lang].handsOnWork}</h3>
              <p className="text-slate-400 text-sm max-w-sm mx-auto mt-4 leading-relaxed font-medium">
                {translations[lang].emptyStateDesc}
              </p>
            </div>
          )}
        </main>
      )}

      {/* --- Footer Status --- */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 md:py-5 px-4 md:px-8 flex justify-between items-center z-[40] shadow-2xl">
        <div className="flex gap-4 md:gap-8 overflow-x-auto no-scrollbar max-w-[70%]">
          <div className="flex flex-col flex-shrink-0">
            <span className="text-[9px] md:text-[11px] font-black text-slate-900 uppercase tracking-widest">{tasks.length} {translations[lang].activities}</span>
            <div className="flex gap-1 mt-1">
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-red-500 shadow-lg" title="Alta"></div>
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-amber-500 shadow-lg" title="Média"></div>
              <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-blue-500 shadow-lg" title="Baixa"></div>
            </div>
          </div>
          <div className="w-[1px] h-8 md:h-10 bg-slate-100 flex-shrink-0"></div>
          <div className="flex flex-col flex-shrink-0">
            <span className="text-[9px] md:text-[11px] font-black text-amber-500 uppercase tracking-widest">{stats.totalProgress}% {translations[lang].work}</span>
            <div className="h-1 md:h-1.5 w-16 md:w-24 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
              <div className="h-full bg-amber-500 shadow-lg" style={{ width: `${stats.totalProgress}%` }}></div>
            </div>
          </div>
        </div>
        <div className="text-right flex flex-col items-end flex-shrink-0">
          <p className="text-[8px] md:text-[9px] font-black text-slate-800 uppercase tracking-[0.2em] mb-0.5">REFORM<span className="text-amber-500">AI</span></p>
          <span className="text-[6px] md:text-[7px] font-bold text-slate-400 uppercase bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 truncate max-w-[80px] md:max-w-none">
            {session?.user?.email?.split('@')[0]}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
