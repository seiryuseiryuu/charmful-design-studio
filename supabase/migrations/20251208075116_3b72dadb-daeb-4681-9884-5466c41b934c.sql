-- Create table for storing channel thumbnails fetched from YouTube
CREATE TABLE public.channel_thumbnails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.channel_settings(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  video_title TEXT,
  thumbnail_url TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(channel_id, video_id)
);

-- Enable RLS
ALTER TABLE public.channel_thumbnails ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own channel thumbnails"
ON public.channel_thumbnails FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own channel thumbnails"
ON public.channel_thumbnails FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channel thumbnails"
ON public.channel_thumbnails FOR DELETE
USING (auth.uid() = user_id);

-- Add workflow_step column to conversations for tracking workflow state
ALTER TABLE public.conversations 
ADD COLUMN workflow_step INTEGER DEFAULT 0,
ADD COLUMN reference_thumbnails JSONB DEFAULT '[]'::jsonb,
ADD COLUMN selected_text TEXT;