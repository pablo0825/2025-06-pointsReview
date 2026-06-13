import fs from "fs/promises";
import path from "path";

export const deleteObsoleteFiles = async (
  allFiles: string[],
  keepFiles: string[]
) => {
  const toDelete = allFiles.filter((url) => !keepFiles.includes(url));

  for (const url of toDelete) {
    if (!url.startsWith("/uploads/")) continue;
    const actualPath = path.join(
      process.cwd(),
      "storage",
      url.replace("/uploads/", "")
    );

    try {
      await fs.unlink(actualPath);
      console.log(`已刪除檔案: ${actualPath}`);
    } catch (err: any) {
      console.warn(`無法刪除檔案 ${actualPath}`, err.message);
    }
  }
};
