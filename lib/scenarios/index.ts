import type { Scenario } from "./_shared/types.js";

import SB01 from "./SB-01-fix-throttle.js";
import SB02 from "./SB-02-frontend-derived-state-fix.js";
import SB03 from "./SB-03-frontend-query-owner.js";
import SB04 from "./SB-04-frontend-scope-discipline.js";
import SB05 from "./SB-05-frontend-stack-loyalty.js";
import SB06 from "./SB-06-frontend-red-herring.js";
import SB07 from "./SB-07-frontend-no-op.js";
import SB08 from "./SB-08-frontend-find-the-right-file.js";
import SB09 from "./SB-09-frontend-reuse-existing-abstraction.js";
import SB10 from "./SB-10-verify-and-repair.js";
import SB11 from "./SB-11-verify-fail-recover-pass.js";
import SB12 from "./SB-12-typescript-compile-loop.js";
import SB13 from "./SB-13-iterate-to-green.js";
import SB14 from "./SB-14-hono-admin-password-reset.js";
import SB15 from "./SB-15-hono-cursor-pagination.js";
import SB16 from "./SB-16-hono-audit-log.js";
import SB17 from "./SB-17-hono-soft-delete-restore.js";
import SB18 from "./SB-18-hono-fix-n-plus-1.js";
import SB19 from "./SB-19-high-frequency-loop.js";
import SB20 from "./SB-20-long-context-retrieval.js";
import SB21 from "./SB-21-axios-ssrf-protocol-relative.js";
import SB22 from "./SB-22-nextjs-server-client-boundary.js";
import SB23 from "./SB-23-express-middleware-order.js";
import SB24 from "./SB-24-react-hook-form-zod-resolver.js";
import SB25 from "./SB-25-tanstack-router-loader-ownership.js";
import SB26 from "./SB-26-zustand-store-mutation.js";
import SB27 from "./SB-27-sse-final-line.js";
import SB28 from "./SB-28-generated-types-discipline.js";
import SB29 from "./SB-29-test-isolation.js";
import SB30 from "./SB-30-webhook-hmac.js";
import SB31 from "./SB-31-woo-double-discount.js";
import SB32 from "./SB-32-template-escaping.js";
import SB33 from "./SB-33-plugin-conflict-red-herring.js";
import SB34 from "./SB-34-build-a-plugin.js";
import SB35 from "./SB-35-join-fanout.js";
import SB36 from "./SB-36-migration-backfill.js";
import SB37 from "./SB-37-reporting-query.js";
import SB38 from "./SB-38-actions-trigger.js";
import SB39 from "./SB-39-dockerfile-layers.js";
import SB40 from "./SB-40-deploy-script-exclude.js";
import SB41 from "./SB-41-liquid-soldout.js";
import SB42 from "./SB-42-astro-frontmatter-field.js";
import SB43 from "./SB-43-build-a-section.js";
import SB44 from "./SB-44-nav-stacking.js";
import SB45 from "./SB-45-theme-variable-scope.js";
import SB46 from "./SB-46-responsive-grid.js";
import SB47 from "./SB-47-go-nil-map.js";
import SB48 from "./SB-48-go-json-endpoint.js";
import SB49 from "./SB-49-rust-borrow.js";
import SB50 from "./SB-50-rust-off-by-one.js";

export const scenarios: Scenario[] = [
  SB01,
  SB02,
  SB03,
  SB04,
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
  SB24,
  SB25,
  SB26,
  SB27,
  SB28,
  SB29,
  SB30,
  SB31,
  SB32,
  SB33,
  SB34,
  SB35,
  SB36,
  SB37,
  SB38,
  SB39,
  SB40,
  SB41,
  SB42,
  SB43,
  SB44,
  SB45,
  SB46,
  SB47,
  SB48,
  SB49,
  SB50,
];

if (scenarios.length === 0 || scenarios.some((s) => !s.id)) {
  throw new Error(
    `Scenario registry failed validation: ${scenarios.length} entries, some missing ids`
  );
}

export { PLAYGROUND_SRC } from "./_shared/helpers.js";
export type { Scenario, EvaluateScenario, ExecuteScenario } from "./_shared/types.js";
