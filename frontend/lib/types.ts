export type User = {
  id: number;
  name: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  bio: string;
  date_of_birth: string;
  avatar_url: string;
  location: string;
  website: string;
  role: "user" | "admin";
  credits: number;
  created_at: string;
};

export type ProfileStats = {
  favorites: number;
  reviews: number;
  downloads: number;
  requests: number;
  credit_events: number;
};

export type ProfileAssetItem = {
  id: number;
  title: string;
  slug: string;
  thumbnail_url: string;
  created_at: string;
};

export type ProfileReviewItem = ProfileAssetItem & {
  rating: number;
  comment: string;
  updated_at: string;
};

export type ProfileActivity = {
  downloads: ProfileAssetItem[];
  favorites: ProfileAssetItem[];
  reviews: ProfileReviewItem[];
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
  voted: boolean;
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

export type CreditPackage = {
  id: string;
  name: string;
  credits: number;
  amount_cents: number;
  currency: string;
  badge: string;
};

export type ConversationUser = {
  id: number;
  name: string;
  full_name: string;
  avatar_url: string;
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  deleted_for_everyone_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: number;
  other_user: ConversationUser;
  last_message: Message | null;
  unread_count: number;
  updated_at: string;
};
