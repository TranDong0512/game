import { useState, useEffect } from 'react'
import { Sidebar } from './components/Layout/Sidebar'
import { Dashboard } from './components/Dashboard/Dashboard'
import { Subjects } from './components/Subjects/Subjects'
import { Schedule } from './components/Schedule/Schedule'
import { Pomodoro } from './components/Pomodoro/Pomodoro'
import { Notes } from './components/Notes/Notes'
import { Flashcards } from './components/Flashcards/Flashcards'
import { LessonView } from './components/LessonView/LessonView'
import './App.css'

type Page = 'dashboard' | 'subjects' | 'schedule' | 'pomodoro' | 'notes' | 'flashcards'

interface LessonViewParams {
  scheduleId: number
  subjectId: number
  subjectName: string
  subjectColor: string
  date: string
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard')
  const [lessonParams, setLessonParams] = useState<LessonViewParams | null>(null)

  useEffect(() => {
    const handler = (e: CustomEvent) => setCurrentPage(e.detail)
    window.addEventListener('navigate-to', handler as EventListener)
    return () => window.removeEventListener('navigate-to', handler as EventListener)
  }, [])

  function openLesson(scheduleId: number, subjectId: number, subjectName: string, subjectColor: string, date: string) {
    setLessonParams({ scheduleId, subjectId, subjectName, subjectColor, date })
  }

  function closeLesson() {
    setLessonParams(null)
  }

  const renderPage = () => {
    if (lessonParams) {
      return (
        <LessonView
          scheduleId={lessonParams.scheduleId}
          subjectId={lessonParams.subjectId}
          subjectName={lessonParams.subjectName}
          subjectColor={lessonParams.subjectColor}
          date={lessonParams.date}
          onBack={closeLesson}
        />
      )
    }

    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={setCurrentPage} />
      case 'subjects': return <Subjects />
      case 'schedule': return <Schedule onOpenLesson={openLesson} />
      case 'pomodoro': return <Pomodoro />
      case 'notes': return <Notes />
      case 'flashcards': return <Flashcards />
      default: return <Dashboard onNavigate={setCurrentPage} />
    }
  }

  return (
    <div className="app">
      <Sidebar currentPage={currentPage} onNavigate={(page) => { setCurrentPage(page); closeLesson(); }} />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

export default App
