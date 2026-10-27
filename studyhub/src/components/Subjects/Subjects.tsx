import { useEffect, useState } from 'react'
import type { Subject, Note, Flashcard, PomodoroStats } from '../../types'
import './Subjects.css'

const COLORS = [
  '#4A90D9', '#E91E63', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
  '#F44336', '#E040FB', '#00BCD4', '#4CAF50', '#FF6D00', '#2979FF', '#FF1744', '#7C4DFF',
  '#00BFA5', '#FFD600', '#6200EA', '#FF6E40', '#1DE9B6', '#F50057', '#304FFE', '#76FF03'
]

interface SubjectDetail {
  subject: Subject
  notes: Note[]
  flashcards: Flashcard[]
  stats: PomodoroStats
}

export function Subjects() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectDetails, setSubjectDetails] = useState<Map<number, SubjectDetail>>(new Map())
  const [selectedSubject, setSelectedSubject] = useState<SubjectDetail | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])

  useEffect(() => {
    loadAllData()
  }, [])

  async function loadAllData() {
    const [subjectsData, notesData, flashcardsData, statsData] = await Promise.all([
      window.electronAPI.getSubjects(),
      window.electronAPI.getNotes(),
      window.electronAPI.getFlashcards(),
      window.electronAPI.getPomodoroStats(),
    ])

    setSubjects(subjectsData)

    const detailsMap = new Map<number, SubjectDetail>()
    for (const subject of subjectsData) {
      const subjectNotes = notesData.filter(n => n.subject_id === subject.id)
      const subjectFlashcards = flashcardsData.filter(f => f.subject_id === subject.id)
      const subjectStats = {
        ...statsData,
        bySubject: statsData.bySubject.filter(s => s.name === subject.name),
      }
      detailsMap.set(subject.id, {
        subject,
        notes: subjectNotes,
        flashcards: subjectFlashcards,
        stats: subjectStats,
      })
    }
    setSubjectDetails(detailsMap)
  }

  async function handleSave() {
    if (!name.trim()) return
    if (editingSubject) {
      await window.electronAPI.updateSubject(editingSubject.id, { name, color })
    } else {
      await window.electronAPI.addSubject({ name, color })
    }
    setShowModal(false)
    setEditingSubject(null)
    setName('')
    setColor(COLORS[0])
    loadAllData()
  }

  async function handleDelete(id: number) {
    if (confirm('Xóa môn học này?')) {
      await window.electronAPI.deleteSubject(id)
      if (selectedSubject?.subject.id === id) setSelectedSubject(null)
      loadAllData()
    }
  }

  function openEdit(subject: Subject) {
    setEditingSubject(subject)
    setName(subject.name)
    setColor(subject.color)
    setShowModal(true)
  }

  function openAdd() {
    setEditingSubject(null)
    setName('')
    setColor(COLORS[0])
    setShowModal(true)
  }

  function selectSubject(id: number) {
    const detail = subjectDetails.get(id)
    if (detail) setSelectedSubject(detail)
  }

  return (
    <div className="subjects">
      <div className="page-header">
        <h1>{selectedSubject ? selectedSubject.subject.name : 'Môn học'}</h1>
        <div className="header-actions">
          {selectedSubject && (
            <button className="secondary" onClick={() => setSelectedSubject(null)}>
              ← Quay lại
            </button>
          )}
          {!selectedSubject && <button onClick={openAdd}>+ Thêm môn</button>}
        </div>
      </div>

      {selectedSubject ? (
        <div className="subject-detail">
          <div className="detail-stats">
            <div className="detail-stat-card">
              <span className="detail-stat-value">{selectedSubject.notes.length}</span>
              <span className="detail-stat-label">Ghi chú</span>
            </div>
            <div className="detail-stat-card">
              <span className="detail-stat-value">{selectedSubject.flashcards.length}</span>
              <span className="detail-stat-label">Flashcard</span>
            </div>
            <div className="detail-stat-card">
              <span className="detail-stat-value">
                {selectedSubject.stats.bySubject[0]
                  ? Math.round(selectedSubject.stats.bySubject[0].total / 60 * 10) / 10 + 'h'
                  : '0h'}
              </span>
              <span className="detail-stat-label">Tuần này</span>
            </div>
          </div>

          <div className="detail-sections">
            <div className="detail-section card">
              <h3>Ghi chú gần đây</h3>
              {selectedSubject.notes.length > 0 ? (
                <div className="detail-list">
                  {selectedSubject.notes.slice(0, 5).map(note => (
                    <div key={note.id} className="detail-list-item">
                      <span>{note.title}</span>
                      <span className="item-date">{new Date(note.updated_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">Chưa có ghi chú</p>
              )}
            </div>

            <div className="detail-section card">
              <h3>Flashcard sắp ôn</h3>
              {selectedSubject.flashcards.length > 0 ? (
                <div className="detail-list">
                  {selectedSubject.flashcards.slice(0, 5).map(card => (
                    <div key={card.id} className="detail-list-item">
                      <span>{card.front.slice(0, 40)}{card.front.length > 40 ? '...' : ''}</span>
                      <span className="item-date">EF: {card.ease_factor.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-text">Chưa có flashcard</p>
              )}
            </div>
          </div>

          <div className="detail-actions">
            <button onClick={() => {
              // Trigger custom event to navigate to notes with pre-selected subject
              window.dispatchEvent(new CustomEvent('navigate-to', { detail: 'notes' }))
            }}>📝 Thêm ghi chú</button>
            <button onClick={() => {
              window.dispatchEvent(new CustomEvent('navigate-to', { detail: 'flashcards' }))
            }}>🃏 Thêm flashcard</button>
            <button className="secondary" onClick={() => openEdit(selectedSubject.subject)}>✏️ Sửa môn</button>
            <button className="danger" onClick={() => handleDelete(selectedSubject.subject.id)}>🗑️ Xóa môn</button>
          </div>
        </div>
      ) : (
        <div className="subject-grid">
          {subjects.map((subject) => {
            const detail = subjectDetails.get(subject.id)
            return (
              <div key={subject.id} className="subject-card card" onClick={() => selectSubject(subject.id)}>
                <div className="subject-color" style={{ background: subject.color }}></div>
                <div className="subject-info">
                  <h3>{subject.name}</h3>
                  <div className="subject-stats-mini">
                    <span>📝 {detail?.notes.length || 0}</span>
                    <span>🃏 {detail?.flashcards.length || 0}</span>
                    <span>
                      ⏱️ {detail?.stats.bySubject[0]
                        ? Math.round(detail.stats.bySubject[0].total / 60 * 10) / 10 + 'h'
                        : '0h'}
                    </span>
                  </div>
                </div>
                <div className="subject-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="secondary" onClick={() => openEdit(subject)}>Sửa</button>
                  <button className="danger" onClick={() => handleDelete(subject.id)}>Xóa</button>
                </div>
              </div>
            )
          })}
          {subjects.length === 0 && (
            <div className="empty-state card">
              <p>Chưa có môn học nào</p>
              <button onClick={openAdd}>+ Thêm môn học đầu tiên</button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSubject ? 'Sửa môn học' : 'Thêm môn học'}</h2>
            <input
              placeholder="Tên môn học"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div className="color-picker">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-option ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button onClick={handleSave}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
