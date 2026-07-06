export type User = {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  credits: number;
  created_at: string;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
};

export type Asset = {
  id: number;
  title: string;
  slug: string;
  thumbnail_url: string;
  download_url?: string;
  gallery_urls: string[];
  description: string;
  features: string[];
  unity_version: string;
  file_size: string;
  download_count: number;
  rating: number;
  category: Category;
  credit_cost: number;
  changelog: string;
  version: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type AssetRequest = {
  id: number;
  title: string;
  unity_asset_store_link: string;
  reason: string;
  status: "open" | "planned" | "released" | "declined";
  vote_count: number;
  requested_by: string;
  created_at: string;
};

export type Notification = {
  id: number;
  title: string;
  body: string;
  type: string;
  expires_at: string | null;
  created_at: string;
};

export type CreditTransaction = {
  id: number;
  amount: number;
  type: string;
  description: string;
  created_at: string;
};
