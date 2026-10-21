-- ==============================================================================
-- Full-System Supabase Migration Audit & Repair
-- Target Project: Supabase 2 (fqzhcpzxdlnvhvlqspgc)
-- Covers: Foreign Keys, Missing Columns, and Complete RLS Policies
-- ==============================================================================

-- 1. FOREIGN KEY FOR healing_messages -> profiles(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_healing_messages_author' AND table_name = 'healing_messages'
  ) THEN
    ALTER TABLE public.healing_messages
      ADD CONSTRAINT fk_healing_messages_author
      FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. FOREIGN KEY FOR purchase_items -> product_catalog(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_purchase_items_product' AND table_name = 'purchase_items'
  ) THEN
    ALTER TABLE public.purchase_items
      ADD CONSTRAINT fk_purchase_items_product
      FOREIGN KEY (product_id) REFERENCES public.product_catalog(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. campaign_schedule_config COLUMNS
ALTER TABLE public.campaign_schedule_config
  ADD COLUMN IF NOT EXISTS interval_hours INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS interval_minutes INTEGER DEFAULT 60;

UPDATE public.campaign_schedule_config 
SET interval_hours = COALESCE(interval_hours, 1), 
    interval_minutes = COALESCE(interval_minutes, 60)
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 4. RLS: discord_servers
ALTER TABLE public.discord_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select servers" ON public.discord_servers;
CREATE POLICY "Public select servers" ON public.discord_servers
  FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Admin manage discord_servers" ON public.discord_servers;
CREATE POLICY "Admin manage discord_servers" ON public.discord_servers
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('discord-servers'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('discord-servers'));

DROP POLICY IF EXISTS "Service role full discord_servers" ON public.discord_servers;
CREATE POLICY "Service role full discord_servers" ON public.discord_servers
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. RLS: healing_messages
ALTER TABLE public.healing_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select approved healing_messages" ON public.healing_messages;
CREATE POLICY "Public select approved healing_messages" ON public.healing_messages
  FOR SELECT TO public
  USING (
    status = 'approved' 
    OR public.is_admin_or_owner() 
    OR public.has_page_access('healing-messages') 
    OR author_id = public.get_current_profile_id()
  );

DROP POLICY IF EXISTS "Authenticated insert healing_messages" ON public.healing_messages;
CREATE POLICY "Authenticated insert healing_messages" ON public.healing_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = public.get_current_profile_id() 
    OR public.is_admin_or_owner()
  );

DROP POLICY IF EXISTS "Admin manage healing_messages" ON public.healing_messages;
CREATE POLICY "Admin manage healing_messages" ON public.healing_messages
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('healing-messages'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('healing-messages'));

DROP POLICY IF EXISTS "Service role full healing_messages" ON public.healing_messages;
CREATE POLICY "Service role full healing_messages" ON public.healing_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. RLS: contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage contracts" ON public.contracts;
CREATE POLICY "Admin manage contracts" ON public.contracts
  FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('contracts'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('contracts'));

DROP POLICY IF EXISTS "Member view own contracts" ON public.contracts;
CREATE POLICY "Member view own contracts" ON public.contracts
  FOR SELECT TO authenticated
  USING (member_id = (SELECT discord_id FROM public.profiles WHERE id = public.get_current_profile_id() LIMIT 1));

