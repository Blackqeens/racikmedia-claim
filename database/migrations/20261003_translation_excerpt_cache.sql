-- Invalidate AI translation cache when an article excerpt changes.
BEGIN;

CREATE OR REPLACE FUNCTION fn_invalidate_translation_cache()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
  OR NEW.content IS DISTINCT FROM OLD.content
  OR NEW.excerpt IS DISTINCT FROM OLD.excerpt
  THEN
    UPDATE translation_cache
       SET cache_status = 'stale',
           updated_at = NOW()
     WHERE article_id = NEW.id
       AND cache_status = 'fresh';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_cache_on_article_update ON articles;

CREATE TRIGGER trg_invalidate_cache_on_article_update
  AFTER UPDATE OF title, content, excerpt ON articles
  FOR EACH ROW
  EXECUTE FUNCTION fn_invalidate_translation_cache();

COMMIT;
