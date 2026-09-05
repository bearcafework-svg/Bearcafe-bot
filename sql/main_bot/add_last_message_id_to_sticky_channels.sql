-- Add last_message_id column to sticky_channels table to persist last sticky message ID across bot restarts
ALTER TABLE public.sticky_channels ADD COLUMN IF NOT EXISTS last_message_id TEXT;