DROP POLICY IF EXISTS "Service role full contracts" ON public.contracts;
CREATE POLICY "Service role full contracts" ON public.contracts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. RLS: trading_history, orders, purchase_items, trading_history_case_logs
ALTER TABLE public.trading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_history_case_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select trading_history" ON public.trading_history;
CREATE POLICY "Public select trading_history" ON public.trading_history FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage trading_history" ON public.trading_history;
CREATE POLICY "Admin manage trading_history" ON public.trading_history FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('trading-history'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('trading-history'));
DROP POLICY IF EXISTS "Service role full trading_history" ON public.trading_history;
CREATE POLICY "Service role full trading_history" ON public.trading_history FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select orders" ON public.orders;
CREATE POLICY "Public select orders" ON public.orders FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage orders" ON public.orders;
CREATE POLICY "Admin manage orders" ON public.orders FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('trading-history'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('trading-history'));
DROP POLICY IF EXISTS "Service role full orders" ON public.orders;
CREATE POLICY "Service role full orders" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select purchase_items" ON public.purchase_items;
CREATE POLICY "Public select purchase_items" ON public.purchase_items FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage purchase_items" ON public.purchase_items;
CREATE POLICY "Admin manage purchase_items" ON public.purchase_items FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('trading-history'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('trading-history'));
DROP POLICY IF EXISTS "Service role full purchase_items" ON public.purchase_items;
CREATE POLICY "Service role full purchase_items" ON public.purchase_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage trading_history_case_logs" ON public.trading_history_case_logs;
CREATE POLICY "Admin manage trading_history_case_logs" ON public.trading_history_case_logs FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('trading-history'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('trading-history'));
DROP POLICY IF EXISTS "Service role full trading_history_case_logs" ON public.trading_history_case_logs;
CREATE POLICY "Service role full trading_history_case_logs" ON public.trading_history_case_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. RLS: user_points & salmon_point_logs
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salmon_point_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select user_points" ON public.user_points;
CREATE POLICY "Public select user_points" ON public.user_points FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage user_points" ON public.user_points;
CREATE POLICY "Admin manage user_points" ON public.user_points FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('users'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('users'));
DROP POLICY IF EXISTS "Service role full user_points" ON public.user_points;
CREATE POLICY "Service role full user_points" ON public.user_points FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage salmon_point_logs" ON public.salmon_point_logs;
CREATE POLICY "Admin manage salmon_point_logs" ON public.salmon_point_logs FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('users') OR public.has_page_access('trading-history'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('users') OR public.has_page_access('trading-history'));
DROP POLICY IF EXISTS "Service role full salmon_point_logs" ON public.salmon_point_logs;
CREATE POLICY "Service role full salmon_point_logs" ON public.salmon_point_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. RLS: product_catalog
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select product_catalog" ON public.product_catalog;
CREATE POLICY "Public select product_catalog" ON public.product_catalog FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage product_catalog" ON public.product_catalog;
CREATE POLICY "Admin manage product_catalog" ON public.product_catalog FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('product-catalog'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('product-catalog'));
DROP POLICY IF EXISTS "Service role full product_catalog" ON public.product_catalog;
CREATE POLICY "Service role full product_catalog" ON public.product_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. RLS: promotion_submissions
ALTER TABLE public.promotion_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User view own promotion_submissions" ON public.promotion_submissions;
CREATE POLICY "User view own promotion_submissions" ON public.promotion_submissions FOR SELECT TO authenticated
  USING (
    user_id = public.get_current_profile_id()
    OR discord_id = (SELECT discord_id FROM public.profiles WHERE id = public.get_current_profile_id() LIMIT 1)
    OR public.is_admin_or_owner()
    OR public.has_page_access('campaigns')
  );
DROP POLICY IF EXISTS "User submit promotion_submissions" ON public.promotion_submissions;
CREATE POLICY "User submit promotion_submissions" ON public.promotion_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_profile_id() OR public.is_admin_or_owner());
DROP POLICY IF EXISTS "Admin manage promotion_submissions" ON public.promotion_submissions;
CREATE POLICY "Admin manage promotion_submissions" ON public.promotion_submissions FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('campaigns'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('campaigns'));
DROP POLICY IF EXISTS "Service role full promotion_submissions" ON public.promotion_submissions;
CREATE POLICY "Service role full promotion_submissions" ON public.promotion_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. RLS: rules_presets
ALTER TABLE public.rules_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select rules_presets" ON public.rules_presets;
CREATE POLICY "Public select rules_presets" ON public.rules_presets FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage rules_presets" ON public.rules_presets;
CREATE POLICY "Admin manage rules_presets" ON public.rules_presets FOR ALL TO authenticated
  USING (public.is_admin_or_owner()) WITH CHECK (public.is_admin_or_owner());
