// Extracted from @babel/generator's SourceMap class. When an inputSourceMap
// is supplied to generate(), source-map's setSourceContent is called for
// each resolved source.
//
// BUG: inputMap.sourcesContent is optional per the source-map v3 spec.
// When the caller omits it, `inputMap.sourcesContent[i]` throws
// "Cannot read properties of undefined (reading '0')" instead of
// gracefully passing undefined through.

// Minimal stand-in for source-map's SourceMapGenerator so the test can
// observe what was set.
export class SourceMapGenerator {
  constructor() {
    this.entries = [];
  }
  setSourceContent(source, content) {
    this.entries.push({ source, content });
  }
}

export function applyInputMap(map, inputMap, resolvedSources) {
  if (inputMap.sources) {
    for (let i = 0; i < inputMap.sources.length; i++) {
      map.setSourceContent(
        resolvedSources[i],
        inputMap.sourcesContent[i]
      );
    }
  }
  return map;
}
