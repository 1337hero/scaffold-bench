package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPostItems_Valid(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(`{"name":"widget","qty":3}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleItems(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["id"] == nil { t.Error("expected id in response") }
	if resp["name"] != "widget" { t.Errorf("expected name=widget, got %v", resp["name"]) }
}

func TestPostItems_MissingName(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(`{"qty":3}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleItems(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] == nil { t.Error("expected error field in 400 response") }
}

func TestPostItems_InvalidQty(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/items", strings.NewReader(`{"name":"x","qty":0}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handleItems(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}
