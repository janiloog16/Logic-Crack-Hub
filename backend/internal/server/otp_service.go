package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
)

const (
	otpExpiryMinutes   = 10
	otpResendSeconds   = 60
	maxOTPAttempts     = 5
	resetTokenValidity = 10
)

type otpService struct {
	secret []byte
}

func newOTPService(secret string) *otpService {
	if strings.TrimSpace(secret) == "" {
		secret = "change-this-dev-secret"
	}
	return &otpService{secret: []byte(secret)}
}

func (s *otpService) GenerateCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func (s *otpService) Hash(value string) string {
	mac := hmac.New(sha256.New, s.secret)
	mac.Write([]byte(strings.TrimSpace(value)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *otpService) Matches(storedHash, value string) bool {
	expected := s.Hash(value)
	return subtle.ConstantTimeCompare([]byte(storedHash), []byte(expected)) == 1
}
