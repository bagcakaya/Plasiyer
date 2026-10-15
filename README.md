# ERP12 Mobil Saha Satış (Plasiyer) PWA & Entegrasyon Sistemi

Bu proje, **ERP12** masaüstü/sunucu programıyla entegre çalışan, **çevrimdışı (offline-first)** destekli, **PWA (Progressive Web App)** teknolojisine sahip mobil saha satış ve sipariş alma sistemidir.

---

## 🏗️ Mimari Yapı

```
[ ERP12 Sunucusu (MSSQL) ]
            │  (Yerel TCP/IP 1433)
[ server/ - Entegrasyon REST API ] (Node.js Express + mssql - Statik IP:Port 4000)
            │  (HTTPS / JSON)
[ client/ - Mobil Plasiyer PWA ] (React + Vite + TailwindCSS + Dexie.js IndexedDB)
```

---

## 📱 Faz 1 Özellikleri (Mevcut Durum)

1. **Cari Listesi & Bakiye Ekranı:**
   - Plasiyere bağlı müşterilerin anlık borç, alacak ve bakiye gösterimi (Borçlu / Alacaklı renk ayrımları).
   - Risk limiti ve limit aşım uyarıları.
   - İsim, cari kodu, il/ilçe bazlı anlık arama ve hızlı filtreler.
   - Müşteriyi doğrudan telefonla arama ve harita adresi.
   - Tek tıkla ilgili müşteri için sipariş başlatma.

2. **Stok Kataloğu & Ürünler:**
   - ERP12 stok kartları, barkodları ve anlık mevcut stok miktarları.
   - Müşterinin fiyat listesine (Liste 1, Liste 2, Liste 3) ve özel iskontosuna göre otomatik fiyat hesaplama.
   - Hızlı ürün arama ve kategori bazlı filtreleme.
   - Kart üzerinde hızlı + / - miktar butonları ile seri sepete ekleme.

3. **Sepet & Sipariş Oluşturma:**
   - Kalem bazlı iskonto ve fiyat düzenleme.
   - Teslimat tarihi seçimi ve sipariş notu ekleme.
   - KDV ve matrah detaylı net genel toplam tablosu.
   - Çevrimiçi/Çevrimdışı algılama ve akıllı gönderim.

4. **Offline-First (Çevrimdışı Destek):**
   - **IndexedDB (Dexie.js)** ile tüm cariler, stoklar ve bekleyen siparişler cihazda güvenle saklanır.
   - İnternet olmayan depolarda veya sahada siparişler kesintisiz alınır, yerel kuyruğa yazılır.
   - İnternet geldiğinde otomatik veya tek tıkla ERP12'ye iletilir.

5. **ERP12 Sunucu & Statik IP Yapılandırması:**
   - Ayarlar ekranından firmanın Statik IP / API adresi, şirket kodu ve dönemi değiştirilebilir.
   - Canlı ping / bağlantı testi butonu.

---

## 🚀 Çalıştırma Talimatları

### 1. Mobil PWA Arayüzünü Başlatma (Frontend)
```powershell
cd c:\Users\Mert\Desktop\Plasiyer\client
npm run dev -- --host
```
* **Bilgisayardan test etmek için:** `http://localhost:5173`
* **Cep telefonundan açmak için:** Aynı Wi-Fi'ye bağlıyken tarayıcıdan `http://192.168.1.105:5173` adresine girin.
* **Telefona Uygulama Olarak Yükleme:** Safari veya Chrome'da **"Ana Ekrana Ekle" (Add to Home Screen)** butonuna basarak tam ekran mobil uygulama olarak kullanabilirsiniz.

---

### 2. ERP12 Entegrasyon API Servisi (Backend)
ERP12'nin kurulu olduğu şirket sunucusunda:
```powershell
cd c:\Users\Mert\Desktop\Plasiyer\server
# .env dosyasını oluşturup MSSQL bilgilerinizi giriniz:
# DB_SERVER, DB_USER, DB_PASSWORD, DB_NAME
npm start
```
Bu servis `http://localhost:4000/api` üzerinde çalışır ve modemden statik IP'ye port yönlendirmesi (örn. `4000`) yapıldığında mobil PWA doğrudan bu API ile konuşur.
