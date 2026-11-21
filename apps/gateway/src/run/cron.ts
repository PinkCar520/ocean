interface CronField {
  values: number[];
  wildcard: boolean;
}

function parseField(text: string, min: number, max: number): CronField {
  const values = new Set<number>();
  for (const term of text.split(',')) {
    const parsed = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(term);
    if (!parsed) throw new Error('Invalid cron field.');
    const [, span, step] = parsed;
    const increment = step === undefined ? 1 : Number(step);
    const from = span === '*' ? min : Number(span.split('-')[0]);
    const to = span === '*' || (step && !span.includes('-')) ? max
      : Number(span.split('-').at(-1));
    if (!Number.isSafeInteger(increment) || increment < 1 || increment > max - min + 1
      || from < min || to > max || from > to) throw new Error('Cron field is out of range.');
    for (let value = from; value <= to; value += increment) values.add(value);
  }
  return { values: [...values].sort((left, right) => left - right), wildcard: text.startsWith('*') };
}

/** Return the first matching UTC minute strictly after the supplied time. */
export function nextCronTime(expression: string, after: Date): Date {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron requires five fields: minute hour day month weekday.');
  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const day = parseField(fields[2], 1, 31);
  const month = parseField(fields[3], 1, 12);
  const weekday = parseField(fields[4], 0, 7);
  const daysOfWeek = new Set(weekday.values.map((value) => value % 7));
  const firstDay = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate());
  const dayMs = 86_400_000;
  for (let offset = 0; offset < 366 * 8; offset++) {
    const date = new Date(firstDay + offset * dayMs);
    if (!month.values.includes(date.getUTCMonth() + 1)) continue;
    const dayMatches = day.values.includes(date.getUTCDate());
    const weekdayMatches = daysOfWeek.has(date.getUTCDay());
    if (day.wildcard || weekday.wildcard ? !(dayMatches && weekdayMatches) : !(dayMatches || weekdayMatches)) continue;
    for (const selectedHour of hour.values) {
      for (const selectedMinute of minute.values) {
        const timestamp = date.getTime() + (selectedHour * 60 + selectedMinute) * 60_000;
        if (timestamp > after.getTime()) return new Date(timestamp);
      }
    }
  }
  throw new Error('Cron has no matching date within eight years.');
}