DROP POLICY IF EXISTS "Service role full rules_presets" ON public.rules_presets;
CREATE POLICY "Service role full rules_presets" ON public.rules_presets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 12. RLS: staff_* tables
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_level_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select staff_members" ON public.staff_members;
CREATE POLICY "Public select staff_members" ON public.staff_members FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage staff_members" ON public.staff_members;
CREATE POLICY "Admin manage staff_members" ON public.staff_members FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('manage-staff'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('manage-staff'));
DROP POLICY IF EXISTS "Service role full staff_members" ON public.staff_members;
CREATE POLICY "Service role full staff_members" ON public.staff_members FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select staff_levels" ON public.staff_levels;
CREATE POLICY "Public select staff_levels" ON public.staff_levels FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage staff_levels" ON public.staff_levels;
CREATE POLICY "Admin manage staff_levels" ON public.staff_levels FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('manage-staff'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('manage-staff'));
DROP POLICY IF EXISTS "Service role full staff_levels" ON public.staff_levels;
CREATE POLICY "Service role full staff_levels" ON public.staff_levels FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select staff_positions" ON public.staff_positions;
CREATE POLICY "Public select staff_positions" ON public.staff_positions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage staff_positions" ON public.staff_positions;
CREATE POLICY "Admin manage staff_positions" ON public.staff_positions FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('manage-staff'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('manage-staff'));
DROP POLICY IF EXISTS "Service role full staff_positions" ON public.staff_positions;
CREATE POLICY "Service role full staff_positions" ON public.staff_positions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select staff_timeline" ON public.staff_timeline;
CREATE POLICY "Public select staff_timeline" ON public.staff_timeline FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage staff_timeline" ON public.staff_timeline;
CREATE POLICY "Admin manage staff_timeline" ON public.staff_timeline FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('manage-staff'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('manage-staff'));
DROP POLICY IF EXISTS "Service role full staff_timeline" ON public.staff_timeline;
CREATE POLICY "Service role full staff_timeline" ON public.staff_timeline FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage staff_audit_logs" ON public.staff_audit_logs;
CREATE POLICY "Admin manage staff_audit_logs" ON public.staff_audit_logs FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('manage-staff'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('manage-staff'));
DROP POLICY IF EXISTS "Service role full staff_audit_logs" ON public.staff_audit_logs;
CREATE POLICY "Service role full staff_audit_logs" ON public.staff_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage staff_level_history" ON public.staff_level_history;
CREATE POLICY "Admin manage staff_level_history" ON public.staff_level_history FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('manage-staff'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('manage-staff'));
DROP POLICY IF EXISTS "Service role full staff_level_history" ON public.staff_level_history;
CREATE POLICY "Service role full staff_level_history" ON public.staff_level_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 13. RLS: server_clicks, stats, ratings, saves
ALTER TABLE public.server_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_click_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read server_clicks" ON public.server_clicks;
CREATE POLICY "Public read server_clicks" ON public.server_clicks FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public insert server_clicks" ON public.server_clicks;
CREATE POLICY "Public insert server_clicks" ON public.server_clicks FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full server_clicks" ON public.server_clicks;
CREATE POLICY "Service role full server_clicks" ON public.server_clicks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read server_click_stats" ON public.server_click_stats;
CREATE POLICY "Public read server_click_stats" ON public.server_click_stats FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage server_click_stats" ON public.server_click_stats;
CREATE POLICY "Admin manage server_click_stats" ON public.server_click_stats FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('discord-servers'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('discord-servers'));
DROP POLICY IF EXISTS "Service role full server_click_stats" ON public.server_click_stats;
CREATE POLICY "Service role full server_click_stats" ON public.server_click_stats FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read server_ratings" ON public.server_ratings;
CREATE POLICY "Public read server_ratings" ON public.server_ratings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Auth insert update server_ratings" ON public.server_ratings;
CREATE POLICY "Auth insert update server_ratings" ON public.server_ratings FOR ALL TO authenticated
  USING (
    user_id = (SELECT discord_id FROM public.profiles WHERE id = public.get_current_profile_id() LIMIT 1) 
    OR public.is_admin_or_owner()
  )
  WITH CHECK (
    user_id = (SELECT discord_id FROM public.profiles WHERE id = public.get_current_profile_id() LIMIT 1) 
    OR public.is_admin_or_owner()
  );
DROP POLICY IF EXISTS "Service role full server_ratings" ON public.server_ratings;
CREATE POLICY "Service role full server_ratings" ON public.server_ratings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth manage own server_saves" ON public.server_saves;
CREATE POLICY "Auth manage own server_saves" ON public.server_saves FOR ALL TO authenticated
  USING (
    user_id = (SELECT discord_id FROM public.profiles WHERE id = public.get_current_profile_id() LIMIT 1) 
    OR public.is_admin_or_owner()
  )
  WITH CHECK (
    user_id = (SELECT discord_id FROM public.profiles WHERE id = public.get_current_profile_id() LIMIT 1) 
    OR public.is_admin_or_owner()
  );
DROP POLICY IF EXISTS "Service role full server_saves" ON public.server_saves;
CREATE POLICY "Service role full server_saves" ON public.server_saves FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 14. RLS: web_notifications
ALTER TABLE public.web_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own web_notifications" ON public.web_notifications;
CREATE POLICY "Users read own web_notifications" ON public.web_notifications
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_profile_id() OR public.is_admin_or_owner());

DROP POLICY IF EXISTS "Users update own web_notifications" ON public.web_notifications;
CREATE POLICY "Users update own web_notifications" ON public.web_notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_profile_id() OR public.is_admin_or_owner())
  WITH CHECK (user_id = public.get_current_profile_id() OR public.is_admin_or_owner());

