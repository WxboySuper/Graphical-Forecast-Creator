-- The Discord forum thread created for each submission, so status updates can be posted into it.
ALTER TABLE feedback ADD COLUMN discord_thread_id TEXT;
