/** Kompres foto bukti di tablet: maks sisi 1280 px, JPEG, ≤ 300 KB (spec 6). */
export async function compressPhoto(file: Blob, maxBytes = 300 * 1024): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Foto tidak bisa dibaca'));
      i.src = url;
    });
    let maxSide = 1280;
    let quality = 0.8;
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) return blob;
      if (quality > 0.5) quality -= 0.12;
      else maxSide = Math.round(maxSide * 0.8);
    }
    throw new Error('Foto terlalu besar, coba foto ulang');
  } finally {
    URL.revokeObjectURL(url);
  }
}
