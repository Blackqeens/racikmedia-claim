// File: api/theme.js

// Menyimpan status tema aktif sementara di memori server lokal
let temaGlobalSekarang = "tema-standar"; 

export default async function handler(req, res) {
    // 1. Jalur POST: Dipicu saat Master Admin mengubah tema lewat tombol
    if (req.method === 'POST') {
        const { temaBaru } = req.body;
        temaGlobalSekarang = temaBaru;
        return res.status(200).json({ message: "Tema global berhasil diperbarui!" });
    }

    // 2. Jalur GET: Dipicu otomatis oleh browser user biasa untuk memuat warna aktif
    if (req.method === 'GET') {
        return res.status(200).json({ temaEvent: temaGlobalSekarang });
    }

    // Proteksi jika metode HTTP salah
    return res.status(405).json({ error: "Metode HTTP tidak diizinkan" });
}
