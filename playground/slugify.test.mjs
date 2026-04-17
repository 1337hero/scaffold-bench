import assert from "node:assert/strict";
import { slugify } from "./slugify.mjs";

assert.equal(slugify("Hello World"), "hello-world");
assert.equal(slugify("Launch   Checklist"), "launch-checklist");
