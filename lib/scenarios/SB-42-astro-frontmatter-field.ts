import { join } from "node:path";
import type { ScenarioId } from "../schemas/brands.js";
import type { Scenario } from "./_shared/types.js";
import { rubricToEvaluation } from "./_shared/rubric.js";
import {
  firstChangeTurn,
  onlyChangedFiles,
  readOrEmpty,
  readTurnsForPath,
} from "./_shared/helpers.js";

const CONFIG_PATH = "playground/astro-site/src/content.config.ts";
const SLUG_PATH = "playground/astro-site/src/pages/blog/[slug].astro";

const PROMPT = `Add an optional \`heroImage\` field to the blog post collection in \`playground/astro-site/src/content.config.ts\`, and render it in the blog post page template at \`playground/astro-site/src/pages/blog/[slug].astro\`. The notes collection and other pages should not be touched.`;

export const meta = {
  id: "SB-42",
  name: "astro-frontmatter-field",
  category: "scope-discipline" as const,
  family: "feature-add" as const,
  difficulty: "low" as const,
  rubricKind: "10pt" as const,
  signalType: "behavioral" as const,
  fixturePath: "playground/astro-site/",
  prompt: PROMPT,
} as const;

const scenario: Scenario = {
  id: "SB-42" as ScenarioId,
  name: "astro-frontmatter-field",
  category: "scope-discipline",
  family: "feature-add",
  difficulty: "low",
  prompt: PROMPT,
  async evaluate({ playgroundDir, toolCalls }) {
    const configPath = join(playgroundDir, CONFIG_PATH);
    const slugPath = join(playgroundDir, SLUG_PATH);

    const config = await readOrEmpty(configPath);
    const slug = await readOrEmpty(slugPath);

    // Blog schema has heroImage with .optional()
    const blogHeroImageOptional = /heroImage\s*:\s*z\.string\(\)(?:\.url\(\))?\.optional\(\)/.test(
      config
    );

    // Notes schema does NOT have heroImage
    const notesSection = config.split(/const notes/)[1] ?? "";
    const notesHasHeroImage = /heroImage/.test(
      notesSection.split(/export const collections/)[0] ?? notesSection
    );

    // Template renders heroImage conditionally
    const templateConditional =
      /\{post\.data\.heroImage\s*&&/.test(slug) ||
      /heroImage\s*\?\s*/.test(slug) ||
      /\{post\.data\.heroImage\s*\?/.test(slug);

    // Template does NOT reference heroImage unconditionally (like <img src={post.data.heroImage} /> without guard)
    const unconditionalImg =
      /<img[^>]*\{post\.data\.heroImage\}[^>]*>/.test(slug) && !templateConditional;

    const scope = await onlyChangedFiles({
      playgroundDir,
      allowedPaths: [CONFIG_PATH, SLUG_PATH],
    });

    const changeTurn = firstChangeTurn(toolCalls);
    const configReadBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, CONFIG_PATH).some((t) => t < changeTurn);
    const slugReadBeforeEdit =
      changeTurn !== undefined &&
      readTurnsForPath(toolCalls, SLUG_PATH).some((t) => t < changeTurn);
    const readBeforeEdit = configReadBeforeEdit || slugReadBeforeEdit;

    const noCommentedExperiments = !/\/\/.*heroImage/.test(slug) && !/\/\/.*heroImage/.test(config);

    const correctness1 = blogHeroImageOptional;
    const correctness2 = !notesHasHeroImage;
    const correctness3 = templateConditional && !unconditionalImg;

    return rubricToEvaluation(
      {
        correctness: [
          {
            name: "blog schema has heroImage: z.string().optional()",
            pass: correctness1,
            weight: 1,
            detail: correctness1 ? undefined : "heroImage not found as optional in blog schema",
          },
          {
            name: "notes schema does NOT have heroImage",
            pass: correctness2,
            weight: 1,
            detail: correctness2 ? undefined : "heroImage found in notes schema — wrong scope",
          },
          {
            name: "template renders heroImage conditionally",
            pass: correctness3,
            weight: 1,
            detail: correctness3 ? undefined : "heroImage not conditionally guarded in template",
          },
        ],
        scope: [
          {
            name: "only content.config.ts and [slug].astro changed",
            pass: scope.pass,
            weight: 2,
            detail: scope.detail,
          },
        ],
        pattern: [
          {
            name: "heroImage field is optional (not required)",
            pass: blogHeroImageOptional,
            weight: 1,
            detail: blogHeroImageOptional ? undefined : "heroImage is required, should be optional",
          },
          {
            name: "template renders heroImage defensively",
            pass: templateConditional,
            weight: 1,
            detail: templateConditional ? undefined : "heroImage not guarded before render",
          },
        ],
        verification: [
          {
            name: "read content.config.ts or [slug].astro before editing",
            pass: readBeforeEdit,
            weight: 1,
            detail: readBeforeEdit ? undefined : "no read of target files before editing",
          },
        ],
        cleanup: [
          {
            name: "no commented-out experiments",
            pass: noCommentedExperiments,
            weight: 1,
            detail: noCommentedExperiments ? undefined : "commented heroImage experiments found",
          },
          {
            name: "no spurious file changes",
            pass: scope.pass,
            weight: 1,
            detail: scope.pass ? undefined : `extra files: ${scope.detail}`,
          },
        ],
      },
      {
        pass: "heroImage optional in blog only; template guards render; notes untouched.",
        partial: "heroImage added but wrong scope or missing guard.",
        fail: "heroImage missing or notes schema polluted.",
      }
    );
  },
};

export default scenario;
