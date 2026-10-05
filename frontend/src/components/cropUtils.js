const createImage = (url) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous'); // 避免跨域問題
        image.src = url;
    });

/**
 * 根據 react-easy-crop 提供的像素座標裁切圖片
 * @param {string} imageSrc - 原始圖片的 URL
 * @param {object} pixelCrop - 裁切區域 { x, y, width, height }
 * @returns {Promise<string>} - 返回裁切後圖片的 Base64 Data URL
 */
export default async function getCroppedImg(imageSrc, pixelCrop) {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 設定畫布大小為裁切區域的大小 (這決定了最終輸出的解析度比例)
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    // 在畫布上繪製裁切後的圖像
    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    // 輸出為 Data URL (Base64 字串)
    return canvas.toDataURL('image/jpeg', 0.9); // 0.9 為品質參數
}