DROP POLICY IF EXISTS "Service role full web_notifications" ON public.web_notifications;
CREATE POLICY "Service role full web_notifications" ON public.web_notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 15. RLS: tenant_* tables (kuma-tenants)
ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_welcome_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_redemptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'tenant_configs',
    'tenant_welcome_configs',
    'tenant_minigame_channels',
    'tenant_minigame_scores',
    'tenant_minigame_settings',
    'tenant_minigame_active_sessions',
    'tenant_store_configs',
    'tenant_store_items',
    'tenant_store_redemptions'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public select %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Public select %1$s" ON public.%1$I FOR SELECT TO public USING (true)', t);

    EXECUTE format('DROP POLICY IF EXISTS "Admin manage %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admin manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_admin_or_owner() OR public.has_page_access(''kuma-tenants'')) WITH CHECK (public.is_admin_or_owner() OR public.has_page_access(''kuma-tenants''))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Service role full %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Service role full %1$s" ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 16. RLS: minigame_questions
ALTER TABLE public.minigame_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select minigame_questions" ON public.minigame_questions;
CREATE POLICY "Public select minigame_questions" ON public.minigame_questions FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage minigame_questions" ON public.minigame_questions;
CREATE POLICY "Admin manage minigame_questions" ON public.minigame_questions FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('minigames'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('minigames'));
DROP POLICY IF EXISTS "Service role full minigame_questions" ON public.minigame_questions;
CREATE POLICY "Service role full minigame_questions" ON public.minigame_questions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 17. RLS: heal_jai_* tables
DO $$
DECLARE
  t text;
  heal_jai_tables text[] := ARRAY[
    'heal_jai_counselors',
    'heal_jai_orders_sessions',
    'heal_jai_payouts',
    'heal_jai_tickets',
    'heal_jai_counselor_shifts',
    'heal_jai_financial_transactions',
    'heal_jai_consents',
    'heal_jai_analytics_events',
    'heal_jai_reviews'
  ];
BEGIN
  FOREACH t IN ARRAY heal_jai_tables LOOP
    EXECUTE format('ALTER TABLE public.%1$I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Public select %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Public select %1$s" ON public.%1$I FOR SELECT TO public USING (true)', t);

    EXECUTE format('DROP POLICY IF EXISTS "Admin manage %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admin manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_admin_or_owner() OR public.has_page_access(''heal-jai'')) WITH CHECK (public.is_admin_or_owner() OR public.has_page_access(''heal-jai''))', t);

    EXECUTE format('DROP POLICY IF EXISTS "Service role full %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Service role full %1$s" ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- 18. RLS: checkin_cycles, checkin_logs, voice_states, discord_server_bumps
ALTER TABLE public.checkin_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_server_bumps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select checkin_cycles" ON public.checkin_cycles;
CREATE POLICY "Public select checkin_cycles" ON public.checkin_cycles FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage checkin_cycles" ON public.checkin_cycles;
CREATE POLICY "Admin manage checkin_cycles" ON public.checkin_cycles FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('checkin-rewards'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('checkin-rewards'));
DROP POLICY IF EXISTS "Service role full checkin_cycles" ON public.checkin_cycles;
CREATE POLICY "Service role full checkin_cycles" ON public.checkin_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select checkin_logs" ON public.checkin_logs;
CREATE POLICY "Public select checkin_logs" ON public.checkin_logs FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admin manage checkin_logs" ON public.checkin_logs;
CREATE POLICY "Admin manage checkin_logs" ON public.checkin_logs FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('checkin-rewards'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('checkin-rewards'));
DROP POLICY IF EXISTS "Service role full checkin_logs" ON public.checkin_logs;
CREATE POLICY "Service role full checkin_logs" ON public.checkin_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select voice_states" ON public.voice_states;
CREATE POLICY "Public select voice_states" ON public.voice_states FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Service role full voice_states" ON public.voice_states;
CREATE POLICY "Service role full voice_states" ON public.voice_states FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select discord_server_bumps" ON public.discord_server_bumps;
CREATE POLICY "Public select discord_server_bumps" ON public.discord_server_bumps FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Public insert discord_server_bumps" ON public.discord_server_bumps;
CREATE POLICY "Public insert discord_server_bumps" ON public.discord_server_bumps FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "Admin manage discord_server_bumps" ON public.discord_server_bumps;
CREATE POLICY "Admin manage discord_server_bumps" ON public.discord_server_bumps FOR ALL TO authenticated
  USING (public.is_admin_or_owner() OR public.has_page_access('discord-servers'))
  WITH CHECK (public.is_admin_or_owner() OR public.has_page_access('discord-servers'));
DROP POLICY IF EXISTS "Service role full discord_server_bumps" ON public.discord_server_bumps;
CREATE POLICY "Service role full discord_server_bumps" ON public.discord_server_bumps FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
