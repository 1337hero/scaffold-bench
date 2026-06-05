import type { Difficulty, EvaluatorKind, ScenarioMeta, Stack, Surface, TaskType } from "./types.js";

import { meta as SB01 } from "../SB-01-fix-throttle.js";
import { meta as SB02 } from "../SB-02-frontend-derived-state-fix.js";
import { meta as SB03 } from "../SB-03-frontend-query-owner.js";
import { meta as SB04 } from "../SB-04-frontend-scope-discipline.js";
import { meta as SB05 } from "../SB-05-frontend-stack-loyalty.js";
import { meta as SB06 } from "../SB-06-frontend-red-herring.js";
import { meta as SB07 } from "../SB-07-frontend-no-op.js";
import { meta as SB08 } from "../SB-08-frontend-find-the-right-file.js";
import { meta as SB09 } from "../SB-09-frontend-reuse-existing-abstraction.js";
import { meta as SB10 } from "../SB-10-verify-and-repair.js";
import { meta as SB11 } from "../SB-11-verify-fail-recover-pass.js";
import { meta as SB12 } from "../SB-12-typescript-compile-loop.js";
import { meta as SB13 } from "../SB-13-iterate-to-green.js";
import { meta as SB14 } from "../SB-14-hono-admin-password-reset.js";
import { meta as SB15 } from "../SB-15-hono-cursor-pagination.js";
import { meta as SB16 } from "../SB-16-hono-audit-log.js";
import { meta as SB17 } from "../SB-17-hono-soft-delete-restore.js";
import { meta as SB18 } from "../SB-18-hono-fix-n-plus-1.js";
import { meta as SB19 } from "../SB-19-high-frequency-loop.js";
import { meta as SB20 } from "../SB-20-long-context-retrieval.js";
import { meta as SB21 } from "../SB-21-axios-ssrf-protocol-relative.js";
import { meta as SB22 } from "../SB-22-nextjs-server-client-boundary.js";
import { meta as SB23 } from "../SB-23-express-middleware-order.js";
import { meta as SB24 } from "../SB-24-react-hook-form-zod-resolver.js";
import { meta as SB25 } from "../SB-25-tanstack-router-loader-ownership.js";
import { meta as SB26 } from "../SB-26-zod-cross-field-refine.js";
import { meta as SB27 } from "../SB-27-optimistic-rollback.js";
import { meta as SB28 } from "../SB-28-query-stale-refetch.js";
import { meta as SB29 } from "../SB-29-route-action-ownership.js";
import { meta as SB30 } from "../SB-30-next-client-server-boundary.js";
import { meta as SB31 } from "../SB-31-view-state-precedence.js";
import { meta as SB32 } from "../SB-32-a11y-form-labels.js";
import { meta as SB33 } from "../SB-33-responsive-breakpoints.js";
import { meta as SB34 } from "../SB-34-component-extraction.js";
import { meta as SB35 } from "../SB-35-focus-trap.js";
import { meta as SB36 } from "../SB-36-hono-session-invalidation.js";
import { meta as SB37 } from "../SB-37-hono-admin-role-guard.js";
import { meta as SB38 } from "../SB-38-hono-idempotent-create.js";
import { meta as SB39 } from "../SB-39-hono-typed-validation.js";
import { meta as SB40 } from "../SB-40-hono-catalog-pagination.js";
import { meta as SB41 } from "../SB-41-hono-additive-migration.js";
import { meta as SB42 } from "../SB-42-tsc-strict-fix.js";
import { meta as SB43 } from "../SB-43-tsconfig-path-alias.js";
import { meta as SB44 } from "../SB-44-hono-cors-csrf.js";
import { meta as SB45 } from "../SB-45-tsc-api-upgrade.js";
import { meta as SB46 } from "../SB-46-hono-reuse-abstractions.js";
import { meta as SB47 } from "../SB-47-hono-cross-subsystem-error-id.js";
import { meta as SB48 } from "../SB-48-extend-preserving-tests.js";
import { meta as SB49 } from "../SB-49-cross-subsystem-reuse.js";
import { meta as SB50 } from "../SB-50-hono-user-is-wrong-logout.js";

type BaseMeta = Pick<
  ScenarioMeta,
  "id" | "name" | "category" | "family" | "rubricKind" | "signalType" | "fixturePath" | "prompt"
