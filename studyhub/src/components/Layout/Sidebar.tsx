import './Sidebar.css'

type Page = 'dashboard' | 'subjects' | 'schedule' | 'pomodoro' | 'notes' | 'flashcards'

interface SidebarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
}

const menuItems: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: '📊' },
  { id: 'subjects', label: 'Môn học', icon: '📚' },
  { id: 'schedule', label: 'Lịch học', icon: '📅' },
  { id: 'pomodoro', label: 'Pomodoro', icon: '⏱️' },
  { id: 'notes', label: 'Ghi chú', icon: '📝' },
  { id: 'flashcards', label: 'Flashcard', icon: '🃏' },
]

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <span className="logo">📚</span>
        <h1>StudyHub</h1>
      </div>
      <div className="sidebar-menu">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`menu-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
