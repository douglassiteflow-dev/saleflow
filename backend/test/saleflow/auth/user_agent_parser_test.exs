defmodule Saleflow.Auth.UserAgentParserTest do
  use ExUnit.Case, async: true

  alias Saleflow.Auth.UserAgentParser

  @chrome_desktop "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  @firefox_desktop "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0"
  @safari_desktop "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
  @iphone_mobile "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  @android_mobile "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
  @ipad_tablet "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  @edge_desktop "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"

  describe "parse/1 — device type detection" do
    test "detects desktop for Chrome on macOS" do
      result = UserAgentParser.parse(@chrome_desktop)
      assert result.device_type == "desktop"
    end

    test "detects desktop for Firefox on Windows" do
      result = UserAgentParser.parse(@firefox_desktop)
      assert result.device_type == "desktop"
    end

    test "detects desktop for Safari on macOS" do
      result = UserAgentParser.parse(@safari_desktop)
      assert result.device_type == "desktop"
    end

    test "detects mobile for iPhone" do
      result = UserAgentParser.parse(@iphone_mobile)
      assert result.device_type == "mobile"
    end

    test "detects mobile for Android Mobile Chrome" do
      result = UserAgentParser.parse(@android_mobile)
      assert result.device_type == "mobile"
    end

    test "detects tablet for iPad" do
      result = UserAgentParser.parse(@ipad_tablet)
      assert result.device_type == "tablet"
    end

    test "defaults to desktop for unknown UA" do
      result = UserAgentParser.parse("SomeRandomBot/1.0")
      assert result.device_type == "desktop"
    end

    test "returns unknown device_type for empty string" do
      result = UserAgentParser.parse("")
      assert result.device_type == "desktop"
    end
  end

  describe "parse/1 — browser detection" do
    test "detects Chrome with major version" do
      result = UserAgentParser.parse(@chrome_desktop)
      assert result.browser == "Chrome 120"
    end

    test "detects Firefox with major version" do
      result = UserAgentParser.parse(@firefox_desktop)
      assert result.browser == "Firefox 121"
    end

    test "detects Safari with major version" do
      result = UserAgentParser.parse(@safari_desktop)
      assert result.browser == "Safari 17"
    end

    test "detects Edge with major version (takes priority over Chrome)" do
      result = UserAgentParser.parse(@edge_desktop)
      assert result.browser == "Edge 120"
    end

    test "returns unknown for unrecognised browser" do
      result = UserAgentParser.parse("SomeRandomBot/1.0")
      assert result.browser == "unknown"
    end

    test "returns unknown for empty string" do
      result = UserAgentParser.parse("")
      assert result.browser == "unknown"
    end
  end

  describe "parse/1 — nil and non-binary input" do
    test "returns unknown fields for nil" do
      assert UserAgentParser.parse(nil) == %{device_type: "unknown", browser: "unknown"}
    end

    test "returns unknown fields for integer" do
      assert UserAgentParser.parse(42) == %{device_type: "unknown", browser: "unknown"}
    end

    test "returns a map with device_type and browser keys" do
      result = UserAgentParser.parse(@chrome_desktop)
      assert Map.has_key?(result, :device_type)
      assert Map.has_key?(result, :browser)
    end
  end
end
