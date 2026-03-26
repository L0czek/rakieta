import { describe, expect, it } from 'vitest';

import { appendStatusLogEntries, MAX_STATUS_LOG_ENTRIES, makeStatusLogEntry } from '@/utils/statusLog';

describe('statusLog helpers', () => {
  it('keeps existing entries when nothing is appended', () => {
    const entries = [makeStatusLogEntry('connected', 'connection', 1)];

    expect(appendStatusLogEntries(entries, [])).toEqual(entries);
  });

  it('trims the oldest entries when the log grows past the cap', () => {
    const existing = Array.from({ length: MAX_STATUS_LOG_ENTRIES }, (_, index) =>
      makeStatusLogEntry(`entry-${index}`, 'log', index),
    );
    const additions = [
      makeStatusLogEntry('new-1', 'warning', MAX_STATUS_LOG_ENTRIES + 1),
      makeStatusLogEntry('new-2', 'warning', MAX_STATUS_LOG_ENTRIES + 2),
    ];

    const next = appendStatusLogEntries(existing, additions);

    expect(next).toHaveLength(MAX_STATUS_LOG_ENTRIES);
    expect(next[0]?.message).toBe('entry-2');
    expect(next.at(-1)?.message).toBe('new-2');
  });
});
