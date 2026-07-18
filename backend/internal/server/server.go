package server

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"logiccrackhub/api/internal/auth"
	"logiccrackhub/api/internal/config"
	"logiccrackhub/api/internal/httpx"
	"logiccrackhub/api/internal/models"
)

type Server struct {
	db          *sql.DB
	cfg         config.Config
	email       *emailService
	otp         *otpService
	rateLimiter *rateLimiter
}

type contextKey string

const userContextKey contextKey = "user"

var dailyRewards = map[int]int{
	1: 10,
	2: 20,
	3: 30,
	4: 40,
	5: 50,
	6: 60,
	7: 100,
}

type creditPackage struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Credits     int    `json:"credits"`
	AmountCents int    `json:"amount_cents"`
	Currency    string `json:"currency"`
	Badge       string `json:"badge"`
}

var creditPackages = []creditPackage{
	{ID: "starter", Name: "Starter Pack", Credits: 100, AmountCents: 199, Currency: "usd", Badge: "For quick downloads"},
	{ID: "builder", Name: "Builder Pack", Credits: 350, AmountCents: 499, Currency: "usd", Badge: "Best for regular users"},
	{ID: "studio", Name: "Studio Pack", Credits: 900, AmountCents: 999, Currency: "usd", Badge: "Most value"},
}

func New(db *sql.DB, cfg config.Config) *Server {
	return &Server{
		db:          db,
		cfg:         cfg,
		email:       newEmailService(cfg),
		otp:         newOTPService(cfg.JWTSecret),
		rateLimiter: newRateLimiter(),
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))

	r.Route("/api", func(r chi.Router) {
		r.With(s.limitSensitive("register", 5, 10*time.Minute)).Post("/auth/register", s.register)
		r.With(s.limitSensitive("login", 8, 10*time.Minute)).Post("/auth/login", s.login)
		r.With(s.limitSensitive("forgot-password", 4, 10*time.Minute)).Post("/auth/forgot-password", s.forgotPassword)
		r.With(s.limitSensitive("resend-email-verification", 4, 10*time.Minute)).Post("/auth/resend-email-verification", s.resendEmailVerification)
		r.With(s.limitSensitive("verify-reset-code", 8, 10*time.Minute)).Post("/auth/verify-reset-code", s.verifyResetCode)
		r.With(s.limitSensitive("reset-password", 5, 10*time.Minute)).Post("/auth/reset-password", s.resetPassword)
		r.With(s.limitSensitive("verify-email", 8, 10*time.Minute)).Post("/auth/verify-email", s.verifyEmail)

		r.Get("/categories", s.listCategories)
		r.Get("/assets", s.listAssets)
		r.Get("/assets/{id}", s.getAsset)
		r.Get("/users/{id}", s.publicProfile)
		r.Get("/requests", s.listRequests)
		r.Post("/stripe/webhook", s.stripeWebhook)

		r.Group(func(r chi.Router) {
			r.Use(s.authRequired)
			r.Get("/auth/me", s.me)
			r.Get("/profile", s.profile)
			r.Put("/profile", s.updateProfile)
			r.Post("/profile/avatar", s.uploadProfileAvatar)
			r.Post("/auth/email-verification", s.createEmailVerification)
			r.Get("/credits/history", s.creditHistory)
			r.Get("/credits/packages", s.creditPackages)
			r.Post("/credits/checkout", s.createCreditCheckout)
			r.Post("/rewards/claim", s.claimReward)
			r.Post("/assets/{id}/download", s.downloadAsset)
			r.Get("/assets/{id}/me", s.getMyAssetState)
			r.Post("/assets/{id}/favorite", s.toggleFavorite)
			r.Post("/assets/{id}/reviews", s.reviewAsset)
			r.Post("/requests", s.createRequest)
			r.Post("/requests/{id}/vote", s.voteRequest)
			r.Get("/notifications", s.listNotifications)
			r.Get("/messages/users", s.searchMessageUsers)
			r.Get("/messages/unread-count", s.unreadMessageCount)
			r.Get("/messages/conversations", s.listConversations)
			r.Post("/messages/conversations", s.startConversation)
			r.Get("/messages/conversations/{id}", s.getConversationMessages)
			r.Post("/messages/conversations/{id}/messages", s.sendMessage)
			r.Patch("/messages/conversations/{id}/read", s.markConversationRead)
			r.Delete("/messages/{id}", s.deleteMessageForMe)
			r.Delete("/messages/{id}/everyone", s.deleteMessageForEveryone)
			r.Post("/messages/{id}/forward", s.forwardMessage)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.adminRequired)
			r.Get("/admin/stats", s.adminStats)
			r.Get("/admin/users", s.adminListUsers)
			r.Get("/admin/requests", s.adminListRequests)
			r.Post("/admin/assets", s.createAsset)
			r.Put("/admin/assets/{id}", s.updateAsset)
			r.Delete("/admin/assets/{id}", s.deleteAsset)
			r.Post("/admin/notifications", s.createNotification)
			r.Get("/admin/notifications", s.adminListNotifications)
			r.Put("/admin/notifications/{id}", s.updateNotification)
			r.Delete("/admin/notifications/{id}", s.deleteNotification)
			r.Put("/admin/requests/{id}/status", s.updateRequestStatus)
		})
	})

	return r
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	input.Name = strings.TrimSpace(input.Name)
	email, ok := normalizeEmail(input.Email)
	input.Email = email
	if !ok || input.Name == "" || len(input.Name) > 120 || len(input.Password) < 8 || len(input.Password) > 128 {
		httpx.Error(w, http.StatusBadRequest, "name, valid email, and 8+ character password are required")
		return
	}

	if emailAlreadyRegistered(r.Context(), s.db, input.Email) {
		httpx.Error(w, http.StatusConflict, "This email is already registered.")
		return
	}

	hash, err := auth.HashPassword(input.Password)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not secure password")
		return
	}

	code, err := s.otp.GenerateCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create verification code")
		return
	}

	now := time.Now().UTC()
	_, _ = execContext(s.db, r.Context(), `DELETE FROM pending_registrations WHERE email = ?`, input.Email)
	_, err = execContext(s.db, r.Context(),
		`INSERT INTO pending_registrations (name, email, password_hash, otp_hash, expires_at, resend_available_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		input.Name, input.Email, hash, s.otp.Hash(code), now.Add(otpExpiryMinutes*time.Minute), now.Add(otpResendSeconds*time.Second),
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start email verification")
		return
	}

	if err := s.email.SendVerificationCode(r.Context(), input.Email, input.Name, code, "email_verification"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send verification email")
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]string{"status": "verification code sent", "email": input.Email})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	identifier := strings.ToLower(strings.TrimSpace(input.Email))
	if email, ok := normalizeEmail(identifier); ok {
		identifier = email
	}
	if identifier == "" || len(identifier) > 190 || input.Password == "" {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	var user models.User
	var passwordHash string
	err := queryRowContext(s.db, r.Context(),
		`SELECT id, name, email, password_hash, COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(full_name, ''),
		        COALESCE(bio, ''), COALESCE(date_of_birth::text, ''), COALESCE(avatar_url, ''), COALESCE(location, ''),
		        COALESCE(website, ''), role, credits, created_at
		 FROM users WHERE email = ?`,
		identifier,
	).Scan(
		&user.ID, &user.Name, &user.Email, &passwordHash, &user.FirstName, &user.LastName, &user.FullName,
		&user.Bio, &user.DateOfBirth, &user.AvatarURL, &user.Location, &user.Website, &user.Role, &user.Credits, &user.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) || !auth.CheckPassword(passwordHash, input.Password) {
		httpx.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not log in")
		return
	}

	token, err := auth.GenerateToken(s.cfg.JWTSecret, user.ID, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email, ok := normalizeEmail(input.Email)
	if !ok {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "if the account exists, a reset code was sent"})
		return
	}
	var userID int64
	var name string
	err := queryRowContext(s.db, r.Context(), `SELECT id, name FROM users WHERE email = ?`, email).Scan(&userID, &name)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "if the account exists, a reset code was sent"})
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start password reset")
		return
	}

	var resendAvailableAt time.Time
	err = queryRowContext(s.db, r.Context(), `SELECT resend_available_at FROM password_reset_otps WHERE user_id = ?`, userID).Scan(&resendAvailableAt)
	if err == nil && time.Now().UTC().Before(resendAvailableAt) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "if the account exists, a reset code was sent"})
		return
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "could not start password reset")
		return
	}

	code, err := s.otp.GenerateCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create reset code")
		return
	}

	now := time.Now().UTC()
	_, _ = execContext(s.db, r.Context(), `DELETE FROM password_reset_otps WHERE user_id = ?`, userID)
	_, err = execContext(s.db, r.Context(),
		`INSERT INTO password_reset_otps (user_id, otp_hash, expires_at, resend_available_at) VALUES (?, ?, ?, ?)`,
		userID, s.otp.Hash(code), now.Add(otpExpiryMinutes*time.Minute), now.Add(otpResendSeconds*time.Second),
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create reset code")
		return
	}

	if err := s.email.SendVerificationCode(r.Context(), email, name, code, "password_reset"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send reset email")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "if the account exists, a reset code was sent"})
}

func (s *Server) resendEmailVerification(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email, ok := normalizeEmail(input.Email)
	if !ok {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "if this email can be verified, a code was sent"})
		return
	}
	var pending struct {
		ID                int64
		Name              string
		ResendAvailableAt time.Time
	}
	err := queryRowContext(s.db, r.Context(),
		`SELECT id, name, resend_available_at FROM pending_registrations WHERE email = ?`,
		email,
	).Scan(&pending.ID, &pending.Name, &pending.ResendAvailableAt)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "if this email can be verified, a code was sent"})
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not resend verification code")
		return
	}
	now := time.Now().UTC()
	if now.Before(pending.ResendAvailableAt) {
		httpx.Error(w, http.StatusTooManyRequests, "please wait before requesting another code")
		return
	}

	code, err := s.otp.GenerateCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create verification code")
		return
	}
	_, err = execContext(s.db, r.Context(),
		`UPDATE pending_registrations
		 SET otp_hash = ?, attempts = 0, expires_at = ?, resend_available_at = ?, updated_at = ?
		 WHERE id = ?`,
		s.otp.Hash(code), now.Add(otpExpiryMinutes*time.Minute), now.Add(otpResendSeconds*time.Second), now, pending.ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not resend verification code")
		return
	}
	if err := s.email.SendVerificationCode(r.Context(), email, pending.Name, code, "email_verification"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send verification email")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "verification code sent"})
}

func (s *Server) verifyResetCode(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email, ok := normalizeEmail(input.Email)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "reset code is invalid or expired")
		return
	}
	var reset struct {
		ID        int64
		OTPHash   string
		Attempts  int
		ExpiresAt time.Time
	}
	err := queryRowContext(s.db, r.Context(),
		`SELECT pro.id, pro.otp_hash, pro.attempts, pro.expires_at
		 FROM password_reset_otps pro
		 JOIN users u ON u.id = pro.user_id
		 WHERE u.email = ?`,
		email,
	).Scan(&reset.ID, &reset.OTPHash, &reset.Attempts, &reset.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusBadRequest, "reset code is invalid or expired")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not verify reset code")
		return
	}
	if reset.Attempts >= maxOTPAttempts || time.Now().UTC().After(reset.ExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "reset code is invalid or expired")
		return
	}
	if !s.otp.Matches(reset.OTPHash, strings.TrimSpace(input.OTP)) {
		_, _ = execContext(s.db, r.Context(), `UPDATE password_reset_otps SET attempts = attempts + 1, updated_at = ? WHERE id = ?`, time.Now().UTC(), reset.ID)
		httpx.Error(w, http.StatusBadRequest, "reset code is invalid or expired")
		return
	}

	resetToken, err := randomToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create reset token")
		return
	}
	now := time.Now().UTC()
	_, err = execContext(s.db, r.Context(),
		`UPDATE password_reset_otps
		 SET verified = TRUE, reset_token_hash = ?, reset_token_expires_at = ?, updated_at = ?
		 WHERE id = ?`,
		s.otp.Hash(resetToken), now.Add(resetTokenValidity*time.Minute), now, reset.ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not verify reset code")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "reset code verified", "reset_token": resetToken})
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token       string `json:"token"`
		ResetToken  string `json:"reset_token"`
		NewPassword string `json:"new_password"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(input.NewPassword) < 8 {
		httpx.Error(w, http.StatusBadRequest, "new password must be at least 8 characters")
		return
	}

	resetToken := strings.TrimSpace(input.ResetToken)
	if resetToken == "" {
		resetToken = strings.TrimSpace(input.Token)
	}
	var userID int64
	err := queryRowContext(s.db, r.Context(),
		`SELECT user_id FROM password_reset_otps
		 WHERE reset_token_hash = ? AND verified = TRUE AND reset_token_expires_at > ?`,
		s.otp.Hash(resetToken), time.Now().UTC(),
	).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusBadRequest, "reset token is invalid or expired")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not verify reset token")
		return
	}

	hash, err := auth.HashPassword(input.NewPassword)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not secure password")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	defer tx.Rollback()

	if _, err := execContext(tx, r.Context(), `UPDATE users SET password_hash = ? WHERE id = ?`, hash, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update password")
		return
	}
	if _, err := execContext(tx, r.Context(), `DELETE FROM password_reset_otps WHERE user_id = ?`, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not finalize password reset")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not complete password reset")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "password reset"})
}

