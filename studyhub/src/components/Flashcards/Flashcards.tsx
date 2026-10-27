import { useEffect, useState } from 'react'
import type { Subject, Flashcard } from '../../types'
import './Flashcards.css'

type ViewMode = 'list' | 'study'

export function Flashcards() {
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [dueCards, setDueCards] = useState<Flashcard[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showModal, setShowModal] = useState(false)
  const [subjectId, setSubjectId] = useState<number>(0)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [f, due, sub] = await Promise.all([
      window.electronAPI.getFlashcards(),
      window.electronAPI.getDueFlashcards(),
      window.electronAPI.getSubjects(),
    ])
    setFlashcards(f)
    setDueCards(due)
    setSubjects(sub)
    if (sub.length > 0 && subjectId === 0) {
      setSubjectId(sub[0].id)
    }
  }

  async function handleAdd() {
    if (!front.trim() || !back.trim() || !subjectId) return
    await window.electronAPI.addFlashcard({ subject_id: subjectId, front, back })
    setShowModal(false)
    setFront('')
    setBack('')
    loadData()
  }

  async function handleDelete(id: number) {
    if (confirm('Xóa flashcard này?')) {
      await window.electronAPI.deleteFlashcard(id)
      loadData()
    }
  }

  async function handleReview(quality: number) {
    const card = dueCards[currentCardIndex]
    if (!card) return

    let newEF = card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    if (newEF < 1.3) newEF = 1.3

    let newInterval: number
    if (card.repetitions === 0) {
      newInterval = 1
    } else if (card.repetitions === 1) {
      newInterval = 6
    } else {
      newInterval = Math.round(card.interval * newEF)
    }

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + newInterval)

    await window.electronAPI.updateFlashcardReview(card.id, {
      ease_factor: newEF,
      interval: newInterval,
      repetitions: card.repetitions + 1,
      next_review: nextReview.toISOString(),
    })

    setIsFlipped(false)
    if (currentCardIndex < dueCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1)
    } else {
      setViewMode('list')
      setCurrentCardIndex(0)
      loadData()
    }
  }

  function startStudy() {
    setCurrentCardIndex(0)
    setIsFlipped(false)
    setViewMode('study')
  }

  return (
    <div className="flashcards">
      <div className="page-header">
        <h1>Flashcard</h1>
        <div className="header-actions">
          {dueCards.length > 0 && viewMode === 'list' && (
            <button onClick={startStudy} className="review-btn">
              Ôn ngay ({dueCards.length} thẻ đến hạn)
            </button>
          )}
          <button onClick={() => setShowModal(true)}>+ Thêm thẻ</button>
        </div>
      </div>

      {viewMode === 'study' && dueCards.length > 0 ? (
        <div className="study-view">
          <div className="study-progress">
            {currentCardIndex + 1} / {dueCards.length}
          </div>
          <div
            className={`flashcard-study ${isFlipped ? 'flipped' : ''}`}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div className="flashcard-front">
              <span className="card-subject" style={{ color: dueCards[currentCardIndex]?.subject_color }}>
                {dueCards[currentCardIndex]?.subject_name}
              </span>
              <p>{dueCards[currentCardIndex]?.front}</p>
              <span className="flip-hint">Nhấn để lật</span>
            </div>
            <div className="flashcard-back">
              <p>{dueCards[currentCardIndex]?.back}</p>
            </div>
          </div>
          {isFlipped && (
            <div className="review-buttons">
              <button className="again" onClick={() => handleReview(1)}>Again</button>
              <button className="hard" onClick={() => handleReview(3)}>Hard</button>
              <button className="good" onClick={() => handleReview(4)}>Good</button>
              <button className="easy" onClick={() => handleReview(5)}>Easy</button>
            </div>
          )}
          <button className="secondary" onClick={() => { setViewMode('list'); setCurrentCardIndex(0) }}>
            Thoát
          </button>
        </div>
      ) : (
        <div className="flashcard-list">
          {flashcards.map((card) => (
            <div key={card.id} className="flashcard-item card">
              <div className="fc-color" style={{ background: card.subject_color }}></div>
              <div className="fc-content">
                <div className="fc-front">{card.front}</div>
                <div className="fc-back">{card.back}</div>
                <div className="fc-meta">
                  {card.subject_name} • Interval: {card.interval}d • EF: {card.ease_factor.toFixed(1)}
                </div>
              </div>
              <button className="danger" onClick={() => handleDelete(card.id)}>Xóa</button>
            </div>
          ))}
          {flashcards.length === 0 && (
            <div className="empty-state card">
              <p>Chưa có flashcard nào</p>
              <button onClick={() => setShowModal(true)}>+ Tạo thẻ đầu tiên</button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Thêm flashcard</h2>
            <label>Môn học</label>
            <select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <label>Câu hỏi (Mặt trước)</label>
            <textarea
              placeholder="Nhập câu hỏi..."
              value={front}
              onChange={(e) => setFront(e.target.value)}
              rows={3}
            />
            <label>Trả lời (Mặt sau)</label>
            <textarea
              placeholder="Nhập câu trả lời..."
              value={back}
              onChange={(e) => setBack(e.target.value)}
              rows={3}
            />
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button onClick={handleAdd}>Thêm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
