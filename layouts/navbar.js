document.addEventListener("DOMContentLoaded", function () {
    // 1. Membaca status login dan peran (role) pengguna dari browser
    let isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
    let userRole = localStorage.getItem("user_role") || sessionStorage.getItem("bob_user_role");

    if (!isLoggedIn) {
        try {
            const hint = JSON.parse(sessionStorage.getItem("bob_profile_hint"));
            if (hint && (hint.role || hint.email)) {
                isLoggedIn = true;
                userRole = hint.role || userRole;
            }
        } catch (e) {}
    }

    userRole = userRole || "member";

    // 2. Pemetaan dashboard masing-masing role
    function getRoleDashboardUrl(role) {
        switch (role) {
            case "master_admin":
                return "/dashboard/master-admin/";
            case "admin":
                return "/dashboard/admin/";
            case "seller":
		return "/dashboard/seller/";
            case "penjual":
		return "/dashboard/seller/";
            case "penyedia_jasa":
		return "/dashboard/seller/";
            case "mekanik":
                return "/dashboard/seller/";
            case "member":
		return "/dashboard/main/";
            case "pengguna":
		return "/dashboard/main/";
            default:
                return "/dashboard/main/";
        }
    }

    // URL dashboard sesuai role pengguna yang login
    const dashboardUrl = getRoleDashboardUrl(userRole);
    // Saat login: logo kembali ke dashboard masing-masing role (bukan halaman utama publik)
    // Ketika pengunjung (belum login): logo kembali ke dashboard utama publik (/index.html)
    const logoUrl = isLoggedIn ? dashboardUrl : "/index.html";

    // 3. Ambil elemen body untuk memanipulasi class halaman
    const bodyElement = document.body;
    let menuHTML = "";

    // 4. LOGIC: Jika log terbaca SUDAH LOGIN, tampilkan Toolbar Dashboard
    if (isLoggedIn) {
        bodyElement.classList.add("dashboard-page");

        // Memanggil struktur toolbar dashboard dengan logo Racik Media menuju dashboard role terkait
        menuHTML = `
            <div class="dashboard-toolbar">
                <div class="dashboard-toolbar__controls">
                    <a href="${logoUrl}" class="nav-brand-logo flex items-center" aria-label="Racik Media — Dashboard (${userRole})" title="Kembali ke Dashboard">
                        <img src="/assets/brand/1.png" alt="Racik Media" style="height:32px;width:auto;display:block;" onerror="this.onerror=null;this.src='/assets/logo.png';">
                    </a>
                    <div class="search-bar">
                        <input type="text" placeholder="Cari klaim...">
                    </div>
                    <div class="nav-links">
                        <a href="${dashboardUrl}" class="active">Ringkasan</a>
                        <button onclick="prosesLogout()" class="btn-logout">Keluar</button>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Jika BELUM LOGIN (Pengunjung), panggil class dan struktur header bawaan publik, logo menuju beranda utama
        bodyElement.classList.remove("dashboard-page");

        menuHTML = `
            <header class="site-header">
                <div class="site-header__inner">
                    <div class="site-header__logo">
                        <a href="/index.html" aria-label="Racik Media — Beranda"><img src="/assets/brand/1.png" alt="Racik Media" onerror="this.onerror=null;this.src='/assets/logo.png';"></a>
                    </div>
                    <nav class="site-header__nav">
                        <a href="/index.html">Home</a>
                        <a href="/pages/main/events.html">Events</a>
                        <a href="/login.html" class="site-header__actions">Masuk</a>
                    </nav>
                </div>
            </header>
        `;
    }

    // 5. Suntikkan HTML ke tempat pemanggilan
    const navbarContainer = document.getElementById("render-navbar");
    if (navbarContainer) {
        navbarContainer.innerHTML = menuHTML;
    }
});

// Fungsi logout global
window.prosesLogout = function () {
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("user_role");
    sessionStorage.removeItem("bob_profile_hint");
    sessionStorage.removeItem("bob_user_role");
    if (window.BobAuth && typeof window.BobAuth.logout === "function") {
        window.BobAuth.logout({ confirmed: true });
    } else {
        window.location.href = "/login.html";
    }
};
