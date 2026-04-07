const SUPPLIER_BOILERPLATE_MARKERS = [
  "поделитесь мнением о качестве работы",
  "единая информационная система в сфере закупок",
  "официальные ресурсы",
  "техническая поддержка",
  "ваши идеи по улучшению сайта",
  "отчет о посещаемости",
  "карта сайта",
  "часто задаваемые вопросы",
  "новости поставщикам заказчикам органам контроля",
  "версия hotfix",
  "федеральное казначейство"
];

const SEEDED_PLACEHOLDER_SUPPLIERS = new Set([
  normalizeSupplierName("ООО Альфа"),
  normalizeSupplierName("ООО Бета"),
  normalizeSupplierName("ООО Гамма")
]);

export function normalizeSupplierName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\"'`«»().,]/g, " ")
    .replace(/\b(ооо|ао|пао|зао|ип|оао|нпо|фгуп|муп|гуп)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMeaningfulSupplierName(name: string | null | undefined, metadata?: unknown): boolean {
  const cleaned = cleanSupplierName(name);

  if (!cleaned || isSeedSupplierMetadata(metadata)) {
    return false;
  }

  const normalized = cleaned.toLowerCase();
  const normalizedKey = normalizeSupplierName(cleaned);
  const urlMatches = cleaned.match(/\b(?:https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})/gi) ?? [];
  const hasBoilerplateMarker = SUPPLIER_BOILERPLATE_MARKERS.some((marker) =>
    normalized.includes(marker)
  );

  if (
    !normalizedKey ||
    SEEDED_PLACEHOLDER_SUPPLIERS.has(normalizedKey) ||
    cleaned.length > 220 ||
    urlMatches.length >= 3 ||
    hasBoilerplateMarker ||
    normalized.includes("официальный сайт единой информационной системы") ||
    normalized.includes("контрактной системе в сфере закупок")
  ) {
    return false;
  }

  return true;
}

export function cleanSupplierName(name: string | null | undefined): string | undefined {
  const cleaned = (name ?? "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function isSeedSupplierMetadata(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const source =
    "source" in metadata && typeof metadata.source === "string"
      ? metadata.source
      : undefined;

  return source === "seed";
}
