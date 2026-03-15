import React, { useState, useEffect, useRef } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  BookOpen, 
  Zap, 
  BarChart3, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Flame,
  LayoutDashboard,
  Settings,
  ArrowLeft,
  ArrowRight,
  Play,
  Award,
  Volume2,
  Calendar,
  MessageSquare,
  WifiOff,
  Share2,
  PlusCircle,
  Send,
  User,
  UserPlus,
  LogIn,
  Search,
  Sparkles,
  Users,
  Book,
  Globe,
  Star,
  Bot,
  LogOut,
  Shield,
  Bell,
  CreditCard,
  Loader2,
  ChevronLeft,
  Quote,
  Mic,
  Camera,
  X,
  Paperclip,
  Timer,
  Pause,
  RotateCcw,
  Moon,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSummary, generateQuiz, generateFlashcards, defineWord, chatWithTutor, generateSpeech } from './services/geminiService';
import { supabase, isConfigured } from './supabaseClient';
import SignIn from './SignIn';
import SignUp from './SignUp';

const uploadToStorage = async (filePath: string, file: File) => {
  if (!supabase) {
    console.warn('Supabase not configured, skipping storage upload');
    return;
  }
  const { error: uploadError } = await supabase.storage
    .from('app-files')
    .upload(filePath, file);
  
  if (uploadError) {
    if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('bucket not found')) {
      const { error: createError } = await supabase.storage.createBucket('app-files', { public: false });
      if (!createError) {
        const { error: retryError } = await supabase.storage
          .from('app-files')
          .upload(filePath, file);
        if (retryError) throw retryError;
      } else {
        throw new Error("Storage bucket 'app-files' is missing. Please run the SQL command provided in the chat to create it.");
      }
    } else if (uploadError.message.includes('row-level security') || uploadError.message.includes('RLS')) {
      throw new Error("Permission denied. Please run the SQL command provided in the chat to set up Storage RLS policies.");
    } else {
      throw uploadError;
    }
  }
};

// --- Types ---
interface Module {
  id: string;
  title: string;
  subject: string;
  progress: number;
  readiness: number; // 0-100 score for quiz readiness
  content: string;
  lastStudied: string;
  deadline?: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface QueuedMessage {
  id: string;
  recipient: string;
  text: string;
  status: 'queued' | 'sent';
  timestamp: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  color: string;
  type: 'study' | 'work' | 'other';
  completed: boolean;
}

interface TimerPhase {
  name: string;
  duration: number; // in minutes
  color: string;
}

interface TimerType {
  id: string;
  name: string;
  description: string;
  phases: TimerPhase[];
}

// --- Mock Data ---
const MOCK_MODULES: Module[] = [
  {
    id: '1',
    title: 'Thermodynamics & Heat Transfer',
    subject: 'Mechanical Engineering',
    progress: 65,
    readiness: 85,
    content: `Thermodynamics is the branch of physics that deals with heat, work, and temperature, and their relation to energy, radiation, and physical properties of matter.

Key Principles:
1. First Law: Energy cannot be created or destroyed, only transformed.
2. Second Law: The entropy of any isolated system always increases.
3. Heat Transfer Mechanisms: Conduction (through solids), Convection (through fluids), and Radiation (through electromagnetic waves).

For QCU engineering students, this is crucial for designing engines, HVAC systems, and power plants.`,
    lastStudied: '2h ago',
    deadline: 'Tomorrow'
  },
  {
    id: '2',
    title: 'Structural Analysis II',
    subject: 'Civil Engineering',
    progress: 30,
    readiness: 45,
    content: `Structural analysis is the determination of the effects of loads on physical structures and their components.

Focus Areas:
1. Indeterminate Structures: Using force and displacement methods.
2. Matrix Methods: Modern computational techniques for analyzing complex frames.
3. Influence Lines: Understanding how moving loads affect internal forces.

Essential for building safe bridges and skyscrapers in the Philippines.`,
    lastStudied: 'Yesterday',
    deadline: 'In 3 days'
  },
  {
    id: '3',
    title: 'Embedded Systems Design',
    subject: 'Computer Engineering',
    progress: 90,
    readiness: 95,
    content: `Embedded systems are controller-based systems designed to perform specific tasks within a larger mechanical or electrical system.

Core Concepts:
1. Microcontrollers: ARM, AVR, and PIC architectures.
2. Real-Time Operating Systems (RTOS): Managing tasks with strict timing constraints.
3. Peripheral Interfacing: I2C, SPI, and UART communication protocols.

Crucial for the growing tech industry and automation in local factories.`,
    lastStudied: '3d ago',
    deadline: 'Next Week'
  }
];

const WEEKLY_PROGRESS_DATA = [
  { day: 'Mon', hours: 2.5, score: 75 },
  { day: 'Tue', hours: 4.0, score: 82 },
  { day: 'Wed', hours: 1.5, score: 70 },
  { day: 'Thu', hours: 5.0, score: 90 },
  { day: 'Fri', hours: 3.5, score: 85 },
  { day: 'Sat', hours: 2.0, score: 78 },
  { day: 'Sun', hours: 4.5, score: 88 },
];

const MOTIVATIONAL_QUOTES = [
  { text: "The struggle you're in today is developing the strength you need for tomorrow.", author: "Unknown" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "Your hard work as a working student is an investment in your future self.", author: "QCU Mentor" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
  { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
  { text: "Believe in yourself and all that you are. Know that there is something inside you that is greater than any obstacle.", author: "Christian D. Larson" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" }
];

const DEFAULT_TIMER_TYPES: TimerType[] = [
  {
    id: 'normal',
    name: 'Normal',
    description: 'A simple countdown timer. Set your desired time and focus on your task until the timer runs out.',
    phases: [{ name: 'Focus', duration: 25, color: 'emerald' }]
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    description: 'The Pomodoro Technique breaks work into intervals, traditionally 25 minutes in length, separated by short 5-minute breaks. It helps maintain focus and prevents burnout.',
    phases: [
      { name: 'Work', duration: 25, color: 'emerald' },
      { name: 'Break', duration: 5, color: 'orange' }
    ]
  },
  {
    id: 'feynman',
    name: 'Feynman',
    description: 'The Feynman Technique involves studying a concept for 20 minutes, then spending 10 minutes trying to explain it simply, as if teaching a child. This exposes gaps in your understanding.',
    phases: [
      { name: 'Study', duration: 20, color: 'blue' },
      { name: 'Explain', duration: 10, color: 'purple' }
    ]
  }
];

// --- Components ---

const ProgressBar = ({ progress }: { progress: number }) => (
  <div className="w-full bg-zinc-200 rounded-full h-1.5 overflow-hidden">
    <motion.div 
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      className="bg-emerald-500 h-full"
    />
  </div>
);

type ViewState = 'dashboard' | 'module' | 'quiz' | 'flashcards' | 'progress' | 'schedule' | 'messages' | 'settings' | 'community' | 'dictionary' | 'ai-tutor' | 'rewards' | 'timer' | 'signin' | 'signup' | 'materials' | 'auth-landing';

const AuthLanding = ({ onSignIn, onSignUp }: { onSignIn: () => void, onSignUp: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="w-full max-w-md p-8 bg-white rounded-3xl border border-zinc-100 shadow-xl text-center"
  >
    <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto mb-6">
      <Sparkles size={40} />
    </div>
    <h1 className="text-3xl font-display font-bold text-zinc-900 mb-2">ShiftStudy Guide</h1>
    <p className="text-zinc-500 mb-8">Your high-efficiency academic coach for the working student life.</p>
    
    <div className="space-y-4">
      <button 
        onClick={onSignIn}
        className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
      >
        <LogIn size={20} />
        Log In
      </button>
      
      <button 
        onClick={onSignUp}
        className="w-full h-14 bg-white border-2 border-emerald-600 text-emerald-600 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
      >
        <UserPlus size={20} />
        Create Account
      </button>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-100"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-white px-2 text-zinc-400 font-bold">Or try the app</span>
        </div>
      </div>

      <button 
        onClick={() => {
          // Trigger a demo login state
          window.dispatchEvent(new CustomEvent('demo-login'));
        }}
        className="w-full h-12 bg-zinc-100 text-zinc-600 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all text-sm"
      >
        Continue as Guest
        <ArrowRight size={16} />
      </button>
    </div>
    
    <p className="mt-8 text-xs text-zinc-400">
      By continuing, you agree to our Terms of Service and Privacy Policy.
    </p>
  </motion.div>
);

export default function App() {
  const [view, setView] = useState<ViewState>('auth-landing');
  const [authEmail, setAuthEmail] = useState('');
  const [showSignupSuccess, setShowSignupSuccess] = useState(false);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [summaryLength, setSummaryLength] = useState<'short' | 'medium' | 'long'>('short');
  const [summaryAudience, setSummaryAudience] = useState<'high school' | 'university'>('university');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [flashcards, setFlashcards] = useState<{term: string, definition: string}[]>([]);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlashcardFlipped, setIsFlashcardFlipped] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [isQuizFinished, setIsQuizFinished] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [streak, setStreak] = useState(6);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessage[]>([
    { id: '1', recipient: 'Prof. Garcia', text: 'Can you clarify the supply curve shift?', status: 'queued', timestamp: '8:05 AM' }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [searchWord, setSearchWord] = useState('');
  const [definition, setDefinition] = useState<{definition: string, example: string} | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [tutorChat, setTutorChat] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [tutorInput, setTutorInput] = useState('');
  const [isTutorTyping, setIsTutorTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyQuote, setDailyQuote] = useState(MOTIVATIONAL_QUOTES[0]);
  const [quizTimer, setQuizTimer] = useState(300); // 5 minutes in seconds
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [weeklyProgressData, setWeeklyProgressData] = useState(WEEKLY_PROGRESS_DATA);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: 'Commute Study', description: 'Microeconomics Quiz', date: new Date(new Date().getFullYear(), new Date().getMonth(), 5).toISOString().split('T')[0], time: '07:30', color: 'emerald', type: 'study', completed: false },
    { id: '2', title: 'Work Shift', description: '5:00 PM - 10:00 PM', date: new Date(new Date().getFullYear(), new Date().getMonth(), 5).toISOString().split('T')[0], time: '17:00', color: 'orange', type: 'work', completed: false },
    { id: '3', title: 'Study Group', description: 'Library', date: new Date(new Date().getFullYear(), new Date().getMonth(), 12).toISOString().split('T')[0], time: '14:00', color: 'blue', type: 'study', completed: false },
    { id: '4', title: 'Exam Prep', description: 'Embedded Systems', date: new Date(new Date().getFullYear(), new Date().getMonth(), 18).toISOString().split('T')[0], time: '19:00', color: 'purple', type: 'study', completed: false },
    { id: '5', title: 'Project Meeting', description: 'Online', date: new Date(new Date().getFullYear(), new Date().getMonth(), 25).toISOString().split('T')[0], time: '20:00', color: 'rose', type: 'other', completed: false },
  ]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [newTaskColor, setNewTaskColor] = useState('emerald');
  const [newTaskType, setNewTaskType] = useState<'study' | 'work' | 'other'>('study');

  const [timerTypes, setTimerTypes] = useState<TimerType[]>(DEFAULT_TIMER_TYPES);
  const [modules, setModules] = useState<Module[]>(MOCK_MODULES);
  const [activeTimerId, setActiveTimerId] = useState<string>('pomodoro');
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [timerTimeLeft, setTimerTimeLeft] = useState(25 * 60);
  const [normalTimerInput, setNormalTimerInput] = useState(25);
  
  const [isManagingTimers, setIsManagingTimers] = useState(false);
  const [editingTimer, setEditingTimer] = useState<TimerType | null>(null);

  // Settings State
  const [audioQuality, setAudioQuality] = useState<'Standard' | 'High' | 'Ultra High'>('Ultra High');
  const [autoSync, setAutoSync] = useState(true);
  const [collaborativeNotes, setCollaborativeNotes] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [timerNotificationSound, setTimerNotificationSound] = useState<'Chime' | 'Bell' | 'Digital' | 'None'>(() => {
    return (localStorage.getItem('timerNotificationSound') as any) || 'Chime';
  });
  const [timerVibration, setTimerVibration] = useState(() => {
    const val = localStorage.getItem('timerVibration');
    return val !== null ? val === 'true' : true;
  });
  const [timerBackgroundNotifications, setTimerBackgroundNotifications] = useState(() => {
    const val = localStorage.getItem('timerBackgroundNotifications');
    return val !== null ? val === 'true' : true;
  });

  // Materials State
  const [files, setFiles] = useState<{id: string, name: string, url: string, size: number, type: string, file_path: string}[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notesCount, setNotesCount] = useState(0);

  // User Profile State
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Task Attachment State
  const [newTaskAttachment, setNewTaskAttachment] = useState<File | null>(null);
  const [newTaskAttachmentUrl, setNewTaskAttachmentUrl] = useState<string | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    setIsAuthLoading(true);
    console.log('[Auth] Initializing authentication check...');
    
    if (!supabase) {
      console.warn('[Auth] Supabase not configured. Auth features will be disabled.');
      setIsAuthLoading(false);
      return;
    }
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.log('[Auth] Active session found for:', session.user.id);
        setIsLoggedIn(true);
        fetchUserData(session.user.id);
      } else {
        console.log('[Auth] No active session found');
        setIsLoggedIn(false);
      }
      setIsAuthLoading(false);
    }).catch(err => {
      console.error('[Auth] Error getting session:', err);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] State changed event:', event);
      if (session) {
        console.log('[Auth] User session active:', session.user.id);
        setIsLoggedIn(true);
        fetchUserData(session.user.id);
      } else {
        console.log('[Auth] User session cleared');
        setIsLoggedIn(false);
        setTasks([]);
        setModules([]);
        setQueuedMessages([]);
      }
      setIsAuthLoading(false);
    });

