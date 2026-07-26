// A small, fully-tested recurrence engine. It parses the common Todoist-style
// natural-language phrases into a structured rule, renders a canonical string
// for storage/display, and computes the next occurrence from a given date.
//
// Scope (deliberately bounded, all unit-tested): daily / weekly (incl. weekday
// lists, weekdays, weekends) / monthly (incl. day-of-month) / yearly, each with
// an optional interval ("every 3 days"). Date math runs in UTC for determinism.

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  freq: RecurrenceFreq;
  /** Repeat every `interval` units (>= 1). */
  interval: number;
  /** For weekly rules: the weekdays it falls on (0 = Sunday … 6 = Saturday). */
  weekdays?: number[];
  /** For monthly rules: the day of month (1–31), clamped to the month length. */
  monthday?: number;
}

// Weekday names, English and French (singular + plural, e.g. "lundi"/"lundis").
const WEEKDAY: Record<string, number> = {
  sunday: 0, sun: 0, dimanche: 0, dimanches: 0,
  monday: 1, mon: 1, lundi: 1, lundis: 1,
  tuesday: 2, tue: 2, tues: 2, mardi: 2, mardis: 2,
  wednesday: 3, wed: 3, weds: 3, mercredi: 3, mercredis: 3,
  thursday: 4, thu: 4, thurs: 4, jeudi: 4, jeudis: 4,
  friday: 5, fri: 5, vendredi: 5, vendredis: 5,
  saturday: 6, sat: 6, samedi: 6, samedis: 6,
};
const WEEKDAY_NAME = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

// French number words for small intervals ("tous les deux jours").
const NUMWORD: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
};

// Leading "every …" markers, English and French. Longest first so "toutes les"
// is tried before "tous les" wouldn't be — order within each length is safe.
const MARKERS = ['every ', 'toutes les ', 'tous les ', 'toute les ', 'tout les ', 'chaque '];

const DAYS_IN_MONTH = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Parse a natural-language phrase into a Recurrence, or null if unrecognised. */
export function parseRecurrence(input: string): Recurrence | null {
  let text = input.trim().toLowerCase();
  if (!text) return null;

  // Single-word synonyms (EN + FR).
  if (text === 'daily' || text === 'quotidien' || text === 'quotidienne') return { freq: 'daily', interval: 1 };
  if (text === 'weekly' || text === 'hebdomadaire') return { freq: 'weekly', interval: 1 };
  if (text === 'monthly' || text === 'mensuel' || text === 'mensuelle') return { freq: 'monthly', interval: 1 };
  if (text === 'yearly' || text === 'annually' || text === 'annuel' || text === 'annuelle') return { freq: 'yearly', interval: 1 };

  // Bare phrases that carry their own frequency without an "every …" marker.
  if (text === 'en semaine') return { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
  if (text === 'le week-end' || text === 'week-end' || text === 'le weekend') {
    return { freq: 'weekly', interval: 1, weekdays: [0, 6] };
  }

  // Strip the leading "every" / "chaque" / "tous les" … marker.
  const marker = MARKERS.find((m) => text.startsWith(m));
  if (!marker) return null;
  text = text.slice(marker.length).trim();

  // "every weekday" / "tous les jours ouvrés" / "every weekend"
  if (text === 'weekday' || text === 'weekdays'
    || text === 'jour ouvré' || text === 'jours ouvrés'
    || text === 'jour ouvre' || text === 'jours ouvres') {
    return { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] };
  }
  if (text === 'weekend' || text === 'weekends' || text === 'weekend day'
    || text === 'week-end' || text === 'week-ends') {
    return { freq: 'weekly', interval: 1, weekdays: [0, 6] };
  }

  // Day-of-month with an explicit month context: "1st of the month" / "15 du mois".
  // Checked before interval extraction so "15 du mois" isn't read as interval 15.
  const domCtx = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+the\s+month|du\s+mois)$/);
  if (domCtx) {
    const day = parseInt(domCtx[1]!, 10);
    if (day >= 1 && day <= 31) return { freq: 'monthly', interval: 1, monthday: day };
    return null;
  }

  // Optional leading interval: "3 days" / "3 jours", "other"/"autre", "deux" → 2.
  let interval = 1;
  const digitMatch = text.match(/^(\d+)\s+(.*)$/);
  const otherMatch = text.match(/^(?:other|autres?)\s+(.*)$/);
  const wordMatch = text.match(/^(\p{L}+)\s+(.*)$/u);
  if (digitMatch) {
    interval = parseInt(digitMatch[1]!, 10);
    text = digitMatch[2]!.trim();
  } else if (otherMatch) {
    interval = 2;
    text = otherMatch[1]!.trim();
  } else if (wordMatch && NUMWORD[wordMatch[1]!] !== undefined) {
    interval = NUMWORD[wordMatch[1]!]!;
    text = wordMatch[2]!.trim();
  }
  if (interval < 1) return null;

  // Unit keywords (EN + FR, singular or plural).
  if (/^(?:days?|jours?)$/.test(text)) return { freq: 'daily', interval };
  if (/^(?:weeks?|semaines?)$/.test(text)) return { freq: 'weekly', interval };
  if (/^(?:months?|mois)$/.test(text)) return { freq: 'monthly', interval };
  if (/^(?:years?|ans?|années?|annees?)$/.test(text)) return { freq: 'yearly', interval };

  // Day-of-month: "15th", "3rd", or bare French "15".
  const dom = text.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
  if (dom) {
    const day = parseInt(dom[1]!, 10);
    if (day >= 1 && day <= 31) return { freq: 'monthly', interval, monthday: day };
    return null;
  }

  // Weekday list: "monday", "mon, wed and fri", "lundi, mercredi et vendredi".
  const tokens = text.split(/[,]|\s+and\s+|\s+et\s+|\s+/).map((t) => t.trim()).filter(Boolean);
  const weekdays: number[] = [];
  for (const tok of tokens) {
    const wd = WEEKDAY[tok];
    if (wd === undefined) return null;
    if (!weekdays.includes(wd)) weekdays.push(wd);
  }
  if (weekdays.length > 0) {
    weekdays.sort((a, b) => a - b);
    return { freq: 'weekly', interval, weekdays };
  }
  return null;
}

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
};

