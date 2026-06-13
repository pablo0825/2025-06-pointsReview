import multer from "multer";
import path from "path";

// 封裝安全檔名處理
const sanitizeFileName = (name: string) => {
  return name.replace(/[^\w\s\-]/g, "").replace(/\s+/g, "_"); // 移除特殊字元，空白變底線
};

const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, "../../storage/uploads"));
  },
  filename: (req, file, cb) => {
    const contactName = sanitizeFileName(
      req.body?.contact?.name || "unknown"
    ).substring(0, 10);
    const uniqueName = `${Date.now()}-${contactName}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (_req: any, file: any, cb: any) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("不支援的檔案格式"));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB/檔
    files: 10,
  },
  fileFilter,
});
