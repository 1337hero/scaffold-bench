package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

type User struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

var (
	users = map[string]*User{
		"u1": {ID: "u1", Name: "Alice", Email: "alice@example.com", Role: "admin", CreatedAt: time.Now()},
		"u2": {ID: "u2", Name: "Bob", Email: "bob@example.com", Role: "viewer", CreatedAt: time.Now()},
		"u3": {ID: "u3", Name: "Charlie", Email: "charlie@example.com", Role: "editor", CreatedAt: time.Now()},
	}
	mu sync.Mutex
)

func getUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	u, ok := users[id]
	mu.Unlock()
	if !ok {
		http.Error(w, "not found", 404)
		return
	}
	json.NewEncoder(w).Encode(u)
}

func listUsers(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	all := make([]*User, 0, len(users))
	for _, u := range users {
		all = append(all, u)
	}
	mu.Unlock()
	json.NewEncoder(w).Encode(all)
}

func deleteUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	delete(users, id)
	mu.Unlock()
	w.WriteHeader(200)
}

func promoteUser(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.Lock()
	u, ok := users[id]
	if !ok {
		mu.Unlock()
		http.Error(w, "not found", 404)
		return
	}
	// BUG: promotes any role to admin, even if already admin
	// also: should not allow promoting the last admin
	u.Role = "admin"
	mu.Unlock()
	json.NewEncoder(w).Encode(u)
}

func createUser(w http.ResponseWriter, r *http.Request) {
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	// BUG: no validation on Name, Email, or Role
	// BUG: no duplicate email check
	// BUG: ID is user-supplied, could overwrite existing
	u.CreatedAt = time.Now()
	mu.Lock()
	users[u.ID] = &u
	mu.Unlock()
	w.WriteHeader(201)
	json.NewEncoder(w).Encode(u)
}

func main() {
	http.HandleFunc("/user", getUser)
	http.HandleFunc("/users", listUsers)
	http.HandleFunc("/user/delete", deleteUser)
	http.HandleFunc("/user/promote", promoteUser)
	http.HandleFunc("/user/create", createUser)
	fmt.Println("listening on :9090")
	log.Fatal(http.ListenAndServe(":9090", nil))
}
