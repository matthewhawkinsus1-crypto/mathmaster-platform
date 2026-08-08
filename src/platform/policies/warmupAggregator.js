const finiteOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export const aggregateWeeklyWarmups = (dailySubmissionsArray = []) => {
  const submissions = Array.isArray(dailySubmissionsArray) ? dailySubmissionsArray : [];
  const included = submissions.filter((day) => day && day.isExcused !== true && day.postedInDailyPost !== true);
  let totalEarned = 0;
  let totalPossible = 0;
  let daysAttempted = 0;

  included.forEach((day) => {
    const possible = Math.max(0, finiteOr(day.possible, 5));
    const earned = Math.max(0, Math.min(possible, finiteOr(day.earned, 0)));
    totalEarned += earned;
    totalPossible += possible;
    if (earned > 0 || day.hasAttempted === true) daysAttempted += 1;
  });

  const firstWeekStarting = submissions.find((day) => day?.weekStarting)?.weekStarting;
  const percentage = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  return {
    weekTotalEarned: totalEarned,
    weekTotalPossible: totalPossible,
    overallPercentage: percentage,
    daysAttempted,
    includedDays: included.length,
    excludedDays: submissions.length - included.length,
    syncTitle: `Warm-Ups — Week of ${firstWeekStarting || 'Current'}`,
    readyForSync: totalPossible > 0,
  };
};
