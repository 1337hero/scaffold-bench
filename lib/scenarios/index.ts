import type { Scenario } from "./_shared/types.js";

import SB01 from "./SB-01-fix-throttle.js";
import SB05 from "./SB-05-frontend-derived-state-fix.js";
import SB06 from "./SB-06-frontend-query-owner.js";
import SB07 from "./SB-07-frontend-scope-discipline.js";
import SB08 from "./SB-08-frontend-stack-loyalty.js";
import SB09 from "./SB-09-frontend-red-herring.js";
import SB10 from "./SB-10-frontend-no-op.js";
import SB11 from "./SB-11-frontend-find-the-right-file.js";
import SB12 from "./SB-12-frontend-reuse-existing-abstraction.js";
import SB13 from "./SB-13-verify-and-repair.js";
import SB14 from "./SB-14-verify-fail-recover-pass.js";
import SB15 from "./SB-15-typescript-compile-loop.js";
import SB16 from "./SB-16-iterate-to-green.js";
import SB17 from "./SB-17-hono-admin-password-reset.js";
import SB18 from "./SB-18-hono-cursor-pagination.js";
import SB19 from "./SB-19-hono-audit-log.js";
import SB20 from "./SB-20-hono-soft-delete-restore.js";
import SB21 from "./SB-21-hono-fix-n-plus-1.js";
import SB22 from "./SB-22-high-frequency-loop.js";
import SB23 from "./SB-23-long-context-retrieval.js";
import SB26 from "./SB-26-axios-ssrf-protocol-relative.js";

export const scenarios: Scenario[] = [
  SB01,
  SB05,
  SB06,
  SB07,
  SB08,
  SB09,
  SB10,
  SB11,
  SB12,
  SB13,
  SB14,
  SB15,
  SB16,
  SB17,
  SB18,
  SB19,
  SB20,
  SB21,
  SB22,
  SB23,
  SB26,
];

if (scenarios.length !== 21) {
  throw new Error(`Expected 21 active scenarios, got ${scenarios.length}`);
}

export { PLAYGROUND_SRC } from "./_shared/helpers.js";
export type { Scenario, EvaluateScenario, ExecuteScenario } from "./_shared/types.js";
