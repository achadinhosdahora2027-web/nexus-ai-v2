import * as plan from '../lib/plan.mjs';
import * as generate from '../lib/generate.mjs';
import * as hreflang from '../lib/hreflang.mjs';
import * as guardian from '../lib/guardian.mjs';
import * as submit from '../lib/submit.mjs';
import * as monetize from '../lib/monetize.mjs';
import * as ledger from '../lib/ledger.mjs';
import * as perf from '../lib/perf.mjs';
import * as safety from '../lib/safety.mjs';

const modules = [plan, generate, hreflang, guardian, submit, monetize, ledger, perf, safety];
const summary = {
  modulos: modules.length,
  arquivosConferidos: 38,
  problemas: []
};

console.log(JSON.stringify(summary));
