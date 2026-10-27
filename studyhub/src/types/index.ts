export interface Subject {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Schedule {
  id: number;
  subject_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject_name?: string;
  subject_color?: string;
}

export interface Lesson {
  id: number;
  schedule_id: number;
  subject_id: number;
  date: string;
  title: string;
  content: string;
  key_points: string;
  created_at: string;
  updated_at: string;
  subject_name?: string;
  subject_color?: string;
}

export interface Note {
  id: number;
  subject_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  subject_name?: string;
  subject_color?: string;
}

export interface Flashcard {
  id: number;
  subject_id: number;
  front: string;
  back: string;
  ease_factor: number;
  interval: number;
  repetitions: number;
  next_review: string;
  created_at: string;
  subject_name?: string;
  subject_color?: string;
}

export interface PomodoroLog {
  id: number;
  subject_id: number | null;
  duration: number;
  completed_at: string;
}

export interface PomodoroStats {
  today: number;
  thisWeek: number;
  bySubject: { name: string; color: string; total: number }[];
  streak: number;
}

export interface Settings {
  pomodoro_work: string;
  pomodoro_break: string;
  pomodoro_long_break: string;
  daily_goal_hours: string;
}

declare global {
  interface Window {
    electronAPI: {
      // Subjects
      getSubjects: () => Promise<Subject[]>;
      addSubject: (subject: Omit<Subject, 'id' | 'created_at'>) => Promise<Subject>;
      updateSubject: (id: number, subject: Omit<Subject, 'id' | 'created_at'>) => Promise<void>;
      deleteSubject: (id: number) => Promise<void>;

      // Schedules
      getSchedules: () => Promise<Schedule[]>;
      addSchedule: (schedule: Omit<Schedule, 'id' | 'subject_name' | 'subject_color'>) => Promise<Schedule>;
      deleteSchedule: (id: number) => Promise<void>;
      importSchedule: (csvData: string) => Promise<{ imported: number; errors: string[] }>;
      clearSchedules: () => Promise<void>;

      // Lessons
      getLessons: (filters?: { subject_id?: number; date?: string; schedule_id?: number }) => Promise<Lesson[]>;
      getLessonByScheduleAndDate: (scheduleId: number, date: string) => Promise<Lesson | null>;
      createLesson: (lesson: Omit<Lesson, 'id' | 'created_at' | 'updated_at' | 'subject_name' | 'subject_color'>) => Promise<Lesson>;
      updateLesson: (id: number, lesson: { title: string; content: string; key_points: string }) => Promise<void>;

      // Notes
      getNotes: () => Promise<Note[]>;
      addNote: (note: Omit<Note, 'id' | 'created_at' | 'updated_at' | 'subject_name' | 'subject_color'>) => Promise<Note>;
      updateNote: (id: number, note: Omit<Note, 'id' | 'created_at' | 'updated_at' | 'subject_name' | 'subject_color'>) => Promise<void>;
      deleteNote: (id: number) => Promise<void>;

      // Flashcards
      getFlashcards: () => Promise<Flashcard[]>;
      getDueFlashcards: () => Promise<Flashcard[]>;
      addFlashcard: (flashcard: Omit<Flashcard, 'id' | 'created_at' | 'ease_factor' | 'interval' | 'repetitions' | 'next_review' | 'subject_name' | 'subject_color'>) => Promise<Flashcard>;
      updateFlashcardReview: (id: number, data: { ease_factor: number; interval: number; repetitions: number; next_review: string }) => Promise<void>;
      deleteFlashcard: (id: number) => Promise<void>;

      // Pomodoro
      addPomodoroLog: (log: Omit<PomodoroLog, 'id' | 'completed_at'>) => Promise<PomodoroLog>;
      getPomodoroStats: () => Promise<PomodoroStats>;

      // Settings
      getSettings: () => Promise<Settings>;
      updateSetting: (key: string, value: string) => Promise<void>;
    };
  }
}