func (s *Server) createEmailVerification(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	code, err := s.otp.GenerateCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create verification code")
		return
	}

	now := time.Now().UTC()
	_, _ = execContext(s.db, r.Context(), `DELETE FROM email_verification_tokens WHERE user_id = ?`, user.ID)
	_, err = execContext(s.db, r.Context(),
		`INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`,
		user.ID, s.otp.Hash(code), now.Add(otpExpiryMinutes*time.Minute),
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create verification code")
		return
	}

	if err := s.email.SendVerificationCode(r.Context(), user.Email, user.Name, code, "email_verification"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send verification email")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]string{"status": "verification code sent"})
}

func (s *Server) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email string `json:"email"`
		OTP   string `json:"otp"`
		Token string `json:"token"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email, ok := normalizeEmail(input.Email)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "verification code is invalid or expired")
		return
	}
	code := strings.TrimSpace(input.OTP)
	if code == "" {
		code = strings.TrimSpace(input.Token)
	}

	var pending struct {
		ID           int64
		Name         string
		Email        string
		PasswordHash string
		OTPHash      string
		Attempts     int
		ExpiresAt    time.Time
	}
	err := queryRowContext(s.db, r.Context(),
		`SELECT id, name, email, password_hash, otp_hash, attempts, expires_at
		 FROM pending_registrations WHERE email = ?`,
		email,
	).Scan(&pending.ID, &pending.Name, &pending.Email, &pending.PasswordHash, &pending.OTPHash, &pending.Attempts, &pending.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusBadRequest, "verification code is invalid or expired")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not verify email")
		return
	}
	if pending.Attempts >= maxOTPAttempts || time.Now().UTC().After(pending.ExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, "verification code is invalid or expired")
		return
	}
	if !s.otp.Matches(pending.OTPHash, code) {
		_, _ = execContext(s.db, r.Context(), `UPDATE pending_registrations SET attempts = attempts + 1, updated_at = ? WHERE id = ?`, time.Now().UTC(), pending.ID)
		httpx.Error(w, http.StatusBadRequest, "verification code is invalid or expired")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not verify email")
		return
	}
	defer tx.Rollback()

	now := time.Now().UTC()
	var user models.User
	err = queryRowContext(tx, r.Context(),
		`INSERT INTO users (name, email, password_hash, role, credits, email_verified_at)
		 VALUES (?, ?, ?, 'user', 0, ?)
		 RETURNING id, name, email, COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(full_name, ''),
		           COALESCE(bio, ''), COALESCE(date_of_birth::text, ''), COALESCE(avatar_url, ''), COALESCE(location, ''),
		           COALESCE(website, ''), role, credits, created_at`,
		pending.Name, pending.Email, pending.PasswordHash, now,
	).Scan(
		&user.ID, &user.Name, &user.Email, &user.FirstName, &user.LastName, &user.FullName,
		&user.Bio, &user.DateOfBirth, &user.AvatarURL, &user.Location, &user.Website, &user.Role, &user.Credits, &user.CreatedAt,
	)
	if err != nil {
		httpx.Error(w, http.StatusConflict, "email is already registered")
		return
	}
	if _, err := execContext(tx, r.Context(), `DELETE FROM pending_registrations WHERE id = ?`, pending.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not finalize verification")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not complete verification")
		return
	}

	token, err := auth.GenerateToken(s.cfg.JWTSecret, user.ID, user.Role)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, currentUser(r))
}

func (s *Server) profile(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	stats, err := s.profileStats(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load profile")
		return
	}
	activity, err := s.profileActivity(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load profile")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": user, "stats": stats, "activity": activity})
}

func (s *Server) publicProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	user, err := s.userByID(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load user")
		return
	}
	stats, err := s.profileStats(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load user")
		return
	}
	publicUser := map[string]any{
		"id":         user.ID,
		"name":       user.Name,
		"full_name":  user.FullName,
		"bio":        user.Bio,
		"avatar_url": user.AvatarURL,
		"location":   user.Location,
		"website":    user.Website,
		"created_at": user.CreatedAt,
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": publicUser, "stats": stats})
}

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var input profilePayload
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	payload, ok := normalizeProfilePayload(input)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "profile fields are invalid or too long")
		return
	}

	user := currentUser(r)
	_, err := execContext(s.db, r.Context(),
		`UPDATE users
		 SET name = ?, first_name = ?, last_name = ?, full_name = ?, bio = ?, date_of_birth = NULLIF(?, '')::date,
		     avatar_url = ?, location = ?, website = ?, updated_at = now()
		 WHERE id = ?`,
		payload.Name, payload.FirstName, payload.LastName, payload.FullName, payload.Bio, payload.DateOfBirth,
		payload.AvatarURL, payload.Location, payload.Website, user.ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "could not update profile")
		return
	}

	updated, err := s.userByID(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "profile updated but could not be loaded")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": updated})
}

func (s *Server) uploadProfileAvatar(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		httpx.Error(w, http.StatusBadRequest, "image must be 5MB or smaller")
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "avatar image is required")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(io.LimitReader(file, 5<<20+1))
	if err != nil || len(content) == 0 || len(content) > 5<<20 {
		httpx.Error(w, http.StatusBadRequest, "image must be 5MB or smaller")
		return
	}
	contentType := http.DetectContentType(content)
	extension := strings.ToLower(filepath.Ext(header.Filename))
	if contentType != "image/jpeg" && contentType != "image/png" && contentType != "image/webp" {
		httpx.Error(w, http.StatusBadRequest, "only JPG, PNG, or WEBP images are allowed")
		return
	}
	if extension == "" {
		extension = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[contentType]
	}

	user := currentUser(r)
	objectPath := fmt.Sprintf("avatars/user-%d-%d%s", user.ID, time.Now().Unix(), extension)
	avatarURL, err := s.storeAvatar(r.Context(), r, objectPath, contentType, content)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not upload avatar")
		return
	}
	_, err = execContext(s.db, r.Context(), `UPDATE users SET avatar_url = ?, updated_at = now() WHERE id = ?`, avatarURL, user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "avatar uploaded but profile could not be updated")
		return
	}
	updated, err := s.userByID(r.Context(), user.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "avatar uploaded but profile could not be loaded")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"avatar_url": avatarURL, "user": updated})
}

func (s *Server) listCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := queryContext(s.db, r.Context(), `SELECT id, name, slug FROM categories ORDER BY name ASC`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load categories")
		return
	}
	defer rows.Close()

	categories := []models.Category{}
	for rows.Next() {
		var category models.Category
		if err := rows.Scan(&category.ID, &category.Name, &category.Slug); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read categories")
			return
		}
		categories = append(categories, category)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"categories": categories})
}

func (s *Server) listAssets(w http.ResponseWriter, r *http.Request) {
	query := `
		SELECT a.id, a.title, a.slug, a.thumbnail_url, COALESCE(a.download_url, ''), COALESCE(a.gallery_urls, '[]'::jsonb)::text,
		       a.description, COALESCE(a.features, '[]'::jsonb)::text, a.unity_version, a.file_size,
		       a.download_count, a.rating, c.id, c.name, c.slug, a.credit_cost, a.changelog,
		       a.version, COALESCE(a.tags, '[]'::jsonb)::text, a.created_at, a.updated_at
		FROM assets a
		JOIN categories c ON c.id = a.category_id
		WHERE 1 = 1`

	args := []any{}
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))
	if search != "" {
		pattern := "%" + search + "%"
		query += ` AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ? OR LOWER(COALESCE(a.tags, '[]'::jsonb)::text) LIKE ?)`
		args = append(args, pattern, pattern, pattern)
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	if category != "" && category != "all" {
		query += ` AND (c.slug = ? OR c.name = ?)`
		args = append(args, category, category)
	}

	query += " ORDER BY " + assetSort(r.URL.Query().Get("sort"))

	limit := int64FromQuery(r, "limit", 24, 60)
	query += " LIMIT ?"
	args = append(args, limit)

	rows, err := queryContext(s.db, r.Context(), query, args...)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load assets")
		return
	}
	defer rows.Close()

	assets := []models.Asset{}
	for rows.Next() {
		asset, err := scanAsset(rows)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read assets")
			return
		}
		assets = append(assets, asset)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"assets": assets})
}

func (s *Server) getAsset(w http.ResponseWriter, r *http.Request) {
	rawID := chi.URLParam(r, "id")
	asset, err := s.findAsset(r.Context(), rawID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "asset not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load asset")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"asset": asset})
}

func (s *Server) createAsset(w http.ResponseWriter, r *http.Request) {
	payload, ok := decodeAssetPayload(w, r)
	if !ok {
		return
	}

	if payload.Slug == "" {
		payload.Slug = slugify(payload.Title)
	}

	var id int64
	err := queryRowContext(s.db, r.Context(),
		`INSERT INTO assets
			(title, slug, thumbnail_url, download_url, gallery_urls, description, features, unity_version,
			 file_size, category_id, credit_cost, changelog, version, tags, created_by, published_at)
		 VALUES (?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, now())
		 RETURNING id`,
		payload.Title, payload.Slug, payload.ThumbnailURL, payload.DownloadURL, encodeList(payload.GalleryURLs), payload.Description,
		encodeList(payload.Features), payload.UnityVersion, payload.FileSize, payload.CategoryID,
		payload.CreditCost, payload.Changelog, payload.Version, encodeList(payload.Tags), currentUser(r).ID,
	).Scan(&id)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "could not create asset")
		return
	}

	asset, err := s.findAssetByID(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "asset created but could not be loaded")
		return
	}
	s.logAdminAction(r.Context(), currentUser(r).ID, "asset.create", "asset", id, map[string]any{"title": asset.Title, "slug": asset.Slug})
	httpx.JSON(w, http.StatusCreated, map[string]any{"asset": asset})
}

func (s *Server) updateAsset(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}

	payload, ok := decodeAssetPayload(w, r)
	if !ok {
		return
	}
	if payload.Slug == "" {
		payload.Slug = slugify(payload.Title)
	}

	_, err := execContext(s.db, r.Context(),
		`UPDATE assets
		 SET title = ?, slug = ?, thumbnail_url = ?, download_url = ?, gallery_urls = ?::jsonb, description = ?, features = ?::jsonb,
		     unity_version = ?, file_size = ?, category_id = ?, credit_cost = ?, changelog = ?,
		     version = ?, tags = ?::jsonb, updated_at = now()
		 WHERE id = ?`,
		payload.Title, payload.Slug, payload.ThumbnailURL, payload.DownloadURL, encodeList(payload.GalleryURLs), payload.Description,
		encodeList(payload.Features), payload.UnityVersion, payload.FileSize, payload.CategoryID,
		payload.CreditCost, payload.Changelog, payload.Version, encodeList(payload.Tags), id,
	)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "could not update asset")
		return
	}

	asset, err := s.findAssetByID(r.Context(), id)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "asset not found")
		return
	}
	s.logAdminAction(r.Context(), currentUser(r).ID, "asset.update", "asset", id, map[string]any{"title": asset.Title, "slug": asset.Slug})
	httpx.JSON(w, http.StatusOK, map[string]any{"asset": asset})
}

func (s *Server) deleteAsset(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}

	result, err := execContext(s.db, r.Context(), `DELETE FROM assets WHERE id = ?`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete asset")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		httpx.Error(w, http.StatusNotFound, "asset not found")
		return
	}

	s.logAdminAction(r.Context(), currentUser(r).ID, "asset.delete", "asset", id, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) downloadAsset(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	user := currentUser(r)

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start download")
		return
	}
	defer tx.Rollback()

	var title string
	var cost int
	var downloadURL string
	if err := queryRowContext(tx, r.Context(), `SELECT title, credit_cost, COALESCE(download_url, '') FROM assets WHERE id = ? FOR UPDATE`, assetID).Scan(&title, &cost, &downloadURL); err != nil {
		httpx.Error(w, http.StatusNotFound, "asset not found")
		return
	}

	var previousDownloads int
	_ = queryRowContext(tx, r.Context(), `SELECT COUNT(*) FROM downloads WHERE user_id = ? AND asset_id = ?`, user.ID, assetID).Scan(&previousDownloads)

	charged := 0
	if previousDownloads == 0 && cost > 0 {
		var credits int
		if err := queryRowContext(tx, r.Context(), `SELECT credits FROM users WHERE id = ? FOR UPDATE`, user.ID).Scan(&credits); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not check credits")
			return
		}
		if credits < cost {
			httpx.Error(w, http.StatusPaymentRequired, "not enough credits")
			return
		}

		if _, err := execContext(tx, r.Context(), `UPDATE users SET credits = credits - ? WHERE id = ?`, cost, user.ID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not spend credits")
			return
		}
		if _, err := execContext(tx, r.Context(),
			`INSERT INTO credit_transactions (user_id, amount, type, description)
			 VALUES (?, ?, 'asset_download', ?)`,
			user.ID, -cost, fmt.Sprintf("Downloaded %s", title),
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not record credit transaction")
			return
		}
		charged = cost
	}

	if _, err := execContext(tx, r.Context(), `INSERT INTO downloads (user_id, asset_id) VALUES (?, ?)`, user.ID, assetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not record download")
		return
	}
	if _, err := execContext(tx, r.Context(), `UPDATE assets SET download_count = download_count + 1 WHERE id = ?`, assetID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update download count")
		return
	}

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not complete download")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"status": "ready", "charged_credits": charged, "already_owned": previousDownloads > 0, "download_url": downloadURL})
}

func (s *Server) toggleFavorite(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID

	var favoriteID int64
	err := queryRowContext(s.db, r.Context(), `SELECT id FROM favorites WHERE user_id = ? AND asset_id = ?`, userID, assetID).Scan(&favoriteID)
	if err == nil {
		_, _ = execContext(s.db, r.Context(), `DELETE FROM favorites WHERE id = ?`, favoriteID)
		httpx.JSON(w, http.StatusOK, map[string]any{"favorited": false})
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "could not update favorite")
		return
	}

	if _, err := execContext(s.db, r.Context(), `INSERT INTO favorites (user_id, asset_id) VALUES (?, ?)`, userID, assetID); err != nil {
		httpx.Error(w, http.StatusBadRequest, "could not add favorite")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"favorited": true})
}

func (s *Server) getMyAssetState(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID

	var favoriteCount int
	if err := queryRowContext(s.db, r.Context(),
		`SELECT COUNT(*) FROM favorites WHERE user_id = ? AND asset_id = ?`,
		userID, assetID,
	).Scan(&favoriteCount); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load favorite state")
		return
	}

	var downloadURL string
	var downloadCount int
	if err := queryRowContext(s.db, r.Context(),
		`SELECT COUNT(*), COALESCE(MAX(a.download_url), '')
		 FROM downloads d
		 JOIN assets a ON a.id = d.asset_id
		 WHERE d.user_id = ? AND d.asset_id = ?`,
		userID, assetID,
	).Scan(&downloadCount, &downloadURL); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load download state")
		return
	}

	var review struct {
		Rating    int       `json:"rating"`
		Comment   string    `json:"comment"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	err := queryRowContext(s.db, r.Context(),
		`SELECT rating, COALESCE(comment, ''), updated_at FROM reviews WHERE user_id = ? AND asset_id = ?`,
		userID, assetID,
	).Scan(&review.Rating, &review.Comment, &review.UpdatedAt)
	hasReview := true
	if errors.Is(err, sql.ErrNoRows) {
		hasReview = false
	} else if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load review state")
		return
	}

	payload := map[string]any{
		"favorited":      favoriteCount > 0,
		"has_downloaded": downloadCount > 0,
		"download_url":   nil,
		"review":         nil,
	}
	if downloadCount > 0 && downloadURL != "" {
		payload["download_url"] = downloadURL
	}
	if hasReview {
		payload["review"] = review
	}

	httpx.JSON(w, http.StatusOK, payload)
}

