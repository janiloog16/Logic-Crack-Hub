package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"logiccrackhub/api/internal/config"
	"logiccrackhub/api/internal/database"
	"logiccrackhub/api/internal/server"
)

func main() {
	cfg := config.Load()

	db, err := database.Open(cfg.DatabaseDSN)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	go func() {
		ticker := time.NewTicker(4 * time.Minute)
		defer ticker.Stop()
		for {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			if err := db.PingContext(ctx); err != nil {
				log.Printf("database warm ping failed: %v", err)
			}
			cancel()
			<-ticker.C
		}
	}()

	api := server.New(db, cfg)
	httpServer := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      api.Routes(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 20 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Logic Crack Hub API listening on http://localhost:%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
