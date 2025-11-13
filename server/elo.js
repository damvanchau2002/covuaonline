export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(ratingA, ratingB, scoreA, kFactor = 32) {
  const expA = expectedScore(ratingA, ratingB);
  const newA = Math.round(ratingA + kFactor * (scoreA - expA));
  const expB = expectedScore(ratingB, ratingA);
  const scoreB = 1 - scoreA;
  const newB = Math.round(ratingB + kFactor * (scoreB - expB));
  return [newA, newB];
}