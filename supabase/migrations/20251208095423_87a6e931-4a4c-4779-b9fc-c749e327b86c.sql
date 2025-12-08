-- Add channel_icon column to channel_settings table
ALTER TABLE public.channel_settings
ADD COLUMN channel_icon text;