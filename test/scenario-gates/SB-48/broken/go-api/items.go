package main

import (
	"encoding/json"
	"net/http"
)

func handleItems(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"})
}
