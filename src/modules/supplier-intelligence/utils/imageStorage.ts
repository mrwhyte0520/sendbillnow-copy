import { supabase } from '../../../lib/supabase';

const BUCKET = 'product-images';

const dataUrlToBlob = async (value: string) => {
  const response = await fetch(value);
  return response.blob();
};

const loadImageElement = (blob: Blob) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Invalid image'));
  };
  image.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('Image conversion failed'));
      return;
    }
    resolve(blob);
  }, 'image/jpeg', quality);
});

const resizeImage = async (blob: Blob, width: number) => {
  const image = await loadImageElement(blob);
  const ratio = Math.min(1, width / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82;
  let output = await canvasToBlob(canvas, quality);
  while (output.size > 150 * 1024 && quality > 0.4) {
    quality -= 0.08;
    output = await canvasToBlob(canvas, quality);
  }
  return output;
};

const ensureBucket = async () => {
  try {
    const { data } = await supabase.storage.listBuckets();
    if (Array.isArray(data) && data.some((bucket) => bucket.name === BUCKET)) {
      return;
    }
    await supabase.storage.createBucket(BUCKET, { public: true });
  } catch {
  }
};

const fetchImageBlob = async (input: string) => {
  const source = String(input || '').trim();
  if (!source) return null;
  if (source.startsWith('data:')) {
    return dataUrlToBlob(source);
  }
  if (/^https?:\/\//i.test(source) || source.startsWith('blob:')) {
    const response = await fetch(source);
    if (!response.ok) throw new Error('Image download failed');
    return response.blob();
  }
  return null;
};

export async function uploadProductImage(input: string, businessId: string, productId: string) {
  const blob = await fetchImageBlob(input).catch(() => null);
  if (!blob || typeof document === 'undefined') {
    return '';
  }

  await ensureBucket();

  const optimized = await resizeImage(blob, 300).catch(() => blob);
  const thumbnail = await resizeImage(blob, 120).catch(() => optimized);
  const mainPath = `${businessId}/${productId}.jpg`;
  const thumbPath = `${businessId}/${productId}_thumb.jpg`;

  await supabase.storage.from(BUCKET).upload(mainPath, optimized, { upsert: true, contentType: 'image/jpeg' });
  await supabase.storage.from(BUCKET).upload(thumbPath, thumbnail, { upsert: true, contentType: 'image/jpeg' });

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(mainPath);
  return String(data?.publicUrl || '').trim();
}
