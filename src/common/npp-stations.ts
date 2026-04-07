const STATION_NAME_ENDINGS = "(?:ая|ой|ую|ое|ом|ие|их)?";
const ATOMIC_LABEL_PATTERN =
  "(?:атомн(?:ая|ой|ую|ое|ом|ых)?\\s+станци(?:я|и|ю|е|ей|ям|ями|ях)|аэс(?:-[а-яa-z]+)*)";

const NPP_STATION_DEFINITIONS = [
  { canonical: "Балаковская атомная станция", stem: "балаковск" },
  { canonical: "Белоярская атомная станция", stem: "белоярск" },
  { canonical: "Билибинская атомная станция", stem: "билибинск" },
  { canonical: "Калининская атомная станция", stem: "калининск" },
  { canonical: "Кольская атомная станция", stem: "кольск" },
  { canonical: "Курская атомная станция", stem: "курск" },
  { canonical: "Ленинградская атомная станция", stem: "ленинградск" },
  { canonical: "Нововоронежская атомная станция", stem: "нововоронежск" },
  { canonical: "Ростовская атомная станция", stem: "ростовск" },
  { canonical: "Смоленская атомная станция", stem: "смоленск" }
] as const;

const NPP_STATION_PATTERNS = NPP_STATION_DEFINITIONS.map((station) => ({
  canonical: station.canonical,
  pattern: new RegExp(`${station.stem}${STATION_NAME_ENDINGS}\\s+${ATOMIC_LABEL_PATTERN}`, "i")
}));

export const NPP_STATION_NAMES = NPP_STATION_DEFINITIONS.map((station) => station.canonical) as ReadonlyArray<string>;
export const NPP_SOURCE_CODES = ["eis", "eis_contracts", "eis_contracts_223"] as const;

export function resolveNppStationNameFromText(
  values: ReadonlyArray<string | null | undefined>
): string | undefined {
  const haystack = normalizeNppSearchText(values);

  if (!haystack) {
    return undefined;
  }

  return NPP_STATION_PATTERNS.find((station) => station.pattern.test(haystack))?.canonical;
}

export function getSourceSpecificData(rawPayload: unknown): Record<string, unknown> | undefined {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return undefined;
  }

  const candidate = (rawPayload as Record<string, unknown>).sourceSpecificData;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }

  return candidate as Record<string, unknown>;
}

export function resolveNppStationName(
  rawPayload: unknown,
  values: ReadonlyArray<string | null | undefined>
): string | undefined {
  const sourceSpecificData = getSourceSpecificData(rawPayload);
  const explicitStationName =
    typeof sourceSpecificData?.targetStationName === "string" ? sourceSpecificData.targetStationName.trim() : "";

  if (explicitStationName) {
    return explicitStationName;
  }

  return resolveNppStationNameFromText([
    ...values,
    typeof sourceSpecificData?.matchedQuery === "string" ? sourceSpecificData.matchedQuery : undefined,
    typeof sourceSpecificData?.customerName === "string" ? sourceSpecificData.customerName : undefined,
    typeof sourceSpecificData?.supplierName === "string" ? sourceSpecificData.supplierName : undefined
  ]);
}

export function withResolvedNppTargetStation(
  rawPayload: unknown,
  stationName: string | undefined
): Record<string, unknown> | undefined {
  const payload =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? ({ ...(rawPayload as Record<string, unknown>) } as Record<string, unknown>)
      : undefined;

  if (!stationName) {
    return payload;
  }

  const sourceSpecificData = {
    ...(getSourceSpecificData(payload) ?? {}),
    targetStationName: stationName
  };

  return {
    ...(payload ?? {}),
    sourceSpecificData
  };
}

function normalizeNppSearchText(values: ReadonlyArray<string | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
