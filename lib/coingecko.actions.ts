"use server";

import queryString from "query-string";

const BASE_URL = process.env.COINGECKO_BASE_URL;
const API_KEY = process.env.COINGECKO_API_KEY;

if (!BASE_URL || !API_KEY) {
  throw new Error("Missing COINGECKO_BASE_URL or COINGECKO_API_KEY");
}

interface CoinGeckoError {
  error_code?: number;
  error_message?: string;
}

interface CoinGeckoErrorBody {
  error?: string;
  status?: CoinGeckoError;
  timestamp?: string;
}

export async function fetcher<T>(
  endpoint: string,
  params?: QueryParams,
  revalidate = 60
): Promise<T> {
  const url = queryString.stringifyUrl(
    {
      url: `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`,
      query: params,
    },
    { skipEmptyString: true, skipNull: true }
  );

  const response = await fetch(url, {
    headers: {
      "x-cg-pro-api-key": API_KEY,
      "Content-type": "application/json",
    } as Record<string, string>,
    next: { revalidate },
  });

  if (!response.ok) {
    const errorBody: CoinGeckoErrorBody = await response
      .json()
      .catch(() => ({}));

    // Log the full error for debugging
    console.error("CoinGecko API Error:", {
      endpoint,
      status: response.status,
      errorBody,
    });

    // Handle specific error codes
    if (errorBody?.status?.error_code === 10011) {
      throw new Error(
        "OHLC data requires a paid CoinGecko API plan. Demo API keys do not have access to this endpoint."
      );
    }

    throw new Error(
      errorBody?.status?.error_message ||
        errorBody?.error ||
        response.statusText ||
        "Something went wrong"
    );
  }

  return response.json();
}

export async function getPools(
  id: string,
  network?: string | null,
  contractAddress?: string | null
): Promise<PoolData> {
  const fallback: PoolData = {
    id: "",
    address: "",
    name: "",
    network: "",
  };

  if (network && contractAddress) {
    try {
      const poolData = await fetcher<{ data: PoolData[] }>(
        `/onchain/networks/${network}/tokens/${contractAddress}/pools`
      );

      return poolData.data?.[0] ?? fallback;
    } catch (error) {
      console.log(error);
      return fallback;
    }
  }

  try {
    const poolData = await fetcher<{ data: PoolData[] }>(
      "/onchain/search/pools",
      { query: id }
    );

    return poolData.data?.[0] ?? fallback;
  } catch {
    return fallback;
  }
}

export async function searchCoins(
  query: string,
  limit: number = 10
): Promise<SearchCoin[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  try {
    const searchResults = await fetcher<{
      coins: Array<{
        id: string;
        name: string;
        symbol: string;
        market_cap_rank: number | null;
        thumb: string;
        large: string;
      }>;
    }>("/search", { query }, 30);

    if (!searchResults.coins || searchResults.coins.length === 0) {
      return [];
    }
    const topCoins = searchResults.coins.slice(0, limit);
    const coinIds = topCoins.map((coin) => coin.id);

    if (coinIds.length === 0) {
      return [];
    }

    const marketData = await fetcher<CoinMarketData[]>(
      "/coins/markets",
      {
        ids: coinIds.join(","),
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: limit,
        page: 1,
        sparkline: false,
        price_change_percentage: "24h",
      },
      60
    );

    const marketDataMap = new Map<string, CoinMarketData>();
    marketData.forEach((coin) => {
      marketDataMap.set(coin.id, coin);
    });

    const enrichedCoins: SearchCoin[] = topCoins.map((searchCoin) => {
      const market = marketDataMap.get(searchCoin.id);

      return {
        id: searchCoin.id,
        name: searchCoin.name,
        symbol: searchCoin.symbol,
        market_cap_rank: searchCoin.market_cap_rank,
        thumb: searchCoin.thumb,
        large: searchCoin.large,
        data: {
          price: market?.current_price,
          price_change_percentage_24h: market?.price_change_percentage_24h ?? 0,
        },
      };
    });

    return enrichedCoins;
  } catch (error) {
    console.error("Error searching coins:", error);
    return [];
  }
}

export async function getTrendingCoins(): Promise<TrendingCoin[]> {
  try {
    const response = await fetcher<{
      coins: TrendingCoin[];
    }>("/search/trending", undefined, 300);

    return response.coins || [];
  } catch (error) {
    console.error("Error fetching trending coins:", error);
    return [];
  }
}
