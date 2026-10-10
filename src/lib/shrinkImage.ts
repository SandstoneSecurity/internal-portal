/**
 * Phone photos and CCTV stills arrive large and sometimes sideways. This turns the right way up (from the
 * EXIF orientation), shrinks to `maxEdge` and re-encodes as JPEG, so uploads stay small and textures light.
 */
export async function shrinkImage(file: File, maxEdge = 2400): Promise<{ file: File; w: number; h: number }> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|avif|heic|heif)/i.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.name)) {
    throw new Error("Choose a photo or image (JPEG, PNG or WebP).");
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This browser can't read that image. Try a JPEG or PNG.");
  }
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  cv.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/jpeg", 0.86));
  if (!blob) throw new Error("Couldn't prepare that image.");
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { file: new File([blob], name, { type: "image/jpeg" }), w, h };
}
