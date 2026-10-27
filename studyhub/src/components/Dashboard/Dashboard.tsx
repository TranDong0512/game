import { useEffect, useState } from 'react'
import type { PomodoroStats, Subject } from '../../types'
import './Dashboard.css'

type Page = 'dashboard' | 'subjects' | 'schedule' | 'pomodoro' | 'notes' | 'flashcards'

interface DashboardProps {
  onNavigate: (page: Page) => void
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<PomodoroStats | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [s, sub] = await Promise.all([
      window.electronAPI.getPomodoroStats(),
      window.electronAPI.getSubjects(),
    ])
    setStats(s)
    setSubjects(sub)
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Tổng quan</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats ? Math.round(stats.today / 60 * 10) / 10 : 0}h</div>
          <div className="stat-label">Hôm nay</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats ? Math.round(stats.thisWeek / 60 * 10) / 10 : 0}h</div>
          <div className="stat-label">Tuần này</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.streak || 0}</div>
          <div className="stat-label">Ngày liên tiếp</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{subjects.length}</div>
          <div className="stat-label">Môn học</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card quick-actions">
          <h3>Hành động nhanh</h3>
          <div className="action-buttons">
            <button onClick={() => onNavigate('pomodoro')}>⏱️ Bắt đầu Pomodoro</button>
            <button className="secondary" onClick={() => onNavigate('notes')}>📝 Viết ghi chú</button>
            <button className="secondary" onClick={() => onNavigate('flashcards')}>🃏 Ôn flashcard</button>
          </div>
        </div>

        <div className="card subject-stats">
          <h3>Thời gian theo môn (tuần này)</h3>
          {stats && stats.bySubject.length > 0 ? (
            <div className="subject-bars">
              {stats.bySubject.map((s, i) => (
                <div key={i} className="subject-bar-item">
                  <div className="bar-info">
                    <span className="bar-dot" style={{ background: s.color }}></span>
                    <span>{s.name}</span>
                  </div>
                  <div className="bar-wrapper">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min((s.total / Math.max(stats.thisWeek, 1)) * 100, 100)}%`,
                        background: s.color
                      }}
                    ></div>
                    <span className="bar-value">{Math.round(s.total / 60 * 10) / 10}h</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">Chưa có dữ liệu. Bắt đầu học ngay!</p>
          )}
        </div>
      </div>
    </div>
  )
}
