import { useEffect, useState } from 'react'
import type { Subject, Note } from '../../types'
import './Notes.css'

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [subjectId, setSubjectId] = useState<number>(0)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [n, sub] = await Promise.all([
      window.electronAPI.getNotes(),
      window.electronAPI.getSubjects(),
    ])
    setNotes(n)
    setSubjects(sub)
    if (sub.length > 0 && subjectId === 0) {
      setSubjectId(sub[0].id)
    }
  }

  async function handleSave() {
    if (!title.trim() || !subjectId) return
    if (editingNote) {
      await window.electronAPI.updateNote(editingNote.id, { subject_id: subjectId, title, content })
    } else {
      await window.electronAPI.addNote({ subject_id: subjectId, title, content })
    }
    setShowModal(false)
    setEditingNote(null)
    setTitle('')
    setContent('')
    loadData()
  }

  async function handleDelete(id: number) {
    if (confirm('Xóa ghi chú này?')) {
      await window.electronAPI.deleteNote(id)
      if (selectedNote?.id === id) setSelectedNote(null)
      loadData()
    }
  }

  function openEdit(note: Note) {
    setEditingNote(note)
    setSubjectId(note.subject_id)
    setTitle(note.title)
    setContent(note.content)
    setShowModal(true)
  }

  function openAdd() {
    setEditingNote(null)
    setSubjectId(subjects[0]?.id || 0)
    setTitle('')
    setContent('')
    setShowModal(true)
  }

  return (
    <div className="notes">
      <div className="page-header">
        <h1>Ghi chú</h1>
        <button onClick={openAdd}>+ Thêm ghi chú</button>
      </div>

      <div className="notes-layout">
        <div className="notes-sidebar">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`note-item ${selectedNote?.id === note.id ? 'active' : ''}`}
              onClick={() => setSelectedNote(note)}
            >
              <div className="note-subject-bar" style={{ background: note.subject_color }}></div>
              <div className="note-preview">
                <h4>{note.title}</h4>
                <p>{note.content.slice(0, 60) || 'Không có nội dung'}</p>
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="empty-state">
              <p>Chưa có ghi chú</p>
            </div>
          )}
        </div>

        <div className="note-detail">
          {selectedNote ? (
            <div className="note-content-wrapper">
              <div className="note-header">
                <div>
                  <h2>{selectedNote.title}</h2>
                  <span className="note-meta">
                    {selectedNote.subject_name} • {new Date(selectedNote.updated_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div className="note-actions">
                  <button className="secondary" onClick={() => openEdit(selectedNote)}>Sửa</button>
                  <button className="danger" onClick={() => handleDelete(selectedNote.id)}>Xóa</button>
                </div>
              </div>
              <div className="note-body">{selectedNote.content}</div>
            </div>
          ) : (
            <div className="empty-state">
              <p>Chọn một ghi chú để xem</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>{editingNote ? 'Sửa ghi chú' : 'Thêm ghi chú'}</h2>
            <input
              placeholder="Tiêu đề"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <textarea
              placeholder="Nội dung ghi chú..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
            />
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
