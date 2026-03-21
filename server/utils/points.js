function computePoints(attempts) {
  if (attempts === 1) return 10;
  if (attempts === 2) return 7;
  if (attempts === 3) return 4;
  return 1;
}

module.exports = { computePoints };
