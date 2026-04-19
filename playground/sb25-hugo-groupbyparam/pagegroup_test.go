package pagegroup

import "testing"

type fakePage struct {
	params map[string]any
}

func (f *fakePage) Param(key string) any {
	return f.params[key]
}

func mkPage(params map[string]any) *fakePage {
	return &fakePage{params: params}
}

// None of the pages has the requested param. GroupByParam should return
// (nil, nil) — not an error. Mirrors Hugo's behaviour for SortByParam
// and GroupByParamDate; avoids dead-ends for new sites / theme demos.
func TestGroupByParamMissingParam(t *testing.T) {
	pages := Pages{
		mkPage(map[string]any{"color": "red"}),
		mkPage(map[string]any{"color": "blue"}),
	}
	result, err := pages.GroupByParam("missing")
	if err != nil {
		t.Errorf("expected no error for missing param; got %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty group; got %d entries", len(result))
	}
}

// Empty Pages: already correct before the fix — returns (nil, nil).
// Kept as a guard so the fix doesn't regress the empty case.
func TestGroupByParamEmptyPages(t *testing.T) {
	pages := Pages{}
	result, err := pages.GroupByParam("anything")
	if err != nil {
		t.Errorf("expected no error on empty Pages; got %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty group; got %d entries", len(result))
	}
}

// Param exists on all pages: grouping should still work after the fix.
// Guards against a "lazy" fix that just short-circuits the whole function.
func TestGroupByParamWorksWhenParamExists(t *testing.T) {
	pages := Pages{
		mkPage(map[string]any{"color": "red"}),
		mkPage(map[string]any{"color": "blue"}),
		mkPage(map[string]any{"color": "red"}),
	}
	result, err := pages.GroupByParam("color")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 2 {
		t.Fatalf("expected 2 groups; got %d", len(result))
	}
	// asc order: blue, red
	if result[0].Key != "blue" || len(result[0].Pages) != 1 {
		t.Errorf("group 0: expected blue/1; got %v/%d", result[0].Key, len(result[0].Pages))
	}
	if result[1].Key != "red" || len(result[1].Pages) != 2 {
		t.Errorf("group 1: expected red/2; got %v/%d", result[1].Key, len(result[1].Pages))
	}
}