/** Render a Recurrence as a canonical, human-readable string. */
export function formatRecurrence(r: Recurrence): string {
  const n = r.interval;
  if (r.freq === 'weekly' && r.weekdays?.length) {
    const set = [...r.weekdays].sort((a, b) => a - b);
    if (n === 1 && set.length === 5 && set.join() === '1,2,3,4,5') return 'every weekday';
    if (n === 1 && set.length === 2 && set.join() === '0,6') return 'every weekend';
    const names = set.map((d) => WEEKDAY_NAME[d]!);
    return `every ${names.join(', ')}`;
  }
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[r.freq];
  if (r.freq === 'monthly' && r.monthday) {
    return n === 1
      ? `every ${ordinal(r.monthday)}`
      : `every ${n} months on the ${ordinal(r.monthday)}`;
  }
  return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

/** Normalise NL text to its canonical form, or null if unrecognised. */
export function normalizeRecurrence(input: string): string | null {
  const parsed = parseRecurrence(input);
  return parsed ? formatRecurrence(parsed) : null;
}

const addDaysUTC = (d: Date, days: number): Date =>
  new Date(d.getTime() + days * 86_400_000);

/**
 * The next occurrence strictly after `from`. `from` is typically the current
 * due date; completing a recurring task advances its due date to this value.
 */
export function nextOccurrence(r: Recurrence, from: Date): Date {
  switch (r.freq) {
    case 'daily':
      return addDaysUTC(from, r.interval);

    case 'weekly': {
      if (!r.weekdays?.length) return addDaysUTC(from, 7 * r.interval);
      // Find the next listed weekday after `from`, within the next `interval`
      // weeks. Scan day by day — bounded and simple.
      for (let i = 1; i <= 7 * Math.max(r.interval, 1) + 7; i++) {
        const cand = addDaysUTC(from, i);
        if (r.weekdays.includes(cand.getUTCDay())) return cand;
      }
      return addDaysUTC(from, 7); // unreachable for non-empty weekdays
    }

    case 'monthly': {
      const day = r.monthday ?? from.getUTCDate();
      const y = from.getUTCFullYear();
      const m = from.getUTCMonth() + r.interval;
      const targetY = y + Math.floor(m / 12);
      const targetM = ((m % 12) + 12) % 12;
      const clamped = Math.min(day, DAYS_IN_MONTH(targetY, targetM));
      return new Date(Date.UTC(
        targetY, targetM, clamped,
        from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(),
      ));
    }

    case 'yearly':
      return new Date(Date.UTC(
        from.getUTCFullYear() + r.interval, from.getUTCMonth(), from.getUTCDate(),
        from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(),
      ));
  }
}
