package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleStats_Post(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/stats", strings.NewReader(`{"Key":"foo"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleStats(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
