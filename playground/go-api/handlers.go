package main

import (
	"encoding/json"
	"net/http"
)

var counts map[string]int

func handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var body struct{ Key string }
		json.NewDecoder(r.Body).Decode(&body)
		counts[body.Key]++
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(counts)
}
