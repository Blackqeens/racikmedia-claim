# Google Maps untuk checkout

Peta checkout memakai Google Maps JavaScript API untuk mencari alamat, memilih pin, dan mengisi koordinat pengiriman. Tanpa API key yang valid, alamat masih bisa diisi manual.

## Menyiapkan Google Cloud

1. Pilih atau buat project Google Cloud dan aktifkan billing.
2. Aktifkan **Maps JavaScript API** dan **Geocoding API**.
3. Buat API key, lalu batasi key:
   - **Application restrictions:** Websites (HTTP referrers); tambahkan alamat localhost yang dipakai untuk development dan domain produksi, misalnya `http://localhost:5500/*` dan `https://contoh-domain.id/*`.
   - **API restrictions:** batasi ke Maps JavaScript API dan Geocoding API.
4. Salin `assets/js/google-maps-config.example.js` menjadi `assets/js/google-maps-config.js`, lalu isi `apiKey` dengan key tersebut.

Contoh perintah PowerShell:

```powershell
Copy-Item assets\js\google-maps-config.example.js assets\js\google-maps-config.js
```

File `google-maps-config.js` lokal sudah dikecualikan dari Git. Browser harus menerima key agar dapat memuat peta, jadi key tetap dapat dilihat oleh pengunjung; pembatasan referrer, API, dan quota adalah pengaman yang penting. Jangan menaruh key yang tidak dibatasi di repository.

## Batasan saat ini

Titik yang dipilih disertakan dalam data order prototipe di browser. Checkout belum menyimpan order atau koordinat ke backend, dan pembayaran masih simulasi; jangan gunakan koordinat ini sebagai data transaksi produksi sebelum API order memvalidasi dan menyimpannya di server.
