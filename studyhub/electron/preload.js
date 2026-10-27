const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Subjects
  getSubjects: () => ipcRenderer.invoke('db:getSubjects'),
  addSubject: (subject) => ipcRenderer.invoke('db:addSubject', subject),
  updateSubject: (id, subject) => ipcRenderer.invoke('db:updateSubject', id, subject),
  deleteSubject: (id) => ipcRenderer.invoke('db:deleteSubject', id),

  // Schedules
  getSchedules: () => ipcRenderer.invoke('db:getSchedules'),
  addSchedule: (schedule) => ipcRenderer.invoke('db:addSchedule', schedule),
  deleteSchedule: (id) => ipcRenderer.invoke('db:deleteSchedule', id),
  importSchedule: (csvData) => ipcRenderer.invoke('db:importSchedule', csvData),
  clearSchedules: () => ipcRenderer.invoke('db:clearSchedules'),

  // Lessons
  getLessons: (filters) => ipcRenderer.invoke('db:getLessons', filters),
  getLessonByScheduleAndDate: (scheduleId, date) => ipcRenderer.invoke('db:getLessonByScheduleAndDate', scheduleId, date),
  createLesson: (lesson) => ipcRenderer.invoke('db:createLesson', lesson),
  updateLesson: (id, lesson) => ipcRenderer.invoke('db:updateLesson', id, lesson),

  // Notes
  getNotes: () => ipcRenderer.invoke('db:getNotes'),
  addNote: (note) => ipcRenderer.invoke('db:addNote', note),
  updateNote: (id, note) => ipcRenderer.invoke('db:updateNote', id, note),
  deleteNote: (id) => ipcRenderer.invoke('db:deleteNote', id),

  // Flashcards
  getFlashcards: () => ipcRenderer.invoke('db:getFlashcards'),
  getDueFlashcards: () => ipcRenderer.invoke('db:getDueFlashcards'),
  addFlashcard: (flashcard) => ipcRenderer.invoke('db:addFlashcard', flashcard),
  updateFlashcardReview: (id, data) => ipcRenderer.invoke('db:updateFlashcardReview', id, data),
  deleteFlashcard: (id) => ipcRenderer.invoke('db:deleteFlashcard', id),

  // Pomodoro
  addPomodoroLog: (log) => ipcRenderer.invoke('db:addPomodoroLog', log),
  getPomodoroStats: () => ipcRenderer.invoke('db:getPomodoroStats'),

  // Settings
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  updateSetting: (key, value) => ipcRenderer.invoke('db:updateSetting', key, value),
});