func (s *Server) reviewAsset(w http.ResponseWriter, r *http.Request) {
	assetID, ok := pathID(w, r, "id")
	if !ok {
		return
	}

	var input struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &input); err != nil || input.Rating < 1 || input.Rating > 5 {
		httpx.Error(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}

	_, err := execContext(s.db, r.Context(),
		`INSERT INTO reviews (user_id, asset_id, rating, comment)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT (user_id, asset_id)
		 DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()`,
		currentUser(r).ID, assetID, input.Rating, strings.TrimSpace(input.Comment),
	)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "could not save review")
		return
	}

	_, _ = execContext(s.db, r.Context(),
		`UPDATE assets SET rating = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE asset_id = ?) WHERE id = ?`,
		assetID, assetID,
	)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"status":  "reviewed",
		"rating":  input.Rating,
		"comment": strings.TrimSpace(input.Comment),
	})
}

func (s *Server) claimReward(w http.ResponseWriter, r *http.Request) {
	userID := currentUser(r).ID
	now := time.Now().UTC()

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start reward claim")
		return
	}
	defer tx.Rollback()

	var lastDay int
	var lastClaim time.Time
	err = queryRowContext(tx, r.Context(),
		`SELECT streak_day, claimed_at FROM daily_reward_claims WHERE user_id = ? ORDER BY claimed_at DESC LIMIT 1`,
		userID,
	).Scan(&lastDay, &lastClaim)

	nextDay := 1
	if err == nil {
		elapsed := now.Sub(lastClaim)
		if elapsed < 24*time.Hour {
			httpx.Error(w, http.StatusTooEarly, "daily reward already claimed")
			return
		}
		if elapsed <= 48*time.Hour {
			nextDay = lastDay + 1
			if nextDay > 7 {
				nextDay = 1
			}
		}
	} else if !errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusInternalServerError, "could not check reward streak")
		return
	}

	reward := dailyRewards[nextDay]
	badge := nextDay == 7
	if _, err := execContext(tx, r.Context(),
		`INSERT INTO daily_reward_claims (user_id, streak_day, reward_amount, badge_awarded, claimed_at)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, nextDay, reward, badge, now,
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not record reward")
		return
	}
	if _, err := execContext(tx, r.Context(), `UPDATE users SET credits = credits + ? WHERE id = ?`, reward, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not add credits")
		return
	}
	if _, err := execContext(tx, r.Context(),
		`INSERT INTO credit_transactions (user_id, amount, type, description)
		 VALUES (?, ?, 'daily_reward', ?)`,
		userID, reward, fmt.Sprintf("Day %d daily reward", nextDay),
	); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not record credit transaction")
		return
	}

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not complete reward claim")
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"streak_day":     nextDay,
		"reward":         reward,
		"bonus_badge":    badge,
		"next_resets_to": map[bool]int{true: 1, false: nextDay + 1}[nextDay == 7],
	})
}

func (s *Server) creditHistory(w http.ResponseWriter, r *http.Request) {
	rows, err := queryContext(s.db, r.Context(),
		`SELECT id, amount, type, description, created_at
		 FROM credit_transactions
		 WHERE user_id = ?
		 ORDER BY created_at DESC
		 LIMIT 50`,
		currentUser(r).ID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load credit history")
		return
	}
	defer rows.Close()

	transactions := []models.CreditTransaction{}
	for rows.Next() {
		var tx models.CreditTransaction
		if err := rows.Scan(&tx.ID, &tx.Amount, &tx.Type, &tx.Description, &tx.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read credit history")
			return
		}
		transactions = append(transactions, tx)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"transactions": transactions})
}

func (s *Server) creditPackages(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"packages": creditPackages})
}

func (s *Server) createCreditCheckout(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(s.cfg.StripeSecretKey) == "" {
		httpx.Error(w, http.StatusServiceUnavailable, "payments are not configured yet")
		return
	}
	var input struct {
		PackageID string `json:"package_id"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pkg, ok := findCreditPackage(input.PackageID)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "credit package not found")
		return
	}
	user := currentUser(r)
	var purchaseID int64
	err := queryRowContext(s.db, r.Context(),
		`INSERT INTO credit_purchases (user_id, package_id, credits, amount_cents, currency, status)
		 VALUES (?, ?, ?, ?, ?, 'pending')
		 RETURNING id`,
		user.ID, pkg.ID, pkg.Credits, pkg.AmountCents, pkg.Currency,
	).Scan(&purchaseID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start payment")
		return
	}

	session, err := s.createStripeCheckoutSession(r.Context(), user, pkg, purchaseID)
	if err != nil {
		_, _ = execContext(s.db, r.Context(), `UPDATE credit_purchases SET status = 'failed' WHERE id = ?`, purchaseID)
		httpx.Error(w, http.StatusBadGateway, "could not open Stripe checkout")
		return
	}
	_, err = execContext(s.db, r.Context(),
		`UPDATE credit_purchases SET stripe_session_id = ? WHERE id = ?`,
		session.ID, purchaseID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "payment started but could not be recorded")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"checkout_url": session.URL})
}

