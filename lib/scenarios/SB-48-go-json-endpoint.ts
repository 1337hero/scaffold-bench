import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  PLAYGROUND_SRC,
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  readTurnsForPath,
} from "./_shared/helpers.js";
import { goTest } from "./_shared/runners/go.js";

const GO_API_DIR = "playground/go-api";
const ITEMS_PATH = "playground/go-api/items.go";
const ITEMS_TEST_PATH = "playground/go-api/items_test.go";

const FIXED_HANDLERS = `package main

import (
\t"encoding/json"
\t"net/http"
)

var counts = make(map[string]int)

func handleStats(w http.ResponseWriter, r *http.Request) {
\tif r.Method == http.MethodPost {
\t\tvar body struct{ Key string }
\t\tjson.NewDecoder(r.Body).Decode(&body)
\t\tcounts[body.Key]++
\t}
\tw.Header().Set("Content-Type", "application/json")
\tjson.NewEncoder(w).Encode(counts)
}
`;

const PROMPT = `Implement the \`POST /items\` endpoint in \`playground/go-api/\`. The handler should decode JSON \`{"name": string, "qty": number}\`, return 400 with \`{"error": "..."}\` if name is missing or qty is less than 1, and return 201 with the item echoed back plus a generated \`id\` field. A test file is provided — make it pass using only the standard library.`;

export const meta = {
  id: "SB-48",
  name: "go-json-endpoint",
  category: "implementation" as const,
  family: "feature-add" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: GO_API_DIR,
  requires: ["go"],
  prompt: PROMPT,
} as const;

const ITEMS_TEST_CONTENT = `package main

import (
\t"encoding/json"
\t"net/http"
\t"net/http/httptest"
\t"strings"
\t"testing"
)

func TestPostItems_Valid(t *testing.T) {
\treq := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(\`{"name":"widget","qty":3}\`))
\treq.Header.Set("Content-Type", "application/json")
\tw := httptest.NewRecorder()
\thandleItems(w, req)
\tif w.Code != http.StatusCreated {
\t\tt.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
\t}
\tvar resp map[string]any
\tjson.Unmarshal(w.Body.Bytes(), &resp)
\tif resp["id"] == nil { t.Error("expected id in response") }
\tif resp["name"] != "widget" { t.Errorf("expected name=widget, got %v", resp["name"]) }
}

func TestPostItems_MissingName(t *testing.T) {
\treq := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(\`{"qty":3}\`))
\treq.Header.Set("Content-Type", "application/json")
\tw := httptest.NewRecorder()
\thandleItems(w, req)
\tif w.Code != http.StatusBadRequest {
\t\tt.Fatalf("expected 400, got %d", w.Code)
\t}
\tvar resp map[string]any
\tjson.Unmarshal(w.Body.Bytes(), &resp)
\tif resp["error"] == nil { t.Error("expected error field in 400 response") }
}

func TestPostItems_InvalidQty(t *testing.T) {
\treq := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(\`{"name":"x","qty":0}\`))
\treq.Header.Set("Content-Type", "application/json")
\tw := httptest.NewRecorder()
\thandleItems(w, req)
\tif w.Code != http.StatusBadRequest {
\t\tt.Fatalf("expected 400, got %d", w.Code)
\t}
}
`;

const scenario: Scenario = {
  id: "SB-48" as ScenarioId,
  name: "go-json-endpoint",
  category: "implementation",
  family: "feature-add",
  requires: ["go"],
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const goApiDir = join(playgroundDir, GO_API_DIR);

    const testResult = await goTest(goApiDir, {
      "handlers.go": FIXED_HANDLERS,
      "items_test.go": ITEMS_TEST_CONTENT,
    });

    const itemsSrc = await readOrEmpty(join(playgroundDir, ITEMS_PATH));
    const itemsTestSrc = await readOrEmpty(join(playgroundDir, ITEMS_TEST_PATH));
    const itemsTestOriginal = await readOrEmpty(join(PLAYGROUND_SRC, "go-api/items_test.go")).catch(
      () => ""
    );

    const changeTurn = firstChangeTurn(toolCalls);

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [ITEMS_PATH, "playground/go-api/items.go"],
    });

    const usesStdlibOnly = !/^\s*"[^"]+\.[^"]+\//.test(itemsSrc);
    const usesJsonError = /["']error["']/.test(itemsSrc);
    const usesStatusCreated = /StatusCreated|201/.test(itemsSrc);
    const patternOk = usesStdlibOnly && usesJsonError && usesStatusCreated;

    const readTestBeforeImpl = readTurnsForPath(toolCalls, ITEMS_TEST_PATH).some(
      (t) => changeTurn === undefined || t <= changeTurn
    );

    const noPrintln = !/fmt\.Println\s*\(/.test(itemsSrc);

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "go test ./... passes (all 3 test cases green)",
            pass: testResult.ok,
            weight: 3,
            detail: testResult.ok ? undefined : testResult.stderr + testResult.stdout,
          },
        ],
        scope: [
          {
            name: "only handler file(s) changed; items_test.go untouched",
            pass: scope.pass && itemsTestSrc === itemsTestOriginal,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "stdlib only; JSON error shape; uses StatusCreated",
            pass: patternOk,
            weight: 2,
            detail: patternOk
              ? undefined
              : `stdlibOnly=${usesStdlibOnly} jsonError=${usesJsonError} statusCreated=${usesStatusCreated}`,
          },
        ],
        verification: [
          {
            name: "read items_test.go before implementing",
            pass: readTestBeforeImpl,
            weight: 1,
          },
        ],
        cleanup: [
          {
            name: "no fmt.Println debug output",
            pass: noPrintln,
            weight: 2,
          },
        ],
      },
      {
        pass: "POST /items implemented correctly; all 3 test cases pass.",
        partial: "Implementation partial — some test cases fail or scope/pattern issues.",
        fail: "Implementation missing or test cases fail.",
      }
    );
  },
};

export default scenario;
