-- =============================================================
-- BOB · Racik Media Nusantara (Blackqeens's Org)
-- Database Schema & Security — Real-Time Chat Marketplace Module
-- Engine : PostgreSQL 15+ / Supabase
-- Encoding: UTF-8
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TABEL CHAT_ROOMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Mencegah member membuat ruang obrolan dengan diri sendiri
  CONSTRAINT chk_different_users CHECK (buyer_id <> seller_id),
  -- Memastikan hanya ada 1 room unik untuk kombinasi buyer & seller yang sama
  CONSTRAINT uq_buyer_seller UNIQUE (buyer_id, seller_id)
);

COMMENT ON TABLE  public.chat_rooms            IS 'Ruang obrolan langsung (1-on-1) antara pembeli dan penjual di marketplace.';
COMMENT ON COLUMN public.chat_rooms.buyer_id   IS 'ID pembeli yang menginisiasi obrolan (relasi ke auth.users).';
COMMENT ON COLUMN public.chat_rooms.seller_id  IS 'ID penjual / pemilik toko (relasi ke auth.users).';

-- ─────────────────────────────────────────────────────────────
-- 2. TABEL CHAT_MESSAGES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id       UUID NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text  TEXT NOT NULL CHECK (char_length(trim(message_text)) > 0),
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE  public.chat_messages               IS 'Daftar pesan terkirim dalam ruang obrolan.';
COMMENT ON COLUMN public.chat_messages.room_id       IS 'ID ruang obrolan pesan ini berada.';
COMMENT ON COLUMN public.chat_messages.sender_id     IS 'ID pengirim pesan (harus buyer_id atau seller_id dari room terkait).';
COMMENT ON COLUMN public.chat_messages.message_text  IS 'Konten teks pesan (tidak boleh string kosong).';
COMMENT ON COLUMN public.chat_messages.is_read       IS 'Status apakah pesan sudah dibaca oleh lawan bicara.';

-- ─────────────────────────────────────────────────────────────
-- 3. OPTIMASI INDEXING UNTUK PERFORMA QUERY REALTIME
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_rooms_buyer_id 
  ON public.chat_rooms(buyer_id);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_seller_id 
  ON public.chat_rooms(seller_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created 
  ON public.chat_messages(room_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_unread 
  ON public.chat_messages(room_id, is_read) 
  WHERE is_read = FALSE;

-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS) POLICIES (KETAT & AMAN DARI BYPASS)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ── Kebijakan Tabel: public.chat_rooms ──

-- A. Hanya buyer atau seller yang boleh melihat ruang chat mereka
CREATE POLICY "Users can view their own chat rooms"
  ON public.chat_rooms
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = buyer_id OR auth.uid() = seller_id
  );

-- B. Pengguna hanya dapat membuat room jika mereka adalah buyer_id atau seller_id
CREATE POLICY "Users can create chat rooms they participate in"
  ON public.chat_rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id OR auth.uid() = seller_id
  );

-- ── Kebijakan Tabel: public.chat_messages ──

-- A. Hanya partisipan room yang boleh membaca pesan dalam room tersebut
CREATE POLICY "Participants can view room messages"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE public.chat_rooms.id = public.chat_messages.room_id
        AND (public.chat_rooms.buyer_id = auth.uid() OR public.chat_rooms.seller_id = auth.uid())
    )
  );

-- B. Hanya partisipan room yang boleh mengirim pesan, dan sender_id WAJIB adalah auth.uid()
CREATE POLICY "Participants can insert messages with their own sender_id"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE public.chat_rooms.id = public.chat_messages.room_id
        AND (public.chat_rooms.buyer_id = auth.uid() OR public.chat_rooms.seller_id = auth.uid())
    )
  );

-- C. Partisipan dapat memperbarui status pesan (misal menandai pesan is_read = true)
CREATE POLICY "Participants can update message read status"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE public.chat_rooms.id = public.chat_messages.room_id
        AND (public.chat_rooms.buyer_id = auth.uid() OR public.chat_rooms.seller_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE public.chat_rooms.id = public.chat_messages.room_id
        AND (public.chat_rooms.buyer_id = auth.uid() OR public.chat_rooms.seller_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 5. SUPABASE REALTIME REPLICATION
-- ─────────────────────────────────────────────────────────────
-- Mengaktifkan pengiriman event INSERT/UPDATE ke websocket Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
