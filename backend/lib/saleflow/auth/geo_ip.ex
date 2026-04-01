defmodule Saleflow.Auth.GeoIP do
  @moduledoc """
  GeoIP lookup module with ETS-based caching.

  Uses ip-api.com for geo-lookups (free tier, no API key required).
  Results are cached in an ETS table for 1 hour to reduce API calls.

  Loopback addresses (127.0.0.1, ::1, localhost) always return
  `%{city: nil, country: nil}` without hitting the API.
  """

  use GenServer
  require Logger

  @cache_ttl_ms 3_600_000
  @table :geo_ip_cache
  @local_addrs ["127.0.0.1", "::1", "localhost"]

  def start_link(_opts), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  @impl true
  def init(_) do
    :ets.new(@table, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{}}
  end

  @doc """
  Looks up geographic information for the given IP address.

  Returns `{:ok, %{city: city, country: country}}` where either value
  may be `nil` if the lookup fails or the address is private.
  """
  @spec lookup(String.t()) :: {:ok, %{city: String.t() | nil, country: String.t() | nil}}
  def lookup(ip_address) when ip_address in @local_addrs do
    {:ok, %{city: nil, country: nil}}
  end

  def lookup(ip_address) do
    case cache_get(ip_address) do
      {:ok, result} ->
        {:ok, result}

      :miss ->
        result = fetch_from_api(ip_address)
        cache_put(ip_address, result)
        {:ok, result}
    end
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp cache_get(ip) do
    case :ets.lookup(@table, ip) do
      [{^ip, result, inserted_at}] ->
        if System.monotonic_time(:millisecond) - inserted_at < @cache_ttl_ms do
          {:ok, result}
        else
          :ets.delete(@table, ip)
          :miss
        end

      [] ->
        :miss
    end
  end

  defp cache_put(ip, result) do
    :ets.insert(@table, {ip, result, System.monotonic_time(:millisecond)})
  end

  defp fetch_from_api(ip) do
    case Req.get("http://ip-api.com/json/#{ip}") do
      {:ok, %{status: 200, body: %{"status" => "success"} = body}} ->
        %{city: body["city"], country: body["country"]}

      other ->
        Logger.debug("GeoIP lookup failed for #{ip}: #{inspect(other)}")
        %{city: nil, country: nil}
    end
  end
end
