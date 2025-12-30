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