func (s *Server) stripeWebhook(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid webhook body")
		return
	}
	if strings.TrimSpace(s.cfg.StripeWebhookSecret) != "" && !validStripeSignature(raw, r.Header.Get("Stripe-Signature"), s.cfg.StripeWebhookSecret) {
		httpx.Error(w, http.StatusUnauthorized, "invalid Stripe signature")
		return
	}
	var event struct {
		ID   string          `json:"id"`
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(raw, &event); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid Stripe event")
		return
	}
	if event.Type != "checkout.session.completed" {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "ignored"})
		return
	}
	var data struct {
		Object stripeCheckoutSession `json:"object"`
	}
	if err := json.Unmarshal(event.Data, &data); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid checkout session event")
		return
	}
	if data.Object.PaymentStatus != "paid" {
		httpx.JSON(w, http.StatusOK, map[string]string{"status": "not_paid"})
		return
	}
	if err := s.completeCreditPurchase(r.Context(), data.Object.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not complete credit purchase")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "credited"})
}

func (s *Server) listRequests(w http.ResponseWriter, r *http.Request) {
	var userID int64
	if header := r.Header.Get("Authorization"); strings.HasPrefix(header, "Bearer ") {
		if claims, err := auth.ParseToken(s.cfg.JWTSecret, strings.TrimPrefix(header, "Bearer ")); err == nil {
			userID = claims.UserID
		}
	}

	rows, err := queryContext(s.db, r.Context(),
		`SELECT ar.id, ar.title, ar.unity_asset_store_link, ar.reason, ar.status, ar.vote_count,
		        COALESCE(u.name, 'Guest'), ar.created_at,
		        CASE WHEN ? > 0 THEN EXISTS(
		          SELECT 1 FROM request_votes rv WHERE rv.request_id = ar.id AND rv.user_id = ?
		        ) ELSE FALSE END
		 FROM asset_requests ar
		 LEFT JOIN users u ON u.id = ar.requested_by
		 ORDER BY ar.vote_count DESC, ar.created_at DESC`,
		userID, userID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load requests")
		return
	}
	defer rows.Close()

	requests := []models.AssetRequest{}
	for rows.Next() {
		var request models.AssetRequest
		if err := rows.Scan(
			&request.ID, &request.Title, &request.UnityAssetStoreLink, &request.Reason, &request.Status,
			&request.VoteCount, &request.RequestedBy, &request.CreatedAt, &request.Voted,
		); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read requests")
			return
		}
		requests = append(requests, request)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"requests": requests})
}

func (s *Server) createRequest(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title               string `json:"title"`
		UnityAssetStoreLink string `json:"unity_asset_store_link"`
		Reason              string `json:"reason"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	input.Title = strings.TrimSpace(input.Title)
	input.Reason = strings.TrimSpace(input.Reason)
	if input.Title == "" || input.Reason == "" {
		httpx.Error(w, http.StatusBadRequest, "title and reason are required")
		return
	}

	var id int64
	err := queryRowContext(s.db, r.Context(),
		`INSERT INTO asset_requests (title, unity_asset_store_link, reason, requested_by)
		 VALUES (?, ?, ?, ?)
		 RETURNING id`,
		input.Title, strings.TrimSpace(input.UnityAssetStoreLink), input.Reason, currentUser(r).ID,
	).Scan(&id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create request")
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "status": "created"})
}

func (s *Server) voteRequest(w http.ResponseWriter, r *http.Request) {
	requestID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not vote")
		return
	}
	defer tx.Rollback()

	var voteID int64
	err = queryRowContext(tx, r.Context(), `SELECT id FROM request_votes WHERE user_id = ? AND request_id = ?`, userID, requestID).Scan(&voteID)
	if err == nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"voted": true, "already_voted": true})
		return
	} else if errors.Is(err, sql.ErrNoRows) {
		if _, err := execContext(tx, r.Context(), `INSERT INTO request_votes (user_id, request_id) VALUES (?, ?)`, userID, requestID); err != nil {
			httpx.Error(w, http.StatusBadRequest, "could not add vote")
			return
		}
		if _, err := execContext(tx, r.Context(), `UPDATE asset_requests SET vote_count = vote_count + 1 WHERE id = ?`, requestID); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not update request")
			return
		}
	} else {
		httpx.Error(w, http.StatusInternalServerError, "could not vote")
		return
	}

	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not finish vote")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"voted": true, "already_voted": false})
}

func (s *Server) updateRequestStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	status := strings.ToLower(strings.TrimSpace(input.Status))
	if status != "open" && status != "planned" && status != "released" && status != "declined" {
		httpx.Error(w, http.StatusBadRequest, "invalid status")
		return
	}

	_, err := execContext(s.db, r.Context(), `UPDATE asset_requests SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update request status")
		return
	}
	s.logAdminAction(r.Context(), currentUser(r).ID, "request.status.update", "asset_request", id, map[string]any{"status": status})
	httpx.JSON(w, http.StatusOK, map[string]string{"status": status})
}

func (s *Server) adminListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := queryContext(s.db, r.Context(),
		userSelectSQL()+` ORDER BY created_at DESC LIMIT 200`,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load users")
		return
	}
	defer rows.Close()

	users := []models.User{}
	for rows.Next() {
		user, err := scanUser(rows)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read users")
			return
		}
		users = append(users, user)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) adminListRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := queryContext(s.db, r.Context(),
		`SELECT ar.id, ar.title, ar.unity_asset_store_link, ar.reason, ar.status, ar.vote_count,
		        COALESCE(u.name, 'Guest'), ar.created_at
		 FROM asset_requests ar
		 LEFT JOIN users u ON u.id = ar.requested_by
		 ORDER BY ar.created_at DESC`,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load requests")
		return
	}
	defer rows.Close()

	requests := []models.AssetRequest{}
	for rows.Next() {
		var request models.AssetRequest
		if err := rows.Scan(&request.ID, &request.Title, &request.UnityAssetStoreLink, &request.Reason, &request.Status, &request.VoteCount, &request.RequestedBy, &request.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read requests")
			return
		}
		requests = append(requests, request)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"requests": requests})
}

