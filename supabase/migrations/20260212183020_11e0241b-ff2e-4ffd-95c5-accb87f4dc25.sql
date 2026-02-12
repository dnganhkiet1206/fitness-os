-- Make progress-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'progress-photos';