import { useEffect, useState } from 'react'
import type { Lesson } from '../../types'
import './LessonView.css'

interface LessonViewProps {
  scheduleId: number
  subjectId: number
  subjectName: string
  subjectColor: string
  date: string
  onBack: () => void
}

export function LessonView({ scheduleId, subjectId, subjectName, subjectColor, date, onBack }: LessonViewProps) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [newKeyPoint, setNewKeyPoint] = useState('')
  const [isNew, setIsNew] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadLesson()
  }, [scheduleId, date])

  async function loadLesson() {
    const existing = await window.electronAPI.getLessonByScheduleAndDate(scheduleId, date)
    if (existing) {
      setLesson(existing)
      setTitle(existing.title)
      setContent(existing.content)
      try {
        setKeyPoints(JSON.parse(existing.key_points))
      } catch {
        setKeyPoints([])
      }
      setIsNew(false)
    } else {
      setIsNew(true)
      setTitle('')
      setContent('')
      setKeyPoints([])
    }
  }

  async function handleSave() {
    const keyPointsJson = JSON.stringify(keyPoints)

    if (lesson) {
      await window.electronAPI.updateLesson(lesson.id, {
        title,
        content,
        key_points: keyPointsJson,
      })
    } else {
      const newLesson = await window.electronAPI.createLesson({
        schedule_id: scheduleId,
        subject_id: subjectId,
        date,
        title,
        content,
        key_points: keyPointsJson,
      })
      setLesson(newLesson)
      setIsNew(false)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function addKeyPoint() {
    if (newKeyPoint.trim()) {
      setKeyPoints([...keyPoints, newKeyPoint.trim()])
      setNewKeyPoint('')
    }
  }

  function removeKeyPoint(index: number) {
    setKeyPoints(keyPoints.filter((_, i) => i !== index))
  }

  function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-')
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
    return `${days[date.getDay()]}, ${d}/${m}/${y}`
  }

  return (
    <div className="lesson-view">
      <div className="lesson-header">
        <button className="back-btn" onClick={onBack}>← Quay lại thời khóa biểu</button>
        <div className="lesson-title-section">
          <div className="lesson-subject-badge" style={{ background: subjectColor }}>
            {subjectName}
          </div>
          <h1>{formatDate(date)}</h1>
        </div>
      </div>

      <div className="lesson-content-wrapper">
        <div className="lesson-main">
          <div className="lesson-section card">
            <h2>📝 Tiêu đề bài học</h2>
            <input
              placeholder="VD: Chương 3 - Động học điểm chất"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="lesson-section card">
            <h2>📖 Nội dung bài học</h2>
            <textarea
              placeholder="Ghi lại nội dung bài học hôm nay...&#10;&#10;Ví dụ:&#10;- Định nghĩa: ...&#10;- Công thức: ...&#10;- Ví dụ minh họa: ..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
            />
          </div>

          <div className="lesson-section card">
            <h2>⭐ Kiến thức quan trọng</h2>
            <div className="key-points-list">
              {keyPoints.map((point, index) => (
                <div key={index} className="key-point-item">
                  <span className="key-point-number">{index + 1}</span>
                  <span className="key-point-text">{point}</span>
                  <button className="remove-point" onClick={() => removeKeyPoint(index)}>×</button>
                </div>
              ))}
            </div>
            <div className="add-point-row">
              <input
                placeholder="Thêm kiến thức quan trọng..."
                value={newKeyPoint}
                onChange={(e) => setNewKeyPoint(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyPoint()}
              />
              <button onClick={addKeyPoint}>+</button>
            </div>
          </div>
        </div>

        <div className="lesson-sidebar">
          <div className="card save-card">
            <button className="save-btn" onClick={handleSave}>
              {saved ? '✅ Đã lưu!' : '💾 Lưu bài học'}
            </button>
            {isNew && (
              <p className="save-hint">Bài học chưa được lưu. Nhấn lưu để tạo mới.</p>
            )}
          </div>

          <div className="card tips-card">
            <h3>💡 Mẹo ghi chú</h3>
            <ul>
              <li>Ghi tóm tắt ngắn gọn</li>
              <li>Liệt kê công thức quan trọng</li>
              <li>Ghi chú phần chưa hiểu để hỏi lại</li>
              <li>Thêm flashcard ngay sau buổi học</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
