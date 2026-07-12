package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"logiccrackhub/api/internal/config"
)

type emailService struct {
	apiKey      string
	senderName  string
	senderEmail string
	client      *http.Client
}

func newEmailService(cfg config.Config) *emailService {
	return &emailService{
		apiKey:      strings.TrimSpace(cfg.BrevoAPIKey),
		senderName:  strings.TrimSpace(cfg.BrevoSenderName),
		senderEmail: strings.TrimSpace(cfg.BrevoSenderEmail),
		client:      &http.Client{Timeout: 12 * time.Second},
	}
}

func (s *emailService) SendVerificationCode(ctx context.Context, toEmail, toName, code, purpose string) error {
	if s.apiKey == "" || s.senderEmail == "" {
		return errors.New("brevo email is not configured")
	}

	subject := "Your Logic Crack Hub verification code"
	if purpose == "password_reset" {
		subject = "Reset your Logic Crack Hub password"
	}

	payload := map[string]any{
		"sender": map[string]string{
			"name":  s.senderName,
			"email": s.senderEmail,
		},
		"to": []map[string]string{{
			"email": toEmail,
			"name":  toName,
		}},
		"subject":     subject,
		"htmlContent": verificationEmailHTML(code, purpose),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("api-key", s.apiKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("brevo returned status %d", resp.StatusCode)
	}
	return nil
}

func verificationEmailHTML(code, purpose string) string {
	title := "Verify your email"
	intro := "Use this code to finish creating your Logic Crack Hub account."
	if purpose == "password_reset" {
		title = "Reset your password"
		intro = "Use this code to continue resetting your Logic Crack Hub password."
	}

	return fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;background:#0f0b0c;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#0f0b0c;padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#171214;border:1px solid rgba(255,255,255,.08);border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:28px 24px 12px;">
                <div style="font-size:22px;font-weight:900;color:#ffffff;">Logic Crack Hub</div>
                <div style="margin-top:8px;height:3px;width:72px;background:#ff5252;border-radius:99px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 28px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#ffffff;">%s</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#cfc7c9;">%s</p>
                <div style="letter-spacing:10px;text-align:center;font-size:34px;font-weight:900;color:#ffffff;background:#21181a;border:1px solid rgba(255,82,82,.35);border-radius:18px;padding:18px 12px;">%s</div>
                <p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:#b9afb2;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`, html.EscapeString(title), html.EscapeString(intro), html.EscapeString(code))
}
