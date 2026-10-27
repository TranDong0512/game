const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');

let mainWindow;
const DB_PATH = path.join(app.getPath('userData'), 'studyhub.db');
let db;

function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4A90D9',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      ease_factor REAL DEFAULT 2.5,
      interval INTEGER DEFAULT 1,
      repetitions INTEGER DEFAULT 0,
      next_review DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pomodoro_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER,
      duration INTEGER NOT NULL,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      key_points TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    insertSetting.run('pomodoro_work', '25');
    insertSetting.run('pomodoro_break', '5');
    insertSetting.run('pomodoro_long_break', '15');
    insertSetting.run('daily_goal_hours', '4');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC Handlers
function setupIPC() {
  ipcMain.handle('db:getSubjects', () => {
    return db.prepare('SELECT * FROM subjects ORDER BY name').all();
  });

  ipcMain.handle('db:addSubject', (_, subject) => {
    const result = db.prepare('INSERT INTO subjects (name, color) VALUES (?, ?)').run(subject.name, subject.color);
    return { id: result.lastInsertRowid, ...subject };
  });

  ipcMain.handle('db:updateSubject', (_, id, subject) => {
    db.prepare('UPDATE subjects SET name = ?, color = ? WHERE id = ?').run(subject.name, subject.color, id);
  });

  ipcMain.handle('db:deleteSubject', (_, id) => {
    db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
  });

  ipcMain.handle('db:getSchedules', () => {
    return db.prepare(`
      SELECT s.*, sub.name as subject_name, sub.color as subject_color
      FROM schedules s
      JOIN subjects sub ON s.subject_id = sub.id
      ORDER BY s.day_of_week, s.start_time
    `).all();
  });

  ipcMain.handle('db:addSchedule', (_, schedule) => {
    const result = db.prepare('INSERT INTO schedules (subject_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)').run(
      schedule.subject_id, schedule.day_of_week, schedule.start_time, schedule.end_time
    );
    return { id: result.lastInsertRowid, ...schedule };
  });

  ipcMain.handle('db:deleteSchedule', (_, id) => {
    db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  });

  ipcMain.handle('db:getNotes', () => {
    return db.prepare(`
      SELECT n.*, sub.name as subject_name, sub.color as subject_color
      FROM notes n
      JOIN subjects sub ON n.subject_id = sub.id
      ORDER BY n.updated_at DESC
    `).all();
  });

  ipcMain.handle('db:addNote', (_, note) => {
    const result = db.prepare('INSERT INTO notes (subject_id, title, content) VALUES (?, ?, ?)').run(
      note.subject_id, note.title, note.content
    );
    return { id: result.lastInsertRowid, ...note };
  });

  ipcMain.handle('db:updateNote', (_, id, note) => {
    db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      note.title, note.content, id
    );
  });

  ipcMain.handle('db:deleteNote', (_, id) => {
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  });

  ipcMain.handle('db:getFlashcards', () => {
    return db.prepare(`
      SELECT f.*, sub.name as subject_name, sub.color as subject_color
      FROM flashcards f
      JOIN subjects sub ON f.subject_id = sub.id
      ORDER BY f.next_review ASC
    `).all();
  });

  ipcMain.handle('db:getDueFlashcards', () => {
    return db.prepare(`
      SELECT f.*, sub.name as subject_name, sub.color as subject_color
      FROM flashcards f
      JOIN subjects sub ON f.subject_id = sub.id
      WHERE f.next_review <= datetime('now')
      ORDER BY f.next_review ASC
    `).all();
  });

  ipcMain.handle('db:addFlashcard', (_, flashcard) => {
    const result = db.prepare('INSERT INTO flashcards (subject_id, front, back) VALUES (?, ?, ?)').run(
      flashcard.subject_id, flashcard.front, flashcard.back
    );
    return { id: result.lastInsertRowid, ...flashcard };
  });

  ipcMain.handle('db:updateFlashcardReview', (_, id, data) => {
    db.prepare(`
      UPDATE flashcards 
      SET ease_factor = ?, interval = ?, repetitions = ?, next_review = ?
      WHERE id = ?
    `).run(data.ease_factor, data.interval, data.repetitions, data.next_review, id);
  });

  ipcMain.handle('db:deleteFlashcard', (_, id) => {
    db.prepare('DELETE FROM flashcards WHERE id = ?').run(id);
  });

  ipcMain.handle('db:addPomodoroLog', (_, log) => {
    const result = db.prepare('INSERT INTO pomodoro_logs (subject_id, duration) VALUES (?, ?)').run(
      log.subject_id, log.duration
    );
    return { id: result.lastInsertRowid, ...log };
  });

  ipcMain.handle('db:getPomodoroStats', () => {
    const today = db.prepare(`
      SELECT COALESCE(SUM(duration), 0) as total
      FROM pomodoro_logs
      WHERE date(completed_at) = date('now')
    `).get();

    const thisWeek = db.prepare(`
      SELECT COALESCE(SUM(duration), 0) as total
      FROM pomodoro_logs
      WHERE completed_at >= date('now', 'weekday 1', '-7 days')
    `).get();

    const bySubject = db.prepare(`
      SELECT sub.name, sub.color, COALESCE(SUM(p.duration), 0) as total
      FROM subjects sub
      LEFT JOIN pomodoro_logs p ON sub.id = p.subject_id
        AND p.completed_at >= date('now', 'weekday 1', '-7 days')
      GROUP BY sub.id
      ORDER BY total DESC
    `).all();

    const streak = db.prepare(`
      SELECT COUNT(DISTINCT date(completed_at)) as days
      FROM pomodoro_logs
      WHERE completed_at >= date('now', '-30 days')
    `).get();

    return { today: today.total, thisWeek: thisWeek.total, bySubject, streak: streak.days };
  });

  ipcMain.handle('db:getSettings', () => {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(row => { settings[row.key] = row.value; });
    return settings;
  });

  ipcMain.handle('db:updateSetting', (_, key, value) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  });

  // Lessons
  ipcMain.handle('db:getLessons', (_, filters) => {
    let query = `
      SELECT l.*, sub.name as subject_name, sub.color as subject_color
      FROM lessons l
      JOIN subjects sub ON l.subject_id = sub.id
    `;
    const conditions = [];
    const params = [];

    if (filters?.subject_id) {
      conditions.push('l.subject_id = ?');
      params.push(filters.subject_id);
    }
    if (filters?.date) {
      conditions.push('l.date = ?');
      params.push(filters.date);
    }
    if (filters?.schedule_id) {
      conditions.push('l.schedule_id = ?');
      params.push(filters.schedule_id);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY l.date DESC, l.created_at DESC';

    return db.prepare(query).all(...params);
  });

  ipcMain.handle('db:getLessonByScheduleAndDate', (_, scheduleId, date) => {
    return db.prepare(`
      SELECT l.*, sub.name as subject_name, sub.color as subject_color
      FROM lessons l
      JOIN subjects sub ON l.subject_id = sub.id
      WHERE l.schedule_id = ? AND l.date = ?
    `).get(scheduleId, date);
  });

  ipcMain.handle('db:createLesson', (_, lesson) => {
    const result = db.prepare(`
      INSERT INTO lessons (schedule_id, subject_id, date, title, content, key_points)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(lesson.schedule_id, lesson.subject_id, lesson.date, lesson.title, lesson.content, lesson.key_points);
    return { id: result.lastInsertRowid, ...lesson };
  });

  ipcMain.handle('db:updateLesson', (_, id, lesson) => {
    db.prepare(`
      UPDATE lessons SET title = ?, content = ?, key_points = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(lesson.title, lesson.content, lesson.key_points, id);
  });

  ipcMain.handle('db:importSchedule', (_, csvData) => {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) return { imported: 0, errors: ['File CSV trống'] };

    const errors = [];
    let imported = 0;
    const dayMap = {
      'CN': 0, 'Chu nhat': 0, 'Chủ nhật': 0,
      'T2': 1, 'Thu 2': 1, 'Thứ 2': 1, 'thu 2': 1,
      'T3': 2, 'Thu 3': 2, 'Thứ 3': 2, 'thu 3': 2,
      'T4': 3, 'Thu 4': 3, 'Thứ 4': 3, 'thu 4': 3,
      'T5': 4, 'Thu 5': 4, 'Thứ 5': 4, 'thu 5': 4,
      'T6': 5, 'Thu 6': 5, 'Thứ 6': 5, 'thu 6': 5,
      'T7': 6, 'Thu 7': 6, 'Thứ 7': 6, 'thu 7': 6,
      '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '0': 0,
      '07': 6, '01': 1, '02': 2, '03': 3, '04': 4, '05': 5, '06': 6,
    };

    const insertStmt = db.prepare(`
      INSERT INTO schedules (subject_id, day_of_week, start_time, end_time)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',').map(c => c.trim());
        if (cols.length < 4) {
          errors.push(`Dòng ${i + 1}: Thiếu cột (cần: Tên môn, Thứ, Giờ bắt đầu, Giờ kết thúc)`);
          continue;
        }

        const [subjectName, dayStr, startTime, endTime] = cols;

        let subject = db.prepare('SELECT id FROM subjects WHERE name = ?').get(subjectName);
        if (!subject) {
          const result = db.prepare('INSERT INTO subjects (name, color) VALUES (?, ?)').run(
            subjectName, COLORS[Math.floor(Math.random() * COLORS.length)]
          );
          subject = { id: result.lastInsertRowid };
        }

        const dayOfWeek = dayMap[dayStr] ?? dayMap[dayStr.toLowerCase()];
        if (dayOfWeek === undefined) {
          errors.push(`Dòng ${i + 1}: Ngày không hợp lệ "${dayStr}"`);
          continue;
        }

        insertStmt.run(subject.id, dayOfWeek, startTime, endTime);
        imported++;
      }
    });

    transaction();
    return { imported, errors };
  });

  ipcMain.handle('db:clearSchedules', () => {
    db.prepare('DELETE FROM schedules').run();
  });
}

const COLORS = [
  '#4A90D9', '#E91E63', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B',
  '#F44336', '#E040FB', '#00BCD4', '#4CAF50', '#FF6D00', '#2979FF', '#FF1744', '#7C4DFF',
  '#00BFA5', '#FFD600', '#6200EA', '#FF6E40', '#1DE9B6', '#F50057', '#304FFE', '#76FF03'
];

app.whenReady().then(() => {
  initDatabase();
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (db) db.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
