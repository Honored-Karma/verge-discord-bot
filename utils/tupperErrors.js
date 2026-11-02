export class TupperError extends Error {}
export const tupperErrorText = (error, fallback = 'Не удалось выполнить действие. Попробуйте снова.') =>
  error instanceof TupperError ? error.message : fallback;