    // Listen for OAuth success message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log('[Auth] OAuth success message received');
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            setIsLoggedIn(true);
            fetchUserData(session.user.id);
          }
        });
      }
    };

    window.addEventListener('message', handleMessage);

    const handleDemoLogin = () => {
      console.log('[Auth] Demo login triggered');
      setIsLoggedIn(true);
      setView('dashboard');
    };

    window.addEventListener('demo-login', handleDemoLogin);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('demo-login', handleDemoLogin);
    };
  }, []); // Remove [view] dependency to prevent re-loading on every click

  // Separate effect for redirection logic
  useEffect(() => {
    if (isAuthLoading) return;

    const publicViews = ['signin', 'signup', 'auth-landing'];
    if (isLoggedIn) {
      if (publicViews.includes(view)) {
        console.log('[Auth] Redirecting to Dashboard from public view');
        setView('dashboard');
      }
    } else {
      if (!publicViews.includes(view)) {
        console.log('[Auth] Redirecting to Auth Landing from private view');
        setView('auth-landing');
      }
    }
  }, [isLoggedIn, view, isAuthLoading]);

  useEffect(() => {
    let notesSubscription: any;
    
    const setupRealtime = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      notesSubscription = supabase
        .channel('notes_count_changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'notes',
          filter: `user_id=eq.${user.id}`
        }, () => {
          fetchNotesCount(user.id);
        })
        .subscribe();
    };

    if (isLoggedIn) {
      setupRealtime();
    }

    return () => {
      if (notesSubscription && supabase) {
        supabase.removeChannel(notesSubscription);
      }
    };
  }, [isLoggedIn]);

  const fetchUserData = async (userId: string) => {
    if (!supabase) return;
    console.log('[Data] Fetching user data for:', userId);
    try {
      // 1. Fetch Settings
      const { data: settings, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;
      
      if (settings) {
        console.log('[Data] Settings loaded');
        setStreak(settings.streak);
        setAudioQuality(settings.audio_quality);
        setAutoSync(settings.auto_sync);
        setCollaborativeNotes(settings.collaborative_notes);
        setDarkMode(settings.dark_mode);
        setWeeklyProgressData(settings.weekly_progress);
        
        if (settings.avatar_url) {
          const { data: signed } = await supabase.storage
            .from('app-files')
            .createSignedUrl(settings.avatar_url, 3600);
          setAvatarUrl(signed?.signedUrl || null);
        }
      } else {
        console.log('[Data] Creating default settings');
        await supabase.from('user_settings').insert([{
          user_id: userId,
          streak: 6,
          weekly_progress: WEEKLY_PROGRESS_DATA
        }]);
      }

      // 2. Fetch Tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (tasksError) throw tasksError;
      if (tasksData) {
        console.log('[Data] Tasks loaded:', tasksData.length);
        const tasksWithUrls = await Promise.all(tasksData.map(async (task) => {
          if (task.attachment_url) {
            const { data: signed } = await supabase.storage
              .from('app-files')
              .createSignedUrl(task.attachment_url, 3600);
            return { ...task, attachment_signed_url: signed?.signedUrl };
          }
          return task;
        }));
        setTasks(tasksWithUrls);
      }

      // 3. Fetch Messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('queued_messages')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (messagesError) throw messagesError;
      if (messagesData) {
        console.log('[Data] Messages loaded');
        setQueuedMessages(messagesData);
      }

      // 4. Fetch Timers
      const { data: timersData, error: timersError } = await supabase
        .from('timers')
        .select('*')
        .eq('user_id', userId);
      
      if (timersError) throw timersError;
      if (timersData && timersData.length > 0) {
        console.log('[Data] Timers loaded');
        setTimerTypes([...DEFAULT_TIMER_TYPES, ...timersData]);
      }

      // 5. Fetch Modules
      const { data: modulesData, error: modulesError } = await supabase
        .from('modules')
        .select('*')
        .eq('user_id', userId);
      
      if (modulesError) throw modulesError;
      if (modulesData && modulesData.length > 0) {
        console.log('[Data] Modules loaded');
        setModules(modulesData);
      } else {
        console.log('[Data] Seeding initial modules');
        const initialModules = MOCK_MODULES.map(m => ({ ...m, user_id: userId }));
        const { data: seeded } = await supabase.from('modules').insert(initialModules).select();
        if (seeded) setModules(seeded);
      }

      fetchFiles(userId);
      fetchNotesCount(userId);
      console.log('[Data] All user data fetch operations completed');
    } catch (err) {
      console.error('[Data] Error fetching user data:', err);
    }
  };

  const fetchNotesCount = async (userId: string) => {
    try {
      const { count, error } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      
      if (error) throw error;
      setNotesCount(count || 0);
    } catch (err) {
      console.error('Error fetching notes count:', err);
    }
  };

  const fetchFiles = async (userId: string) => {
    setIsFetchingFiles(true);
    try {
      // Fetch from materials table instead of just listing storage
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        const fileList = await Promise.all(data.map(async (file) => {
          const { data: signed } = await supabase.storage
            .from('app-files')
            .createSignedUrl(file.file_path, 3600);
          
          return {
            id: file.id,
            name: file.name,
            url: signed?.signedUrl || '',
            size: file.size,
            type: file.type,
            file_path: file.file_path
          };
        }));
        setFiles(fileList);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setIsFetchingFiles(false);
    }
  };

  const processFileUpload = async (file: File) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${user.id}/materials/${fileName}`;
      
      await uploadToStorage(filePath, file);
      
      // Save to materials table
      const { error: dbError } = await supabase.from('materials').insert([{
        user_id: user.id,
        name: file.name,
        file_path: filePath,
        size: file.size,
        type: file.type
      }]);
      
      if (dbError) throw dbError;
      
      fetchFiles(user.id);
      sendNotification('Upload Successful', { body: `${file.name} has been uploaded to your materials.` });
    } catch (err: any) {
      console.error('Error uploading file:', err);
      const errorMsg = err.message || JSON.stringify(err);
      alert(`Upload failed: ${errorMsg}\n\nIf it says a relation/table does not exist, you need to run the database setup SQL.`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFileUpload(file);
  };

  const handleDeleteFile = async (fileId: string, filePath: string) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('app-files')
        .remove([filePath]);
      
      if (storageError) throw storageError;
      
      // Delete from database
      const { error: dbError } = await supabase.from('materials').delete().eq('id', fileId);
      
      if (dbError) throw dbError;
      
      fetchFiles(user.id);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${user.id}/avatars/${fileName}`;
      
      await uploadToStorage(filePath, file);
      
      // Update user settings
      const { error: dbError } = await supabase
        .from('user_settings')
        .update({ avatar_url: filePath })
        .eq('user_id', user.id);
      
      if (dbError) throw dbError;
      
      // Get signed URL for display
      const { data: signed } = await supabase.storage
        .from('app-files')
        .createSignedUrl(filePath, 3600);
      
      setAvatarUrl(signed?.signedUrl || null);
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      alert(err.message || 'Failed to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const updateSettings = async (updates: any) => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('user_settings').update(updates).eq('user_id', user.id);
  };

  const sendNotification = (title: string, options?: NotificationOptions) => {
    if (!("Notification" in window)) {
      return;
    }
    if (Notification.permission === "granted") {
      new Notification(title, options);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, options);
        }
      });
    }
  };

  useEffect(() => {
    let interval: any;
    if (timerState === 'running' && timerTimeLeft > 0) {
      interval = setInterval(() => {
        setTimerTimeLeft(t => t - 1);
      }, 1000);
    } else if (timerTimeLeft === 0 && timerState === 'running') {
      const activeTimer = timerTypes.find(t => t.id === activeTimerId);
      if (activeTimer) {
        if (activeTimer.id === 'normal') {
          setTimerState('idle');
          sendNotification('Timer Complete', { body: 'Your focus session has ended.' });
        } else {
          const nextPhaseIndex = (currentPhaseIndex + 1) % activeTimer.phases.length;
          setCurrentPhaseIndex(nextPhaseIndex);
          setTimerTimeLeft(activeTimer.phases[nextPhaseIndex].duration * 60);
          if (nextPhaseIndex === 0) {
             setTimerState('idle');
             sendNotification('Timer Complete', { body: `You have completed all phases of ${activeTimer.name}.` });
          } else {
             sendNotification('Phase Complete', { body: `Starting next phase: ${activeTimer.phases[nextPhaseIndex].name}` });
          }
        }
      }
    }
    return () => clearInterval(interval);
  }, [timerState, timerTimeLeft, activeTimerId, currentPhaseIndex, timerTypes]);

  useEffect(() => {
    let interval: any;
    if (view === 'quiz' && !isQuizFinished && quizTimer > 0) {
      interval = setInterval(() => {
        setQuizTimer(t => t - 1);
      }, 1000);
    } else if (quizTimer === 0) {
      setIsQuizFinished(true);
    }
    return () => clearInterval(interval);
  }, [view, isQuizFinished, quizTimer]);

  useEffect(() => {
    let studyInterval: any;
    // Track study time when in module or active quiz
    if (view === 'module' || (view === 'quiz' && !isQuizFinished)) {
      studyInterval = setInterval(() => {
        setWeeklyProgressData(prev => {
          const newData = [...prev];
          const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
          // Increment by a small fraction (1 second = ~0.00027 hours)
          // Using a slightly larger value (0.01) for demonstration purposes so it updates visibly
          newData[todayIndex] = {
            ...newData[todayIndex],
            hours: Number((newData[todayIndex].hours + 0.01).toFixed(2))
          };
          return newData;
        });
      }, 1000); // Update every second for demo purposes
    }
    return () => {
      clearInterval(studyInterval);
      // Persist progress when stopping study
      if (view === 'module' || view === 'quiz') {
        updateSettings({ weekly_progress: weeklyProgressData });
      }
    };
  }, [view, isQuizFinished]);

  useEffect(() => {
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    setDailyQuote(MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length]);
  }, []);

  const handleModuleSelect = async (mod: Module) => {
    setSelectedModule(mod);
    setView('module');
    setSummary('Generating AI summary for your commute...');
    setIsGeneratingSummary(true);
    const result = await generateSummary(mod.title, mod.content, summaryLength, summaryAudience);
    setSummary(result || 'Summary unavailable.');
    setIsGeneratingSummary(false);
  };

  const handleRegenerateSummary = async () => {
    if (!selectedModule) return;
    setSummary('Generating AI summary for your commute...');
    setIsGeneratingSummary(true);
    const result = await generateSummary(selectedModule.title, selectedModule.content, summaryLength, summaryAudience);
    setSummary(result || 'Summary unavailable.');
    setIsGeneratingSummary(false);
  };

  const startFlashcards = async () => {
    if (!selectedModule) return;
    setView('flashcards');
    setCurrentFlashcardIndex(0);
    setIsFlashcardFlipped(false);
    setFlashcards([]);
    setIsGeneratingFlashcards(true);
    const result = await generateFlashcards(selectedModule.title, selectedModule.content);
    setFlashcards(result);
    setIsGeneratingFlashcards(false);
  };

  const startQuiz = async () => {
    if (!selectedModule) return;
    setView('quiz');
    setIsQuizFinished(false);
    setCurrentQuestion(0);
    setScore(0);
    setQuiz([]);
    setQuizTimer(300); // Reset timer to 5 mins
    setSelectedAnswer(null);
    setUserAnswers([]);
    const result = await generateQuiz(selectedModule.title, selectedModule.content);
    setQuiz(result);
  };

  const handleAnswer = (index: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    setUserAnswers(prev => [...prev, index]);
    if (index === quiz[currentQuestion].correctIndex) {
      setScore(s => s + 1);
    }
  };

  const nextQuestion = async () => {
    if (currentQuestion < quiz.length - 1) {
      setCurrentQuestion(c => c + 1);
      setSelectedAnswer(null);
    } else {
      setIsQuizFinished(true);
      // Update module readiness after quiz
      if (selectedModule) {
        // Calculate score percentage
        const scorePercentage = (score / quiz.length) * 100;
        let readinessChange = 0;
        
        if (scorePercentage >= 80) {
          readinessChange = 15; // Great score, big boost
        } else if (scorePercentage >= 50) {
          readinessChange = 5; // Okay score, small boost
        } else {
          readinessChange = -5; // Poor score, slight drop
        }

        const newReadiness = Math.max(0, Math.min(100, selectedModule.readiness + readinessChange));
        
        const { data: updated } = await supabase
          .from('modules')
          .update({ readiness: newReadiness, last_studied: 'Just now' })
          .eq('id', selectedModule.id)
          .select()
          .single();
        
        if (updated) {
          setModules(modules.map(m => m.id === updated.id ? updated : m));
          setSelectedModule(updated);
        }
      }
    }
  };

  const handleSendMessage = async () => {
    if (!supabase) return;
    if (!newMessage.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const msg = {
      user_id: user.id,
      recipient: 'Prof. Garcia',
      text: newMessage,
      status: 'queued',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const { data, error } = await supabase.from('queued_messages').insert([msg]).select().single();
    if (data) {
      setQueuedMessages([data, ...queuedMessages]);
      setNewMessage('');
    }
  };

  const handleSearchDefinition = async () => {
    if (!searchWord.trim()) return;
    setIsSearching(true);
    const result = await defineWord(searchWord);
    setDefinition(result);
    setIsSearching(false);
  };

  const handleTutorChat = async () => {
    if (!tutorInput.trim()) return;
    const userMsg = tutorInput;
    const newChat = [...tutorChat, { role: 'user', text: userMsg }];
    setTutorChat(newChat);
    setTutorInput('');
    setIsTutorTyping(true);
    
    const context = selectedModule ? `Studying ${selectedModule.title}` : 'General study session';
    const response = await chatWithTutor(newChat, context);
    
    setTutorChat(prev => [...prev, { role: 'ai', text: response || 'I am here to help!' }]);
    setIsTutorTyping(false);
  };

  const handleListen = async () => {
    if (!summary || isListening) return;
    setIsListening(true);
    const base64 = await generateSpeech(summary);
    if (base64) {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audio.onended = () => setIsListening(false);
      audio.play();
    } else {
      setIsListening(false);
    }
  };

  const handleDragOverAttachment = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAttachment(true);
  };

  const handleDragLeaveAttachment = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAttachment(false);
  };

  const handleDropAttachment = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAttachment(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setNewTaskAttachment(file);
  };

  const handleAddTask = async () => {
    if (!supabase) return;
    if (!newTaskTitle.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    let attachmentPath = null;
    if (newTaskAttachment) {
      setIsUploadingAttachment(true);
      try {
        const fileExt = newTaskAttachment.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        attachmentPath = `${user.id}/tasks/${fileName}`;
        
        await uploadToStorage(attachmentPath, newTaskAttachment);
      } catch (err: any) {
        console.error('Error uploading task attachment:', err);
        alert(err.message || 'Failed to upload task attachment.');
        attachmentPath = null;
      } finally {
        setIsUploadingAttachment(false);
      }
    }

    if (editingTaskId) {
      const updates: any = {
        title: newTaskTitle,
        date: newTaskDate,
        time: newTaskTime,
        color: newTaskColor,
        type: newTaskType
      };
      
      if (attachmentPath) updates.attachment_url = attachmentPath;
      
      const { data } = await supabase.from('tasks').update(updates).eq('id', editingTaskId).select().single();
      if (data) {
        // Get signed URL
        if (data.attachment_url) {
          const { data: signed } = await supabase.storage.from('app-files').createSignedUrl(data.attachment_url, 3600);
          data.attachment_signed_url = signed?.signedUrl;
        }
        setTasks(tasks.map(t => t.id === editingTaskId ? data : t));
      }
    } else {
      const newTask = {
        user_id: user.id,
        title: newTaskTitle,
        description: '',
        date: newTaskDate,
        time: newTaskTime,
        color: newTaskColor,
        type: newTaskType,
        completed: false,
        attachment_url: attachmentPath
      };
      
      const { data } = await supabase.from('tasks').insert([newTask]).select().single();
      if (data) {
        // Get signed URL
        if (data.attachment_url) {
          const { data: signed } = await supabase.storage.from('app-files').createSignedUrl(data.attachment_url, 3600);
          data.attachment_signed_url = signed?.signedUrl;
        }
        setTasks([data, ...tasks]);
      }
    }
    
    setIsAddingTask(false);
    setEditingTaskId(null);
    setNewTaskTitle('');
    setNewTaskDate(new Date().toISOString().split('T')[0]);
    setNewTaskTime('09:00');
    setNewTaskColor('emerald');
    setNewTaskType('study');
    setNewTaskAttachment(null);
    setNewTaskAttachmentUrl(null);
  };

  const openEditTask = async (task: any) => {
    setEditingTaskId(task.id);
    setNewTaskTitle(task.title);
    setNewTaskDate(task.date);
    setNewTaskTime(task.time);
    setNewTaskColor(task.color);
    setNewTaskType(task.type);
    setNewTaskAttachmentUrl(task.attachment_signed_url || null);
    setIsAddingTask(true);
  };

  const toggleTaskCompletion = async (taskId: string) => {
    if (!supabase) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const { data } = await supabase.from('tasks').update({ completed: !task.completed }).eq('id', taskId).select().single();
    if (data) {
      setTasks(tasks.map(t => t.id === taskId ? data : t));
    }
  };

  const colorMap: Record<string, { bg: string, text: string, border: string, dot: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100', dot: 'bg-emerald-500' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100', dot: 'bg-orange-500' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', dot: 'bg-blue-500' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100', dot: 'bg-purple-500' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-100', dot: 'bg-rose-500' },
  };

  const selectedDateString = new Date(selectedDate.getTime() - selectedDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  const selectedDateTasks = tasks.filter(t => t.date === selectedDateString).sort((a, b) => a.time.localeCompare(b.time));

  if (isAuthLoading) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 animate-pulse shadow-sm">
          <Bot size={32} />
        </div>
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-500 font-bold text-sm animate-pulse tracking-tight">Initializing your learning space...</p>
      </div>
    );
  }

  return (
    <div className={`max-w-md mx-auto min-h-screen flex flex-col shadow-2xl relative overflow-hidden font-sans transition-colors duration-300 ${darkMode ? 'bg-zinc-900 text-zinc-100' : 'bg-zinc-50 text-zinc-900'}`}>
      
      {/* Demo Mode Banner */}
      {!isConfigured && isLoggedIn && (
        <div className="bg-orange-500 text-white text-[10px] font-bold py-1 px-4 flex items-center justify-between z-[60]">
          <span>DEMO MODE: DATABASE NOT CONFIGURED</span>
          <button onClick={() => setView('settings')} className="underline">FIX IN SETTINGS</button>
        </div>
      )}

      {/* Header */}
      {isLoggedIn && (
        <header className={`p-6 pt-12 flex justify-between items-center border-b transition-colors ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
          <div onClick={() => setView('dashboard')} className="cursor-pointer flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-500/20">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <User size={20} />
                </div>
              )}
            </div>
            <div>
              <h1 className={`text-xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>QCU Hub</h1>
              <div className="flex items-center gap-2">
                <p className={`text-[10px] transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Working Student Hub</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100">
              <Flame size={16} className="text-orange-500 fill-orange-500" />
              <span className="text-sm font-bold text-orange-600">{streak}</span>
            </div>
            <button 
              onClick={() => setView('rewards')}
              className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500 border border-orange-100 active:scale-95 transition-transform"
            >
              <Star size={20} fill="currentColor" />
            </button>
          </div>
        </header>
      )}

      {/* Sub-header Quick Actions (Thumb-friendly) */}
      {isLoggedIn && (
        <div className={`px-6 py-4 border-b transition-colors ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-50'}`}>
          <div className="grid grid-cols-4 gap-2">
            <button 
              onClick={() => setView('materials')} 
              className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border active:scale-95 transition-all group ${darkMode ? 'bg-zinc-800 border-zinc-700 hover:border-emerald-500/50' : 'bg-zinc-50 border-zinc-100'}`}
            >
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Book size={20} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Materials</span>
            </button>
            <button 
              onClick={() => setView('ai-tutor')} 
              className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border active:scale-95 transition-all group ${darkMode ? 'bg-zinc-800 border-zinc-700 hover:border-blue-500/50' : 'bg-zinc-50 border-zinc-100'}`}
            >
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Bot size={20} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>AI Tutor</span>
            </button>
            <button 
              onClick={() => setView('community')} 
              className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border active:scale-95 transition-all group ${darkMode ? 'bg-zinc-800 border-zinc-700 hover:border-purple-500/50' : 'bg-zinc-50 border-zinc-100'}`}
            >
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Users size={20} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Community</span>
            </button>
            <button 
              onClick={() => setView('timer')} 
              className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border active:scale-95 transition-all group ${darkMode ? 'bg-zinc-800 border-zinc-700 hover:border-orange-500/50' : 'bg-zinc-50 border-zinc-100'}`}
            >
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                <Timer size={20} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Timer</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 pb-24">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pb-24"
            >
              {/* Rewards Banner (Thumb-friendly) */}
              <button 
                onClick={() => setView('rewards')}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 p-5 rounded-3xl text-white flex items-center justify-between shadow-lg active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Flame size={28} />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Streak Reward</p>
                    <p className="text-base font-bold">1 more day for a Free Week!</p>
                  </div>
                </div>
                <ChevronRight size={24} />
              </button>

              {/* Daily Motivational Quote */}
              <div className={`p-6 rounded-3xl border shadow-sm relative overflow-hidden transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <Quote size={40} className={`absolute -right-2 -top-2 opacity-50 ${darkMode ? 'text-zinc-700' : 'text-zinc-50'}`} />
                <div className="relative z-10">
                  <p className={`font-medium leading-relaxed mb-3 transition-colors ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>
                    "{dailyQuote.text}"
                  </p>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">— {dailyQuote.author}</p>
                </div>
              </div>

              {/* Daily Goal Card (Concept D: The Hook) */}
              <div className="bg-zinc-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
                <div className="flex justify-between items-start relative z-10 mb-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">Daily Goal Met!</h2>
                    <p className="text-zinc-400 text-sm">You've completed 70% of your daily goal.</p>
                  </div>
                  {!isOffline && (
                    <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-1 rounded-full border border-emerald-500/30">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Auto-Syncing</span>
                    </div>
                  )}
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="w-full bg-zinc-800 rounded-full h-2">
                        <div className="bg-emerald-400 h-full rounded-full w-[70%]" />
                      </div>
                    </div>
                    <span className="text-emerald-400 font-bold">70%</span>
                  </div>
                </div>
                <Zap className="absolute -right-4 -bottom-4 text-zinc-800 w-32 h-32 rotate-12" />
              </div>

              {/* Readiness Summary Visualizer (Immediate Validation) */}
              <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`font-bold text-sm uppercase tracking-wider flex items-center gap-2 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-400'}`}>
                    <Zap size={14} className="text-orange-500" /> Exam Readiness
                  </h3>
                  <button onClick={() => setView('progress')} className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>Details</button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className={`transition-colors ${darkMode ? 'text-zinc-700' : 'text-zinc-100'}`} />
                      <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={226} strokeDashoffset={226 - (226 * 75) / 100} className="text-emerald-500" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-lg font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>75%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className={`text-sm font-bold transition-colors ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>Overall Readiness</p>
                    <p className={`text-xs leading-tight transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>You are 15% more ready than last week. Keep it up!</p>
                  </div>
                </div>
              </div>

              {/* Upcoming Deadlines (Concept A: AI Organizer) */}
              <section className={`p-4 rounded-2xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <h3 className={`font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-400'}`}>
                  <Calendar size={14} /> Upcoming Deadlines
                </h3>
                <div className="space-y-3">
                  {modules.filter(m => m.deadline).map(m => (
                    <div key={m.id} className={`flex justify-between items-center p-2 rounded-lg transition-colors cursor-pointer ${darkMode ? 'hover:bg-zinc-700' : 'hover:bg-zinc-50'}`} onClick={() => handleModuleSelect(m)}>
                      <div>
                        <p className={`font-bold text-sm transition-colors ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>{m.title}</p>
                        <p className="text-xs text-orange-600 font-semibold">{m.deadline}</p>
                      </div>
                      <button className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                        <Play size={14} fill="currentColor" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Modules List (Concept C: Sync Scheduler) */}
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`font-display font-bold text-lg transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Your Modules</h3>
                  <button onClick={() => setIsOffline(!isOffline)} className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors ${isOffline ? (darkMode ? 'bg-orange-900/30 border-orange-800 text-orange-400' : 'bg-orange-50 border-orange-200 text-orange-700') : (darkMode ? 'bg-emerald-900/30 border-emerald-800 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700')}`}>
                    {isOffline ? 'Offline Mode' : 'Online'}
                  </button>
                </div>
                <div className="space-y-4">
                  {modules.map((mod) => (
                    <button 
                      key={mod.id}
                      onClick={() => handleModuleSelect(mod)}
                      className={`w-full text-left p-6 rounded-3xl border shadow-sm transition-all active:scale-[0.98] group ${darkMode ? 'bg-zinc-800 border-zinc-700 hover:border-emerald-500/50' : 'bg-white border-zinc-100 hover:border-emerald-200'}`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{mod.subject}</p>
                          <h4 className={`text-lg font-bold transition-colors leading-tight ${darkMode ? 'text-white group-hover:text-emerald-400' : 'text-zinc-900 group-hover:text-emerald-700'}`}>{mod.title}</h4>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${darkMode ? 'bg-zinc-700 text-zinc-400 group-hover:text-emerald-400' : 'bg-zinc-50 text-zinc-300 group-hover:text-emerald-500'}`}>
                            <ChevronRight size={24} />
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mb-4">
                        <div className={`flex items-center gap-3 text-xs transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${darkMode ? 'bg-zinc-700' : 'bg-zinc-50'}`}><Clock size={12} /> {mod.lastStudied}</span>
                          <span className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${darkMode ? 'bg-zinc-700' : 'bg-zinc-50'}`}><BookOpen size={12} /> {mod.progress}%</span>
                        </div>
                        <div className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${mod.readiness >= 80 ? (darkMode ? 'bg-emerald-900/30 border-emerald-800 text-emerald-400' : 'bg-emerald-50 border-emerald-100 text-emerald-700') : (darkMode ? 'bg-orange-900/30 border-orange-800 text-orange-400' : 'bg-orange-50 border-orange-100 text-orange-700')}`}>
                          {mod.readiness}% Exam Ready
                        </div>
                      </div>
                      
                      <ProgressBar progress={mod.progress} />
                    </button>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {view === 'module' && selectedModule && (
            <motion.div 
              key="module"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <button 
                onClick={() => setView('dashboard')}
                className={`flex items-center gap-2 font-semibold text-sm mb-2 transition-colors ${darkMode ? 'text-zinc-400 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <ArrowLeft size={16} /> Back to Modules
              </button>
              
              <div className="space-y-4">
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{selectedModule.title}</h2>
                
                {/* AI Summary Card (Concept A: AI Organizer) */}
                <div className={`p-6 rounded-3xl border relative overflow-hidden transition-colors ${darkMode ? 'bg-emerald-900/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="flex flex-col gap-3 mb-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles size={18} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                        <h3 className={`font-bold transition-colors ${darkMode ? 'text-emerald-400' : 'text-emerald-900'}`}>AI Commute Summary</h3>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <select 
                        value={summaryLength}
                        onChange={(e) => setSummaryLength(e.target.value as 'short' | 'medium' | 'long')}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border outline-none transition-colors ${darkMode ? 'bg-zinc-800 border-emerald-800/50 text-emerald-300 focus:border-emerald-500' : 'bg-white border-emerald-200 text-emerald-700 focus:border-emerald-500'}`}
                      >
                        <option value="short">Short (~100 words)</option>
                        <option value="medium">Medium (~200 words)</option>
                        <option value="long">Long (~400 words)</option>
                      </select>
                      
                      <select 
                        value={summaryAudience}
                        onChange={(e) => setSummaryAudience(e.target.value as 'high school' | 'university')}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg border outline-none transition-colors ${darkMode ? 'bg-zinc-800 border-emerald-800/50 text-emerald-300 focus:border-emerald-500' : 'bg-white border-emerald-200 text-emerald-700 focus:border-emerald-500'}`}
                      >
                        <option value="high school">High School Level</option>
                        <option value="university">University Level</option>
                      </select>
                      
                      <button 
                        onClick={handleRegenerateSummary}
                        disabled={isGeneratingSummary}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50 ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                      >
                        {isGeneratingSummary ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Regenerate
                      </button>
                    </div>
                  </div>
                  <p className={`leading-relaxed italic relative z-10 transition-colors ${darkMode ? 'text-emerald-200/80' : 'text-emerald-800'}`}>
                    "{summary}"
                  </p>
                  <div className="flex gap-2 mt-4 relative z-10">
                    <button 
                      onClick={handleListen}
                      disabled={isListening}
                      className={`flex-1 flex items-center justify-center gap-2 font-bold text-sm px-4 py-3 rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50 ${darkMode ? 'bg-zinc-800 text-emerald-400 hover:bg-zinc-700' : 'bg-white text-emerald-700 hover:bg-emerald-50'}`}
                    >
                      {isListening ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                      {isListening ? 'Speaking...' : 'Listen'}
                    </button>
                    <button className={`p-3 rounded-xl shadow-sm active:scale-95 transition-all ${darkMode ? 'bg-zinc-800 text-emerald-400 hover:bg-zinc-700' : 'bg-white text-emerald-700 hover:bg-emerald-50'}`}>
                      <Share2 size={18} />
                    </button>
                  </div>
                  <Sparkles className={`absolute -right-6 -top-6 w-24 h-24 transition-colors ${darkMode ? 'text-emerald-900/30' : 'text-emerald-100'}`} />
                </div>

                <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                  <h3 className={`font-bold mb-3 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Full Content</h3>
                  <p className={`text-sm leading-relaxed transition-colors ${darkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>
                    {selectedModule.content}
                  </p>
                </div>

                {/* Concept D: The Action */}
                <div className="flex gap-3">
                  <button 
                    onClick={startFlashcards}
                    className={`flex-1 h-16 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${darkMode ? 'bg-zinc-800 text-emerald-400 hover:bg-zinc-700' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                  >
                    <BookOpen size={20} />
                    Flashcards
                  </button>
                  <button 
                    onClick={startQuiz}
                    className={`flex-1 h-16 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                  >
                    <Play size={20} fill="currentColor" />
                    Quiz
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'quiz' && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="h-full flex flex-col"
            >
              {!isQuizFinished ? (
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-8">
                    <div className="flex flex-col">
                      <span className={`font-bold text-xs transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>Question {currentQuestion + 1} of {quiz.length || 3}</span>
                      <div className={`flex items-center gap-1 font-mono font-bold text-sm transition-colors ${quizTimer < 60 ? 'text-red-500 animate-pulse' : (darkMode ? 'text-zinc-400' : 'text-zinc-600')}`}>
                        <Clock size={14} />
                        {Math.floor(quizTimer / 60)}:{(quizTimer % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <button onClick={() => setView('module')} className={`transition-colors ${darkMode ? 'text-zinc-500 hover:text-zinc-400' : 'text-zinc-400 hover:text-zinc-600'}`}><Settings size={20} /></button>
                  </div>

                  {quiz.length > 0 ? (
                    <div className="flex-1 flex flex-col">
                      <h2 className={`text-2xl font-display font-bold mb-12 leading-tight transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                        {quiz[currentQuestion].question}
                      </h2>

                      {/* Concept D: Large thumb-friendly buttons */}
                      <div className="space-y-4 mt-auto">
                        {quiz[currentQuestion].options.map((option, idx) => {
                          const isSelected = selectedAnswer === idx;
                          const isCorrect = idx === quiz[currentQuestion].correctIndex;
                          const showResult = selectedAnswer !== null;
                          
                          let buttonClass = `thumb-button border-2 text-left px-6 justify-start transition-all ${darkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-emerald-500/50 hover:bg-emerald-900/20' : 'bg-white border-zinc-100 text-zinc-700 hover:border-emerald-500 hover:bg-emerald-50'}`;
                          
                          if (showResult) {
                            if (isCorrect) {
                              buttonClass = `thumb-button border-2 text-left px-6 justify-start transition-all ${darkMode ? 'bg-emerald-900/40 border-emerald-500 text-emerald-300' : 'bg-emerald-50 border-emerald-500 text-emerald-700'}`;
                            } else if (isSelected) {
                              buttonClass = `thumb-button border-2 text-left px-6 justify-start transition-all ${darkMode ? 'bg-red-900/40 border-red-500 text-red-300' : 'bg-red-50 border-red-500 text-red-700'}`;
                            } else {
                              buttonClass = `thumb-button border-2 text-left px-6 justify-start transition-all opacity-50 ${darkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-zinc-50 border-zinc-200 text-zinc-400'}`;
                            }
                          }

                          return (
                            <button 
                              key={idx}
                              onClick={() => handleAnswer(idx)}
                              disabled={showResult}
                              className={buttonClass}
                            >
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 font-bold text-sm transition-colors ${showResult && isCorrect ? 'bg-emerald-500 text-white' : showResult && isSelected ? 'bg-red-500 text-white' : darkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                                {String.fromCharCode(65 + idx)}
                              </span>
                              {option}
                              {showResult && isCorrect && <CheckCircle2 className="ml-auto text-emerald-500" size={20} />}
                              {showResult && isSelected && !isCorrect && <X className="ml-auto text-red-500" size={20} />}
                            </button>
                          );
                        })}
                      </div>
                      
                      {selectedAnswer !== null && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`mt-6 p-4 rounded-2xl border ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-blue-50 border-blue-100'}`}
                        >
                          <div className="flex items-start gap-3">
                            <Sparkles className={`mt-1 shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} size={18} />
                            <div>
                              <h4 className={`font-bold text-sm mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>Explanation</h4>
                              <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-blue-900/80'}`}>
                                {quiz[currentQuestion].explanation || "No explanation provided."}
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={nextQuestion}
                            className={`mt-4 w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${darkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                          >
                            {currentQuestion < quiz.length - 1 ? 'Next Question' : 'Finish Quiz'}
                            <ChevronRight size={18} />
                          </button>
                        </motion.div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      <p className={`font-medium transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Preparing your micro-quiz...</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="flex-1 overflow-y-auto pb-6 space-y-8 hide-scrollbar">
                    <div className="flex flex-col items-center justify-center text-center space-y-4 pt-8">
                      <div className="relative">
                        <svg className="w-32 h-32 transform -rotate-90">
                          <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" className={darkMode ? 'text-zinc-800' : 'text-zinc-100'} />
                          <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={351.86} strokeDashoffset={351.86 - (351.86 * score) / Math.max(1, quiz.length)} className="text-emerald-500 transition-all duration-1000 ease-out" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={`text-4xl font-display font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{score}</span>
                          <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>out of {quiz.length}</span>
                        </div>
                      </div>
                      <h2 className={`text-3xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Quiz Complete!</h2>
                      <p className={`transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Great job reinforcing your knowledge during your commute!</p>
                      
                      <div className={`p-4 rounded-2xl border w-full max-w-sm transition-colors ${darkMode ? 'bg-orange-900/20 border-orange-800/50' : 'bg-orange-50 border-orange-100'}`}>
                        <p className={`font-bold flex items-center justify-center gap-2 transition-colors ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                          <Flame size={20} className="fill-orange-500 text-orange-500" />
                          Streak Maintained: {streak} Days
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6 mt-8">
                      <h3 className={`font-display font-bold text-xl px-2 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Review Answers</h3>
                      {quiz.map((q, idx) => {
                        const userAnswer = userAnswers[idx];
                        const isCorrect = userAnswer === q.correctIndex;
                        const isUnanswered = userAnswer === undefined || userAnswer === null;

                        return (
                          <div key={idx} className={`p-5 rounded-2xl border ${darkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-white border-zinc-200'} space-y-4`}>
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isCorrect ? 'bg-emerald-500 text-white' : isUnanswered ? 'bg-zinc-500 text-white' : 'bg-red-500 text-white'}`}>
                                {isCorrect ? <CheckCircle2 size={14} /> : isUnanswered ? <span className="text-xs font-bold">-</span> : <X size={14} />}
                              </div>
                              <div>
                                <h4 className={`font-bold text-sm mb-1 ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>Question {idx + 1}</h4>
                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{q.question}</p>
                              </div>
                            </div>
                            
                            <div className="pl-9 space-y-3">
                              <div className="space-y-2">
                                {q.options.map((opt, optIdx) => {
                                  const isThisCorrect = optIdx === q.correctIndex;
                                  const isThisSelected = optIdx === userAnswer;
                                  
                                  let optClass = `p-3 rounded-xl border text-sm ${darkMode ? 'bg-zinc-800 border-zinc-700 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}`;
                                  
                                  if (isThisCorrect) {
                                    optClass = `p-3 rounded-xl border text-sm font-medium ${darkMode ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`;
                                  } else if (isThisSelected) {
                                    optClass = `p-3 rounded-xl border text-sm font-medium ${darkMode ? 'bg-red-900/30 border-red-500/50 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`;
                                  }
                                  
                                  return (
                                    <div key={optIdx} className={optClass}>
                                      <div className="flex justify-between items-center">
                                        <span>{opt}</span>
                                        {isThisCorrect && <CheckCircle2 size={16} className="text-emerald-500" />}
                                        {isThisSelected && !isThisCorrect && <X size={16} className="text-red-500" />}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className={`mt-4 p-4 rounded-xl border ${darkMode ? 'bg-blue-900/20 border-blue-800/50' : 'bg-blue-50 border-blue-100'}`}>
                                <div className="flex items-start gap-2">
                                  <Sparkles className={`mt-0.5 shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} size={16} />
                                  <div>
                                    <h5 className={`font-bold text-xs mb-1 uppercase tracking-wider ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>Explanation</h5>
                                    <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-300' : 'text-blue-900/80'}`}>
                                      {q.explanation || "No explanation provided."}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className={`pt-4 mt-auto border-t ${darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-100 bg-zinc-50'}`}>
                    <button 
                      onClick={() => setView('dashboard')}
                      className={`w-full h-14 rounded-2xl font-bold transition-all active:scale-95 ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                    >
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'flashcards' && (
            <motion.div
              key="flashcards"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="h-full flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <button 
                  onClick={() => setView('module')}
                  className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-white text-zinc-500 hover:text-zinc-900 shadow-sm'}`}
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                  <BookOpen size={20} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                  <span className={`font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Flashcards</span>
                </div>
                <div className="w-10"></div>
              </div>

              {isGeneratingFlashcards ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center animate-pulse ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-100'}`}>
                    <Sparkles size={32} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                  </div>
                  <p className={`font-medium animate-pulse ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>AI is extracting key terms...</p>
                </div>
              ) : flashcards.length > 0 ? (
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4 px-2">
                    <span className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Card {currentFlashcardIndex + 1} of {flashcards.length}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-lg ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                      Tap to flip
                    </span>
                  </div>

                  <div 
                    className="flex-1 relative cursor-pointer"
                    style={{ perspective: '1000px' }}
                    onClick={() => setIsFlashcardFlipped(!isFlashcardFlipped)}
                  >
                    <motion.div
                      className="w-full h-full absolute"
                      style={{ transformStyle: 'preserve-3d' }}
                      animate={{ rotateY: isFlashcardFlipped ? 180 : 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    >
                      {/* Front */}
                      <div 
                        className={`absolute w-full h-full rounded-3xl border-2 flex flex-col items-center justify-center p-8 text-center shadow-sm ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        <h3 className={`text-3xl font-display font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                          {flashcards[currentFlashcardIndex].term}
                        </h3>
                      </div>

                      {/* Back */}
                      <div 
                        className={`absolute w-full h-full rounded-3xl border-2 flex flex-col items-center justify-center p-8 text-center shadow-sm ${darkMode ? 'bg-emerald-900/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-100'}`}
                        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                      >
                        <p className={`text-lg leading-relaxed font-medium ${darkMode ? 'text-emerald-100' : 'text-emerald-900'}`}>
                          {flashcards[currentFlashcardIndex].definition}
                        </p>
                      </div>
                    </motion.div>
                  </div>

                  <div className="flex items-center justify-between mt-8 gap-4">
                    <button 
                      onClick={() => {
                        setIsFlashcardFlipped(false);
                        setTimeout(() => setCurrentFlashcardIndex(prev => Math.max(0, prev - 1)), 150);
                      }}
                      disabled={currentFlashcardIndex === 0}
                      className={`flex-1 h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${darkMode ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50'}`}
                    >
                      <ArrowLeft size={20} />
                      Previous
                    </button>
                    <button 
                      onClick={() => {
                        setIsFlashcardFlipped(false);
                        setTimeout(() => setCurrentFlashcardIndex(prev => Math.min(flashcards.length - 1, prev + 1)), 150);
                      }}
                      disabled={currentFlashcardIndex === flashcards.length - 1}
                      className={`flex-1 h-14 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                    >
                      Next
                      <ArrowRight size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${darkMode ? 'bg-red-900/30' : 'bg-red-100'}`}>
                    <X size={32} className={darkMode ? 'text-red-400' : 'text-red-600'} />
                  </div>
                  <p className={`font-medium ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Could not generate flashcards.</p>
                  <button 
                    onClick={startFlashcards}
                    className={`px-6 py-3 rounded-xl font-bold transition-all active:scale-95 ${darkMode ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-white border border-zinc-200 text-zinc-900 hover:bg-zinc-50'}`}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'progress' && (
            <motion.div 
              key="progress"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pb-24"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className={`p-2 rounded-xl shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300' : 'bg-white text-zinc-600 hover:text-zinc-900'}`}><ArrowLeft size={20} /></button>
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Your Progress</h2>
              </div>
              
              {/* Weekly Progress Graph using Recharts */}
              <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <h3 className={`font-bold mb-6 flex items-center gap-2 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                  <BarChart3 size={18} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                  Weekly Study Hours
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyProgressData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#3f3f46' : '#f4f4f5'} />
                      <XAxis 
                        dataKey="day" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 600, fill: darkMode ? '#a1a1aa' : '#a1a1aa' }} 
                      />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{ fill: darkMode ? '#27272a' : '#f8fafc' }}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: darkMode ? '#18181b' : '#ffffff', color: darkMode ? '#ffffff' : '#000000' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Bar 
                        dataKey="hours" 
                        radius={[6, 6, 0, 0]}
                        barSize={32}
                      >
                        {weeklyProgressData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1) ? (darkMode ? '#34d399' : '#10b981') : (darkMode ? '#3f3f46' : '#e2e8f0')} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full transition-colors ${darkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Current Week</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full transition-colors ${darkMode ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Average</span>
                  </div>
                </div>
              </div>

              {/* Exam Readiness Visualizer */}
              <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <h3 className={`font-bold mb-4 flex items-center gap-2 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                  <Zap size={18} className="text-orange-500" />
                  Exam Readiness Score
                </h3>
                <div className="space-y-4">
                  {modules.map(mod => (
                    <div key={mod.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-bold transition-colors ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>{mod.title}</span>
                        <span className={`text-xs font-bold transition-colors ${mod.readiness >= 80 ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') : 'text-orange-500'}`}>{mod.readiness}%</span>
                      </div>
                      <div className={`w-full rounded-full h-2 overflow-hidden transition-colors ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}>
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${mod.readiness}%` }}
                          className={`h-full rounded-full transition-colors ${mod.readiness >= 80 ? (darkMode ? 'bg-emerald-400' : 'bg-emerald-500') : 'bg-orange-400'}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mt-6 p-4 rounded-2xl border transition-colors ${darkMode ? 'bg-emerald-900/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-100'}`}>
                  <p className={`text-xs font-medium leading-relaxed transition-colors ${darkMode ? 'text-emerald-200' : 'text-emerald-800'}`}>
                    <span className="font-bold">Pro Tip:</span> You're ready for the <span className="font-bold">Embedded Systems</span> exam! Focus on Structural Analysis next to boost your overall readiness.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-2xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-1 text-center">Total Notes</p>
                  <p className={`text-2xl font-display font-bold text-center transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{notesCount}</p>
                </div>
                <div className={`p-4 rounded-2xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                  <p className="text-zinc-400 text-xs font-bold uppercase mb-1 text-center">Study Hours</p>
                  <p className={`text-2xl font-display font-bold text-center transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{weeklyProgressData.reduce((acc, curr) => acc + curr.hours, 0).toFixed(1)}h</p>
                </div>
              </div>

              <div className={`p-6 rounded-3xl shadow-lg transition-colors ${darkMode ? 'bg-emerald-900/40 border border-emerald-800/50 text-emerald-100' : 'bg-emerald-600 text-white'}`}>
                <h3 className="font-bold mb-2">Keep it up!</h3>
                <p className={`text-sm transition-colors ${darkMode ? 'text-emerald-200/80' : 'text-emerald-100'}`}>You're in the top 5% of working students this week. Your consistency is paying off.</p>
              </div>
            </motion.div>
          )}

          {view === 'schedule' && (
            <motion.div 
              key="schedule"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Agenda</h2>
                <button 
                  onClick={() => {
                    setNewTaskDate(new Date(selectedDate.getTime() - selectedDate.getTimezoneOffset() * 60000).toISOString().split('T')[0]);
                    setIsAddingTask(true);
                  }}
                  className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <PlusCircle size={24} />
                </button>
              </div>
              
              {/* Enhanced Calendar View */}
              <div className={`p-4 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className={`font-bold text-sm transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1))}
                      className={`p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button 
                      onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1))}
                      className={`p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['S', 'M', 'T', 'W', 'Th', 'F', 'S'].map((d, i) => (
                    <div key={`${d}-${i}`} className={`text-center text-[10px] font-bold transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).getDay() }).map((_, i) => (
                    <div key={`blank-${i}`} className="py-2"></div>
                  ))}
                  {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                    const day = i + 1;
                    const isToday = day === new Date().getDate() && selectedDate.getMonth() === new Date().getMonth() && selectedDate.getFullYear() === new Date().getFullYear();
                    const isSelected = day === selectedDate.getDate();
                    
                    const cellDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                    const cellDateString = new Date(cellDate.getTime() - cellDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                    const dayTasks = tasks.filter(t => t.date === cellDateString);
                    
                    return (
                      <button 
                        key={i} 
                        onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day))}
                        className={`relative flex flex-col items-center py-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-zinc-700' : 'hover:bg-zinc-50'}`}
                      >
                        <span className={`text-xs font-medium ${isToday ? 'bg-emerald-600 text-white w-6 h-6 flex items-center justify-center rounded-full' : isSelected ? (darkMode ? 'bg-white text-zinc-900 w-6 h-6 flex items-center justify-center rounded-full' : 'bg-zinc-900 text-white w-6 h-6 flex items-center justify-center rounded-full') : (darkMode ? 'text-zinc-300' : 'text-zinc-700')}`}>
                          {day}
                        </span>
                        <div className="flex gap-0.5 mt-1 h-1">
                          {dayTasks.slice(0, 3).map((task, idx) => (
                            <div key={idx} className={`w-1 h-1 rounded-full ${colorMap[task.color]?.dot || 'bg-emerald-500'}`} />
                          ))}
                          {dayTasks.length > 3 && <div className={`w-1 h-1 rounded-full transition-colors ${darkMode ? 'bg-zinc-600' : 'bg-zinc-300'}`} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className={`p-4 rounded-2xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                  <h3 className={`text-xs font-bold uppercase mb-3 flex items-center justify-between transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    <span>Activities</span>
                    <span className={darkMode ? 'text-emerald-400' : 'text-emerald-600'}>{selectedDate.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  </h3>
                  <div className="space-y-3">
                    {selectedDateTasks.length > 0 ? (
                      selectedDateTasks.map(task => (
                        <div key={task.id} className="flex gap-4 items-start">
                          <div className="w-12 text-center pt-1">
                            <p className={`text-xs font-bold transition-colors ${darkMode ? 'text-zinc-300' : 'text-zinc-900'}`}>{task.time}</p>
                            <div className={`w-px h-8 mx-auto my-1 transition-colors ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`} />
                          </div>
                          <div 
                            className={`flex-1 ${task.completed ? (darkMode ? 'bg-zinc-800/50 border-zinc-700/50 opacity-60' : 'bg-zinc-50 border-zinc-200 opacity-60') : (darkMode ? (colorMap[task.color]?.bg.replace('50', '900/20') || 'bg-emerald-900/20') : (colorMap[task.color]?.bg || 'bg-emerald-50'))} p-3 rounded-xl border ${task.completed ? '' : (darkMode ? (colorMap[task.color]?.border.replace('100', '800/50') || 'border-emerald-800/50') : (colorMap[task.color]?.border || 'border-emerald-100'))} transition-all cursor-pointer`}
                            onClick={() => openEditTask(task)}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex items-start gap-2 flex-1">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id); }}
                                  className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : (darkMode ? 'border-zinc-600 bg-zinc-800' : 'border-zinc-300 bg-white')}`}
                                >
                                  {task.completed && <CheckCircle2 size={10} />}
                                </button>
                                <div>
                                  <p className={`text-xs font-bold ${task.completed ? (darkMode ? 'text-zinc-500 line-through' : 'text-zinc-500 line-through') : (darkMode ? (colorMap[task.color]?.text.replace('700', '400') || 'text-emerald-400') : (colorMap[task.color]?.text || 'text-emerald-700'))}`}>{task.title}</p>
                                  {task.description && <p className={`text-[10px] ${task.completed ? (darkMode ? 'text-zinc-600' : 'text-zinc-400') : (darkMode ? (colorMap[task.color]?.text.replace('700', '400') || 'text-emerald-400') : (colorMap[task.color]?.text || 'text-emerald-600'))} opacity-80 mt-1`}>{task.description}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 opacity-50">
                                {task.type === 'study' && <Book size={12} className={task.completed ? (darkMode ? 'text-zinc-600' : 'text-zinc-400') : (darkMode ? (colorMap[task.color]?.text.replace('700', '400') || 'text-emerald-400') : (colorMap[task.color]?.text || 'text-emerald-700'))} />}
                                {task.type === 'work' && <LayoutDashboard size={12} className={task.completed ? (darkMode ? 'text-zinc-600' : 'text-zinc-400') : (darkMode ? (colorMap[task.color]?.text.replace('700', '400') || 'text-emerald-400') : (colorMap[task.color]?.text || 'text-emerald-700'))} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={`text-center py-6 text-sm transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        No activities scheduled for this day.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Add Task Modal */}
              <AnimatePresence>
                {isAddingTask && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                  >
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className={`rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transition-colors ${darkMode ? 'bg-zinc-900 border border-zinc-800' : 'bg-white'}`}
                    >
                      <div className={`p-4 border-b flex justify-between items-center transition-colors ${darkMode ? 'border-zinc-800' : 'border-zinc-100'}`}>
                        <h3 className={`font-bold text-lg transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{editingTaskId ? 'Edit Task' : 'Add Task'}</h3>
                        <button 
                          onClick={() => {
                            setIsAddingTask(false);
                            setEditingTaskId(null);
                            setNewTaskTitle('');
                            setNewTaskDate(new Date().toISOString().split('T')[0]);
                            setNewTaskTime('09:00');
                            setNewTaskColor('emerald');
                            setNewTaskType('study');
                          }} 
                          className={`p-2 rounded-full transition-colors ${darkMode ? 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
                        >
                          <X size={20} />
                        </button>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className={`block text-xs font-bold mb-1 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Task Name</label>
                          <input 
                            type="text" 
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="e.g., Study Microeconomics"
                            className={`w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${darkMode ? 'bg-zinc-800 border-zinc-700 text-white placeholder-zinc-500 focus:border-emerald-500' : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-emerald-500'}`}
                            autoFocus
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={`block text-xs font-bold mb-1 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Date</label>
                            <input 
                              type="date" 
                              value={newTaskDate}
                              onChange={(e) => setNewTaskDate(e.target.value)}
                              className={`w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${darkMode ? 'bg-zinc-800 border-zinc-700 text-white focus:border-emerald-500 [color-scheme:dark]' : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-emerald-500'}`}
                            />
                          </div>
                          <div>
                            <label className={`block text-xs font-bold mb-1 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Time</label>
                            <input 
                              type="time" 
                              value={newTaskTime}
                              onChange={(e) => setNewTaskTime(e.target.value)}
                              className={`w-full border rounded-xl px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all ${darkMode ? 'bg-zinc-800 border-zinc-700 text-white focus:border-emerald-500 [color-scheme:dark]' : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-emerald-500'}`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className={`block text-xs font-bold mb-2 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Attachment</label>
                          <div className="flex items-center gap-3">
                            <label 
                              onDragOver={handleDragOverAttachment}
                              onDragLeave={handleDragLeaveAttachment}
                              onDrop={handleDropAttachment}
                              className={`flex-1 cursor-pointer border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all ${isDraggingAttachment ? 'bg-emerald-50/50 border-emerald-500' : newTaskAttachment ? (darkMode ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-emerald-50 border-emerald-500') : (darkMode ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-600' : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300')}`}
                            >
                              {isUploadingAttachment ? (
                                <Loader2 size={24} className="animate-spin text-emerald-500" />
                              ) : newTaskAttachment ? (
                                <>
                                  <CheckCircle2 size={24} className="text-emerald-500" />
                                  <span className="text-[10px] font-bold text-emerald-600 truncate max-w-full px-2">{newTaskAttachment.name}</span>
                                </>
                              ) : newTaskAttachmentUrl ? (
                                <>
                                  <Paperclip size={24} className="text-emerald-500" />
                                  <span className="text-[10px] font-bold text-emerald-600">File Attached</span>
                                </>
                              ) : (
                                <>
                                  <Paperclip size={24} className={isDraggingAttachment ? 'text-emerald-500' : 'text-zinc-400'} />
                                  <span className={`text-[10px] font-bold ${isDraggingAttachment ? 'text-emerald-600' : 'text-zinc-500'}`}>
                                    {isDraggingAttachment ? 'Drop file here' : 'Click or drag file to attach'}
                                  </span>
                                </>
                              )}
                              <input 
                                type="file" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setNewTaskAttachment(file);
                                }} 
                                disabled={isUploadingAttachment} 
                              />
                            </label>
                            {(newTaskAttachment || newTaskAttachmentUrl) && (
                              <button 
                                onClick={() => { setNewTaskAttachment(null); setNewTaskAttachmentUrl(null); }}
                                className={`p-3 rounded-xl transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-red-400' : 'bg-zinc-100 text-zinc-400 hover:text-red-600'}`}
                              >
                                <X size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className={`block text-xs font-bold mb-2 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Task Type</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setNewTaskType('study')}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${newTaskType === 'study' ? (darkMode ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-800 border border-emerald-200') : (darkMode ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-zinc-50 text-zinc-500 border border-zinc-200')}`}
                            >
                              <Book size={14} /> Study/School
                            </button>
                            <button
                              onClick={() => setNewTaskType('work')}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${newTaskType === 'work' ? (darkMode ? 'bg-orange-900/30 text-orange-400 border border-orange-800/50' : 'bg-orange-100 text-orange-800 border border-orange-200') : (darkMode ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-zinc-50 text-zinc-500 border border-zinc-200')}`}
                            >
                              <LayoutDashboard size={14} /> Work
                            </button>
                            <button
                              onClick={() => setNewTaskType('other')}
                              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${newTaskType === 'other' ? (darkMode ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50' : 'bg-blue-100 text-blue-800 border border-blue-200') : (darkMode ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-zinc-50 text-zinc-500 border border-zinc-200')}`}
                            >
                              Other
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className={`block text-xs font-bold mb-2 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Color Label</label>
                          <div className="flex gap-3">
                            {Object.keys(colorMap).map(color => (
                              <button
                                key={color}
                                onClick={() => setNewTaskColor(color)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${colorMap[color].dot} ${newTaskColor === color ? (darkMode ? 'ring-2 ring-offset-2 ring-offset-zinc-900 ring-white scale-110' : 'ring-2 ring-offset-2 ring-zinc-800 scale-110') : ''}`}
                              >
                                {newTaskColor === color && <CheckCircle2 size={16} className="text-white" />}
                              </button>
                            ))}
                          </div>
                        </div>
                        <button 
                          onClick={handleAddTask}
                          disabled={!newTaskTitle.trim()}
                          className="w-full h-12 bg-emerald-600 text-white rounded-xl font-bold mt-4 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
                        >
                          {editingTaskId ? 'Save Changes' : 'Save Task'}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {view === 'timer' && (
            <motion.div 
              key="timer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button onClick={() => setView('dashboard')} className="p-2 bg-white rounded-xl shadow-sm"><ArrowLeft size={20} /></button>
                  <h2 className="text-2xl font-display font-bold">Focus Timer</h2>
                </div>
                <button 
                  onClick={() => setIsManagingTimers(true)}
                  className="p-2 bg-white rounded-xl shadow-sm text-zinc-500 hover:text-emerald-600"
                >
                  <Settings size={20} />
                </button>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                <div className="flex justify-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
                  {timerTypes.map(type => (
                    <button 
                      key={type.id}
                      onClick={() => { 
                        setActiveTimerId(type.id); 
                        setTimerState('idle'); 
                        setCurrentPhaseIndex(0); 
                        if (type.id === 'normal') setTimerTimeLeft(normalTimerInput * 60);
                        else setTimerTimeLeft(type.phases[0].duration * 60);
                      }}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeTimerId === type.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
                    >
                      {type.name}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col items-center justify-center py-8">
                  {activeTimerId === 'normal' && timerState === 'idle' ? (
                    <div className="flex items-center gap-2 mb-4">
                      <input 
                        type="number" 
                        value={normalTimerInput}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setNormalTimerInput(val);
                          setTimerTimeLeft(val * 60);
                        }}
                        className="w-20 text-center text-4xl font-display font-bold bg-zinc-50 rounded-xl py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className="text-xl font-bold text-zinc-400">min</span>
                    </div>
                  ) : (
                    <div className="text-7xl font-display font-bold tracking-tighter text-zinc-900 mb-2">
                      {Math.floor(timerTimeLeft / 60).toString().padStart(2, '0')}:{(timerTimeLeft % 60).toString().padStart(2, '0')}
                    </div>
                  )}
                  
                  {activeTimerId !== 'normal' && timerTypes.find(t => t.id === activeTimerId)?.phases[currentPhaseIndex] && (
                    <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest ${colorMap[timerTypes.find(t => t.id === activeTimerId)!.phases[currentPhaseIndex].color]?.bg || 'bg-zinc-100'} ${colorMap[timerTypes.find(t => t.id === activeTimerId)!.phases[currentPhaseIndex].color]?.text || 'text-zinc-700'}`}>
                      {timerTypes.find(t => t.id === activeTimerId)!.phases[currentPhaseIndex].name} Phase
                    </div>
                  )}
                </div>

                <div className="flex justify-center gap-4 mt-8">
                  <button 
                    onClick={() => {
                      const newState = timerState === 'running' ? 'paused' : 'running';
                      setTimerState(newState);
                      if (newState === 'running') {
                        sendNotification('Timer Started', { body: 'Focus time has begun!' });
                      }
                    }}
                    className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                  >
                    {timerState === 'running' ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                  </button>
                  <button 
                    onClick={() => {
                      setTimerState('idle');
                      setCurrentPhaseIndex(0);
                      const activeTimer = timerTypes.find(t => t.id === activeTimerId);
                      if (activeTimer) {
                        if (activeTimer.id === 'normal') setTimerTimeLeft(normalTimerInput * 60);
                        else setTimerTimeLeft(activeTimer.phases[0].duration * 60);
                      }
                    }}
                    className="w-16 h-16 bg-zinc-100 text-zinc-600 rounded-full flex items-center justify-center active:scale-95 transition-transform hover:bg-zinc-200"
                  >
                    <RotateCcw size={24} />
                  </button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Sparkles size={18} className="text-emerald-500" />
                  How it works
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  {timerTypes.find(t => t.id === activeTimerId)?.description}
                </p>
              </div>
            </motion.div>
          )}

          {view === 'materials' && (
            <motion.div 
              key="materials"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pb-24"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className={`p-2 rounded-xl shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300' : 'bg-white text-zinc-600 hover:text-zinc-900'}`}><ArrowLeft size={20} /></button>
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Study Materials</h2>
              </div>

              <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className={`font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>My Files</h3>
                  <label className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                    {isUploading ? 'Uploading...' : 'Upload File'}
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                  </label>
                </div>

                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`mb-6 p-8 border-2 border-dashed rounded-2xl text-center transition-colors ${isDragging ? 'border-emerald-500 bg-emerald-50/50' : darkMode ? 'border-zinc-700 hover:border-zinc-600' : 'border-zinc-200 hover:border-zinc-300'}`}
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 transition-colors ${isDragging ? 'bg-emerald-100 text-emerald-600' : darkMode ? 'bg-zinc-700 text-zinc-500' : 'bg-zinc-100 text-zinc-400'}`}>
                    <PlusCircle size={24} />
                  </div>
                  <p className={`text-sm font-bold mb-1 transition-colors ${darkMode ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    Drag and drop your files here
                  </p>
                  <p className={`text-xs transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    or click the Upload File button above
                  </p>
                </div>

                {isFetchingFiles ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 size={32} className="animate-spin text-emerald-500" />
                    <p className="text-sm text-zinc-400 font-medium">Fetching your materials...</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center py-12">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${darkMode ? 'bg-zinc-700 text-zinc-500' : 'bg-zinc-50 text-zinc-300'}`}>
                      <BookOpen size={32} />
                    </div>
                    <p className={`text-sm font-medium transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>No materials uploaded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {files.map((file, i) => (
                      <div key={i} className={`p-4 rounded-2xl border flex items-center justify-between transition-colors ${darkMode ? 'bg-zinc-900/50 border-zinc-700' : 'bg-zinc-50 border-zinc-100'}`}>
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-white text-zinc-400'}`}>
                            <Book size={20} />
                          </div>
                          <div className="overflow-hidden">
                            <p className={`text-sm font-bold truncate transition-colors ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>{file.name}</p>
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-zinc-400 hover:text-emerald-400' : 'text-zinc-400 hover:text-emerald-600'}`}
                          >
                            <ChevronRight size={20} />
                          </a>
                          <button 
                            onClick={() => handleDeleteFile(file.id, file.file_path)}
                            className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-zinc-400 hover:text-red-400' : 'text-zinc-400 hover:text-red-600'}`}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`p-6 rounded-3xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <h3 className={`font-bold mb-2 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Storage Info</h3>
                <p className={`text-xs leading-relaxed transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Your files are stored securely in your personal folder. Only you can access them. Supported formats: PDF, Images, and Documents.
                </p>
              </div>
            </motion.div>
          )}

          {view === 'dictionary' && (
            <motion.div 
              key="dictionary"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className="p-2 bg-white rounded-xl shadow-sm"><ArrowLeft size={20} /></button>
                <h2 className="text-2xl font-display font-bold">AI Dictionary</h2>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-zinc-100 shadow-lg flex items-center gap-3">
                <Search size={20} className="text-zinc-400" />
                <input 
                  type="text" 
                  value={searchWord}
                  onChange={(e) => setSearchWord(e.target.value)}
                  placeholder="Search any concept..." 
                  className="flex-1 bg-transparent border-none outline-none text-sm"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearchDefinition()}
                />
                <button className="p-2 text-zinc-400 hover:text-emerald-600 transition-colors">
                  <Mic size={20} />
                </button>
                <button 
                  onClick={handleSearchDefinition}
                  className="p-2 bg-emerald-600 text-white rounded-xl active:scale-95 transition-transform"
                >
                  {isSearching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ChevronRight size={18} />}
                </button>
              </div>

              {definition && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm space-y-4"
                >
                  <div>
                    <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Definition</h3>
                    <p className="text-zinc-800 leading-relaxed">{definition.definition}</p>
                  </div>
                  {definition.example && (
                    <div>
                      <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Example</h3>
                      <p className="text-zinc-600 italic text-sm">"{definition.example}"</p>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button className="p-4 bg-zinc-100 rounded-2xl text-left hover:bg-zinc-200 transition-colors">
                  <p className="text-xs font-bold text-zinc-400 mb-1">Recent</p>
                  <p className="text-sm font-bold">Inflation</p>
                </button>
                <button className="p-4 bg-zinc-100 rounded-2xl text-left hover:bg-zinc-200 transition-colors">
                  <p className="text-xs font-bold text-zinc-400 mb-1">Recent</p>
                  <p className="text-sm font-bold">GDP</p>
                </button>
              </div>
            </motion.div>
          )}

          {view === 'community' && (
            <motion.div 
              key="community"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className={`p-2 rounded-xl shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300' : 'bg-white text-zinc-600 hover:text-zinc-900'}`}><ArrowLeft size={20} /></button>
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Community</h2>
              </div>

              {!isLoggedIn ? (
                <div className={`p-8 rounded-3xl border shadow-sm text-center transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                    <Users size={32} />
                  </div>
                  <h3 className={`text-xl font-bold mb-2 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Join the Community</h3>
                  <p className={`text-sm mb-6 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Connect with other QCU working students, share tips, and ask questions. Log in to access the community.</p>
                  <button 
                    onClick={() => setView('signin')}
                    className={`w-full h-12 font-bold rounded-xl active:scale-95 transition-all ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    Log In
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {['General', 'Economics', 'Biology', 'History'].map(tag => (
                      <button key={tag} className="px-4 py-2 bg-white border border-zinc-100 rounded-full text-xs font-bold whitespace-nowrap shadow-sm">
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {[
                      { user: 'Mark T.', text: 'Anyone have tips for the Microeconomics quiz?', likes: 12, comments: 4 },
                      { user: 'Sarah L.', text: 'Just finished the Biology module. The AI summary was super helpful!', likes: 24, comments: 2 }
                    ].map((post, i) => (
                      <div key={i} className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 bg-zinc-200 rounded-full overflow-hidden">
                            <img src={`https://picsum.photos/seed/${post.user}/50/50`} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <span className="text-xs font-bold text-zinc-900">{post.user}</span>
                        </div>
                        <p className="text-sm text-zinc-600 mb-4">{post.text}</p>
                        <div className="flex gap-4">
                          <button className="flex items-center gap-1 text-zinc-400 text-xs font-bold">
                            <Star size={14} /> {post.likes}
                          </button>
                          <button className="flex items-center gap-1 text-zinc-400 text-xs font-bold">
                            <MessageSquare size={14} /> {post.comments}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="w-full h-14 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform">
                    <PlusCircle size={20} /> Share Knowledge
                  </button>
                </>
              )}
            </motion.div>
          )}

          {view === 'rewards' && (
            <motion.div 
              key="rewards"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6 pb-24"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setView('dashboard')} className="p-2 bg-white rounded-xl shadow-sm"><ArrowLeft size={20} /></button>
                <h2 className="text-2xl font-display font-bold">Rewards</h2>
              </div>

              <div className="bg-gradient-to-br from-orange-400 to-rose-500 p-8 rounded-3xl text-white text-center shadow-xl">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white/30">
                  <Star size={40} fill="currentColor" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Keep the Fire!</h3>
                <p className="text-orange-50 text-sm">You are on a {streak}-day streak. One more day to unlock your reward!</p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
                <h3 className="font-bold text-zinc-900 mb-4">Available Rewards</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                      <Zap size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">1-Week Free Trial</p>
                      <p className="text-[10px] text-zinc-500">Complete a 7-day streak to unlock.</p>
                      <div className="w-full h-1.5 bg-zinc-200 rounded-full mt-2 overflow-hidden">
                        <div className="h-full bg-orange-500" style={{ width: `${(streak/7)*100}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 opacity-60">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                      <Award size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold">QCU Scholar Badge</p>
                      <p className="text-[10px] text-zinc-500">Finish 10 modules to earn.</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'ai-tutor' && (
            <motion.div 
              key="ai-tutor"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="h-full flex flex-col"
            >
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('dashboard')} className={`p-2 rounded-xl shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300' : 'bg-white text-zinc-600 hover:text-zinc-900'}`}><ArrowLeft size={20} /></button>
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>AI Tutor</h2>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto mb-4 no-scrollbar">
                {tutorChat.length === 0 && (
                  <div className="text-center py-12 px-6">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-100'}`}>
                      <Bot size={32} className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    </div>
                    <h3 className={`font-bold mb-2 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>How can I help you study?</h3>
                    <p className={`text-sm transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Ask me to explain a concept, summarize a topic, or quiz you on your modules.</p>
                  </div>
                )}
                {tutorChat.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? (darkMode ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-zinc-900 text-white rounded-tr-none') : (darkMode ? 'bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-tl-none' : 'bg-white text-zinc-800 border border-zinc-100 rounded-tl-none')}`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))}
                {isTutorTyping && (
                  <div className="flex justify-start">
                    <div className={`p-4 rounded-2xl border rounded-tl-none flex gap-1 transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce transition-colors ${darkMode ? 'bg-zinc-500' : 'bg-zinc-300'}`} />
                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-75 transition-colors ${darkMode ? 'bg-zinc-500' : 'bg-zinc-300'}`} />
                      <div className={`w-1.5 h-1.5 rounded-full animate-bounce delay-150 transition-colors ${darkMode ? 'bg-zinc-500' : 'bg-zinc-300'}`} />
                    </div>
                  </div>
                )}
              </div>

              <div className={`mt-auto p-4 rounded-3xl border shadow-lg flex items-center gap-3 transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                <input 
                  type="text" 
                  value={tutorInput}
                  onChange={(e) => setTutorInput(e.target.value)}
                  placeholder="Ask your engineering tutor..." 
                  className={`flex-1 bg-transparent border-none outline-none text-sm transition-colors ${darkMode ? 'text-white placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'}`}
                  onKeyPress={(e) => e.key === 'Enter' && handleTutorChat()}
                />
                <button className={`p-2 transition-colors ${darkMode ? 'text-zinc-500 hover:text-emerald-400' : 'text-zinc-400 hover:text-emerald-600'}`}>
                  <Mic size={20} />
                </button>
                <button 
                  onClick={handleTutorChat}
                  className={`p-3 rounded-2xl active:scale-95 transition-all ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                >
                  <Send size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {view === 'auth-landing' && (
            <div className="flex items-center justify-center min-h-[80vh]">
              <AuthLanding 
                onSignIn={() => setView('signin')}
                onSignUp={() => setView('signup')}
              />
            </div>
          )}

          {view === 'signin' && (
            <div className="flex items-center justify-center min-h-[80vh]">
              <SignIn 
                initialEmail={authEmail}
                signupSuccess={showSignupSuccess}
                onBack={() => setView('auth-landing')}
                onSuccess={() => {
                  setIsLoggedIn(true);
                  setView('dashboard');
                  setShowSignupSuccess(false);
                  setAuthEmail('');
                }}
                onSwitchToSignUp={() => {
                  setView('signup');
                  setShowSignupSuccess(false);
                }}
              />
            </div>
          )}

          {view === 'signup' && (
            <div className="flex items-center justify-center min-h-[80vh]">
              <SignUp 
                onBack={() => setView('auth-landing')}
                onSuccess={() => {
                  setIsLoggedIn(true);
                  setView('dashboard');
                }}
                onSwitchToSignIn={() => {
                  setView('signin');
                  setShowSignupSuccess(false);
                }}
              />
            </div>
          )}

          {view === 'messages' && (
            <motion.div 
              key="messages"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full flex flex-col"
            >
              <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('dashboard')} className={`p-2 rounded-xl shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-300' : 'bg-white text-zinc-600 hover:text-zinc-900'}`}><ArrowLeft size={20} /></button>
                <h2 className={`text-2xl font-display font-bold transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Queued Messages</h2>
              </div>

              {!isLoggedIn ? (
                <div className={`p-8 rounded-3xl border shadow-sm text-center transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                    <MessageSquare size={32} />
                  </div>
                  <h3 className={`text-xl font-bold mb-2 transition-colors ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Login Required</h3>
                  <p className={`text-sm mb-6 transition-colors ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Log in to access your queued messages and send new ones.</p>
                  <button 
                    onClick={() => setView('signin')}
                    className={`w-full py-3 font-bold rounded-xl active:scale-95 transition-all ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    Log In
                  </button>
                </div>
              ) : (
                <>
                  {/* Concept C: Queued Messaging */}
                  <div className={`p-4 rounded-2xl border mb-6 flex items-start gap-3 transition-colors ${darkMode ? 'bg-orange-900/20 border-orange-800/50' : 'bg-orange-50 border-orange-100'}`}>
                    <WifiOff size={20} className="text-orange-500 mt-1" />
                    <div>
                      <p className={`text-sm font-bold transition-colors ${darkMode ? 'text-orange-400' : 'text-orange-800'}`}>Offline Queue Active</p>
                      <p className={`text-xs transition-colors ${darkMode ? 'text-orange-200/80' : 'text-orange-700'}`}>Messages will be sent automatically when you reach a signal.</p>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 overflow-y-auto mb-4">
                    {queuedMessages.map(msg => (
                      <div key={msg.id} className={`p-4 rounded-2xl border shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <p className={`text-xs font-bold uppercase tracking-wider transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>To: {msg.recipient}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${msg.status === 'queued' ? (darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-700') : (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}`}>
                            {msg.status === 'queued' ? 'QUEUED' : 'SENT'}
                          </span>
                        </div>
                        <p className={`text-sm transition-colors ${darkMode ? 'text-zinc-200' : 'text-zinc-800'}`}>{msg.text}</p>
                        <p className={`text-[10px] mt-2 text-right transition-colors ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>{msg.timestamp}</p>
                      </div>
                    ))}
                  </div>

                  <div className={`mt-auto p-4 rounded-3xl border shadow-lg flex items-center gap-3 transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'}`}>
                    <input 
                      type="text" 
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Ask a question..." 
                      className={`flex-1 bg-transparent border-none outline-none text-sm transition-colors ${darkMode ? 'text-white placeholder-zinc-500' : 'text-zinc-900 placeholder-zinc-400'}`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <button className={`p-2 transition-colors ${darkMode ? 'text-zinc-500 hover:text-emerald-400' : 'text-zinc-400 hover:text-emerald-600'}`}>
                      <Mic size={20} />
                    </button>
                    <button 
                      onClick={handleSendMessage}
                      className={`p-3 rounded-2xl active:scale-95 transition-all ${darkMode ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-6"
            >
              <h2 className={`text-2xl font-display font-bold ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Settings</h2>
              
              <div className={`${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'} rounded-3xl border shadow-sm overflow-hidden transition-colors`}>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><User size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Profile Picture</span>
                    </div>
                    <label className={`cursor-pointer text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95 ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                      {isUploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : 'Change'}
                      <input type="file" className="hidden" onChange={handleAvatarUpload} disabled={isUploadingAvatar} accept="image/*" />
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><Volume2 size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Audio Mode Quality</span>
                    </div>
                    <select 
                      value={audioQuality}
                      onChange={(e) => setAudioQuality(e.target.value as any)}
                      className={`text-xs font-bold bg-transparent outline-none cursor-pointer ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                    >
                      <option value="Standard" className="text-zinc-900">Standard</option>
                      <option value="High" className="text-zinc-900">High</option>
                      <option value="Ultra High" className="text-zinc-900">Ultra High</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><Zap size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Auto-Sync on Wi-Fi</span>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !autoSync;
                        setAutoSync(newVal);
                        updateSettings({ auto_sync: newVal });
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors ${autoSync ? 'bg-emerald-500' : (darkMode ? 'bg-zinc-600' : 'bg-zinc-200')}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${autoSync ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><Share2 size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Collaborative Notes</span>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !collaborativeNotes;
                        setCollaborativeNotes(newVal);
                        updateSettings({ collaborative_notes: newVal });
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors ${collaborativeNotes ? 'bg-emerald-500' : (darkMode ? 'bg-zinc-600' : 'bg-zinc-200')}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${collaborativeNotes ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><Moon size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Dark Mode</span>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !darkMode;
                        setDarkMode(newVal);
                        updateSettings({ dark_mode: newVal });
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors ${darkMode ? 'bg-emerald-500' : 'bg-zinc-200'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${darkMode ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              <h3 className={`text-lg font-bold mt-8 mb-4 ${darkMode ? 'text-white' : 'text-zinc-900'}`}>Timer Notifications</h3>
              <div className={`${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-100'} rounded-3xl border shadow-sm overflow-hidden transition-colors`}>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><Volume2 size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Notification Sound</span>
                    </div>
                    <select 
                      value={timerNotificationSound}
                      onChange={(e) => {
                        const newVal = e.target.value as any;
                        setTimerNotificationSound(newVal);
                        localStorage.setItem('timerNotificationSound', newVal);
                      }}
                      className={`text-xs font-bold bg-transparent outline-none cursor-pointer ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                    >
                      <option value="Chime" className="text-zinc-900">Chime</option>
                      <option value="Bell" className="text-zinc-900">Bell</option>
                      <option value="Digital" className="text-zinc-900">Digital</option>
                      <option value="None" className="text-zinc-900">None</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><Zap size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Vibration</span>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !timerVibration;
                        setTimerVibration(newVal);
                        localStorage.setItem('timerVibration', String(newVal));
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors ${timerVibration ? 'bg-emerald-500' : (darkMode ? 'bg-zinc-600' : 'bg-zinc-200')}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${timerVibration ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-zinc-700' : 'bg-zinc-100'}`}><LayoutDashboard size={18} className={darkMode ? 'text-zinc-300' : 'text-zinc-600'} /></div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-zinc-200' : 'text-zinc-900'}`}>Background Notifications</span>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !timerBackgroundNotifications;
                        setTimerBackgroundNotifications(newVal);
                        localStorage.setItem('timerBackgroundNotifications', String(newVal));
                      }}
                      className={`w-10 h-5 rounded-full relative transition-colors ${timerBackgroundNotifications ? 'bg-emerald-500' : (darkMode ? 'bg-zinc-600' : 'bg-zinc-200')}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${timerBackgroundNotifications ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {isLoggedIn ? (
                <button 
                  onClick={async () => {
                    if (supabase) {
                      await supabase.auth.signOut();
                    }
                    setIsLoggedIn(false);
                    setView('auth-landing');
                  }}
                  className={`w-full p-4 rounded-2xl border font-bold text-sm shadow-sm transition-colors ${darkMode ? 'bg-zinc-800 border-zinc-700 text-red-400 hover:bg-zinc-700' : 'bg-white border-zinc-100 text-red-500 hover:bg-red-50'}`}
                >
                  Sign Out
                </button>
              ) : (
                <button 
                  onClick={() => setView('signin')}
                  className={`w-full p-4 rounded-2xl border font-bold text-sm shadow-sm transition-colors ${darkMode ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500' : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700'}`}
                >
                  Log In
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manage Timers Modal */}
        <AnimatePresence>
          {isManagingTimers && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
              >
                <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-white sticky top-0 z-10">
                  <h3 className="font-bold text-lg">{editingTimer ? 'Edit Timer' : 'Manage Timers'}</h3>
                  <button 
                    onClick={() => {
                      if (editingTimer) {
                        setEditingTimer(null);
                      } else {
                        setIsManagingTimers(false);
                      }
                    }} 
                    className="p-2 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1">
                  {!editingTimer ? (
                    <div className="space-y-4">
                      {timerTypes.map(timer => (
                        <div key={timer.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                          <div>
                            <h4 className="font-bold text-sm text-zinc-900">{timer.name}</h4>
                            <p className="text-xs text-zinc-500">{timer.phases.length} phase(s)</p>
                          </div>
                          <button 
                            onClick={() => setEditingTimer(JSON.parse(JSON.stringify(timer)))}
                            className="text-emerald-600 text-xs font-bold px-3 py-1.5 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => setEditingTimer({ id: Date.now().toString(), name: 'New Timer', description: '', phases: [{ name: 'Phase 1', duration: 25, color: 'emerald' }] })}
                        className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-500 font-bold text-sm flex items-center justify-center gap-2 hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                      >
                        <PlusCircle size={18} /> Add Custom Timer
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">Timer Name</label>
                        <input 
                          type="text" 
                          value={editingTimer.name}
                          onChange={(e) => setEditingTimer({ ...editingTimer, name: e.target.value })}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">Description</label>
                        <textarea 
                          value={editingTimer.description}
                          onChange={(e) => setEditingTimer({ ...editingTimer, description: e.target.value })}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all h-20 resize-none"
                        />
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-bold text-zinc-500">Phases</label>
                          <button 
                            onClick={() => setEditingTimer({ ...editingTimer, phases: [...editingTimer.phases, { name: `Phase ${editingTimer.phases.length + 1}`, duration: 5, color: 'emerald' }] })}
                            className="text-xs font-bold text-emerald-600 flex items-center gap-1"
                          >
                            <PlusCircle size={14} /> Add Phase
                          </button>
                        </div>
                        <div className="space-y-3">
                          {editingTimer.phases.map((phase, index) => (
                            <div key={index} className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3 relative">
                              {editingTimer.phases.length > 1 && (
                                <button 
                                  onClick={() => {
                                    const newPhases = [...editingTimer.phases];
                                    newPhases.splice(index, 1);
                                    setEditingTimer({ ...editingTimer, phases: newPhases });
                                  }}
                                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center border border-white shadow-sm"
                                >
                                  <X size={12} />
                                </button>
                              )}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Phase Name</label>
                                  <input 
                                    type="text" 
                                    value={phase.name}
                                    onChange={(e) => {
                                      const newPhases = [...editingTimer.phases];
                                      newPhases[index].name = e.target.value;
                                      setEditingTimer({ ...editingTimer, phases: newPhases });
                                    }}
                                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Duration (min)</label>
                                  <input 
                                    type="number" 
                                    value={phase.duration}
                                    onChange={(e) => {
                                      const newPhases = [...editingTimer.phases];
                                      newPhases[index].duration = parseInt(e.target.value) || 1;
                                      setEditingTimer({ ...editingTimer, phases: newPhases });
                                    }}
                                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-zinc-400 mb-1 uppercase tracking-wider">Color Label</label>
                                <div className="flex gap-2">
                                  {Object.keys(colorMap).map(color => (
                                    <button
                                      key={color}
                                      onClick={() => {
                                        const newPhases = [...editingTimer.phases];
                                        newPhases[index].color = color;
                                        setEditingTimer({ ...editingTimer, phases: newPhases });
                                      }}
                                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${colorMap[color].dot} ${phase.color === color ? 'ring-2 ring-offset-1 ring-zinc-800 scale-110' : ''}`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-zinc-100 flex gap-3">
                        {editingTimer.id !== 'normal' && editingTimer.id !== 'pomodoro' && editingTimer.id !== 'feynman' && (
                          <button 
                            onClick={async () => {
                              if (!supabase) return;
                              const { error } = await supabase.from('timers').delete().eq('id', editingTimer.id);
                              if (!error) {
                                setTimerTypes(timerTypes.filter(t => t.id !== editingTimer.id));
                                if (activeTimerId === editingTimer.id) {
                                  setActiveTimerId('normal');
                                  setTimerState('idle');
                                }
                                setEditingTimer(null);
                              }
                            }}
                            className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl active:scale-95 transition-transform"
                          >
                            Delete
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            if (!supabase) return;
                            const { data: { user } } = await supabase.auth.getUser();
                            if (!user) return;

                            const timerToSave = { ...editingTimer, user_id: user.id };
                            // Remove id if it's a temporary one for new timer
                            const isNew = !timerTypes.find(t => t.id === editingTimer.id);
                            
                            let savedData;
                            if (isNew) {
                              const { id, ...rest } = timerToSave;
                              const { data } = await supabase.from('timers').insert([rest]).select().single();
                              savedData = data;
                            } else {
                              const { data } = await supabase.from('timers').update(timerToSave).eq('id', editingTimer.id).select().single();
                              savedData = data;
                            }

                            if (savedData) {
                              const existingIndex = timerTypes.findIndex(t => t.id === editingTimer.id);
                              if (existingIndex >= 0) {
                                const newTypes = [...timerTypes];
                                newTypes[existingIndex] = savedData;
                                setTimerTypes(newTypes);
                              } else {
                                setTimerTypes([...timerTypes, savedData]);
                              }
                              // If this is the active timer, update time left
                              if (activeTimerId === editingTimer.id) {
                                setTimerTimeLeft(savedData.phases[0].duration * 60);
                                setCurrentPhaseIndex(0);
                                setTimerState('idle');
                              }
                            }
                            setEditingTimer(null);
                          }}
                          className="flex-[2] py-3 bg-emerald-600 text-white font-bold rounded-xl active:scale-95 transition-transform"
                        >
                          Save Timer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Bar - Thumb Friendly */}
      {isLoggedIn && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-lg border-t border-zinc-100 px-6 py-4 flex justify-between items-center z-50">
          <button 
            onClick={() => setView('dashboard')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'dashboard' ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <LayoutDashboard size={24} />
            <span className="text-[10px] font-bold">Home</span>
          </button>
          <button 
            onClick={() => setView('schedule')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'schedule' ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <Calendar size={24} />
            <span className="text-[10px] font-bold">Agenda</span>
          </button>
  
          {/* Floating AI Tutor Button - Easy Thumb Access */}
          <button 
            onClick={() => setView('ai-tutor')}
            className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-2xl -mt-12 border-4 border-zinc-50 active:scale-90 transition-transform"
          >
            <Bot size={32} />
          </button>
  
          <button 
            onClick={() => setView('messages')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'messages' ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <MessageSquare size={24} />
            <span className="text-[10px] font-bold">Messages</span>
          </button>
          <button 
            onClick={() => setView('settings')}
            className={`flex flex-col items-center gap-1 transition-colors ${view === 'settings' ? 'text-emerald-600' : 'text-zinc-400'}`}
          >
            <Settings size={24} />
            <span className="text-[10px] font-bold">Settings</span>
          </button>
        </nav>
      )}

      {/* Concept D: Dopamine-driven rewards (Floating particles or glow) */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-orange-400 to-emerald-400 animate-pulse" />
    </div>
  );
}
