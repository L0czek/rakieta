const CHECKLIST_TOPIC_PREFIX = 'checklist';

export const buildChecklistPointTopic = (checklistId: string, pointId: string): string =>
  `${CHECKLIST_TOPIC_PREFIX}/${checklistId}/points/${pointId}/state`;

export const parseChecklistPointTopic = (
  topic: string,
): { checklistId: string; pointId: string } | null => {
  const parts = topic.split('/');
  if (parts.length !== 5) {
    return null;
  }

  const [prefix, checklistId, pointsSegment, pointId, stateSegment] = parts;
  if (prefix !== CHECKLIST_TOPIC_PREFIX || pointsSegment !== 'points' || stateSegment !== 'state') {
    return null;
  }

  if (!checklistId || !pointId) {
    return null;
  }

  return { checklistId, pointId };
};
