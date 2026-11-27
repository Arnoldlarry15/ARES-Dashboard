-- Enable pgvector extension (pgvector 0.8.7 verified available on local PostgreSQL 16)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add native pgvector column matching DEFAULT_EMBEDDING_DIMENSIONS (768)
ALTER TABLE "global_prompt_registry"
  ADD COLUMN IF NOT EXISTS "embeddingVector" vector(768);

-- Create HNSW cosine similarity index for global semantic retrieval
CREATE INDEX IF NOT EXISTS "global_prompt_registry_embeddingVector_hnsw_idx"
  ON "global_prompt_registry"
  USING hnsw ("embeddingVector" vector_cosine_ops);
