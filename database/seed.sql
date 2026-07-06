INSERT INTO users (id, name, email, password_hash, role, credits)
VALUES
  (1, 'Logic Crack Admin', 'admin@logiccrack.studio', '$2a$10$eT.yfNt.wyurAbfU6wt/NOxviDhknniElTv1ntArw/Hj5LuQL6hkK', 'admin', 500),
  (2, 'Unity Builder', 'builder@example.com', '$2a$10$eT.yfNt.wyurAbfU6wt/NOxviDhknniElTv1ntArw/Hj5LuQL6hkK', 'user', 120)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  credits = EXCLUDED.credits;

INSERT INTO categories (id, name, slug)
VALUES
  (1, 'Controllers', 'controllers'),
  (2, 'AI', 'ai'),
  (3, 'UI', 'ui'),
  (4, 'Inventory', 'inventory'),
  (5, 'Dialogue', 'dialogue'),
  (6, 'Save System', 'save-system'),
  (7, 'Multiplayer', 'multiplayer'),
  (8, 'Editor Tools', 'editor-tools'),
  (9, 'VFX', 'vfx'),
  (10, 'Shaders', 'shaders'),
  (11, 'Audio', 'audio'),
  (12, 'Animations', 'animations'),
  (13, '2D', '2d'),
  (14, '3D', '3d'),
  (15, 'Templates', 'templates')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug;

INSERT INTO assets
  (id, title, slug, thumbnail_url, download_url, gallery_urls, description, features, unity_version, file_size,
   download_count, rating, category_id, credit_cost, changelog, version, tags, created_by, published_at)
VALUES
  (
    1,
    'Third Person Starter Controller',
    'third-person-starter-controller',
    '/mock-assets/controller.png',
    'https://example.com/downloads/third-person-starter-controller.zip',
    '["/mock-assets/controller.png"]'::jsonb,
    'A polished movement controller for fast Unity prototyping with camera orbit, jump buffering, slope handling, and animation hooks.',
    '["Cinemachine-ready camera rig", "Ground detection and slope support", "Input System bindings", "Clean demo scene"]'::jsonb,
    '2022.3 LTS+',
    '38 MB',
    214,
    4.8,
    1,
    80,
    'Initial V1 release with improved camera collision and controller presets.',
    '1.0.0',
    '["controller", "third-person", "starter", "prototype"]'::jsonb,
    1,
    now()
  ),
  (
    2,
    'Modular Inventory Kit',
    'modular-inventory-kit',
    '/mock-assets/inventory.png',
    'https://example.com/downloads/modular-inventory-kit.zip',
    '["/mock-assets/inventory.png"]'::jsonb,
    'A drag-and-drop inventory framework with item definitions, stacks, quick slots, and save/load integration.',
    '["Grid and hotbar layouts", "ScriptableObject item database", "Stack splitting", "JSON save adapter"]'::jsonb,
    '2021.3 LTS+',
    '52 MB',
    168,
    4.7,
    4,
    120,
    'Added quick slot events and UI Toolkit sample.',
    '1.2.0',
    '["inventory", "items", "ui", "save"]'::jsonb,
    1,
    now()
  ),
  (
    3,
    'Enemy AI Patrol Pack',
    'enemy-ai-patrol-pack',
    '/mock-assets/ai.png',
    'https://example.com/downloads/enemy-ai-patrol-pack.zip',
    '["/mock-assets/ai.png"]'::jsonb,
    'State-machine enemy AI for stealth, patrol, chase, attack, and return-to-route behavior.',
    '["Finite state machine", "Waypoint patrol editor", "Vision cone helper", "NavMesh examples"]'::jsonb,
    '2022.3 LTS+',
    '44 MB',
    132,
    4.6,
    2,
    100,
    'Balanced chase transitions and added alert cooldowns.',
    '1.1.0',
    '["ai", "enemy", "navmesh", "state-machine"]'::jsonb,
    1,
    now()
  ),
  (
    4,
    'Neon UI HUD Template',
    'neon-ui-hud-template',
    '/mock-assets/ui.png',
    'https://example.com/downloads/neon-ui-hud-template.zip',
    '["/mock-assets/ui.png"]'::jsonb,
    'A responsive HUD template for health, stamina, XP, notifications, menus, and controller-friendly navigation.',
    '["Prefab-driven HUD modules", "Animated notification stack", "Gamepad navigation", "Light and dark variants"]'::jsonb,
    '2021.3 LTS+',
    '29 MB',
    191,
    4.9,
    3,
    60,
    'Added scalable safe-area layout presets.',
    '1.0.3',
    '["ui", "hud", "menus", "template"]'::jsonb,
    1,
    now()
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  slug = EXCLUDED.slug,
  thumbnail_url = EXCLUDED.thumbnail_url,
  download_url = EXCLUDED.download_url,
  gallery_urls = EXCLUDED.gallery_urls,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  unity_version = EXCLUDED.unity_version,
  file_size = EXCLUDED.file_size,
  download_count = EXCLUDED.download_count,
  rating = EXCLUDED.rating,
  category_id = EXCLUDED.category_id,
  credit_cost = EXCLUDED.credit_cost,
  changelog = EXCLUDED.changelog,
  version = EXCLUDED.version,
  tags = EXCLUDED.tags,
  created_by = EXCLUDED.created_by,
  published_at = EXCLUDED.published_at;

INSERT INTO asset_requests (id, title, unity_asset_store_link, reason, requested_by, vote_count, status)
VALUES
  (1, 'Quest Journal System', 'https://assetstore.unity.com/', 'A reusable quest journal would help RPG and adventure prototypes move faster.', 2, 12, 'open'),
  (2, 'Dialogue Graph Editor', 'https://assetstore.unity.com/', 'Please add a node-based dialogue editor with branching choices and localization hooks.', 2, 9, 'planned')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  unity_asset_store_link = EXCLUDED.unity_asset_store_link,
  reason = EXCLUDED.reason,
  vote_count = EXCLUDED.vote_count,
  status = EXCLUDED.status;

INSERT INTO notifications (title, body, type)
SELECT title, body, type
FROM (VALUES
  ('Daily Reward Available', 'Come back every 24 hours to keep your 7-day credit streak alive.', 'daily_reward'),
  ('New Asset Released', 'Third Person Starter Controller is now available in the catalog.', 'new_asset'),
  ('Admin Announcement', 'Logic Crack Hub V1 development is underway.', 'admin_announcement')
) AS seed(title, body, type)
WHERE NOT EXISTS (
  SELECT 1
  FROM notifications existing
  WHERE existing.title = seed.title
    AND existing.type = seed.type
);

SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 1));
SELECT setval(pg_get_serial_sequence('assets', 'id'), COALESCE((SELECT MAX(id) FROM assets), 1));
SELECT setval(pg_get_serial_sequence('asset_requests', 'id'), COALESCE((SELECT MAX(id) FROM asset_requests), 1));
