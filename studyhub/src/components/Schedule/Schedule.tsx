import { useEffect, useState, useRef } from 'react'
import type { Subject, Schedule as ScheduleType, Lesson } from '../../types'
import './Schedule.css'

const DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6)

interface ScheduleProps {
  onOpenLesson?: (scheduleId: number, subjectId: number, subjectName: string, subjectColor: string, date: string) => void
}

export function Schedule({ onOpenLesson }: ScheduleProps) {
  const [schedules, setSchedules] = useState<ScheduleType[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [selectedDay, setSelectedDay] = useState(1)
  const [subjectId, setSubjectId] = useState<number>(0)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:30')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [s, sub, l] = await Promise.all([
      window.electronAPI.getSchedules(),
      window.electronAPI.getSubjects(),
      window.electronAPI.getLessons(),
    ])
    setSchedules(s)
    setSubjects(sub)
    setLessons(l)
    if (sub.length > 0 && subjectId === 0) {
      setSubjectId(sub[0].id)
    }
  }

  async function handleAdd() {
    if (!subjectId) return
    await window.electronAPI.addSchedule({
      subject_id: subjectId,
      day_of_week: selectedDay,
      start_time: startTime,
      end_time: endTime,
    })
    setShowModal(false)
    loadData()
  }

  async function handleDelete(id: number) {
    if (confirm('Xóa lịch học này?')) {
      await window.electronAPI.deleteSchedule(id)
      loadData()
    }
  }

  async function handleImportCSV() {
    if (!csvText.trim()) return
    const result = await window.electronAPI.importSchedule(csvText)
    setImportResult(result)
    if (result.imported > 0) {
      loadData()
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
  }

  function getTodayDate() {
    const now = new Date()
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
  }

  function handleSlotClick(slot: ScheduleType) {
    const today = getTodayDate()
    if (onOpenLesson) {
      onOpenLesson(slot.id, slot.subject_id, slot.subject_name || '', slot.subject_color || '#4A90D9', today)
    }
  }

  function hasLesson(scheduleId: number): boolean {
    const today = getTodayDate()
    return lessons.some(l => l.schedule_id === scheduleId && l.date === today)
  }

  function getScheduleForSlot(day: number, hour: number) {
    return schedules.filter((s) => {
      if (s.day_of_week !== day) return false
      const sh = parseInt(s.start_time.split(':')[0])
      const sm = parseInt(s.start_time.split(':')[1])
      const eh = parseInt(s.end_time.split(':')[0])
      const em = parseInt(s.end_time.split(':')[1])
      const slotMinutes = hour * 60
      const startMinutes = sh * 60 + sm
      const endMinutes = eh * 60 + em
      return slotMinutes >= startMinutes && slotMinutes < endMinutes
    })
  }

  return (
    <div className="schedule">
      <div className="page-header">
        <h1>Lịch học</h1>
        <div className="header-buttons">
          <button className="secondary" onClick={() => setShowImportModal(true)}>📥 Import CSV</button>
          <button onClick={() => setShowModal(true)}>+ Thêm lịch</button>
        </div>
      </div>

      <div className="schedule-grid">
        <div className="schedule-header">
          <div className="time-label"></div>
          {DAYS.map((day, i) => (
            <div key={i} className="day-label">{day}</div>
          ))}
        </div>
        {HOURS.map((hour) => (
          <div key={hour} className="schedule-row">
            <div className="time-label">{hour}:00</div>
            {[0, 1, 2, 3, 4, 5, 6].map((day) => {
              const slots = getScheduleForSlot(day, hour)
              const slot = slots[0]
              return (
                <div key={day} className={`schedule-cell ${slot ? 'has-event' : ''}`}>
                  {slot && hour === parseInt(slot.start_time.split(':')[0]) && (
                    <div
                      className={`schedule-event ${hasLesson(slot.id) ? 'has-lesson' : ''}`}
                      style={{ background: slot.subject_color || 'var(--accent)' }}
                      onClick={() => handleSlotClick(slot)}
                    >
                      <span className="event-name">{slot.subject_name}</span>
                      <span className="event-time">{slot.start_time}-{slot.end_time}</span>
                      {hasLesson(slot.id) && <span className="lesson-badge">📝</span>}
                      <button className="event-delete" onClick={(e) => { e.stopPropagation(); handleDelete(slot.id); }}>×</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Thêm lịch học</h2>
            <label>Ngày trong tuần</label>
            <select value={selectedDay} onChange={(e) => setSelectedDay(Number(e.target.value))}>
              {DAYS.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
            <label>Môn học</label>
            <select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <label>Giờ bắt đầu</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <label>Giờ kết thúc</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <div className="modal-actions">
              <button className="secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button onClick={handleAdd}>Thêm</button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => { setShowImportModal(false); setImportResult(null); setCsvText(''); }}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <h2>Import thời khóa biểu từ CSV</h2>
            <div className="csv-format-info">
              <p><strong>Format CSV:</strong></p>
              <code>Tên môn,Thứ,Giờ bắt đầu,Giờ kết thúc</code>
              <p><strong>Ví dụ - nhiều môn trong 1 ngày:</strong></p>
              <code>
                Toán,T2,08:00,09:30<br/>
                Lý,T2,10:00,11:30<br/>
                Anh văn,T2,14:00,15:30<br/>
                Hóa,T3,08:00,09:30<br/>
                Sinh,T3,10:00,11:30
              </code>
              <p><strong>Thứ:</strong> T2-T7, CN (hoặc 2-7, 0)</p>
              <p><strong>Mỗi dòng = 1 tiết học. Cùng thứ = cùng ngày.</strong></p>
            </div>
            <div className="upload-section">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.txt"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button className="secondary" onClick={() => fileInputRef.current?.click()}>
                📄 Chọn file CSV
              </button>
              <span className="or-text">hoặc dán nội dung bên dưới</span>
            </div>
            <textarea
              placeholder="Toán,T2,08:00,09:30&#10;Lý,T2,10:00,11:30&#10;Anh,T2,14:00,15:30"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
            />
            {importResult && (
              <div className={`import-result ${importResult.errors.length > 0 ? 'has-errors' : ''}`}>
                <p>Đã import: {importResult.imported} lịch học</p>
                {importResult.errors.length > 0 && (
                  <div className="import-errors">
                    {importResult.errors.map((err, i) => (
                      <p key={i} className="error-text">❌ {err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary" onClick={() => { setShowImportModal(false); setImportResult(null); setCsvText(''); }}>Đóng</button>
              <button onClick={handleImportCSV}>Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


