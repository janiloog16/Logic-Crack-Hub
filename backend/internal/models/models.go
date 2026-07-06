package models

import "time"

type User struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Credits   int       `json:"credits"`
	CreatedAt time.Time `json:"created_at"`
}

type Category struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type Asset struct {
	ID            int64     `json:"id"`
	Title         string    `json:"title"`
	Slug          string    `json:"slug"`
	ThumbnailURL  string    `json:"thumbnail_url"`
	DownloadURL   string    `json:"download_url,omitempty"`
	GalleryURLs   []string  `json:"gallery_urls"`
	Description   string    `json:"description"`
	Features      []string  `json:"features"`
	UnityVersion  string    `json:"unity_version"`
	FileSize      string    `json:"file_size"`
	DownloadCount int       `json:"download_count"`
	Rating        float64   `json:"rating"`
	Category      Category  `json:"category"`
	CreditCost    int       `json:"credit_cost"`
	Changelog     string    `json:"changelog"`
	Version       string    `json:"version"`
	Tags          []string  `json:"tags"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type AssetRequest struct {
	ID                  int64     `json:"id"`
	Title               string    `json:"title"`
	UnityAssetStoreLink string    `json:"unity_asset_store_link"`
	Reason              string    `json:"reason"`
	Status              string    `json:"status"`
	VoteCount           int       `json:"vote_count"`
	RequestedBy         string    `json:"requested_by"`
	CreatedAt           time.Time `json:"created_at"`
}

type CreditTransaction struct {
	ID          int64     `json:"id"`
	Amount      int       `json:"amount"`
	Type        string    `json:"type"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

type Notification struct {
	ID        int64      `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Type      string     `json:"type"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
}
