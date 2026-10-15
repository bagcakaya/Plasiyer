/**
 * Sayıyı Türkçe yazıya çevirir (Tahsilat Makbuzu için)
 * Örn: 1250.50 -> "Yalnız Bin İki Yüz Elli TL Elli Kr."
 */
export function amountToTurkishWords(amount: number): string {
  if (!amount || isNaN(amount) || amount <= 0) return 'Sıfır TL';

  const birler = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
  const onlar = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
  const basamaklar = ['', 'Bin', 'Milyon', 'Milyar'];

  function ucBasamak(n: number): string {
    let sonuc = '';
    const yuzler = Math.floor(n / 100);
    const kalan = n % 100;
    const on = Math.floor(kalan / 10);
    const bir = kalan % 10;

    if (yuzler > 0) {
      if (yuzler === 1) sonuc += 'Yüz ';
      else sonuc += birler[yuzler] + ' Yüz ';
    }

    if (on > 0) {
      sonuc += onlar[on] + ' ';
    }

    if (bir > 0) {
      sonuc += birler[bir] + ' ';
    }

    return sonuc.trim();
  }

  const tamKisim = Math.floor(amount);
  const kurusKisim = Math.round((amount - tamKisim) * 100);

  let tamMetin = '';
  let tempTam = tamKisim;
  let basamakIdx = 0;

  if (tamKisim === 0) {
    tamMetin = 'Sıfır';
  } else {
    while (tempTam > 0) {
      const grup = tempTam % 1000;
      if (grup > 0) {
        let grupMetin = ucBasamak(grup);
        // "Bir Bin" yerine sadece "Bin" denir
        if (basamakIdx === 1 && grup === 1) {
          grupMetin = 'Bin';
        } else if (basamaklar[basamakIdx]) {
          grupMetin += ' ' + basamaklar[basamakIdx];
        }
        tamMetin = grupMetin + (tamMetin ? ' ' + tamMetin : '');
      }
      tempTam = Math.floor(tempTam / 1000);
      basamakIdx++;
    }
  }

  let sonuc = `Yalnız ${tamMetin} TL`;

  if (kurusKisim > 0) {
    const kurusMetin = ucBasamak(kurusKisim);
    sonuc += ` ${kurusMetin} Kr.`;
  }

  return sonuc.trim();
}