func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	rows, err := queryContext(s.db, r.Context(),
		`SELECT id, title, body, type, expires_at, created_at
		 FROM notifications
		 WHERE expires_at IS NULL OR expires_at > NOW()
		 ORDER BY created_at DESC
		 LIMIT 30`,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load notifications")
		return
	}
	defer rows.Close()

	notifications := []models.Notification{}
	for rows.Next() {
		var notification models.Notification
		if err := rows.Scan(&notification.ID, &notification.Title, &notification.Body, &notification.Type, &notification.ExpiresAt, &notification.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read notifications")
			return
		}
		notifications = append(notifications, notification)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"notifications": notifications})
}

func (s *Server) searchMessageUsers(w http.ResponseWriter, r *http.Request) {
	user := currentUser(r)
	search := strings.TrimSpace(r.URL.Query().Get("search"))
	if len(search) > 80 {
		search = search[:80]
	}
	like := "%" + strings.ToLower(search) + "%"
	rows, err := queryContext(s.db, r.Context(),
		`SELECT id, name, COALESCE(full_name, ''), COALESCE(avatar_url, '')
		 FROM users
		 WHERE id <> ? AND (? = '' OR LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(COALESCE(full_name, '')) LIKE ?)
		 ORDER BY created_at DESC
		 LIMIT 20`,
		user.ID, search, like, like, like,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not search users")
		return
	}
	defer rows.Close()

	users := []models.ConversationUser{}
	for rows.Next() {
		var item models.ConversationUser
		if err := rows.Scan(&item.ID, &item.Name, &item.FullName, &item.AvatarURL); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read users")
			return
		}
		users = append(users, item)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) unreadMessageCount(w http.ResponseWriter, r *http.Request) {
	userID := currentUser(r).ID
	var count int
	err := queryRowContext(s.db, r.Context(),
		`SELECT COUNT(*)
		 FROM messages m
		 JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = ?
		 WHERE m.sender_id <> ? AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)`,
		userID, userID,
	).Scan(&count)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load unread messages")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"unread_count": count})
}

func (s *Server) listConversations(w http.ResponseWriter, r *http.Request) {
	userID := currentUser(r).ID
	rows, err := queryContext(s.db, r.Context(),
		`SELECT c.id, c.updated_at, u.id, u.name, COALESCE(u.full_name, ''), COALESCE(u.avatar_url, ''),
		        lm.id, lm.sender_id, lm.body, lm.created_at,
		        COALESCE(unread.unread_count, 0) AS unread_count
		 FROM conversations c
		 JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
		 JOIN conversation_participants other_cp ON other_cp.conversation_id = c.id AND other_cp.user_id <> ?
		 JOIN users u ON u.id = other_cp.user_id
		 LEFT JOIN LATERAL (
		   SELECT id, sender_id, body, created_at
		   FROM messages
		   WHERE conversation_id = c.id
		     AND deleted_for_everyone_at IS NULL
		     AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = messages.id AND md.user_id = ?)
		   ORDER BY created_at DESC
		   LIMIT 1
		 ) lm ON TRUE
		 LEFT JOIN LATERAL (
		   SELECT COUNT(*) AS unread_count
		   FROM messages unread
		   WHERE unread.conversation_id = c.id
		     AND unread.sender_id <> ?
		     AND (cp.last_read_at IS NULL OR unread.created_at > cp.last_read_at)
		 ) unread ON TRUE
		 ORDER BY c.updated_at DESC
		 LIMIT 50`,
		userID, userID, userID, userID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load conversations")
		return
	}
	defer rows.Close()

	conversations := []models.Conversation{}
	for rows.Next() {
		conversation, err := scanConversation(rows)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read conversations")
			return
		}
		conversations = append(conversations, conversation)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"conversations": conversations})
}

func (s *Server) startConversation(w http.ResponseWriter, r *http.Request) {
	var input struct {
		UserID int64 `json:"user_id"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	current := currentUser(r)
	if input.UserID <= 0 || input.UserID == current.ID {
		httpx.Error(w, http.StatusBadRequest, "choose another user to message")
		return
	}
	if _, err := s.userByID(r.Context(), input.UserID); err != nil {
		httpx.Error(w, http.StatusNotFound, "user not found")
		return
	}

	conversationID, err := s.findConversationID(r.Context(), current.ID, input.UserID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not start conversation")
		return
	}
	if conversationID == 0 {
		conversationID, err = s.createConversation(r.Context(), current.ID, input.UserID)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not start conversation")
			return
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"conversation_id": conversationID})
}

func (s *Server) getConversationMessages(w http.ResponseWriter, r *http.Request) {
	conversationID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID
	if !s.userCanAccessConversation(r.Context(), conversationID, userID) {
		httpx.Error(w, http.StatusForbidden, "conversation access denied")
		return
	}
	_ = s.markRead(r.Context(), conversationID, userID)

	rows, err := queryContext(s.db, r.Context(),
		`SELECT id, conversation_id, sender_id, body, deleted_for_everyone_at, created_at
		 FROM messages
		 WHERE conversation_id = ?
		   AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = messages.id AND md.user_id = ?)
		 ORDER BY created_at ASC
		 LIMIT 100`,
		conversationID, userID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load messages")
		return
	}
	defer rows.Close()

	messages := []models.Message{}
	for rows.Next() {
		var message models.Message
		if err := rows.Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.Body, &message.DeletedForEveryoneAt, &message.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read messages")
			return
		}
		messages = append(messages, message)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": messages})
}

func (s *Server) sendMessage(w http.ResponseWriter, r *http.Request) {
	conversationID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var input struct {
		Body string `json:"body"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	input.Body = strings.TrimSpace(input.Body)
	if input.Body == "" || len(input.Body) > 2000 {
		httpx.Error(w, http.StatusBadRequest, "message must be 1-2000 characters")
		return
	}
	userID := currentUser(r).ID
	if !s.userCanAccessConversation(r.Context(), conversationID, userID) {
		httpx.Error(w, http.StatusForbidden, "conversation access denied")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send message")
		return
	}
	defer tx.Rollback()

	var message models.Message
	err = queryRowContext(tx, r.Context(),
		`INSERT INTO messages (conversation_id, sender_id, body)
		 VALUES (?, ?, ?)
		 RETURNING id, conversation_id, sender_id, body, deleted_for_everyone_at, created_at`,
		conversationID, userID, input.Body,
	).Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.Body, &message.DeletedForEveryoneAt, &message.CreatedAt)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send message")
		return
	}
	if _, err := execContext(tx, r.Context(), `UPDATE conversations SET updated_at = ? WHERE id = ?`, message.CreatedAt, conversationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send message")
		return
	}
	if _, err := execContext(tx, r.Context(), `UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`, message.CreatedAt, conversationID, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send message")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not send message")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"message": message})
}

func (s *Server) markConversationRead(w http.ResponseWriter, r *http.Request) {
	conversationID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID
	if !s.userCanAccessConversation(r.Context(), conversationID, userID) {
		httpx.Error(w, http.StatusForbidden, "conversation access denied")
		return
	}
	if err := s.markRead(r.Context(), conversationID, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not mark conversation read")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "read"})
}

func (s *Server) deleteMessageForMe(w http.ResponseWriter, r *http.Request) {
	messageID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID
	message, err := s.messageByID(r.Context(), messageID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "message not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete message")
		return
	}
	if !s.userCanAccessConversation(r.Context(), message.ConversationID, userID) {
		httpx.Error(w, http.StatusNotFound, "message not found")
		return
	}
	_, err = execContext(s.db, r.Context(),
		`INSERT INTO message_deletions (message_id, user_id)
		 VALUES (?, ?)
		 ON CONFLICT (message_id, user_id) DO NOTHING`,
		messageID, userID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete message")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) deleteMessageForEveryone(w http.ResponseWriter, r *http.Request) {
	messageID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	userID := currentUser(r).ID
	message, err := s.messageByID(r.Context(), messageID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "message not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete message")
		return
	}
	if !s.userCanAccessConversation(r.Context(), message.ConversationID, userID) {
		httpx.Error(w, http.StatusNotFound, "message not found")
		return
	}
	if message.SenderID != userID {
		httpx.Error(w, http.StatusForbidden, "only the sender can delete this message for everyone")
		return
	}
	_, err = execContext(s.db, r.Context(),
		`UPDATE messages SET body = 'This message was deleted', deleted_for_everyone_at = now() WHERE id = ?`,
		messageID,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete message")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted_for_everyone"})
}

