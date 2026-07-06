package main

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"sync"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"

	"logiccrackhub/api/internal/config"
	"logiccrackhub/api/internal/database"
	"logiccrackhub/api/internal/server"
)

var (
	initOnce sync.Once
	adapter  *httpadapter.HandlerAdapter
	db       *sql.DB
	initErr  error
)

func main() {
	lambda.Start(handler)
}

func handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	initOnce.Do(initAPI)
	if initErr != nil {
		log.Printf("api init failed: %v", initErr)
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
			Body: `{"error":"api initialization failed"}`,
		}, nil
	}

	request.Path = normalizePath(request.Path)
	request.Resource = request.Path
	return adapter.ProxyWithContext(ctx, request)
}

func initAPI() {
	cfg := config.Load()

	db, initErr = database.Open(cfg.DatabaseDSN)
	if initErr != nil {
		return
	}

	adapter = httpadapter.New(server.New(db, cfg).Routes())
}

func normalizePath(path string) string {
	const functionPrefix = "/.netlify/functions/api"
	if !strings.HasPrefix(path, functionPrefix) {
		return path
	}

	suffix := strings.TrimPrefix(path, functionPrefix)
	if suffix == "" || suffix == "/" {
		return "/"
	}
	if !strings.HasPrefix(suffix, "/") {
		suffix = "/" + suffix
	}
	if suffix == "/health" || suffix == "/api" || strings.HasPrefix(suffix, "/api/") {
		return suffix
	}
	return "/api" + suffix
}
