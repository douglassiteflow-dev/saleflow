defmodule Saleflow.Auth.GeoIPTest do
  # async: false because GeoIP uses a named ETS table + named GenServer
  use ExUnit.Case, async: false

  alias Saleflow.Auth.GeoIP

  # The GeoIP GenServer is already started via the application supervisor
  # (Saleflow.Application). We just need to clear the ETS cache between tests.

  setup do
    # Clear ETS cache between tests to avoid cross-test contamination
    try do
      :ets.delete_all_objects(:geo_ip_cache)
    rescue
      ArgumentError -> :ok
    end

    :ok
  end

  describe "lookup/1 — loopback addresses" do
    test "localhost returns nil city and country" do
      assert {:ok, %{city: nil, country: nil}} = GeoIP.lookup("localhost")
    end

    test "127.0.0.1 returns nil city and country" do
      assert {:ok, %{city: nil, country: nil}} = GeoIP.lookup("127.0.0.1")
    end

    test "IPv6 loopback (::1) returns nil city and country" do
      assert {:ok, %{city: nil, country: nil}} = GeoIP.lookup("::1")
    end

    test "loopback addresses never touch the ETS cache" do
      GeoIP.lookup("127.0.0.1")
      assert :ets.lookup(:geo_ip_cache, "127.0.0.1") == []
    end
  end

  describe "lookup/1 — ETS caching" do
    test "cache hit returns cached value without re-fetching" do
      # Pre-seed the cache manually
      cached_result = %{city: "Stockholm", country: "Sweden"}
      now_ms = System.monotonic_time(:millisecond)
      :ets.insert(:geo_ip_cache, {"1.2.3.4", cached_result, now_ms})

      assert {:ok, result} = GeoIP.lookup("1.2.3.4")
      assert result == cached_result
    end

    test "cache miss causes a fetch and stores result in ETS" do
      # Ensure cache is empty for this IP
      :ets.delete(:geo_ip_cache, "256.256.256.256")

      # This will call the real API or return nils on failure — we don't care
      # which, we just verify a result is stored in ETS afterward
      {:ok, _result} = GeoIP.lookup("256.256.256.256")

      # Should now be cached (even if the result is nils due to invalid IP)
      assert :ets.lookup(:geo_ip_cache, "256.256.256.256") != []
    end

    test "expired cache entry is evicted and re-fetched" do
      # Insert an entry with a timestamp far in the past (> 1 hour ago)
      stale_result = %{city: "Old City", country: "Old Country"}
      one_hour_and_one_ms = 3_600_001
      stale_ts = System.monotonic_time(:millisecond) - one_hour_and_one_ms
      :ets.insert(:geo_ip_cache, {"9.9.9.9", stale_result, stale_ts})

      # Lookup should evict the stale entry and fetch fresh data
      {:ok, result} = GeoIP.lookup("9.9.9.9")

      # Result should NOT be the stale cached value (either new real data or nils)
      # We can only verify it's not nil-nil from the stale insert since the API
      # may return nils too — but we can verify the cache was updated
      [{_ip, _new_result, new_ts}] = :ets.lookup(:geo_ip_cache, "9.9.9.9")
      assert new_ts > stale_ts
      # Whatever the result is, it must be a valid geo map
      assert Map.has_key?(result, :city)
      assert Map.has_key?(result, :country)
    end

    test "fresh cache entry is not evicted" do
      fresh_result = %{city: "Berlin", country: "Germany"}
      now_ms = System.monotonic_time(:millisecond)
      :ets.insert(:geo_ip_cache, {"8.8.8.8", fresh_result, now_ms})

      # Lookup twice — second should still return cached
      {:ok, r1} = GeoIP.lookup("8.8.8.8")
      {:ok, r2} = GeoIP.lookup("8.8.8.8")

      assert r1 == fresh_result
      assert r2 == fresh_result
    end
  end

  describe "lookup/1 — result shape" do
    test "always returns a map with city and country keys" do
      {:ok, result} = GeoIP.lookup("127.0.0.1")
      assert Map.has_key?(result, :city)
      assert Map.has_key?(result, :country)
    end
  end
end
