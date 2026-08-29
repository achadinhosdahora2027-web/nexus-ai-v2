import fs from 'fs';

export class DistributionLedger {
  constructor(filePath = 'growth-ledger.json') {
    this.filePath = filePath;
    this.state = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (e) {}
    return { lotsProcessed: {}, totalUrls: 0, lastRun: null };
  }

  recordLot(lotId, urlCount) {
    this.state.lotsProcessed[lotId] = {
      processedAt: new Date().toISOString(),
      urlCount
    };
    this.state.totalUrls += urlCount;
    this.state.lastRun = new Date().toISOString();
    this.save();
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
  }

  hasProcessed(lotId) {
    return !!this.state.lotsProcessed[lotId];
  }
}