func (s *Server) forwardMessage(w http.ResponseWriter, r *http.Request) {
	messageID, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	var input struct {
		ConversationID int64 `json:"conversation_id"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userID := currentUser(r).ID
	source, err := s.messageByID(r.Context(), messageID)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusNotFound, "message not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not forward message")
		return
	}
	if !s.userCanAccessConversation(r.Context(), source.ConversationID, userID) {
		httpx.Error(w, http.StatusNotFound, "message not found")
		return
	}
	if source.DeletedForEveryoneAt != nil {
		httpx.Error(w, http.StatusBadRequest, "deleted messages cannot be forwarded")
		return
	}
	if input.ConversationID <= 0 || !s.userCanAccessConversation(r.Context(), input.ConversationID, userID) {
		httpx.Error(w, http.StatusForbidden, "conversation access denied")
		return
	}

	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not forward message")
		return
	}
	defer tx.Rollback()

	var forwarded models.Message
	body := "Forwarded: " + source.Body
	err = queryRowContext(tx, r.Context(),
		`INSERT INTO messages (conversation_id, sender_id, body)
		 VALUES (?, ?, ?)
		 RETURNING id, conversation_id, sender_id, body, deleted_for_everyone_at, created_at`,
		input.ConversationID, userID, body,
	).Scan(&forwarded.ID, &forwarded.ConversationID, &forwarded.SenderID, &forwarded.Body, &forwarded.DeletedForEveryoneAt, &forwarded.CreatedAt)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not forward message")
		return
	}
	if _, err := execContext(tx, r.Context(), `UPDATE conversations SET updated_at = ? WHERE id = ?`, forwarded.CreatedAt, input.ConversationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not forward message")
		return
	}
	if _, err := execContext(tx, r.Context(), `UPDATE conversation_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`, forwarded.CreatedAt, input.ConversationID, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not forward message")
		return
	}
	if err := tx.Commit(); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not forward message")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"message": forwarded})
}

func (s *Server) createNotification(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Title        string `json:"title"`
		Body         string `json:"body"`
		Type         string `json:"type"`
		ExpiresInHrs *int   `json:"expires_in_hours"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Body) == "" {
		httpx.Error(w, http.StatusBadRequest, "title and body are required")
		return
	}
	if input.Type == "" {
		input.Type = "admin_announcement"
	}

	expiresAt := expiryFromHours(input.ExpiresInHrs)
	var id int64
	err := queryRowContext(s.db, r.Context(),
		`INSERT INTO notifications (title, body, type, expires_at) VALUES (?, ?, ?, ?) RETURNING id`,
		strings.TrimSpace(input.Title), strings.TrimSpace(input.Body), strings.TrimSpace(input.Type), expiresAt,
	).Scan(&id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not create notification")
		return
	}
	s.logAdminAction(r.Context(), currentUser(r).ID, "notification.create", "notification", id, map[string]any{"title": strings.TrimSpace(input.Title), "type": strings.TrimSpace(input.Type)})
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id})
}

