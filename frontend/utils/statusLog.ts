import type { StatusLogEntry } from '@/types';

export const MAX_STATUS_LOG_ENTRIES = 400;

export const makeStatusLogEntry = (
  message: string,
  type: StatusLogEntry['type'],
  receivedAt = Date.now(),
): StatusLogEntry => ({
  message,
  receivedAt,
  type,
});

export const appendStatusLogEntries = (
  current: StatusLogEntry[],
  additions: StatusLogEntry[],
): StatusLogEntry[] => {
  if (additions.length === 0) {
    return current;
  }

  const next = [...current, ...additions];
  if (next.length <= MAX_STATUS_LOG_ENTRIES) {
    return next;
  }

  return next.slice(-MAX_STATUS_LOG_ENTRIES);
};
