export type AssetMetadata = Record<string, unknown>;

function parseMetadataObject(input: string | null | undefined): AssetMetadata | null {
  if (!input) {
    return {};
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as AssetMetadata;
  } catch {
    return null;
  }
}

export function getCoinGeckoIdFromMetadata(input: string | null | undefined): string | null {
  const metadata = parseMetadataObject(input);
  if (!metadata) {
    return null;
  }

  const raw =
    metadata.coinGeckoId ??
    metadata.coingeckoId ??
    metadata.coingecko_id;

  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export function mergeCoinGeckoIdIntoMetadata(params: {
  metadataJson: string | null | undefined;
  coinGeckoId: string | null | undefined;
}): { metadataJson: string | null; error?: string } {
  const baseMetadata = parseMetadataObject(params.metadataJson);

  const normalizedCoinGeckoId = params.coinGeckoId?.trim();

  if (baseMetadata === null) {
    if (!normalizedCoinGeckoId) {
      const fallback = params.metadataJson?.trim();
      return {
        metadataJson: fallback ? fallback : null,
      };
    }

    return {
      metadataJson: null,
      error: 'Metadata must be valid JSON object syntax (e.g. {"key":"value"}) to store a CoinGecko mapping.',
    };
  }

  const metadata: AssetMetadata = { ...baseMetadata };

  delete metadata.coinGeckoId;
  delete metadata.coingeckoId;
  delete metadata.coingecko_id;

  if (normalizedCoinGeckoId) {
    metadata.coinGeckoId = normalizedCoinGeckoId;
  }

  if (Object.keys(metadata).length === 0) {
    return { metadataJson: null };
  }

  return {
    metadataJson: JSON.stringify(metadata),
  };
}
