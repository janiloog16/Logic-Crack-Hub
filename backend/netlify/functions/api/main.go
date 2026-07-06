package main

import (
	"context"
	"database/sql"
	"log"
	"net/url"
	"os"
	"strconv"
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
	initCode string
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
			Body: `{"error":"api initialization failed","code":"` + initCode + `"}`,
		}, nil
	}

	request.Path = normalizePath(request.Path)
	request.Resource = request.Path
	return adapter.ProxyWithContext(ctx, request)
}

func initAPI() {
	cfg := config.Load()

	initCode = "database_direct"
	if os.Getenv("DATABASE_URL") == "" && os.Getenv("DATABASE_DSN") == "" {
		initCode = "database_env_missing"
	}

	db, initErr = database.Open(cfg.DatabaseDSN)
	if initErr != nil {
		fallbackDSNs := supabasePoolerDSNs(cfg.DatabaseDSN)
		for index, fallbackDSN := range fallbackDSNs {
			initCode = "database_pooler_" + strconv.Itoa(index+1)
			log.Printf("direct database connection failed; retrying with Supabase pooler")
			db, initErr = database.Open(fallbackDSN)
			if initErr == nil {
				break
			}
		}
	}
	if initErr != nil {
		initCode = initFailureCode(initCode, initErr)
		return
	}

	initCode = ""
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

func supabasePoolerDSNs(dsn string) []string {
	parsed, err := url.Parse(dsn)
	if err != nil || parsed.User == nil {
		return nil
	}

	host := parsed.Hostname()
	if !strings.HasPrefix(host, "db.") || !strings.HasSuffix(host, ".supabase.co") {
		return nil
	}

	projectRef := strings.TrimSuffix(strings.TrimPrefix(host, "db."), ".supabase.co")
	region := os.Getenv("SUPABASE_POOLER_REGION")
	if region == "" {
		region = defaultPoolerRegion(projectRef)
	}
	if region == "" {
		return nil
	}

	password, ok := parsed.User.Password()
	if !ok {
		return nil
	}

	sessionQuery := parsed.Query()
	sessionQuery.Set("sslmode", "require")
	transactionQuery := parsed.Query()
	transactionQuery.Set("sslmode", "require")
	transactionQuery.Set("default_query_exec_mode", "simple_protocol")

	var dsns []string
	for _, cluster := range []string{"aws-0", "aws-1"} {
		dsns = append(dsns,
			poolerDSN(parsed, projectRef, password, cluster, region, "5432", sessionQuery),
			poolerDSN(parsed, projectRef, password, cluster, region, "6543", transactionQuery),
		)
	}
	return dsns
}

func poolerDSN(parsed *url.URL, projectRef, password, cluster, region, port string, query url.Values) string {
	next := *parsed
	next.User = url.UserPassword(parsed.User.Username()+"."+projectRef, password)
	next.Host = cluster + "-" + region + ".pooler.supabase.com:" + port
	next.RawQuery = query.Encode()
	return next.String()
}

func initFailureCode(stage string, err error) string {
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "password authentication failed"):
		return stage + "_auth"
	case strings.Contains(message, "tenant or user not found"):
		return stage + "_tenant"
	case strings.Contains(message, "no such host"):
		return stage + "_dns"
	case strings.Contains(message, "no route to host"), strings.Contains(message, "network is unreachable"):
		return stage + "_network"
	case strings.Contains(message, "timeout"), strings.Contains(message, "deadline exceeded"):
		return stage + "_timeout"
	default:
		return stage + "_failed"
	}
}

func defaultPoolerRegion(projectRef string) string {
	if projectRef == "eznfwppqvjveekwuknwu" {
		return "ap-southeast-2"
	}
	return ""
}
