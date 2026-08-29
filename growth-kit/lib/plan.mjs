import fs from 'fs';
import path from 'path';

export function createPlan({ totalPages = 1000000, lotSize = 10000, niches = [] } = {}) {
  const totalLots = Math.ceil(totalPages / lotSize);
  const lots = [];
  
  for (let i = 0; i < totalLots; i++) {
    const lotId = `l${String(i).padStart(6, '0')}`;
    lots.push({
      lotId,
      index: i,
      size: lotSize,
      start: i * lotSize,
      end: Math.min((i + 1) * lotSize, totalPages),
      niches: niches.length > 0 ? niches : ['tech', 'travel', 'productivity', 'cybersecurity', 'b2b-saas']
    });
  }

  return {
    universeSize: totalPages,
    lotSize,
    totalLots,
    generatedAt: new Date().toISOString(),
    lots
  };
}

export function savePlan(plan, outPath = 'lots.json') {
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
}
