package main

import (
	"log"
	"net/http"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/stats", handleStats)
	mux.HandleFunc("/items", handleItems)
	log.Fatal(http.ListenAndServe(":8080", mux))
}