func (s *Server) adminListNotifications(w http.ResponseWriter, r *http.Request) {
	rows, err := queryContext(s.db, r.Context(),
		`SELECT id, title, body, type, expires_at, created_at FROM notifications ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not load notifications")
		return
	}
	defer rows.Close()

	notifications := []models.Notification{}
	for rows.Next() {
		var notification models.Notification
		if err := rows.Scan(&notification.ID, &notification.Title, &notification.Body, &notification.Type, &notification.ExpiresAt, &notification.CreatedAt); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not read notifications")
			return
		}
		notifications = append(notifications, notification)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"notifications": notifications})
}

func (s *Server) updateNotification(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}

	var input struct {
		Title        string `json:"title"`
		Body         string `json:"body"`
		Type         string `json:"type"`
		ExpiresInHrs *int   `json:"expires_in_hours"`
	}
	if err := httpx.Decode(r, &input); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Body) == "" {
		httpx.Error(w, http.StatusBadRequest, "title and body are required")
		return
	}
	if input.Type == "" {
		input.Type = "admin_announcement"
	}

	result, err := execContext(s.db, r.Context(),
		`UPDATE notifications SET title = ?, body = ?, type = ?, expires_at = ? WHERE id = ?`,
		strings.TrimSpace(input.Title), strings.TrimSpace(input.Body), strings.TrimSpace(input.Type), expiryFromHours(input.ExpiresInHrs), id,
	)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not update notification")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		httpx.Error(w, http.StatusNotFound, "notification not found")
		return
	}
	s.logAdminAction(r.Context(), currentUser(r).ID, "notification.update", "notification", id, map[string]any{"title": strings.TrimSpace(input.Title), "type": strings.TrimSpace(input.Type)})
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (s *Server) deleteNotification(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r, "id")
	if !ok {
		return
	}
	result, err := execContext(s.db, r.Context(), `DELETE FROM notifications WHERE id = ?`, id)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "could not delete notification")
		return
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		httpx.Error(w, http.StatusNotFound, "notification not found")
		return
	}
	s.logAdminAction(r.Context(), currentUser(r).ID, "notification.delete", "notification", id, nil)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) {
	stats := map[string]int64{}
	queries := map[string]string{
		"users":               `SELECT COUNT(*) FROM users`,
		"assets":              `SELECT COUNT(*) FROM assets`,
		"requests":            `SELECT COUNT(*) FROM asset_requests`,
		"downloads":           `SELECT COUNT(*) FROM downloads`,
		"credit_transactions": `SELECT COUNT(*) FROM credit_transactions`,
		"total_credits":       `SELECT COALESCE(SUM(credits), 0) FROM users`,
	}

	for key, query := range queries {
		var value int64
		if err := queryRowContext(s.db, r.Context(), query).Scan(&value); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "could not load admin stats")
			return
		}
		stats[key] = value
	}

	httpx.JSON(w, http.StatusOK, map[string]any{"stats": stats})
}

func (s *Server) authRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			httpx.Error(w, http.StatusUnauthorized, "authorization token required")
			return
		}

		claims, err := auth.ParseToken(s.cfg.JWTSecret, strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		user, err := s.userByID(r.Context(), claims.UserID)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "user not found")
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) adminRequired(next http.Handler) http.Handler {
	return s.authRequired(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if currentUser(r).Role != "admin" {
			httpx.Error(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func (s *Server) userByID(ctx context.Context, id int64) (*models.User, error) {
	err := queryRowContext(s.db, ctx,
		userSelectSQL()+` WHERE id = ?`,
		id,
	)
	user, scanErr := scanUser(err)
	if scanErr != nil {
		return nil, scanErr
	}
	return &user, nil
}

func userSelectSQL() string {
	return `SELECT id, name, email, COALESCE(first_name, ''), COALESCE(last_name, ''), COALESCE(full_name, ''),
	              COALESCE(bio, ''), COALESCE(date_of_birth::text, ''), COALESCE(avatar_url, ''), COALESCE(location, ''),
	              COALESCE(website, ''), role, credits, created_at FROM users`
}

func scanUser(scanner rowScanner) (models.User, error) {
	var user models.User
	err := scanner.Scan(
		&user.ID, &user.Name, &user.Email, &user.FirstName, &user.LastName, &user.FullName,
		&user.Bio, &user.DateOfBirth, &user.AvatarURL, &user.Location, &user.Website, &user.Role, &user.Credits, &user.CreatedAt,
	)
	if err != nil {
		return user, err
	}
	return user, nil
}

func currentUser(r *http.Request) *models.User {
	user, _ := r.Context().Value(userContextKey).(*models.User)
	return user
}

func (s *Server) logAdminAction(ctx context.Context, adminID int64, action, targetType string, targetID int64, metadata map[string]any) {
	rawMetadata, err := json.Marshal(metadata)
	if err != nil {
		rawMetadata = []byte("{}")
	}
	_, _ = execContext(s.db, ctx,
		`INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, metadata)
		 VALUES (?, ?, ?, ?, ?::jsonb)`,
		adminID, action, targetType, targetID, string(rawMetadata),
	)
}

type profilePayload struct {
	Name        string `json:"name"`
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	FullName    string `json:"full_name"`
	Bio         string `json:"bio"`
	DateOfBirth string `json:"date_of_birth"`
	AvatarURL   string `json:"avatar_url"`
	Location    string `json:"location"`
	Website     string `json:"website"`
}

func normalizeProfilePayload(input profilePayload) (profilePayload, bool) {
	input.Name = strings.TrimSpace(input.Name)
	input.FirstName = strings.TrimSpace(input.FirstName)
	input.LastName = strings.TrimSpace(input.LastName)
	input.FullName = strings.TrimSpace(input.FullName)
	input.Bio = strings.TrimSpace(input.Bio)
	input.DateOfBirth = strings.TrimSpace(input.DateOfBirth)
	input.AvatarURL = strings.TrimSpace(input.AvatarURL)
	input.Location = strings.TrimSpace(input.Location)
	input.Website = strings.TrimSpace(input.Website)

	if input.Name == "" && input.FullName != "" {
		input.Name = input.FullName
	}
	if input.FullName == "" {
		input.FullName = strings.TrimSpace(strings.Join([]string{input.FirstName, input.LastName}, " "))
	}
	if input.Name == "" {
		return input, false
	}
	if len(input.Name) > 120 || len(input.FirstName) > 80 || len(input.LastName) > 80 || len(input.FullName) > 160 ||
		len(input.Bio) > 600 || len(input.Location) > 120 || len(input.Website) > 300 || len(input.AvatarURL) > 700 {
		return input, false
	}
	if input.DateOfBirth != "" {
		if _, err := time.Parse("2006-01-02", input.DateOfBirth); err != nil {
			return input, false
		}
	}
	if !validHTTPURL(input.AvatarURL, false) || !validHTTPURL(input.Website, false) {
		return input, false
	}
	return input, true
}

func (s *Server) profileStats(ctx context.Context, userID int64) (map[string]int64, error) {
	var favorites, reviews, downloads, requests, creditEvents int64
	err := queryRowContext(s.db, ctx,
		`SELECT
		  (SELECT COUNT(*) FROM favorites WHERE user_id = ?),
		  (SELECT COUNT(*) FROM reviews WHERE user_id = ?),
		  (SELECT COUNT(*) FROM downloads WHERE user_id = ?),
		  (SELECT COUNT(*) FROM asset_requests WHERE requested_by = ?),
		  (SELECT COUNT(*) FROM credit_transactions WHERE user_id = ?)`,
		userID, userID, userID, userID, userID,
	).Scan(&favorites, &reviews, &downloads, &requests, &creditEvents)
	if err != nil {
		return nil, err
	}
	return map[string]int64{
		"favorites":     favorites,
		"reviews":       reviews,
		"downloads":     downloads,
		"requests":      requests,
		"credit_events": creditEvents,
	}, nil
}

func (s *Server) profileActivity(ctx context.Context, userID int64) (map[string]any, error) {
	var downloadsRaw, favoritesRaw, reviewsRaw string
	err := queryRowContext(s.db, ctx,
		`SELECT
		  COALESCE((
		    SELECT jsonb_agg(item ORDER BY (item->>'created_at')::timestamptz DESC)::text
		    FROM (
		      SELECT jsonb_build_object('id', a.id, 'title', a.title, 'slug', a.slug, 'thumbnail_url', a.thumbnail_url, 'created_at', MAX(d.created_at)) AS item
		      FROM downloads d
		      JOIN assets a ON a.id = d.asset_id
		      WHERE d.user_id = ?
		      GROUP BY a.id, a.title, a.slug, a.thumbnail_url
		      ORDER BY MAX(d.created_at) DESC
		      LIMIT 8
		    ) latest_downloads
		  ), '[]'),
		  COALESCE((
		    SELECT jsonb_agg(item ORDER BY (item->>'created_at')::timestamptz DESC)::text
		    FROM (
		      SELECT jsonb_build_object('id', a.id, 'title', a.title, 'slug', a.slug, 'thumbnail_url', a.thumbnail_url, 'created_at', f.created_at) AS item
		      FROM favorites f
		      JOIN assets a ON a.id = f.asset_id
		      WHERE f.user_id = ?
		      ORDER BY f.created_at DESC
		      LIMIT 8
		    ) latest_favorites
		  ), '[]'),
		  COALESCE((
		    SELECT jsonb_agg(item ORDER BY (item->>'updated_at')::timestamptz DESC)::text
		    FROM (
		      SELECT jsonb_build_object('id', a.id, 'title', a.title, 'slug', a.slug, 'thumbnail_url', a.thumbnail_url, 'rating', r.rating, 'comment', COALESCE(r.comment, ''), 'updated_at', r.updated_at) AS item
		      FROM reviews r
		      JOIN assets a ON a.id = r.asset_id
		      WHERE r.user_id = ?
		      ORDER BY r.updated_at DESC
		      LIMIT 8
		    ) latest_reviews
		  ), '[]')`,
		userID, userID, userID,
	).Scan(&downloadsRaw, &favoritesRaw, &reviewsRaw)
	if err != nil {
		return nil, err
	}
	downloads := decodeProfileItems(downloadsRaw)
	favorites := decodeProfileItems(favoritesRaw)
	reviews := decodeProfileItems(reviewsRaw)
	return map[string]any{"downloads": downloads, "favorites": favorites, "reviews": reviews}, nil
}

func decodeProfileItems(raw string) []map[string]any {
	items := []map[string]any{}
	_ = json.Unmarshal([]byte(raw), &items)
	return items
}

func scanConversation(scanner rowScanner) (models.Conversation, error) {
	var conversation models.Conversation
	var lastID sql.NullInt64
	var lastSenderID sql.NullInt64
	var lastBody sql.NullString
	var lastCreatedAt sql.NullTime
	err := scanner.Scan(
		&conversation.ID, &conversation.UpdatedAt, &conversation.OtherUser.ID, &conversation.OtherUser.Name,
		&conversation.OtherUser.FullName, &conversation.OtherUser.AvatarURL, &lastID, &lastSenderID,
		&lastBody, &lastCreatedAt, &conversation.UnreadCount,
	)
	if err != nil {
		return conversation, err
	}
	if lastID.Valid {
		conversation.LastMessage = &models.Message{
			ID:             lastID.Int64,
			ConversationID: conversation.ID,
			SenderID:       lastSenderID.Int64,
			Body:           lastBody.String,
			CreatedAt:      lastCreatedAt.Time,
		}
	}
	return conversation, nil
}

func (s *Server) findConversationID(ctx context.Context, firstUserID, secondUserID int64) (int64, error) {
	var conversationID int64
	err := queryRowContext(s.db, ctx,
		`SELECT cp1.conversation_id
		 FROM conversation_participants cp1
		 JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
		 WHERE cp1.user_id = ? AND cp2.user_id = ?
		 LIMIT 1`,
		firstUserID, secondUserID,
	).Scan(&conversationID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return conversationID, err
}

func (s *Server) createConversation(ctx context.Context, firstUserID, secondUserID int64) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var conversationID int64
	if err := queryRowContext(tx, ctx, `INSERT INTO conversations DEFAULT VALUES RETURNING id`).Scan(&conversationID); err != nil {
		return 0, err
	}
	if _, err := execContext(tx, ctx, `INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)`, conversationID, firstUserID, conversationID, secondUserID); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return conversationID, nil
}

func (s *Server) userCanAccessConversation(ctx context.Context, conversationID, userID int64) bool {
	var exists bool
	err := queryRowContext(s.db, ctx,
		`SELECT EXISTS(SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?)`,
		conversationID, userID,
	).Scan(&exists)
	return err == nil && exists
}

func (s *Server) markRead(ctx context.Context, conversationID, userID int64) error {
	_, err := execContext(s.db, ctx,
		`UPDATE conversation_participants SET last_read_at = now() WHERE conversation_id = ? AND user_id = ?`,
		conversationID, userID,
	)
	return err
}

func (s *Server) messageByID(ctx context.Context, messageID int64) (models.Message, error) {
	var message models.Message
	err := queryRowContext(s.db, ctx,
		`SELECT id, conversation_id, sender_id, body, deleted_for_everyone_at, created_at FROM messages WHERE id = ?`,
		messageID,
	).Scan(&message.ID, &message.ConversationID, &message.SenderID, &message.Body, &message.DeletedForEveryoneAt, &message.CreatedAt)
	return message, err
}

type stripeCheckoutSession struct {
	ID            string            `json:"id"`
	URL           string            `json:"url"`
	PaymentStatus string            `json:"payment_status"`
	Metadata      map[string]string `json:"metadata"`
}

func findCreditPackage(packageID string) (creditPackage, bool) {
	for _, item := range creditPackages {
		if item.ID == packageID {
			return item, true
		}
	}
	return creditPackage{}, false
}

func (s *Server) createStripeCheckoutSession(ctx context.Context, user *models.User, pkg creditPackage, purchaseID int64) (stripeCheckoutSession, error) {
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", s.cfg.PublicAppURL+"/credits?payment=success")
	form.Set("cancel_url", s.cfg.PublicAppURL+"/credits?payment=cancelled")
	form.Set("client_reference_id", strconv.FormatInt(user.ID, 10))
	if _, err := mail.ParseAddress(user.Email); err == nil {
		form.Set("customer_email", user.Email)
	}
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", pkg.Currency)
	form.Set("line_items[0][price_data][unit_amount]", strconv.Itoa(pkg.AmountCents))
	form.Set("line_items[0][price_data][product_data][name]", pkg.Name)
	form.Set("line_items[0][price_data][product_data][description]", fmt.Sprintf("%d Logic Crack Hub credits", pkg.Credits))
	form.Set("metadata[purchase_id]", strconv.FormatInt(purchaseID, 10))
	form.Set("metadata[user_id]", strconv.FormatInt(user.ID, 10))
	form.Set("metadata[credits]", strconv.Itoa(pkg.Credits))
	form.Set("metadata[package_id]", pkg.ID)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return stripeCheckoutSession{}, err
	}
	req.SetBasicAuth(s.cfg.StripeSecretKey, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return stripeCheckoutSession{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return stripeCheckoutSession{}, fmt.Errorf("stripe checkout returned %d: %s", resp.StatusCode, string(body))
	}
	var session stripeCheckoutSession
	if err := json.Unmarshal(body, &session); err != nil {
		return stripeCheckoutSession{}, err
	}
	if session.ID == "" || session.URL == "" {
		return stripeCheckoutSession{}, errors.New("stripe checkout session missing url")
	}
	return session, nil
}

func validStripeSignature(payload []byte, header, secret string) bool {
	var timestamp string
	signatures := []string{}
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch key {
		case "t":
			timestamp = value
		case "v1":
			signatures = append(signatures, value)
		}
	}
	if timestamp == "" || len(signatures) == 0 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(payload)
	expected := mac.Sum(nil)
	for _, signature := range signatures {
		decoded, err := hex.DecodeString(signature)
		if err == nil && hmac.Equal(decoded, expected) {
			return true
		}
	}
	return false
}

func (s *Server) completeCreditPurchase(ctx context.Context, sessionID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var purchaseID, userID int64
	var credits int
	var status string
	err = queryRowContext(tx, ctx,
		`SELECT id, user_id, credits, status FROM credit_purchases WHERE stripe_session_id = ? FOR UPDATE`,
		sessionID,
	).Scan(&purchaseID, &userID, &credits, &status)
	if err != nil {
		return err
	}
	if status == "completed" {
		return tx.Commit()
	}
	if _, err := execContext(tx, ctx, `UPDATE users SET credits = credits + ? WHERE id = ?`, credits, userID); err != nil {
		return err
	}
	if _, err := execContext(tx, ctx,
		`INSERT INTO credit_transactions (user_id, amount, type, description, metadata)
		 VALUES (?, ?, 'stripe_purchase', ?, ?::jsonb)`,
		userID, credits, "Purchased credits with Stripe", fmt.Sprintf(`{"stripe_session_id":%q,"purchase_id":%d}`, sessionID, purchaseID),
	); err != nil {
		return err
	}
	if _, err := execContext(tx, ctx, `UPDATE credit_purchases SET status = 'completed', completed_at = now() WHERE id = ?`, purchaseID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Server) uploadSupabaseObject(ctx context.Context, objectPath, contentType string, content []byte) (string, error) {
	baseURL := strings.TrimRight(s.cfg.SupabaseURL, "/")
	bucket := strings.Trim(s.cfg.SupabaseAssetBucket, "/")
	if bucket == "" {
		bucket = "assets"
	}
	uploadURL := fmt.Sprintf("%s/storage/v1/object/%s/%s", baseURL, url.PathEscape(bucket), objectPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uploadURL, bytes.NewReader(content))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.SupabaseServiceKey)
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Cache-Control", "3600")
	req.Header.Set("x-upsert", "true")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("supabase storage returned %d", resp.StatusCode)
	}
	return fmt.Sprintf("%s/storage/v1/object/public/%s/%s", baseURL, url.PathEscape(bucket), objectPath), nil
}

func (s *Server) storeAvatar(ctx context.Context, r *http.Request, objectPath, contentType string, content []byte) (string, error) {
	if strings.TrimSpace(s.cfg.SupabaseURL) != "" && strings.TrimSpace(s.cfg.SupabaseServiceKey) != "" {
		return s.uploadSupabaseObject(ctx, objectPath, contentType, content)
	}
	if os.Getenv("NETLIFY") != "" || os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != "" {
		return "", errors.New("supabase storage is not configured")
	}

	localPath := filepath.Join("uploads", filepath.FromSlash(objectPath))
	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(localPath, content, 0o644); err != nil {
		return "", err
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	host := r.Host
	if host == "" {
		host = "127.0.0.1:8080"
	}
	return fmt.Sprintf("%s://%s/uploads/%s", scheme, host, objectPath), nil
}

type assetPayload struct {
	Title        string   `json:"title"`
	Slug         string   `json:"slug"`
	ThumbnailURL string   `json:"thumbnail_url"`
	DownloadURL  string   `json:"download_url"`
	GalleryURLs  []string `json:"gallery_urls"`
	Description  string   `json:"description"`
	Features     []string `json:"features"`
	UnityVersion string   `json:"unity_version"`
	FileSize     string   `json:"file_size"`
	CategoryID   int64    `json:"category_id"`
	CreditCost   int      `json:"credit_cost"`
	Changelog    string   `json:"changelog"`
	Version      string   `json:"version"`
	Tags         []string `json:"tags"`
}

func decodeAssetPayload(w http.ResponseWriter, r *http.Request) (assetPayload, bool) {
	var payload assetPayload
	if err := httpx.Decode(r, &payload); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return payload, false
	}

	payload.Title = strings.TrimSpace(payload.Title)
	payload.Slug = slugify(payload.Slug)
	payload.ThumbnailURL = strings.TrimSpace(payload.ThumbnailURL)
	payload.DownloadURL = strings.TrimSpace(payload.DownloadURL)
	payload.Description = strings.TrimSpace(payload.Description)
	payload.UnityVersion = strings.TrimSpace(payload.UnityVersion)
	payload.FileSize = strings.TrimSpace(payload.FileSize)
	payload.Version = strings.TrimSpace(payload.Version)
	for index := range payload.GalleryURLs {
		payload.GalleryURLs[index] = strings.TrimSpace(payload.GalleryURLs[index])
	}
	if payload.Title == "" || payload.Description == "" || payload.CategoryID <= 0 || payload.CreditCost < 0 {
		httpx.Error(w, http.StatusBadRequest, "title, description, category, and non-negative credit cost are required")
		return payload, false
	}
	if len(payload.Title) > 180 || len(payload.Description) > 5000 || len(payload.UnityVersion) > 60 || len(payload.FileSize) > 60 || len(payload.Version) > 60 {
		httpx.Error(w, http.StatusBadRequest, "asset fields are too long")
		return payload, false
	}
	if !validHTTPURL(payload.ThumbnailURL, true) || !validHTTPURL(payload.DownloadURL, false) {
		httpx.Error(w, http.StatusBadRequest, "valid thumbnail and download URLs are required")
		return payload, false
	}
	for _, galleryURL := range payload.GalleryURLs {
		if !validHTTPURL(galleryURL, true) {
			httpx.Error(w, http.StatusBadRequest, "gallery URLs must be valid")
			return payload, false
		}
	}
	if payload.Version == "" {
		payload.Version = "1.0.0"
	}

	return payload, true
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanAsset(scanner rowScanner) (models.Asset, error) {
	var asset models.Asset
	var galleryRaw, featuresRaw, tagsRaw sql.NullString
	err := scanner.Scan(
		&asset.ID, &asset.Title, &asset.Slug, &asset.ThumbnailURL, &asset.DownloadURL, &galleryRaw,
		&asset.Description, &featuresRaw, &asset.UnityVersion, &asset.FileSize,
		&asset.DownloadCount, &asset.Rating, &asset.Category.ID, &asset.Category.Name,
		&asset.Category.Slug, &asset.CreditCost, &asset.Changelog, &asset.Version,
		&tagsRaw, &asset.CreatedAt, &asset.UpdatedAt,
	)
	if err != nil {
		return asset, err
	}

	asset.GalleryURLs = decodeList(galleryRaw)
	asset.Features = decodeList(featuresRaw)
	asset.Tags = decodeList(tagsRaw)
	return asset, nil
}

func (s *Server) findAsset(ctx context.Context, rawID string) (models.Asset, error) {
	id, _ := strconv.ParseInt(rawID, 10, 64)
	row := queryRowContext(s.db, ctx, assetSelectSQL()+` WHERE a.slug = ? OR a.id = ? LIMIT 1`, rawID, id)
	return scanAsset(row)
}

func (s *Server) findAssetByID(ctx context.Context, id int64) (models.Asset, error) {
	row := queryRowContext(s.db, ctx, assetSelectSQL()+` WHERE a.id = ? LIMIT 1`, id)
	return scanAsset(row)
}

func assetSelectSQL() string {
	return `
		SELECT a.id, a.title, a.slug, a.thumbnail_url, COALESCE(a.download_url, ''), COALESCE(a.gallery_urls, '[]'::jsonb)::text,
		       a.description, COALESCE(a.features, '[]'::jsonb)::text, a.unity_version, a.file_size,
		       a.download_count, a.rating, c.id, c.name, c.slug, a.credit_cost, a.changelog,
		       a.version, COALESCE(a.tags, '[]'::jsonb)::text, a.created_at, a.updated_at
		FROM assets a
		JOIN categories c ON c.id = a.category_id`
}

func decodeList(raw sql.NullString) []string {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return []string{}
	}
	values := []string{}
	if err := json.Unmarshal([]byte(raw.String), &values); err != nil {
		return []string{}
	}
	return values
}

func encodeList(values []string) string {
	cleaned := []string{}
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	raw, _ := json.Marshal(cleaned)
	return string(raw)
}

func assetSort(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "most_downloaded":
		return "a.download_count DESC, a.created_at DESC"
	case "highest_rated":
		return "a.rating DESC, a.download_count DESC"
	case "lowest_credits":
		return "a.credit_cost ASC, a.rating DESC"
	case "highest_credits":
		return "a.credit_cost DESC, a.rating DESC"
	case "recently_updated":
		return "a.updated_at DESC"
	default:
		return "a.created_at DESC"
	}
}

func int64FromQuery(r *http.Request, key string, fallback, max int64) int64 {
	value, err := strconv.ParseInt(r.URL.Query().Get(key), 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	if value > max {
		return max
	}
	return value
}

func pathID(w http.ResponseWriter, r *http.Request, key string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, key), 10, 64)
	if err != nil || id <= 0 {
		httpx.Error(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

func emailAlreadyRegistered(ctx context.Context, db sqlRunner, email string) bool {
	var exists bool
	err := queryRowContext(db, ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = ?)`, email).Scan(&exists)
	return err == nil && exists
}

type rateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func newRateLimiter() *rateLimiter {
	return &rateLimiter{attempts: map[string][]time.Time{}}
}

func (s *Server) limitSensitive(scope string, maxAttempts int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := scope + ":" + clientIP(r)
			if !s.rateLimiter.allow(key, maxAttempts, window) {
				httpx.Error(w, http.StatusTooManyRequests, "too many attempts, please wait and try again")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (l *rateLimiter) allow(key string, maxAttempts int, window time.Duration) bool {
	now := time.Now()
	cutoff := now.Add(-window)
	l.mu.Lock()
	defer l.mu.Unlock()

	hits := l.attempts[key]
	kept := hits[:0]
	for _, hit := range hits {
		if hit.After(cutoff) {
			kept = append(kept, hit)
		}
	}
	if len(kept) >= maxAttempts {
		l.attempts[key] = kept
		return false
	}
	l.attempts[key] = append(kept, now)
	return true
}

func clientIP(r *http.Request) string {
	for _, header := range []string{"X-Forwarded-For", "X-Real-IP"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value == "" {
			continue
		}
		if header == "X-Forwarded-For" {
			value = strings.TrimSpace(strings.Split(value, ",")[0])
		}
		if parsed := net.ParseIP(value); parsed != nil {
			return parsed.String()
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func normalizeEmail(email string) (string, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(email) > 190 {
		return "", false
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		return "", false
	}
	return email, true
}

func validHTTPURL(value string, required bool) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return !required
	}
	parsed, err := url.ParseRequestURI(value)
	if err != nil || parsed.Host == "" {
		return false
	}
	return parsed.Scheme == "http" || parsed.Scheme == "https"
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var builder strings.Builder
	lastDash := false
	for _, char := range value {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
			lastDash = false
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
			lastDash = false
		default:
			if !lastDash && builder.Len() > 0 {
				builder.WriteRune('-')
				lastDash = true
			}
		}
	}
	return strings.Trim(builder.String(), "-")
}

func randomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func expiryFromHours(hours *int) any {
	if hours == nil || *hours <= 0 {
		return nil
	}
	return time.Now().UTC().Add(time.Duration(*hours) * time.Hour)
}

type sqlRunner interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func execContext(db sqlRunner, ctx context.Context, query string, args ...any) (sql.Result, error) {
	return db.ExecContext(ctx, postgresQuery(query), args...)
}

func queryContext(db sqlRunner, ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return db.QueryContext(ctx, postgresQuery(query), args...)
}

func queryRowContext(db sqlRunner, ctx context.Context, query string, args ...any) *sql.Row {
	return db.QueryRowContext(ctx, postgresQuery(query), args...)
}

func postgresQuery(query string) string {
	var builder strings.Builder
	builder.Grow(len(query) + 8)
	index := 1
	for _, char := range query {
		if char != '?' {
			builder.WriteRune(char)
			continue
		}
		builder.WriteByte('$')
		builder.WriteString(strconv.Itoa(index))
		index++
	}
	return builder.String()
}
