import { useEffect, useState, useRef } from 'react'
import type { Subject, Settings } from '../../types'
import './Pomodoro.css'

type TimerState = 'idle' | 'running' | 'paused' | 'break'

export function Pomodoro() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<number>(0)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [state, setState] = useState<TimerState>('idle')
  const [timeLeft, setTimeLeft] = useState(0)
  const [isBreak, setIsBreak] = useState(false)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    loadData()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  async function loadData() {
    const [sub, s] = await Promise.all([
      window.electronAPI.getSubjects(),
      window.electronAPI.getSettings(),
    ])
    setSubjects(sub)
    setSettings(s)
    setTimeLeft(parseInt(s.pomodoro_work) * 60)
  }

  function startTimer() {
    setState('running')
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimerEnd()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function pauseTimer() {
    setState('paused')
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  function resetTimer() {
    setState('idle')
    setIsBreak(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    const workMinutes = parseInt(settings?.pomodoro_work || '25')
    setTimeLeft(workMinutes * 60)
  }

  function handleTimerEnd() {
    if (intervalRef.current) clearInterval(intervalRef.current)

    if (!isBreak) {
      window.electronAPI.addPomodoroLog({
        subject_id: selectedSubject || null,
        duration: parseInt(settings?.pomodoro_work || '25') * 60,
      })
      const breakMinutes = parseInt(settings?.pomodoro_break || '5')
      setIsBreak(true)
      setTimeLeft(breakMinutes * 60)
      setState('break')
    } else {
      const workMinutes = parseInt(settings?.pomodoro_work || '25')
      setIsBreak(false)
      setTimeLeft(workMinutes * 60)
      setState('idle')
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const progress = settings
    ? ((parseInt(settings.pomodoro_work) * 60 - timeLeft) / (parseInt(settings.pomodoro_work) * 60)) * 100
    : 0

  return (
    <div className="pomodoro">
      <div className="page-header">
        <h1>Pomodoro</h1>
      </div>

      <div className="pomodoro-center">
        <div className="timer-container">
          <div className="timer-ring">
            <svg viewBox="0 0 200 200">
              <circle className="timer-bg" cx="100" cy="100" r="90" />
              <circle
                className="timer-progress"
                cx="100"
                cy="100"
                r="90"
                style={{
                  strokeDasharray: 565.48,
                  strokeDashoffset: 565.48 - (565.48 * (isBreak ? 100 : progress)) / 100,
                  stroke: isBreak ? 'var(--success)' : 'var(--accent)',
                }}
              />
            </svg>
            <div className="timer-display">
              <span className="timer-time">{formatTime(timeLeft)}</span>
              <span className="timer-label">
                {isBreak ? 'Nghỉ giải lae' : state === 'idle' ? 'Sẵn sàng' : state === 'running' ? 'Đang tập trung' : 'Tạm dừng'}
              </span>
            </div>
          </div>

          <div className="timer-controls">
            {state === 'idle' && (
              <button onClick={startTimer} className="start-btn">Bắt đầu</button>
            )}
            {state === 'running' && (
              <button onClick={pauseTimer} className="pause-btn">Tạm dừng</button>
            )}
            {state === 'paused' && (
              <>
                <button onClick={startTimer}>Tiếp tục</button>
                <button className="secondary" onClick={resetTimer}>Đặt lại</button>
              </>
            )}
            {state === 'break' && (
              <button className="secondary" onClick={handleTimerEnd}>Bỏ qua nghỉ</button>
            )}
          </div>
        </div>

        <div className="pomodoro-settings card">
          <h3>Cài đặt</h3>
          <div className="setting-row">
            <label>Môn học</label>
            <select value={selectedSubject} onChange={(e) => setSelectedSubject(Number(e.target.value))}>
              <option value={0}>-- Chọn môn --</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <label>Thời gian làm việc (phút)</label>
            <span>{settings?.pomodoro_work || 25}</span>
          </div>
          <div className="setting-row">
            <label>Nghỉ giải lao (phút)</label>
            <span>{settings?.pomodoro_break || 5}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
