//深拷貝
function deepClone(obj: any, cache = new WeakMap()) {
  //已經有cache紀錄的，直接回傳之前複製的物件
  if (cache.has(obj)) {
    return cache.get(obj);
  }

  //預防
  if (obj === null || typeof obj !== "object" || typeof obj === "function") {
    return obj;
  }

  //複製時間物件
  //複製正規表達式
  //避免特殊物件被一般處理
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof RegExp) return new RegExp(obj);

  //確認obj是不是array
  const result = Array.isArray(obj)
    ? []
    : Object.create(Object.getPrototypeOf(obj));

  //把obj和result記錄到cache中，預防相同參照進到遞迴
  cache.set(obj, result);

  //Symbol鍵是唯一值、私有不可被讀取
  //Reflect.ownKeys可以取得最完整的資料
  for (const key of Reflect.ownKeys(obj)) {
    const value = obj[key];
    result[key] = deepClone(value, cache);
  }

  return result;
}

export function getChangedFields(original: any, updated: any) {
  const keys = Object.keys(updated);

  return keys.filter((key) => {
    const originalValue = deepClone(original[key]);
    const updatedValue = deepClone(updated[key]);

    if (
      key === "students" &&
      Array.isArray(originalValue) &&
      Array.isArray(updatedValue)
    ) {
      originalValue.forEach((s) => delete s._id);
      updatedValue.forEach((s) => delete s._id);
    }

    if (typeof originalValue === "object" && typeof updatedValue === "object") {
      delete originalValue?._id;
      delete updatedValue?._id;
    }

    return JSON.stringify(originalValue) !== JSON.stringify(updatedValue);
  });
}
