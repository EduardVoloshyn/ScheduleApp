/**
 * The real schedule, transcribed from the old spreadsheet (docs/schedule-seed.md).
 *
 * 16 of the 18 durations are guesses at 60 minutes — the spreadsheet had nowhere to
 * record length, so only the two ФТФ sessions have a real end time. Corrections come
 * from looking at the rendered week, which is a better surface than a table.
 *
 * Used by the tests, and shown before credentials are entered so the app has something
 * to render on first open.
 *
 * @type {import('../layout/time.js').ScheduleEvent[]}
 */
export const SEED_EVENTS = [
  { id: 's01', day: 1, start: '11:00', duration_min: 60, title: 'Географія', icon: '🌍', colour: 'slate' },
  { id: 's02', day: 1, start: '19:00', duration_min: 60, title: 'Онлайн фізика', icon: '🔬', colour: 'slate' },

  { id: 's03', day: 2, start: '12:30', duration_min: 60, title: 'Біологія', icon: '🌱', colour: 'slate' },
  { id: 's04', day: 2, start: '19:00', duration_min: 90, title: 'ФТФ', icon: '🔭', colour: 'slate', note: 'до 20:30' },

  { id: 's05', day: 3, start: '12:00', duration_min: 60, title: 'Фортепіано', icon: '🎹', colour: 'blue' },
  { id: 's06', day: 3, start: '17:45', duration_min: 60, title: 'Олена', icon: '👤', colour: 'slate' },
  { id: 's07', day: 3, start: '19:00', duration_min: 60, title: 'Онлайн фізика', icon: '🔬', colour: 'slate' },

  { id: 's08', day: 4, start: '11:00', duration_min: 60, title: 'Географія', icon: '🌍', colour: 'slate' },
  { id: 's09', day: 4, start: '12:30', duration_min: 60, title: 'Хімія', icon: '🧪', colour: 'slate' },
  { id: 's10', day: 4, start: '19:00', duration_min: 90, title: 'ФТФ', icon: '🔭', colour: 'slate', note: 'до 20:30' },

  { id: 's11', day: 5, start: '19:00', duration_min: 60, title: 'Онлайн фізика', icon: '🔬', colour: 'slate' },

  { id: 's12', day: 6, start: '16:40', duration_min: 60, title: 'Вектор', icon: '📐', colour: 'red' },
  { id: 's13', day: 6, start: '17:00', duration_min: 60, title: 'Еврика', icon: '💡', colour: 'red' },
  { id: 's14', day: 6, start: '18:15', duration_min: 60, title: 'Японська', icon: '🇯🇵', colour: 'slate' },

  { id: 's15', day: 7, start: '10:30', duration_min: 60, title: 'Історія', icon: '📜', colour: 'slate' },
  { id: 's16', day: 7, start: '15:00', duration_min: 60, title: 'Олена', icon: '👤', colour: 'slate' },
  { id: 's17', day: 7, start: '16:00', duration_min: 60, title: 'Японська', icon: '🇯🇵', colour: 'slate' },
  { id: 's18', day: 7, start: '17:00', duration_min: 60, title: 'Історія', icon: '📜', colour: 'slate' },
]
