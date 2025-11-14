/*
  # Create storage policies for scenario media bucket

  1. Security Policies
    - Allow authenticated users to upload media to their own folder
    - Allow public read access to all scenario media
    - Allow users to update/delete their own media files
*/

CREATE POLICY "Authenticated users can upload scenario media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scenario-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view scenario media"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'scenario-media');

CREATE POLICY "Users can update their own scenario media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'scenario-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own scenario media"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'scenario-media' AND auth.uid()::text = (storage.foldername(name))[1]);