>;

type Extra = {
  evaluatorKind: EvaluatorKind;
  stacks: Stack[];
  taskType: TaskType;
  difficulty: Difficulty;
  surface: Surface;
};

type Tests = { public: string[]; hidden: string[] };

const noTests: Tests = { public: [], hidden: [] };

const build = (base: BaseMeta, extra: Extra, tests: Tests = noTests): ScenarioMeta => ({
  ...base,
  ...extra,
  tests,
});

let _registry: Record<string, ScenarioMeta> | null = null;

// Built lazily on first access: meta.ts is re-exported via scoring.ts, which the
// scenario files (and their helpers) import — eager construction here would touch
// the SBxx meta bindings mid-cycle, before they finish initializing.
function buildRegistry(): Record<string, ScenarioMeta> {
  return {
    "SB-01": build(
      SB01,
      {
        evaluatorKind: "unit",
        stacks: ["node", "typescript"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "backend",
      },
      {
        public: ["playground/utils.throttle.test.mjs"],
        hidden: ["lib/scenarios/hidden/SB-01/throttle-semantics.test.ts"],
      }
    ),
    "SB-02": build(SB02, {
      evaluatorKind: "regex",
      stacks: ["react", "tanstack-query"],
      taskType: "bugfix",
      difficulty: "small",
      surface: "frontend",
    }),
    "SB-03": build(SB03, {
      evaluatorKind: "regex",
      stacks: ["react", "tanstack-query"],
      taskType: "refactor",
      difficulty: "medium",
      surface: "frontend",
    }),
    "SB-04": build(
      SB04,
      {
        evaluatorKind: "unit",
        stacks: ["react", "tanstack-query"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["OrdersPanel.test.tsx"],
        hidden: ["approve-refreshes-orders.test.ts"],
      }
    ),
    "SB-05": build(SB05, {
      evaluatorKind: "regex",
      stacks: ["react", "tanstack-query"],
      taskType: "feature",
      difficulty: "medium",
      surface: "frontend",
    }),
    "SB-06": build(SB06, {
      evaluatorKind: "stdout",
      stacks: ["react", "tanstack-query"],
      taskType: "no-op",
      difficulty: "small",
      surface: "frontend",
    }),
    "SB-07": build(SB07, {
      evaluatorKind: "stdout",
      stacks: ["react", "tanstack-query"],
      taskType: "no-op",
      difficulty: "small",
      surface: "frontend",
    }),
    "SB-08": build(SB08, {
      evaluatorKind: "regex",
      stacks: ["react"],
      taskType: "bugfix",
      difficulty: "small",
      surface: "frontend",
    }),
    "SB-09": build(SB09, {
      evaluatorKind: "regex",
      stacks: ["react", "tanstack-query"],
      taskType: "feature",
      difficulty: "medium",
      surface: "frontend",
    }),
    "SB-10": build(SB10, {
      evaluatorKind: "regex",
      stacks: ["node"],
      taskType: "bugfix",
      difficulty: "small",
      surface: "backend",
    }),
    "SB-11": build(SB11, {
      evaluatorKind: "regex",
      stacks: ["node"],
      taskType: "bugfix",
      difficulty: "small",
      surface: "backend",
    }),
    "SB-12": build(SB12, {
      evaluatorKind: "regex",
      stacks: ["typescript", "node"],
      taskType: "bugfix",
      difficulty: "medium",
      surface: "tooling",
    }),
    "SB-13": build(SB13, {
      evaluatorKind: "trace",
      stacks: ["node"],
      taskType: "bugfix",
      difficulty: "small",
      surface: "backend",
    }),
    "SB-14": build(SB14, {
      evaluatorKind: "unit",
      stacks: ["hono", "sqlite", "typescript"],
      taskType: "feature",
      difficulty: "medium",
      surface: "backend",
    }),
    "SB-15": build(SB15, {
      evaluatorKind: "unit",
      stacks: ["hono", "sqlite", "typescript"],
      taskType: "feature",
      difficulty: "medium",
      surface: "backend",
    }),
    "SB-16": build(SB16, {
      evaluatorKind: "unit",
      stacks: ["hono", "sqlite", "typescript"],
      taskType: "feature",
      difficulty: "medium",
      surface: "backend",
    }),
    "SB-17": build(SB17, {
      evaluatorKind: "unit",
      stacks: ["hono", "sqlite", "typescript"],
      taskType: "feature",
      difficulty: "medium",
      surface: "backend",
    }),
    "SB-18": build(
      SB18,
      {
        evaluatorKind: "sql",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "refactor",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-18-fix-n-plus-1.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-18/query-count.test.ts"],
      }
    ),
    "SB-19": build(SB19, {
      evaluatorKind: "latency",
      stacks: ["node"],
      taskType: "bugfix",
      difficulty: "medium",
      surface: "tooling",
    }),
    "SB-20": build(SB20, {
      evaluatorKind: "latency",
      stacks: ["node"],
      taskType: "no-op",
      difficulty: "large",
      surface: "tooling",
    }),
    "SB-21": build(SB21, {
      evaluatorKind: "unit",
      stacks: ["axios", "node"],
      taskType: "security",
      difficulty: "medium",
      surface: "backend",
    }),
    "SB-22": build(SB22, {
      evaluatorKind: "regex",
      stacks: ["next", "react", "typescript"],
      taskType: "bugfix",
      difficulty: "small",
      surface: "fullstack",
    }),
    "SB-23": build(SB23, {
      evaluatorKind: "unit",
      stacks: ["express", "node"],
      taskType: "bugfix",
      difficulty: "medium",
      surface: "backend",
    }),
    "SB-24": build(
      SB24,
      {
        evaluatorKind: "unit",
        stacks: ["react", "react-hook-form", "zod"],
        taskType: "feature",
        difficulty: "medium",
        surface: "frontend",
      },
      {
        public: ["signupSchema.test.ts"],
        hidden: ["resolver-blocks-invalid.test.ts"],
      }
    ),
    "SB-25": build(
      SB25,
      {
        evaluatorKind: "unit",
        stacks: ["tanstack-router", "react"],
        taskType: "refactor",
        difficulty: "medium",
        surface: "frontend",
      },
      {
        public: ["src/apiClient.test.ts"],
        hidden: ["loader-fetches-once.test.ts"],
      }
    ),
    "SB-26": build(
      SB26,
      {
        evaluatorKind: "unit",
        stacks: ["zod", "react-hook-form", "typescript"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["playground/sb26-checkout-schema/checkoutSchema.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-26/cross-field-validation.test.ts"],
      }
    ),
    "SB-27": build(
      SB27,
      {
        evaluatorKind: "unit",
        stacks: ["react", "typescript"],
        taskType: "bugfix",
        difficulty: "medium",
        surface: "frontend",
      },
      {
        public: ["playground/sb27-optimistic-like/likeStore.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-27/rollback-on-error.test.ts"],
      }
    ),
    "SB-28": build(
      SB28,
      {
        evaluatorKind: "unit",
        stacks: ["tanstack-query", "typescript"],
        taskType: "bugfix",
        difficulty: "medium",
        surface: "frontend",
      },
      {
        public: ["playground/sb28-query-cache/queryCache.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-28/refetch-counts.test.ts"],
      }
    ),
    "SB-29": build(
      SB29,
      {
        evaluatorKind: "unit",
        stacks: ["tanstack-router", "react", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "frontend",
      },
      {
        public: ["playground/sb29-route-action/src/projectAction.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-29/action-owns-mutation.test.ts"],
      }
    ),
    "SB-30": build(SB30, {
      evaluatorKind: "ast",
      stacks: ["next", "react", "typescript"],
      taskType: "security",
      difficulty: "medium",
      surface: "frontend",
    }),
    "SB-31": build(
      SB31,
      {
        evaluatorKind: "unit",
        stacks: ["react", "tanstack-query", "typescript"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["playground/sb31-view-state/viewState.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-31/view-state-precedence.test.ts"],
      }
    ),
    "SB-32": build(
      SB32,
      {
        evaluatorKind: "a11y",
        stacks: ["react", "typescript"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["playground/sb32-a11y-labels/searchForm.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-32/labels-associated.test.ts"],
      }
    ),
    "SB-33": build(
      SB33,
      {
        evaluatorKind: "unit",
        stacks: ["react", "typescript"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["playground/sb33-responsive/grid.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-33/breakpoints.test.ts"],
      }
    ),
    "SB-34": build(
      SB34,
      {
        evaluatorKind: "ast",
        stacks: ["react", "typescript"],
        taskType: "refactor",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["playground/sb34-extract/priceTag.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-34/extraction-behavior.test.ts"],
      }
    ),
    "SB-35": build(
      SB35,
      {
        evaluatorKind: "a11y",
        stacks: ["react", "typescript"],
        taskType: "bugfix",
        difficulty: "small",
        surface: "frontend",
      },
      {
        public: ["playground/sb35-focus-trap/focusTrap.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-35/focus-wraps.test.ts"],
      }
    ),
    "SB-36": build(
      SB36,
      {
        evaluatorKind: "unit",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-36-session-invalidation.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-36/session-invalidation.test.ts"],
      }
    ),
    "SB-37": build(
      SB37,
      {
        evaluatorKind: "unit",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-37-admin-user-list.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-37/admin-guard.test.ts"],
      }
    ),
    "SB-38": build(
      SB38,
      {
        evaluatorKind: "unit",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-38-idempotent-create.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-38/idempotency.test.ts"],
      }
    ),
    "SB-39": build(
      SB39,
      {
        evaluatorKind: "unit",
        stacks: ["hono", "zod", "sqlite", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-39-typed-validation.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-39/validation-shape.test.ts"],
      }
    ),
    "SB-40": build(
      SB40,
      {
        evaluatorKind: "api",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-40-catalog-list.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-40/catalog-pagination.test.ts"],
      }
    ),
    "SB-41": build(
      SB41,
      {
        evaluatorKind: "sql",
        stacks: ["sqlite", "typescript", "node"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-41-migration.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-41/migration-compat.test.ts"],
      }
    ),
    "SB-42": build(SB42, {
      evaluatorKind: "unit",
      stacks: ["typescript", "node"],
      taskType: "bugfix",
      difficulty: "medium",
      surface: "tooling",
    }),
    "SB-43": build(SB43, {
      evaluatorKind: "unit",
      stacks: ["typescript", "node"],
      taskType: "bugfix",
      difficulty: "medium",
      surface: "tooling",
    }),
    "SB-44": build(
      SB44,
      {
        evaluatorKind: "api",
        stacks: ["hono", "typescript"],
        taskType: "security",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-44-cors-csrf.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-44/cors-csrf.test.ts"],
      }
    ),
    "SB-45": build(SB45, {
      evaluatorKind: "unit",
      stacks: ["typescript", "node"],
      taskType: "tooling",
      difficulty: "medium",
      surface: "tooling",
    }),
    "SB-46": build(
      SB46,
      {
        evaluatorKind: "unit",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-46-stats-reuse.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-46/stats.test.ts"],
      }
    ),
    "SB-47": build(
      SB47,
      {
        evaluatorKind: "unit",
        stacks: ["hono", "sqlite", "typescript"],
        taskType: "refactor",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/hono-api/tests/sb-47-error-request-id.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-47/cross-subsystem.test.ts"],
      }
    ),
    "SB-48": build(
      SB48,
      {
        evaluatorKind: "unit",
        stacks: ["typescript", "node"],
        taskType: "feature",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/sb48-pricing/pricing.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-48/pricing-extended.test.ts"],
      }
    ),
    "SB-49": build(
      SB49,
      {
        evaluatorKind: "ast",
        stacks: ["typescript", "node"],
        taskType: "bugfix",
        difficulty: "medium",
        surface: "backend",
      },
      {
        public: ["playground/sb49-format/src/receipts.test.ts"],
        hidden: ["lib/scenarios/hidden/SB-49/cross-subsystem.test.ts"],
      }
    ),
    "SB-50": build(SB50, {
      evaluatorKind: "stdout",
      stacks: ["hono", "sqlite", "typescript"],
      taskType: "bugfix",
      difficulty: "medium",
      surface: "backend",
    }),
  };
}

export function getMeta(id: string): ScenarioMeta {
  _registry ??= buildRegistry();
  const meta = _registry[id];
  if (!meta) throw new Error(`getMeta: unknown scenario id "${id}"`);
  return meta;
}

export function tryGetMeta(id: string): ScenarioMeta | undefined {
  _registry ??= buildRegistry();
  return _registry[id];
}
