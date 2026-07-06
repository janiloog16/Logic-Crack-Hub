package main

import (
	"context"
	"database/sql"
	"log"
	"net/url"
	"os"
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
		if fallbackDSN, ok := supabasePoolerDSN(cfg.DatabaseDSN); ok {
			log.Printf("direct database connection failed; retrying with Supabase pooler")
			db, initErr = database.Open(fallbackDSN)
		}
	}
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

func supabasePoolerDSN(dsn string) (string, bool) {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.User == nil {
		return "", false
	}

	host := parsed.Hostname()
	if !strings.HasPrefix(host, "db.") || !strings.HasSuffix(host, ".supabase.co") {
		return "", false
	}

	projectRef := strings.TrimSuffix(strings.TrimPrefix(host, "db."), ".supabase.co")
	region := os.Getenv("SUPABASE_POOLER_REGION")
	if region == "" {
		region = defaultPoolerRegion(projectRef)
	}
	if region == "" {
		return "", false
	}

	password, ok := parsed.User.Password()
	if !ok {
		return "", false
	}

	query := parsed.Query()
	query.Set("sslmode", "require")

	parsed.User = url.UserPassword(parsed.User.Username()+"."+projectRef, password)
	parsed.Host = "aws-0-" + region + ".pooler.supabase.com:5432"
	parsed.RawQuery = query.Encode()
	return parsed.String(), true
}

func defaultPoolerRegion(projectRef string) string {
	if projectRef == "eznfwppqvjveekwuknwu" {
		return "ap-southeast-2"
	}
	return ""
}
